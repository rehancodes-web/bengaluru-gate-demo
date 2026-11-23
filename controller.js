// Bengaluru sluice gate model. Every number here is an illustrative default until
// surveyed site data is imported (stage-area curves, discharge coefficient, rainfall).
// Water state is held as volumes, so the water balance stays exact.

const $ = id => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const G = 9.81, GATE_WIDTH = 2.0, MAX_LIFT = 0.5, CREST = 2.2, SETPOINT = 1.55, START = 1.60, DS_LIMIT = 1.80;

// ---------- Stage-storage curves (stage m above sill datum, surface area m²) ----------
const DEFAULT_CURVES = {
  lake: [[0, 380], [1.55, 500], [2.2, 560]],      // lake widens as it fills
  drain: [[0, 300], [0.6, 340], [1.8, 420], [2.2, 440]]
};
let curves = JSON.parse(JSON.stringify(DEFAULT_CURVES));
let dataSource = { lake: 'illustrative', drain: 'illustrative', rain: 'illustrative' };
function areaAt(c, h) {
  if (h <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) if (h <= c[i][0]) { const [h0, a0] = c[i - 1], [h1, a1] = c[i]; return a0 + (a1 - a0) * (h - h0) / (h1 - h0); }
  return c[c.length - 1][1];
}
function volAt(c, h) { // exact integral of the piecewise-linear area curve from 0 to h
  if (h <= 0) return 0;
  const pts = [...c.filter(p => p[0] > 0 && p[0] < h).map(p => p[0]), h];
  let v = 0, prev = 0;
  for (const x of pts) { v += (x - prev) * (areaAt(c, prev) + areaAt(c, x)) / 2; prev = x; }
  return v;
}
function levelAt(c, V) {
  if (V <= 0) return 0;
  let lo = 0, hi = 1;
  while (volAt(c, hi) < V) hi *= 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (volAt(c, m) < V) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function parseTable(text, cols) { // "a,b" rows, header optional; returns sorted numeric rows or throws
  const rows = String(text).trim().split(/\r?\n/).map(l => l.split(/[,;\t]/).map(s => s.trim())).filter(r => r.length >= cols && r.slice(0, cols).every(s => s !== '' && Number.isFinite(+s))).map(r => r.slice(0, cols).map(Number));
  if (rows.length < 2) throw new Error('Need at least two numeric rows.');
  rows.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < rows.length; i++) if (rows[i][0] === rows[i - 1][0]) throw new Error('Repeated value ' + rows[i][0] + ' in the first column.');
  return rows;
}
function importCurve(which, text) {
  const rows = parseTable(text, 2);
  if (rows.some(r => r[0] < 0 || r[1] <= 0)) throw new Error('Stages must be ≥ 0 and areas > 0.');
  if (rows[0][0] > 0) rows.unshift([0, rows[0][1]]);
  curves[which] = rows; dataSource[which] = 'imported';
  return rows.length;
}
function resetCurves() { curves = JSON.parse(JSON.stringify(DEFAULT_CURVES)); dataSource.lake = dataSource.drain = 'illustrative'; }

// ---------- Rainfall / inflow series ----------
let importedRain = null;
function importRain(text) {
  const rows = parseTable(text, 2);
  if (rows.some(r => r[0] < 0 || r[1] < 0)) throw new Error('Times and flows must be ≥ 0.');
  importedRain = rows; dataSource.rain = 'imported';
  return rows.length;
}
function inflowAt(time) {
  const base = +$('inflow').value || 0, mode = $('rain') && $('rain').value;
  if (mode === 'Design storm') return base + 3 * Math.max(0, 1 - Math.abs(time - 600) / 600);
  if (mode === 'Cloudburst burst') return base + 5 * clamp((time - 120) / 30) * clamp((420 - time) / 30);
  if (mode === 'Imported series' && importedRain) {
    const r = importedRain; if (time <= r[0][0]) return r[0][1]; if (time >= r[r.length - 1][0]) return r[r.length - 1][1];
    for (let i = 1; i < r.length; i++) if (time <= r[i][0]) return r[i - 1][1] + (r[i][1] - r[i - 1][1]) * (time - r[i - 1][0]) / (r[i][0] - r[i - 1][0]);
  }
  return base;
}

// ---------- Gate hydraulics: free and submerged orifice flow with a smooth transition ----------
function dischargeCoefficient() { const v = +($('cd') && $('cd').value); return v > 0.3 && v < 1 ? v : 0.62; }
function gateFlow(h1, h2, lift) { // signed m³/s, positive from lake (h1) to drain (h2)
  if (lift <= 0 || h1 === h2) return 0;
  const dir = Math.sign(h1 - h2), up = Math.max(h1, h2), dn = Math.min(h1, h2), cd = dischargeCoefficient();
  const free = cd * GATE_WIDTH * lift * Math.sqrt(2 * G * Math.max(0, up - lift / 2));
  const sub = cd * GATE_WIDTH * lift * Math.sqrt(2 * G * (up - dn));
  const s = clamp((dn - lift) / (0.25 * lift + 0.05)); // 0 = tailwater below the gate lip (free), 1 = fully submerged
  return dir * Math.min(free, (1 - s) * free + s * sub);
}

// ---------- Street surface storage (area grows with depth, no depth cap) ----------
const streets = {
  'Flooded arterial road': [900, .14, 1.8, .65, 1.75, 0],
  'Underpass pump outage': [400, .32, 1.5, .06, 1.2, 0],
  'Blocked roadside grates': [650, .08, 1.2, .08, 1.8, 0],
  'Drain surcharge into street': [720, .06, .3, .85, 1.35, 0],
  'Disconnected low-lying layout': [1200, .10, 1.2, 0, 1.8, 0],
  'Underpass pump restored': [400, .32, 1.5, .06, 1.2, 2.2],
  'Metro work-zone constriction': [550, .12, 1.45, .32, 1.60, 0],
  'Reopened roadside grates': [650, .08, 1.2, 1.8, 1.8, 0]
}; // [base area m², initial depth m, runoff m³/s, inlet capacity m³/s, receiving level m, pumped transfer m³/s]
const SPREAD = 0.3; // ponded area doubles every 0.3 m of depth
const roadVol = (A0, h) => A0 * (h + h * h / (2 * SPREAD));
const roadDepth = (A0, V) => V <= 0 ? 0 : SPREAD * (-1 + Math.sqrt(1 + 2 * V / (SPREAD * A0)));
let roadVolume = 0;
function streetFlow() {
  const r = streets[$('scenario').value];
  if (!r) return { runoff: 0, exchange: 0, depth: 0 };
  const depth = roadDepth(r[0], roadVolume), head = r[4] + depth - d;
  const gravity = Math.sign(head) * r[3] * Math.min(1, Math.abs(head) / .25);
  return { depth, runoff: r[2], exchange: Math.max(-Math.max(0, (d - .6) * 400), Math.min(roadVolume + r[2], gravity + r[5])) };
}

// ---------- Scenarios ----------
const cases = { 'Lake rising': [1.85, 1.10, .50, .10], 'Ordinary rain': [1.35, 1, .15, .10], 'Cloudburst': [2.05, 1.25, 4.5, .5], 'High downstream / backflow': [1.65, 1.95, 1, 2], 'Blocked outlet': [1.9, 1.58, 1.5, 1.1], 'Both sides near overflow': [2.18, 2.17, 4.5, 3] };
for (const name of Object.keys(streets)) cases[name] = [1.85, name === 'Drain surcharge into street' ? 1.92 : 1.1, .5, .1];
for (const name of Object.keys(cases)) $('scenario').add(new Option(name));

// ---------- State ----------
let Vu, Vd, u, d, t, pos, active, us, ds, timer, integ, lastTarget, drift, estVu, sensorFault, tripped, jamLog, jamAlarm;
const fault = () => $('fault').value;
const piMode = () => ($('mode') && $('mode').value || '').startsWith('PI');
function measured() { return { mu: u + (fault() === 'Lake sensor drift' ? drift : 0), md: d }; }
function actuatorRate() { const load = Math.abs(u - d); return 2 * (1 - 0.4 * clamp((load - 1) / 0.5)); } // % per second, slows under high head

// Controller decision. Pure: reads state, changes nothing (tick() commits).
function calc() {
  const I = inflowAt(t), street = streetFlow(), L = +$('lateral').value + street.exchange, F = fault();
  const { mu, md } = measured();
  const drain = 1.2 * Math.max(d - .6, 0) * ($('scenario').value === 'Blocked outlet' ? .15 : 1);
  const full = Math.abs(gateFlow(Math.max(mu, md), Math.min(mu, md), MAX_LIFT)) || 1e-5;
  const isActive = active ? mu > SETPOINT : mu >= START;
  const err = mu - SETPOINT;
  const room = Math.max(0, drain - L + (volAt(curves.drain, DS_LIMIT) - volAt(curves.drain, md)) / 120);
  let need, msg = 'Below flood detection level', target = 0, hold = false, tripNow = false;
  if (piMode()) need = Math.max(0, I + 2.0 * err + 0.01 * integ);
  else need = Math.max(0, I + (volAt(curves.lake, mu) - volAt(curves.lake, SETPOINT)) / 300);
  if (isActive) {
    target = Math.min(100, 100 * Math.min(need, room) / full);
    msg = room < need ? 'Release limited by downstream allowance' : piMode() ? 'PI controller tracking the 1.55 m lake setpoint' : 'Release calculated from inflow and lake storage';
  }
  if (md >= DS_LIMIT || mu - md <= .05) { target = 0; msg = 'Closure requested: high receiving stage or insufficient forward head'; }
  if (piMode()) { const base = lastTarget ?? pos; target = clamp(target, base - 4, base + 4); } // smooth commands, 4 %/s
  if (Math.min(u, d) < .5 || F === 'Invalid stage sensor' || F === 'Local stop') { hold = true; msg = 'Automatic movement suspended. Local operator review required.'; }
  if (sensorFault) { hold = true; msg = 'Lake sensor disagrees with the water balance by more than 8 cm. Automatic movement suspended; check the transmitter against the staff gauge.'; }
  if (F === 'Gate jam') { hold = true; msg = 'Actuator jam simulated: actual travel held. Dispatch operator.'; }
  if (!hold && !tripped && Math.abs(u - d) > 1.5 && target > pos) tripNow = true;
  if (tripped || tripNow) { hold = true; msg = 'Torque trip: differential head too high for the actuator to open. Reset after inspection.'; }
  if (jamAlarm && !hold) msg += ' · Partial jam detected: travel slower than commanded. Dispatch operator.';
  if (F === 'Loss of telemetry') msg += ' · link offline, local logic active';
  if (u >= 2.1 && d >= 1.8) msg += ' · HIGH WATER ON BOTH SIDES';
  const lift = pos / 100 * MAX_LIFT;
  const q = Math.min(u, d) < .5 ? 0 : gateFlow(u, d, lift);
  const qEst = Math.min(mu, md) < .5 ? 0 : gateFlow(mu, md, lift);
  return { target, hold, msg, drain, I, L, q, qEst, isActive, err, tripNow, mu, md };
}

function tick() {
  let a = calc();
  active = a.isActive; lastTarget = a.target;
  if (piMode() && active && a.target > 0 && a.target < 100) integ = clamp(integ + a.err, -200, 200);
  if (a.tripNow) tripped = true;
  const rate = actuatorRate(), wanted = a.hold ? 0 : clamp(a.target - pos, -rate, rate);
  const actual = fault() === 'Partial jam' ? wanted * .25 : wanted;
  jamLog.push([Math.abs(wanted), Math.abs(actual)]); if (jamLog.length > 10) jamLog.shift();
  const cmd = jamLog.reduce((s, x) => s + x[0], 0), got = jamLog.reduce((s, x) => s + x[1], 0);
  if (cmd > 4 && got / cmd < .5) jamAlarm = true;
  pos = clamp(pos + actual, 0, 100);
  a = calc();
  const surface = streetFlow();
  roadVolume += surface.runoff - surface.exchange;
  Vu += a.I - a.q; Vd += a.q + a.L - a.drain;
  estVu += a.I - a.qEst;
  const cu = volAt(curves.lake, CREST), cdv = volAt(curves.drain, CREST);
  if (Vu > cu) { us += Vu - cu; Vu = cu; }
  if (Vd > cdv) { ds += Vd - cdv; Vd = cdv; }
  if (estVu > cu) estVu = cu;
  Vu = Math.max(0, Vu); Vd = Math.max(0, Vd); estVu = Math.max(0, estVu);
  u = levelAt(curves.lake, Vu); d = levelAt(curves.drain, Vd);
  if (fault() === 'Lake sensor drift') drift += .003;
  if (Math.abs(measured().mu - levelAt(curves.lake, estVu)) > .08) sensorFault = true;
  t++; recordSample(); draw();
}

function draw() {
  const a = calc();
  for (const [id, v] of [['uw', u], ['dw', d]]) { const h = Math.max(0, v * 75); $(id).setAttribute('y', 248 - h); $(id).setAttribute('height', h); }
  const y = 81 - pos * .375; $('plate').setAttribute('y', y); $('stem').setAttribute('d', 'M449 41V' + y);
  $('ut').textContent = 'Lake ' + u.toFixed(3) + ' m'; $('dt').textContent = 'Drain ' + d.toFixed(3) + ' m';
  $('ival').value = a.I.toFixed(2) + ' m³/s'; $('lval').value = (+$('lateral').value).toFixed(2) + ' m³/s';
  $('read').textContent = 'Target ' + (a.hold ? 'suspended' : a.target.toFixed(0) + '%') + '   ·   Actual ' + pos.toFixed(0) + '%   ·   Lift ' + (pos / 100 * MAX_LIFT).toFixed(3) + ' m';
  $('reason').textContent = a.msg;
  $('vol').textContent = 'Time ' + t + ' s   ·   Signed gate flow ' + a.q.toFixed(2) + ' m³/s   ·   Lake spill ' + us.toFixed(1) + ' m³   ·   Downstream spill ' + ds.toFixed(1) + ' m³';
  const src = $('dataSource'); if (src) src.textContent = 'Lake curve: ' + dataSource.lake + ' · Drain curve: ' + dataSource.drain + ' · Rainfall: ' + (($('rain') && $('rain').value === 'Imported series') ? dataSource.rain : 'scenario') + ' · Cd ' + dischargeCoefficient().toFixed(2);
}

function stop() { clearInterval(timer); timer = null; $('run').textContent = 'Run'; }
function reset() {
  stop();
  const c = cases[$('scenario').value];
  [u, d] = c; Vu = volAt(curves.lake, u); Vd = volAt(curves.drain, d); estVu = Vu;
  $('inflow').value = c[2]; $('lateral').value = c[3];
  const r = streets[$('scenario').value]; roadVolume = r ? roadVol(r[0], r[1]) : 0;
  pos = t = us = ds = integ = drift = 0; active = false; lastTarget = null; sensorFault = tripped = jamAlarm = false; jamLog = [];
  $('fault').selectedIndex = 0; samples = []; recordSample(); draw();
}
$('scenario').onchange = reset; $('reset').onclick = reset;
$('step').onclick = () => { stop(); tick(); };
$('run').onclick = () => { if (timer) stop(); else { timer = setInterval(tick, 100); $('run').textContent = 'Pause'; } };
for (const id of ['inflow', 'lateral', 'fault', 'mode', 'rain', 'cd']) if ($(id)) $(id).oninput = draw;

let samples = [];
const columns = ['scenario', 'condition', 'controller', 'rain', 'time_s', 'lake_m', 'lake_measured_m', 'drain_m', 'inflow_m3_s', 'lateral_m3_s', 'target_pct', 'actual_pct', 'signed_flow_m3_s', 'lake_spill_m3', 'drain_spill_m3', 'decision', 'road_depth_m', 'road_volume_m3', 'road_to_drain_m3_s', 'data_source'];
function recordSample() {
  const a = calc(), s = streetFlow();
  samples.push([$('scenario').value, fault(), piMode() ? 'PI' : 'Rule-based', ($('rain') && $('rain').value) || 'Steady', t, u, a.mu, d, a.I, a.L, a.hold ? '' : a.target, pos, a.q, us, ds, a.msg, s.depth, roadVolume, s.exchange, dataSource.lake + '/' + dataSource.drain]);
}
function exportLog() {
  const quote = v => '"' + String(v).replaceAll('"', '""') + '"';
  const csv = [columns, ...samples].map(row => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'gate-run.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('download').onclick = exportLog;

reset();

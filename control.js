// Bengaluru lake gate control board (training simulator).
// Map data: MOD Foundation via the "Bengaluru Water Map" (bengaluru-water-data.js).
// Gate physics and control: gate-types.js. The gate inventory below is an illustrative planning layout,
// not BBMP's actual asset register.
(function () {
  'use strict';
  const D = window.BLR_WATER, GT = window.GateTypes, $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg';
  const VALLEY = { 'Koramangala Challaghatta': 'KC', 'Hebbal Nagawara': 'HN', Vrishabhavati: 'VR', Arkavathi: 'AR', Suvarnamukhi: 'SM' };
  const TYPE = {
    vertical: { code: 'VL', label: 'Vertical lift gate', where: 'Outlet of lakes 10–200 acres', color: 'var(--t-vertical)', hex: '#5b9cff' },
    radial: { code: 'RG', label: 'Radial gate', where: 'Outlet of lakes over 200 acres', color: 'var(--t-radial)', hex: '#c084fc' },
    crest: { code: 'CG', label: 'Crest gate (waste weir)', where: 'Weir of lakes over 100 acres', color: 'var(--t-crest)', hex: '#2dd4bf' },
    flap: { code: 'FG', label: 'Flap gate + penstock + pump', where: 'Storm-drain outfall at a lost tank', color: 'var(--t-flap)', hex: '#f0a35e' },
    float: { code: 'FT', label: 'Float gate (no power)', where: 'Outlet of tanks under 10 acres', color: 'var(--t-float)', hex: '#a7b0b8' }
  };
  const SHAPE = { vertical: 'M-5-5h10v10h-10z', radial: 'M0-7L7 0L0 7L-7 0z', crest: 'M0-7L7 6H-7z', flap: 'M5 0A5 5 0 1 1-5 0A5 5 0 1 1 5 0z', float: 'M-3-6H3L6 0L3 6H-3L-6 0z' };
  const fmtT = s => { s = Math.floor(s); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':'); };
  const ist = () => new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------- gate inventory (illustrative planning layout) ----------------
  const gates = [], byId = {}, SKIP = ['kalyani', 'gokatte', 'quarry', 'brick kiln'];
  let seq = {};
  function addGate(type, place, lost, dx) {
    const vc = VALLEY[place.v] || 'XX'; seq[vc] = (seq[vc] || 0) + 1;
    const id = `${vc}-${String(seq[vc]).padStart(3, '0')}-${TYPE[type].code}`;
    const g = { id, type, place, lost, valley: place.v, x: place.b[0] + place.b[2] / 2 + (dx || 0), y: place.b[1] + place.b[3] / 2, alarms: {}, cmd: null };
    gates.push(g); byId[id] = g; (place.gates = place.gates || []).push(g);
  }
  D.lakes.filter(l => !SKIP.includes(l.c)).sort((a, b) => b.a - a.a).forEach(l => {
    if (l.a >= 200) { addGate('radial', l, false, -12); addGate('crest', l, false, 12); }
    else if (l.a >= 100) { addGate('vertical', l, false, -12); addGate('crest', l, false, 12); }
    else if (l.a >= 10) addGate('vertical', l);
    else addGate('float', l);
  });
  D.lost.filter(l => l.a >= 25).forEach(l => addGate('flap', l, true));

  let scenario = Object.keys(GT.SCENARIOS)[0];
  function buildModels() {
    gates.forEach(g => { g.m = GT.create(g.type, scenario, 'Healthy'); g.alarms = {}; g.cmd = null; });
    // a few faults present at start, so operators can practise troubleshooting
    const preset = [['Hebbala Kere', 'vertical', 'Power cut'], ['Madivala Kere', 'vertical', 'Level sensor failure'], ['Jakkur Kere', 'vertical', 'Seal leakage'], ['Varthur Kere', 'crest', 'Hydraulic leak']];
    preset.forEach(([name, type, cond]) => { const l = D.lakes.find(x => x.n === name); const g = l && (l.gates || []).find(x => x.type === type); if (g) GT.setFault(g.m, cond, 0); });
    const fl = gates.find(g => g.type === 'flap'); if (fl) GT.setFault(fl.m, 'Debris', 0);
    const ft = gates.find(g => g.type === 'float' && g.valley === 'Arkavathi'); if (ft) GT.setFault(ft.m, 'Gate jam', 0);
  }

  // ---------------- alarms, events ----------------
  const alarms = new Map(), events = [];
  const PR = { 1: 'P1', 2: 'P2', 3: 'P3' };
  function logEvent(g, action, detail) { events.unshift({ sim: simT(), ist: ist(), op: $('operator').value.trim() || '—', gate: g ? g.id : '—', lake: g ? g.place.n : '—', action, detail: detail || '' }); if (events.length > 2000) events.pop(); if (curTab === 'E') table(); }
  const faultActive = (m, c) => m.condition === c && m.t >= (m.faultAt === undefined ? GT.FAULT_AT : m.faultAt);
  function hasPower(m) { if (!m.T.powered) return true; if (faultActive(m, 'Power cut')) return false; const fa = m.faultAt === undefined ? GT.FAULT_AT : m.faultAt; return !(m.condition === 'Power cut, backup starts' && m.t >= fa && m.t < fa + 90); }
  function activeAlarms(g) {
    const m = g.m, L = m.last, T = m.T, out = {};
    const A = (code, p, msg) => { out[code] = { p, msg }; };
    if (!hasPower(m)) A('PWR', 1, 'Power failure: drive and pumps stopped');
    if (L.sensorOk === false) A('SENS', 2, 'Upstream level sensor frozen: automatic control on hold');
    if (m.voted) A('VOTE', 3, 'Main level sensor failed: running on the backup sensor');
    if (faultActive(m, 'Gate jam')) A('JAM', 1, 'Gate jammed: no travel');
    if (faultActive(m, 'Debris')) A('DEB', 2, g.type === 'flap' ? 'Debris holding the flap open: backflow possible' : 'Debris at the gate: flow capacity reduced');
    if (faultActive(m, 'Seal leakage')) A('LEAK', 3, 'Leakage past the closed gate: seals worn');
    if (faultActive(m, 'Brake creep') && m.creep > 2) A('CREEP', 2, 'Brake creep: uncommanded drift');
    if (faultActive(m, 'Hydraulic leak')) A('HYD', 1, 'Hydraulic leak: crest leaf sinking');
    if (L.h1 >= T.up.top - 0.01) A('SPILL', 1, T.up.label + ' overtopping its bank');
    else if (L.h1 >= T.up.top - 0.3) A('HH', 2, T.up.label + ' high-high level');
    if (T.dsLimit && L.h2 >= T.dsLimit) A('DSH', 2, 'Downstream drain at its limit');
    if (m.interlock) A('ILK', 3, 'Command blocked by interlock');
    if (g.cmd && g.cmd.failed) A('CMD', 2, 'Command not executed within 30 s');
    return out;
  }
  function evalAlarms(g) {
    const act = activeAlarms(g), now = simT();
    for (const [code, a] of Object.entries(act)) {
      const key = g.id + ':' + code; let r = alarms.get(key);
      if (!r || r.cleared !== null) { r = { key, g, code, p: a.p, msg: a.msg, raised: now, raisedIst: ist(), cleared: null, acked: false }; alarms.set(key, r); logEvent(g, 'Alarm ' + PR[a.p], a.msg); }
    }
    for (const r of alarms.values()) if (r.g === g && r.cleared === null && !act[r.code]) { r.cleared = now; logEvent(g, 'Alarm cleared', r.msg); if (r.acked) alarms.delete(r.key); }
  }
  function gateAlarmState(g) { let p = 0, unack = false; for (const r of alarms.values()) if (r.g === g && (r.cleared === null || !r.acked)) { if (r.cleared === null && (!p || r.p < p)) p = r.p; if (!r.acked) unack = true; } return { p, unack }; }
  function ack(r) { if (r.acked) return; r.acked = true; logEvent(r.g, 'Alarm acknowledged', r.msg); if (r.cleared !== null) alarms.delete(r.key); }

  // ---------------- simulation clock ----------------
  let paused = false, acc = 0, repairs = [];
  const simT = () => gates.length ? gates[0].m.t : 0;
  function tick() {
    if (!paused) {
      acc += +$('speed').value / 10;
      while (acc >= 1) {
        acc -= 1;
        for (const g of gates) {
          GT.step(g.m);
          if (g.cmd && !g.cmd.done) { // command supervision: expect movement toward the target within 30 s
            const now = GT.opening(g.m), moved = Math.abs(now - g.cmd.start) > 0.5, there = Math.abs(now - g.cmd.target) < 1;
            if (there) { g.cmd.done = true; g.cmd.failed = false; logEvent(g, 'Command completed', 'Reached ' + Math.round(now) + '%'); }
            else if (!moved && g.m.t - g.cmd.at > 30 && !g.cmd.failed && !g.m.interlock) { g.cmd.failed = true; }
            else if (moved) g.cmd.failed = false;
          }
        }
        const t = simT();
        repairs = repairs.filter(r => { if (t >= r.at) { r.fn(); logEvent(r.g, 'Field report', r.msg); return false; } return true; });
      }
    }
    if (++uiCount % 5 === 0 || paused) { gates.forEach(evalAlarms); refreshUI(); }
  }
  let uiCount = 0;

  // ---------------- map ----------------
  const svg = $('map'), vp = $('vp'), lblG = $('lblG'), gateG = $('gateG');
  $('land').setAttribute('d', D.boundary); $('edge').setAttribute('d', D.boundary); $('streams').setAttribute('d', D.streams);
  const mk = (cls, r, parent) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', r.d); p.setAttribute('class', cls); parent.appendChild(p); return p; };
  D.lakes.forEach(l => {
    l.el = mk('lake', l, $('lakeG')); l.el.addEventListener('click', e => { e.stopPropagation(); selectLake(l); });
    const t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'lbl'); t.textContent = l.n.replace(/ ?(Kere|Kunte|Katte)$/i, ''); t.setAttribute('x', l.b[0] + l.b[2] / 2); t.setAttribute('y', l.b[1] + l.b[3] / 2 - 14); lblG.appendChild(t); l.t = t;
    const tt = document.createElementNS(NS, 'title'); tt.textContent = `${l.n} · ${l.a.toFixed(0)} acres · ${l.v}`; l.el.appendChild(tt);
  });
  D.lost.forEach(l => mk('lost', l, $('lostG')));
  { // 1 km reference grid (one map unit is about 11.13 m)
    const KM = 1000 / 11.132; let d = ''; for (let x = 0; x <= D.W; x += KM) d += 'M' + x.toFixed(1) + ' 0V' + D.H; for (let y = 0; y <= D.H; y += KM) d += 'M0 ' + y.toFixed(1) + 'H' + D.W;
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', 'grid'); $('gridG').appendChild(p);
  }
  // valley names at the area-weighted centre of each valley's lakes
  const vlbls = Object.keys(VALLEY).map(v => { const ls = D.lakes.filter(l => l.v === v), A = ls.reduce((s, l) => s + l.a, 0); const cx = ls.reduce((s, l) => s + (l.b[0] + l.b[2] / 2) * l.a, 0) / A, cy = ls.reduce((s, l) => s + (l.b[1] + l.b[3] / 2) * l.a, 0) / A; const t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'vlbl'); t.setAttribute('x', cx); t.setAttribute('y', cy + 160); t.textContent = v + ' valley'; $('vlblG').appendChild(t); return t; });
  gates.forEach(g => {
    const el = document.createElementNS(NS, 'g'); el.setAttribute('class', 'gate'); el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${g.id} ${TYPE[g.type].label} at ${g.place.n}`);
    el.innerHTML = `<circle class="sel" r="12"/><circle class="ring" r="9.5"/><path d="${SHAPE[g.type]}" fill="${TYPE[g.type].hex}" stroke="#0b0e10" stroke-width="1.4"/><text class="badge" x="7" y="-6" font-size="10" font-weight="700" fill="#4aa3ff" stroke="#0b0e10" stroke-width="2.5" paint-order="stroke"></text><title>${g.id} · ${TYPE[g.type].label} · ${esc(g.place.n)}</title>`;
    el.addEventListener('click', e => { e.stopPropagation(); select(g); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(g); } });
    gateG.appendChild(el); g.el = el; g.badge = el.querySelector('.badge');
  });
  const hov = $('hover');
  function showHover(e, html) { const r = $('mapWrap').getBoundingClientRect(); hov.innerHTML = html; hov.style.display = 'block'; const x = e.clientX - r.left + 14, y = e.clientY - r.top + 14; hov.style.left = Math.min(x, r.width - 270) + 'px'; hov.style.top = Math.min(y, r.height - 90) + 'px'; }
  D.lakes.forEach(l => { l.el.addEventListener('mousemove', e => showHover(e, '<b>' + esc(l.n) + '</b>' + l.a.toFixed(0) + ' acres · ' + esc(l.v) + '<br>' + ((l.gates || []).length ? l.gates.map(g => g.id).join(', ') : 'no gate planned'))); l.el.addEventListener('mouseleave', () => hov.style.display = 'none'); l.el.querySelector('title') && l.el.querySelector('title').remove(); });
  gates.forEach(g => { g.el.addEventListener('mousemove', e => { const st = gateAlarmState(g), o = openingText(g.m); showHover(e, '<b>' + g.id + '</b>' + TYPE[g.type].label + '<br>' + esc(g.place.n) + '<br>Opening ' + o.act + ' · ' + (g.m.mode || 'auto').toUpperCase() + (st.p ? '<br><span style="color:var(--p' + st.p + ')">ALARM ' + PR[st.p] + '</span>' : '')); }); g.el.addEventListener('mouseleave', () => hov.style.display = 'none'); g.el.querySelector('title') && g.el.querySelector('title').remove(); });
  let k = 1, tx = 0, ty = 0, vw = 0, vh = 0, base = 1;
  function fit() { vw = svg.clientWidth; vh = svg.clientHeight; const m = vw < 700 ? [10, 10, 10, 10] : [vw > 1100 ? 260 : 20, 16, 16, 16]; const aw = vw - m[0] - m[2], ah = vh - m[1] - m[3]; base = Math.min(aw / D.W, ah / D.H); k = 1; tx = m[0] + (aw - D.W * base) / 2; ty = m[1] + (ah - D.H * base) / 2; apply(); }
  let raf = 0; function apply() { vp.setAttribute('transform', `translate(${tx} ${ty}) scale(${k * base})`); cancelAnimationFrame(raf); raf = requestAnimationFrame(upd); }
  function upd() {
    const s = k * base, on = $('tLbl').checked; lblG.style.display = on ? '' : 'none';
    if (on) D.lakes.forEach(l => { const v = l.a * k * k >= 200; l.t.style.display = v ? '' : 'none'; if (v) { l.t.style.fontSize = (11.5 / s) + 'px'; l.t.style.strokeWidth = (3.5 / s) + 'px'; } });
    const sz = Math.min(1.35, 0.62 + k * 0.1) / s;
    vlbls.forEach(t => { t.style.fontSize = Math.max(44, 15 / s) + 'px'; t.style.display = $('tValley').checked && k < 4 ? '' : 'none'; });
    const mPerPx = 11.132 / s, nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000]; let Lm = nice[0]; for (const n of nice) if (n / mPerPx <= 110) Lm = n;
    $('sbar').style.width = (Lm / mPerPx).toFixed(0) + 'px'; $('stxt').textContent = Lm >= 1000 ? Lm / 1000 + ' km' : Lm + ' m';
    gates.forEach(g => g.el.setAttribute('transform', `translate(${g.x} ${g.y}) scale(${sz})`));
  }
  function zoomAt(px, py, f) { const nk = Math.min(60, Math.max(1, k * f)); f = nk / k; tx = px - (px - tx) * f; ty = py - (py - ty) * f; k = nk; apply(); }
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  const ptr = new Map();
  svg.addEventListener('pointerdown', e => { if (e.target.closest('.gate')) return; ptr.set(e.pointerId, [e.clientX, e.clientY]); svg.setPointerCapture(e.pointerId); svg.classList.add('drag'); });
  svg.addEventListener('pointermove', e => { if (!ptr.has(e.pointerId)) return; const p = ptr.get(e.pointerId); if (ptr.size === 2) { const o = [...ptr.entries()].find(([id]) => id !== e.pointerId)[1], r = svg.getBoundingClientRect(); const d0 = Math.hypot(p[0] - o[0], p[1] - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]); if (d0) zoomAt((e.clientX + o[0]) / 2 - r.left, (e.clientY + o[1]) / 2 - r.top, d1 / d0); } else { tx += e.clientX - p[0]; ty += e.clientY - p[1]; apply(); } ptr.set(e.pointerId, [e.clientX, e.clientY]); });
  ['pointerup', 'pointercancel'].forEach(n => svg.addEventListener(n, e => { ptr.delete(e.pointerId); if (!ptr.size) svg.classList.remove('drag'); }));
  $('zi').onclick = () => zoomAt(vw / 2, vh / 2, 1.6); $('zo').onclick = () => zoomAt(vw / 2, vh / 2, 1 / 1.6); $('zr').onclick = fit;
  function focusOn(x, y, w, h) { const s = Math.min(vw * 0.35 / Math.max(w, 30), vh * 0.35 / Math.max(h, 30), 40); k = Math.max(1, s / base); tx = (vw + (vw < 700 ? 0 : 260)) / 2 - x * k * base; ty = vh / 2 - y * k * base; apply(); }
  svg.addEventListener('click', () => { if (!sel) return; });
  // keep the operator's view on resize: shift by half the size change instead of re-fitting
  addEventListener('resize', () => { const nw = svg.clientWidth, nh = svg.clientHeight; if (k === 1) return fit(); tx += (nw - vw) / 2; ty += (nh - vh) / 2; vw = nw; vh = nh; apply(); });

  // legend and filters
  const counts = {}; gates.forEach(g => counts[g.type] = (counts[g.type] || 0) + 1);
  if (innerHeight < 1150) $('legendBox').open = false; // keep the map clear on smaller screens
  $('legend').innerHTML = '<h4>Gate types</h4>' + Object.entries(TYPE).map(([t, d]) => `<div><svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true"><path d="${SHAPE[t]}" fill="${d.hex}" stroke="#0b0e10" stroke-width="1.4"/></svg><span>${d.label} (${counts[t] || 0})<br><small>${d.where}</small></span></div>`).join('') +
    '<h4 style="margin-top:8px">Status</h4><div><svg width="18" height="18" viewBox="-9 -9 18 18"><circle r="7" fill="none" stroke="#ff3b3b" stroke-width="2.5"/></svg><span>Ring: alarm (red P1 · orange P2 · yellow P3), blinking until acknowledged</span></div><div><svg width="18" height="18" viewBox="-9 -9 18 18"><text x="-4" y="4" font-size="11" font-weight="700" fill="#4aa3ff">M</text></svg><span>M manual · L local (site) control</span></div><div><svg width="18" height="18" viewBox="-9 -9 18 18"><path d="M-7 0H7" stroke="#b07a55" stroke-dasharray="3 2"/></svg><span>Lost water body (when shown)</span></div>' +
    '<p class="note" style="margin:6px 0 0">Gate positions are an illustrative planning layout, not BBMP\'s asset register.</p>';
  Object.keys(VALLEY).forEach(v => $('fValley').add(new Option(v + ' valley', v)));
  Object.entries(TYPE).forEach(([t, d]) => $('fType').add(new Option(d.label, t)));
  function applyFilters() {
    const v = $('fValley').value, t = $('fType').value, a = $('fAlarm').checked, mm = $('fManual').checked;
    gates.forEach(g => { const st = gateAlarmState(g); const show = (!v || g.valley === v) && (!t || g.type === t) && (!a || st.p) && (!mm || g.m.mode === 'manual' || g.m.mode === 'local'); g.el.style.display = show ? '' : 'none'; });
  }
  ['fValley', 'fType', 'fAlarm', 'fManual'].forEach(id => $(id).onchange = applyFilters);
  $('tLbl').onchange = upd; $('tValley').onchange = upd; $('tLost').onchange = e => $('lostG').style.display = e.target.checked ? '' : 'none';
  $('q').oninput = e => {
    const v = e.target.value.trim().toLowerCase(), res = $('res'); res.innerHTML = ''; if (v.length < 2) return;
    const hits = gates.filter(g => g.id.toLowerCase().includes(v)).slice(0, 4).map(g => ['g', g]).concat(D.lakes.filter(l => l.n.toLowerCase().includes(v)).slice(0, 6).map(l => ['l', l]));
    hits.forEach(([kind, o]) => { const b = document.createElement('button'); b.textContent = kind === 'g' ? `${o.id} · ${TYPE[o.type].label}` : `${o.n} · ${o.a.toFixed(0)} ac · ${(o.gates || []).length} gate(s)`; b.onclick = () => { res.innerHTML = ''; kind === 'g' ? select(o, true) : selectLake(o, true); }; res.appendChild(b); });
  };

  // ---------------- selection and faceplate ----------------
  let sel = null, selLake = null;
  function selectLake(l, zoomTo) {
    document.querySelectorAll('.lake.sel').forEach(e => e.classList.remove('sel')); l.el.classList.add('sel'); selLake = l;
    if (zoomTo) focusOn(l.b[0] + l.b[2] / 2, l.b[1] + l.b[3] / 2, l.b[2], l.b[3]);
    if ((l.gates || []).length === 1) return select(l.gates[0]);
    sel = null; gates.forEach(g => g.el.classList.remove('selg'));
    $('faceplate').hidden = true; $('noSel').hidden = false;
    $('noSel').innerHTML = `<h3>${esc(l.n)}</h3><dl class="kv"><dt>Area</dt><dd>${l.a.toFixed(1)} ac</dd><dt>Type</dt><dd>${esc(l.c || '—')}</dd><dt>Valley</dt><dd>${esc(l.v)}</dd><dt>Ward</dt><dd>${esc(l.w || '—')}</dd></dl>` +
      ((l.gates || []).length ? `<p style="margin:10px 0 4px">Gates at this lake:</p><div class="lakeGates">${l.gates.map(g => `<button data-g="${g.id}"><span>${g.id}</span><span>${TYPE[g.type].label}</span></button>`).join('')}</div>` : '<p class="note">No gate planned here (kalyani, gokatte or quarry).</p>');
    $('noSel').querySelectorAll('[data-g]').forEach(b => b.onclick = () => select(byId[b.dataset.g]));
  }
  function select(g, zoomTo) {
    sel = g; gates.forEach(x => x.el.classList.toggle('selg', x === g));
    if (!g.lost) { document.querySelectorAll('.lake.sel').forEach(e => e.classList.remove('sel')); g.place.el && g.place.el.classList.add('sel'); }
    if (zoomTo) focusOn(g.x, g.y, g.place.b[2], g.place.b[3]);
    $('noSel').hidden = true; $('faceplate').hidden = false;
    $('override').checked = !!(g.m.manual && g.m.manual.override);
    const op = Math.round(GT.opening(g.m)); $('pct').value = op; $('pctR').value = op;
    $('tsOut').textContent = '';
    faceplate(); troubleshoot();
  }
  function openingText(m) {
    const L = m.last, T = m.T;
    if (m.typeId === 'crest') return { act: GT.opening(m).toFixed(0) + '%', sub: 'crest ' + m.z.toFixed(2) + ' m', tgt: ((T.zmax - L.target) / (T.zmax - T.zmin) * 100).toFixed(0) + '%' };
    if (m.typeId === 'flap') return { act: m.pen.toFixed(0) + '%', sub: 'penstock · flap ' + (L.flapFrac * 60).toFixed(0) + '°', tgt: (L.target ?? m.pen).toFixed(0) + '%' };
    return { act: m.pos.toFixed(0) + '%', sub: (L.open * 1000).toFixed(0) + ' mm', tgt: (L.target ?? m.pos).toFixed(0) + '%' };
  }
  function faceplate() {
    const g = sel; if (!g) return; const m = g.m, L = m.last, T = m.T, o = openingText(m), st = gateAlarmState(g);
    $('fpTitle').textContent = `${g.id} · ${TYPE[g.type].label}`;
    const pw = hasPower(m) ? (m.condition === 'Power cut, backup starts' && m.t >= (m.faultAt ?? GT.FAULT_AT) ? 'Backup gen' : 'Mains') : 'FAILED';
    $('fpInfo').innerHTML = `<dt>${g.lost ? 'Outfall at' : 'Lake'}</dt><dd>${esc(g.place.n)}</dd><dt>Valley</dt><dd>${esc(g.valley)}</dd>` +
      `<dt>${T.up.label}</dt><dd>${L.h1.toFixed(2)} m</dd><dt>${T.dn.label}</dt><dd>${L.h2.toFixed(2)} m</dd>` +
      `<dt>Mode</dt><dd>${m.mode === 'manual' ? 'MANUAL' : m.mode === 'local' ? 'LOCAL' : 'Auto'}</dd><dt>Power</dt><dd>${pw}</dd>` +
      `<dt>Level sensor</dt><dd>${L.sensorOk === false ? 'FROZEN' : m.voted ? 'Backup' : T.sensed ? 'OK' : 'None'}</dd><dt>Pump</dt><dd>${g.type === 'flap' ? (L.pump ? 'Running ' + (L.qp * 1000).toFixed(0) + ' L/s' : 'Off') : '—'}</dd>`;
    $('fpAct').textContent = o.act; $('fpAct').title = o.sub; $('fpTgt').textContent = o.tgt; $('fpQ').textContent = L.q.toFixed(2) + ' m³/s';
    const s = $('fpStatus'); s.className = 'status' + (st.p ? ' a' + st.p : m.mode !== 'auto' ? ' man' : ''); s.textContent = m.alarm || '—';
    ['mAuto', 'mManual', 'mLocal'].forEach(id => $(id).setAttribute('aria-pressed', String((id === 'mAuto' && (m.mode || 'auto') === 'auto') || (id === 'mManual' && m.mode === 'manual') || (id === 'mLocal' && m.mode === 'local'))));
    const remote = g.type !== 'float' && m.mode !== 'local';
    ['cOpen', 'cClose', 'cStop', 'cSet', 'pct', 'pctR', 'override'].forEach(id => $(id).disabled = !remote);
    $('mManual').disabled = g.type === 'float'; $('pumpRow').hidden = g.type !== 'flap';
    $('cmdNote').textContent = g.type === 'float' ? 'Float gates have no motor. They cannot be operated remotely; use the maintenance lock pin on site.' : m.mode === 'local' ? 'The site panel has control. Remote commands are refused until control is handed back.' :
      g.type === 'crest' ? '0% = crest raised (holding water), 100% = crest fully lowered (maximum spill).' : g.type === 'flap' ? 'Commands move the penstock. The flap itself opens and closes by water pressure.' : 'Percent of full gate travel. Travel is limited to ' + T.rate + '% per second.';
    mimic();
  }

  // ---------------- live mimic of the selected gate ----------------
  const MY = h => 180 - h * 40;
  function mimic() {
    const g = sel, m = g.m, L = m.last, T = m.T, sv = $('mimic'), up = L.h1, dn = L.h2;
    let h = `<rect x="0" y="180" width="400" height="30" fill="#2e2a22"/>`;
    h += `<rect x="0" y="${MY(up)}" width="200" height="${Math.max(0, 180 - MY(up))}" fill="#1f6f99"/><rect x="200" y="${MY(dn)}" width="200" height="${Math.max(0, 180 - MY(dn))}" fill="#2a5f7c"/>`;
    h += `<line x1="0" x2="190" y1="${MY(T.up.top)}" y2="${MY(T.up.top)}" stroke="#6b6252" stroke-dasharray="4 3"/><text x="4" y="${MY(T.up.top) - 3}">${T.up.label} bank ${T.up.top} m</text>`;
    const gx = 200, st = '#9aa7af';
    if (g.type === 'vertical' || g.type === 'float') {
      const a = L.open, ta = (L.target ?? m.pos) / 100 * T.amax;
      h += `<rect x="${gx - 6}" y="${MY(3.3)}" width="12" height="${180 - MY(3.3)}" fill="#3a444b" opacity=".8"/>`;
      h += `<rect x="${gx - 4}" y="${MY(ta + 2.6)}" width="8" height="${2.6 * 40}" fill="none" stroke="#4aa3ff" stroke-dasharray="3 2"/>`;
      h += `<rect x="${gx - 4}" y="${MY(a + 2.6)}" width="8" height="${2.6 * 40}" fill="${st}"/><rect x="${gx - 5}" y="${MY(a) - 2}" width="10" height="3" fill="#000"/>`;
      if (g.type === 'float') { const fz = MY(Math.max(up, 0.3)); h += `<rect x="110" y="${fz - 10}" width="34" height="16" rx="4" fill="#c9a43a" stroke="#e9c46a"/><path d="M127 ${fz - 10}V${MY(3.6)}H${gx}V${MY(a + 2.6)}" fill="none" stroke="#8b98a1" stroke-width="1.5"/><text x="96" y="${fz - 14}">Float</text>`; }
      else h += `<rect x="${gx - 16}" y="${MY(3.5)}" width="32" height="14" fill="#55626a"/><line x1="${gx}" y1="${MY(3.5)}" x2="${gx}" y2="${MY(a + 2.6)}" stroke="#c6d0d6" stroke-width="2"/>`;
    } else if (g.type === 'radial') {
      const R = 4 * 40 * 0.55, px = gx + 70, py = MY(2.6) + 30, a = L.open;
      const ang = Math.asin(Math.min(1, (py - MY(a)) / R)), lip = [px - Math.cos(ang) * R, py - Math.sin(ang) * R * -1];
      const lipY = MY(a), lipX = px - Math.sqrt(Math.max(0, R * R - (py - lipY) ** 2)), topY = py - R * 0.55, topX = px - Math.sqrt(Math.max(0, R * R - (py - topY) ** 2));
      h += `<path d="M${lipX} ${lipY}A${R} ${R} 0 0 0 ${topX} ${topY}" fill="none" stroke="${st}" stroke-width="6"/><line x1="${px}" y1="${py}" x2="${lipX}" y2="${lipY}" stroke="${st}" stroke-width="3"/><line x1="${px}" y1="${py}" x2="${topX}" y2="${topY}" stroke="${st}" stroke-width="3"/><circle cx="${px}" cy="${py}" r="5" fill="#d6dde2"/><text x="${px + 8}" y="${py}">trunnion</text>`;
    } else if (g.type === 'crest') {
      const hz = T.zmin - 0.2, len = 1.5 * 40, dy = (m.z - hz) * 40, dx = Math.sqrt(Math.max(0, len * len - dy * dy));
      const tdy = (L.target - hz) * 40, tdx = Math.sqrt(Math.max(0, len * len - tdy * tdy));
      h += `<path d="M${gx - 60} 180L${gx - 25} ${MY(hz)}H${gx + 25}L${gx + 60} 180Z" fill="#4a463c"/>`;
      h += `<line x1="${gx - 10}" y1="${MY(hz)}" x2="${gx - 10 + tdx}" y2="${MY(hz) - tdy}" stroke="#4aa3ff" stroke-dasharray="3 2" stroke-width="2"/>`;
      h += `<line x1="${gx - 10}" y1="${MY(hz)}" x2="${gx - 10 + dx}" y2="${MY(hz) - dy}" stroke="${st}" stroke-width="6" stroke-linecap="round"/><circle cx="${gx - 10}" cy="${MY(hz)}" r="4" fill="#d6dde2"/>`;
    } else if (g.type === 'flap') {
      const ang = L.flapFrac * 60 * Math.PI / 180, hy = MY(T.amax), len = (T.amax + 0.05) * 40, pa = m.pen / 100 * T.amax;
      h += `<rect x="${gx - 8}" y="${MY(3)}" width="12" height="${hy - MY(3)}" fill="#4a463c"/>`;
      h += `<rect x="${gx - 20}" y="${MY(pa + 1.4)}" width="7" height="${1.4 * 40}" fill="${st}"/><text x="${gx - 70}" y="${MY(pa + 1.4) - 4}">penstock</text>`;
      h += `<line x1="${gx + 4}" y1="${hy}" x2="${gx + 4 + Math.sin(ang) * len}" y2="${hy + Math.cos(ang) * len}" stroke="${st}" stroke-width="5" stroke-linecap="round"/><circle cx="${gx + 4}" cy="${hy}" r="3" fill="#d6dde2"/><text x="${gx + 10}" y="${hy - 4}">flap</text>`;
      h += `<circle cx="60" cy="40" r="10" fill="${L.pump ? '#3ccf6e' : '#55606a'}"/><text x="74" y="44">pump ${L.pump ? 'ON' : 'off'}</text>`;
    }
    // flow path: dashes move at a speed set by the discharge
    if (Math.abs(L.q) > 0.005) {
      const yy = MY(Math.min(up, dn, 0.4) / 2 + 0.05), dir = L.q > 0 ? 1 : -1;
      h += `<path id="flowPath" d="M${dir > 0 ? 130 : 270} ${yy}H${dir > 0 ? 270 : 130}" stroke="${dir > 0 ? '#7fd3ff' : '#ff3b3b'}" stroke-width="3" stroke-dasharray="8 7" fill="none" marker-end="url(#ah)"/>`;
      h = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="${dir > 0 ? '#7fd3ff' : '#ff3b3b'}"/></marker></defs>` + h;
      flowSpeed = dir * Math.min(120, 15 + 25 * Math.abs(L.q));
    } else flowSpeed = 0;
    h += `<text x="6" y="200">${T.up.label} ${up.toFixed(2)} m</text><text x="394" y="200" text-anchor="end">${T.dn.label} ${dn.toFixed(2)} m</text><text x="200" y="14" text-anchor="middle">${Math.abs(L.q).toFixed(2)} m³/s ${L.q < -0.005 ? 'REVERSE' : ''}</text>`;
    h += `<text x="394" y="14" text-anchor="end" fill="#4aa3ff">dashed = target</text>`;
    sv.innerHTML = h;
  }
  let flowSpeed = 0, flowOff = 0, lastF = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  (function anim(ts) { const dt = Math.min(0.1, (ts - lastF) / 1000 || 0); lastF = ts; const p = document.getElementById('flowPath'); if (p && !reduce && !paused) { flowOff -= flowSpeed * dt * (+$('speed').value > 1 ? 1.5 : 1); p.setAttribute('stroke-dashoffset', flowOff.toFixed(1)); } requestAnimationFrame(anim); })(0);

  // ---------------- commands (select, confirm, execute, supervise) ----------------
  function needOperator() { const op = $('operator').value.trim(); if (!op) { $('operator').focus(); alert('Enter your operator name in the top bar before sending commands. Every command is logged against it.'); return null; } return op; }
  function confirmDlg(title, html, needReason, onOk) {
    $('dlgTitle').textContent = title; $('dlgBody').innerHTML = html + (needReason ? '<label for="reason">Reason (required, recorded in the log)</label><input type="text" id="reason" autocomplete="off">' : '');
    const d = $('dlg'); d.showModal();
    // Execute runs the command directly (no reliance on the dialog close event); a missing reason keeps the dialog open
    $('dlgOk').onclick = e => {
      e.preventDefault();
      const reason = needReason ? ($('reason').value || '').trim() : '';
      if (needReason && reason.length < 4) { let w = $('dlgBody').querySelector('.reasonWarn'); if (!w) { w = document.createElement('div'); w.className = 'wn reasonWarn'; $('dlgBody').appendChild(w); } w.textContent = 'Enter a reason of at least a few words. The command has not been sent.'; $('reason').focus(); return; }
      d.close('ok'); onOk(reason);
    };
  }
  function travelTime(m, from, to) { const T = m.T, rate = m.typeId === 'crest' ? T.zrate / (T.zmax - T.zmin) * 100 : T.rate; return Math.abs(to - from) / rate; }
  function sendTarget(target, label) {
    const g = sel; if (!g || !needOperator()) return; const m = g.m, from = GT.opening(m), ov = $('override').checked;
    const warn = [];
    if (m.T.dsLimit && m.last.h2 >= m.T.dsLimit - 0.15 && target > from) warn.push('Downstream drain is near or at its limit. Opening will raise it further.');
    if (m.last.h2 > m.last.h1 - 0.05 && target > from) warn.push('Downstream level is level with or above upstream: opening can cause reverse flow.');
    if (!hasPower(m)) warn.push('No power at this gate: the command will not execute until power is restored.');
    if (ov) warn.push('Process interlocks will be overridden for this gate until you clear the override.');
    if ((m.mode || 'auto') === 'auto') warn.push('The gate will leave automatic control and stay in manual until you return it to Auto.');
    const tt = travelTime(m, from, target);
    confirmDlg(`${label}: ${g.id}`, `<p><b>${esc(g.place.n)}</b> · ${TYPE[g.type].label}</p><p>From <b>${from.toFixed(0)}%</b> to <b>${target.toFixed(0)}%</b>. Estimated travel ${Math.ceil(tt)} s.</p>` + warn.map(w => `<div class="wn">${esc(w)}</div>`).join(''), ov || (m.mode || 'auto') === 'auto', reason => {
      GT.command(m, target, { override: ov });
      g.cmd = { target, start: from, at: m.t, done: false, failed: false };
      logEvent(g, label, `${from.toFixed(0)}% → ${target.toFixed(0)}%${ov ? ' · INTERLOCKS OVERRIDDEN' : ''}${reason ? ' · reason: ' + reason : ''}`);
      faceplate();
    });
  }
  $('cOpen').onclick = () => sendTarget(100, 'Open fully');
  $('cClose').onclick = () => sendTarget(0, 'Close fully');
  $('cSet').onclick = () => sendTarget(Math.max(0, Math.min(100, +$('pct').value || 0)), 'Set opening');
  $('pctR').oninput = () => $('pct').value = $('pctR').value; $('pct').oninput = () => $('pctR').value = $('pct').value;
  $('cStop').onclick = () => { const g = sel; if (!g || !needOperator()) return; GT.stopGate(g.m); g.cmd = null; logEvent(g, 'Stop / hold', 'Held at ' + GT.opening(g.m).toFixed(0) + '%'); faceplate(); };
  $('mAuto').onclick = () => { const g = sel; if (!g || !needOperator()) return; confirmDlg(`Return to Auto: ${g.id}`, '<p>The gate will follow its automatic control rules again. Any override is cleared.</p>', false, () => { GT.setMode(g.m, 'auto'); if (g.m.manual) g.m.manual.override = false; $('override').checked = false; g.cmd = null; logEvent(g, 'Mode → Auto'); faceplate(); }); };
  $('mManual').onclick = () => { const g = sel; if (!g || !needOperator()) return; confirmDlg(`Take manual control: ${g.id}`, '<p>The gate holds its present position until you send a command. Automatic protection by the control rules stops; equipment interlocks stay active.</p>', true, r => { GT.setMode(g.m, 'manual'); GT.stopGate(g.m); logEvent(g, 'Mode → Manual', 'reason: ' + r); faceplate(); }); };
  $('mLocal').onclick = () => { const g = sel; if (!g || !needOperator()) return; confirmDlg(`Hand control to site: ${g.id}`, '<p>The site panel takes control. Remote commands will be refused until the site hands control back.</p>', true, r => { GT.setMode(g.m, 'local'); logEvent(g, 'Mode → Local (site)', 'reason: ' + r); faceplate(); }); };
  const pump = v => () => { const g = sel; if (!g || !needOperator()) return; GT.setMode(g.m, 'manual'); g.m.manual.pump = v; logEvent(g, 'Pump ' + (v === null ? 'auto' : v ? 'start' : 'stop')); faceplate(); };
  $('pAuto').onclick = pump(null); $('pOn').onclick = pump(true); $('pOff').onclick = pump(false);
  $('override').onchange = () => { const g = sel; if (!g) return; if (!$('override').checked && g.m.manual) { g.m.manual.override = false; logEvent(g, 'Interlock override cleared'); } };

  // ---------------- troubleshooting ----------------
  const GUIDE = {
    'Power cut': { why: 'Mains supply lost and no backup running. Motorised gates hold position; pumps stop.', checks: ['Check BESCOM supply and the incoming breaker.', 'Check the backup generator: fuel, battery, auto-start fault.', 'Watch upstream level: if it nears the high-high level, send a crew with the portable generator or to operate the handwheel.'], acts: [['Start backup generator', 90, 'Backup generator running; control and pumps restored.'], ['Send crew with portable generator', 1800, 'Crew connected the portable generator; gate powered.']] },
    'Power cut, backup starts': { why: 'Mains lost; backup generator starting.', checks: ['Confirm the generator picked up the load.', 'Log fuel level and expected run time.'], acts: [] },
    'Level sensor failure': { why: 'The upstream level reading has stopped changing while water is moving. Automatic control holds the gate so it does not act on a false level.', checks: ['Compare with the staff gauge (call the site).', 'Check the transmitter cable, power and 4–20 mA signal.', 'Switch to the backup sensor if fitted; otherwise take manual control.'], acts: [['Switch to backup sensor', 10, 'Voting switched to the backup level sensor; automatic control resumed.', 'backup'], ['Send technician to replace transmitter', 3600, 'Level transmitter replaced and checked against the staff gauge.']] },
    'Sensor failure, backup sensor': { why: 'Main sensor failed; the backup is in use.', checks: ['Schedule replacement of the main sensor.'], acts: [['Send technician to replace transmitter', 3600, 'Main level transmitter replaced.']] },
    'Gate jam': { why: 'The drive is running but the gate is not moving, or travel stopped mid-way.', checks: ['Check motor current and the torque switch.', 'Look for debris in the guides (camera or crew).', 'Do not keep driving against a jam: it can bend the spindle.'], acts: [['Try short reverse inching', 0, 'Reverse inching: no movement. Mechanical jam confirmed; crew required.', 'nofix'], ['Dispatch crew to clear jam', 1800, 'Crew cleared debris from the guides; gate moves freely.']] },
    'Debris': { why: 'Floating debris or garbage at the gate.', checks: ['View the trash screen camera.', 'For a flap gate: river water may be entering. Close the penstock (Close fully).'], acts: [['Dispatch cleaning crew', 1200, 'Cleaning crew cleared the trash screen and gate.']] },
    'Seal leakage': { why: 'Water is passing the closed gate: seals worn or debris on the sill.', checks: ['Open 5% for a short flush, then close, to clear debris from the sill.', 'If leakage continues, schedule seal replacement.'], acts: [['Schedule seal replacement', 7200, 'Seals replaced; leakage stopped.']] },
    'Brake creep': { why: 'The gate drifts down with no command: the brake is slipping.', checks: ['The PLC is re-driving the gate; watch for repeated corrections.', 'Inspect brake air gap and lining.'], acts: [['Send crew to adjust brake', 1800, 'Brake air gap reset and lining checked.']] },
    'Hydraulic leak': { why: 'A cylinder seal is leaking; the crest leaf is sinking faster than the power pack can lift it.', checks: ['Check oil level and look for oil on the water (contain it).', 'Close the pilot-operated check valves to lock the leaf.'], acts: [['Lock leaf with check valves', 600, 'Check valves closed; leaf locked. Cylinder seal replacement scheduled.']] }
  };
  function troubleshoot() {
    const g = sel; if (!g) return; const m = g.m, c = m.condition, active = c !== 'Healthy' && m.t >= (m.faultAt ?? GT.FAULT_AT), G = GUIDE[c];
    const pend = repairs.filter(r => r.g === g);
    if (!active || !G) { $('tsBody').innerHTML = '<p class="note">No equipment fault on this gate.' + (pend.length ? ' Work in progress: ' + pend.map(p => esc(p.label)).join(', ') : '') + '</p>'; return; }
    $('tsBody').innerHTML = `<p><b>${esc(c)}.</b> ${esc(G.why)}</p><ol class="ts">${G.checks.map(x => `<li>${esc(x)}</li>`).join('')}</ol><div class="tsact">${G.acts.map((a, i) => `<button data-a="${i}">${esc(a[0])}</button>`).join('')}</div>` + (pend.length ? `<p class="note">In progress: ${pend.map(p => esc(p.label) + ' (ready at ' + fmtT(p.at) + ')').join(', ')}</p>` : '');
    $('tsBody').querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      if (!needOperator()) return; const [label, delay, msg, kind] = G.acts[+b.dataset.a];
      logEvent(g, 'Troubleshoot: ' + label);
      if (kind === 'nofix') { logEvent(g, 'Field report', msg); $('tsOut').textContent = msg; return; }
      const fn = kind === 'backup' ? () => { GT.setFault(m, 'Sensor failure, backup sensor', m.t - 11); } : () => GT.repair(m);
      repairs.push({ g, at: simT() + delay, fn, msg, label }); troubleshoot();
    });
  }
  $('selfTest').onclick = () => {
    const g = sel; if (!g) return; const m = g.m, L = m.last, lines = [];
    const ok = (c, t) => lines.push((c ? 'PASS  ' : 'FAIL  ') + t);
    ok(hasPower(m), 'Power supply'); ok(L.sensorOk !== false, 'Upstream level sensor responding' + (m.voted ? ' (backup sensor in use)' : ''));
    ok(!(m.condition === 'Gate jam' && m.t >= (m.faultAt ?? GT.FAULT_AT)), 'Drive moves the gate');
    ok(!(m.condition === 'Seal leakage' && m.t >= (m.faultAt ?? GT.FAULT_AT)), 'No leakage past the closed gate');
    ok(!(m.condition === 'Hydraulic leak'), g.type === 'crest' ? 'Hydraulic pressure holds' : 'Hydraulics (not fitted)');
    ok(true, 'Telemetry link to the control room');
    ok(!(g.cmd && g.cmd.failed), 'Last command executed');
    $('tsOut').textContent = `Self-test ${g.id} at ${fmtT(simT())}\n` + lines.join('\n'); logEvent(g, 'Self-test', lines.filter(l => l.startsWith('FAIL')).length + ' fail(s)');
  };
  Object.keys(GT.CONDITIONS).filter(c => c !== 'Healthy').forEach(c => $('inject').add(new Option(c)));
  $('inject').onchange = () => { const g = sel, c = $('inject').value; if (!g || !c) return; GT.setFault(g.m, c, g.m.t); logEvent(g, 'Training fault injected', c); $('inject').value = ''; troubleshoot(); };

  // ---------------- bottom tables ----------------
  let curTab = 'A';
  [['tA', 'A'], ['tE', 'E'], ['tI', 'I']].forEach(([id, t]) => $(id).onclick = () => { curTab = t; ['tA', 'tE', 'tI'].forEach(x => $(x).setAttribute('aria-selected', String(x === id))); table(); });
  function table() {
    let h = '';
    if (curTab === 'A') {
      const rows = [...alarms.values()].sort((a, b) => (a.acked - b.acked) || (a.p - b.p) || (b.raised - a.raised));
      h = `<table><thead><tr><th>Priority</th><th>Raised (sim)</th><th>IST</th><th>Gate</th><th>Lake / outfall</th><th>Alarm</th><th>State</th><th></th></tr></thead><tbody>` + (rows.length ? rows.map(r => `<tr class="p${r.p} ${r.acked ? '' : 'unack'} ${r.cleared !== null ? 'cleared' : ''}" data-g="${r.g.id}"><td>${PR[r.p]}</td><td>${fmtT(r.raised)}</td><td>${r.raisedIst}</td><td>${r.g.id}</td><td>${esc(r.g.place.n)}</td><td>${esc(r.msg)}</td><td>${r.cleared !== null ? 'Cleared, unacknowledged' : r.acked ? 'Active, acknowledged' : 'ACTIVE, UNACKNOWLEDGED'}</td><td>${r.acked ? '' : `<button data-ack="${r.key}">Ack</button>`}</td></tr>`).join('') : '<tr><td colspan="8">No alarms.</td></tr>') + '</tbody></table>';
    } else if (curTab === 'E') {
      h = `<table><thead><tr><th>Sim time</th><th>IST</th><th>Operator</th><th>Gate</th><th>Lake / outfall</th><th>Action</th><th>Details</th></tr></thead><tbody>` + events.slice(0, 300).map(e => `<tr data-g="${e.gate}"><td>${fmtT(e.sim)}</td><td>${e.ist}</td><td>${esc(e.op)}</td><td>${e.gate}</td><td>${esc(e.lake)}</td><td>${esc(e.action)}</td><td>${esc(e.detail)}</td></tr>`).join('') + '</tbody></table>';
    } else {
      h = `<table><thead><tr><th>Gate</th><th>Type</th><th>Lake / outfall</th><th>Valley</th><th>Mode</th><th>Opening</th><th>Upstream</th><th>Downstream</th><th>Flow</th><th>Alarm</th></tr></thead><tbody>` + gates.map(g => { const st = gateAlarmState(g), o = openingText(g.m); return `<tr class="${st.p ? 'p' + st.p : ''}" data-g="${g.id}"><td>${g.id}</td><td>${TYPE[g.type].label}</td><td>${esc(g.place.n)}</td><td>${esc(g.valley)}</td><td>${g.m.mode || 'auto'}</td><td>${o.act}</td><td>${g.m.last.h1.toFixed(2)} m</td><td>${g.m.last.h2.toFixed(2)} m</td><td>${g.m.last.q.toFixed(2)}</td><td>${st.p ? PR[st.p] : ''}</td></tr>`; }).join('') + '</tbody></table>';
    }
    const box = $('tbl'), top = box.scrollTop; box.innerHTML = h; box.scrollTop = top;
    box.querySelectorAll('[data-ack]').forEach(b => b.onclick = e => { e.stopPropagation(); ack(alarms.get(b.dataset.ack)); refreshUI(); });
    box.querySelectorAll('tr[data-g]').forEach(tr => tr.onclick = () => { const g = byId[tr.dataset.g]; if (g) select(g, true); });
  }
  $('ackAll').onclick = () => { [...alarms.values()].forEach(ack); refreshUI(); };
  $('exportLog').onclick = () => {
    const rows = [['sim_time', 'ist', 'operator', 'gate', 'lake', 'action', 'details'], ...events.slice().reverse().map(e => [fmtT(e.sim), e.ist, e.op, e.gate, e.lake, e.action, e.detail])];
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'gate-operator-log.csv'; a.click();
  };

  // ---------------- banner, markers, valley summary ----------------
  function refreshUI() {
    const n = { 1: 0, 2: 0, 3: 0 }; let un = 0, latest = null;
    for (const r of alarms.values()) { if (r.cleared === null) n[r.p]++; if (!r.acked) { un++; if (!latest || r.p < latest.p || (r.p === latest.p && r.raised > latest.raised)) latest = r; } }
    $('c1').textContent = n[1]; $('c1').parentElement.classList.toggle('hot', n[1] > 0); $('c2').textContent = n[2]; $('c3').textContent = n[3]; $('cU').textContent = un;
    $('cG').textContent = gates.length; $('cM').textContent = gates.filter(g => g.m.mode === 'manual' || g.m.mode === 'local').length;
    $('almLatest').textContent = latest ? `${PR[latest.p]} ${latest.g.id} ${latest.g.place.n}: ${latest.msg}` : 'No unacknowledged alarms';
    $('simClock').textContent = fmtT(simT()); $('wallClock').textContent = ist();
    gates.forEach(g => { const st = gateAlarmState(g); g.el.setAttribute('class', 'gate' + (st.p ? ' alm' + st.p : '') + (st.unack && st.p ? ' unack' : '') + (g === sel ? ' selg' : '')); g.badge.textContent = g.m.mode === 'manual' ? 'M' : g.m.mode === 'local' ? 'L' : ''; });
    applyFilters();
    if (sel) { faceplate(); if (uiCount % 25 === 0) troubleshoot(); } else if (!selLake) valleySummary();
    table();
  }
  function valleySummary() {
    const rows = Object.keys(VALLEY).map(v => { const gs = gates.filter(g => g.valley === v); return [v, gs.length, gs.filter(g => gateAlarmState(g).p).length, gs.filter(g => g.m.mode !== 'auto' && g.m.mode).length]; });
    $('noSel').innerHTML = `<h3>Network overview</h3><table><thead><tr><th>Valley</th><th>Gates</th><th>In alarm</th><th>Manual/local</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table>
      <p class="note" style="margin-top:10px">Select a gate marker on the map, or a lake to list its gates. Commands need an operator name, are confirmed before sending, and are logged.</p>
      <p class="note"><b>About this board.</b> Training and demonstration only: gates are simulated and the layout is illustrative. BBMP had sluice gates at about 10 lakes with 10 more in progress (Deccan Herald, April 2025); their positions are not public. A real system needs authenticated access on a closed network, PLC interlocks at each gate that this screen cannot bypass, and witnessed commissioning.</p>
      <p class="note"><b>Sources.</b> Lakes, streams, valleys and boundary: MOD Foundation, "Building a Resilient Bengaluru" (May 2026). Drainage divide context: Paani.Earth hydrology map (CC BY-NC-SA). Imagery for verification: ISRO NRSC Bhuvan. Display practice: ISA-101 high-performance HMI.</p>`;
  }

  // ---------------- start ----------------
  Object.keys(GT.SCENARIOS).forEach(s => $('scenario').add(new Option(s)));
  $('scenario').onchange = () => { scenario = $('scenario').value; buildModels(); alarms.clear(); repairs = []; logEvent(null, 'Flood case', scenario); if (sel) select(sel); refreshUI(); };
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause'; };
  try { $('operator').value = localStorage.getItem('gateOperator') || ''; } catch (e) { }
  $('operator').onchange = () => { try { localStorage.setItem('gateOperator', $('operator').value.trim()); } catch (e) { } };
  buildModels(); fit(); gates.forEach(evalAlarms); refreshUI(); logEvent(null, 'Board started', gates.length + ' gates, flood case ' + scenario);
  setInterval(tick, 100);
  window.__board = { gates, alarms, events, select, byId };
})();

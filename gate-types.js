// Five sluice gate types, each with its own hydraulics and automatic control, run against the same
// flood scenarios and equipment conditions. Pure model: no DOM, so it runs in the browser and in Node.
// Every dimension is ILLUSTRATIVE. Storage is prismatic (constant plan area) to keep each model readable;
// the main simulator (controller.js) is the one that takes surveyed stage-area curves.
// Levels are metres above the gate sill. Flows in m³/s. One step = 1 s.
(function (root) {
  const G = 9.81;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // Orifice flow under a lifting gate: free when the tailwater is below the lip, submerged otherwise, blended.
  function orifice(h1, h2, b, a, cd) {
    if (a <= 0 || h1 === h2) return 0;
    const dir = Math.sign(h1 - h2), up = Math.max(h1, h2), dn = Math.min(h1, h2);
    if (up <= 0) return 0;
    const aEff = Math.min(a, up); // the opening cannot pass more depth than there is water
    const free = cd * b * aEff * Math.sqrt(2 * G * Math.max(0, up - aEff / 2));
    const sub = cd * b * aEff * Math.sqrt(2 * G * (up - dn));
    const s = clamp((dn - aEff) / (0.25 * aEff + 0.05));
    return dir * Math.min(free, (1 - s) * free + s * sub);
  }
  // Sharp-crested weir over the top of a crest gate, with Villemonte submergence reduction.
  function weir(h1, h2, b, z, cw) {
    const H1 = h1 - z, H2 = h2 - z;
    if (H1 <= 0 && H2 <= 0) return 0;
    if (H1 >= H2) { const f = H2 > 0 ? Math.pow(1 - Math.pow(H2 / H1, 1.5), 0.385) : 1; return cw * b * Math.pow(H1, 1.5) * f; }
    const f = H1 > 0 ? Math.pow(1 - Math.pow(H1 / H2, 1.5), 0.385) : 1; return -cw * b * Math.pow(H2, 1.5) * f;
  }

  // ---------- Flood scenarios: inflow to the upstream side, local inflow downstream, receiving-water level ----------
  const tri = (t, start, peakAt, end) => t <= start || t >= end ? 0 : t < peakAt ? (t - start) / (peakAt - start) : (end - t) / (end - peakAt);
  const SCENARIOS = {
    'Monsoon storm': { note: 'A two-hour design storm. Inflow peaks at 40 minutes.', lakeStart: 1.35, drainStart: 0.3, inflow: t => 0.6 + 7.4 * tri(t, 0, 2400, 7200), lateral: t => 0.2 + 1.0 * tri(t, 600, 2700, 7200), river: () => 0.6 },
    'Cloudburst': { note: 'An intense 30-minute burst on an already wet catchment.', lakeStart: 1.45, drainStart: 0.4, inflow: t => 0.8 + 14 * tri(t, 600, 1200, 2400), lateral: t => 0.3 + 2.5 * tri(t, 600, 1300, 2600), river: () => 0.8 },
    'High river / backflow': { note: 'Moderate rain while the receiving drain or river rises above the outlet.', lakeStart: 1.45, drainStart: 0.4, inflow: t => 0.8 + 2.2 * tri(t, 0, 3000, 7200), lateral: t => 0.2, river: t => 0.6 + 1.8 * tri(t, 900, 3600, 7200) },
    'Upstream lake releases at the peak': { note: 'Uncoordinated lake chain: an upstream lake opens its gate and its release reaches the drain just as the local storm peaks.', lakeStart: 1.4, drainStart: 0.4, inflow: t => 0.6 + 6.4 * tri(t, 0, 2400, 7200), lateral: t => 0.2 + 1.0 * tri(t, 600, 2700, 7200) + 3.5 * tri(t, 1500, 2700, 4800), river: () => 0.6 },
    'Lake already full': { note: 'The lake starts near its operating limit before a moderate storm.', lakeStart: 1.9, drainStart: 0.6, inflow: t => 0.8 + 3.5 * tri(t, 0, 2400, 7200), lateral: t => 0.3 + 0.8 * tri(t, 600, 2700, 7200), river: () => 0.7 }
  };
  const CONDITIONS = {
    'Healthy': 'All equipment works.',
    'Power cut': 'Mains fails at 10 minutes and the backup generator does not start. Motorised gates hold where they are; pumps stop.',
    'Power cut, backup starts': 'Mains fails at 10 minutes; the backup generator takes 90 seconds to start, then control and pumps resume.',
    'Level sensor failure': 'The upstream level transmitter freezes at 10 minutes. Automatic control must detect it and hold.',
    'Sensor failure, backup sensor': 'The main level sensor freezes at 10 minutes, but a second sensor of a different type disagrees with it; voting switches control to the backup.',
    'Gate jam': 'The gate stops moving at 10 minutes, wherever it is.',
    'Debris': 'Trash at the gate: a flap gate cannot close fully; other gates lose 40% of their flow capacity.',
    'Seal leakage': 'Worn seals from 10 minutes: water passes a closed gate through an equivalent 6 mm gap along the bottom.',
    'Brake creep': 'Vertical and radial gates: from 10 minutes the brake slips and the leaf drifts down without a command. The PLC detects the drift and corrects it.',
    'Hydraulic leak': 'Crest gate only: from 10 minutes a cylinder seal leaks; the leaf sinks faster than the power pack can raise it.'
  };
  const FAULT_AT = 600;
  const fa = m => (m.faultAt === undefined ? FAULT_AT : m.faultAt);

  // ---------- Gate types ----------
  // up/dn: plan area (m²), top level before spilling (m). recv: conveyance from the downstream side to the receiving water.
  const TYPES = {
    vertical: {
      name: 'Vertical lift gate', use: 'Lake outlet release',
      where: 'A steel plate lifts vertically in side guides. The usual BBMP lake outlet gate: simple, compact, easy to seal. Lifting force grows with water pressure on the plate, so large gates need big hoists.',
      control: 'Opens in proportion to how far the lake is above its setpoint (1.5 m). Closes if the drain reaches 2.0 m or the head across the gate reverses. Travel 2% per second.',
      up: { area: 60000, top: 2.5, label: 'Lake' }, dn: { area: 4000, top: 2.4, label: 'Drain' }, recv: { k: 4.0, bed: 0.2 },
      b: 2.0, amax: 1.0, cd: 0.62, rate: 2, setpoint: 1.5, band: 0.5, dsLimit: 2.0, powered: true, sensed: true
    },
    radial: {
      name: 'Radial (Tainter) gate', use: 'Lake-chain or primary drain regulator',
      where: 'A curved skin plate on arms that pivot on a trunnion. Water pressure passes through the pivot, so lifting force is far lower than a vertical gate of the same size. Suited to wide openings between lakes in a chain.',
      control: 'PI controller holds the upstream level at 1.5 m, limited by the downstream level. Closes on reverse head. Travel 1.5% per second.',
      up: { area: 90000, top: 2.5, label: 'Upper lake' }, dn: { area: 70000, top: 2.4, label: 'Lower lake' }, recv: { k: 9.0, bed: 0.4 },
      b: 6.0, amax: 1.5, cd: 0.72, rate: 1.5, setpoint: 1.5, kp: 120, ki: 0.06, dsLimit: 2.0, powered: true, sensed: true
    },
    flap: {
      name: 'Flap gate + penstock + pump', use: 'Storm-drain outfall into a valley drain',
      where: 'Street catchment of about 1 ha upstream. A top-hinged flap on the outfall opens under the drain\'s own pressure and swings shut when the river is higher, with no power. A motorised penstock behind it is a second barrier if the flap leaks or jams, and a pump lifts trapped water over when the outfall is closed.',
      control: 'The flap is passive. The penstock closes automatically when the river is higher than the drain. The pump starts when the outfall is shut and the drain passes 1.4 m; it needs power.',
      up: { area: 3500, top: 2.0, label: 'Street drain' }, dn: { area: Infinity, top: 3.0, label: 'Valley drain' }, recv: null,
      inflowScale: 0.25, b: 1.5, amax: 1.2, cd: 0.6, flapHead: 0.03, rate: 3, pumpQ: 1.2, pumpOn: 1.4, pumpOff: 1.0, powered: true, sensed: true
    },
    crest: {
      name: 'Crest (overshoot) gate', use: 'Lake waste weir',
      where: 'A bottom-hinged leaf on the weir that lies back to lower its top edge. Water spills over the top, so floating debris passes and the lake level is held precisely. Replaces a fixed weir where the lake must be drawn down before a storm.',
      control: 'Lowers the crest to keep the lake at 1.6 m, and raises it back if the drain passes 2.0 m or comes level with the lake. Crest moves 1 cm per second between 0.9 m and 2.2 m.',
      up: { area: 60000, top: 2.5, label: 'Lake' }, dn: { area: 4000, top: 2.4, label: 'Drain' }, recv: { k: 4.0, bed: 0.2 },
      b: 8.0, zmin: 0.9, zmax: 2.2, cw: 1.8, zrate: 0.01, setpoint: 1.6, dsLimit: 2.0, powered: true, sensed: true
    },
    float: {
      name: 'Float-operated gate', use: 'Outlets without reliable power',
      where: 'A float and counterweight move the gate directly, so it opens as the lake rises and closes as it falls, with no motor, sensor or power. Response is fixed by its mechanics and it cannot react to downstream conditions.',
      control: 'Mechanical: fully closed at 1.5 m, fully open at 2.0 m, about 5% per second. Unaffected by power cuts or sensor failures.',
      up: { area: 60000, top: 2.5, label: 'Lake' }, dn: { area: 4000, top: 2.4, label: 'Drain' }, recv: { k: 4.0, bed: 0.2 },
      b: 2.0, amax: 1.0, cd: 0.62, rate: 5, setpoint: 1.5, band: 0.5, powered: false, sensed: false
    }
  };

  function create(typeId, scenarioName, condition) {
    const T = TYPES[typeId], S = SCENARIOS[scenarioName];
    if (!T || !S || !(condition in CONDITIONS)) throw new Error('Unknown model, scenario or condition.');
    const h1 = typeId === 'flap' ? S.drainStart : S.lakeStart;
    const m = {
      T, S, typeId, scenarioName, condition, t: 0,
      V1: h1 * T.up.area, V2: T.dn.area === Infinity ? 0 : Math.max(0.4, S.river(0) + 0.1) * T.dn.area,
      pos: 0, z: T.zmax || 0, pen: 100, pump: false, integ: 0, frozen: null, alarm: '',
      tot: { in: 0, lat: 0, out: 0, spill1: 0, spill2: 0, pumped: 0, back: 0 }, hist: []
    };
    m.V0 = { V1: m.V1, V2: m.V2 };
    if (typeId === 'crest') m.z = T.zmax;
    record(m, levels(m), { q: 0, qp: 0 });
    return m;
  }
  function levels(m) { const T = m.T; return { h1: m.V1 / T.up.area, h2: T.dn.area === Infinity ? m.S.river(m.t) : m.V2 / T.dn.area }; }
  const faultOn = (m, c) => m.condition === c && m.t >= fa(m);
  const hasPower = m => !faultOn(m, 'Power cut') && !(m.condition === 'Power cut, backup starts' && m.t >= fa(m) && m.t < fa(m) + 90);

  // The controller's view of the upstream level: frozen after a sensor failure. A frozen signal is detected
  // after 60 s of no change while flow is moving, and automatic control then holds.
  function measuredUp(m, h1) {
    if (faultOn(m, 'Sensor failure, backup sensor')) { // voting: primary frozen, backup live; mismatch > 3 cm or 10 s stale switches over
      if (m.frozen === null) m.frozen = h1;
      const switched = Math.abs(m.frozen - h1) > 0.03 || m.t >= fa(m) + 10;
      m.meas = switched ? h1 : m.frozen; m.sensorOk = true; m.voted = switched;
      return { v: m.meas, ok: true };
    }
    if (!faultOn(m, 'Level sensor failure')) { m.meas = h1; m.sensorOk = true; return { v: h1, ok: true }; }
    if (m.frozen === null) m.frozen = h1;
    m.meas = m.frozen; m.sensorOk = m.t < fa(m) + 60;
    return { v: m.frozen, ok: m.sensorOk };
  }

  const LEAK_GAP = 0.006;
  function leakage(m, h1, h2) { return faultOn(m, 'Seal leakage') ? orifice(h1, h2, m.T.b, LEAK_GAP, 0.6) : 0; }
  function gateFlow(m, h1, h2) { const q = gateFlowMain(m, h1, h2), lk = leakage(m, h1, h2); m.leak = lk; return q + lk; }
  function gateFlowMain(m, h1, h2) {
    const T = m.T, debris = m.condition === 'Debris';
    if (m.typeId === 'crest') return weir(h1, h2, T.b, m.z, T.cw) * (debris ? 0.6 : 1);
    if (m.typeId === 'flap') {
      const flapOpen = h1 - h2 > T.flapHead ? clamp((h1 - h2) / 0.15) : debris ? 0.3 : 0; // debris props it open 30%
      const a = T.amax * Math.min(flapOpen, m.pen / 100);
      m.flapFrac = flapOpen; m.open = a;
      return orifice(h1, h2, T.b, a, T.cd);
    }
    m.open = (m.pos / 100) * T.amax;
    return orifice(h1, h2, T.b, m.open, T.cd * (debris ? 0.6 : 1));
  }

  function control(m, h1, h2) {
    const T = m.T, power = !T.powered || hasPower(m), jam = faultOn(m, 'Gate jam');
    const sens = T.sensed ? measuredUp(m, h1) : { v: h1, ok: true };
    let msg = '';
    const manual = m.mode === 'manual' && m.manual, local = m.mode === 'local';
    if (m.typeId === 'float') {
      if (manual || local) m.cmdNote = 'Float gate has no motor: remote commands are not possible. Use the maintenance lock pin on site.';
      const target = 100 * clamp((h1 - T.setpoint) / T.band); m.target = target;
      if (!jam) m.pos += clamp(target - m.pos, -T.rate, T.rate);
      msg = jam ? 'Float gate jammed: no automatic response. Send a crew.' : h1 > T.setpoint ? 'Float lifting the gate as the lake rises.' : 'Lake below 1.5 m: float holds the gate shut.';
      return msg;
    }
    if (!power) msg = 'Power cut: motorised gate holding position. ';
    if (!sens.ok) msg += 'Upstream sensor frozen: automatic control holding. ';
    if (jam) msg += 'Gate jammed: travel stopped. ';
    // a manual command still needs power and a working drive; it does not need the level sensor
    const canMove = power && !jam && (manual || local ? true : sens.ok);
    if (local) msg = 'Local control at the site panel: remote commands are ignored. ';
    const ilock = (opening, why) => { if (manual && !m.manual.override && opening) { m.interlock = why; return true; } return false; };
    m.interlock = '';

    if (m.typeId === 'flap') {
      const reverse = h2 > sens.v;
      m.target = reverse ? 0 : 100;
      if (manual) { m.target = clamp(m.manual.target, 0, 100); if (m.target > m.pen && ilock(reverse, 'River higher than the drain: opening the penstock would let backflow in.')) m.target = m.pen; }
      if (local) m.target = m.pen;
      if (canMove) m.pen += clamp(m.target - m.pen, -T.rate, T.rate);
      const outfallShut = h2 >= h1 - T.flapHead || m.pen < 5;
      if (power) { if (manual && m.manual.pump !== undefined && m.manual.pump !== null) m.pump = !!m.manual.pump && h1 > 0.05; else { if (outfallShut && h1 > T.pumpOn) m.pump = true; if (h1 < T.pumpOff || !outfallShut) m.pump = false; } } else m.pump = false;
      if (!msg) msg = reverse ? 'River higher than the drain: flap shut, penstock closing' + (m.pump ? ', pump running.' : '.') : 'Drain flowing out through the flap.';
      else if (!power && h2 > h1) msg += 'Pump stopped: trapped water is rising.';
      return msg.trim();
    }
    if (m.typeId === 'crest') {
      let zt = T.setpoint;
      if (sens.v > T.setpoint) zt = T.setpoint - 4 * (sens.v - T.setpoint);
      if (h2 >= T.dsLimit || h2 > sens.v - 0.02) zt = T.zmax; // also block reverse flow into the lake
      zt = clamp(zt, T.zmin, T.zmax);
      if (manual) { zt = T.zmax - clamp(m.manual.target, 0, 100) / 100 * (T.zmax - T.zmin); if (zt < m.z && ilock(h2 >= T.dsLimit || h2 > sens.v - 0.02, 'Drain high or level with the lake: lowering the crest would flood downstream or let water back in.')) zt = m.z; }
      if (local) zt = m.z;
      m.target = zt;
      const hleak = faultOn(m, 'Hydraulic leak');
      if (canMove) m.z += clamp(zt - m.z, -T.zrate, hleak ? 0.002 : T.zrate);
      if (hleak) msg += 'Cylinder seal leaking: leaf sinking faster than the power pack can raise it. ';
      if (!msg) msg = h2 >= T.dsLimit ? 'Drain high: crest raised to hold water in the lake.' : h2 > sens.v - 0.02 ? 'Drain level near the lake: crest raised to stop reverse flow.' : sens.v > T.setpoint ? 'Lowering the crest to release the rise above 1.6 m.' : 'Crest holding the lake at its normal level.';
      return msg.trim();
    }
    // vertical and radial
    let target;
    if (m.typeId === 'radial') {
      const err = sens.v - T.setpoint;
      target = clamp(T.kp * err + T.ki * m.integ, 0, 100);
      if (canMove && target > 0 && target < 100) m.integ = clamp(m.integ + err, -400, 2000);
    } else target = 100 * clamp((sens.v - T.setpoint) / T.band);
    const closeReq = h2 >= T.dsLimit || sens.v - h2 <= 0.05;
    if (closeReq) target = 0;
    if (manual) { target = clamp(m.manual.target, 0, 100); if (target > m.pos && ilock(closeReq, h2 >= T.dsLimit ? 'Downstream drain at its limit: opening would flood downstream.' : 'Drain level with or above the lake: opening would let water flow back.')) target = m.pos; }
    if (local) target = m.pos;
    m.target = target;
    if (canMove) m.pos += clamp(target - m.pos, -T.rate, T.rate);
    if (!msg) msg = closeReq ? (h2 >= T.dsLimit ? 'Downstream at its limit: gate closing.' : 'Head reversing: gate closing to stop backflow.') : target > 0 ? 'Opening to release the rise above 1.5 m.' : 'Lake below setpoint: gate closed.';
    return msg.trim();
  }

  function modeNote(m) {
    if (m.mode === 'manual' && m.manual) return m.interlock ? 'MANUAL: ' + m.interlock + ' Opening blocked (interlock override needed).' : 'MANUAL: holding operator target ' + Math.round(m.manual.target) + '%' + (m.manual.override ? ' (interlocks overridden by operator)' : '') + '.';
    return '';
  }
  function step(m) {
    const T = m.T, S = m.S;
    let { h1, h2 } = levels(m);
    m.prevPos = m.typeId === 'crest' ? m.z : m.pos; m.prevPen = m.pen;
    m.alarm = control(m, h1, h2); m.cmdNote = m.cmdNote || '';
    const mn = modeNote(m); if (mn && m.typeId !== 'float') m.alarm = mn + ' ' + m.alarm.replace(/^(?:Opening to release|Lake below setpoint|Downstream at its limit|Head reversing|Lowering the crest|Crest holding|Drain flowing out).*?\.(?=\s|$)/, '').trim();
    // mechanical faults acting after the controller's move
    if (faultOn(m, 'Brake creep') && (m.typeId === 'vertical' || m.typeId === 'radial') && m.pos > 0) {
      const d = Math.min(m.pos, 0.08); m.pos -= d; m.creep = (m.creep || 0) + d;
      if (m.creep > 2) m.alarm += ' Brake creep: leaf drifts down without a command; the PLC keeps re-driving it. Inspect the brake.';
    }
    if (faultOn(m, 'Hydraulic leak') && m.typeId === 'crest') m.z = Math.max(T.zmin, m.z - 0.004);
    if (m.voted && m.t === fa(m) + 11) m.voteAt = m.t;
    if (m.voted) m.alarm += ' Main level sensor frozen; voting switched to the backup sensor. Control continues.';
    if (faultOn(m, 'Seal leakage') && Math.abs(m.leak || 0) > 0.005 && (m.open || 0) < 0.01) m.alarm += ' Flow past the closed gate: ' + (Math.abs(m.leak) * 1000).toFixed(0) + ' L/s. Seals need replacing.';
    m.alarm = m.alarm.trim();
    m.pos = clamp(m.pos, 0, 100); m.pen = clamp(m.pen, 0, 100);
    const I = S.inflow(m.t) * (T.inflowScale || 1), L = S.lateral(m.t), R = S.river(m.t);
    let q = gateFlow(m, h1, h2);
    if (q > 0) q = Math.min(q, m.V1 + I);
    const qp = m.pump && h1 > 0.05 ? Math.min(T.pumpQ, m.V1 + I - q) : 0;
    m.V1 += I - q - qp; m.tot.in += I; m.tot.pumped += qp; if (q < 0) m.tot.back += -q;
    if (T.dn.area !== Infinity) {
      const qo = T.recv ? T.recv.k * Math.sign(h2 - R) * Math.sqrt(Math.abs(h2 - R)) * (Math.max(h2, R) > T.recv.bed ? 1 : 0) : 0;
      const qoLim = qo > 0 ? Math.min(qo, m.V2 + q + L) : qo;
      m.V2 += q + L - qoLim; m.tot.lat += L; m.tot.out += qoLim;
      const cap2 = T.dn.top * T.dn.area; if (m.V2 > cap2) { m.tot.spill2 += m.V2 - cap2; m.V2 = cap2; }
      if (m.V2 < 0) { m.tot.out += m.V2; m.V2 = 0; }
    } else m.tot.out += q + qp; // the receiving river is an unlimited sink/source
    const cap1 = T.up.top * T.up.area; if (m.V1 > cap1) { m.tot.spill1 += m.V1 - cap1; m.V1 = cap1; }
    m.t++;
    record(m, levels(m), { q, qp });
    return m;
  }
  function record(m, lv, f) {
    const pos = m.typeId === 'crest' ? m.z : m.pos;
    m.last = { t: m.t, h1: lv.h1, h2: lv.h2, q: f.q, qp: f.qp, pos, pen: m.pen, pump: m.pump, open: m.open || 0, flapFrac: m.flapFrac || 0,
      moving: m.prevPos === undefined ? 0 : Math.sign(Math.round((pos - m.prevPos) * 1e6)), penMoving: m.prevPen === undefined ? 0 : Math.sign(Math.round((m.pen - m.prevPen) * 1e6)),
      meas: m.meas === undefined ? lv.h1 : m.meas, sensorOk: m.sensorOk !== false, target: m.target === undefined ? pos : m.target };
    if (m.t % 10 === 0) m.hist.push(m.last);
  }
  // Water balance: what came in equals what is stored, released downstream and spilled.
  function balanceError(m) {
    const T = m.T, k = m.tot;
    if (T.dn.area === Infinity) return Math.abs(m.V0.V1 + k.in - m.V1 - k.out - k.spill1); // out includes pumped
    return Math.abs(m.V0.V1 + m.V0.V2 + k.in + k.lat - m.V1 - m.V2 - k.out - k.spill1 - k.spill2);
  }

  // ---------- Mechanism and flow at the gate: forces, power and flow regime for the current state ----------
  // Illustrative component data (masses, friction, screw lead, efficiencies). Real values come from the
  // manufacturer's data sheets; these show how the quantities scale, not a design.
  const RHO = 1000, kN = v => v / 1000;
  const MECH = {
    vertical: { plateH: 2.6, mass: 1100, mu: 0.35, seal: 600, lead: 0.012, eff: 0.35 },
    float: { plateH: 2.6, mass: 1100, mu: 0.35, seal: 600, floatD: 2.6, floatH: 1.2 },
    radial: { R: 4.0, trunnionH: 2.6, mass: 4200, cgArm: 0.75, pinMu: 0.15, pinR: 0.1, seal: 1500, eff: 0.6 },
    flap: { mass: 150, maxAngle: 60, penMass: 450, mu: 0.35, pumpEff: 0.6, lift: 1.0 },
    crest: { leafL: 1.5, lever: 0.6, bore: 0.16 }
  };
  function flowAtGate(m) {
    const T = m.T, L = m.last, up = Math.max(L.h1, L.h2), dn = Math.min(L.h1, L.h2), q = Math.abs(L.q);
    const dir = L.q > 0.001 ? 'forward' : L.q < -0.001 ? 'reverse' : 'none';
    if (m.typeId === 'crest') {
      const H = Math.max(0, up - L.pos), yc = q > 0 ? Math.cbrt(Math.pow(q / T.b, 2) / G) : 0;
      return { dir, regime: q < 0.001 ? 'No flow: water below the crest' : dir === 'reverse' ? 'Reverse overflow: drain water spilling back into the lake' : dn > L.pos ? 'Submerged overflow' : 'Free overflow: the nappe springs clear of the leaf',
        head: H, depth: yc, velocity: yc > 0 ? q / (T.b * yc) : 0, froude: yc > 0 ? 1 : 0, unitQ: q / T.b, opening: H, free: dn <= L.pos };
    }
    const a = L.open, Cc = 0.61, yc = Math.min(a, up) * Cc, v = yc > 0 ? q / (T.b * yc) : 0, free = dn < a;
    return { dir, regime: q < 0.001 ? (a <= 0.001 ? 'No flow: gate closed' : 'No flow: no head across the gate') : dir === 'reverse' ? 'Reverse flow: water pushed back upstream' : free ? 'Free flow: a jet leaves the lip, then a hydraulic jump' : 'Submerged flow: tailwater covers the gate lip',
      head: up - dn, depth: yc, velocity: v, froude: yc > 0 ? v / Math.sqrt(G * yc) : 0, unitQ: q / T.b, opening: a, contraction: Cc, free };
  }
  // Net horizontal water thrust on a vertical plate whose bottom edge is at height a (positive = pushed downstream).
  const plateThrust = (h1, h2, a, b) => RHO * G * b / 2 * (Math.pow(Math.max(0, h1 - a), 2) - Math.pow(Math.max(0, h2 - a), 2));
  function mechanics(m) {
    const T = m.T, L = m.last, id = m.typeId, M = MECH[id], g = G, out = { flow: flowAtGate(m), parts: [] };
    const P = (name, value, note, state) => out.parts.push({ name, value, note, state: state || 'ok' });
    const fault = c => m.condition === c && m.t >= fa(m), power = !T.powered || !fault('Power cut'), jam = fault('Gate jam');
    const mv = L.moving > 0 ? 'Raising' : L.moving < 0 ? 'Lowering' : 'Stopped';
    if (id === 'vertical' || id === 'float') {
      const F = plateThrust(L.h1, L.h2, L.open, T.b), W = M.mass * g, fr = M.mu * Math.abs(F) + M.seal;
      const raise = W + fr, lower = W - fr, v = T.rate / 100 * T.amax;
      out.thrust = F; out.hoist = raise; out.weight = W; out.friction = fr;
      if (id === 'vertical') {
        const pw = raise * v / M.eff, rpm = v / M.lead * 60;
        P('Water thrust on the leaf', kN(Math.abs(F)).toFixed(1) + ' kN', F >= 0 ? 'Pressure difference pushing the plate onto its downstream guides' : 'Drain higher: pushing the plate upstream');
        P('Guide and seal friction', kN(fr).toFixed(1) + ' kN', 'Slide friction 0.35 × thrust plus rubber seal drag');
        P('Hoist force to raise', kN(raise).toFixed(1) + ' kN', 'Leaf weight ' + kN(W).toFixed(1) + ' kN plus friction');
        P('Force to lower', lower >= 0 ? kN(lower).toFixed(1) + ' kN held back' : kN(-lower).toFixed(1) + ' kN pushed down', lower >= 0 ? 'The leaf falls under its own weight; the screw controls the speed' : 'Friction exceeds the weight; the spindle must push the leaf down');
        P('Motor', !power ? 'No power' : jam ? 'Stalled' : mv, mv === 'Stopped' ? 'Starter open' : (pw / 1000).toFixed(2) + ' kW at the motor for ' + (v * 1000).toFixed(0) + ' mm/s travel', !power || jam ? 'bad' : 'ok');
        P('Rising spindle', mv === 'Stopped' ? '0 rpm' : rpm.toFixed(0) + ' rpm', 'Lead ' + (M.lead * 1000) + ' mm per turn; leaf lifted ' + (L.open * 1000).toFixed(0) + ' mm');
        P('Limit switches', L.pos <= 0.5 ? 'Closed switch made' : L.pos >= 99.5 ? 'Open switch made' : 'Both clear', 'End limits stop the motor and inhibit travel in that direction');
        P('Upstream level sensor', L.meas.toFixed(2) + ' m', L.sensorOk ? 'Radar above the water, on the gate datum' : 'Frozen value detected: control holding', L.sensorOk ? 'ok' : 'bad');
      } else {
        const A = Math.PI * M.floatD * M.floatD / 4, sub = clamp(L.h1 - (T.setpoint - 0.5), 0, M.floatH), B = RHO * g * A * sub, Bset = RHO * g * A * 0.5;
        out.buoyancy = B; out.balance = Bset;
        P('Float buoyancy', kN(B).toFixed(1) + ' kN', 'Float ' + M.floatD + ' m diameter, ' + sub.toFixed(2) + ' m submerged');
        P('Leaf weight', kN(W).toFixed(1) + ' kN', 'Carried by the counterweight through the chain over the pulley');
        P('Water thrust on the leaf', kN(Math.abs(F)).toFixed(1) + ' kN', 'Adds ' + kN(fr).toFixed(1) + ' kN of guide friction the float must overcome');
        P('Net lifting force', kN(B - Bset).toFixed(1) + ' kN', 'Buoyancy above the balance point at 1.5 m. About ' + (kN(fr) / kN(RHO * g * A * 0.1) / 10).toFixed(2) + ' m of rise is needed to beat guide friction (dead band)');
        P('Gate travel', jam ? 'Jammed' : mv, 'Opening ' + L.pos.toFixed(0) + '%; closed at 1.5 m, full at 2.0 m', jam ? 'bad' : 'ok');
        P('Power and sensors', 'None', 'Purely mechanical: unaffected by power cuts and sensor faults');
      }
    } else if (id === 'radial') {
      const Fh = Math.abs(plateThrust(L.h1, L.h2, L.open, T.b)), W = M.mass * g;
      const hoist = (W * M.cgArm * M.R + M.pinMu * Fh * M.pinR + M.seal * M.R) / M.R, vertEq = W + 0.35 * Fh + M.seal, v = T.rate / 100 * T.amax;
      out.thrust = Fh; out.hoist = hoist; out.vertEquiv = vertEq;
      P('Water thrust on the skin plate', kN(Fh).toFixed(1) + ' kN', 'Acts normal to the curved plate, so its line passes through the trunnion');
      P('Load on each trunnion', kN(Fh / 2).toFixed(1) + ' kN', 'Taken by anchored trunnion girders in the piers');
      P('Rope pull to raise', kN(hoist).toFixed(1) + ' kN', 'Gate weight ' + kN(W).toFixed(1) + ' kN on its arm, plus pin and seal friction');
      P('A vertical gate this size would need', kN(vertEq).toFixed(1) + ' kN', 'Why radial gates suit wide openings');
      P('Winch', !power ? 'No power' : jam ? 'Stalled' : mv, mv === 'Stopped' ? 'Brake applied' : (hoist * v / M.eff / 1000).toFixed(2) + ' kW at the motor', !power || jam ? 'bad' : 'ok');
      P('Upstream level sensor', L.meas.toFixed(2) + ' m', L.sensorOk ? 'Feeds the PI controller' : 'Frozen value detected: control holding', L.sensorOk ? 'ok' : 'bad');
    } else if (id === 'flap') {
      const dP = RHO * g * (L.h1 - L.h2), ang = L.flapFrac * M.maxAngle;
      const Fp = Math.abs(plateThrust(L.h2, L.h1, 0, T.b)), penF = M.penMass * g + M.mu * Fp;
      const head = Math.max(0.5, L.h2 - L.h1 + M.lift), hydP = RHO * g * L.qp * head;
      out.flapAngle = ang; out.pumpPower = hydP / M.pumpEff;
      P('Pressure across the flap', (dP / 1000).toFixed(2) + ' kPa', dP > 0 ? 'Drain side higher: pushes the flap open' : 'River side higher: presses the flap onto its seat');
      P('Flap angle', ang.toFixed(0) + '°', ang > 0 && m.condition !== 'Debris' ? 'Opens once the drain is ' + (T.flapHead * 100).toFixed(0) + ' cm above the river' : m.condition === 'Debris' ? 'Debris can hold it ' + (0.3 * M.maxAngle).toFixed(0) + '° open' : 'Seated and sealed', m.condition === 'Debris' ? 'bad' : 'ok');
      P('Penstock', L.pen.toFixed(0) + '% open', L.penMoving ? (L.penMoving > 0 ? 'Opening' : 'Closing') + ', ' + kN(penF).toFixed(1) + ' kN on the spindle' : 'Holding', !power || jam ? 'bad' : 'ok');
      P('Pump', L.pump ? 'Running' : power ? 'Off' : 'No power', L.pump ? (L.qp * 1000).toFixed(0) + ' L/s against ' + head.toFixed(2) + ' m, ' + (hydP / M.pumpEff / 1000).toFixed(1) + ' kW' : 'Starts at 1.4 m when the outfall is shut', !power ? 'bad' : 'ok');
      P('Non-return valve', L.pump ? 'Open' : 'Closed', 'Stops river water draining back through the rising main');
      P('Drain level sensor', L.meas.toFixed(2) + ' m', L.sensorOk ? 'Pressure transducer in the sump' : 'Frozen value detected', L.sensorOk ? 'ok' : 'bad');
    } else if (id === 'crest') {
      const hz = T.zmin - 0.2, top = Math.max(0, L.h1 - hz), d = Math.max(0, Math.min(L.h1, L.pos) - hz), e = Math.max(0, top - d);
      const F = RHO * g * T.b * (top * top - e * e) / 2;
      // centre of pressure height above the hinge, from integrating p(y) * y over the wetted leaf
      const yc = F > 0 ? RHO * g * T.b * (top * d * d / 2 - d * d * d / 3) / F : 0;
      const Mo = F * yc, cyl = Mo / M.lever, pres = cyl / (Math.PI * M.bore * M.bore / 4);
      const angle = Math.acos(clamp((L.pos - hz) / M.leafL, -1, 1)) * 180 / Math.PI;
      out.thrust = F; out.cylinder = cyl; out.moment = Mo;
      P('Water thrust on the leaf', kN(F).toFixed(1) + ' kN', 'Over the ' + d.toFixed(2) + ' m of leaf below the surface');
      P('Overturning moment at the hinge', kN(Mo).toFixed(1) + ' kN·m', 'Tends to lay the leaf flat');
      P('Hydraulic cylinder force', kN(cyl).toFixed(1) + ' kN', 'Holds the leaf on a ' + M.lever + ' m lever arm');
      P('Cylinder pressure', (pres / 1e5).toFixed(0) + ' bar', (M.bore * 1000) + ' mm bore', pres > 200e5 ? 'bad' : 'ok');
      P('Leaf angle from vertical', angle.toFixed(0) + '°', 'Crest at ' + L.pos.toFixed(2) + ' m');
      P('Power pack', !power ? 'No power' : jam ? 'Valve stuck' : mv === 'Stopped' ? 'Holding' : mv, 'Pilot check valves lock the cylinder if power is lost', !power || jam ? 'bad' : 'ok');
      P('Lake level sensor', L.meas.toFixed(2) + ' m', L.sensorOk ? 'Radar above the weir pool' : 'Frozen value detected: control holding', L.sensorOk ? 'ok' : 'bad');
    }
    return out;
  }

  // ---------- operator actions used by the control board ----------
  function setMode(m, mode) { m.mode = mode; if (mode === 'manual' && !m.manual) m.manual = { target: m.typeId === 'crest' ? (m.T.zmax - m.z) / (m.T.zmax - m.T.zmin) * 100 : m.typeId === 'flap' ? m.pen : m.pos, override: false }; }
  function command(m, target, opts) { setMode(m, 'manual'); m.manual = Object.assign({}, m.manual, { target: clamp(target, 0, 100) }, opts || {}); }
  function stopGate(m) { if (m.mode !== 'manual') setMode(m, 'manual'); m.manual.target = m.typeId === 'crest' ? (m.T.zmax - m.z) / (m.T.zmax - m.T.zmin) * 100 : m.typeId === 'flap' ? m.pen : m.pos; }
  function setFault(m, condition, at) { if (!(condition in CONDITIONS)) throw new Error('Unknown condition ' + condition); m.condition = condition; m.faultAt = at === undefined ? m.t : at; m.frozen = null; m.voted = false; m.creep = 0; }
  function repair(m) { m.condition = 'Healthy'; m.frozen = null; m.voted = false; m.creep = 0; m.sensorOk = true; }
  const opening = m => m.typeId === 'crest' ? (m.T.zmax - m.z) / (m.T.zmax - m.T.zmin) * 100 : m.typeId === 'flap' ? m.pen : m.pos;

  const api = { TYPES, SCENARIOS, CONDITIONS, FAULT_AT, MECH, create, step, levels, balanceError, orifice, weir, mechanics, flowAtGate, plateThrust, setMode, command, stopGate, setFault, repair, opening };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GateTypes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

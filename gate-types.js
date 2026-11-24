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
    'Lake already full': { note: 'The lake starts near its operating limit before a moderate storm.', lakeStart: 1.9, drainStart: 0.6, inflow: t => 0.8 + 3.5 * tri(t, 0, 2400, 7200), lateral: t => 0.3 + 0.8 * tri(t, 600, 2700, 7200), river: () => 0.7 }
  };
  const CONDITIONS = {
    'Healthy': 'All equipment works.',
    'Power cut': 'Mains and backup power lost at 10 minutes. Motorised gates hold where they are; pumps stop.',
    'Level sensor failure': 'The upstream level transmitter freezes at 10 minutes. Automatic control must detect it and hold.',
    'Gate jam': 'The gate stops moving at 10 minutes, wherever it is.',
    'Debris': 'Trash at the gate: a flap gate cannot close fully; other gates lose 40% of their flow capacity.'
  };
  const FAULT_AT = 600;

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
  const faultOn = (m, c) => m.condition === c && m.t >= FAULT_AT;
  const hasPower = m => !faultOn(m, 'Power cut');

  // The controller's view of the upstream level: frozen after a sensor failure. A frozen signal is detected
  // after 60 s of no change while flow is moving, and automatic control then holds.
  function measuredUp(m, h1) {
    if (!faultOn(m, 'Level sensor failure')) return { v: h1, ok: true };
    if (m.frozen === null) m.frozen = h1;
    return { v: m.frozen, ok: m.t < FAULT_AT + 60 };
  }

  function gateFlow(m, h1, h2) {
    const T = m.T, debris = m.condition === 'Debris';
    if (m.typeId === 'crest') return weir(h1, h2, T.b, m.z, T.cw) * (debris ? 0.6 : 1);
    if (m.typeId === 'flap') {
      const flapOpen = h1 - h2 > T.flapHead ? clamp((h1 - h2) / 0.15) : debris ? 0.3 : 0; // debris props it open 30%
      const a = T.amax * Math.min(flapOpen, m.pen / 100);
      return orifice(h1, h2, T.b, a, T.cd);
    }
    return orifice(h1, h2, T.b, (m.pos / 100) * T.amax, T.cd * (debris ? 0.6 : 1));
  }

  function control(m, h1, h2) {
    const T = m.T, power = !T.powered || hasPower(m), jam = faultOn(m, 'Gate jam');
    const sens = T.sensed ? measuredUp(m, h1) : { v: h1, ok: true };
    let msg = '';
    if (m.typeId === 'float') {
      const target = 100 * clamp((h1 - T.setpoint) / T.band);
      if (!jam) m.pos += clamp(target - m.pos, -T.rate, T.rate);
      msg = jam ? 'Float gate jammed: no automatic response. Send a crew.' : h1 > T.setpoint ? 'Float lifting the gate as the lake rises.' : 'Lake below 1.5 m: float holds the gate shut.';
      return msg;
    }
    if (!power) msg = 'Power cut: motorised gate holding position. ';
    if (!sens.ok) msg += 'Upstream sensor frozen: automatic control holding. ';
    if (jam) msg += 'Gate jammed: travel stopped. ';
    const canMove = power && sens.ok && !jam;

    if (m.typeId === 'flap') {
      const reverse = h2 > sens.v;
      if (canMove) m.pen += clamp((reverse ? 0 : 100) - m.pen, -T.rate, T.rate);
      const outfallShut = h2 >= h1 - T.flapHead || m.pen < 5;
      if (power) { if (outfallShut && h1 > T.pumpOn) m.pump = true; if (h1 < T.pumpOff || !outfallShut) m.pump = false; } else m.pump = false;
      if (!msg) msg = reverse ? 'River higher than the drain: flap shut, penstock closing' + (m.pump ? ', pump running.' : '.') : 'Drain flowing out through the flap.';
      else if (!power && h2 > h1) msg += 'Pump stopped: trapped water is rising.';
      return msg.trim();
    }
    if (m.typeId === 'crest') {
      let zt = T.setpoint;
      if (sens.v > T.setpoint) zt = T.setpoint - 4 * (sens.v - T.setpoint);
      if (h2 >= T.dsLimit || h2 > sens.v - 0.02) zt = T.zmax; // also block reverse flow into the lake
      zt = clamp(zt, T.zmin, T.zmax);
      if (canMove) m.z += clamp(zt - m.z, -T.zrate, T.zrate);
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
    if (canMove) m.pos += clamp(target - m.pos, -T.rate, T.rate);
    if (!msg) msg = closeReq ? (h2 >= T.dsLimit ? 'Downstream at its limit: gate closing.' : 'Head reversing: gate closing to stop backflow.') : target > 0 ? 'Opening to release the rise above 1.5 m.' : 'Lake below setpoint: gate closed.';
    return msg.trim();
  }

  function step(m) {
    const T = m.T, S = m.S;
    let { h1, h2 } = levels(m);
    m.alarm = control(m, h1, h2);
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
    m.last = { t: m.t, h1: lv.h1, h2: lv.h2, q: f.q, qp: f.qp, pos: m.typeId === 'crest' ? m.z : m.pos, pen: m.pen, pump: m.pump };
    if (m.t % 10 === 0) m.hist.push(m.last);
  }
  // Water balance: what came in equals what is stored, released downstream and spilled.
  function balanceError(m) {
    const T = m.T, k = m.tot;
    if (T.dn.area === Infinity) return Math.abs(m.V0.V1 + k.in - m.V1 - k.out - k.spill1); // out includes pumped
    return Math.abs(m.V0.V1 + m.V0.V2 + k.in + k.lat - m.V1 - m.V2 - k.out - k.spill1 - k.spill2);
  }

  const api = { TYPES, SCENARIOS, CONDITIONS, FAULT_AT, create, step, levels, balanceError, orifice, weir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GateTypes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

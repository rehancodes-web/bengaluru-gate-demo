const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const elements = {};
function element(id) {
  return elements[id] ??= { value: '', options: [], add(option) {
    this.options.push(option);
    if (this.options.length === 1) this.value = option.value;
  }, setAttribute() {}, set selectedIndex(index) {
    if (id === 'fault' && index === 0) this.value = 'Healthy';
  }};
}
const ctx = vm.createContext({document: {getElementById: element}, Option: function(value){this.value=value}, setInterval, clearInterval, URL, Blob});
const run = expression => vm.runInContext(expression, ctx);
run(fs.readFileSync(path.join(__dirname,'controller.js'),'utf8'));
const set = (id, v) => { element(id).value = v; };
let checks = 0; const ok = (cond, msg) => { assert(cond, msg); checks++; };

// Worked example: about 42% opening, first second of travel is 2%.
set('scenario','Lake rising'); run('reset()');
ok(Math.abs(run('calc().target') - 42) < 1, 'worked example near 42%');
run('tick()'); ok(run('pos') === 2, 'travel limit 2 %/s'); ok(run('samples.length') === 2, 'sample logging');

// Stage-storage curves invert exactly.
for (const h of [0.3, 1.0, 1.55, 1.9, 2.2]) ok(Math.abs(run(`levelAt(curves.lake, volAt(curves.lake, ${h}))`) - h) < 1e-6, 'lake curve inverts at ' + h);
ok(run('areaAt(curves.lake, 2.0) > areaAt(curves.lake, 1.0)'), 'lake widens as it fills');

// Gate hydraulics: free flow, submerged flow, continuity, reverse flow.
ok(Math.abs(run('gateFlow(1.5, 0.1, 0.4)') - 0.62*2*0.4*Math.sqrt(2*9.81*(1.5-0.2))) < 1e-9, 'free flow with low tailwater');
ok(Math.abs(run('gateFlow(1.85, 1.10, 0.5)') - 0.62*2*0.5*Math.sqrt(2*9.81*0.75)) < 1e-9, 'submerged flow');
let worst = 0; for (let dn = 0.2; dn < 1.0; dn += 0.002) worst = Math.max(worst, Math.abs(run(`gateFlow(1.6, ${dn+0.002}, 0.4) - gateFlow(1.6, ${dn}, 0.4)`)));
ok(worst < 0.02, 'smooth free/submerged transition');
ok(run('gateFlow(1.0, 1.4, 0.3) < 0'), 'reverse flow when the drain is higher');

// Site parameters: import, validation, effect on hydraulics and reset.
run(`importSiteText(${JSON.stringify('width,3.0\nmaxLift,0.8')})`);
ok(run('GATE_WIDTH') === 3 && run('MAX_LIFT') === 0.8 && run("siteSource") === 'imported', 'site parameters imported');
ok(Math.abs(run('gateFlow(1.5, 0.1, 0.4)') - 0.62*3*0.4*Math.sqrt(2*9.81*1.3)) < 1e-9, 'gate width feeds the discharge equation');
for (const bad of ['width,-1', 'setpoint,1.7', 'hhLake,2.5', 'widht,2', 'crest,abc'])
  ok((() => { try { run(`importSiteText(${JSON.stringify(bad)})`); return false; } catch { return true; } })(), 'rejects bad site input ' + bad);
ok(run('GATE_WIDTH') === 3, 'rejected input leaves the previous parameters');
run('resetSite()'); ok(run('GATE_WIDTH') === 2 && run('CREST') === 2.2 && run("siteSource") === 'illustrative', 'site reset to defaults');

// Every scenario x every equipment condition x both controllers: bounds and exact water balance.
const faults = ['Healthy','Invalid stage sensor','Gate jam','Loss of telemetry','Local stop','Lake sensor drift','Partial jam'];
let runs = 0;
for (const mode of ['Rule-based','PI (level setpoint)']) for (const scenario of run('Object.keys(cases)')) for (const fault of faults) {
  set('mode', mode); set('rain', ''); set('scenario', scenario); run('reset()'); set('fault', fault);
  const initial = run('Vu+Vd+roadVolume');
  let net = 0;
  for (let i=0;i<180;i++) {
    net += run('calc().I + (+$("lateral").value) + streetFlow().runoff - calc().drain');
    run('tick()');
    assert(run('pos>=0 && pos<=100 && Number.isFinite(u+d+us+ds+roadVolume)'));
  }
  assert(Math.abs(run('Vu+Vd+roadVolume+us+ds')-initial-net) < 1e-6, `water balance ${mode}/${scenario}/${fault}`);
  assert.equal(run('samples.length'), 181);
  if (['Gate jam','Local stop','Invalid stage sensor'].includes(fault)) assert.equal(run('pos'), 0);
  runs++;
}
checks += runs;
set('mode','');

// Healthy runs never raise a false sensor alarm; drift is caught.
set('scenario','Lake rising'); run('reset()'); for (let i=0;i<300;i++) run('tick()'); ok(run('!sensorFault'), 'no false drift alarm');
set('scenario','Lake rising'); run('reset()'); set('fault','Lake sensor drift'); for (let i=0;i<60;i++) run('tick()');
ok(run('sensorFault && calc().hold'), 'sensor drift detected and movement suspended');

// Partial jam: slower travel and an alarm, gate still moves.
set('scenario','Lake rising'); run('reset()'); set('fault','Partial jam'); for (let i=0;i<15;i++) run('tick()');
ok(run('jamAlarm && pos > 0 && pos < 15'), 'partial jam detected');

// Actuator slows above 1 m differential head and trips when opening against > 1.5 m.
set('scenario','Lake rising'); run('reset()'); run('u=2.15; d=0.6; Vu=volAt(curves.lake,u); Vd=volAt(curves.drain,d); estVu=Vu');
ok(run('actuatorRate()') < 2, 'actuator slows under high head');
run('u=2.2; d=0.45; Vu=volAt(curves.lake,u); Vd=volAt(curves.drain,d); estVu=Vu'); run('tick()'); // stage below 0.5 m suspends, no trip
run('reset(); u=2.2; d=0.5001; Vu=volAt(curves.lake,u); Vd=volAt(curves.drain,d); estVu=Vu'); run('tick()');
ok(run('tripped && pos === 0'), 'torque trip holds the gate');

// PI controller settles the lake toward the setpoint without exceeding the bounds.
set('mode','PI (level setpoint)'); set('scenario','Lake rising'); run('reset()'); for (let i=0;i<1200;i++) run('tick()');
ok(run('Math.abs(u-1.55) < 0.15'), 'PI controller approaches setpoint'); set('mode','');

// Rainfall series.
set('scenario','Ordinary rain'); run('reset()'); set('rain','Design storm');
ok(Math.abs(run('inflowAt(600)') - (0.15 + 3)) < 1e-9 && Math.abs(run('inflowAt(0)') - 0.15) < 1e-9, 'design storm hyetograph');
set('rain','Cloudburst burst'); ok(run('inflowAt(300)') > 5 && run('inflowAt(60)') < 0.2, 'cloudburst burst');
run('importRain("time_s,inflow\\n0,0.5\\n100,2.5\\n200,0.5")'); set('rain','Imported series');
ok(Math.abs(run('inflowAt(50)') - 1.5) < 1e-9, 'imported rainfall interpolates'); set('rain','');

// Site data import.
run('importCurve("lake", "stage,area\\n0,200\\n2.2,900")'); ok(run('dataSource.lake') === 'imported' && Math.abs(run('areaAt(curves.lake,1.1)') - 550) < 1e-9, 'lake curve import');
assert.throws(() => run('importCurve("drain", "1,2")')); checks++;
run('resetCurves()'); ok(run('dataSource.lake') === 'illustrative', 'curves reset to illustrative');

// Street storage: no depth cap, grates and pumps behave.
const A0 = 400; ok(Math.abs(run(`roadDepth(${A0}, roadVol(${A0}, 0.9))`) - 0.9) < 1e-9, 'road depth inverts beyond 50 cm');
for(const [name,expected] of [['Underpass pump outage',1],['Underpass pump restored',-1],['Blocked roadside grates',1],['Reopened roadside grates',-1]]){
  set('scenario',name); set('fault','Healthy'); run('reset()'); const initial=run('roadVolume'); run('tick()'); ok(Math.sign(run('roadVolume')-initial)===expected, name);
}
set('scenario','Drain surcharge into street'); run('reset()'); ok(run('streetFlow().exchange<0'), 'drain surcharges into street');
ok(fs.readFileSync(path.join(__dirname,'index.html'),'utf8').includes('src="controller.js"'), 'index loads controller');

// ---------- Gate-type models (gate-types.js) ----------
const GT = require('./gate-types.js');
let typeRuns = 0;
for (const id of Object.keys(GT.TYPES)) for (const sc of Object.keys(GT.SCENARIOS)) for (const c of Object.keys(GT.CONDITIONS)) {
  const m = GT.create(id, sc, c); let bad = false;
  for (let i = 0; i < 7200; i++) { GT.step(m); const L = m.last; if (!(L.h1 >= 0 && L.h1 <= m.T.up.top + 1e-9 && Number.isFinite(L.q))) bad = true; if (m.typeId !== 'crest' && (L.pos < 0 || L.pos > 100)) bad = true; }
  ok(!bad, `${id} / ${sc} / ${c}: levels and travel in range`);
  ok(GT.balanceError(m) < 1e-4, `${id} / ${sc} / ${c}: water balance`);
  typeRuns++;
}
const runTo = (id, sc, c) => { const m = GT.create(id, sc, c); for (let i = 0; i < 7200; i++) GT.step(m); return m; };
ok(Math.abs(GT.orifice(1.5, 0.1, 2, 0.4, 0.62) - 0.62*2*0.4*Math.sqrt(2*9.81*1.3)) < 1e-9, 'gate-type orifice matches the main model');
ok(Math.abs(GT.weir(1.2, 0, 8, 1.0, 1.8) - 1.8*8*Math.pow(0.2,1.5)) < 1e-9, 'free weir flow over a crest gate');
ok(GT.weir(1.0, 1.3, 8, 1.0, 1.8) < 0, 'weir reverses when the downstream side is higher');
ok(runTo('float','Monsoon storm','Power cut').tot.spill1 === runTo('float','Monsoon storm','Healthy').tot.spill1 && runTo('float','Cloudburst','Power cut').last.pos === runTo('float','Cloudburst','Healthy').last.pos, 'float gate unaffected by a power cut');
ok(runTo('vertical','Cloudburst','Power cut').last.pos === runTo('vertical','Cloudburst','Power cut').hist[60].pos, 'motorised gate holds position after a power cut');
ok(runTo('flap','High river / backflow','Healthy').tot.back < 1, 'healthy flap gate stops backflow');
ok(runTo('flap','High river / backflow','Debris').tot.back > 1, 'debris-propped flap lets backflow through');
ok(runTo('flap','Monsoon storm','Power cut').tot.spill1 > runTo('flap','Monsoon storm','Healthy').tot.spill1, 'losing the pump floods the street drain');
ok(runTo('float','High river / backflow','Healthy').tot.back > runTo('vertical','High river / backflow','Healthy').tot.back, 'float gate cannot react to downstream backflow; motorised gate closes');
ok(runTo('crest','High river / backflow','Healthy').tot.back < runTo('crest','High river / backflow','Gate jam').tot.back, 'crest gate rises to block reverse flow');
ok(fs.readFileSync(path.join(__dirname,'gate-types.html'),'utf8').includes('src="gate-types.js"'), 'gate types page loads its model');

// Failure cases added from FAILURE_ANALYSIS.md
ok(runTo('vertical','High river / backflow','Seal leakage').tot.back > runTo('vertical','High river / backflow','Healthy').tot.back + 10, 'worn seals let backflow past a closed gate');
{ const a = runTo('vertical','Cloudburst','Sensor failure, backup sensor'), h = runTo('vertical','Cloudburst','Healthy'), f = runTo('vertical','Cloudburst','Level sensor failure');
  const peak = m => Math.max(...m.hist.map(p => p.h1));
  ok(Math.abs(peak(a) - peak(h)) < 0.01 && peak(f) > peak(a) + 0.05, 'backup sensor keeps control running; a single failed sensor forces a hold');
  ok(/voting switched to the backup/.test(a.alarm), 'voting switch reported'); }
ok(runTo('flap','Monsoon storm','Power cut, backup starts').tot.spill1 < runTo('flap','Monsoon storm','Power cut').tot.spill1, 'backup generator that starts prevents street-drain flooding');
{ const c = runTo('vertical','Cloudburst','Brake creep'); ok(/Brake creep/.test(c.alarm), 'brake creep detected and reported');
  ok(Math.abs(Math.max(...c.hist.map(p => p.h1)) - Math.max(...runTo('vertical','Cloudburst','Healthy').hist.map(p => p.h1))) < 0.05, 'PLC corrects brake creep so levels stay close to healthy'); }
{ const leak = runTo('crest','High river / backflow','Hydraulic leak'); ok(leak.tot.back > runTo('crest','High river / backflow','Healthy').tot.back + 1000 && leak.z <= GT.TYPES.crest.zmin + 1e-9, 'crest cylinder leak drops the leaf and lets backflow into the lake'); }
ok(Math.max(...runTo('vertical','Upstream lake releases at the peak','Healthy').hist.map(p => p.h2)) > Math.max(...runTo('vertical','Monsoon storm','Healthy').hist.map(p => p.h2)) + 0.2, 'uncoordinated upstream release raises the downstream drain');

// Assemblies and materials (gate-parts.js)
const GP = require('./gate-detail.js');
ok(Object.keys(GT.TYPES).every(id => GP.TYPES[id]) && GP.TYPES.bench, 'an assembly for every gate type plus the bench prototype');
for (const [id, T] of Object.entries(GP.TYPES)) {
  ok(T.parts.length >= 10 && T.steps.length >= 5, id + ': parts list and assembly sequence');
  for (const p of T.parts) ok(GP.MATERIALS[p.mat] && p.spec && p.prot && p.role && p.maint && p.qty && p.g.length > 0, id + ' / ' + p.name + ': material, specification, protection, role, maintenance and geometry');
}
{ const h = fs.readFileSync(path.join(__dirname,'gate-assembly.html'),'utf8'); ok(h.includes('src="gate-parts.js"') && h.includes('src="gate-detail.js"'), 'assembly page loads parts and detail'); }
{ const ids = Object.values(GP.TYPES).flatMap(T => T.parts.map(p => p.id)); ok(Object.values(GP.TYPES).every(T => new Set(T.parts.map(p => p.id)).size === T.parts.length), 'part ids unique within each assembly'); }
ok(['gear','ring','worm'].every(t => Object.values(GP.TYPES).some(T => T.parts.some(p => p.g.some(g => g.t === t[0])))), 'gears, bearing rings and worms are modelled');
for (const f of ['index.html','gate-types.html','gate-assembly.html','bench.html']) ok(fs.readFileSync(path.join(__dirname,f),'utf8').includes('site-nav.js'), f + ' has the site navigation');
ok(/url=gate-assembly.html/.test(fs.readFileSync(path.join(__dirname,'mechanism.html'),'utf8')), 'old assembly page redirects to the new one');

// Manual control, interlocks, override, local mode, faults and repairs (used by the control board)
{ const step = (m, n) => { for (let i = 0; i < n; i++) GT.step(m); return m; };
  const a = step(GT.create('vertical', 'Monsoon storm', 'Healthy'), 100); GT.command(a, 60); step(a, 40);
  ok(Math.abs(a.pos - 60) < 0.01 && a.mode === 'manual', 'manual command moves the gate to the operator target');
  ok(a.pos - 0 <= 40 * GT.TYPES.vertical.rate + 1e-9, 'manual travel respects the rate limit');
  const b = step(GT.create('vertical', 'High river / backflow', 'Healthy'), 3500); const p0 = b.pos; GT.command(b, 100); step(b, 30);
  ok(b.pos <= p0 + 1e-9 && /interlock/i.test(b.alarm), 'interlock blocks opening into a high downstream drain');
  GT.command(b, 100, { override: true }); step(b, 30); ok(b.pos > p0 + 10, 'operator override lets the gate open');
  GT.command(b, 0); step(b, 200); ok(b.pos === 0, 'closing is never blocked by the interlock');
  const c = step(GT.create('vertical', 'Cloudburst', 'Healthy'), 50); GT.setMode(c, 'local'); const pl = c.pos; step(c, 600); ok(c.pos === pl, 'local mode ignores the remote controller');
  const d = GT.create('vertical', 'Cloudburst', 'Healthy'); GT.setFault(d, 'Gate jam', 0); GT.command(d, 50); step(d, 60); ok(d.pos === 0, 'a jammed gate does not move on command');
  GT.repair(d); step(d, 60); ok(d.pos > 20, 'repair restores movement');
  const e = GT.create('vertical', 'Cloudburst', 'Healthy'); GT.setFault(e, 'Power cut', 0); GT.command(e, 50); step(e, 60); ok(e.pos === 0, 'no power, no movement on command');
  const f = step(GT.create('crest', 'Lake already full', 'Healthy'), 10); GT.command(f, 100); step(f, 400); ok(Math.abs(f.z - GT.TYPES.crest.zmin) < 0.02 || /interlock/i.test(f.alarm), 'crest manual 100% lowers the crest (unless interlocked)');
  const g = step(GT.create('flap', 'Monsoon storm', 'Healthy'), 10); GT.command(g, 0, { pump: true }); step(g, 100); ok(g.pen === 0, 'flap penstock closes on command');
  ok(Math.abs(GT.opening(a) - 60) < 0.01, 'opening helper reports percent');
  for (const id of Object.keys(GT.TYPES)) for (const c2 of ['Healthy', 'Power cut', 'Gate jam']) { const m2 = GT.create(id, 'Cloudburst', c2); GT.command(m2, 70); step(m2, 7200); ok(GT.balanceError(m2) < 1e-4, id + ' / manual 70% / ' + c2 + ': water balance'); }
}
// Control board: data and page
{ const W = require('./bengaluru-water-data.js');
  ok(W.lakes.length === 205 && W.lost.length === 111 && W.boundary.length > 1000 && W.streams.length > 1000, 'water map data: 205 lakes, 111 lost, boundary and streams');
  ok(W.lakes.every(l => l.n && l.a > 0 && l.b && l.b.length === 4 && l.d), 'every lake has name, area, bounds and outline');
  const h = fs.readFileSync(path.join(__dirname, 'control.html'), 'utf8');
  ok(['gate-types.js', 'bengaluru-water-data.js', 'control.js', 'site-nav.js'].every(s => h.includes('src="' + s + '"')), 'control board loads its scripts');
  ok(/NOT CONNECTED TO FIELD EQUIPMENT/.test(h), 'control board states it is a simulator');
  new vm.Script(fs.readFileSync(path.join(__dirname, 'control.js'), 'utf8')); ok(true, 'control.js parses');
}

// Mechanism and flow-at-gate calculations
ok(Math.abs(GT.plateThrust(1.0, 0, 0, 2) - 1000*9.81*2*0.5) < 1e-6, 'hydrostatic thrust: 1 m of water on a 2 m plate is 9.81 kN');
ok(GT.plateThrust(1.0, 1.0, 0, 2) === 0, 'no net thrust with equal levels');
const at = (id, sc, c, n) => { const m = GT.create(id, sc, c); for (let i = 0; i < n; i++) GT.step(m); return m; };
for (const id of Object.keys(GT.TYPES)) for (const sc of Object.keys(GT.SCENARIOS)) {
  const m = at(id, sc, 'Healthy', 1800), r = GT.mechanics(m);
  ok(r.parts.length >= 5 && r.parts.every(p => p.name && p.value && !/NaN|undefined|Infinity/.test(p.value + p.note)), `${id} / ${sc}: mechanism values all finite`);
  ok(Number.isFinite(r.flow.velocity) && r.flow.velocity >= 0 && /flow|overflow/i.test(r.flow.regime), `${id} / ${sc}: flow regime and velocity`);
}
{ const v = GT.mechanics(at('vertical','Cloudburst','Healthy',1500)), rd = GT.mechanics(at('radial','Cloudburst','Healthy',1500));
  ok(v.hoist > v.weight, 'vertical hoist must lift weight plus friction');
  ok(rd.hoist < rd.vertEquiv, 'radial gate needs less hoist force than an equal vertical gate');
  const f = GT.flowAtGate(at('vertical','Cloudburst','Healthy',1500));
  ok(Math.abs(f.velocity * 2 * f.depth - Math.abs(at('vertical','Cloudburst','Healthy',1500).last.q)) < 1e-6, 'continuity at the vena contracta: Q = v × b × 0.61a'); }
{ const fl = at('flap','High river / backflow','Healthy',3600), r = GT.mechanics(fl);
  ok(fl.last.h2 > fl.last.h1 && r.flapAngle === 0, 'flap seated when the river is higher'); }
{ const cr = GT.mechanics(at('crest','Lake already full','Healthy',600)); ok(cr.cylinder > 0 && cr.moment > 0, 'crest gate cylinder resists the water moment'); }
{ const fd = at('float','Cloudburst','Healthy',1500), r = GT.mechanics(fd); ok(r.buoyancy > r.balance, 'float buoyancy above the balance point when the lake is above 1.5 m'); }

console.log(`PASS: ${checks} checks, including ${runs} scenario/fault/controller runs and ${typeRuns} gate-type runs with exact water balance.`);

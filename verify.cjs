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

console.log(`PASS: ${checks} checks, including ${runs} scenario/fault/controller runs with exact water balance.`);

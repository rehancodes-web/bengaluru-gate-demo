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
const ctx = vm.createContext({document: {getElementById: element}, Option: function(value){this.value=value}, setInterval, clearInterval});
const run = expression => vm.runInContext(expression, ctx);
run(fs.readFileSync(path.join(__dirname,'controller.js'),'utf8'));
assert(Math.abs(run('calc().target') - 42) < 0.2);
run('tick()');
assert.equal(run('pos'),2);
assert.equal(run('samples.length'),2);
for (const scenario of run('Object.keys(cases)')) {
  for (const fault of ['Healthy','Invalid stage sensor','Gate jam','Loss of telemetry','Local stop']) {
    element('scenario').value = scenario;
    run('reset()');
    element('fault').value = fault;
    const initial = run('500*u+400*d');
    let net = 0;
    for (let i=0;i<180;i++) {
      net += run('calc().I + calc().L - calc().drain');
      run('tick()');
      assert(run('pos>=0 && pos<=100 && Number.isFinite(u+d+us+ds)'));
    }
    assert(Math.abs(run('500*u+400*d+us+ds')-initial-net)<1e-7);
    assert.equal(run('samples.length'),181);
    if (['Gate jam','Local stop','Invalid stage sensor'].includes(fault)) assert.equal(run('pos'),0);
  }
}
assert(fs.readFileSync(path.join(__dirname,'index.html'),'utf8').includes('src="controller.js"'));
console.log('PASS: opening example, travel limit, 30 independent scenario/fault runs, mass balance and sample logging.');

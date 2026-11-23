
const $=id=>document.getElementById(id),cases={'Lake rising':[1.85,1.10,.50,.10],'Ordinary rain':[1.35,1,.15,.10],'Cloudburst':[2.05,1.25,4.5,.5],'High downstream / backflow':[1.65,1.95,1,2],'Blocked outlet':[1.9,1.58,1.5,1.1],'Both sides near overflow':[2.18,2.17,4.5,3]};for(const name of Object.keys(cases))$('scenario').add(new Option(name));let u,d,t,pos,active,us,ds,timer;
function calc(){let I=+$('inflow').value,L=+$('lateral').value,F=$('fault').value,H=u-d,drain=1.2*Math.max(d-.6,0)*($('scenario').value==='Blocked outlet'?.15:1),full=.62*Math.sqrt(19.62*Math.abs(H)),need=Math.max(0,I+500*(u-1.55)/300),room=Math.max(0,drain-L+400*(1.80-d)/120);active=active?u>1.55:u>=1.60;let target=0,msg='Below flood detection level',hold=false;if(active){target=Math.min(100,100*Math.min(need,room)/Math.max(.00001,full));msg=room<need?'Release limited by downstream allowance':'Release calculated from inflow and lake storage';}if(d>=1.80||H<=.05){target=0;msg='Closure requested: high receiving stage or insufficient forward head';}if(Math.min(u,d)<.5||F==='Invalid stage sensor'||F==='Local stop'){hold=true;msg='Automatic movement suspended. Local operator review required.'}if(F==='Gate jam'){hold=true;msg='Actuator jam simulated: actual travel held. Dispatch operator.'}if(F==='Loss of telemetry')msg+=' · link offline, local logic active';if(u>=2.1&&d>=1.8)msg+=' · HIGH WATER ON BOTH SIDES';return {target,hold,msg,drain,I,L,q:Math.min(u,d)<.5?0:Math.sign(H)*full*pos/100}}
function tick(){let a=calc();if(!a.hold)pos+=Math.max(-2,Math.min(2,a.target-pos));a=calc();u+=(a.I-a.q)/500;d+=(a.q+a.L-a.drain)/400;us+=Math.max(0,u-2.2)*500;ds+=Math.max(0,d-2.2)*400;u=Math.min(2.2,u);d=Math.min(2.2,d);t++;recordSample();draw()}
function draw(){let a=calc();for(const [id,v] of [['uw',u],['dw',d]]){let h=Math.max(0,v*75);$(id).setAttribute('y',248-h);$(id).setAttribute('height',h)}let y=81-pos*.375;$('plate').setAttribute('y',y);$('stem').setAttribute('d','M449 41V'+y);$('ut').textContent='Lake '+u.toFixed(3)+' m';$('dt').textContent='Drain '+d.toFixed(3)+' m';$('ival').value=a.I.toFixed(2)+' m³/s';$('lval').value=a.L.toFixed(2)+' m³/s';$('read').textContent='Target '+(a.hold?'suspended':a.target.toFixed(0)+'%')+'   ·   Actual '+pos.toFixed(0)+'%   ·   Lift '+(pos*.005).toFixed(3)+' m';$('reason').textContent=a.msg;$('vol').textContent='Time '+t+' s   ·   Signed gate flow '+a.q.toFixed(2)+' m³/s   ·   Lake spill '+us.toFixed(1)+' m³   ·   Downstream spill '+ds.toFixed(1)+' m³';}
function stop(){clearInterval(timer);timer=null;$('run').textContent='Run'}function reset(){stop();let c=cases[$('scenario').value];[u,d]=c;$('inflow').value=c[2];$('lateral').value=c[3];pos=t=us=ds=0;active=false;$('fault').selectedIndex=0;samples=[];recordSample();draw()}$('scenario').onchange=reset;$('reset').onclick=reset;$('step').onclick=()=>{stop();tick()};$('run').onclick=()=>{if(timer)stop();else{timer=setInterval(tick,100);$('run').textContent='Pause'}};for(let id of ['inflow','lateral','fault'])$(id).oninput=draw;
let samples=[];
const columns=['scenario','condition','time_s','lake_m','drain_m','inflow_m3_s','lateral_m3_s','target_pct','actual_pct','signed_flow_m3_s','lake_spill_m3','drain_spill_m3','decision'];
function recordSample(){
  const a=calc();
  samples.push([$('scenario').value,$('fault').value,t,u,d,a.I,a.L,a.hold?'':a.target,pos,a.q,us,ds,a.msg]);
}
function exportLog(){
  const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
  const csv=[columns,...samples].map(row=>row.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='gate-run.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('download').onclick=exportLog;

reset();

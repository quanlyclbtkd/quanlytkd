import fs from 'node:fs';
import path from 'node:path';
import {createHarness,flush,deferred} from './auth-harness.mjs';
const root=path.resolve(process.argv[2]||process.cwd());
const output=path.resolve(process.argv[3]||'evidence/AUTH_STARTUP_R1A/controls.json');
const checks=[];
const check=(name,ok)=>checks.push({name,status:ok?'PASS':'FAIL'});

for(const [name,setup] of [
  ['missing users document',h=>h.docs.delete('users/'+h.A.uid)],
  ['disabled users document',h=>h.docs.get('users/'+h.A.uid).status='disabled'],
  ['missing club ID',h=>h.docs.get('users/'+h.A.uid).clubId=''],
]) {
  const h=createHarness(root);setup(h);await h.emit(h.A);await flush();
  const s=h.state();
  check(name+': current failure still signs out the failing user',h.events.some(e=>e.type==='signOut'&&e.uid===h.A.uid));
  check(name+': no verified authority or protected shell',!s.verified.ready&&!s.mainVisible);
  check(name+': inline error is retained',!!s.loginError);
  check(name+': zero business listeners',s.activeListeners.length===0);
}
{
  const h=createHarness(root);h.docs.get('users/'+h.A.uid).status='locked';h.control.signOutFailure=true;
  await h.emit(h.A);await flush();
  check('genuine signOut failure retains current-session error',!!h.state().loginError&&!h.state().verified.ready);
}
for(const fail of [false,true]) {
  const h=createHarness(root),d=h.delay('users/'+h.A.uid);h.emit(h.A);await flush();h.auth.currentUser=h.B;
  const barrier=h.events.length;if(fail)d.reject();else d.resolve();await flush();
  check('Firebase UID drift before next observer dispatch: '+(fail?'error':'success')+' has no stale effects',h.events.slice(barrier).every(e=>!['store-set','signOut','write','listener-mount','dom-text'].includes(e.type)));
}
{
  const h=createHarness(root);const hints=deferred();h.context.navigator.userAgentData={getHighEntropyValues:()=>hints.promise};
  let complete=false;h.emit(h.A).then(()=>{complete=true});await flush();
  check('login history remains detached from usable shell',complete&&h.state().mainVisible&&h.writes.length===0);
  hints.resolve({model:'Synthetic'});await flush();
  check('current detached login history can complete',h.writes.length===1);
}
{
  const h=createHarness(root,{coach:true});await h.emit(h.A);
  const delay=h.delay('users/'+h.A.uid);const selecting=h.window.selectCoachBranch('CS1');await flush();
  h.auth.currentUser=h.B;const barrier=h.events.length;delay.resolve();const result=await selecting;
  check('Coach selection checks current Firebase UID after its await',result.reason==='attendance/stale-branch-selection');
  check('stale Coach selection emits no continuation effects',h.events.slice(barrier).every(e=>!['store-set','signOut','write','listener-mount','dom-text','toast'].includes(e.type)));
}
{
  const h=createHarness(root);await h.emit(h.A);await h.emit(null);const s=h.state();
  check('logout clears tenant refs',!h.window.__store.colRef&&!h.window.__store.profRef&&!h.window.__store.invRef);
  check('logout removes all listeners and protected DOM',!s.mainVisible&&!s.visibleA&&s.activeListeners.length===0);
}

const result={kind:'EXACT_SOURCE_VM_CONTROL_CASES',productionNetworkAccess:0,total:checks.length,passed:checks.filter(c=>c.status==='PASS').length,checks};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({total:result.total,passed:result.passed,failed:checks.filter(x=>x.status==='FAIL')},null,2));
if(result.passed!==result.total)process.exitCode=1;

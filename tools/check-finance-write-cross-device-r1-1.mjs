import fs from 'node:fs';
let fail=0; const results=[];
function record(name,open,detail){results.push({name,classification:open?'OPEN':'CLOSED',...detail});console.log(`${open?'⚠️':'✅'} ${name}: ${open?'OPEN':'CLOSED'}`);}
const svc=fs.readFileSync('js/services/finance.service.js','utf8');
const boundary=fs.readFileSync('js/core/tuitionCommandBoundary.js','utf8');
const finance=fs.readFileSync('js/modules/finance.js','utf8');
// Independent-runtime model: both clients complete the same negative read before either commits.
function independentCollectRace(kind){let server=[];const observe=()=>server.slice();const decide=rows=>rows.length===0?'VERIFIED_UNPAID':'PAID';const a=decide(observe()),b=decide(observe());let writes=0;if(a==='VERIFIED_UNPAID'){server.push({id:'A',kind});writes++;}if(b==='VERIFIED_UNPAID'){server.push({id:'B',kind});writes++;}return {a,b,writes,duplicate:writes===2};}
let r=independentCollectRace('tuition');record('CLIENT_A_B_SAME_TUITION_MONTH',r.duplicate,{decisions:[r.a,r.b],writes:r.writes,reason:'Both independent clients can obtain complete negative evidence before either commit; no cross-device uniqueness marker/transaction serializes the subsequent writes.'});
r=independentCollectRace('exam');record('CLIENT_A_B_SAME_EXAM_FEE',r.duplicate,{decisions:[r.a,r.b],writes:r.writes,reason:'Same read-then-write window exists for exam payment.'});
// Delete/create ordering: A verifies no replacement, B then creates one, A applies profile regression.
let server=[{id:'tx-old',month:'2026-09'}];server=server.filter(x=>x.id!=='tx-old');const aEvidence=server.slice();const aPlansRemoval=aEvidence.length===0;server.push({id:'tx-new',month:'2026-09'});let profilePaid=true;if(aPlansRemoval)profilePaid=false;record('CLIENT_A_DELETE_WHILE_B_CREATES_REPLACEMENT',server.length===1 && profilePaid===false,{remainingServerPayments:server.length,profilePaidAfterAReconcile:profilePaid,reason:'A can verify absence before B replacement commit, then regress profile after B writes; context freshness does not serialize independent devices.'});
const localSingleFlight=/const\s+_completeEvidenceFlights\s*=\s*new Map/.test(svc);
const hasNewUniqueMarker=/unique.{0,20}(payment|tuition|exam)|payment.{0,20}lock|tuition.{0,20}lock|exam.{0,20}lock/i.test(svc+boundary+finance);
const relevantRunTx=(svc+boundary+finance).match(/runTransaction\s*\(/g)?.length||0;
console.log(JSON.stringify({localSingleFlight,hasNewUniqueMarker,relevantRunTransactionCallsites:relevantRunTx,results},null,2));
if(!results.every(x=>x.classification==='OPEN'))fail++;
if(!localSingleFlight)fail++;
if(hasNewUniqueMarker)fail++;
process.exit(fail?1:0);

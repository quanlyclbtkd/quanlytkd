// Native IndexedDB negative controls. Every mutation must break a real invariant.
import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/../package.json'),pw=require('playwright');
const root=process.cwd(),out=path.resolve(process.env.V11_JOURNAL_OUTPUT||'../../evidence/journal');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('js/data/attendanceJournal.js','utf8');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.end('<html></html>');return;}try{res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await pw.chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const results=[];
async function run(code,kind){const context=await browser.newContext(),page=await context.newPage();await page.route('**/js/data/attendanceJournal.js',r=>r.fulfill({body:code,contentType:'text/javascript'}));await page.goto(origin);try{return await page.evaluate(async kind=>{
 const j=(await import('/js/data/attendanceJournal.js')).AttendanceJournal,scope={uid:'u1',role:'coach',clubId:'A',coachBranch:'CS1'};
 const record=(name,status=1)=>({clubId:'A',docId:name+'_2026-10-20',date:'2026-10-20',month:'2026-10',name,profileId:name,branch:'CS1',status,shiftId:'',shiftMode:'legacy-no-shift',baseVersion:'absent'});
 const ensure=(ok,label)=>{if(!ok)throw Error(label)};
 if(kind==='ack'){
  const [row]=await j.enqueue([record('Ack')],scope),old=await j.claim(scope,'old',10,100),fresh=await j.claim(scope,'fresh',10,60200);
  ensure(fresh.length===1&&fresh[0].claimId!==old[0].claimId,'expired lease must have a new claim');
  ensure(await j.acknowledge(old,[row.id])===0,'stale claim must not ACK current lease');
  ensure((await j.list(scope))[0].state==='inflight','current lease must survive');ensure(await j.acknowledge(fresh,[row.id])===1,'current ACK succeeds');
 }else if(kind==='causal'){
  const [a]=await j.enqueue([record('Causal')],scope),first=await j.claim(scope,'first');const [b]=await j.enqueue([record('Causal',2)],scope);
  ensure(b.dependsOn===a.id&&b.baseVersion===a.id,'second intent has an explicit parent');ensure((await j.claim(scope,'second')).length===0,'child cannot run before parent ACK');
  await j.acknowledge(first,[a.id]);ensure((await j.claim(scope,'second'))[0].id===b.id,'child runs after ACK');
 }else if(kind==='legacy'){
  const key='offline_att_A_2026-10-20',raw=JSON.stringify({clubId:'A',date:'2026-10-20',records:{a:record('Legacy')}});localStorage.setItem(key,raw);await j.importLegacy(scope);
  ensure(localStorage.getItem(key)===raw,'migration must not remove mutable legacy input');const rows=await j.list(scope);ensure(rows.length===1&&rows[0].state==='needs-review','legacy must not auto replay');ensure((await j.claim(scope,'legacy')).length===0,'legacy is not claimable');
  await j.importLegacy(scope);ensure((await j.list(scope)).length===1,'same raw input is imported once');
 }else if(kind==='scope'){
  await j.enqueue([{...record('OtherClub'),clubId:'B'}, {...record('OtherBranch'),branch:'CS2'}],scope);await j.enqueue([record('OtherUser')],{...scope,uid:'another'});
  ensure((await j.claim(scope,'u1')).length===0,'other principal/branch/club cannot auto replay');
 }else if(kind==='date'){
  const [a,b]=await j.enqueue([record('Date1'),{...record('Date2'),docId:'Date2_2026-10-21',date:'2026-10-21'}],scope);
  const claims=await j.claim(scope,'date',1);ensure(claims[0].id===a.id,'first date claimed');await j.acknowledge(claims,[a.id]);
  const rows=await j.list(scope);ensure(rows.find(x=>x.id===b.id)?.state==='pending','ACK preserves different date');
  let rejected=false;try{await j.keepServer(b.id,{...scope,clubId:'B'})}catch{rejected=true}ensure(rejected,'review cannot cross club scope');
 }else if(kind==='review'){
  const [a]=await j.enqueue([record('Review')],scope),claimed=await j.claim(scope,'old');await j.release(claimed,{code:'attendance/intent-conflict',conflicts:[{id:a.id,serverVersion:'newer',serverStatus:2}]});
  ensure((await j.claim(scope,'again')).length===0,'conflict must not auto replay');
  const [child]=await j.enqueue([record('Review',3)],scope);ensure(child.state==='needs-review','new intent behind conflict must be reviewed');
  await j.keepServer(a.id,scope);const rebound=await j.rebase(child.id,'latest-server-version',scope);ensure(rebound.baseVersion==='latest-server-version'&&rebound.id!==child.id,'review creates fresh CAS intent');
  ensure((await j.list(scope)).some(x=>x.id===a.id&&x.state==='kept-server'),'review retains audit record');
 }
 return true;
},kind)}finally{await context.close()}}
try{
 for(const kind of ['ack','causal','legacy','scope','review','date']){assert.equal(await run(source,kind),true);results.push({kind,type:'positive',status:'PASS'});}
 const mutations=[
 ['ack','claim identity removed',s=>s.replace('&&row.claimId===claim.claimId','')],
 ['causal','dependency guard removed',s=>s.replace("if(row.dependsOn&&byId.get(row.dependsOn)?.state!=='acked')continue;",'')],
 ['legacy','unsafe legacy key removal restored',s=>s.replace('const raw=storage.getItem(key);','const raw=storage.getItem(key);storage.removeItem(key);')],
 ['legacy','legacy automatic replay restored',s=>s.replace("baseVersion:'unknown',state:'needs-review'","baseVersion:'absent',state:'pending',principal:{...scope}")],
 ['scope','principal guard removed',s=>s.replace('||!samePrincipal(row,scope)','').replace("(scope.role!=='coach'||!row.principal||row.principal.uid===scope.uid) &&",'')],
 ['review','conflict automatically pending again',s=>s.replace("row.state=conflict?'conflict':review?'needs-review':'pending'","row.state=review?'needs-review':'pending'")],
 ];
 for(const [kind,label,change]of mutations){const mutated=change(source);assert.notEqual(mutated,source,label+' must change actual source');let caught=false;try{await run(mutated,kind)}catch{caught=true}assert(caught,'Mutation survived: '+label);results.push({kind,mutation:label,type:'negative',status:'CAUGHT'});console.log('CAUGHT',label)}
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({nativeIndexedDB:true,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),results},null,2));await browser.close();await new Promise(r=>server.close(r))}
console.log('JOURNAL CONTROLS PASS',results.length);

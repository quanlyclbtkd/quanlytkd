// Actual contract and Journal modules, same-origin browser module cache.
// Empty host page only: no Firebase initialization, login, data reads or writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
import {demoDecision} from '../v11r2/decision-fixture.mjs';
import {ACCEPTED_SOURCE} from '../v11r2/source-identity.mjs';
const root=process.cwd(),fixture=demoDecision(root,{projectId:'demo-a12-cache'}),bundle=fixture.bundle;
let active=false;const requests=[],results=[];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Local module cache verification</title>');return}
 const file=u.pathname.slice(1),full=path.resolve(root,file);
 if(!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 try {
  requests.push({file,url:req.url,phase:active?'active':'maintenance'});
  res.setHeader('content-type','text/javascript');res.setHeader('cache-control','public, max-age=31536000, immutable');
  res.end(active&&Object.hasOwn(bundle.runtimeOverrides,file)?bundle.runtimeOverrides[file]:fs.readFileSync(full));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,pw=loadPlaywright();let browser;
const test=async(name,fn)=>{await fn();results.push({name,status:'PASS'});console.log('PASS '+name)};
try {
 browser=await pw.chromium.launch({executablePath:browserExecutable(pw),args:['--no-sandbox']});
 const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage();await page.goto(origin);
 await test('pre-cutover cached contract denies Coach',async()=>{
  assert.equal(await page.evaluate(async()=>{window.oldContract=await import('/js/core/attendanceContract.js');window.oldJournal=await import('/js/data/attendanceJournal.js?v=qr-v11r2-cutover-20261021');return oldContract.HISTORY_COACH_ACCESS}),false);
 });
 active=true;
 await test('new candidate contract identity bypasses old module cache',async()=>{
  const result=await page.evaluate(async tag=>{
   window.newContract=await import('/js/core/attendanceContract.js?v='+tag);
   window.newJournal=await import('/js/data/attendanceJournal.js?v='+tag);
   return {oldClosed:oldContract.HISTORY_COACH_ACCESS===false,newOpen:newContract.HISTORY_COACH_ACCESS===true,newEpoch:newContract.HISTORY_AUTHORITY,contractDistinct:oldContract!==newContract,journalDistinct:oldJournal!==newJournal};
  },bundle.plan.activeBuildTag);
  assert.deepEqual(result,{oldClosed:true,newOpen:true,newEpoch:bundle.plan.authority,contractDistinct:true,journalDistinct:true});
 });
 await test('new Journal reuses the exact new contract URL',async()=>{
  const contractRequests=requests.filter(r=>r.phase==='active'&&r.file==='js/core/attendanceContract.js');
  assert.equal(contractRequests.length,1);assert.equal(new URL(contractRequests[0].url,origin).searchParams.get('v'),bundle.plan.activeBuildTag);
 });
 await test('unversioned old client remains closed after new module import',async()=>assert.equal(await page.evaluate(async()=> (await import('/js/core/attendanceContract.js')).HISTORY_COACH_ACCESS),false));
 await test('repeated new imports reuse module objects without another fetch',async()=>{
  const before=requests.length;
  assert.equal(await page.evaluate(async tag=>(await import('/js/data/attendanceJournal.js?v='+tag))===newJournal,bundle.plan.activeBuildTag),true);
  assert.equal(requests.length,before);
 });
} catch(error) {results.push({name:'failure',status:'FAIL',error:error.stack});throw error}
finally {
 if(browser)await browser.close();await new Promise(r=>server.close(r));
 fs.mkdirSync('handoff/A1A2/evidence/green',{recursive:true});
 fs.writeFileSync('handoff/A1A2/evidence/green/cache-browser.json',JSON.stringify({status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',evidenceScope:'LOCAL_CHROMIUM_DEMO_MODULE_CACHE_ONLY',sourceIdentity:ACCEPTED_SOURCE,activeTag:bundle.plan.activeBuildTag,results,requests,productionWrites:0},null,2));
}

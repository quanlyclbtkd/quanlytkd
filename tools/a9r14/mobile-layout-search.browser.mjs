// Actual HTML/CSS, search controller, student index and event adapters. Synthetic
// in-memory data only; every external request is blocked and Firestore is absent.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
const root=process.cwd(),baseline=process.env.A9R14_BASELINE_ROOT?path.resolve(process.env.A9R14_BASELINE_ROOT):null;
const results=[],geometry=[];
const html=directory=>fs.readFileSync(path.join(directory,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://local'),isBaseline=url.pathname.startsWith('/baseline/'),directory=isBaseline?baseline:root;
 if(!directory){res.writeHead(404);res.end();return;}
 const name=url.pathname.replace(/^\/(?:current|baseline)\//,''),file=path.resolve(directory,name||'index.html');
 if(!file.startsWith(directory+path.sep)){res.writeHead(403);res.end();return;}
 try {res.setHeader('content-type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript');res.end(file.endsWith('index.html')?html(directory):fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await loadPlaywright().chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox']});
async function open(width,prefix='current') {
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.setDefaultTimeout(10000);
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(origin+'/'+prefix+'/',{waitUntil:'networkidle'});
 await page.evaluate(()=>{
  document.body.classList.add('ui-mobile-shell');document.getElementById('mainApp').style.display='block';document.getElementById('loginOverlay').style.display='none';document.getElementById('superAdminView').style.display='none';
  document.getElementById('filterMonth').value='2026-10';document.getElementById('filterBranch').value='all';
 });return {context,page};
}
async function measure(page){return page.evaluate(()=>{
 const box=id=>{const el=document.getElementById(id),r=el.getBoundingClientRect(),style=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,fontSize:style.fontSize}};
 return {month:box('filterMonth'),search:box('searchInput'),branch:box('filterBranch'),viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,counts:['filterMonth','searchInput','filterBranch'].map(id=>document.querySelectorAll('#'+id).length)};
});}
async function check(title,fn){try{await fn();results.push({title,result:'PASS'});console.log('PASS',title);}catch(error){results.push({title,result:'FAIL',message:error.stack});console.error('FAIL',title,error.message);}}
try {
 for(const width of [320,360,375,390,414,430,519,520,767])await check('Mobile '+width+'px: month/branch above full-width search; controls are readable and clickable',async()=>{
  const {page,context}=await open(width);try{
   const dimensions=await measure(page);geometry.push(dimensions);
   assert.equal(dimensions.month.y,dimensions.branch.y);
   assert(dimensions.search.y>=Math.max(dimensions.month.y+dimensions.month.height,dimensions.branch.y+dimensions.branch.height));
   assert(dimensions.month.x+dimensions.month.width<=dimensions.branch.x);
   assert(Math.abs(dimensions.search.width-(dimensions.branch.x+dimensions.branch.width-dimensions.month.x))<1,'Search fills the second row');
   assert.equal(await page.evaluate(()=>{const e=document.getElementById('filterBranch'),r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id;}),'filterBranch','Branch must receive the tap, not search');
   assert.equal(await page.locator('label[for="filterBranch"]').isVisible(),true);
   assert.deepEqual(dimensions.counts,[1,1,1]);for(const key of ['month','search','branch']){assert(dimensions[key].height>=44);assert.equal(dimensions[key].fontSize,'16px');assert(dimensions[key].x>=0&&dimensions[key].x+dimensions[key].width<=width);}
   if(width===390&&process.env.A9R14_SCREENSHOTS){fs.mkdirSync(process.env.A9R14_SCREENSHOTS,{recursive:true});await page.locator('#filterArea').screenshot({path:path.join(process.env.A9R14_SCREENSHOTS,'mobile-390-after.png')});}
  }finally{await context.close();}
 });
 if(baseline)await check('Desktop geometry at 1024px stays equal to the supplied parent baseline',async()=>{
  const old=await open(1024,'baseline'),current=await open(1024);try{
   const a=await measure(old.page),b=await measure(current.page);
   for(const key of ['month','search','branch'])for(const field of ['x','y','width','height'])assert(Math.abs(a[key][field]-b[key][field])<1,key+' '+field);
  }finally{await old.context.close();await current.context.close();}
 });
 await check('Real search still matches Vietnamese names, phone and belt with no server calls',async()=>{
  const {page,context}=await open(390);try{
   await page.evaluate(async()=>{
    window.__qa={tab:'active',refreshes:[],monthChanges:0,serverCalls:0};window.__store={profiles:{'Nguyễn Bảo An':{name:'Nguyễn Bảo An',displayName:'Nguyễn Bảo An',phone:'0901000001',belt:'Đai Đỏ',branch:'CS1',status:'active'},'Trần Minh Đức':{name:'Trần Minh Đức',phone:'0902000002',belt:'Đai Đen',branch:'CS2',status:'active'}},pagination:{students:{}},_dataVersion:1};
    window.getCurrentActiveTabId=()=>__qa.tab;window.refreshListsComputation=(keys,reason)=>__qa.refreshes.push({keys,reason});window.invalidateList=()=>{};window.invalidateCurrentTab=()=>{};
    window.onFilterMonthChange=()=>{__qa.monthChanges++};window.runStudentSearchPagination=()=>{__qa.serverCalls++;throw Error('Unexpected server search')};
    const search=await import('/current/js/modules/searchRuntime.js');search.initGlobalSearchRuntime();search.initGlobalSearchRuntime();window.__searchApi=search;
    const students=await import('/current/js/events/students.events.js');students.initStudentsEvents();students.initStudentsEvents();const finance=await import('/current/js/events/finance.events.js');finance.initFinanceEvents();finance.initFinanceEvents();
    window.__originalSearch=document.getElementById('searchInput');
   });
   for(const [query,expected] of [['bao an','Nguyễn Bảo An'],['0902000002','Trần Minh Đức'],['đai đỏ','Nguyễn Bảo An']]){
    await page.locator('#searchInput').fill(query);await page.waitForFunction(expected=>__store.pagination.students.currentItems?.length===1&&__store.pagination.students.currentItems[0].id===expected,expected);
   }
   await page.locator('#searchInput').fill('bao');await page.locator('#searchInput').fill('minh duc');await page.waitForFunction(()=>__store.pagination.students.currentItems?.[0]?.id==='Trần Minh Đức');
   const before=await page.evaluate(()=>__searchApi.getSearchRuntimeState().scheduledCount);
   await page.evaluate(()=>{const el=document.getElementById('searchInput');el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='bao an';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
   assert.equal(await page.evaluate(()=>__searchApi.getSearchRuntimeState().scheduledCount),before);
   await page.evaluate(()=>document.getElementById('searchInput').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await page.waitForFunction(()=>__store.pagination.students.currentItems?.[0]?.id==='Nguyễn Bảo An');
   await page.locator('#filterMonth').fill('2026-11');assert.equal(await page.evaluate(()=>__qa.monthChanges),1);
   await page.setViewportSize({width:1024,height:900});await page.setViewportSize({width:390,height:900});
   assert.equal(await page.evaluate(()=>__originalSearch===document.getElementById('searchInput')),true);assert.equal(await page.evaluate(()=>__qa.serverCalls),0);assert.equal(await page.evaluate(()=>__searchApi.getSearchRuntimeState().errors.length),0);
  }finally{await context.close();}
 });
} finally {
 await browser.close();await new Promise(r=>server.close(r));
 const report={scope:'Actual DOM/CSS, controller and index with synthetic in-memory data; no live account',total:results.length,pass:results.filter(x=>x.result==='PASS').length,fail:results.filter(x=>x.result==='FAIL').length,geometry,results};
 fs.mkdirSync('evidence/A9R14',{recursive:true});fs.writeFileSync('evidence/A9R14/MOBILE_LAYOUT_SEARCH.json',JSON.stringify(report,null,2));if(report.fail)process.exitCode=1;
}

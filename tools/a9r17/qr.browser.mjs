// Read-only audit of actual receipt owner/helpers with controlled provider/CDN bytes.
// No production requests, no Firebase bootstrap, no QR decoder substitution.
import fs from'node:fs';import path from'node:path';import http from'node:http';import assert from'node:assert/strict';import crypto from'node:crypto';import{createRequire}from'node:module';import{pathToFileURL}from'node:url';
const root=path.resolve(process.env.QR_TEST_SOURCE_ROOT||process.cwd()),out=path.resolve(process.env.A9R17_EVIDENCE||'evidence/A9R17/QR_COMPONENT');fs.mkdirSync(out,{recursive:true});
const{source,cut,bankConfig,pngFixture}=await import(pathToFileURL(path.join(root,'tools/qr-v7/harness.mjs')));
const {loadPlaywright,browserExecutable}=await import('../test-runtime.mjs'),pw=loadPlaywright(),format=process.env.A9R17_PROVIDER_FORMAT||'png',fixture=format==='svg'?fs.readFileSync(path.join(root,'tools/qr-v8/fixtures/provider-synthetic.svg')):pngFixture('valid.png'),h2bytes=fs.readFileSync(path.join(root,'tools/qr-v7/vendor/html2canvas.min.js'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https:[^>]*>/gi,'');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname==='/'){res.setHeader('content-type','text/html');res.end(html);return}const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403);res.end();return}try{res.setHeader('content-type',f.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(f))}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const config=bankConfig();
const prelude=`let currentClubId='club-a',clubConfig=${JSON.stringify(config)},allProfiles={'TEST VDV':{branch:'CS1',tuitionFee:500000,paidUntil:'2026-09'}},logoCanvasData=null;
window.__verifiedAuthContextState={uid:'qa-admin',clubId:'club-a',generation:1,role:'admin',coachBranch:'',ready:true};window.__store={clubId:'club-a',profiles:allProfiles,clubConfig};window.userRole='admin';
window.__notices=[];window.__writes=[];window.showToast=(...a)=>window.__notices.push({at:performance.now(),text:a[0]});window.getDebtProfileCoverageStatus=()=>({clubId:'club-a',ready:true});window.getBranchNameDisplay=x=>x;
const getLocalToday=()=> '2026-10-26',formatDate=x=>x,formatMonth=x=>x?x.split('-').reverse().join('/'):'',docTienVND=x=>String(x),normalizeYYYYMM=x=>x;
function removeVietnameseTonesForQR(s){return String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D');}
window.RoleReadBoundary={isCoachAttendanceOnly:()=>false,canMount:()=>false};const _updateHydrationMetrics=()=>{},applyClubConfigUI=()=>{},scheduleRender=()=>{};
const deny=()=>{window.__writes.push('write');throw Error('Unexpected financial write');};const setDoc=deny,updateDoc=deny,addDoc=deny,deleteDoc=deny,writeBatch=deny,runTransaction=deny;window._fb_init={setDoc,updateDoc,addDoc,deleteDoc,writeBatch,runTransaction};window.TuitionCommandBoundary={collectTuition:deny};`;
const code=prelude+cut(source,'function normalizeBranchKeyForPayment','function maskAccountNumber')+'\n'+cut(source,'function generateVietQR',"document.getElementById('transactionForm')")+'\n'+cut(source,'const _waitReceiptPreviewReady = async','// Phase 4K-2B:')+'\n'+cut(source,'window.generateMultiMonthPaymentRequest =','window.copyAndOpenZalo =')+'\n'+cut(source,'window.processMultiItem = async (action) => {','// ─── Setup currency inputs for multi-item modal')+`\n{const clubId=currentClubId,_settingsKey='global:settings:club-a';${cut(source,'const _completeSettingsReady =','const _settingsCb =')}${cut(source,'const _settingsCb =','if (_coachAttendanceOnlyRuntime)')} _settingsCb({exists:()=>true,data:()=>clubConfig,metadata:{fromCache:false,hasPendingWrites:false}});}`;
const browser=await pw.chromium.launch({headless:true,executablePath:browserExecutable(pw),args:['--no-sandbox']});
const rows=[],errors=[],network=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
async function prepare(cpu){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();
  if(u.hostname==='img.vietqr.io'){await delay(200);network.push({kind:'provider-fixture',cpu,at:Date.now()});return route.fulfill({status:200,headers:{'content-type':format==='svg'?'image/svg+xml':'image/png','access-control-allow-origin':'*'},body:fixture})}
  if(u.hostname==='cdnjs.cloudflare.com'&&u.pathname.endsWith('/html2canvas.min.js')){await delay(500);network.push({kind:'html2canvas-fixture',cpu,at:Date.now()});return route.fulfill({status:200,headers:{'content-type':'text/javascript'},body:h2bytes})}
  return route.abort();
 });page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.addStyleTag({content:'.app-container{display:block!important}#loginOverlay{display:none!important}.tab-content{display:none!important}#tab_debt{display:block!important}'});
 await page.addScriptTag({url:origin+'/js/core/lazyAssetsBootstrap.js'});
 await page.evaluate(async()=>{const h=await import('/js/modules/qrBankingHelpers.js');h.initQRBankingHelpers();const receipts=await import('/js/modules/receiptHelpers.js');receipts.initReceiptHelpers();const f=await import('/js/utils/format.js');window.formatMonthCompact=f.formatMonthCompact;window.formatTuitionMonthList=xs=>f.formatMonthCompact(xs.join(','));window.__observed={scans:[],raster:[],assets:[],tasks:[]};
  // QA timing facade: retain the exact exported functions; never mutate the
  // frozen production export object or replace any decoder/validation result.
  window.QRBankingHelpers={...window.QRBankingHelpers};
  const observe=(object,key,target)=>{const original=object[key];object[key]=async function(...args){const start=performance.now();try{return await original.apply(this,args)}finally{window.__observed[target].push({start,elapsed:performance.now()-start,width:args[0]?.naturalWidth,height:args[0]?.naturalHeight})}}};
  observe(window.QRBankingHelpers,'decodeReceiptQrImage','scans');observe(window.QRBankingHelpers,'prepareReceiptQrImage','raster');observe(window,'ensureHtml2CanvasReady','assets');
  new PerformanceObserver(list=>window.__observed.tasks.push(...list.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true});
 });await page.addScriptTag({content:code});
 await page.evaluate(()=>{document.getElementById('r_club_name').textContent='CLB QA ONLY';document.getElementById('multiItemModal').style.display='flex';for(const[k,v]of Object.entries({mi_name:'TEST VDV',mi_tuition_month:'2026-10',mi_tuition_pkg:'1',mi_tuition_actual:'500000',mi_exam_actual:'0',mi_other_actual:'0',mi_inv_qty:'1'}))document.getElementById(k).value=v;document.getElementById('mi_tuition_enabled').checked=true;for(const id of['mi_exam_toggle','mi_other_toggle','mi_inv_toggle'])document.getElementById(id).checked=false;});
 return{context,page};
}
async function run(page,entry){return page.evaluate(async entry=>{if(entry==='multi')document.getElementById('multiItemModal').style.display='flex';const start=performance.now(),clickWall=Date.now(),before=Object.fromEntries(Object.entries(window.__observed).map(([k,v])=>[k,v.length]));const owner=window.exportReceipt;
 let pending;window.exportReceipt=(...args)=>{pending=owner(...args);return pending};
 try{if(entry==='debt')window.generateMultiMonthPaymentRequest('TEST VDV','2026-10','CS1',500000);else await window.processMultiItem('report');const r=await pending;return{ok:r?.ok,reason:r?.reason,diagnostics:r?.diagnostics,jobId:r?.jobId,kind:r?.kind,clickToReadyMs:performance.now()-start,queueWaitMs:r?.diagnostics?Math.max(0,Date.parse(r.diagnostics.at)-clickWall):null,observed:Object.fromEntries(Object.entries(window.__observed).map(([k,v])=>[k,v.slice(before[k]).filter(x=>x.start>=start)])),writes:window.__writes.length,preview:{width:document.getElementById('receiptPreviewImg').naturalWidth,height:document.getElementById('receiptPreviewImg').naturalHeight}}}
 finally{window.exportReceipt=owner}
 },entry)}
try{
 for(const cpu of[Number(process.env.A9R17_CPU||4)])for(let repeat=1;repeat<=Number(process.env.A9R17_REPEATS||1);repeat++)for(const entry of[process.env.A9R17_ENTRY||'debt']){
  const{context,page}=await prepare(cpu);
  for(const cache of['cold','warm']){const row={cpu,repeat,entry,cache,...await run(page,entry)};rows.push(row);fs.writeFileSync(path.join(out,'QR_COMPONENT_PROBE.json'),JSON.stringify({status:'RUNNING',rows,errors,network},null,2));assert(row.ok,JSON.stringify({cpu,entry,cache,reason:row.reason}));assert.equal(row.writes,0);assert.equal(row.observed.scans.length,2);console.log(JSON.stringify({cpu,repeat,entry,cache,ms:Math.round(row.clickToReadyMs),timings:row.diagnostics.timings,scans:row.observed.scans.map(x=>Math.round(x.elapsed)),assets:row.observed.assets.map(x=>Math.round(x.elapsed))}));}
  await context.close();
 }
 const queued=[];
 fs.writeFileSync(path.join(out,'QR_COMPONENT_PROBE.json'),JSON.stringify({status:'PASS',format,scope:'Component-only: actual receipt owner, native DOM/html2canvas/jsQR; synthetic authority/provider bytes; CPU throttling; not real phone/network/provider timing. No production access.',protocol:'A9R17_PAIRED_QR_PNG_SVG_V1',harnessSHA256:crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),providerFixtureDelayMs:200,html2canvasFixtureDelayMs:500,runs:rows.length,rows,queued,errors,network},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}


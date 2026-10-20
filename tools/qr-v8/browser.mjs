// Component E2E: actual HTML/buttons, receipt owner, students module and renderer.
// Synthetic principal/settings are supplied to the existing callback. No Firebase
// bootstrap or production access. No BarcodeDetector/jsQR test adapter is injected.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import {root,source,cut,bankConfig,pngFixture} from '../qr-v7/harness.mjs';

const requireRuntime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/../package.json' : import.meta.url);
const pw=requireRuntime('playwright');
const engineName=process.env.QR_BROWSER_ENGINE || 'chromium';
const engine=pw[engineName];
const baseline=process.env.QR_BROWSER_BASELINE==='1';
const out=path.resolve(process.env.QR_BROWSER_EVIDENCE || '../../evidence/browser-v8-'+engineName);
fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https:[^>]*>/gi,'');
const vendor=path.resolve('tools/qr-v7/vendor');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('content-type','text/html');res.end(html);return;}
  const file=url.pathname.startsWith('/test-vendor/')?path.join(vendor,path.basename(url.pathname)):path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep) && !file.startsWith(vendor+path.sep)){res.writeHead(403);res.end();return;}
  try {res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}
  catch(_){res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const results=[],errors=[],network=[],pendingResponses=[];
const config=bankConfig();
const prelude=`let currentClubId='club-a',clubConfig=${JSON.stringify(config)},allProfiles={'TEST VDV':{branch:'CS1',tuitionFee:500000,paidUntil:'2026-09'}},logoCanvasData=null;
window.__verifiedAuthContextState={uid:'qa-admin',clubId:'club-a',generation:1,role:'admin',coachBranch:'',ready:true};window.__store={clubId:'club-a',profiles:allProfiles,clubConfig};window.userRole='admin';
window.__notices=[];window.__writes=[];window.showToast=(...a)=>{window.__notices.push(a);document.getElementById('toastMessage').innerText=a[0];};window.getDebtProfileCoverageStatus=()=>({clubId:'club-a',ready:true});window.getBranchNameDisplay=x=>x;
const getLocalToday=()=> '2026-10-20',formatDate=x=>x,formatMonth=x=>x?x.split('-').reverse().join('/'):'',docTienVND=x=>String(x),normalizeYYYYMM=x=>x;
function removeVietnameseTonesForQR(s){return String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D');}
window.RoleReadBoundary={isCoachAttendanceOnly:()=>false,canMount:()=>false};const _updateHydrationMetrics=()=>{},applyClubConfigUI=()=>{},scheduleRender=()=>{};
const deny=()=>{window.__writes.push('write');throw Error('Unexpected financial write');};const setDoc=deny,updateDoc=deny,addDoc=deny,deleteDoc=deny,writeBatch=deny,runTransaction=deny;window._fb_init={setDoc,updateDoc,addDoc,deleteDoc,writeBatch,runTransaction};window.TuitionCommandBoundary={collectTuition:deny};`;
const code=prelude+cut(source,'function normalizeBranchKeyForPayment','function maskAccountNumber')+'\n'+cut(source,'function generateVietQR',"document.getElementById('transactionForm')")+'\n'+cut(source,'const _waitReceiptPreviewReady = async','// Phase 4K-2B:')+'\n'+cut(source,'window.generateMultiMonthPaymentRequest =','window.copyAndOpenZalo =')+'\n'+cut(source,'window.processMultiItem = async (action) => {','// ─── Setup currency inputs for multi-item modal')+
`\n{const clubId=currentClubId,_settingsKey='global:settings:club-a';${cut(source,'const _completeSettingsReady =','const _settingsCb =')}${cut(source,'const _settingsCb =','if (_coachAttendanceOnlyRuntime)')} _settingsCb({exists:()=>true,data:()=>clubConfig,metadata:{fromCache:false,hasPendingWrites:false}});}`;
const fixture=process.env.QR_PROVIDER_IMAGE?fs.readFileSync(process.env.QR_PROVIDER_IMAGE):pngFixture('valid.png');
const svgFixture=process.env.QR_PROVIDER_SVG?fs.readFileSync(process.env.QR_PROVIDER_SVG):null;
const py=process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
function verify(file){
  const decoded=spawnSync(py,['tools/qr-v8/verify-export.py',file],{encoding:'utf8'});
  assert.equal(decoded.status,0,decoded.stderr);
  const pixels=JSON.parse(decoded.stdout);
  const emv=spawnSync(py,['tools/qr-v7/verify-emv.py'],{input:pixels.payload,encoding:'utf8'});
  assert.equal(emv.status,0,emv.stderr);
  const tuple=JSON.parse(emv.stdout);
  assert.deepEqual(tuple,{bankBin:'970422',accountNo:'001234567890',amount:500000,memo:'TEST VDV Hoc Phi Thang 10 2026',crc:'PASS'});
  return {...tuple,width:pixels.width,height:pixels.height,decoder:pixels.decoder,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
}
const proxyValue=process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
let proxy;
if(proxyValue){const u=new URL(proxyValue);proxy={server:u.origin,bypass:'127.0.0.1,localhost',...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
let browser;
async function prepare(page,policy,width){
  await page.setViewportSize({width,height:900});
  if(policy!=='live')await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1')return route.continue();
    if(u.hostname==='img.vietqr.io'){
      if(policy==='live')return route.continue();
      if(policy==='network-down')return route.abort();
      if(policy==='redirect' && u.pathname.endsWith('.png'))return route.fulfill({status:301,headers:{location:u.href.replace('-qr_only.png?','-qr_only.svg?'),'access-control-allow-origin':'*'},body:''});
      return route.fulfill({status:200,headers:{'content-type':policy==='svg'?'image/svg+xml':'image/png','access-control-allow-origin':'*'},body:policy==='svg'?svgFixture:fixture});
    }
    return route.abort();
  });
  page.on('pageerror',e=>errors.push({policy,width,message:e.message}));
  page.on('requestfailed',r=>{if(new URL(r.url()).hostname==='img.vietqr.io')network.push({policy,width,event:'requestfailed',url:r.url(),failure:r.failure()?.errorText});});
  page.on('response',r=>{if(new URL(r.url()).hostname==='img.vietqr.io')pendingResponses.push((async()=>{const h=await r.allHeaders();network.push({policy,width,event:'response',url:r.url(),status:r.status(),mime:h['content-type'],allowOrigin:h['access-control-allow-origin'],location:h.location});})());});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.addStyleTag({content:'.app-container{display:block!important}#loginOverlay{display:none!important}.tab-content{display:none!important}#tab_debt{display:block!important}'});
  await page.evaluate(async()=>{const h=await import('/js/modules/qrBankingHelpers.js?v=qr-v8-redirect-safari-20261020');h.initQRBankingHelpers();const f=await import('/js/utils/format.js');window.formatMonthCompact=f.formatMonthCompact;window.formatTuitionMonthList=xs=>f.formatMonthCompact(xs.join(','));});
  await page.addScriptTag({url:origin+'/test-vendor/html2canvas.min.js'});
  await page.addScriptTag({content:code});
  return page.evaluate(async()=>{
    const legacy=window.generateMultiMonthPaymentRequest.toString();
    const s=await import('/js/modules/students.js');s.initStudents();
    const adopted=window.generateMultiMonthPaymentRequest.toString();
    const r=await import('/js/ui/render/computation/studentsRenderer.js');document.getElementById('debtList').innerHTML=r.renderDebtRow('TEST VDV',{branch:'CS1',tuitionFee:500000},{unpaidMonthsCount:1,owedMonthsStr:'2026-10',isAdmin:true,selMonth:'2026-10'});
    document.getElementById('r_club_name').textContent='CLB TEST ONLY';
    const owner=window.exportReceipt;window.exportReceipt=(...args)=>{window.__pendingReceipt=owner(...args);return window.__pendingReceipt;};
    return {legacyDelegates:legacy.includes('return window.exportReceipt'),moduleDelegates:adopted.includes('return window.exportReceipt'),moduleAdopted:legacy!==adopted,nativeDetector:typeof window.BarcodeDetector,productionDecoder:typeof window.QRBankingHelpers.decodeReceiptQrImage};
  });
}
async function flow(context,entry,policy,width){
  const page=await context.newPage();
  try {
    const owners=await prepare(page,policy,width);
    assert.equal(owners.legacyDelegates,true);assert.equal(owners.moduleDelegates,true);assert.equal(owners.moduleAdopted,true);
    if(entry==='multiitem')await page.evaluate(()=>{document.getElementById('multiItemModal').style.display='flex';for(const[k,v]of Object.entries({mi_name:'TEST VDV',mi_tuition_month:'2026-10',mi_tuition_pkg:'1',mi_tuition_actual:'500000',mi_exam_actual:'0',mi_other_actual:'0',mi_inv_qty:'1'}))document.getElementById(k).value=v;document.getElementById('mi_tuition_enabled').checked=true;for(const id of ['mi_exam_toggle','mi_other_toggle','mi_inv_toggle'])document.getElementById(id).checked=false;});
    if(entry==='debt')await page.locator('#debtList button').filter({hasText:'QR'}).click();
    else await page.locator('#multiItemModal button').filter({hasText:'TẠO PHIẾU BÁO'}).click();
    const result=await page.evaluate(async()=>{const r=await window.__pendingReceipt;return {ok:r?.ok,reason:r?.reason,stage:r?.stage,kind:r?.kind,jobId:r?.jobId,writes:window.__writes.length,notices:window.__notices.map(x=>x[0]),qr:document.getElementById('qrCodeImg').src,preview:document.getElementById('receiptPreviewImg').src,modal:document.getElementById('receiptModal').style.display};});
    assert.equal(result.writes,0);
    if(baseline || policy==='network-down'){
      const reason=baseline?(policy==='direct'?'QR_VERIFICATION_UNAVAILABLE':'QR_FETCH_CORS'):'QR_FETCH_NETWORK';
      assert.equal(result.ok,false);assert.equal(result.reason,reason);
      assert.equal(await page.evaluate(()=>document.getElementById('btnDownloadReceipt').onclick),null);
      results.push({entry,policy,width,status:baseline?'RED_CONFIRMED':'PASS_NEGATIVE',reason:result.reason,stage:result.stage,writes:result.writes,owners});
      console.log(engineName,entry,policy,width,baseline?'RED_CONFIRMED':'PASS_NEGATIVE',result.reason);
      return;
    }
    assert.equal(result.ok,true,JSON.stringify({reason:result.reason,stage:result.stage,notices:result.notices}));
    assert.equal(result.modal,'flex');assert.equal(result.kind,'REPORT');
    const prefix=entry+'-'+policy+'-'+width;
    const sourceFile=path.join(out,prefix+'-source.png'),previewFile=path.join(out,prefix+'-preview.png'),downloadFile=path.join(out,prefix+'-download.png');
    fs.writeFileSync(sourceFile,Buffer.from(result.qr.split(',')[1],'base64'));fs.writeFileSync(previewFile,Buffer.from(result.preview.split(',')[1],'base64'));
    const original=verify(sourceFile),preview=verify(previewFile);
    const downloadEvent=page.waitForEvent('download',{timeout:10000});await page.locator('#btnDownloadReceipt').click();const download=await downloadEvent;await download.saveAs(downloadFile);const saved=verify(downloadFile);
    assert.equal(preview.sha256,saved.sha256);
    results.push({entry,policy,width,status:policy==='live'?'PASS_LIVE_PROVIDER':'PASS_REAL_DOM_WITH_PROVIDER_COMPATIBILITY_FIXTURE',writes:0,owners,source:original,preview,download:saved});
    console.log(engineName,entry,policy,width,'PASS');
  } finally {await page.close();}
}
try {
  const executablePath=engineName==='webkit'?process.env.QR_WEBKIT_EXECUTABLE:process.env.QR_CHROMIUM_EXECUTABLE;
  browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{}),...(engineName==='chromium'?{args:['--no-sandbox','--no-zygote','--single-process','--disable-http2','--disable-quic']}:{}),...(proxy?{proxy}:{})});
  const context=await browser.newContext({acceptDownloads:true,ignoreHTTPSErrors:true,...(engineName==='webkit'?{...pw.devices['iPhone 13'],defaultBrowserType:undefined}:{})});
  const live=process.env.QR_BROWSER_SKIP_LIVE!=='1';
  if(live)for(const entry of ['debt','multiitem'])await flow(context,entry,'live',390);
  if(baseline){for(const policy of ['redirect','direct'])for(const entry of ['debt','multiitem'])await flow(context,entry,policy,390);}
  else if(process.env.QR_BROWSER_LIVE_ONLY!=='1') {
    for(const width of [375,390,430,768,1366])for(const entry of ['debt','multiitem'])await flow(context,entry,'redirect',width);
    if(svgFixture)for(const width of [375,390,430,768,1366])for(const entry of ['debt','multiitem'])await flow(context,entry,'svg',width);
    for(const entry of ['debt','multiitem'])await flow(context,entry,'network-down',390);
  }
  await context.close();
} catch(e){results.push({status:'FAIL',reason:e.stack});console.error(e.stack);process.exitCode=1;}
finally {
  await Promise.allSettled(pendingResponses);
  if(browser)await browser.close();await new Promise(r=>server.close(r));
  const report={engine:engineName,baseline,sourceSha:crypto.createHash('sha256').update(source).digest('hex'),layer:'REAL BROWSER COMPONENT E2E / REAL DOM / html2canvas / PRODUCTION jsQR / ZXing-C++ INDEPENDENT VERIFIER; synthetic context, no Firebase bootstrap, not a physical iPhone',results,network,errors};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({engine:engineName,baseline,pass:results.filter(x=>x.status.startsWith('PASS')).length,red:results.filter(x=>x.status==='RED_CONFIRMED').length,fail:results.filter(x=>x.status==='FAIL').length,out}));
}

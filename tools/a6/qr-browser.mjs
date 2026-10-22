import {browserExecutable} from '../test-runtime.mjs';
// Component E2E: original HTML controls/template, actual source handlers and
// module adoption. Firebase is excluded; all fixtures are synthetic. This is
// Chromium with an explicit test-only jsQR adapter, NOT native iOS certification.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {createRequire}from'node:module';import {spawnSync}from'node:child_process';import crypto from'node:crypto';
import {root,source,cut,bankConfig,decodePng,pngFixture}from'../qr-v7/harness.mjs';
const requireRuntime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/../package.json' : import.meta.url);const{chromium}=requireRuntime('playwright');
const out=path.resolve(process.env.QR_BROWSER_EVIDENCE || '../../evidence/browser');fs.mkdirSync(out,{recursive:true});
const ownDir=path.resolve('tools/qr-v7');
const cleanHTML=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https:[^>]*>/gi,'');
const server=http.createServer((req,res)=>{let u=new URL(req.url,'http://localhost');let f;
 if(u.pathname==='/'){res.setHeader('content-type','text/html');res.end(cleanHTML);return;}
 if(u.pathname.startsWith('/test-vendor/'))f=path.join(ownDir,'vendor',path.basename(u.pathname));else f=path.join(root,u.pathname);
 if(!f.startsWith(root) && !f.startsWith(ownDir)){res.statusCode=403;res.end();return;}
 try{res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(f));}catch(_){res.statusCode=404;res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const proxyServer=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
const browser=await chromium.launch({executablePath:process.env.QR_CHROMIUM_EXECUTABLE || browserExecutable(),headless:true,args:['--no-sandbox','--no-zygote','--single-process'],...(proxyServer?{proxy:{server:proxyServer,bypass:'127.0.0.1,localhost'}}:{})});
const baseline=process.env.QR_BROWSER_BASELINE==='1',results=[],network=[],errors=[];
const config=bankConfig();
const prelude=`let currentClubId='club-a',clubConfig=${JSON.stringify(config)},allProfiles={'TEST VDV':{branch:'CS1',tuitionFee:500000,paidUntil:'2026-09'}},logoCanvasData=null;
 window.__verifiedAuthContextState={uid:'qa-admin',clubId:'club-a',generation:1,role:'admin',coachBranch:'',ready:true};window.__store={clubId:'club-a',profiles:allProfiles,clubConfig};window.userRole='admin';
 window.__notices=[];window.__writes=[];window.showToast=(...args)=>{window.__notices.push(args);document.getElementById('toastMessage').innerText=args[0];};
 window.getDebtProfileCoverageStatus=()=>({clubId:'club-a',ready:true});window.getBranchNameDisplay=x=>x;
 const getLocalToday=()=> '2026-10-20',formatDate=x=>x,formatMonth=x=>x?x.split('-').reverse().join('/'):'',docTienVND=x=>String(x),normalizeYYYYMM=x=>x;
 function removeVietnameseTonesForQR(s){return String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D');}
 window.RoleReadBoundary={isCoachAttendanceOnly:()=>false,canMount:()=>false};const _updateHydrationMetrics=()=>{},applyClubConfigUI=()=>{},scheduleRender=()=>{};
 const deny=(...x)=>{window.__writes.push('write');throw Error('Unexpected financial write');};const setDoc=deny,updateDoc=deny,addDoc=deny,deleteDoc=deny,writeBatch=deny,runTransaction=deny;window._fb_init={setDoc,updateDoc,addDoc,deleteDoc,writeBatch,runTransaction};
 window.TuitionCommandBoundary={collectTuition:deny};
 `;
const code=prelude+cut(source,'function normalizeBranchKeyForPayment','function maskAccountNumber')+'\n'+cut(source,'function generateVietQR',"document.getElementById('transactionForm')")+'\n'+cut(source,'const _waitReceiptPreviewReady = async','// Phase 4K-2B:')+'\n'+cut(source,'window.generateMultiMonthPaymentRequest =','window.copyAndOpenZalo =')+'\n'+cut(source,'window.processMultiItem = async (action) => {','// ─── Setup currency inputs for multi-item modal')+
 `\n{const clubId=currentClubId,_settingsKey='global:settings:club-a';${cut(source,'const _completeSettingsReady =','const _settingsCb =')}${cut(source,'const _settingsCb =','if (_coachAttendanceOnlyRuntime)')} _settingsCb({exists:()=>true,data:()=>clubConfig,metadata:{fromCache:false,hasPendingWrites:false}});}`;
const adapter=fs.readFileSync(path.join(ownDir,'vendor/jsQR.js'),'utf8')+`\nwindow.BarcodeDetector=class TestOnlyIndependentJsQRAdapter {async detect(img){const c=document.createElement('canvas');c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);const p=g.getImageData(0,0,c.width,c.height),q=jsQR(p.data,p.width,p.height);if(!q)return [];const l=q.location;return [{rawValue:q.data,boundingBox:{x:l.topLeftCorner.x,y:l.topLeftCorner.y,width:l.topRightCorner.x-l.topLeftCorner.x,height:l.bottomLeftCorner.y-l.topLeftCorner.y}}];}};`;
let providerReplay=null,pixelSource='UNSET',providerStatus=200;
async function prepare(page,width){
 await page.setViewportSize({width,height:900});
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname==='img.vietqr.io'&&providerReplay)return route.fulfill({status:providerStatus,headers:{'content-type':'image/png','access-control-allow-origin':'*'},body:providerReplay});if(u.hostname==='img.vietqr.io')return route.continue();return route.abort();});
 page.on('pageerror',e=>errors.push({width,message:e.message}));
 page.on('dialog',async dialog=>{results.push({case:'actual-UI-dialog',width,message:dialog.message()});await dialog.dismiss();});
 page.on('requestfailed',r=>{if(new URL(r.url()).hostname==='img.vietqr.io')network.push({layer:'browser-requestfailed',error:r.failure()?.errorText});});
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.addStyleTag({content:'.app-container{display:block!important}#loginOverlay{display:none!important}.tab-content{display:none!important}#tab_debt{display:block!important}'});
 await page.evaluate(async()=>{const q=await import('/js/modules/qrBankingHelpers.js');q.initQRBankingHelpers();const f=await import('/js/utils/format.js');window.formatMonthCompact=f.formatMonthCompact;window.formatTuitionMonthList=xs=>f.formatMonthCompact(xs.join(','));});
 await page.addScriptTag({url:origin+'/test-vendor/html2canvas.min.js'});await page.addScriptTag({content:code});
 if(baseline)await page.addScriptTag({content:`window.__stage='request';{const rawAccount=getPaymentAccountForBranch,rawQR=generateVietQR;getPaymentAccountForBranch=(...a)=>{window.__stage='account';return rawAccount(...a);};generateVietQR=(...a)=>{window.__stage='intent';return rawQR(...a);};}`});
 const owner=await page.evaluate(async()=>{const before=window.generateMultiMonthPaymentRequest.toString();const s=await import('/js/modules/students.js');s.initStudents();const after=window.generateMultiMonthPaymentRequest.toString();const r=await import('/js/ui/render/computation/studentsRenderer.js');document.getElementById('debtList').innerHTML=r.renderDebtRow('TEST VDV',{branch:'CS1',tuitionFee:500000},{unpaidMonthsCount:1,owedMonthsStr:'2026-10',isAdmin:true,selMonth:'2026-10'});document.getElementById('r_club_name').textContent='CLB KIỂM THỬ — KHÔNG CHUYỂN TIỀN';return{legacy:before.includes('return window.exportReceipt'),module:after.includes('return window.exportReceipt'),moduleAdopted:before!==after};});
 return owner;
}
function independent(bytes){const decoded=decodePng(bytes);const parsed=spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python',['tools/qr-v7/verify-emv.py'],{input:decoded.payload,encoding:'utf8'});assert.equal(parsed.status,0,parsed.stderr);const tuple=JSON.parse(parsed.stdout);assert.deepEqual(tuple,{bankBin:'970422',accountNo:'001234567890',amount:500000,memo:'TEST VDV Hoc Phi Thang 10 2026',crc:'PASS'});return{...tuple,dimensions:[decoded.width,decoded.height],sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}

async function runEntry(page,entry){
 await page.evaluate(()=>{window.__lastA6=null;window.__notices=[];document.getElementById('receiptModal').style.display='none'});
 if(entry==='multiitem')await page.evaluate(()=>{document.getElementById('multiItemModal').style.display='flex';const vals={mi_name:'TEST VDV',mi_tuition_month:'2026-10',mi_tuition_pkg:'1',mi_tuition_actual:'500000',mi_exam_actual:'0',mi_other_actual:'0',mi_inv_qty:'1'};for(const[k,v]of Object.entries(vals))document.getElementById(k).value=v;document.getElementById('mi_tuition_enabled').checked=true;for(const id of ['mi_exam_toggle','mi_other_toggle','mi_inv_toggle'])document.getElementById(id).checked=false;});
 if(entry==='debt')await page.locator('#debtList button').filter({hasText:'QR'}).click();else await page.locator('#multiItemModal button').filter({hasText:'TẠO PHIẾU BÁO'}).click();
 await page.waitForFunction(()=>window.__lastA6!==null);return page.evaluate(()=>({ok:__lastA6.ok,reason:__lastA6.reason,jobId:__lastA6.jobId,diagnostics:__lastA6.diagnostics,writes:__writes.length}));
}
async function wrap(page){await page.evaluate(()=>{const owner=window.exportReceipt;window.exportReceipt=(...args)=>owner(...args).then(r=>{window.__lastA6=r;return r})})}
async function record(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name)}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL '+name+': '+e.message)}}
try{
 providerReplay=pngFixture('valid.png');pixelSource='SYNTHETIC_PROVIDER_FIXTURE_NOT_LIVE';
 const ctx=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:true});const page=await ctx.newPage();
 for(const width of [375,430]){
  await prepare(page,width);await wrap(page);
  for(const entry of ['debt','multiitem'])await record(entry+' actual DOM/PNG pixels at width '+width,async()=>{
   const r=await runEntry(page,entry);assert.equal(r.ok,true,r.reason);assert.equal(r.writes,0);
   const data=await page.locator('#receiptPreviewImg').getAttribute('src'),bytes=Buffer.from(data.split(',')[1],'base64');
   const verified=independent(bytes);assert(verified.dimensions[0]>0);fs.writeFileSync(path.join(out,entry+'-'+width+'.png'),bytes);
   const download=page.waitForEvent('download');await page.locator('#btnDownloadReceipt').click();const d=await download;assert(d.suggestedFilename().endsWith('.png'));
   const target=path.join(out,entry+'-'+width+'-download.png');await d.saveAs(target);independent(fs.readFileSync(target));
  });
 }
 for(const status of [403,429,500])await record('HTTP '+status+' then explicit retry, same owner and zero writes',async()=>{
  providerStatus=status;const failed=await runEntry(page,'debt');assert.equal(failed.ok,false);assert.equal(failed.reason,'QR_FETCH_HTTP');assert.equal(failed.diagnostics.httpStatus,status);assert.equal(failed.writes,0);
  providerStatus=200;const retried=await runEntry(page,'debt');assert.equal(retried.ok,true,retried.reason);assert.notEqual(retried.jobId,failed.jobId);assert.equal(retried.writes,0);
 });
 await record('production local pixel decoder is present without BarcodeDetector',async()=>{assert.equal(await page.evaluate(()=>typeof QRBankingHelpers.decodeReceiptQrImage),'function');assert.equal(await page.evaluate(()=>typeof window.BarcodeDetector),'undefined')});
 await ctx.close();
}finally{fs.writeFileSync(path.join(out,'a6-qr-browser.json'),JSON.stringify({results,errors,scope:'CHROMIUM_REAL_DOM_HTML2CANVAS_PRODUCTION_PIXEL_DECODER_SYNTHETIC_NETWORK_NOT_IOS',provider:'PROVIDER_NOT_REPRODUCED'},null,2));await browser.close();await new Promise(r=>server.close(r))}
console.log('A6 QR BROWSER '+results.filter(x=>x.status==='PASS').length+'/'+results.length);if(results.some(x=>x.status==='FAIL')||errors.length)process.exitCode=1;

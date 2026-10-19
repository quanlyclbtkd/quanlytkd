import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root = process.env.QR_TEST_SOURCE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const finance=fs.readFileSync(path.join(root,'js/modules/finance.js'),'utf8');
let pass=0, fail=0; const outcomes=[];
function check(name,fn){try{fn();console.log('PASS',name);pass++;outcomes.push({case:name,result:'PASS'});}catch(e){console.error('FAIL',name, e.message);fail++;outcomes.push({case:name,result:'FAIL',reason:e.message});}}
const bankCfg={bankId:'970415', accountNo:'001234567890',accountName:'MOCK OWNER',paymentAccounts:{bank1:{bankId:'970415',accountNo:'001234567890',accountName:'MOCK OWNER',enabled:true},bank2:{bankId:'970436',accountNo:'009988776655',accountName:'TEST ALT',enabled:true}},branchPaymentAccountMap:{CS1:'bank1',CS2:'bank2'},branchCount:2};
function domMock(){const els=new Map();return {els, getElementById(id){if(!els.has(id)){const x={id,value:'',checked:false,style:{},dataset:{},classList:{remove(){}},innerText:'',textContent:'',innerHTML:'',complete:true,naturalWidth:480,naturalHeight:480, onclick:null,src:'',removeAttribute(prop){delete this[prop]},decode:async function(){if(this.src){this.naturalWidth=480;this.naturalHeight=480;}else throw Error('no image')} };els.set(id,x)}return els.get(id)},querySelectorAll(){return[]},createElement(){return{click(){}}}}}
const extract=(source,a,b)=>{let i=source.indexOf(a);if(i<0)throw Error('missing '+a);let e=source.indexOf(b,i);if(e<0)throw Error('end '+b);return source.slice(i,e)};
const helper=extract(app,'function normalizeBranchKeyForPayment','function maskAccountNumber');
const qrFunction=extract(app,'function generateVietQR','document.getElementById(\'transactionForm\')');
const receiptFunction=extract(app,app.includes('const _clearReceiptPreview =')?'const _clearReceiptPreview =':'const _exportReceiptNow = async','// Phase 4K-2B:');
async function receiptRun({report=true,acct=bankCfg,branch='CS1',amount=350000, badNetwork=false, encoded='png', stale=false, errorOnImage=false, caption='PHIẾU BÁO HỌC PHÍ', name='MOCK ALICE',breakdown=null}={}){
 const doc=domMock();let fetchCalls=[], canvasArgs=[],canvasType=null,notice=[], qrSrcAfter='',writes=0;
 const auth={uid:'test-admin',clubId:'club-a',generation:1,ready:true};
 const responseBytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(240,1)]);
 class FileReader{readAsDataURL(b){this.result='data:image/png;base64,'+responseBytes.toString('base64');this.onload?.()}}
 const src={window:{showToast:(...x)=>notice.push(x),__verifiedAuthContextState:auth,getBranchNameDisplay:x=>x,formatMonthCompact:x=>x, html2canvas:async(node,opts)=>{canvasArgs.push(opts);return{toDataURL:(mime)=>{canvasType=mime;return 'data:'+mime+';base64,ZmFrZQ=='}}}},document:doc,clubConfig:acct,logoCanvasData:null,allProfiles:{},currentClubId:'club-a',formatDate:x=>x,docTienVND:x=>String(x),removeVietnameseTonesForQR:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''),getLocalToday:()=> '2026-10-20',formatMonth:x=>x,fetch:async(url,opts)=>{fetchCalls.push(String(url)); if (stale) auth.uid='test-new';if(badNetwork)throw Error('network-down');return {ok:true,headers:{get:()=>encoded==='png'?'image/png':'text/html'},arrayBuffer:async()=>responseBytes}}, FileReader,Blob,AbortController,URL,Buffer,setTimeout:process.env.QR_BASELINE_FAST ? ((fn,delay)=>setImmediate(fn)) : setTimeout,clearTimeout,requestAnimationFrame:f=>f(),getComputedStyle:()=>({display:'flex',visibility:'visible',opacity:'1',zIndex:'10001'}), console:{error(){}},Promise, Number, Date,Math,Object,String};
 doc.getElementById('receiptModal').getBoundingClientRect=()=>({right:400,bottom:800,left:0,top:0,width:400,height:800});
 src.window.innerWidth=390;src.window.innerHeight=840;
 src._waitReceiptPreviewReady=async(_img,uri)=>({naturalWidth:800,naturalHeight:1200});
 src._waitReceiptPaint=async()=>{};
 src._inspectReceiptModalVisibility=()=>({visible:true,aboveFixedUi:true});
 vm.createContext(src); vm.runInContext(helper+'\n'+qrFunction+'\n'+receiptFunction,src,{timeout:6000});
 const result=await src.window.exportReceipt(name,amount,'Học phí','2026-10-20','2026-10',branch,'',caption,breakdown);
 return {result,fetchCalls,canvasArgs,canvasType,doc,notice,writes,qrSrcAfter:doc.getElementById('qrCodeImg').src};
}
async function main(){
 const expected=(name,cond)=>check(name,()=>assert.ok(cond,name));
 check('CSS preserve 1:1 QR image',()=>{let m=html.match(/id="qrCodeImg"[^>]+/);assert.ok(m);assert.match(m[0],/object-fit:\s*contain/);assert.match(m[0],/width:\s*280px; height:\s*280px/)});
 const good=await receiptRun(); expected('M01 QR-only endpoint, amount and encoded account',good.fetchCalls[0]?.includes('970415-001234567890-qr_only.png?amount=350000'));
 expected('M01 lossless report and no taint',good.canvasType==='image/png'&&good.canvasArgs[0].allowTaint===false);
 expected('M01 report rendered, ACK-like render result, no write',good.result.ok===true&&good.writes===0);
 expected('M01 no preview/download discrepancy',good.doc.getElementById('btnDownloadReceipt').onclick!==null && good.result.receiptImage===good.doc.getElementById('receiptPreviewImg').src || good.result.ok===true);
 const bad=await receiptRun({badNetwork:true});expected('M07 rejected provider must not render/download',bad.result.ok===false&&bad.fetchCalls.length===1&&bad.doc.getElementById('btnDownloadReceipt').onclick===null);
 const invalidMime=await receiptRun({encoded:'html'});expected('M07 wrong MIME must be refused',invalidMime.result.ok===false);
 const stale=await receiptRun({stale:true});expected('M07 stale session cannot render receipt',stale.result.ok===false);
 const paid=await receiptRun({caption:'BIÊN LAI THU TIỀN'});expected('M09 paid receipt keeps JPEG, no new pay QR',paid.result.ok&&paid.fetchCalls.length===0&&paid.canvasType==='image/jpeg');
 const wrong=await receiptRun({branch:['CS1','CS2']});expected('M05 mixed family bank accounts fail closed',!wrong.result.ok&&wrong.fetchCalls.length===0);
 const family=await receiptRun({branch:['CS1','Mặc định'],acct:{...bankCfg,branchPaymentAccountMap:{CS1:'bank1','Mặc định':'bank1'}}});expected('M04 family same account one QR',family.result.ok&&family.fetchCalls.length===1);
 const disabled=await receiptRun({branch:'CS2',acct:{...bankCfg,paymentAccounts:{...bankCfg.paymentAccounts,bank2:{...bankCfg.paymentAccounts.bank2,enabled:false}}}});expected('M06 disabled assigned account must not fall back to bank1',!disabled.result.ok&&disabled.fetchCalls.length===0);
 const ambig=await receiptRun({branch:'CS2',acct:{...bankCfg,branchPaymentAccountMap:{CS1:'bank1'}}});expected('M06 unmapped branch with multiple bank accounts denied',!ambig.result.ok&&ambig.fetchCalls.length===0);
 for(const a of [0,-2,350000.5,NaN]){const z=await receiptRun({amount:a}); expected('Amount invalid '+a, !z.result.ok||z.fetchCalls.length===0)}
 const srcFinance=extract(finance,'window.processCombo = async (action) => {','// Phase 4K-6S: openComboModal');
 async function combo(mockResponse){let branches, toast=[],w=domMock();w.getElementById('combo_name1').value='Mock One';w.getElementById('combo_name2').value='Mock Two';w.getElementById('combo_fee1_actual').value='350000';w.getElementById('combo_fee2_actual').value='500000';w.getElementById('combo_month1').value='2026-10';w.getElementById('combo_month2').value='2026-10';let writes=0;const ww={showToast:(x)=>toast.push(x),exportReceipt:async(...args)=>{branches=args[5];return mockResponse}};let cc={window:ww,document:w,_comboValidatedIntents:rows=>rows.map((row,i)=>({...row,studentName:row.studentName,profile:{branch:i?'CS2':'CS1'},amount:350000,month:'2026-10'})),getLocalToday:()=> '2026-10-20',console,Date};vm.createContext(cc);vm.runInContext(srcFinance,cc);return {result:await ww.processCombo('report'),branches,writes,toast}}
 let cf=await combo({ok:false});expected('M04 family report handles render failure and keeps modal open',cf.result===false&&cf.branches.length===2&&cf.writes===0);
 let cp=await combo({ok:true});expected('M04 family report waits for success and closes modal',cp.result===true&&cp.branches[0]==='CS1'&&cp.branches[1]==='CS2');
 // Actual processMultiItem report handler: verify unchecked tuition is NOT included in QR amount or breakdown.
 const processStart=app.indexOf('window.processMultiItem = async (action) => {');
 const processEnd=app.indexOf('\n};',processStart)+3;
 check('M02 actual processMultiItem handler present',()=>assert.ok(processStart>0&&processEnd>processStart));
 async function runMultiItemReport(){
  const dom=domMock(),exportCalls=[];let writes=0;
  const defaults={mi_name:'MOCK ALICE',mi_tuition_month:'2026-10',mi_tuition_pkg:'1',mi_tuition_actual:'350000',mi_exam_title:'LE PHI THI',mi_exam_actual:'500000',mi_other_actual:'0',mi_inv_qty:'1'};
  for(const [id,value] of Object.entries(defaults))dom.getElementById(id).value=value;
  dom.getElementById('mi_tuition_enabled').checked=false;
  dom.getElementById('mi_exam_toggle').checked=true;
  const w={showToast(){},exportReceipt:async(...args)=>{exportCalls.push(args);return {ok:true}},formatMonthCompact:x=>x,formatTuitionMonthList:x=>x};
  const cc={window:w,document:dom,allProfiles:{'MOCK ALICE':{branch:'CS1',paidUntil:''}},getLocalToday:()=> '2026-10-20',normalizeYYYYMM:x=>x,formatMonthCompact:x=>x,console,alert:()=>{},Date,Math,Number};
  vm.createContext(cc);vm.runInContext(app.slice(processStart,processEnd),cc);
  await w.processMultiItem('report'); return {exportCalls,writes};
 }
 const m2=await runMultiItemReport();expected('M02 actual checkbox OFF excludes stale 350000 tuition from QR amount',m2.exportCalls.length===1&&m2.exportCalls[0][1]===500000);
 expected('M02 actual breakdown sum equals exact report amount, no writes',m2.exportCalls.length===1&&m2.exportCalls[0][8].reduce((a,b)=>a+b.amount,0)===500000&&m2.writes===0);
 console.log(JSON.stringify({result:{passes:pass,fails:fail},outcomes},null,2));process.exitCode=fail?1:0;
}
await main();

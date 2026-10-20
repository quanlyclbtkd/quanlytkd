import {syntheticForUrl,asData,publishExistingSettingsFixture,mockDocument} from './qr-v7/harness.mjs';
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
function domMock(){return mockDocument();}
const extract=(source,a,b)=>{let i=source.indexOf(a);if(i<0)throw Error('missing '+a);let e=source.indexOf(b,i);if(e<0)throw Error('end '+b);return source.slice(i,e)};
const helper=extract(app,'function normalizeBranchKeyForPayment','function maskAccountNumber');
const qrFunction=extract(app,'function generateVietQR','document.getElementById(\'transactionForm\')');
const receiptFunction=extract(app,app.includes('const _clearReceiptPreview =')?'const _clearReceiptPreview =':'const _exportReceiptNow = async','// Phase 4K-2B:');
const previewHelper=extract(app,'const _waitReceiptPreviewReady = async','const _waitReceiptPaint =');
async function receiptRun({report=true,acct=bankCfg,branch='CS1',amount=350000, badNetwork=false, encoded='png', stale=false, errorOnImage=false, caption='PHIẾU BÁO HỌC PHÍ', name='MOCK ALICE',breakdown=null, authReady=true}={}){
 const doc=domMock();let fetchCalls=[], canvasArgs=[],canvasType=null,notice=[], qrSrcAfter='',writes=0,downloads=0; const createElement=doc.createElement.bind(doc);doc.createElement=tag=>tag==='canvas'?createElement(tag):({click(){downloads++}});
 const auth={uid:'test-admin',clubId:'club-a',generation:1,ready:authReady};
 let responseBytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(240,1)]);
 class FileReader{readAsDataURL(b){this.result='data:image/png;base64,'+responseBytes.toString('base64');this.onload?.()}}
 const src={window:{showToast:(...x)=>notice.push(x),__verifiedAuthContextState:auth,getBranchNameDisplay:x=>x,formatMonthCompact:x=>x, html2canvas:async(node,opts)=>{canvasArgs.push(opts);return{toDataURL:(mime)=>{canvasType=mime;return mime==='image/png'?asData(responseBytes):'data:'+mime+';base64,ZmFrZQ=='}}}},document:doc,clubConfig:acct,logoCanvasData:null,allProfiles:{},currentClubId:'club-a',formatDate:x=>x,docTienVND:x=>String(x),removeVietnameseTonesForQR:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D'),getLocalToday:()=> '2026-10-20',formatMonth:x=>x,fetch:async(url,opts)=>{fetchCalls.push(String(url)); if (stale) auth.uid='test-new';if(badNetwork)throw Error('network-down');responseBytes=syntheticForUrl(url);return {url:String(url),ok:true,headers:{get:()=>encoded==='png'?'image/png':'text/html'},arrayBuffer:async()=>responseBytes}}, FileReader,Blob,AbortController,URL,Buffer,setTimeout:process.env.QR_BASELINE_FAST ? ((fn,delay)=>setImmediate(fn)) : setTimeout,clearTimeout,requestAnimationFrame:f=>f(),getComputedStyle:()=>({display:'flex',visibility:'visible',opacity:'1',zIndex:'10001'}), console:{error(){}},Promise, Number, Date,Math,Object,String};
 doc.getElementById('receiptModal').getBoundingClientRect=()=>({right:400,bottom:800,left:0,top:0,width:400,height:800});
 src.window.innerWidth=390;src.window.innerHeight=840;
 src._waitReceiptPaint=async()=>{};
 src._inspectReceiptModalVisibility=()=>({visible:true,aboveFixedUi:true});
 vm.createContext(src); vm.runInContext(helper+'\n'+qrFunction+'\n'+previewHelper+'\n'+receiptFunction,src,{timeout:6000});
 publishExistingSettingsFixture(src,acct);
 const result=await src.window.exportReceipt(name,amount,'Học phí','2026-10-20','2026-10',branch,'',caption,breakdown);
 return {result,fetchCalls,canvasArgs,canvasType,doc,notice,writes,qrSrcAfter:doc.getElementById('qrCodeImg').src,
    downloadCount:()=>downloads, failNextFetch:()=>{src.fetch=async()=>{throw Error('provider-down')}}, runAgain:(amt)=>src.window.exportReceipt('MOCK B',amt,'Học phí','2026-10-20','2026-10',branch,'',caption,breakdown),
    sameDomState:()=>({onclick:doc.getElementById('btnDownloadReceipt').onclick, modal:doc.getElementById('receiptModal').style.display})};
}
async function main(){
 const expected=(name,cond)=>check(name,()=>assert.ok(cond,name));
 check('CSS preserve 1:1 QR image',()=>{let m=html.match(/id="qrCodeImg"[^>]+/);assert.ok(m);assert.match(m[0],/object-fit:\s*contain/);assert.match(m[0],/width:\s*280px; height:\s*280px/)});
 const good=await receiptRun(); expected('M01 QR-only endpoint, amount and encoded account',good.fetchCalls[0]?.includes('970415-001234567890-qr_only.svg?amount=350000'));
 expected('M01 lossless report and no taint',good.canvasType==='image/png'&&good.canvasArgs[0].allowTaint===false);
 expected('M01 report rendered, ACK-like render result, no write',good.result.ok===true&&good.writes===0);
 expected('M01 no preview/download discrepancy',good.doc.getElementById('btnDownloadReceipt').onclick!==null && good.result.receiptImage===good.doc.getElementById('receiptPreviewImg').src);
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
  const writerSpy=()=>{writes++; throw Error('Financial writer invoked during report');};
  const cc={window:w,document:dom,setDoc:writerSpy,addDoc:writerSpy,updateDoc:writerSpy,deleteDoc:writerSpy,writeBatch:writerSpy,runTransaction:writerSpy,TuitionCommandBoundary:{collectTuition:writerSpy},allProfiles:{'MOCK ALICE':{branch:'CS1',paidUntil:''}},getLocalToday:()=> '2026-10-20',normalizeYYYYMM:x=>x,formatMonthCompact:x=>x,console,alert:()=>{},Date,Math,Number};
  vm.createContext(cc);vm.runInContext(app.slice(processStart,processEnd),cc);
  await w.processMultiItem('report'); return {exportCalls,writes};
 }
 const m2=await runMultiItemReport();expected('M02 actual checkbox OFF excludes stale 350000 tuition from QR amount',m2.exportCalls.length===1&&m2.exportCalls[0][1]===500000);
 expected('M02 actual breakdown sum equals exact report amount, no writes',m2.exportCalls.length===1&&m2.exportCalls[0][8].reduce((a,b)=>a+b.amount,0)===500000&&m2.writes===0);
 // V4 real-owner A01–A14: independent outcomes, no bank fallback is allowed.
 const cloned=x=>JSON.parse(JSON.stringify(x));
 const a01cfg=cloned(bankCfg);
 a01cfg.paymentAccounts.bank1.enabled=false;
 a01cfg.branchPaymentAccountMap={};
 const a01=await receiptRun({acct:a01cfg,branch:'CS1'});
 expected('A01 disabled bank1 + enabled bank2 no map must emit zero QR URLs',!a01.result.ok&&a01.fetchCalls.length===0&&a01.doc.getElementById('btnDownloadReceipt').onclick===null);
 const a02cfg=cloned(bankCfg);a02cfg.paymentAccounts.bank1.enabled=false;
 const a02=await receiptRun({acct:a02cfg,branch:'CS1'});
 expected('A02 explicit mapped disabled bank1 no fallback',!a02.result.ok&&a02.fetchCalls.length===0);
 const a03cfg=cloned(bankCfg);a03cfg.branchPaymentAccountMap={};
 const a03=await receiptRun({acct:a03cfg,branch:'CS1'});
 expected('A03 ambiguous unmapped two banks fail closed',!a03.result.ok&&a03.fetchCalls.length===0);
 const a04cfg=cloned(bankCfg);a04cfg.branchPaymentAccountMap={CS1:''};
 const a04=await receiptRun({acct:a04cfg,branch:'CS1'});
 expected('A04 explicitly empty bank mapping fails',!a04.result.ok&&a04.fetchCalls.length===0);
 const a05=await receiptRun({acct:cloned(bankCfg),branch:'CS2'});
 expected('A05 explicitly mapped bank2 keeps leading-zero account',a05.result.ok&&a05.fetchCalls.length===1&&a05.fetchCalls[0].includes('970436-009988776655-qr_only'));
 const a06cfg={bankId:'970415',accountNo:'001234567890',accountName:'LEGACY OWNER',branchCount:1};
 const a06=await receiptRun({acct:a06cfg,branch:'CS1'});
 expected('A06 documented legacy-only single-branch full tuple',a06.result.ok&&a06.fetchCalls[0]?.includes('970415-001234567890-qr_only'));
 const legacyUnverified=await receiptRun({acct:{bankId:'970415',accountNo:'001234567890',accountName:'LEGACY OWNER'},branch:'CS1'});
 expected('A06 legacy bank without proven single-branch policy must fail closed',!legacyUnverified.result.ok&&legacyUnverified.fetchCalls.length===0);
 const a07cfg=cloned(bankCfg);a07cfg.branchPaymentAccountMap={CS1:'bank1','Mặc định':'bank2'};
 const a07=await receiptRun({acct:a07cfg,branch:'Mặc định'});
 expected('A07 branch aliases disagree on bank mapping DENY',!a07.result.ok&&a07.fetchCalls.length===0);
 const a07Reverse=await receiptRun({acct:a07cfg,branch:'CS1'});
 expected('A07 conflicting Mặc định alias must also block direct CS1 branch',!a07Reverse.result.ok&&a07Reverse.fetchCalls.length===0);
 const a08cfg=cloned(bankCfg);delete a08cfg.paymentAccounts.bank2.accountNo;
 const a08=await receiptRun({acct:a08cfg,branch:'CS2'});
 expected('A08 mapped bank2 incomplete cannot mix bank1 accountNo',!a08.result.ok&&a08.fetchCalls.length===0);
 const a09cfg=cloned(bankCfg);a09cfg.paymentAccounts.bank2.accountName='OTHER OWNER';a09cfg.paymentAccounts.bank2.bankId=a09cfg.paymentAccounts.bank1.bankId;a09cfg.paymentAccounts.bank2.accountNo=a09cfg.paymentAccounts.bank1.accountNo;
 const a09=await receiptRun({acct:a09cfg,branch:['CS1','CS2']});
 expected('A09 family different account holder despite same bank/account denies unverified tuple',!a09.result.ok&&a09.fetchCalls.length===0);
 const a11=await receiptRun({acct:cloned(bankCfg)});
 const a11click=a11.doc.getElementById('btnDownloadReceipt').onclick;
 expected('A11 first report has an active download',a11.result.ok&&typeof a11click==='function');
 const a11bad=await a11.runAgain(NaN);
 expected('A11 same DOM invalid next report clears previous download + modal',!a11bad.ok&&a11.sameDomState().onclick===null&&a11.sameDomState().modal==='none');
 const a12cfg=cloned(bankCfg),a12=await receiptRun({acct:a12cfg});
 a12cfg.paymentAccounts.bank1.enabled=false;
 const a12callback=a12.doc.getElementById('btnDownloadReceipt').onclick;
 if (typeof a12callback==='function') a12callback();
 expected('A12 after-open config change cannot click old downloaded receipt',a12.downloadCount()===0&&a12.sameDomState().onclick===null);
 const a13=await receiptRun({amount:0});
 expected('A13 zero amount report not a payable QR or success',!a13.result.ok&&a13.fetchCalls.length===0);
 const a12Unverified=await receiptRun({authReady:false});
 expected('A12 report rejects unverified Auth principal before QR fetch',!a12Unverified.result.ok&&a12Unverified.fetchCalls.length===0);
 const a14=await receiptRun({breakdown:[{label:'<img src=x onerror=alert(1)> & "Lệ phí"',amount:350000}]});
 expected('A14 receipt breakdown HTML escapes untrusted labels',a14.result.ok&&!a14.doc.getElementById('r_breakdown_table').innerHTML.includes('<img')&&a14.doc.getElementById('r_breakdown_table').innerHTML.includes('&lt;img'));
 const a01Single=cloned(bankCfg);a01Single.branchPaymentAccountMap={};a01Single.paymentAccounts.bank2.enabled=false;
 const single=await receiptRun({acct:a01Single});
 expected('A03 only one active paymentAccounts without explicit mapping remains blocked pending owner policy',!single.result.ok&&single.fetchCalls.length===0);
 const a02Missing=cloned(bankCfg);a02Missing.branchPaymentAccountMap={CS1:'bank3'};
 const missing=await receiptRun({acct:a02Missing});
 expected('A02 unknown explicit map never falls back to bank1',!missing.result.ok&&missing.fetchCalls.length===0);
 const overflow=await receiptRun({amount:9007199254740992});
 expected('A13 unsafe integer amount cannot generate QR',!overflow.result.ok&&overflow.fetchCalls.length===0);
 const a11net=await receiptRun({acct:cloned(bankCfg)});a11net.failNextFetch();
 const a11netBad=await a11net.runAgain(350000);
 expected('A11 same DOM provider failure after success clears older receipt button/modal',!a11netBad.ok&&a11net.sameDomState().onclick===null&&a11net.sameDomState().modal==='none');


 console.log(JSON.stringify({result:{passes:pass,fails:fail},outcomes},null,2));process.exitCode=fail?1:0;
}
await main();

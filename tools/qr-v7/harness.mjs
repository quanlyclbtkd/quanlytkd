import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

export const root = process.env.QR_TEST_SOURCE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
export const cut = (s,a,b) => {
  const i=s.indexOf(a), j=s.indexOf(b,i);
  if(i<0 || j<0) throw Error('Missing actual-source boundary: '+a);
  return s.slice(i,j);
};
const requireVendor=createRequire(import.meta.url);
const {PNG}=requireVendor('./vendor/pngjs/lib/png.js');
const decoderContext={}; vm.createContext(decoderContext);
vm.runInContext(fs.readFileSync(new URL('./vendor/jsQR.js',import.meta.url),'utf8'),decoderContext);
export function decodePng(bytes) {
  const p=PNG.sync.read(Buffer.from(bytes));
  const q=decoderContext.jsQR(new Uint8ClampedArray(p.data),p.width,p.height);
  if(!q) throw Error('Independent jsQR found no QR pixels');
  return {payload:q.data,width:p.width,height:p.height,location:q.location,version:q.version};
}
export const bankConfig=()=>({branchCount:2,branchName1:'Huỳnh Tấn Phát',branchName2:'Sân vận động',paymentAccounts:{bank1:{bankId:'MB',accountNo:'001234567890',accountName:'TEST ONLY',enabled:true},bank2:{bankId:'VCB',accountNo:'009988776655',accountName:'TEST ALT',enabled:true}},branchPaymentAccountMap:{CS1:'bank1',CS2:'bank2'}});
const bankHelpers=(await import(pathToFileURL(path.join(root,'js/modules/qrBankingHelpers.js')))).QRBankingHelpers;
const fixtureDir=path.dirname(fileURLToPath(import.meta.url))+'/fixtures';
export const pngFixture=name=>fs.readFileSync(path.join(fixtureDir,name));
export class IndependentPixelTestAdapter {
  async detect(img) {
    const q=decodePng(Buffer.from(String(img.src).split(',')[1],'base64')),l=q.location;
    // Plain-object DOM doubles only; real browser dimensions are read-only.
    try {img.naturalWidth=q.width;img.naturalHeight=q.height;}catch(_){}
    return [{rawValue:q.payload,boundingBox:{x:l.topLeftCorner.x,y:l.topLeftCorner.y,width:l.topRightCorner.x-l.topLeftCorner.x,height:l.bottomLeftCorner.y-l.topLeftCorner.y}}];
  }
}
export function publishExistingSettingsFixture(c,config) {
  c.window.QRBankingHelpers=bankHelpers;c.window.BarcodeDetector=IndependentPixelTestAdapter;
  c.window.getDebtProfileCoverageStatus=()=>({ready:true,clubId:c.currentClubId});
  c.clubId=c.currentClubId;c._settingsKey='global:settings:'+c.clubId;
  c._snapshot={exists:()=>true,data:()=>config,metadata:{fromCache:false,hasPendingWrites:false}};
  c._updateHydrationMetrics=()=>{};c.applyClubConfigUI=()=>{};c.scheduleRender=()=>{};c.CustomEvent=class{};
  c.window.RoleReadBoundary={isCoachAttendanceOnly:()=>false,canMount:()=>false};c.window.dispatchEvent=()=>{};
  vm.runInContext(`{${cut(source,'const _completeSettingsReady =','const _settingsCb =')}${cut(source,'const _settingsCb =','if (_coachAttendanceOnlyRuntime)')} _settingsCb(_snapshot);}`,c);
}
export const asData=bytes=>'data:image/png;base64,'+Buffer.from(bytes).toString('base64');
export function syntheticForUrl(url) {
  const u=new URL(url),parts=u.pathname.split('/').pop().split('-');
  const result=spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python',['tools/qr-v7/encode-fixture.py'],{input:JSON.stringify({bankBin:parts[0],accountNo:parts[1],amount:Number(u.searchParams.get('amount')),memo:u.searchParams.get('addInfo')})});
  if(result.status!==0)throw Error(String(result.stderr));return result.stdout;
}
export function mockDocument() {
  const elements=new Map();
  return {elements,documentElement:{clientWidth:390,clientHeight:840},getElementById(id){
    if(!elements.has(id)) elements.set(id,{id,value:'',checked:false,style:{},dataset:{},innerHTML:'',innerText:'',textContent:'',src:'',onclick:null,complete:true,naturalWidth:490,naturalHeight:490,classList:{remove(){},add(){}},removeAttribute(p){this[p]='';},getBoundingClientRect(){return{left:0,top:0,right:390,bottom:840,width:390,height:840};},async decode(){if(!this.src)throw Error('missing image');try{const p=PNG.sync.read(Buffer.from(this.src.split(',')[1],'base64'));this.naturalWidth=p.width;this.naturalHeight=p.height;}catch(e){throw Error('invalid image pixels');}}});
    return elements.get(id);
  },querySelectorAll(){return[];},createElement(){return{click(){}};}};
}
export async function createHarness({config=bankConfig(), hydrate=true,metadata={fromCache:false,hasPendingWrites:false},providerBytes,previewBytes,network='ok',nativeDecoder=true}={}) {
  const document=mockDocument(), events=[],writes=[],fetches=[],downloads=[],renders=[];
  const auth={uid:'qa-admin',clubId:'club-a',role:'admin',coachBranch:'',generation:1,ready:true};
  const failWrite=(...a)=>{writes.push(a);throw Error('Report reached SDK/financial writer');};
  let net=network;
  let bytes=typeof providerBytes==='function'?pngFixture('valid.png'):providerBytes || pngFixture('valid.png');
  class FileReader {readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result=asData(b);this.onload?.();},e=>this.onerror?.(e));}}
  class PixelDetector {
    async detect(img) {
      const data=img.src || img.toDataURL?.('image/png');
      const q=decodePng(Buffer.from(String(data).split(',')[1],'base64'));
      const l=q.location;
      return [{rawValue:q.payload,cornerPoints:[l.topLeftCorner,l.topRightCorner,l.bottomRightCorner,l.bottomLeftCorner],boundingBox:{x:l.topLeftCorner.x,y:l.topLeftCorner.y,width:l.topRightCorner.x-l.topLeftCorner.x,height:l.bottomLeftCorner.y-l.topLeftCorner.y}}];
    }
  }
  const w={QRBankingHelpers:bankHelpers,__verifiedAuthContextState:auth,__store:{clubId:'club-a',_debtProfileCoverageReady:true},
    getDebtProfileCoverageStatus:()=>({ready:true,clubId:'club-a'}),showToast:(...a)=>events.push(a),getBranchNameDisplay:x=>x,formatMonthCompact:x=>x,
    formatTuitionMonthList:x=>x.join(','),
    html2canvas:async(node,opts)=>{renders.push(opts);return{width:980,height:980,toDataURL:m=>m==='image/png'?asData(previewBytes || bytes):'data:image/jpeg;base64,TEST'};},
    innerWidth:390,innerHeight:840,dispatchEvent(){},RoleReadBoundary:{isCoachAttendanceOnly:()=>false,canMount:()=>false},
    loadInvCategories:async()=>{},invalidateByDomain(){},
    TuitionCommandBoundary:{collectTuition:failWrite},FinanceService:{commitAtomicWritePlan:failWrite},InventoryService:{addItem:failWrite},
  };
  if(nativeDecoder) w.BarcodeDetector=PixelDetector;
  document.createElement=()=>({click(){downloads.push(this.href);}});
  const c={window:w,document,clubConfig:config,currentClubId:'club-a',allProfiles:{'TEST VDV':{branch:'CS1',tuitionFee:500000,paidUntil:'2026-09'}},logoCanvasData:null,
    getLocalToday:()=> '2026-10-20',formatDate:x=>x,formatMonth:x=>x?x.split('-').reverse().join('/'):'',docTienVND:x=>String(x),normalizeYYYYMM:x=>x,
    removeVietnameseTonesForQR:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D'),
    fetch:async(url,opts)=>{fetches.push({url:String(url),opts});if(net==='cors')throw new TypeError('Failed to fetch');if(net==='redirect')return{redirected:true,ok:true,type:'cors',headers:{get:()=> 'image/png'}};if(typeof providerBytes==='function')bytes=await providerBytes(url);return{ok:net!=='http',status:net==='http'?503:200,redirected:false,type:'cors',headers:{get:()=>net==='mime'?'text/html':'image/png'},arrayBuffer:async()=>bytes};},
    Blob,FileReader,AbortController,URL,Uint8Array,Uint8ClampedArray,TextEncoder,TextDecoder,
    console:{error:(...a)=>events.push(a),warn:(...a)=>events.push(a),log(){}},setTimeout,clearTimeout,Date,Math,Number,Promise,
    requestAnimationFrame:f=>f(),getComputedStyle:()=>({display:'flex',visibility:'visible',opacity:'1',zIndex:'10001'}),
    _updateHydrationMetrics(){},applyClubConfigUI(){},scheduleRender(){},CustomEvent:class{},alert:x=>events.push(['ALERT',x]),
    setDoc:failWrite,addDoc:failWrite,updateDoc:failWrite,deleteDoc:failWrite,writeBatch:failWrite,runTransaction:failWrite,
  };
  vm.createContext(c);
  vm.runInContext(cut(source,'function normalizeBranchKeyForPayment','function maskAccountNumber')+'\n'+cut(source,'function generateVietQR',"document.getElementById('transactionForm')")+'\n'+cut(source,'const _waitReceiptPreviewReady = async','// Phase 4K-2B:'),c);
  function publish(next=config,meta=metadata) {
    c.clubConfig=next;
    c._snapshot={exists:()=>true,data:()=>next,metadata:meta};
    c._settingsKey='global:settings:club-a';c.clubId='club-a';
    const pre=source.includes('const _settingsOwnerAtMount =')?cut(source,'const _settingsOwnerAtMount =','const _settingsCb ='):'';
    const callback=cut(source,'const _settingsCb =','if (_coachAttendanceOnlyRuntime)');
    vm.runInContext(`{${pre}${callback}\n_settingsCb(_snapshot);}`,c);
  }
  // Run the original readiness completion and callback; never fabricate a receipt authority seal.
  vm.runInContext(cut(source,'const _completeSettingsReady =',source.includes('const _settingsOwnerAtMount =')?'const _settingsOwnerAtMount =':'const _settingsCb ='),c);
  if(hydrate)publish();
  return {c,w,document,events,writes,fetches,downloads,renders,publish,setNetwork:x=>{net=x;},run:(title='PHIẾU BÁO HỌC PHÍ',branch='CS1',amount=500000,months='2026-10',name='TEST VDV',bd=null)=>w.exportReceipt(name,amount,'Học phí','2026-10-20',months,branch,'',title,bd),eval:s=>vm.runInContext(s,c)};
}

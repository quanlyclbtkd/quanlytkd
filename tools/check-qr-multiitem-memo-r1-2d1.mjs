import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const root=process.env.R1_2D1_TEST_SOURCE_ROOT || path.resolve(import.meta.dirname,'..');
process.chdir(root);
process.env.QR_TEST_SOURCE_ROOT=root;
const {createHarness,syntheticForUrl}=await import(pathToFileURL(path.join(root,'tools/qr-v7/harness.mjs'))+'?r1d1='+Date.now());
const {formatMonthCompact}=await import(pathToFileURL(path.join(root,'js/utils/format.js'))+'?r1d1fmt='+Date.now());
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);if(i<0||j<0)throw new Error('Missing actual-source boundary: '+a);return app.slice(i,j);};
const helperSource=
  cut('window.normalizeTuitionMonthForMultiItem =','window.addMonthsForMultiItem =')+
  cut('window.addMonthsForMultiItem =','window.getSelectedMultiItemTuitionPackageState =')+
  cut('window.buildMultiItemTuitionPackageMonths =','window.debugMultiItemTuitionPackageCoverage =');
const processSource=cut('window.processMultiItem = async (action) => {','// ─── Setup currency inputs for multi-item modal');
let pass=0,fail=0;
const check=(name,fn)=>{try{fn();pass++;console.log('PASS',name);}catch(e){fail++;console.error('FAIL',name,'::',e.message);}};
const checkAsync=async(name,fn)=>{try{await fn();pass++;console.log('PASS',name);}catch(e){fail++;console.error('FAIL',name,'::',e.message);}};
function attrs(el,initial={}){const bag=new Map(Object.entries(initial));el.getAttribute=k=>bag.has(k)?String(bag.get(k)):null;el.setAttribute=(k,v)=>bag.set(k,String(v));el.removeAttribute=k=>bag.delete(k);return el;}
function setEl(doc,id,props={}){const el=doc.getElementById(id);Object.assign(el,props);return el;}
function monthList(start,count){let [y,m]=start.split('-').map(Number),out=[];for(let i=0;i<count;i++){let mm=m+i,yy=y;while(mm>12){mm-=12;yy++;}out.push(`${yy}-${String(mm).padStart(2,'0')}`);}return out;}
const sameMonths=(actual,expected)=>assert.equal(JSON.stringify(Array.from(actual||[])),JSON.stringify(expected));
async function runActual({name='Trần Thị Huyền Trang',start='2026-11',pkg=1,tuition=true,tuitionAmount=400000,debt=0,inventoryPurchase=0,nonContiguous=null}={}){
  const h=await createHarness({providerBytes:async url=>syntheticForUrl(url)});
  h.c.allProfiles[name]={branch:'CS1',tuitionFee:400000,paidUntil:'2026-10',skippedMonths:[]};
  h.w.allProfiles=h.c.allProfiles;
  h.w.formatMonthCompact=formatMonthCompact;
  h.w.formatTuitionMonthList=months=>formatMonthCompact(months.join(','));
  vm.runInContext(helperSource,h.c);
  const pkgEl=attrs(setEl(h.document,'mi_tuition_pkg',{value:String(pkg),selectedIndex:0}));
  const debtOption=Array.isArray(nonContiguous)&&nonContiguous.length>0;
  pkgEl.options=[{getAttribute:key=>key==='data-debt'&&debtOption?'true':null}];
  if(debtOption) pkgEl.setAttribute('data-months',JSON.stringify(nonContiguous));
  setEl(h.document,'mi_name',{value:name});
  setEl(h.document,'mi_tuition_month',{value:tuition?start:''});
  setEl(h.document,'mi_tuition_actual',{value:tuition?String(tuitionAmount*pkg):'0'});
  setEl(h.document,'mi_tuition_enabled',{checked:tuition});
  setEl(h.document,'mi_exam_toggle',{checked:false});
  setEl(h.document,'mi_exam_title',{value:''});
  setEl(h.document,'mi_exam_actual',{value:'0'});
  setEl(h.document,'mi_other_toggle',{checked:false});
  setEl(h.document,'mi_other_desc',{value:''});
  setEl(h.document,'mi_other_actual',{value:'0'});
  setEl(h.document,'mi_inv_toggle',{checked:inventoryPurchase>0});
  setEl(h.document,'mi_inv_category',{value:'Võ phục'});
  setEl(h.document,'mi_inv_size_select',{value:inventoryPurchase>0?'M':''});
  setEl(h.document,'mi_inv_size_text',{value:''});
  setEl(h.document,'mi_inv_qty',{value:'1'});
  setEl(h.document,'mi_inv_price_actual',{value:inventoryPurchase?String(inventoryPurchase):'0'});
  setEl(h.document,'mi_inv_total_actual',{value:inventoryPurchase?String(inventoryPurchase):'0'});
  setEl(h.document,'multiItemModal',{style:{display:'flex'}});
  const debtChecks=debt>0?[{getAttribute:key=>({
    'data-inv-id':'inv-debt-1','data-amount':String(debt),'data-label':'Bảo hộ M'
  })[key]??null}]:[];
  h.document.querySelectorAll=sel=>sel==='.mi-inv-debt-check:checked'?debtChecks:[];
  vm.runInContext(processSource,h.c);
  const result=await h.w.processMultiItem('report');
  const memo=h.fetches[0]?new URL(h.fetches[0].url).searchParams.get('addInfo')||'':'';
  return {h,result,memo,months:Array.from(h.w.__miLastPackageMonths||[]),providerCalls:h.fetches.length,writes:h.writes.length};
}

check('supported UI package options include 1/3/6/9/12',()=>{for(const p of ['1','3','6','9','12'])assert(index.includes(`<option value="${p}">${p} Tháng</option>`));});

const screenshot=await runActual({pkg:1,debt:230000});
console.log('SCREENSHOT_REGRESSION',JSON.stringify({months:screenshot.months,memo:screenshot.memo,providerCalls:screenshot.providerCalls,result:screenshot.result?.ok?'PASS':screenshot.result?.reason,writes:screenshot.writes}));
check('R1.2D screenshot 1-month mixed case remains exact QR PASS',()=>{assert.equal(screenshot.result?.ok,true);assert.equal(screenshot.memo,'Tran Thi Huyen Trang HP T11 2026');sameMonths(screenshot.months,['2026-11']);assert.equal(screenshot.providerCalls,1);assert.equal(screenshot.writes,0);});

const packageResults=[];
for(const pkg of [1,3,6,9,12]){
  const r=await runActual({pkg});
  const row={pkg,months:r.months,memo:r.memo,providerCalls:r.providerCalls,result:r.result?.ok?'PASS':r.result?.reason||'FAIL',writes:r.writes};
  packageResults.push(row);console.log('PACKAGE_RESULT',JSON.stringify(row));
  check(`${pkg}-month runtime generated canonical packageMonths`,()=>sameMonths(r.months,monthList('2026-11',pkg)));
  check(`${pkg}-month report path performs zero business writes`,()=>assert.equal(r.writes,0));
  if(pkg===1){check('1-month pure Tuition remains QR PASS',()=>{assert.equal(r.result?.ok,true);assert.equal(r.memo,'Tran Thi Huyen Trang HP T11 2026');});}
  else check(`${pkg}-month never succeeds as first-month-only QR`,()=>{
    const firstMonthOnly=r.result?.ok===true && r.memo==='Tran Thi Huyen Trang HP T11 2026';
    assert.equal(firstMonthOnly,false,`packageMonths=${JSON.stringify(r.months)} memo=${r.memo}`);
    if(r.result?.ok!==true){assert.equal(r.result?.reason,'MEMO_TOO_LONG');assert.equal(r.providerCalls,0,'fail-closed must happen before provider');}
  });
}

for(const pkg of [3,6,9,12]){
  const r=await runActual({pkg,debt:230000});
  console.log('MIXED_PACKAGE_RESULT',JSON.stringify({pkg,months:r.months,memo:r.memo,providerCalls:r.providerCalls,result:r.result?.ok?'PASS':r.result?.reason,writes:r.writes}));
  check(`mixed ${pkg}-month + warehouse debt never succeeds first-month-only`,()=>{
    assert.equal(r.writes,0);
    assert.equal(r.result?.ok===true && r.memo==='Tran Thi Huyen Trang HP T11 2026',false);
    if(r.result?.ok!==true){assert.equal(r.result?.reason,'MEMO_TOO_LONG');assert.equal(r.providerCalls,0);}
  });
}

const crossYear=await runActual({name:'An',pkg:3});
console.log('CROSS_YEAR_RESULT',JSON.stringify({months:crossYear.months,memo:crossYear.memo,result:crossYear.result?.ok?'PASS':crossYear.result?.reason}));
check('cross-year contiguous package can preserve all canonical months exactly when memo fits',()=>{
  sameMonths(crossYear.months,['2026-11','2026-12','2027-01']);assert.equal(crossYear.result?.ok,true);
  assert.equal(crossYear.memo,'An Hoc Phi Thang T11 T12 2026 T1 2027');
});

const noncontiguous=['2026-11','2027-01','2027-03'];
const sparse=await runActual({name:'An',pkg:3,nonContiguous:noncontiguous});
console.log('NONCONTIGUOUS_RESULT',JSON.stringify({months:sparse.months,memo:sparse.memo,result:sparse.result?.ok?'PASS':sparse.result?.reason}));
check('non-contiguous canonical months are not represented as a false continuous range',()=>{
  sameMonths(sparse.months,noncontiguous);assert.equal(sparse.result?.ok,true);
  assert.equal(sparse.memo,'An Hoc Phi Thang T11 2026 T1 T3 2027');
});

const inventoryOnly=await runActual({name:'An',tuition:false,pkg:1,inventoryPurchase:230000});
console.log('NON_TUITION_RESULT',JSON.stringify({memo:inventoryOnly.memo,result:inventoryOnly.result?.ok?'PASS':inventoryOnly.result?.reason}));
check('non-Tuition report remains on existing generic memo path',()=>{assert.equal(inventoryOnly.result?.ok,true);assert(!inventoryOnly.memo.includes(' HP '));assert.equal(inventoryOnly.writes,0);});

check('production source gives canonical Tuition packageMonths precedence over txMonth fallback',()=>{
  const start=app.indexOf('const _tuitionMemoMonths =');const section=app.slice(start,start+420);
  const p=section.indexOf('_tuitionComponent');const t=section.indexOf("type === 'Học phí' && txMonth");assert(p>=0&&t>=0&&p<t,section);
});
check('month count is not derived from money in processMultiItem',()=>{const s=processSource;assert(!/tuition\s*\/\s*tuitionFee|total\s*\/\s*tuitionFee/.test(s));});

console.log('R1_2D1_MATRIX',JSON.stringify(packageResults));
console.log(`R1_2D1_QR_RESULT ${JSON.stringify({pass,fail,total:pass+fail})}`);
if(fail)process.exit(1);

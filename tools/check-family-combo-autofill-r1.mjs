import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=path.resolve(process.env.FAMILY_TEST_SOURCE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const {normalizeYYYYMM}=await import(pathToFileURL(path.join(root,'js/utils/format.js')));
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);assert(i>=0&&j>i,a);return app.slice(i,j);};
const actualHandler=cut('const setupAutocomplete =','const _acInputIds =');
const actualHelper=cut('window.getChargeableTuitionMonths =','// Phase 4K-5M — formatTuitionMonthList');
const outcomes=[],observations=[];
function check(name,fn){try{fn();outcomes.push({name,result:'PASS'});console.log('PASS',name);}catch(e){outcomes.push({name,result:'FAIL',reason:e.message});console.error('FAIL',name,e.message);}}
function harness(profiles,horizon='2026-11',row=1){
 const nodes=new Map();let totals=0,reads=0,calls=[];
 const element=()=>{let html='';return {value:'',style:{},children:[],dataset:{},appendChild(x){this.children.push(x);},get innerHTML(){return html;},set innerHTML(x){html=x;this.children=[];}};};
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element};
 const w={__store:{profiles},updateComboTotal:()=>{totals++;},getBranchNameDisplay:x=>x,escapeHtml:x=>String(x),showToast(){}};
 const noRead=()=>{reads++;throw Error('Autofill must not read Firestore');};
 const c=vm.createContext({window:w,document,allProfiles:profiles,clubConfig:{branchCount:1},normalizeYYYYMM,getLocalToday:()=> '2026-11-07',console,getDoc:noRead,getDocs:noRead,onSnapshot:noRead,runTransaction:noRead});
 vm.runInContext(fs.readFileSync(path.join(root,'js/core/tuitionDebtCanonical.js'),'utf8')+'\n'+actualHelper,c);
 const canonical=w.getChargeableTuitionMonths;
 w.getChargeableTuitionMonths=(p,m,o)=>{calls.push({profile:p,month:m,options:o});return canonical(p,m,o);};
 document.getElementById('filterMonth').value=horizon;
 vm.runInContext(actualHandler+`\nsetupAutocomplete('combo_name${row}','combo-autocomplete-${row}','combo${row}');`,c);
 const inp=document.getElementById('combo_name'+row),list=document.getElementById('combo-autocomplete-'+row);
 const state=()=>({name:inp.value,fee:document.getElementById(`combo_fee${row}_actual`).value,display:document.getElementById(`combo_fee${row}_display`).value,month:document.getElementById('combo_month'+row).value});
 function input(value){inp.value=value;inp.oninput.call(inp);}
 function select(name){input(name);assert.equal(list.children.length,1,'exact suggestion fixture');list.children[0].onclick();}
 return {w,document,profiles,input,select,state,calls,get totals(){return totals;},get reads(){return reads;},focus:()=>inp.onfocus.call(inp),list};
}
const paidUntil=p=>({tuitionFee:500000,branch:'CS1',status:'active',paidUntil:p});
for(const row of [1,2]){
 for(const [id,p,expected] of [
  ['A01',paidUntil('2026-10'),'2026-11'],
  ['A02',paidUntil('2026-08'),'2026-09'],
  ['A03',{...paidUntil('2026-08'),skippedMonths:['2026-09','2026-10']},'2026-11'],
  ['A04',paidUntil('2026-11'),''],
  ['A05',{...paidUntil('2026-08'),feeExempt:true},'']
 ]){
  const h=harness({Alice:p},'2026-11',row);h.select('Alice');observations.push({id,row,...h.state()});
  check(`${id} combo${row} canonical default`,()=>assert.equal(h.state().month,expected));
  check(`${id} combo${row} delegates exact profile/horizon/reason`,()=>{assert.equal(h.calls.length,1);assert.equal(h.calls[0].profile,p);assert.equal(h.calls[0].month,'2026-11');assert.equal(h.calls[0].options.reason,'family-combo-autofill');});
  check(`${id} combo${row} zero SDK reads`,()=>assert.equal(h.reads,0));
 }
 for(const status of ['quit','inactive']){
  const h=harness({Alice:{...paidUntil('2026-08'),status}},'2026-11',row);h.input('Alice');
  // Existing canonical status classifier is normally installed before this UI.
  if(status==='quit')check(`A06 combo${row} quit not selectable`,()=>assert.equal(h.list.children.length,0));
  check(`A06 combo${row} ${status} canonical authority returns no months`,()=>assert.equal(h.w.getChargeableTuitionMonths(h.profiles.Alice,'2026-11').length,0));
 }
 const h=harness({Alice:paidUntil('2026-08'),Bob:{...paidUntil('2026-10'),tuitionFee:0},Carol:{...paidUntil('2026-10'),tuitionFee:300000}},'2026-11',row);
 h.select('Alice');h.input('Bob');observations.push({id:'STALE_TEXT',row,...h.state()});
 check(`B01 combo${row} editing name clears all dependent state`,()=>assert.deepEqual(h.state(),{name:'Bob',fee:'',display:'',month:''}));
 h.select('Alice');h.select('Bob');
 check(`B02 combo${row} zero fee never inherits previous fee`,()=>{assert.equal(h.state().fee,'');assert.equal(h.state().display,'');});
 h.select('Alice');h.select('Carol');
 check(`B03 combo${row} new month and fee are profile-bound`,()=>{assert.equal(h.state().month,'2026-11');assert.equal(Number(h.state().fee),300000);});
 const before=h.state();h.focus();
 check(`B04 combo${row} focus without edit preserves selected state`,()=>assert.deepEqual(h.state(),before));
 h.profiles.Bob.tuitionFee=undefined;h.select('Alice');h.select('Bob');
 check(`B05 combo${row} missing fee clears previous state`,()=>{assert.equal(h.state().fee,'');assert.equal(h.state().display,'');});
 check(`B06 combo${row} total refreshed`,()=>assert(h.totals>0));
}
for(const horizon of ['', '2026-13','not-a-month']){
 const h=harness({Alice:paidUntil('2026-10')},horizon);h.select('Alice');
 check(`A09 invalid horizon ${JSON.stringify(horizon)} uses local month`,()=>{assert.equal(h.calls[0]?.month,'2026-11');assert.equal(h.state().month,'2026-11');});
}
{
 const h=harness({Alice:paidUntil('2026-01')});h.w.getChargeableTuitionMonths=()=>['2026-10','2026-09'];h.select('Alice');
 check('A10 canonical result order is preserved without local sorting',()=>assert.equal(h.state().month,'2026-10'));
}
{
 const h=harness({Alice:paidUntil('2026-10')});delete h.w.getChargeableTuitionMonths;h.select('Alice');
 check('A11 missing canonical helper does not invent a month',()=>assert.equal(h.state().month,''));
}
const failed=outcomes.filter(x=>x.result==='FAIL').length;
console.log('FAMILY_AUTOFILL_RESULT',JSON.stringify({sourceRoot:root,passed:outcomes.length-failed,failed,observations,outcomes}));
if(failed)process.exitCode=1;

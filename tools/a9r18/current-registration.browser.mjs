// Current A17 contract on actual UI owners. No existing business fixture or
// assertion is modified. Real Rules/SDK checks are a separate local campaign.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {parse} from '../v11r2/vendor/acorn.mjs';import {createUI,root} from '../a9r16r3/ui-harness.mjs';
const out=path.resolve(process.env.A9R18_REGISTRATION_OUT||'evidence/A9R18/registration');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');let packageHelper='';
function walk(n){if(!n?.type)return;if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.name==='window'&&n.left.property.name==='buildAdmissionTuitionPackage')packageHelper=source.slice(n.start,n.end)+';';for(const[k,v]of Object.entries(n))if(!['start','end'].includes(k)){if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}}
walk(parse(source,{ecmaVersion:'latest',sourceType:'script'}));assert(packageHelper);
const ui=await createUI(),rows=[];const{page,context}=await ui.page(390,844);
const wait=prefix=>page.waitForFunction(p=>!document.getElementById(p+'_shift').disabled,prefix);
const check=async(id,title,fn)=>{try{const evidence=await fn();rows.push({id,title,status:'PASS',evidence});console.log('PASS',id,title);}catch(e){rows.push({id,title,status:'FAIL_RUNTIME',message:e.stack});console.error('FAIL',id,title,e.message);}};
try{
 await page.addScriptTag({content:packageHelper});
 await page.addScriptTag({url:ui.origin+'/js/core/tuitionDebtCanonical.js'});
 await page.evaluate(()=>{window.buildPaymentBundleTransaction=()=>{throw Error('No financial payment should be constructed for a zero-fee admission');};});
 await check('C01','Edit uses stable branch IDs and preserves the stored legacy-global shift',async()=>{
  await page.evaluate(()=>window.openProfile('P_A'));await wait('m');
  const state=await page.evaluate(()=>({ids:[...document.getElementById('m_shift').options].map(o=>o.value),selected:document.getElementById('m_shift').value,warning:document.getElementById('m_registration_warning').textContent}));
  assert.deepEqual(state.ids,['','G1','S1']);assert.equal(state.selected,'G1');assert.equal(state.warning,'');return state;
 });
 await check('C02','Branch change invalidates a branch-specific shift without changing the profile or writing',async()=>{
  const before=await page.evaluate(()=>({writes:__qa.writes.length,profile:JSON.stringify(__store.profiles.P_A)}));
  await page.selectOption('#m_shift','S1');await page.selectOption('#m_branch','CS2');assert.equal(await page.inputValue('#m_shift'),'__invalid_registration__');
  await page.evaluate(()=>window.updateProfile());assert.equal(await page.evaluate(()=>__qa.writes.length),before.writes);assert.equal(await page.evaluate(()=>JSON.stringify(__store.profiles.P_A)),before.profile);return{writes:0,invalidated:true};
 });
 await check('C03','Explicit compatible shift saves once through the existing profile owner',async()=>{
  const n=await page.evaluate(()=>__qa.writes.length);await page.selectOption('#m_shift','S2');await page.evaluate(()=>window.updateProfile());
  const writes=await page.evaluate(n=>__qa.writes.slice(n),n);assert.equal(writes.length,1);assert(writes[0].path.endsWith('/profiles/P_A'));assert.equal(writes[0].data.branch,'CS2');assert.equal(writes[0].data.trainingShiftId,'S2');return{writes:1,path:writes[0].path};
 });
 await check('C04','Add permits stored legacy-global plus own-branch shifts and requires explicit reselection',async()=>{
  await page.evaluate(()=>{document.getElementById('profileModal').style.display='none';document.getElementById('add_branch').value='CS1';window.openAddModal();});await wait('add');
  const ids=await page.locator('#add_shift option').evaluateAll(xs=>xs.map(o=>o.value));assert.deepEqual(ids,['','G1','S1']);
  await page.selectOption('#add_shift','S1');const before=await page.evaluate(()=>__qa.writes.length);await page.selectOption('#add_branch','CS2');assert.equal(await page.inputValue('#add_shift'),'__invalid_registration__');assert.equal(await page.evaluate(()=>__qa.writes.length),before);return{ids,autoSelected:false,writes:0};
 });
 await check('C05','Zero-fee admission creates only the profile and remains due in the canonical debt engine',async()=>{
  await page.selectOption('#add_branch','CS1');await page.selectOption('#add_shift','S1');
  await page.evaluate(()=>{for(const[k,v]of Object.entries({add_name:'R1_NEW_001',add_date:'2026-10-26',add_package:'1',add_fee_actual:'0',add_fee_display:'0',add_fee_default_actual:'500000',add_fee_default_display:'500.000',add_uniform_actual:'0',add_uniform_display:'0',add_uniform_size:''}))document.getElementById(k).value=v;document.getElementById('add_uniform_gift').checked=false;});
  await page.locator('.add_trainingDay[value="0"]').check();const n=await page.evaluate(()=>__qa.writes.length);await page.evaluate(()=>window.addNewStudent());
  const state=await page.evaluate(n=>{const writes=__qa.writes.slice(n),p=__store.profiles.R1_NEW_001;return{writes,profile:p,debt:p?window.TuitionDebtCanonical.computeProfileDebt(p,'2026-10',{name:'R1_NEW_001',transactions:[]}):null,toasts:__qa.toasts};},n);
  assert.equal(state.writes.length,1);assert(state.writes[0].path.endsWith('/profiles/R1_NEW_001'));assert.equal(state.profile.paidUntil,'');assert.deepEqual(state.profile.paidMonths,[]);assert.deepEqual(state.profile.trainingDays,[0]);assert.deepEqual(state.debt.chargeableMonths,['2026-10']);return{profileWrite:1,financialWrites:0,paidUntil:state.profile.paidUntil,paidMonths:state.profile.paidMonths,chargeableMonths:state.debt.chargeableMonths};
 });
 await check('C06','Forged opposite-branch option is rejected before the same admission writer',async()=>{
  await page.evaluate(()=>{document.getElementById('add_branch').value='CS1';window.openAddModal();});await wait('add');
  await page.evaluate(()=>{document.getElementById('add_name').value='R1_NEW_002';const e=document.getElementById('add_shift');e.add(new Option('forged','S2'));e.value='S2';e.dispatchEvent(new Event('change'));});
  const n=await page.evaluate(()=>__qa.writes.length);await page.evaluate(()=>window.addNewStudent());assert.equal(await page.evaluate(()=>__qa.writes.length),n);return{writes:0};
 });
}finally{
 const result={status:rows.every(x=>x.status==='PASS')?'PASS':'FAIL_RUNTIME',scope:'Actual canonical Add/Edit owners and canonical debt engine with synthetic SDK ports; exact original admission helper body, no production connection',admissionHelperSHA256:crypto.createHash('sha256').update(packageHelper).digest('hex'),rows};fs.writeFileSync(path.join(out,'CURRENT_REGISTRATION_UI.json'),JSON.stringify(result,null,2));await context.close();await ui.close();if(result.status!=='PASS')process.exitCode=1;
}

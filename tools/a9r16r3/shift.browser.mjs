import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createUI} from './ui-harness.mjs';
const out=path.resolve(process.env.R3_EVIDENCE_ROOT||'evidence/R3/shift');fs.mkdirSync(out,{recursive:true});
const ui=await createUI(),rows=[];const {page,context}=await ui.page();
const check=async(id,title,fn)=>{try{const evidence=await fn();rows.push({id,title,status:'PASS',evidence});console.log('PASS',id,title);}catch(e){rows.push({id,title,status:'FAIL_RUNTIME',message:e.message});console.error('FAIL',id,title,e.message);}};
try{
 for(const [id,role,branch]of [['S01','admin','CS1'],['S02','admin','CS2'],['S03','coach','CS1'],['S04','coach','CS2']])await check(id,'Legacy global visible for '+role+' '+branch,async()=>{
  await page.evaluate(async({role,branch})=>__setPrincipal(branch,role),{role,branch});
  const options=await page.locator('#att_shift option').evaluateAll(xs=>xs.map(x=>({id:x.value,label:x.textContent})));assert(options.some(x=>x.id==='G1'));return options;
 });
 for(const [id,branch,profile]of [['S05','CS1','P_A'],['S06','CS2','P_B']])await check(id,'Global shift roster keeps '+branch+' boundary',async()=>{
  await page.evaluate(async b=>{await __setPrincipal(b);document.getElementById('att_shift').value='G1';await onShiftChange();},branch);
  const ids=await page.evaluate(()=>Object.keys(currentAttendanceData));assert.deepEqual(ids,[profile]);return {profileIds:ids,counts:await page.evaluate(()=>__qa.counts)};
 });
 for(const [id,branch,excluded]of [['S07','CS2','S1'],['S08','CS1','S2']])await check(id,'Explicit opposite-branch shift hidden',async()=>{
  await page.evaluate(b=>__setPrincipal(b),branch);const ids=await page.locator('#att_shift option').evaluateAll(xs=>xs.map(x=>x.value));assert(!ids.includes(excluded));return ids;
 });
 await check('S09','Legacy profile edit keeps registration and time label',async()=>{
  await page.evaluate(async()=>{await __setPrincipal('CS1','admin');window.openProfile('P_A');});await page.waitForFunction(()=>!document.getElementById('m_shift').disabled);
  const state=await page.evaluate(()=>({value:document.getElementById('m_shift').value,label:document.getElementById('m_shift').selectedOptions[0]?.textContent,warning:document.getElementById('m_registration_warning').textContent}));assert.equal(state.value,'G1');assert.equal(state.label,'Ca Chiều (17:15–18:45)');assert.equal(state.warning,'');return state;
 });
 await check('S12','New blank-branch shift remains blocked',async()=>{
  await page.evaluate(async()=>{document.getElementById('profileModal').style.display='none';await openShiftModal();document.getElementById('shift_name').value='New blank';document.getElementById('shift_branch').value='';});
  const before=await page.evaluate(()=>({writes:__qa.writes.length,shifts:JSON.stringify(_getClubShifts())}));const result=await page.evaluate(()=>addShift());assert.equal(result.blocked,true);assert.equal(await page.evaluate(()=>__qa.writes.length),before.writes);assert.equal(await page.evaluate(()=>JSON.stringify(_getClubShifts())),before.shifts);return result;
 });
 await check('S13','New explicit CS1 uses the existing settings writer',async()=>{
  const before=await page.evaluate(()=>__qa.writes.length);await page.evaluate(async()=>{document.getElementById('shift_name').value='New CS1';document.getElementById('shift_branch').value='CS1';await addShift();});
  const writes=await page.evaluate(n=>__qa.writes.slice(n),before);assert.equal(writes.length,1);assert(writes[0].path.endsWith('/settings/shifts'));assert.equal(writes[0].data.list.at(-1).branch,'CS1');return {writes:1,path:writes[0].path};
 });
 await check('S14','Registered shift name and real time display in primary history',async()=>{
  await page.evaluate(async()=>{await __setPrincipal('CS1');await showAttMemberHistory('P_A','2026-10');});const text=await page.locator('#attHistBody').innerText();assert(text.includes('Ca Chiều (17:15–18:45)'));return {expected:'Ca Chiều (17:15–18:45)'};
 });
 await check('S15','Loading/selecting existing shifts performs no migration write',async()=>{
  const before=await page.evaluate(()=>__qa.writes.length);await page.evaluate(async()=>{await __setPrincipal('CS1');document.getElementById('att_shift').value='S1';await onShiftChange();});assert.equal(await page.evaluate(()=>__qa.writes.length),before);return {writes:0};
 });
 await check('ROSTER','Existing day/status/shift/month exclusions survive legacy compatibility',async()=>{
  const ids=await page.evaluate(async()=>{
   const original=structuredClone(__store.profiles),p=original.P_A;
   Object.assign(__store.profiles,{
    P_OTHER_DAY:{...p,profileId:'P_OTHER_DAY',trainingDays:[2,4,6]},
    P_INACTIVE:{...p,profileId:'P_INACTIVE',status:'quit'},
    P_OTHER_SHIFT:{...p,profileId:'P_OTHER_SHIFT',trainingShiftId:'S1'},
    P_SKIP:{...p,profileId:'P_SKIP',skippedMonths:['2026-10']},
    P_BAD_DAYS:{...p,profileId:'P_BAD_DAYS',trainingDays:['1']},
    P_BLANK_DAYS:{...p,profileId:'P_BLANK_DAYS',trainingDays:[]},
    P_NO_SHIFT:{...p,profileId:'P_NO_SHIFT',trainingShiftId:''},
   });
   await __setPrincipal('CS1');document.getElementById('att_shift').value='G1';await onShiftChange();
   const ids=Object.keys(currentAttendanceData).sort();__store.profiles=original;return ids;
  });
  assert.deepEqual(ids,['P_A','P_BLANK_DAYS','P_NO_SHIFT']);return {profileIds:ids,optionalPolicy:'Empty days and blank profile shift preserve existing roster behavior'};
 });
}finally{
 const report={status:rows.every(r=>r.status==='PASS')?'PASS':'FAIL_RUNTIME',scope:'Actual UI/owners; synthetic SDK ports; real Rules/SDK verified separately',rows};fs.writeFileSync(path.join(out,'SHIFT_BROWSER_MATRIX.json'),JSON.stringify(report,null,2));await context.close();await ui.close();if(report.status!=='PASS')process.exitCode=1;
}

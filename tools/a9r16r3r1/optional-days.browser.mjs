import fs from 'node:fs';import path from 'node:path';
import {createUI} from '../a9r16r3/ui-harness.mjs';
const out=path.resolve(process.env.R3_REVIEW_EVIDENCE||'evidence/R3R1');fs.mkdirSync(out,{recursive:true});
const ui=await createUI(),rows=[];
try{for(const days of [[],null,undefined,[1,3,5]]){
 const{page,context}=await ui.page(390,844);
 try{
  await page.evaluate(async days=>{await __setPrincipal('CS1');if(days===undefined)delete __store.profiles.P_A.trainingDays;else __store.profiles.P_A.trainingDays=days;await showAttMemberHistory('P_A','2026-10');},days);
  const evidence=await page.evaluate(()=>({text:document.getElementById('attHistBody').textContent,counts:__qa.counts}));
  const visible=evidence.text.includes('Ca Chiều (17:15–18:45)');rows.push({days:days===undefined?'missing':days,evidence:{registeredShiftVisible:visible,counts:evidence.counts},classification:visible?'PASS':'FAIL_RUNTIME'});
  console.log(visible?'PASS':'FAIL','registered shift/time, optional days',JSON.stringify(days));
 }finally{await context.close();}
}}finally{await ui.close();fs.writeFileSync(path.join(out,'OPTIONAL_DAYS.json'),JSON.stringify({classification:rows.every(x=>x.classification==='PASS')?'PASS':'FAIL_RUNTIME',rows},null,2));if(rows.some(x=>x.classification!=='PASS'))process.exitCode=1;}

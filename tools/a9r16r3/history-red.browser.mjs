import fs from 'node:fs';import path from 'node:path';
import {createUI} from './ui-harness.mjs';
const out=path.resolve(process.env.R3_EVIDENCE_ROOT||'evidence/R3/history-red');fs.mkdirSync(out,{recursive:true});
const ui=await createUI(),runs=[];
try{for(const [device,w,h] of [['iPhone',390,844],['Android',360,800],['Desktop',1280,900]]){
 const {page,context}=await ui.page(w,h);
 await page.evaluate(async()=>{
  for(let i=0;i<50;i++)__store.profiles['P_LONG_'+i]={...__store.profiles.P_A,profileId:'P_LONG_'+i,displayName:'Võ sinh mẫu '+i};
  await __setPrincipal('CS1');document.getElementById('att_shift').value='G1';await onShiftChange();window.scrollTo(0,0);
  window.__trace=[];window.__traceArmed=false;
  window.__measure=stage=>{
   const c=document.getElementById('attHistContent'),m=document.getElementById('attHistModal'),cta=document.querySelector('#attHistoryLoadMore'),cal=Array.from(document.querySelectorAll('#attHistBody [title]')).at(-1);
   const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
   const nav=document.querySelector('.ui-bottom-nav');const parents=[];
   for(let e=m?.parentElement;e;e=e.parentElement){const s=getComputedStyle(e);parents.push({id:e.id,tag:e.tagName,contain:s.contain,transform:s.transform,position:s.position,zIndex:s.zIndex,rect:rect(e)});}
   const hit=c?document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,c.getBoundingClientRect().x+20)),Math.min(innerHeight-1,Math.max(0,c.getBoundingClientRect().bottom-20))):null;
   return {stage,scrollTop:c?.scrollTop??null,scrollHeight:c?.scrollHeight??null,clientHeight:c?.clientHeight??null,modal:rect(m),content:rect(c),CTAoffsetTop:cta?.offsetTop??null,CTA:rect(cta),calendarBottom:cal?cal.getBoundingClientRect().bottom-(c?.getBoundingClientRect().top||0)+(c?.scrollTop||0):null,nav:rect(nav),bottomHit:hit?.id||hit?.className||hit?.tagName,windowScrollY:scrollY,viewport:{width:innerWidth,height:innerHeight},parents};
  };
  const get=document.getElementById.bind(document);document.getElementById=function(id){const e=get(id);if(id==='attHistBody'&&__traceArmed){__traceArmed=false;__trace.push(__measure('after-modal-show'));}return e;};
  const d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(Element.prototype,'innerHTML',{...d,set(value){d.set.call(this,value);if(this.id==='attHistBody')__trace.push(__measure(String(value).includes('Đang tải dữ liệu tháng')?'after-loading-placeholder':'after-primary-body-setter'));}});
 });
 for(const [scenario,profile] of [['fresh','P_A'],['same-reopen','P_A'],['member-switch','P_LONG_0']]){
  await page.evaluate(({scenario,profile})=>{__trace.push(__measure('before-open:'+scenario));__traceArmed=true;window.__pendingHistory=showAttMemberHistory(profile,'2026-10');},{scenario,profile});
  await page.evaluate(()=>__pendingHistory);
  await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  const measured=await page.evaluate(()=>{const r=__measure('after-body-render');__trace.push(r);return r;});
  runs.push({device,scenario,measured,trace:await page.evaluate(()=>__trace.splice(0))});
  // DOM scroll is deliberate: modal may be offscreen precisely because of the defect.
  await page.evaluate(()=>{const c=document.getElementById('attHistContent');c.scrollTop=c.scrollHeight;__trace.push(__measure('scrolled-bottom'));document.getElementById('attHistModal').style.display='none';});
 }
 await context.close();
}}finally{await ui.close();fs.writeFileSync(path.join(out,'HISTORY_RED_TRACE.json'),JSON.stringify({scope:'Actual HTML/CSS and owners, 52-row roster. Native DOM observers only; no production connection.',runs},null,2));}
console.log(JSON.stringify(runs.map(r=>({device:r.device,scenario:r.scenario,content:r.measured.content,scrollTop:r.measured.scrollTop,CTA:r.measured.CTA,calendarBottom:r.measured.calendarBottom,parents:r.measured.parents.filter(p=>p.contain!=='none'||p.transform!=='none')})),null,2));

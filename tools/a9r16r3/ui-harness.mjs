// Actual HTML/CSS and canonical owners. Synthetic SDK I/O only; no production
// connections. Real Rules/SDK coverage runs separately against the Emulator.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
import {buildImportGraph,buildTag} from '../v11r2/import-graph.mjs';
export const root=path.resolve(process.env.R3_SOURCE_ROOT||process.cwd());
const canonical=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'tools/v11r2/manifests/V11R6_A9R15_TRAINING_HISTORY.json'))).canonicalRuntimeFiles).filter(f=>f.endsWith('.js'));
const graph=buildImportGraph(root,{},canonical),urls={};
for(const edge of graph.edges.filter(e=>e.to)){
 const u=new URL(edge.url,new URL(edge.kind==='script-loader'?'index.html':edge.from,'http://qa/'));
 const url=u.pathname+u.search+u.hash;
 if(urls[edge.to])assert.equal(urls[edge.to],url,'Canonical module identity '+edge.to);
 urls[edge.to]=url;
}
urls.__buildTag=buildTag(fs.readFileSync(path.join(root,'js/main.js'),'utf8')).tag;
export async function createUI(){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://qa').pathname;
  if(pathname==='/'){res.setHeader('content-type','text/html');res.end(html);return;}
  const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('content-type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await loadPlaywright().chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox']});
 async function page(width=390,height=844){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<768,hasTouch:width<768});const p=await context.newPage();p.setDefaultTimeout(10000);
  await p.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  p.on('dialog',d=>d.dismiss());
  await p.goto(origin,{waitUntil:'networkidle'});
  await p.evaluate(async urls=>{
   window.APP_BUILD_VERSION=urls.__buildTag;
   document.body.classList.add('ui-mobile-shell');document.getElementById('mainApp').style.display='block';document.getElementById('loginOverlay').style.display='none';document.getElementById('superAdminView').style.display='none';
   document.querySelectorAll('.tab-content').forEach(el=>el.classList.toggle('active',el.id==='tab_attendance'));
   window.__qa={counts:{getDoc:0,getDocs:0,onSnapshot:0},writes:[],queries:[],records:[],toasts:[],hold:null,
    shifts:[{id:'G1',branch:'',name:'Ca Chiều',timeStart:'17:15',timeEnd:'18:45'},{id:'S1',branch:'CS1',name:'Ca CS1',timeStart:'07:00',timeEnd:'08:00'},{id:'S2',branch:'CS2',name:'Ca CS2',timeStart:'08:00',timeEnd:'09:00'}]};
   window.showToast=(...x)=>__qa.toasts.push(x);window.recordRuntimeError=()=>{};window.alert=x=>__qa.toasts.push([x]);
   window.getLocalToday=()=> '2026-10-26';window.classifyProfileStatus=p=>p.status||'active';window.getBranchNameDisplay=b=>b;
   window.__store={db:{},clubId:'R3_QA',currentClubId:'R3_QA',currentUser:{uid:'admin'},userRole:'admin',coachBranch:'',clubConfig:{branchCount:2},clubData:{},profiles:{
    P_A:{profileId:'P_A',displayName:'Võ sinh A',branch:'CS1',status:'active',belt:'Đai Trắng',trainingShiftId:'G1',trainingDays:[1,3,5]},
    P_B:{profileId:'P_B',displayName:'Võ sinh B',branch:'CS2',status:'active',belt:'Đai Trắng',trainingShiftId:'G1',trainingDays:[1,3,5]}}};
   window.currentClubId='R3_QA';window.userRole='admin';window.coachBranch='';
   window.__verifiedAuthContextState={uid:'admin',clubId:'R3_QA',role:'admin',ready:true,generation:1,allowedBranches:[],coachBranch:'',activeBranch:''};
   for(const id of ['att_branch','att_month_branch']){const s=document.getElementById(id);for(const b of ['CS1','CS2'])if(!Array.from(s.options).some(o=>o.value===b))s.add(new Option(b,b));s.value='CS1';}
   const clause=(type,...value)=>({type,value}),snap=rows=>({size:rows.length,metadata:{fromCache:false,hasPendingWrites:false},forEach:fn=>rows.forEach(r=>fn({id:r.id,data:()=>r.data})),docs:rows.map(r=>({id:r.id,data:()=>r.data}))});
   window._fb_init={doc:(db,...p)=>({path:p.join('/'),id:p.at(-1)}),collection:(db,...p)=>({path:p.join('/')}),where:(...p)=>clause('where',...p),query:(ref,...constraints)=>({ref,constraints}),orderBy:(...p)=>clause('orderBy',...p),documentId:()=> '__name__',limit:n=>clause('limit',n),startAfter:id=>clause('startAfter',id),
    getDoc:async ref=>{__qa.counts.getDoc++;return {exists:()=>true,data:()=>({list:__qa.shifts}),metadata:{fromCache:false,hasPendingWrites:false}};},
    getDocs:async q=>{__qa.counts.getDocs++;if(/transactions|inventory|finance/.test(q.ref.path))throw Error('Unexpected Finance read');__qa.queries.push(q);const hold=__qa.hold;if(hold){__qa.hold=null;await hold;}
     let rows=__qa.records.slice();for(const c of q.constraints)if(c.type==='where'){const [field,op,value]=c.value;rows=rows.filter(r=>op==='in'?value.includes(r.data[field]):op==='=='?r.data[field]===value:op==='>='?r.data[field]>=value:op==='<='?r.data[field]<=value:false);}
     rows.sort((a,b)=>a.id.localeCompare(b.id,'en'));for(const c of q.constraints)if(c.type==='startAfter')rows=rows.filter(r=>r.id>c.value[0]);for(const c of q.constraints)if(c.type==='limit')rows=rows.slice(0,c.value[0]);return snap(rows);},
    onSnapshot:()=>{__qa.counts.onSnapshot++;throw Error('Unexpected new listener');},setDoc:async(ref,data)=>__qa.writes.push({path:ref.path,data:structuredClone(data)}),updateDoc:async(ref,data)=>__qa.writes.push({path:ref.path,data:structuredClone(data)}),
    writeBatch:()=>{const rows=[];return {set:(ref,data)=>rows.push({path:ref.path,data}),commit:async()=>__qa.writes.push(...rows)};}};
   await import(urls['js/core/branchIdentity.js']);await import(urls['js/core/roleReadBoundary.js']);
   const registry=await import(urls['js/core/globalOwnershipRegistry.js']);registry.initGlobalOwnershipRegistry();
   const students=await import(urls['js/modules/students.js']);students.initStudents();
   const status=await import(urls['js/core/studentStatusCommandBoundary.js']);window.StudentStatusCommandBoundary=status.StudentStatusCommandBoundary;
   const attendance=await import(urls['js/modules/attendance.js']);attendance.initAttendance();await _ensureClubShiftsLoaded();
   window.__setPrincipal=async(branch='CS1',role='coach',allowed=[branch])=>{
    const uid=role==='coach'?'coach':'admin',generation=__verifiedAuthContextState.generation+1;
    window.userRole=role;window.coachBranch=role==='coach'?branch:'';__store.userRole=role;__store.coachBranch=window.coachBranch;__store.currentUser={uid};
    window.__verifiedAuthContextState={uid,clubId:'R3_QA',role,ready:true,generation,branchGeneration:generation,assignmentVersion:'R3-'+generation,allowedBranches:role==='coach'?allowed:[],coachBranch:role==='coach'?branch:'',activeBranch:branch};
    document.getElementById('att_branch').value=branch;document.getElementById('att_month_branch').value=branch;
    AttendanceModule.resetForClub('R3_QA');await _ensureClubShiftsLoaded();document.getElementById('att_date').value='2026-10-26';
   };
   const {HISTORY_AUTHORITY}=await import(urls['js/core/attendanceContract.js']);
   for(const profile of ['P_A','P_B'])for(let i=0;i<81;i++){const date=new Date(Date.UTC(2020,0,1+i*24)).toISOString().slice(0,10);__qa.records.push({id:profile+'_'+date+'_G1',data:{profileId:profile,branch:profile==='P_A'?'CS1':'CS2',date,month:date.slice(0,7),shiftId:'G1',status:i%3+1,historyAuthority:HISTORY_AUTHORITY}});}
   __qa.records.push({id:'P_A_2026-10-26_G1',data:{profileId:'P_A',branch:'CS1',date:'2026-10-26',month:'2026-10',shiftId:'G1',status:1,historyAuthority:HISTORY_AUTHORITY}});
  },urls);
  return {page:p,context};
 }
 return {page,close:async()=>{await browser.close();await new Promise(r=>server.close(r));},origin};
}

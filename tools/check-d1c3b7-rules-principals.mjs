#!/usr/bin/env node
// TEST-ONLY: must run under REAL Firestore Rules Emulator (no rules-mock).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,getDocs,query,setDoc,where} from 'firebase/firestore';
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(!host) throw new Error('NOT EXECUTED: FIRESTORE_EMULATOR_HOST absent');
const [h,p]=host.split(':');
const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId:process.env.GCLOUD_PROJECT||'demo-b7-coach-proof',firestore:{host:h,port:Number(p),rules}});
assert.equal(h,'127.0.0.1');assert((process.env.GCLOUD_PROJECT||'demo-b7-coach-proof').startsWith('demo-'));
await env.clearFirestore();
let passed=0;
async function verify(label,operation){await operation();console.log('PASS B7_RULES',label);passed++}
const seed=[['users/c1',{role:'coach',clubId:'A',branch:'CS1',status:'active'}],['users/c2',{role:'coach',clubId:'A',branch:'CS2',status:'active'}],['users/locked',{role:'coach',clubId:'A',branch:'CS1',status:'locked'}],['users/admin',{role:'admin',clubId:'A',status:'active'}],['users/cross',{role:'coach',clubId:'B',branch:'CS1',status:'active'}],['users/no-branch',{role:'coach',clubId:'A',status:'active'}],['clubs/A',{name:'A'}],['clubs/B',{name:'B'}],['clubs/A/profiles/active',{branch:'CS1',status:'active'}],['clubs/A/profiles/missing',{branch:'CS1'}],['clubs/A/profiles/vietnamese',{branch:'CS1',status:'Đang tập'}],['clubs/A/profiles/legacy',{branch:'Mặc định',status:'training'}],['clubs/A/profiles/quit',{branch:'CS1',status:'quit'}],['clubs/A/profiles/cs2',{branch:'CS2',status:'active'}],['clubs/A/profiles/no-branch',{status:'active'}],['clubs/B/profiles/b',{branch:'CS1',status:'active'}]];
try{
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();for(const [path,data]of seed)await setDoc(doc(db,path),data);for(const [path,data]of seed)if(path.startsWith('users/')&&data.role==='coach'&&data.branch)await setDoc(doc(db,'clubs',data.clubId,'coaches',path.split('/')[1]),data);for(const club of ['A','B'])await setDoc(doc(db,'clubs',club,'settings','main_config'),{branchCount:2});});
 const as=uid=>env.authenticatedContext(uid).firestore();
 const q=(db,club,branch)=>query(collection(db,`clubs/${club}/profiles`),where('branch','==',branch));
 await verify('Coach CS1 branch-only includes legacy statuses',async()=>{const s=await assertSucceeds(getDocs(q(as('c1'),'A','CS1')));assert.equal(s.size,4)});
 await verify('Coach CS1 legacy alias branch-only',async()=>{const s=await assertSucceeds(getDocs(q(as('c1'),'A','Mặc định')));assert.equal(s.size,1)});
 await verify('Coach CS2 assigned branch-only',async()=>{const s=await assertSucceeds(getDocs(q(as('c2'),'A','CS2')));assert.equal(s.size,1)});
 await verify('CS1 cannot list CS2 branch',async()=>assertFails(getDocs(q(as('c1'),'A','CS2'))));
 await verify('CS2 cannot list CS1 alias',async()=>assertFails(getDocs(q(as('c2'),'A','Mặc định'))));
 await verify('Coach cross-club denied',async()=>assertFails(getDocs(q(as('cross'),'A','CS1'))));
 await verify('Coach locked denied',async()=>assertFails(getDocs(q(as('locked'),'A','CS1'))));
 await verify('Coach unassigned denied',async()=>assertFails(getDocs(q(as('no-branch'),'A','CS1'))));
 await verify('Anonymous denied',async()=>assertFails(getDocs(q(env.unauthenticatedContext().firestore(),'A','CS1'))));
 await verify('Coach full collection denied',async()=>assertFails(getDocs(collection(as('c1'),'clubs/A/profiles'))));
 await verify('Admin full club query allowed',async()=>{const s=await assertSucceeds(getDocs(collection(as('admin'),'clubs/A/profiles')));assert.equal(s.size,7)});
 await verify('Coach cannot query missing branch',async()=>assertFails(getDocs(query(collection(as('c1'),'clubs/A/profiles'),where('branch','==','')))));
 console.log('B7_RULES_EMULATOR',passed,'PASS');
}finally{await env.cleanup()}

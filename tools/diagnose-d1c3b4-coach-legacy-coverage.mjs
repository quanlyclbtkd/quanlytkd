#!/usr/bin/env node
// Read-only actual listener query/handler fixture. Deliberately NOT a release PASS gate
// until branch-only security is proven by an actual Firestore Rules Emulator.
import {getActiveQueryValues, classifyProfileStatus} from '../js/data/profileStatusConfig.js';
import assert from 'node:assert/strict';
const source=await import('node:fs').then(m=>m.readFileSync('js/listeners/profiles.listeners.js','utf8'));
const expected=[
  {id:'canonical',branch:'CS1',status:'active'},
  {id:'missing',branch:'CS1'},
  {id:'vietnamese',branch:'Mặc định',status:'Đang tập'},
  {id:'training',branch:'CS1',status:'training'},
  {id:'quit',branch:'CS1',status:'quit'},
  {id:'offbranch',branch:'CS2',status:'active'},
];
const active=expected.filter(p=>['CS1','Mặc định'].includes(p.branch) && classifyProfileStatus(p)==='active');
const statuses=getActiveQueryValues();
const server=expected.filter(p=>['CS1','Mặc định'].includes(p.branch) && statuses.includes(p.status));
console.log('Coach fixture: canonical local active',active.map(x=>x.id));
console.log('Coach status-query returned',server.map(x=>x.id));
console.log('Existing Coach status-values',JSON.stringify(statuses));
console.log('Exact active listener still status filtered', source.includes("fbQuery(profRef, statusConstraint, fbWhere('branch', '==', coachBranch))"));
console.log('Legacy path still status filtered', source.includes("fbQuery(profRef, statusConstraint, fbWhere('branch', '==', 'Mặc định'))"));
if(active.some(p=>!server.some(x=>x.id===p.id))){
  console.error('BLOCKED E01: legacy active profiles missing from current Coach status-filtered query. Rules Emulator required before patch.');
  process.exitCode=2;
}

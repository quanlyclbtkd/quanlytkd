#!/usr/bin/env node
// Real Rules Emulator plus the unchanged AttendanceService writer entrypoints.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Local Emulator required');
const projectId = process.env.GCLOUD_PROJECT || 'demo-b7-coach-proof';
assert.ok(projectId.startsWith('demo-'), 'A demo project is required');
const [hostname, port] = host.split(':');
const env = await initializeTestEnvironment({projectId, firestore: {host: hostname, port: Number(port), rules: fs.readFileSync('firestore.rules', 'utf8')}});
let pass = 0, fail = 0;
async function test(name, fn) {try {await fn(); pass++; console.log('PASS V9_RULES', name);} catch(e) {fail++; console.error('FAIL V9_RULES', name, e.message);}}
const club = 'v9-att-A', base = `clubs/${club}/attendance`;
const record = (profileId, branch = 'CS1') => ({profileId, name: profileId, branch, date:'2026-10-20', month:'2026-10', status:1});
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), batch = sdk.writeBatch(db);
    const put = (p,v) => batch.set(sdk.doc(db,p),v);
    put('users/v9-c1', {clubId:club, role:'coach', branch:'CS1', status:'active'});
    put('users/v9-c2', {clubId:club, role:'coach', branch:'CS2', status:'active'});
    put('users/v9-admin', {clubId:club, role:'admin', status:'active'});
    put('users/v9-viewer', {clubId:club, role:'viewer', status:'active'});
    put(`clubs/${club}/profiles/p1`, {branch:'CS1', status:'active'});
    put(`clubs/${club}/profiles/legacy`, {branch:'Mặc định'});
    put(`clubs/${club}/profiles/p2`, {branch:'CS2', status:'active'});
    put(`clubs/${club}/profiles/noBranch`, {status:'active'});
    put(`clubs/${club}/profiles/quit`, {branch:'CS1', status:'quit'});
    put(`clubs/v9-att-B/profiles/cross`, {branch:'CS1'});
    put(`${base}/seed-valid`, record('p1'));
    put(`${base}/seed-forged`, record('p2'));
    put(`${base}/seed-no-id`, {branch:'CS1', status:1});
    for(let i=0;i<41;i++) put(`clubs/${club}/profiles/bulk-${i}`, {branch:i%2?'Mặc định':'CS1', status:'active'});
    await batch.commit();
  });
  const coach = env.authenticatedContext('v9-c1').firestore();
  const coach2 = env.authenticatedContext('v9-c2').firestore();
  const admin = env.authenticatedContext('v9-admin').firestore();
  const viewer = env.authenticatedContext('v9-viewer').firestore();
  await test('deny CS1 spoof branch with CS2 profileId', () => assertFails(sdk.setDoc(sdk.doc(coach,base,'spoof'),record('p2'))));
  await test('deny CS2 spoof branch with CS1 profileId', () => assertFails(sdk.setDoc(sdk.doc(coach2,base,'spoof2'),record('p1','CS2'))));
  await test('allow assigned canonical profile', () => assertSucceeds(sdk.setDoc(sdk.doc(coach,base,'valid'),record('p1'))));
  await test('allow primary legacy alias profile', () => assertSucceeds(sdk.setDoc(sdk.doc(coach,base,'legacy'),record('legacy'))));
  await test('allow CS2 assigned profile', () => assertSucceeds(sdk.setDoc(sdk.doc(coach2,base,'valid2'),record('p2','CS2'))));
  await test('deny absent profileId', () => assertFails(sdk.setDoc(sdk.doc(coach,base,'no-id'),{branch:'CS1',status:1})));
  await test('deny wrong type profileId', () => assertFails(sdk.setDoc(sdk.doc(coach,base,'bad-id'),record(123))));
  await test('deny missing canonical profile', () => assertFails(sdk.setDoc(sdk.doc(coach,base,'missing'),record('absent'))));
  await test('deny profile without assigned branch', () => assertFails(sdk.setDoc(sdk.doc(coach,base,'no-branch'),record('noBranch'))));
  await test('deny cross-club target', () => assertFails(sdk.setDoc(sdk.doc(coach,'clubs/v9-att-B/attendance/cross'),record('cross'))));
  await test('deny update retargeting to foreign profile', () => assertFails(sdk.updateDoc(sdk.doc(coach,base,'seed-valid'),{profileId:'p2'})));
  await test('deny update retargeting even within own branch', () => assertFails(sdk.updateDoc(sdk.doc(coach,base,'seed-valid'),{profileId:'legacy'})));
  await test('deny modification of pre-existing forged row', () => assertFails(sdk.updateDoc(sdk.doc(coach,base,'seed-forged'),{status:2})));
  await test('deny deletion of pre-existing forged row', () => assertFails(sdk.deleteDoc(sdk.doc(coach,base,'seed-forged'))));
  await test('deny deletion without profile evidence', () => assertFails(sdk.deleteDoc(sdk.doc(coach,base,'seed-no-id'))));
  await test('allow status correction', () => assertSucceeds(sdk.updateDoc(sdk.doc(coach,base,'seed-valid'),{status:2})));
  await test('allow deletion of owned record', () => assertSucceeds(sdk.deleteDoc(sdk.doc(coach,base,'valid'))));
  await test('allow historical correction for own quit profile', () => assertSucceeds(sdk.setDoc(sdk.doc(coach,base,'quit'),record('quit'))));
  await test('viewer cannot write attendance', () => assertFails(sdk.setDoc(sdk.doc(viewer,base,'viewer'),record('p1'))));
  await test('Admin retains cleanup of malformed legacy record', () => assertSucceeds(sdk.deleteDoc(sdk.doc(admin,base,'seed-no-id'))));

  globalThis.window = globalThis;
  window.__store = {db:coach,clubId:club}; window.userRole='coach'; window.coachBranch='CS1';
  window.__verifiedAuthContextState={uid:'v9-c1',generation:1,ready:true,clubId:club,role:'coach',coachBranch:'CS1'};
  const commits=[];
  window._fb_init={...sdk,writeBatch(db){const b=sdk.writeBatch(db);let count=0;return {set(...args){count++;b.set(...args);},delete(...args){count++;b.delete(...args);},async commit(){commits.push(count);return b.commit();}};}};
  const {AttendanceService:service}=await import('../js/services/attendance.service.js');
  const rows=Array.from({length:41},(_,i)=>({docId:`bulk-${i}`,data:record(`bulk-${i}`)}));
  await test('real service Coach bulk 41 commits in bounded serial batches',async()=>{
    commits.length=0;const ack=await service.bulkSaveRecords(rows,{chunkSize:400});
    assert.equal(ack.committed,41);assert.deepEqual(commits,[10,10,10,10,1]);
  });
  await test('real service offline Coach 41 records preserves canonical fields',async()=>{
    commits.length=0;
    const pending=Object.fromEntries(rows.map(row=>[row.docId,{...row.data,docId:`off-${row.docId}`,version:2,revision:9,journalKey:'local-only'}]));
    const ack=await service.bulkSyncOffline(club,'2026-10-20',pending);
    assert.equal(ack.committed,41);assert.deepEqual(commits,[10,10,10,10,1]);
    const data=(await sdk.getDoc(sdk.doc(coach,base,'off-bulk-0'))).data();
    assert.equal(data.profileId,'bulk-0');for(const key of ['version','revision','journalKey','docId'])assert.equal(data[key],undefined);
  });
  await test('move profile away rejects stale queued attendance',async()=>{
    await sdk.updateDoc(sdk.doc(admin,`clubs/${club}/profiles/p1`),{branch:'CS2'});
    await assertFails(service.saveRecord('stale-move',record('p1')));
    await assertFails(sdk.deleteDoc(sdk.doc(coach,base,'seed-valid')));
  });
} finally {await env.cleanup();}
console.log(`V9 ATTENDANCE RULES: ${pass} PASS / ${fail} FAIL`);
if(fail)process.exitCode=1;

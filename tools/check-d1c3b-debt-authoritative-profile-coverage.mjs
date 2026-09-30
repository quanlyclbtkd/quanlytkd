#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { classifyProfileStatus } from '../js/data/profileStatusConfig.js';

const listeners = fs.readFileSync('js/listeners/profiles.listeners.js','utf8');
const boundary = fs.readFileSync('js/core/debtProfileReadBoundary.js','utf8');
const students = fs.readFileSync('js/modules/students.js','utf8');

const fixtures = {
  A: { status:'active', admissionDate:'2026-09-01', tuitionFee:300000, paidUntil:'2026-08', paidMonths:[] },
  B: { status:'', admissionDate:'2026-09-01', tuitionFee:300000, paidUntil:'2026-08', paidMonths:[] },
  C: { status:'Đang tập', admissionDate:'2026-09-01', tuitionFee:300000, paidUntil:'2026-08', paidMonths:[] },
  D: { status:'legacy-custom', admissionDate:'2026-09-01', tuitionFee:300000, paidUntil:'2026-08', paidMonths:[] },
  E: { status:'quit', admissionDate:'2026-09-01', tuitionFee:300000, paidUntil:'2026-08', paidMonths:[] },
};
assert.equal(classifyProfileStatus(fixtures.A),'active');
assert.equal(classifyProfileStatus(fixtures.B),'active');
assert.equal(classifyProfileStatus(fixtures.C),'active');
assert.equal(classifyProfileStatus(fixtures.D),'active');
assert.equal(classifyProfileStatus(fixtures.E),'quit');
console.log('PASS D1C3B-01 classifier proves active/trial query cannot cover B/C/D');

// Exercise the actual canonical profile store with the required A+B+C+D+E full snapshot.
const store = await import('../js/data/studentProfileStore.js?d1c3b=' + Date.now());
store.resetStudentProfileStore('d1c3b-fixture');
store.syncLegacyAllProfiles(fixtures, 'full-profiles:admin-authority', { complete:true });
assert.deepEqual(Object.keys(store.getActiveProfiles()).sort(), ['A','B','C','D']);
assert.deepEqual(Object.keys(store.getQuitProfiles()).sort(), ['E']);
assert.equal(store.studentProfileStore.quitComplete, true);
globalThis.window = globalThis;
await import('../js/core/tuitionDebtCanonical.js?d1c3b=' + Date.now());
for (const id of ['B','C','D']) {
  const debt = globalThis.TuitionDebtCanonical.computeProfileDebt(fixtures[id], '2026-09', { name:id, transactions:[] });
  assert.ok(debt.chargeableMonths.includes('2026-09'), `${id}: canonical debt lost admission/current month`);
  assert.equal(debt.shouldAppearInDebtBeforeRender, true, `${id}: canonical debt row hidden`);
}
console.log('PASS D1C3B-01B full canonical store contains A/B/C/D active, E quit, Debt includes B/C/D');

// Partial source A alone must never be allowed to prove authoritative coverage.
assert.ok(!boundary.includes("active-listener-local-trusted-no-aggregation"), 'partial active cache is still promoted to authoritative debt coverage');
assert.ok(boundary.includes('fullAuthoritySnapshotSeen'), 'Debt boundary must require full authority snapshot evidence');
assert.ok(boundary.includes('authorityClubId'), 'Debt boundary must bind authority to current club');
assert.ok(boundary.includes('quitComplete'), 'Debt boundary must require canonical complete profile store evidence');
console.log('PASS D1C3B-02 debt coverage readiness requires full same-club authority');

// Admin must reuse the one existing listener slot as an unfiltered full current-club source.
assert.ok(listeners.includes('activeQuery = profRef;'), 'Admin reader is still status-filtered');
assert.ok(/activeQuery\s*=\s*fbQuery\(profRef,\s*statusConstraint,\s*fbWhere\('branch'/.test(listeners), 'Coach must retain branch/status-scoped query');
assert.ok(listeners.includes("syncLegacyAllProfiles(fullMap, 'full-profiles:admin-authority', { complete: true })"), 'Admin full snapshot must classify through canonical complete store');
assert.ok(listeners.includes("lastProfilesMode      = 'full-profiles-authoritative'"), 'Admin authority mode metric missing');
assert.ok(listeners.includes('fullAuthoritySnapshotSeen = true'), 'Admin authoritative snapshot readiness metric missing');
console.log('PASS D1C3B-03 one existing Admin listener becomes full current-club authority');

// Once full authority is ready, Quit must reuse canonical store and perform no second full getDocs.
assert.ok(/loadQuitProfilesIfNeeded[\s\S]*fullAuthoritySnapshotSeen[\s\S]*isQuitComplete\(\)[\s\S]*return true/.test(listeners), 'Quit does not short-circuit from full profile authority');
assert.ok(listeners.includes("typeof window.hasListener !== 'function' || typeof window.removeListener !== 'function'") && listeners.includes('fallback blocked'), 'Emergency fallback must fail closed when normal-listener cleanup cannot be verified');
console.log('PASS D1C3B-04 Quit reuses full authority and emergency fallback cannot overlap it');

// Fee=0 admission must invalidate Debt through the existing computation/list owner.
const addStart=students.indexOf('window.addNewStudent = async');
const addEnd=students.indexOf('// XEM / SỬA HỒ SƠ',addStart);
const addBody=students.slice(addStart,addEnd);
assert.ok(/refreshListsComputation\?\.\(\['students\.activeList',\s*'students\.debtList',\s*'dashboard\.summary'\]/.test(addBody), 'Admission does not refresh students.debtList');
assert.ok(addBody.includes("window.invalidateList('students.debtList', 'after-add-new-student')"), 'Admission does not invalidate students.debtList');
console.log('PASS D1C3B-05 zero-fee admission refreshes Debt in same runtime');

console.log('D1C3B authoritative profile coverage gate PASS 6/6');

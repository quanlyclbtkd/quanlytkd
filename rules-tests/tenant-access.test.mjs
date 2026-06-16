import fs from 'node:fs';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'demo-taekwondo-6w1';
const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
let env;

const future = () => Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
const past = () => Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);

async function seed() {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'clubs/active_club'), {
        clubName: 'Active Club',
        accountStatus: 'active',
        expiryDate: '2099-12-31',
        expiryAt: future(),
      }),
      setDoc(doc(db, 'clubs/locked_club'), {
        clubName: 'Locked Club',
        accountStatus: 'locked',
        expiryDate: '2099-12-31',
        expiryAt: future(),
        lockReason: 'test',
      }),
      setDoc(doc(db, 'clubs/expired_club'), {
        clubName: 'Expired Club',
        accountStatus: 'active',
        expiryDate: '2020-01-01',
        expiryAt: past(),
      }),
      setDoc(doc(db, 'clubs/missing_expiry_club'), {
        clubName: 'Missing Expiry Club',
        accountStatus: 'active',
        expiryDate: '2099-12-31',
      }),
      setDoc(doc(db, 'users/admin_active'), {
        uid: 'admin_active', email: 'admin-active@example.com', role: 'admin', clubId: 'active_club', status: 'active',
      }),
      setDoc(doc(db, 'users/coach_active'), {
        uid: 'coach_active', email: 'coach-active@example.com', role: 'coach', clubId: 'active_club', status: 'active',
      }),
      setDoc(doc(db, 'users/admin_locked'), {
        uid: 'admin_locked', email: 'admin-locked@example.com', role: 'admin', clubId: 'locked_club', status: 'active',
      }),
      setDoc(doc(db, 'users/coach_locked'), {
        uid: 'coach_locked', email: 'coach-locked@example.com', role: 'coach', clubId: 'locked_club', status: 'active',
      }),
      setDoc(doc(db, 'users/admin_expired'), {
        uid: 'admin_expired', email: 'admin-expired@example.com', role: 'admin', clubId: 'expired_club', status: 'active',
      }),
      setDoc(doc(db, 'users/admin_missing_expiry'), {
        uid: 'admin_missing_expiry', email: 'admin-missing@example.com', role: 'admin', clubId: 'missing_expiry_club', status: 'active',
      }),
      setDoc(doc(db, 'clubs/active_club/profiles/p1'), { name: 'A', status: 'active' }),
      setDoc(doc(db, 'clubs/locked_club/profiles/p1'), { name: 'B', status: 'active' }),
      setDoc(doc(db, 'clubs/expired_club/profiles/p1'), { name: 'C', status: 'active' }),
      setDoc(doc(db, 'clubs/active_club/transactions/t1'), { amount: 1000 }),
      setDoc(doc(db, 'clubs/locked_club/transactions/t1'), { amount: 1000 }),
      setDoc(doc(db, 'clubs/active_club/attendance/a1'), { status: 1 }),
      setDoc(doc(db, 'clubs/locked_club/attendance/a1'), { status: 1 }),
    ]);
  });
}

function dbFor(uid, token = {}) {
  return env.authenticatedContext(uid, token).firestore();
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

after(async () => {
  await env.cleanup();
});

test('active admin can read own profile', async () => {
  await assertSucceeds(getDoc(doc(dbFor('admin_active'), 'clubs/active_club/profiles/p1')));
});

test('active admin cannot read another club profile', async () => {
  await assertFails(getDoc(doc(dbFor('admin_active'), 'clubs/locked_club/profiles/p1')));
});

test('active coach can write attendance in own club', async () => {
  await assertSucceeds(setDoc(doc(dbFor('coach_active'), 'clubs/active_club/attendance/a2'), { status: 1 }));
});

test('coach cannot write a financial transaction', async () => {
  await assertFails(setDoc(doc(dbFor('coach_active'), 'clubs/active_club/transactions/t2'), { amount: 2000 }));
});

test('locked coach cannot read attendance', async () => {
  await assertFails(getDoc(doc(dbFor('coach_locked'), 'clubs/locked_club/attendance/a1')));
});

test('locked admin cannot read transactions', async () => {
  await assertFails(getDoc(doc(dbFor('admin_locked'), 'clubs/locked_club/transactions/t1')));
});

test('locked member can read root club status', async () => {
  const snap = await assertSucceeds(getDoc(doc(dbFor('admin_locked'), 'clubs/locked_club')));
  assert.equal(snap.data().accountStatus, 'locked');
});

test('locked member can read own membership document', async () => {
  await assertSucceeds(getDoc(doc(dbFor('admin_locked'), 'users/admin_locked')));
});

test('locked member cannot update even safe self-profile fields', async () => {
  await assertFails(updateDoc(doc(dbFor('admin_locked'), 'users/admin_locked'), { displayName: 'Locked Name' }));
});

test('expired admin cannot read business data', async () => {
  await assertFails(getDoc(doc(dbFor('admin_expired'), 'clubs/expired_club/profiles/p1')));
});

test('expired admin cannot write business data', async () => {
  await assertFails(setDoc(doc(dbFor('admin_expired'), 'clubs/expired_club/profiles/p2'), { name: 'No' }));
});

test('missing expiryAt fails closed for business data', async () => {
  await assertFails(setDoc(doc(dbFor('admin_missing_expiry'), 'clubs/missing_expiry_club/profiles/p2'), { name: 'No' }));
});

test('superadmin can read locked tenant data', async () => {
  await assertSucceeds(getDoc(doc(dbFor('root_admin', { role: 'super_admin' }), 'clubs/locked_club/transactions/t1')));
});

test('user cannot self-promote role', async () => {
  await assertFails(updateDoc(doc(dbFor('coach_active'), 'users/coach_active'), { role: 'admin' }));
});

test('user cannot move themselves to another club', async () => {
  await assertFails(updateDoc(doc(dbFor('coach_active'), 'users/coach_active'), { clubId: 'locked_club' }));
});

test('active user can update allowlisted self fields', async () => {
  await assertSucceeds(updateDoc(doc(dbFor('coach_active'), 'users/coach_active'), { displayName: 'Coach A' }));
});

test('club admin cannot change expiry or accountStatus', async () => {
  const db = dbFor('admin_active');
  await assertFails(updateDoc(doc(db, 'clubs/active_club'), { expiryDate: '2100-01-01' }));
  await assertFails(updateDoc(doc(db, 'clubs/active_club'), { accountStatus: 'locked' }));
});

test('club admin can update a non-sensitive root setting while operational', async () => {
  await assertSucceeds(updateDoc(doc(dbFor('admin_active'), 'clubs/active_club'), { examEnabled: true }));
});

test('unauthenticated user cannot read club data', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'clubs/active_club/profiles/p1')));
});

#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'demo-taekwondo-6v4b';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [firestoreHost, firestorePortRaw] = host.split(':');
const firestorePort = Number(firestorePortRaw || 8080);
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: firestoreHost, port: firestorePort, rules },
});

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('✅', name);
  } catch (error) {
    console.error('❌', name);
    throw error;
  }
}

function dbAs(uid, token = {}) {
  return env.authenticatedContext(uid, token).firestore();
}

await env.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  const seed = async (path, data) => setDoc(doc(db, path), data);

  await seed('users/admin-a', { role: 'admin', clubId: 'club-a', status: 'active' });
  await seed('users/coach-a1', { role: 'coach', clubId: 'club-a', branch: 'CS1', status: 'active' });
  await seed('users/coach-a2', { role: 'coach', clubId: 'club-a', branch: 'CS2', status: 'active' });
  await seed('users/coach-legacy', { role: 'coach', clubId: 'club-a', status: 'active' });
  await seed('users/coach-stale', { role: 'coach', clubId: 'club-a', branch: 'CS2', coachBranch: 'CS2', status: 'active' });
  await seed('users/viewer-a', { role: 'viewer', clubId: 'club-a', status: 'active' });
  await seed('users/admin-b', { role: 'admin', clubId: 'club-b', status: 'active' });
  await seed('users/locked-a', { role: 'admin', clubId: 'club-a', status: 'locked' });
  await seed('users/super-1', { role: 'super_admin', status: 'active' });
  await seed('super_admins/super-1', { enabled: true });

  await seed('clubs/club-a', { name: 'Club A' });
  await seed('clubs/club-b', { name: 'Club B' });

  // Admin-authored Coach assignment mirrors used by the V4B1 exact repair path.
  await seed('clubs/club-a/coaches/coach-a1', { uid: 'coach-a1', role: 'coach', clubId: 'club-a', branch: 'CS1', coachBranch: 'CS1', email: 'a1@example.com' });
  await seed('clubs/club-a/coaches/coach-a2', { uid: 'coach-a2', role: 'coach', clubId: 'club-a', branch: 'CS2', coachBranch: 'CS2', email: 'a2@example.com' });
  await seed('clubs/club-a/coaches/coach-stale', { uid: 'coach-stale', role: 'coach', clubId: 'club-a', branch: 'CS1', coachBranch: 'CS1', email: 'stale@example.com' });
  await seed('clubs/club-a/coaches/coach-missing', { uid: 'coach-missing', role: 'coach', clubId: 'club-a', branch: 'CS2', coachBranch: 'CS2', email: 'missing@example.com' });

  await seed('clubs/club-a/profiles/p-cs1', { name: 'CS1 Student', branch: 'CS1', status: 'active' });
  await seed('clubs/club-a/profiles/p-legacy', { name: 'Legacy Student', branch: 'Mặc định', status: 'active' });
  await seed('clubs/club-a/profiles/p-cs2', { name: 'CS2 Student', branch: 'CS2', status: 'active' });
  await seed('clubs/club-b/profiles/p-b', { name: 'Other Club', branch: 'CS1', status: 'active' });

  await seed('clubs/club-a/attendance/a-cs1', { profileId: 'p-cs1', branch: 'CS1', date: '2026-06-25', month: '2026-06' });
  await seed('clubs/club-a/attendance/a-legacy', { profileId: 'p-legacy', branch: 'Mặc định', date: '2026-06-25', month: '2026-06' });
  await seed('clubs/club-a/attendance/a-cs2', { profileId: 'p-cs2', branch: 'CS2', date: '2026-06-25', month: '2026-06' });

  await seed('clubs/club-a/attendanceNotes/n-own', { coachId: 'coach-a1', branch: 'CS1', note: 'Own' });
  await seed('clubs/club-a/attendanceNotes/n-other', { coachId: 'coach-a2', branch: 'CS1', note: 'Other' });
  await seed('clubs/club-a/adminNotifications/notif-own', { coachId: 'coach-a1', branch: 'CS1', readAt: null });

  await seed('clubs/club-a/transactions/tx1', { amount: 100000, type: 'Học phí' });
  await seed('clubs/club-a/inventory/i1', { type: 'Võ phục', quantity: 3 });
  await seed('clubs/club-a/stats/2026_06', { revenue: 100000 });
  await seed('clubs/club-a/settings/main_config', { branchCount: 2, tuitionFee: 300000 });
  await seed('clubs/club-a/settings/shifts', { list: [] });
  await seed('clubs/club-a/settings/inventory_stats', { stock: 3 });
  await seed('clubs/club-a/unknown_private/x1', { secret: true });
});

const coach1 = dbAs('coach-a1');
const coach2 = dbAs('coach-a2');
const coachStale = dbAs('coach-stale');
const coachMissing = dbAs('coach-missing');
const coachNoAssignment = dbAs('coach-no-assignment');
const adminA = dbAs('admin-a');
const adminB = dbAs('admin-b');
const viewerA = dbAs('viewer-a');
const lockedA = dbAs('locked-a');
const superDb = dbAs('super-1', { role: 'super_admin' });

try {
  await test('Coach CS1 reads canonical profile in assigned branch', async () => {
    await assertSucceeds(getDoc(doc(coach1, 'clubs/club-a/profiles/p-cs1')));
  });
  await test('Coach CS1 reads legacy Mặc định profile as primary-branch alias', async () => {
    await assertSucceeds(getDoc(doc(coach1, 'clubs/club-a/profiles/p-legacy')));
  });
  await test('Coach CS1 cannot read CS2 profile', async () => {
    await assertFails(getDoc(doc(coach1, 'clubs/club-a/profiles/p-cs2')));
  });
  await test('Coach cannot query all profiles without a branch constraint', async () => {
    await assertFails(getDocs(collection(coach1, 'clubs/club-a/profiles')));
  });
  await test('Coach may query only assigned canonical branch', async () => {
    await assertSucceeds(getDocs(query(collection(coach1, 'clubs/club-a/profiles'), where('branch', '==', 'CS1'))));
  });
  await test('Coach may query legacy primary alias separately', async () => {
    await assertSucceeds(getDocs(query(collection(coach1, 'clubs/club-a/profiles'), where('branch', '==', 'Mặc định'))));
  });

  await test('Coach cannot read transactions', async () => {
    await assertFails(getDoc(doc(coach1, 'clubs/club-a/transactions/tx1')));
  });
  await test('Coach cannot read inventory', async () => {
    await assertFails(getDoc(doc(coach1, 'clubs/club-a/inventory/i1')));
  });
  await test('Coach cannot read stats', async () => {
    await assertFails(getDoc(doc(coach1, 'clubs/club-a/stats/2026_06')));
  });
  await test('Coach can read only compatible attendance settings', async () => {
    await assertSucceeds(getDoc(doc(coach1, 'clubs/club-a/settings/main_config')));
    await assertSucceeds(getDoc(doc(coach1, 'clubs/club-a/settings/shifts')));
    await assertFails(getDoc(doc(coach1, 'clubs/club-a/settings/inventory_stats')));
  });

  await test('Coach can create attendance in assigned branch', async () => {
    await assertSucceeds(setDoc(doc(coach1, 'clubs/club-a/attendance/new-cs1'), {
      profileId: 'p-cs1', branch: 'CS1', date: '2026-06-25', month: '2026-06', status: 1,
    }));
  });
  await test('Coach cannot create attendance in another branch', async () => {
    await assertFails(setDoc(doc(coach1, 'clubs/club-a/attendance/new-cs2'), {
      profileId: 'p-cs2', branch: 'CS2', date: '2026-06-25', month: '2026-06', status: 1,
    }));
  });
  await test('Coach cannot move an attendance record to another branch', async () => {
    await assertFails(updateDoc(doc(coach1, 'clubs/club-a/attendance/a-cs1'), { branch: 'CS2' }));
  });
  await test('Coach cannot delete another branch attendance record', async () => {
    await assertFails(deleteDoc(doc(coach1, 'clubs/club-a/attendance/a-cs2')));
  });

  await test('Coach reads own note but not another coach note', async () => {
    await assertSucceeds(getDoc(doc(coach1, 'clubs/club-a/attendanceNotes/n-own')));
    await assertFails(getDoc(doc(coach1, 'clubs/club-a/attendanceNotes/n-other')));
  });
  await test('Coach can create own notification but cannot impersonate another coach', async () => {
    await assertSucceeds(setDoc(doc(coach1, 'clubs/club-a/adminNotifications/notif-new'), {
      coachId: 'coach-a1', branch: 'CS1', readAt: null,
    }));
    await assertFails(setDoc(doc(coach1, 'clubs/club-a/adminNotifications/notif-impersonate'), {
      coachId: 'coach-a2', branch: 'CS1', readAt: null,
    }));
  });
  await test('Coach cannot list admin notifications', async () => {
    await assertFails(getDocs(collection(coach1, 'clubs/club-a/adminNotifications')));
  });

  await test('Coach can read only their own exact Admin assignment mirror', async () => {
    await assertSucceeds(getDoc(doc(coach1, 'clubs/club-a/coaches/coach-a1')));
    await assertFails(getDoc(doc(coach1, 'clubs/club-a/coaches/coach-a2')));
  });
  await test('Stale Coach may repair branch mirror only to the Admin-assigned branch', async () => {
    await assertSucceeds(updateDoc(doc(coachStale, 'users/coach-stale'), {
      branch: 'CS1', coachBranch: 'CS1', email: 'stale@example.com', updatedAt: '2026-06-27',
    }));
    await assertFails(updateDoc(doc(coachStale, 'users/coach-stale'), {
      branch: 'CS2', coachBranch: 'CS2', email: 'stale@example.com', updatedAt: '2026-06-27b',
    }));
  });
  await test('Coach missing users doc may create only an exact assignment mirror', async () => {
    await assertSucceeds(getDoc(doc(coachMissing, 'clubs/club-a/coaches/coach-missing')));
    await assertSucceeds(setDoc(doc(coachMissing, 'users/coach-missing'), {
      role: 'coach', clubId: 'club-a', branch: 'CS2', coachBranch: 'CS2', email: 'missing@example.com', updatedAt: '2026-06-27',
    }));
  });
  await test('Coach cannot invent branch mirror without a matching Admin assignment', async () => {
    await assertFails(setDoc(doc(coachNoAssignment, 'users/coach-no-assignment'), {
      role: 'coach', clubId: 'club-a', branch: 'CS1', coachBranch: 'CS1', email: 'no@example.com', updatedAt: '2026-06-27',
    }));
  });

  await test('User may update safe profile fields', async () => {
    await assertSucceeds(updateDoc(doc(coach1, 'users/coach-a1'), { displayName: 'Coach One', updatedAt: '2026-06-25' }));
  });
  await test('User cannot self-promote role or change tenant/branch', async () => {
    await assertFails(updateDoc(doc(coach1, 'users/coach-a1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(coach1, 'users/coach-a1'), { clubId: 'club-b' }));
    await assertFails(updateDoc(doc(coach1, 'users/coach-a1'), { branch: 'CS2' }));
  });

  await test('Club Admin can provision same-club Coach with branch', async () => {
    await assertSucceeds(setDoc(doc(adminA, 'users/new-coach'), {
      role: 'coach', clubId: 'club-a', branch: 'CS2', email: 'coach@example.com',
    }));
  });
  await test('Club Admin can repair a same-club legacy Coach missing branch', async () => {
    await assertSucceeds(updateDoc(doc(adminA, 'users/coach-legacy'), { branch: 'CS1' }));
  });
  await test('Club Admin cannot provision Coach with an invalid branch code', async () => {
    await assertFails(setDoc(doc(adminA, 'users/new-coach-invalid'), {
      role: 'coach', clubId: 'club-a', branch: 'ALL', email: 'invalid@example.com',
    }));
  });
  await test('Club Admin cannot create Admin or cross-tenant Coach user', async () => {
    await assertFails(setDoc(doc(adminA, 'users/new-admin'), { role: 'admin', clubId: 'club-a' }));
    await assertFails(setDoc(doc(adminA, 'users/new-coach-b'), { role: 'coach', clubId: 'club-b', branch: 'CS1' }));
  });
  await test('Club Admin cannot read another tenant', async () => {
    await assertFails(getDoc(doc(adminA, 'clubs/club-b/profiles/p-b')));
    await assertFails(getDoc(doc(adminB, 'clubs/club-a/profiles/p-cs1')));
  });
  await test('Viewer reads operational data but cannot write', async () => {
    await assertSucceeds(getDoc(doc(viewerA, 'clubs/club-a/transactions/tx1')));
    await assertFails(updateDoc(doc(viewerA, 'clubs/club-a/transactions/tx1'), { amount: 1 }));
  });
  await test('Locked account cannot access its tenant', async () => {
    await assertFails(getDoc(doc(lockedA, 'clubs/club-a')));
  });
  await test('Unknown tenant subcollection is denied', async () => {
    await assertFails(getDoc(doc(adminA, 'clubs/club-a/unknown_private/x1')));
  });
  await test('SuperAdmin retains cross-tenant access', async () => {
    await assertSucceeds(getDoc(doc(superDb, 'clubs/club-b/profiles/p-b')));
  });

  console.log(`\nRules Emulator total: ${passed} passed`);
} finally {
  await env.cleanup();
}

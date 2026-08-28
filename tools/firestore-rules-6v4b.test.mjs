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
  deleteField,
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
  await seed('super_admins/enabled-sa', { enabled: true, email: 'enabled-sa@example.com' });
  await seed('super_admins/disabled-sa', { enabled: false, email: 'disabled-sa@example.com' });
  await seed('super_admins/root-disabled', { enabled: false, email: 'admin@tstquynhon.com' });

  await seed('clubs/club-a', { name: 'Club A', clubName: 'Club A', adminEmail: 'admin-a@example.com', accountStatus: 'active', expiryDate: '2026-12-31', examEnabled: true, parentCode: 'PA001', cachedActiveCount: 2, cachedProfileCount: 3, cacheCoverage: { profiles: true }, adminPassword: 'legacy-secret', passwordChangedAt: '2026-05-01' });
  await seed('clubs/club-b', { name: 'Club B' });
  await seed('login_history/login-1', { email: 'someone@example.com', clubId: 'club-a', role: 'admin', loginAt: '2026-08-11T00:00:00.000Z', timestamp: 1786406400000, browser: 'test', os: 'test', deviceType: 'Desktop', deviceName: 'test' });

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

const coach1 = dbAs('coach-a1', { email: 'coach-a1@example.com' });
const coach2 = dbAs('coach-a2', { email: 'coach-a2@example.com' });
const coachStale = dbAs('coach-stale', { email: 'stale@example.com' });
const coachMissing = dbAs('coach-missing', { email: 'missing@example.com' });
const coachNoAssignment = dbAs('coach-no-assignment', { email: 'no@example.com' });
const adminA = dbAs('admin-a', { email: 'admin-a@example.com' });
const adminB = dbAs('admin-b', { email: 'admin-b@example.com' });
const viewerA = dbAs('viewer-a', { email: 'viewer-a@example.com' });
const lockedA = dbAs('locked-a', { email: 'locked-a@example.com' });
const superDb = dbAs('super-1', { role: 'super_admin', email: 'super@example.com' });
const enabledPrincipalDb = dbAs('enabled-sa', { email: 'enabled-sa@example.com' });
const disabledPrincipalDb = dbAs('disabled-sa', { email: 'disabled-sa@example.com' });
const rootDisabledDb = dbAs('root-disabled', { email: 'admin@tstquynhon.com' });
const rootBootstrapDb = dbAs('root-bootstrap', { email: 'admin@tstquynhon.com' });
const wrongBootstrapDb = dbAs('wrong-bootstrap', { email: 'other@example.com' });
const unauthDb = env.unauthenticatedContext().firestore();

function loginHistoryPayload(email, role, clubId, overrides = {}) {
  return {
    email,
    clubId,
    role,
    loginAt: '2026-08-18T12:34:56.000Z',
    timestamp: 1787056496000,
    browser: 'Chrome',
    os: 'Windows',
    deviceType: 'Desktop',
    deviceName: 'Test Device',
    ...overrides,
  };
}

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
  await test('Coach sensitive config closure: main_config denied, shifts allowed', async () => {
    await assertFails(getDoc(doc(coach1, 'clubs/club-a/settings/main_config')));
    await assertSucceeds(getDoc(doc(coach1, 'clubs/club-a/settings/shifts')));
    await assertFails(getDoc(doc(coach1, 'clubs/club-a/settings/inventory_stats')));
  });
  await test('Viewer retains existing main_config read behavior', async () => {
    await assertSucceeds(getDoc(doc(viewerA, 'clubs/club-a/settings/main_config')));
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


  // ── Phase 4K-6V5U6H: Club root field-level authority ────────────────
  await test('H unauthenticated actor cannot read club root', async () => {
    await assertFails(getDoc(doc(unauthDb, 'clubs/club-a')));
  });
  await test('H Admin may update legitimate root cache fields', async () => {
    await assertSucceeds(updateDoc(doc(adminA, 'clubs/club-a'), {
      cachedActiveCount: 3,
      cachedProfileCount: 4,
      cacheCoverage: { profiles: true, source: 'rules-test' },
    }));
  });
  await test('H2 Admin cannot update legacy parentCode', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { parentCode: 'PA002' }));
  });
  await test('H2 legacy parentCode may remain while Admin updates allowed cache only', async () => {
    await assertSucceeds(updateDoc(doc(adminA, 'clubs/club-a'), { cachedActiveCount: 4 }));
  });
  await test('H2 mixed cache plus parentCode update is denied atomically', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { cachedActiveCount: 100, parentCode: 'NEWCODE' }));
  });
  await test('H Admin cannot extend expiryDate', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { expiryDate: '2099-12-31' }));
  });
  await test('H Admin cannot reactivate accountStatus', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { accountStatus: 'active-bypass' }));
  });
  await test('H Admin cannot mutate adminEmail', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { adminEmail: 'attacker@example.com' }));
  });
  await test('H Admin cannot mutate clubName', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { clubName: '<img src=x onerror=1>' }));
  });
  await test('H Admin cannot mutate examEnabled', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { examEnabled: false }));
  });
  await test('H Admin cannot create or replace plaintext adminPassword', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { adminPassword: 'new-secret-must-fail' }));
  });
  await test('H mixed cache plus privileged root update is denied atomically', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { cachedActiveCount: 100, expiryDate: '2099-12-31' }));
  });
  await test('H SuperAdmin retains privileged root metadata authority', async () => {
    await assertSucceeds(updateDoc(doc(superDb, 'clubs/club-a'), {
      expiryDate: '2027-12-31', accountStatus: 'active', clubName: 'Club A Super', adminEmail: 'admin-super@example.com', examEnabled: false,
    }));
  });
  await test('H Viewer cannot update club root', async () => {
    await assertFails(updateDoc(doc(viewerA, 'clubs/club-a'), { cachedActiveCount: 9 }));
  });
  await test('H Coach cannot update club root', async () => {
    await assertFails(updateDoc(doc(coach1, 'clubs/club-a'), { cachedActiveCount: 9 }));
  });
  await test('H other-tenant Admin cannot update club root', async () => {
    await assertFails(updateDoc(doc(adminB, 'clubs/club-a'), { cachedActiveCount: 9 }));
  });

  // ── Phase 4K-6V5U6H3: login_history identity + enabled principal ──
  await test('H3 LH1 Admin valid login_history audit is allowed', async () => {
    await assertSucceeds(setDoc(doc(adminA, 'login_history/lh-admin-valid'), loginHistoryPayload('admin-a@example.com', 'admin', 'club-a')));
  });
  await test('H3 LH2 Viewer valid login_history audit is allowed', async () => {
    await assertSucceeds(setDoc(doc(viewerA, 'login_history/lh-viewer-valid'), loginHistoryPayload('viewer-a@example.com', 'viewer', 'club-a')));
  });
  await test('H3 LH3 Coach valid login_history audit is allowed', async () => {
    await assertSucceeds(setDoc(doc(coach1, 'login_history/lh-coach-valid'), loginHistoryPayload('coach-a1@example.com', 'coach', 'club-a')));
  });
  await test('H3 LH4 Admin cannot spoof super_admin role', async () => {
    await assertFails(setDoc(doc(adminA, 'login_history/lh-role-spoof'), loginHistoryPayload('admin-a@example.com', 'super_admin', 'club-a')));
  });
  await test('H3 LH5 Admin cannot spoof another club', async () => {
    await assertFails(setDoc(doc(adminA, 'login_history/lh-club-spoof'), loginHistoryPayload('admin-a@example.com', 'admin', 'club-b')));
  });
  await test('H3 LH6 login_history email must match auth token', async () => {
    await assertFails(setDoc(doc(adminA, 'login_history/lh-email-spoof'), loginHistoryPayload('attacker@example.com', 'admin', 'club-a')));
  });
  await test('H3 LH7 invalid deviceType is denied', async () => {
    await assertFails(setDoc(doc(adminA, 'login_history/lh-device-type'), loginHistoryPayload('admin-a@example.com', 'admin', 'club-a', { deviceType: 'Tablet' })));
  });
  await test('H3 LH8 oversized deviceName is denied', async () => {
    await assertFails(setDoc(doc(adminA, 'login_history/lh-device-name'), loginHistoryPayload('admin-a@example.com', 'admin', 'club-a', { deviceName: 'x'.repeat(161) })));
  });
  await test('H3 LH9 unknown login_history field is denied', async () => {
    await assertFails(setDoc(doc(adminA, 'login_history/lh-unknown'), loginHistoryPayload('admin-a@example.com', 'admin', 'club-a', { injected: true })));
  });
  await test('H3 LH10 canonical SuperAdmin login_history audit is allowed', async () => {
    await assertSucceeds(setDoc(doc(superDb, 'login_history/lh-super-valid'), loginHistoryPayload('super@example.com', 'super_admin', '')));
  });

  await test('H3 SA1 enabled principal alone can list clubs', async () => {
    await assertSucceeds(getDocs(collection(enabledPrincipalDb, 'clubs')));
  });
  await test('H3 SA2 enabled principal alone can read login_history', async () => {
    await assertSucceeds(getDocs(collection(enabledPrincipalDb, 'login_history')));
  });
  await test('H3 SA3 disabled principal alone cannot list clubs', async () => {
    await assertFails(getDocs(collection(disabledPrincipalDb, 'clubs')));
  });
  await test('H3 SA4 disabled principal alone cannot read login_history', async () => {
    await assertFails(getDocs(collection(disabledPrincipalDb, 'login_history')));
  });
  await test('H3 SA5 ROOT can read own disabled principal but gains no club-list authority', async () => {
    await assertSucceeds(getDoc(doc(rootDisabledDb, 'super_admins/root-disabled')));
    await assertFails(getDocs(collection(rootDisabledDb, 'clubs')));
  });

  // ── Phase 4K-6V5U5: Canonical security truth / credential transition ──
  await test('V5U5 canonical SuperAdmin can list clubs', async () => {
    await assertSucceeds(getDocs(collection(superDb, 'clubs')));
  });
  await test('V5U5 Admin can read own club root', async () => {
    await assertSucceeds(getDoc(doc(adminA, 'clubs/club-a')));
  });
  await test('V5U5 legacy club may update an allowed cache field while old secret is unchanged', async () => {
    await assertSucceeds(updateDoc(doc(adminA, 'clubs/club-a'), { cachedStudentCount: 4 }));
  });
  await test('V5U5 Admin cannot replace legacy adminPassword with a new secret', async () => {
    await assertFails(updateDoc(doc(adminA, 'clubs/club-a'), { adminPassword: 'new-secret-must-fail' }));
  });
  await test('V5U5 canonical SuperAdmin can remove old credential fields', async () => {
    await assertSucceeds(updateDoc(doc(superDb, 'clubs/club-a'), {
      adminPassword: deleteField(),
      passwordChangedAt: deleteField(),
    }));
  });
  await test('V5U5 new club cannot be created with non-empty adminPassword', async () => {
    await assertFails(setDoc(doc(superDb, 'clubs/club-secret-denied'), {
      clubName: 'Denied Secret Club', adminEmail: 'denied@example.com', adminPassword: 'plaintext-secret', accountStatus: 'active',
    }));
    await assertSucceeds(setDoc(doc(superDb, 'clubs/club-clean-create'), {
      clubName: 'Clean Club', adminEmail: 'clean@example.com', accountStatus: 'active',
    }));
  });
  await test('V5U5 normal Admin has no SuperAdmin list/login_history permission', async () => {
    await assertFails(getDocs(collection(adminA, 'clubs')));
    await assertFails(getDocs(collection(adminA, 'login_history')));
  });
  await test('V5U5 wrong email cannot bootstrap SuperAdmin principal', async () => {
    await assertFails(setDoc(doc(wrongBootstrapDb, 'super_admins/wrong-bootstrap'), {
      enabled: true, email: 'other@example.com', createdAt: 1786406400000, source: 'bootstrap-email-v1',
    }));
  });
  await test('V5U5 exact ROOT email may bootstrap only own principal then use canonical access', async () => {
    await assertSucceeds(getDoc(doc(rootBootstrapDb, 'super_admins/root-bootstrap')));
    await assertSucceeds(setDoc(doc(rootBootstrapDb, 'super_admins/root-bootstrap'), {
      enabled: true, email: 'admin@tstquynhon.com', createdAt: 1786406400000, source: 'bootstrap-email-v1',
    }));
    await assertSucceeds(getDocs(collection(rootBootstrapDb, 'clubs')));
    await assertSucceeds(getDocs(collection(rootBootstrapDb, 'login_history')));
  });

  console.log(`\nRules Emulator total: ${passed} passed`);
} finally {
  await env.cleanup();
}

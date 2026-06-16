/**
 * Phase 4K-6W1 — deterministic tenant policy matrix.
 * This is an offline logic contract complementing (not replacing) the official
 * Firebase Rules Emulator suite in rules-tests/tenant-access.test.mjs.
 */

const now = Date.now();
const clubs = {
  active: { accountStatus: 'active', expiryAt: now + 86_400_000 },
  locked: { accountStatus: 'locked', expiryAt: now + 86_400_000 },
  expired: { accountStatus: 'active', expiryAt: now - 1 },
  missingExpiry: { accountStatus: 'active' },
  invalidStatus: { accountStatus: 'paused', expiryAt: now + 86_400_000 },
};

function operational(club) {
  return Boolean(
    club
    && club.accountStatus === 'active'
    && Number.isFinite(club.expiryAt)
    && club.expiryAt > now
  );
}

function canRootGet(actor, clubId) {
  return actor.authenticated && (actor.superAdmin || actor.clubId === clubId);
}

function canBusinessRead(actor, clubId, club) {
  return actor.authenticated && (actor.superAdmin || (actor.clubId === clubId && operational(club)));
}

function canBusinessWrite(actor, clubId, club, domain) {
  if (!actor.authenticated) return false;
  if (actor.superAdmin) return true;
  if (actor.clubId !== clubId || !operational(club)) return false;
  if (domain === 'attendance') return ['admin', 'owner', 'coach'].includes(actor.role);
  if (domain === 'transaction') return ['admin', 'owner'].includes(actor.role);
  return ['admin', 'owner'].includes(actor.role);
}

const actors = {
  unauth: { authenticated: false },
  admin: { authenticated: true, role: 'admin', clubId: 'clubA' },
  coach: { authenticated: true, role: 'coach', clubId: 'clubA' },
  otherAdmin: { authenticated: true, role: 'admin', clubId: 'clubB' },
  superAdmin: { authenticated: true, role: 'super_admin', superAdmin: true },
};

const cases = [
  ['active admin reads own business data', canBusinessRead(actors.admin, 'clubA', clubs.active), true],
  ['active admin writes own transaction', canBusinessWrite(actors.admin, 'clubA', clubs.active, 'transaction'), true],
  ['active coach writes attendance', canBusinessWrite(actors.coach, 'clubA', clubs.active, 'attendance'), true],
  ['active coach cannot write transaction', canBusinessWrite(actors.coach, 'clubA', clubs.active, 'transaction'), false],
  ['cross-tenant admin cannot read', canBusinessRead(actors.otherAdmin, 'clubA', clubs.active), false],
  ['locked admin cannot read business data', canBusinessRead(actors.admin, 'clubA', clubs.locked), false],
  ['locked coach cannot write attendance', canBusinessWrite(actors.coach, 'clubA', clubs.locked, 'attendance'), false],
  ['locked member can read root status', canRootGet(actors.admin, 'clubA'), true],
  ['expired admin cannot read business data', canBusinessRead(actors.admin, 'clubA', clubs.expired), false],
  ['expired admin cannot write business data', canBusinessWrite(actors.admin, 'clubA', clubs.expired, 'transaction'), false],
  ['missing expiry fails closed', canBusinessRead(actors.admin, 'clubA', clubs.missingExpiry), false],
  ['invalid status fails closed', canBusinessRead(actors.admin, 'clubA', clubs.invalidStatus), false],
  ['superadmin reads locked tenant', canBusinessRead(actors.superAdmin, 'clubA', clubs.locked), true],
  ['superadmin writes expired tenant', canBusinessWrite(actors.superAdmin, 'clubA', clubs.expired, 'transaction'), true],
  ['unauthenticated root read denied', canRootGet(actors.unauth, 'clubA'), false],
  ['unauthenticated business read denied', canBusinessRead(actors.unauth, 'clubA', clubs.active), false],
];

let passed = 0;
for (const [name, actual, expected] of cases) {
  if (actual !== expected) {
    console.error(`❌ ${name}: expected ${expected}, got ${actual}`);
    process.exitCode = 1;
  } else {
    passed++;
    console.log(`✅ ${name}`);
  }
}

if (!process.exitCode) {
  console.log(`\nPhase 4K-6W1 offline tenant policy matrix: ${passed}/${cases.length} passed.`);
}

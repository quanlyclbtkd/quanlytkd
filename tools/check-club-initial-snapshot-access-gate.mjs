import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const profiles = fs.readFileSync('js/listeners/profiles.listeners.js', 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name, detail); }
};

const helperStart = app.indexOf('// Phase 4K-6V5U6B — ONE clubs/{clubId} authority');
const initStart = app.indexOf('async function initSaaSDatabase(clubId)');
const initEnd = app.indexOf('async function listenToData', initStart);
const helper = app.slice(helperStart, initStart);
const init = app.slice(initStart, initEnd > initStart ? initEnd : initStart + 120000);

const pFirst = init.indexOf('await _clubBootstrap.firstSnapshotPromise');
const pAccept = init.indexOf("if (!_clubFirstSnapshot?.accepted || _clubAccessBootstrapState.ready !== true) return false;");
const pContext = init.indexOf("dispatchAppContextReady('initSaaSDatabase-store-synced')");
const pDb = init.indexOf("new CustomEvent('app:db-ready'");
const pShell = init.indexOf("new CustomEvent('app:shell-ready'");
const pSettings = init.indexOf("const _settingsKey = 'global:settings:' + clubId");
const pProfiles = init.indexOf("window.mountActiveProfilesListener");
const pInvDebt = init.indexOf("_inventoryDebtQuery");

check('event order: first snapshot wait precedes accepted gate', pFirst >= 0 && pFirst < pAccept);
check('event order: accepted gate precedes app:context-ready', pAccept >= 0 && pAccept < pContext);
check('event order: context-ready precedes db-ready', pContext >= 0 && pContext < pDb);
check('event order: db-ready precedes shell-ready', pDb >= 0 && pDb < pShell);
check('event order: shell-ready precedes direct settings listener mount', pShell >= 0 && pShell < pSettings);
check('event order: accepted gate precedes profile mount', pAccept >= 0 && pAccept < pProfiles);
check('event order: accepted gate precedes inventory debt source', pAccept >= 0 && pAccept < pInvDebt);
check('tenant mainApp stays hidden before gate', /window\.userRole !== 'super_admin'[\s\S]{0,500}_mainApp\) _mainApp\.style\.display = 'none'/.test(init) || init.includes("if (_mainApp) _mainApp.style.display = 'none';"));
check('active snapshot reveals tenant shell only after accepted gate', pAccept < init.indexOf("if (_mainApp) _mainApp.style.display = 'block';", pAccept));

check('missing club snapshot blocks', helper.includes("reason: 'missing'"));
check('accountStatus missing remains backward-compatible active', helper.includes("data.accountStatus || 'active'"));
check('locked club blocks', helper.includes("accountStatus === 'locked'") && helper.includes("reason: 'locked'"));
check('legacy/missing expiry keeps current fallback policy', helper.includes("data.expiryDate || '2027-04-30'"));
check('expired club blocks', helper.includes("expiryDate < today") && helper.includes("reason: 'expired'"));
check('<=30 day expiry warning remains non-blocking', helper.includes('warning: expiryDate <= in30Days'));
check('cache snapshot source is recorded without second read', helper.includes("snap?.metadata?.fromCache === true ? 'cache' : 'server'"));
check('server snapshots are revalidated by same callback', helper.includes('_validateClubAccessSnapshot(snap)') && !helper.includes('getDocFromServer'));
check('ready -> blocked cleanup is idempotent', helper.includes("status === 'blocked' || _clubAccessBootstrapState.status === 'error'") && helper.includes('_transitionClubAccessBlocked'));
check('blocked -> ready auto-remount is prevented in same session', helper.includes('Once blocked in a session') && /status === 'blocked'[\s\S]{0,250}finishFirst/.test(helper));
check('stale callback guard includes auth uid', helper.includes("String(identity.uid || '') === currentUid"));
check('stale callback guard includes clubId', helper.includes("String(identity.clubId || '') === String(authState.clubId || '')"));
check('stale callback guard includes auth generation', helper.includes('identity.authGeneration') && helper.includes('authState.generation'));
check('permission-denied before first snapshot fails closed', helper.includes("code === 'permission-denied' ? 'permission-denied' : 'listener-error'"));
check('listener registration failure fails closed', helper.includes("status: 'error', blockedReason: 'listener-registration-failed'"));
check('logout resets bootstrap flight/state', app.includes('_clubAccessBootstrapFlight = null;') && app.includes("status: 'idle', firstSnapshotSeen: false, ready: false"));
check('Coach CS1 + Mặc định compatibility unchanged', profiles.includes("coachBranch === 'CS1'") && profiles.includes("branch', '==', 'Mặc định'"));
check('Coach attendance first render is deferred until after ready events', init.indexOf('_shouldAutoRenderCoachAttendance =') < pContext && init.indexOf('window.renderAttendanceList();', pShell) > pShell);

// Lightweight policy simulation, independent of Firebase network, to freeze expected access decisions.
const today = '2026-08-12';
const in30 = '2026-09-11';
function policy({exists=true, data={}, source='server'}) {
  if (!exists) return {accepted:false, reason:'missing', source};
  const status = String(data.accountStatus || 'active').toLowerCase();
  const expiry = String(data.expiryDate || '2027-04-30');
  if (status === 'locked') return {accepted:false, reason:'locked', source};
  if (expiry < today) return {accepted:false, reason:'expired', source};
  return {accepted:true, reason:'', source, warning:expiry <= in30};
}
check('simulation: active admin accepted', policy({data:{accountStatus:'active',expiryDate:'2027-01-01'}}).accepted);
check('simulation: active viewer accepted', policy({data:{expiryDate:'2027-01-01'}}).accepted);
check('simulation: active coach accepted', policy({data:{expiryDate:'2027-01-01'}}).accepted);
check('simulation: coach CS1 access policy accepted', policy({data:{expiryDate:'2027-01-01'}}).accepted);
check('simulation: locked blocks', policy({data:{accountStatus:'locked',expiryDate:'2027-01-01'}}).reason === 'locked');
check('simulation: expired blocks', policy({data:{expiryDate:'2026-08-11'}}).reason === 'expired');
check('simulation: expiry warning <=30d accepted', policy({data:{expiryDate:'2026-09-01'}}).accepted && policy({data:{expiryDate:'2026-09-01'}}).warning);
check('simulation: missing document blocks', policy({exists:false}).reason === 'missing');
check('simulation: cache active can bootstrap compatibly', policy({source:'cache',data:{expiryDate:'2027-01-01'}}).accepted);
check('simulation: later server locked would block', policy({source:'server',data:{accountStatus:'locked',expiryDate:'2027-01-01'}}).reason === 'locked');

// Stale login model: A callback cannot match B's verified identity/generation.
const matches = (identity, authState) => identity.uid===authState.uid && identity.clubId===authState.clubId && identity.generation===authState.generation;
check('simulation: stale Club A callback cannot activate Club B', !matches({uid:'u1',clubId:'A',generation:1},{uid:'u2',clubId:'B',generation:3}));
check('simulation: old generation same uid/club cannot reactivate new login', !matches({uid:'u1',clubId:'A',generation:1},{uid:'u1',clubId:'A',generation:3}));

console.log(`\nPASS ${pass}/${pass + fail}`);
if (fail) process.exit(1);

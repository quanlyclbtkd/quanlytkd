#!/usr/bin/env node
import fs from 'node:fs';

let pass = 0, fail = 0;
function check(label, cond, detail='') { if (cond) { pass++; console.log('PASS', label); } else { fail++; console.error('FAIL', label, detail); } }

const boundarySrc = fs.readFileSync('js/core/debtProfileReadBoundary.js','utf8');
const rendererSrc = fs.readFileSync('js/ui/render/computation/studentsRenderer.js','utf8');
const invalidationSrc = fs.readFileSync('js/ui/render/renderInvalidation.js','utf8');
const profilesSrc = fs.readFileSync('js/listeners/profiles.listeners.js','utf8');
const tuitionSrc = fs.readFileSync('js/core/tuitionCommandBoundary.js','utf8');
const studentsSrc = fs.readFileSync('js/modules/students.js','utf8');

check('S01 8-second Debt polling lifecycle removed', !boundarySrc.includes('WAIT_TIMEOUT_MS') && !boundarySrc.includes('WAIT_STEP_MS') && !boundarySrc.includes('waitForActiveSource'));
check('S02 Debt invalidation has a canonical existing-list route', /case ['"]debt['"]/.test(invalidationSrc) && invalidationSrc.includes("runRender('students.debtList')") && invalidationSrc.includes("invalidateList('students.debtList'"));
check('S03 transient Debt invalidation does not start heavyweight compute', /presentationState === 'TRANSIENT_LOCAL_WRITE'[\s\S]{0,260}runRender\('students\.debtList'\)/.test(invalidationSrc));
check('S04 renderer preserves verified Debt rows during transient local write', rendererSrc.includes('lastVerifiedDebtRows') && rendererSrc.includes('Đang cập nhật…') && rendererSrc.includes("state === 'TRANSIENT_LOCAL_WRITE'"));
check('S05 context mismatch remains fail-closed', rendererSrc.includes('lastVerifiedDebtRowsContextKey === _debtPresentationContextKey()') && rendererSrc.includes('lastVerifiedDebtSummaryContextKey === _debtPresentationContextKey()'));
check('S06 pending profile snapshot no longer relies on unknown debt domain', profilesSrc.includes("invalidateByDomain('debt', 'profiles-snapshot-unverified')") && /case ['"]debt['"]/.test(invalidationSrc));
check('S07 full profile ACK does not route Debt twice', !/invalidateByDomain\('debt',[\s\S]{0,80}reason\)/.test(profilesSrc.slice(profilesSrc.indexOf('function _invalidateAll'), profilesSrc.indexOf('// ─────────────────────────────────────────────────────────────────────────────\n// COVERAGE GUARD'))));
check('S08 Tuition command can defer Students to profile-listener ACK owner', tuitionSrc.includes('profileAckOwned') && tuitionSrc.includes("? ['tx.txList']"));
check('S09 add student normal path defers duplicate computation to ACK owner', studentsSrc.includes('profileAckOwnsRefresh') && studentsSrc.includes('if (!profileAckOwnsRefresh)'));

// ---- Dynamic boundary state machine ----
globalThis.window = globalThis;
window.userRole = 'admin';
window.__verifiedAuthContextState = { ready:true, generation:7, uid:'uid-A', role:'admin', clubId:'club-A' };
window.__store = { clubId:'club-A', currentClubId:'club-A', userRole:'admin', selectedMonth:'2026-10', clubConfig:{}, profiles:{} };
let listener = {
  activeListenerMounted:true, activeListenerFailed:false, activeListenerKey:'students:profiles:active:club-A:admin',
  authorityClubId:'club-A', fullAuthoritySnapshotSeen:true, fullAuthoritySnapshotCount:1, fullAuthorityComplete:true,
  authorityServerConfirmed:true, authorityFreshness:'fresh', authorityHasPendingWrites:false,
  authoritySessionEpoch:7, activeOwnerUid:'uid-A', role:'admin', lastProfilesMode:'full-profiles-authoritative', quitComplete:true,
};
window.studentProfileStore = { quitComplete:true, version:1 };
window.getProfilesListenerMetrics = () => ({...listener});
window.getProfileStatusConfig = () => ({ activeQueryValues:['active','trial'], quitQueryValues:['quit'] });
window.hasListener = () => true;
await import(`../js/core/debtProfileReadBoundary.js?r2r51=${Date.now()}`);
const debtBoundary = window.DebtProfileReadBoundary;
let status = debtBoundary.getStatus();
check('D01 server authority is FRESH', status.ready === true && status.presentationState === 'FRESH');
const opA = debtBoundary.beginSyncOperation({action:'test.updateProfile',profileId:'Sensitive Real Name',affectsDebt:true});
debtBoundary.markSyncStage(opA,'primaryWriteStart');
check('D01b RAM diagnostics anonymize profile identity', !JSON.stringify(debtBoundary.getSyncDiagnostics()).includes('Sensitive Real Name'));
listener = {...listener, authorityFreshness:'stale', authorityHasPendingWrites:true};
debtBoundary.markActiveSyncStage('profilePendingSnapshotAt',{clubId:'club-A'});
status = debtBoundary.getStatus();
check('D02 local pending snapshot demotes ready but classifies TRANSIENT_LOCAL_WRITE', status.ready === false && status.presentationState === 'TRANSIENT_LOCAL_WRITE');
const t0 = Date.now();
const pendingEnsure = await debtBoundary.ensureDebtProfileCoverage('r2r5.1-pending-test');
check('D03 pending mounted listener returns deferred immediately, not after 8s', pendingEnsure.ready === false && pendingEnsure.deferred === true && (Date.now()-t0) < 100);
debtBoundary.markSyncStage(opA,'primaryWriteAckAt');
listener = {...listener, authorityFreshness:'fresh', authorityHasPendingWrites:false};
debtBoundary.markActiveSyncStage('profileServerFreshAt',{clubId:'club-A'});
check('D03b ACK-before-listener-fresh ordering is recorded without self-promoting coverage', debtBoundary.getSyncDiagnostics().active.find(x=>x.operationId===opA)?.primaryWriteAckAt != null && debtBoundary.getSyncDiagnostics().active.find(x=>x.operationId===opA)?.profileServerFreshAt != null);
debtBoundary.markActiveSyncStage('debtRefreshRequestedAt',{clubId:'club-A',onlyDebt:true});
status = debtBoundary.getStatus();
check('D04 same owner server callback restores FRESH', status.ready === true && status.presentationState === 'FRESH');

// ---- Renderer last-server-verified preservation ----
const elements = {
  filterMonth:{value:'2026-10'}, filterBranch:{value:'all'}, searchInput:{value:''},
};
globalThis.document = {
  getElementById(id){ return elements[id] || null; },
  querySelector(){ return null; },
};
window.__store.profiles = { A:{status:'active',branch:'CS1',tuitionFee:100000,paidUntil:'2026-09',paidMonths:['2026-09'],admissionDate:'2026-09-01'} };
window.getDebtOverdueFilterValue = () => 0;
window.PerformanceMonitor = { record(){} };
window.studentProfileStore.version = 1;
const renderer = await import(`../js/ui/render/computation/studentsRenderer.js?r2r51=${Date.now()}`);
renderer.computeAndCacheStudents(window.__store.profiles,{curTabId:'debt',selMonth:'2026-10',selBranch:'all',search:'',isSingleBranch:true,isAdmin:true,bStats:{},pgStudents:null,pgStudentsActive:false,activePage:1,debtPage:1,quitPage:1});
const freshHtml = renderer.getStudentsCachedHtml('debtRows');
const freshSummary = renderer.getStudentsSummary();
check('D05 fresh Debt cache contains current debtor', freshHtml.includes('data-debt-id="A"') && freshSummary.debtCount === 1 && freshSummary.debtSummaryFresh === true);

const opB = debtBoundary.beginSyncOperation({action:'test.tuition',profileId:'A',affectsDebt:true});
debtBoundary.markSyncStage(opB,'primaryWriteStart');
listener = {...listener, authorityFreshness:'stale', authorityHasPendingWrites:true};
debtBoundary.markActiveSyncStage('profilePendingSnapshotAt',{clubId:'club-A'});
const transientHtml = renderer.getStudentsCachedHtml('debtRows');
const transientSummary = renderer.getStudentsSummary();
check('D06 transient write keeps verified rows visible', transientHtml.includes('Đang cập nhật…') && transientHtml.includes('data-debt-id="A"') && !transientHtml.includes('Đang đồng bộ đầy đủ dữ liệu Báo nợ'));
check('D07 transient write keeps verified Debt summary without claiming fresh', transientSummary.debtCount === 1 && transientSummary.totalDebtEst === 100000 && transientSummary.debtSummaryPending === false && transientSummary.debtSummaryUpdating === true && transientSummary.debtSummaryFresh === false);
elements.searchInput.value = 'other-context';
const mismatchHtml = renderer.getStudentsCachedHtml('debtRows');
const mismatchSummary = renderer.getStudentsSummary();
check('D08 transient cross-context reuse is blocked', mismatchHtml.includes('Đang đồng bộ đầy đủ dữ liệu Báo nợ') && mismatchSummary.debtSummaryPending === true && mismatchSummary.debtCount === null);
elements.searchInput.value = '';

// Race: server fresh callback can complete before command continuation/ACK timestamp.
listener = {...listener, authorityFreshness:'fresh', authorityHasPendingWrites:false};
debtBoundary.markActiveSyncStage('profileServerFreshAt',{clubId:'club-A'});
debtBoundary.markActiveSyncStage('debtRefreshRequestedAt',{clubId:'club-A',onlyDebt:true});
window.__store.profiles.A = {...window.__store.profiles.A,paidUntil:'2026-10',paidMonths:['2026-09','2026-10']};
window.studentProfileStore.version = 2;
renderer.computeAndCacheStudents(window.__store.profiles,{curTabId:'debt',selMonth:'2026-10',selBranch:'all',search:'',isSingleBranch:true,isAdmin:true,bStats:{},pgStudents:null,pgStudentsActive:false,activePage:1,debtPage:1,quitPage:1});
const freshAfterAckHtml = renderer.getStudentsCachedHtml('debtRows');
debtBoundary.markSyncStage(opB,'primaryWriteAckAt');
const diagAfterRace = debtBoundary.getSyncDiagnostics();
const raced = diagAfterRace.history.find(row => row.operationId === opB);
check('D09 server-fresh→render may happen before command continuation without losing ACK ownership', !!raced && raced.profileServerFreshAt != null && raced.debtRefreshRequestedAt != null && raced.debtComputeStartAt != null && raced.debtComputeEndAt != null && raced.debtRenderAt != null && raced.syncClearedAt != null && raced.primaryWriteAckAt != null && debtBoundary.isProfileAckOwnedOperation(opB) === true);
const finalSummary = renderer.getStudentsSummary();
check('D10 server ACK automatically publishes fresh Debt without reload', !freshAfterAckHtml.includes('data-debt-id="A"') && finalSummary.debtCount === 0 && finalSummary.debtSummaryFresh === true);

// Initial/unknown/session mismatch stays fail-closed.
listener = {...listener, authorityClubId:'club-OTHER', authorityFreshness:'fresh', authorityHasPendingWrites:false};
status = debtBoundary.getStatus();
check('D11 club mismatch is NOT_READY', status.presentationState === 'NOT_READY' && status.ready === false);
listener = {...listener, authorityClubId:'club-A', fullAuthoritySnapshotSeen:false, fullAuthorityComplete:false, authorityServerConfirmed:false, authorityFreshness:'pending'};
status = debtBoundary.getStatus();
check('D12 initial authority loading is NOT_READY', status.presentationState === 'NOT_READY' && status.ready === false);
listener = {...listener, fullAuthoritySnapshotSeen:true, fullAuthorityComplete:true, authorityServerConfirmed:true, authorityFreshness:'stale', authorityHasPendingWrites:true, activeListenerFailed:true};
status = debtBoundary.getStatus();
check('D12b listener failure cannot become TRANSIENT_LOCAL_WRITE', status.presentationState === 'NOT_READY' && status.ready === false);
listener = {...listener, activeListenerFailed:false, activeOwnerUid:'uid-OTHER', authoritySessionEpoch:7};
status = debtBoundary.getStatus();
check('D12c owner mismatch cannot reuse last-good Debt', status.presentationState === 'NOT_READY' && status.ready === false);
listener = {...listener, activeOwnerUid:'uid-A', authoritySessionEpoch:999};
status = debtBoundary.getStatus();
check('D12d auth generation mismatch cannot reuse last-good Debt', status.presentationState === 'NOT_READY' && status.ready === false);

// Restore fresh state for command behavior tests.
listener = {...listener, authorityClubId:'club-A', fullAuthoritySnapshotSeen:true, fullAuthorityComplete:true, authorityServerConfirmed:true, authorityFreshness:'fresh', authorityHasPendingWrites:false, activeOwnerUid:'uid-A', authoritySessionEpoch:7, activeListenerMounted:true, activeListenerFailed:false, lastProfilesMode:'full-profiles-authoritative'};
window.__store.profiles = { A:{status:'active',branch:'CS1',gender:'Nam',feeExempt:false,tuitionFee:100000,paidUntil:'2026-09',paidMonths:['2026-09']} };
window.studentProfileStore = {
  quitComplete:true, version:3,
  getProfile(name){ return window.__store.profiles[name]; },
  mergeProfile(name,data){ window.__store.profiles[name] = data; this.version++; },
  removeProfile(name){ delete window.__store.profiles[name]; this.version++; },
};
window.StudentService = {
  async updateProfile(){}, async renameWithBatch(){}, async deleteProfile(){},
};
window.syncStudentStatusLocal = () => {};
window.invalidateSearchCache = () => {};
window.invalidateList = () => {};
window.removeStudentFromDebtDom = () => {};
window.markQuitAuthorityDirty = () => {};
window.TuitionCommandBoundary = { runInProfileTuitionMutationLane: async (_meta, task) => task() };
const ssMod = await import(`../js/core/studentStatusCommandBoundary.js?r2r51=${Date.now()}`);
ssMod.initStudentStatusCommandBoundary();
async function profileCase(base, patch) {
  debtBoundary.reset('profile-case');
  window.__store.profiles = { A:{...base} };
  window.studentProfileStore.getProfile = name => window.__store.profiles[name];
  return window.StudentStatusCommandBoundary.updateProfile({oldName:'A',newName:'A',updateData:patch});
}
let r = await profileCase({status:'active',gender:'Nam',feeExempt:false,paidUntil:'2026-09',paidMonths:['2026-09']},{gender:'Nữ'});
check('D13 non-Debt profile field is classified non-Debt', r.debtAffecting === false && r.changedFields.includes('gender'));
r = await profileCase({status:'active',feeExempt:false,paidUntil:'2026-09',paidMonths:['2026-09']},{paidUntil:'2026-10'});
check('D14 paidUntil update is Debt-affecting', r.debtAffecting === true);
r = await profileCase({status:'active',feeExempt:false,paidUntil:'2026-09',paidMonths:['2026-09']},{feeExempt:true});
check('D15 feeExempt update is Debt-affecting', r.debtAffecting === true);
r = await profileCase({status:'active',paidUntil:'2026-09',paidMonths:['2026-09']},{status:'quit'});
check('D16 active→quit is Debt-affecting', r.debtAffecting === true);
r = await profileCase({status:'quit',paidUntil:'2026-09',paidMonths:['2026-09']},{status:'active'});
check('D17 quit→active is Debt-affecting', r.debtAffecting === true);

// Static compute-count closure: normal tuition/add-student command paths do not
// invoke Students compute after ACK when the existing profile listener owns ACK.
check('D18 Tuition normal post-commit path refreshes Finance tx only until profile ACK', /const keys = profileAckOwned\s*\? \['tx\.txList'\]/.test(tuitionSrc));
check('D19 Add Student normal post-commit path has zero command-side Students refresh', /if \(!profileAckOwnsRefresh\) \{[\s\S]*refreshListsComputation/.test(studentsSrc));
check('D20 profile server ACK requests Debt refresh before canonical invalidation', profilesSrc.includes("markActiveSyncStage?.('debtRefreshRequestedAt'") && profilesSrc.indexOf("markActiveSyncStage?.('debtRefreshRequestedAt'") < profilesSrc.indexOf("_invalidateAll('full-profiles-authoritative-snapshot'"));

console.log(`\nR2R5.1-SYNC closure: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);

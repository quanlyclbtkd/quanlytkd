import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.ROOT || process.cwd();
const { installTransactionFixture, fixtureSnapshot } = await import(pathToFileURL(path.join(ROOT, 'tools/inventory-stock-r1/transaction-fixture.mjs')).href);
const EXPECT = process.env.EXPECT || 'green';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

class El {
  constructor(id = '', value = '') {
    this.id = id;
    this.value = value;
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.dataset = {};
    this.style = { display: 'flex' };
    this.options = [];
    this.children = [];
    this.textContent = '';
    this.innerHTML = '';
  }
  addEventListener() {}
  focus() {}
  replaceChildren(...xs) { this.children = [...xs]; this.options = [...xs]; }
  add(x) { this.children.push(x); this.options.push(x); }
  appendChild(x) { this.children.push(x); return x; }
  select() {}
}

global.Option = class Option {
  constructor(text = '', value = '') { this.text = text; this.value = value; this.disabled = false; }
};

global.alert = () => {};
global.confirm = () => true;
global.prompt = () => '250000';

const effects = [];
const batches = [];
const refs = [];
let autoId = 0;
let currentScenario = null;
let elements = new Map();
let trainingDays = [];
let stores = null;

function authState(club = 'A', generation = 1, ready = true, uid = 'u') {
  window.__verifiedAuthContextState = { ready, uid, generation, sessionEpoch: generation, authGeneration: generation };
  window.currentClubId = club;
}
function setCtx(club = 'A', generation = 1, ready = true, uid = 'u') {
  authState(club, generation, ready, uid);
  const st = stores[club] || (stores[club] = { profiles: {} });
  window.__store.clubId = club;
  window.__store.profiles = st.profiles;
  window.__store.colRef = { kind: 'collection', path: `clubs/${club}/transactions`, club };
  window.__store.invRef = { kind: 'collection', path: `clubs/${club}/inventory`, club };
}
function ctx() {
  const a = window.__verifiedAuthContextState || {};
  return Object.freeze({ clubId: window.__store.clubId, uid: a.uid, generation: a.generation, sessionEpoch: a.sessionEpoch, authGeneration: a.authGeneration });
}
function ctxCurrent(c) {
  const a = window.__verifiedAuthContextState || {};
  return !!c && a.ready === true && c.clubId === window.__store.clubId && c.uid === a.uid
    && c.generation === a.generation && c.sessionEpoch === a.sessionEpoch && c.authGeneration === a.authGeneration;
}
function record(kind, data = {}) { effects.push({ kind, club: window.__store.clubId, ...data }); }
function elem(id, value = '') { const e = new El(id, value); elements.set(id, e); return e; }
function installDom() {
  elements = new Map(); trainingDays = [];
  const body = new El('body');
  global.document = {
    body,
    getElementById: id => elements.get(id) || null,
    querySelector: () => null,
    querySelectorAll: selector => selector === '.add_trainingDay' || selector === '.add_trainingDay:checked'
      ? (selector.endsWith(':checked') ? trainingDays.filter(x => x.checked) : trainingDays) : [],
    createElement: tag => new El('', ''),
    execCommand: () => true,
  };
  elem('addModal').style.display = 'none';
  for (const [id, value] of [
    ['add_date', '2026-11-03'], ['add_name', ''], ['add_memberId', 'M001'], ['add_belt', 'Trắng'],
    ['add_dob', '2010-01-01'], ['add_gender', 'Nam'], ['add_phone', '0900000000'], ['add_cccd', ''],
    ['add_notes', ''], ['add_nickname', ''], ['add_package', '1'], ['add_fee_default_display', '500000'],
    ['add_fee_default_actual', '500000'], ['add_fee_display', '0'], ['add_fee_actual', '0'], ['add_uniform_size', ''],
    ['add_uniform_display', '0'], ['add_uniform_actual', '0'], ['add_branch', 'CS1'], ['add_shift', ''],
    ['add_registration_warning', ''],
  ]) elem(id, value);
  elem('add_discount').checked = false;
  elem('add_uniform_gift').checked = false;
  elements.get('add_uniform_size').options = [new Option('--', ''), new Option('Size 160', '160'), new Option('Size 170', '170')];
  for (const day of [1, 3, 5]) { const e = new El(`day${day}`, String(day)); e.checked = false; trainingDays.push(e); }
}
function installSdk() {
  autoId = 0; refs.length = 0; batches.length = 0;
  const doc = (...args) => {
    let pathText;
    if (args.length === 1 && args[0]?.path) pathText = `${args[0].path}/auto${++autoId}`;
    else pathText = args.slice(1).join('/');
    const parts = pathText.split('/');
    const ref = { kind: 'doc', path: pathText, id: parts.at(-1), club: parts[0] === 'clubs' ? parts[1] : '' };
    refs.push(ref);
    return ref;
  };
  window._fb_init = {
    doc,
    collection: (_db, ...parts) => ({ kind: 'collection', path: parts.join('/'), club: parts[0] === 'clubs' ? parts[1] : '' }),
    increment: n => ({ __increment: n }),
    writeBatch: () => {
      const b = { sets: [], commitCalls: 0 };
      b.set = (ref, payload, options) => { b.sets.push({ ref, payload, options: options || null }); return b; };
      b.commit = async () => {
        b.commitCalls++;
        record('batchCommit', { refs: b.sets.map(x => x.ref.path) });
        if (currentScenario?.commitReject) throw new Error('batch failed');
        if (currentScenario?.commitAction) await currentScenario.commitAction();
      };
      batches.push(b);
      return b;
    },
  };
  // These admission/context cases require a valid stocked uniform fixture;
  // zero/insufficient stock and retries are covered by the stock-authority suite.
  installTransactionFixture(window._fb_init, ref => fixtureSnapshot(ref, {
    'Võ phục|||160_balance': 100, 'Võ phục|||170_balance': 100,
  }));
}
function monthsFrom(startMonth, count) {
  let [y, m] = startMonth.split('-').map(Number); const out = [];
  for (let i = 0; i < count; i++) { let mm = m + i, yy = y; while (mm > 12) { mm -= 12; yy++; } out.push(`${yy}-${String(mm).padStart(2, '0')}`); }
  return out;
}
function installWindow() {
  stores = { A: { profiles: {} }, B: { profiles: { StudentA: { sentinel: 'B-profile' } } } };
  global.window = {
    location: { hostname: 'prod' },
    userRole: 'admin',
    currentUserEmail: 'admin@test',
    __store: { db: { id: 'db' }, clubId: 'A', profiles: stores.A.profiles, clubConfig: { branchCount: 1 } },
    __verifiedAuthContextState: { ready: true, uid: 'u', generation: 1, sessionEpoch: 1, authGeneration: 1 },
    BranchIdentity: { normalize: (x, { fallback = '' } = {}) => /^CS\d+$/.test(String(x)) ? String(x) : fallback },
    _getClubShifts: () => [],
    _ensureClubShiftsLoaded: async () => { if (currentScenario?.prepareAction) await currentScenario.prepareAction(); },
    buildAdmissionTuitionPackage: (joinDate, packageCount) => {
      const startMonth = String(joinDate).slice(0, 7), months = monthsFrom(startMonth, Number(packageCount));
      return { packageCount: Number(packageCount), startMonth, months, lastMonth: months.at(-1), monthsStr: months.join(','), label: months.join(', ') };
    },
    buildPaymentBundleTransaction: ({ studentName, profileName, profileId, branch, date, refMonth, receiptType, components }) => ({
      branch, type: receiptType, description: studentName, studentName, profileName: profileName || studentName,
      profileId: profileId || studentName, amount: (components || []).reduce((n, c) => n + Number(c.amount || 0), 0),
      date, txMonth: refMonth, components: (components || []).map(c => ({ ...c })), timestamp: Date.now(),
    }),
    canonicalizeTransactionForWrite: data => ({ ...data }),
    resolveInventoryDebtIdentity: name => ({ profileId: name, studentName: name, memberId: elements.get('add_memberId')?.value || '' }),
    mergeInventoryIntoRuntimeStore: item => record('inventoryMerge', { id: item?.id }),
    notifyInventoryMutation: reason => record('inventoryNotify', { reason }),
    mergeTransactionIntoRuntimeStore: tx => record('financeMerge', { id: tx?.id }),
    updateActiveNewStudentCountBadge: () => record('badge'),
    resetActiveRenderLimit: () => record('renderLimit'),
    refreshListsComputation: () => record('studentsRefresh'),
    invalidateList: list => record('invalidate', { list }),
    invalidateStudents: () => record('invalidateStudents'),
    showToast: msg => record('toast', { msg: String(msg) }),
    recordRuntimeError: () => {},
    exportReceipt: async (...args) => { record('receipt', { student: args[0] }); if (currentScenario?.receiptAction) return await currentScenario.receiptAction(); return { ok: true }; },
    DebtProfileReadBoundary: {
      beginSyncOperation(meta) {
        if (currentScenario?.beginSyncThrow) throw new Error('sync unavailable');
        const id = `sync-${effects.length}`; record('syncBegin', { id, meta, originClub: window.__store.clubId }); return id;
      },
      markSyncStage(id, stage) { record('syncStage', { id, stage }); return true; },
      cancelSyncOperation(id) { record('syncCancel', { id }); return true; },
      isProfileAckOwnedOperation: () => currentScenario?.profileAckOwned === true,
    },
    AttendanceModule: { getShiftAuthority: () => ({ status: 'ready', clubId: window.__store.clubId, authGeneration: window.__verifiedAuthContextState.generation }) },
  };
  setCtx('A', 1);
}

installDom(); installWindow(); installSdk();
const studentsSource = fs.readFileSync(path.join(ROOT, 'js/modules/students.js'), 'utf8');
const financeSpec = studentsSource.match(/from "(\.\.\/services\/finance\.service\.js\?v=[^"]+)"/)?.[1];
const inventorySpec = studentsSource.match(/from "(\.\.\/services\/inventory\.service\.js\?v=[^"]+)"/)?.[1];
assert(financeSpec && inventorySpec);
const studentModule = await import(pathToFileURL(path.join(ROOT, 'js/modules/students.js')).href + `?r1_2c_harness=${Date.now()}`);
const financeModule = await import(new URL(financeSpec, pathToFileURL(path.join(ROOT, 'js/modules/students.js')).href).href);
const inventoryModule = await import(new URL(inventorySpec, pathToFileURL(path.join(ROOT, 'js/modules/students.js')).href).href);
const { FinanceService } = financeModule;
const { InventoryService } = inventoryModule;

// The production context API is the authority under test; only expose deterministic comparison if a very old baseline lacks it.
if (typeof FinanceService.captureFinancialWriteContext !== 'function') FinanceService.captureFinancialWriteContext = ctx;
if (typeof FinanceService.isFinancialWriteContextCurrent !== 'function') FinanceService.isFinancialWriteContextCurrent = ctxCurrent;

function resetScenario(opts = {}) {
  effects.length = 0; currentScenario = { ...opts, prepareCalls: 0 };
  installDom(); installWindow(); installSdk();
  studentModule.initStudents();
}
async function openAndFill({ fee = 0, pkg = 1, uniformFee = 0, uniformSize = '', gift = false, name = 'StudentA' } = {}) {
  window.openAddModal();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  elements.get('add_name').value = name;
  elements.get('add_date').value = '2026-11-03';
  elements.get('add_fee_actual').value = String(fee);
  elements.get('add_fee_display').value = String(fee);
  elements.get('add_fee_default_actual').value = '500000';
  elements.get('add_fee_default_display').value = '500000';
  elements.get('add_package').value = String(pkg);
  elements.get('add_uniform_size').value = uniformSize;
  elements.get('add_uniform_actual').value = String(uniformFee);
  elements.get('add_uniform_display').value = String(uniformFee);
  elements.get('add_uniform_gift').checked = gift;
  elements.get('add_branch').value = 'CS1';
  elements.get('add_shift').value = '';
}
async function runAdmission(opts = {}) {
  resetScenario(opts);
  await openAndFill(opts);
  const result = await window.addNewStudent();
  return {
    result,
    effects: effects.map(x => ({ ...x })),
    batches: batches.map(b => ({ commitCalls: b.commitCalls, sets: b.sets.map(x => ({ path: x.ref.path, club: x.ref.club })) })),
    bProfile: { ...(window.__store.clubId === 'B' ? window.__store.profiles.StudentA : stores.B.profiles.StudentA) },
    currentClub: window.__store.clubId,
    modal: elements.get('addModal').style.display,
    formName: elements.get('add_name').value,
  };
}
const hasBProjection = r => r.effects.some(x => x.club === 'B' && ['inventoryMerge','inventoryNotify','financeMerge','studentsRefresh','invalidate','invalidateStudents','badge','renderLimit','receipt'].includes(x.kind));
const sensitiveBToast = r => r.effects.some(x => x.kind === 'toast' && x.club === 'B' && /(StudentA|auto\d+|M001|500000|CS1)/.test(x.msg));

// Runtime owner/reachability proof.
const main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
check('A_CANONICAL_OWNER_STUDENTS_MODULE', studentsSource.includes('window.addNewStudent = async') && main.includes('initStudents'));
check('A_ONE_ATOMIC_ADMISSION_SOURCE', (studentsSource.match(/await batch\.commit\(\)/g) || []).length >= 1 && studentsSource.includes('InventoryService.createStockMutationBatch') && studentsSource.includes(': writeBatch(_db())'));

// Core A->B post-ACK race.
let r = await runAdmission({ fee: 500000, pkg: 3, uniformFee: 300000, uniformSize: '160', commitAction: async () => { setCtx('B', 2); } });
const coreContaminated = hasBProjection(r) || r.effects.some(x => x.kind === 'toast' && x.club === 'B' && /StudentA/.test(x.msg));
if (EXPECT === 'red') {
  check('C0_RED_ADMISSION_POST_ACK_REPRODUCED', coreContaminated, JSON.stringify(r.effects));
  check('C0_PRIMARY_REFS_STAY_A', r.batches.length === 1 && r.batches[0].sets.every(x => x.club === 'A'), JSON.stringify(r.batches));
  check('C0_ONE_PRIMARY_BATCH', r.batches.length === 1 && r.batches[0].commitCalls === 1);
  console.log(`\nR1.2C RED PROOF: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exitCode = 1;
  process.exit();
}

check('B_CONTEXT_CAPTURE_PRESENT', studentsSource.includes('captureFinancialWriteContext()') && studentsSource.includes('isFinancialWriteContextCurrent(admissionContext)'));
check('E_PRIMARY_REFS_STAY_A', r.batches.length === 1 && r.batches[0].sets.every(x => x.club === 'A'), JSON.stringify(r.batches));
check('E_ONE_PRIMARY_BATCH', r.batches.length === 1 && r.batches[0].commitCalls === 1);
check('F_PROFILE_B_UNCHANGED_SAME_ID', r.bProfile?.sentinel === 'B-profile', JSON.stringify(r.bProfile));
check('G_INVENTORY_B_ZERO', !r.effects.some(x => x.club === 'B' && ['inventoryMerge','inventoryNotify'].includes(x.kind)), JSON.stringify(r.effects));
check('H_FINANCE_B_ZERO', !r.effects.some(x => x.club === 'B' && x.kind === 'financeMerge'));
check('I_DEBT_STUDENTS_B_ZERO', !r.effects.some(x => x.club === 'B' && ['studentsRefresh','invalidate','invalidateStudents'].includes(x.kind)));
check('N_STALE_CONTEXT_RECEIPT_ZERO', !r.effects.some(x => x.club === 'B' && x.kind === 'receipt'));
check('N_STALE_CONTEXT_NO_SENSITIVE_TOAST', !sensitiveBToast(r));
check('I_PRIMARY_ACK_MARKED_BEFORE_STALE_EXIT', r.effects.some(x => x.kind === 'syncStage' && x.stage === 'primaryWriteAckAt'));
check('I_COMMITTED_SYNC_NOT_CANCELLED', !r.effects.some(x => x.kind === 'syncCancel'));

// Same-context normal variants and package coverage.
for (const pkg of [1, 3, 6, 12]) {
  r = await runAdmission({ fee: 500000 * pkg, pkg });
  check(`R_TUITION_${pkg}M_ONE_BATCH`, r.batches.length === 1 && r.batches[0].commitCalls === 1 && r.currentClub === 'A');
  check(`R_TUITION_${pkg}M_REFS_A`, r.batches[0]?.sets.every(x => x.club === 'A'));
  check(`J_TUITION_${pkg}M_A_PROJECTION`, r.effects.some(x => x.kind === 'financeMerge' && x.club === 'A') && r.effects.some(x => x.kind === 'receipt' && x.club === 'A'));
}
r = await runAdmission({ fee: 0, pkg: 1 });
check('R_PROFILE_ONLY_ONE_BATCH', r.batches[0]?.sets.length === 1 && !r.effects.some(x => x.kind === 'financeMerge'));
r = await runAdmission({ fee: 0, pkg: 1, uniformFee: 300000, uniformSize: '160' });
check('R_PAID_UNIFORM_ATOMIC', r.batches[0]?.sets.length >= 3 && r.effects.some(x => x.kind === 'inventoryMerge') && r.effects.some(x => x.kind === 'financeMerge'));
r = await runAdmission({ fee: 0, pkg: 1, uniformFee: 0, uniformSize: '160', gift: true });
check('R_GIFT_UNIFORM_ATOMIC', r.batches[0]?.sets.length >= 3 && r.effects.some(x => x.kind === 'inventoryMerge') && r.effects.some(x => x.kind === 'financeMerge'));
r = await runAdmission({ fee: 500000, pkg: 1, uniformFee: 300000, uniformSize: '160' });
check('R_TUITION_UNIFORM_ONE_ATOMIC_BATCH', r.batches.length === 1 && r.batches[0].commitCalls === 1 && r.batches[0].sets.length >= 4);

// Prepare-time stale: change during the forced shift refresh used by save.
r = await runAdmission({ fee: 500000, pkg: 1, prepareAction: async () => {
  currentScenario.prepareCalls++;
  // first call belongs to openAddModal readiness, second belongs to _prepareRegistrationSave
  if (currentScenario.prepareCalls >= 2) setCtx('B', 2);
} });
check('C_PREPARE_STALE_ZERO_COMMIT', !r.batches.some(b => b.commitCalls > 0), JSON.stringify(r.effects));

// Final pre-commit stale: mutate context synchronously after profile plan creation.
{
  const original = window.StudentService?.prepareProfileMutation;
  resetScenario({ fee: 500000, pkg: 1 });
  await openAndFill({ fee: 500000, pkg: 1 });
  const svc = window.StudentService;
  const saved = svc.prepareProfileMutation;
  svc.prepareProfileMutation = function (...args) { const v = saved.apply(this, args); setCtx('B', 2); return v; };
  await window.addNewStudent();
  r = { effects: effects.map(x => ({ ...x })), batches: batches.map(b => ({ commitCalls: b.commitCalls, sets: b.sets.map(x => ({ path: x.ref.path, club: x.ref.club })) })) };
  svc.prepareProfileMutation = saved;
  check('D_PRECOMMIT_STALE_ZERO_COMMIT', !r.batches.some(b => b.commitCalls > 0), JSON.stringify(r));
}

// Same club but new auth generation, and A->B->A, remain stale.
r = await runAdmission({ fee: 500000, pkg: 1, commitAction: async () => { setCtx('A', 2); } });
check('K_SAME_CLUB_NEW_AUTH_STALE', !r.effects.some(x => ['financeMerge','studentsRefresh','receipt'].includes(x.kind)) && !sensitiveBToast(r));
r = await runAdmission({ fee: 500000, pkg: 1, commitAction: async () => { setCtx('B', 2); await Promise.resolve(); setCtx('A', 3); } });
check('L_A_B_A_OLD_OPERATION_STALE', !r.effects.some(x => ['financeMerge','studentsRefresh','receipt'].includes(x.kind)));

// Logout/auth loss before primary invocation must fail closed with zero commit.
{
  resetScenario({ fee: 500000, pkg: 1 });
  await openAndFill({ fee: 500000, pkg: 1 });
  const svc = window.StudentService;
  const saved = svc.prepareProfileMutation;
  svc.prepareProfileMutation = function (...args) { const v = saved.apply(this, args); setCtx('A', 2, false, 'u'); return v; };
  await window.addNewStudent();
  r = { effects: effects.map(x => ({ ...x })), batches: batches.map(b => ({ commitCalls: b.commitCalls, sets: b.sets.map(x => ({ path: x.ref.path, club: x.ref.club })) })) };
  svc.prepareProfileMutation = saved;
  check('K_LOGOUT_BEFORE_PRIMARY_ZERO_COMMIT', !r.batches.some(b => b.commitCalls > 0));
}

// Logout/auth loss after ACK preserves primary success and suppresses context-sensitive tail.
r = await runAdmission({ fee: 500000, pkg: 1, commitAction: async () => { setCtx('A', 2, false, 'u'); } });
check('K_LOGOUT_AFTER_ACK_PRIMARY_SUCCESS', r.batches.length === 1 && r.batches[0].commitCalls === 1);
check('K_LOGOUT_AFTER_ACK_ZERO_LOCAL_TAIL', !r.effects.some(x => ['financeMerge','inventoryMerge','studentsRefresh','receipt'].includes(x.kind)));
check('K_LOGOUT_AFTER_ACK_NO_SENSITIVE_TOAST', !r.effects.some(x => x.kind === 'toast' && /(StudentA|auto\d+|M001|500000|CS1)/.test(x.msg)));

// Same-context new form instance must survive old tail.
r = await runAdmission({ fee: 500000, pkg: 1, commitAction: async () => {
  window.openAddModal(); for (let i = 0; i < 6; i++) await Promise.resolve(); elements.get('add_name').value = 'New Draft';
} });
check('M_REOPENED_MODAL_REMAINS_OPEN', r.modal === 'flex', JSON.stringify({ modal: r.modal, name: r.formName }));
check('M_REOPENED_FORM_VALUE_UNCHANGED', r.formName === 'New Draft');
check('M_DOMAIN_PROJECTION_NOT_OVERSUPPRESSED', r.effects.some(x => x.kind === 'financeMerge' && x.club === 'A'));

// Receipt switches context while awaiting: no sensitive B failure toast.
r = await runAdmission({ fee: 500000, pkg: 1, receiptAction: async () => { setCtx('B', 2); throw new Error('receipt stale'); } });
check('N_RECEIPT_SWITCH_NO_SENSITIVE_B_TOAST', !sensitiveBToast(r), JSON.stringify(r.effects.filter(x => x.kind === 'toast')));
check('N_RECEIPT_FAILURE_NO_PRIMARY_RETRY', r.batches.length === 1 && r.batches[0].commitCalls === 1);

// Sync operation unavailable: fallback same-context works, stale context never refreshes B.
r = await runAdmission({ fee: 0, beginSyncThrow: true });
check('I_SYNC_ABSENT_SAME_CONTEXT_FALLBACK', r.effects.some(x => x.kind === 'studentsRefresh' && x.club === 'A'));
r = await runAdmission({ fee: 0, beginSyncThrow: true, commitAction: async () => { setCtx('B', 2); } });
check('I_SYNC_ABSENT_STALE_ZERO_B_FALLBACK', !r.effects.some(x => x.club === 'B' && ['studentsRefresh','invalidate','invalidateStudents'].includes(x.kind)));

// Real primary failure remains failure and may cancel only uncommitted sync.
r = await runAdmission({ fee: 500000, commitReject: true });
check('O_REAL_BATCH_FAILURE_NO_PROJECTION', !r.effects.some(x => ['financeMerge','inventoryMerge','receipt'].includes(x.kind)));
check('O_REAL_BATCH_FAILURE_CANCELS_UNCOMMITTED_SYNC', r.effects.some(x => x.kind === 'syncCancel'));

// Double tap: second invocation cannot start another batch while first is in flight.
{
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  resetScenario({ fee: 500000, commitAction: async () => { await hold; } });
  await openAndFill({ fee: 500000, pkg: 1 });
  const first = window.addNewStudent();
  await Promise.resolve(); await Promise.resolve();
  const second = window.addNewStudent();
  await Promise.resolve();
  release();
  await Promise.all([first, second]);
  check('Q_DOUBLE_TAP_ONE_BATCH', batches.length === 1 && batches[0].commitCalls === 1, JSON.stringify(batches.map(b => b.commitCalls)));
}

// Source invariants: final check -> begin sync -> commit invocation has no await/timer/yield in between.
const finalGuard = studentsSource.indexOf('// Final no-yield authority check');
const beginSync = studentsSource.indexOf('beginSyncOperation?.({', finalGuard);
const commit = studentsSource.indexOf('await batch.commit();', beginSync);
const noYieldWindow = studentsSource.slice(finalGuard, commit);
check('C2_FINAL_GUARD_BEFORE_COMMIT', finalGuard >= 0 && beginSync > finalGuard && commit > beginSync);
check('C2_NO_AWAIT_TIMER_PROMISE_BEFORE_COMMIT_INVOCATION', !/\bawait\b|setTimeout|setInterval|Promise\./.test(noYieldWindow));
check('S_NO_SECOND_WRITER_SYMBOL', !/(AdmissionWriterV2|AdmissionContextStore|AdmissionAuthorityV2|AdmissionSessionManager)/.test(studentsSource));

console.log(`\nR1.2C BEHAVIOR: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;

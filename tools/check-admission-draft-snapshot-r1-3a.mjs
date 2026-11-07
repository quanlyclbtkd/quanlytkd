import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const EXPECT = process.env.R13A_EXPECT || 'green';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const baseHarnessPath = path.join(ROOT, 'tools/r1_2c/admission-postcommit-context-behavior.mjs');
let harness = fs.readFileSync(baseHarnessPath, 'utf8');
const marker = 'console.log(`\\nR1.2C BEHAVIOR: ${pass} PASS / ${fail} FAIL`);';
check('R1.2C behavioral harness available', harness.includes(marker));

// Preserve the full R1.2C matrix but expose payloads for coherent-draft assertions.
harness = harness.replace(
  "sets: b.sets.map(x => ({ path: x.ref.path, club: x.ref.club }))",
  "sets: b.sets.map(x => ({ path: x.ref.path, club: x.ref.club, payload: x.payload }))"
);

const scenario = String.raw`
const R13A_EXPECT = process.env.R13A_EXPECT || 'green';
const secondPrepare = mutate => async () => {
  currentScenario.prepareCalls++;
  if (currentScenario.prepareCalls >= 2) mutate();
};
const committed = result => result.batches.some(b => b.commitCalls > 0);
const noStaleExternalTail = result => !result.effects.some(x => ['syncBegin','receipt'].includes(x.kind));
const runPrepareEdit = async (name, mutate) => {
  const rr = await runAdmission({ fee: 500000, pkg: 1, prepareAction: secondPrepare(mutate) });
  check(name + '_ZERO_COMMIT', !committed(rr), JSON.stringify({batches:rr.batches,effects:rr.effects}));
  check(name + '_NO_DEBT_OR_RECEIPT', noStaleExternalTail(rr));
  check(name + '_FORM_REMAINS_OPEN', rr.modal === 'flex');
  return rr;
};

if (R13A_EXPECT === 'red') {
  r = await runAdmission({ fee: 500000, pkg: 1, prepareAction: secondPrepare(() => {
    elements.get('add_phone').value = 'B_PHONE';
    elements.get('add_notes').value = 'B_NOTES';
    elements.get('add_fee_default_actual').value = '650000';
    elements.get('add_fee_default_display').value = '650000';
  }) });
  const redBatch = r.batches[0];
  const profileSet = redBatch?.sets?.find(x => /\/profiles\//.test(x.path));
  const txSet = redBatch?.sets?.find(x => /\/transactions\//.test(x.path));
  check('RED_PREPARE_WINDOW_OLD_CLICK_STILL_COMMITS', redBatch?.commitCalls === 1, JSON.stringify({batches:r.batches,effects:r.effects}));
  check('RED_PROFILE_OBSERVES_DRAFT_B', profileSet?.payload?.phone === 'B_PHONE' && profileSet?.payload?.notes === 'B_NOTES' && String(profileSet?.payload?.tuitionFee) === '650000', JSON.stringify(profileSet?.payload));
  check('RED_FINANCE_OBSERVES_DRAFT_A', Number(txSet?.payload?.amount) === 500000, JSON.stringify(txSet?.payload));
} else {
  // P01 unchanged draft.
  r = await runAdmission({ fee: 500000, pkg: 1 });
  check('P01_UNCHANGED_ONE_COMMIT', r.batches.length === 1 && r.batches[0].commitCalls === 1);

  // P02-P12 prepare-window semantic mutations.
  await runPrepareEdit('P02_PHONE', () => { elements.get('add_phone').value = '0999999999'; });
  await runPrepareEdit('P03_NOTES', () => { elements.get('add_notes').value = 'changed'; });
  await runPrepareEdit('P04_DOB', () => { elements.get('add_dob').value = '2011-02-02'; });
  await runPrepareEdit('P05_BRANCH', () => { elements.get('add_branch').value = 'CS2'; });
  await runPrepareEdit('P06_PACKAGE', () => { elements.get('add_package').value = '3'; });
  await runPrepareEdit('P07_FEE_DISCOUNT', () => {
    elements.get('add_fee_actual').value = '450000';
    elements.get('add_fee_display').value = '450000';
    elements.get('add_discount').checked = true;
  });
  await runPrepareEdit('P08_UNIFORM', () => {
    elements.get('add_uniform_size').value = '160';
    elements.get('add_uniform_actual').value = '300000';
    elements.get('add_uniform_display').value = '300000';
  });
  await runPrepareEdit('P09_GIFT', () => { elements.get('add_uniform_gift').checked = true; });
  await runPrepareEdit('P10_SHIFT', () => { elements.get('add_shift').value = 'SHIFT_B'; });
  await runPrepareEdit('P11_TRAINING_DAYS', () => { trainingDays[0].checked = true; });
  await runPrepareEdit('P12_MULTI_CATEGORY', () => {
    elements.get('add_phone').value = '0888888888';
    elements.get('add_notes').value = 'multi';
    elements.get('add_package').value = '6';
  });

  // Form-instance changes during prepare must deny the old click even when values are restored.
  r = await runAdmission({ fee: 500000, pkg: 1, prepareAction: secondPrepare(() => {
    const original = {
      name: elements.get('add_name').value,
      date: elements.get('add_date').value,
      fee: elements.get('add_fee_actual').value,
      feeDisplay: elements.get('add_fee_display').value,
      defaultFee: elements.get('add_fee_default_actual').value,
      defaultFeeDisplay: elements.get('add_fee_default_display').value,
      pkg: elements.get('add_package').value,
    };
    window.openAddModal();
    elements.get('add_name').value = original.name;
    elements.get('add_date').value = original.date;
    elements.get('add_fee_actual').value = original.fee;
    elements.get('add_fee_display').value = original.feeDisplay;
    elements.get('add_fee_default_actual').value = original.defaultFee;
    elements.get('add_fee_default_display').value = original.defaultFeeDisplay;
    elements.get('add_package').value = original.pkg;
  }) });
  check('F02_F03_NEW_FORM_INSTANCE_ZERO_COMMIT', !committed(r), JSON.stringify({batches:r.batches,effects:r.effects}));

  // Semantic equality: superficial UI formatting or a reverted edit must not false-abort.
  r = await runAdmission({ fee: 500000, pkg: 1, prepareAction: secondPrepare(() => { elements.get('add_notes').value = '   '; }) });
  check('S01_WHITESPACE_NORMALIZATION_NO_FALSE_ABORT', committed(r));
  r = await runAdmission({ fee: 500000, pkg: 1, prepareAction: secondPrepare(() => {
    const a = elements.get('add_phone').value;
    elements.get('add_phone').value = 'B_TEMP';
    elements.get('add_phone').value = a;
  }) });
  check('S02_CHANGE_REVERT_NO_FALSE_ABORT', committed(r));
  r = await runAdmission({ fee: 500000, pkg: 1, prepareAction: secondPrepare(() => { elements.get('add_fee_display').value = '500.000'; }) });
  check('S03_EQUIVALENT_AMOUNT_DISPLAY_NO_FALSE_ABORT', committed(r));

  // Internal/non-semantic UI changes must not become draft authority.
  r = await runAdmission({ fee: 500000, pkg: 1, prepareAction: secondPrepare(() => {
    elements.get('add_shift').options = [new Option('-- refreshed --', '')];
    elements.get('add_registration_warning').textContent = 'checking';
    elements.get('add_name').style.borderColor = '#999';
  }) });
  check('I01_I02_INTERNAL_UI_UPDATE_NO_FALSE_ABORT', committed(r));

  // Post-commit rules remain R1.3/R1.2C: A stays success, later Draft B survives.
  r = await runAdmission({ fee: 500000, pkg: 1, commitAction: async () => {
    elements.get('add_name').value = 'Draft B';
    elements.get('add_phone').value = '0999999999';
    elements.get('add_notes').value = 'post commit draft';
  } });
  check('C01_EDIT_DURING_COMMIT_ONE_A_COMMIT', r.batches.length === 1 && r.batches[0].commitCalls === 1);
  check('C01_EDIT_DURING_COMMIT_DOMAIN_TAIL_CONTINUES', r.effects.some(x => x.kind === 'financeMerge' && x.club === 'A'));
  check('C01_EDIT_DURING_COMMIT_DRAFT_PRESERVED', r.modal === 'flex' && r.formName === 'Draft B');
  r = await runAdmission({ fee: 500000, pkg: 1, commitAction: async () => {
    window.openAddModal();
    elements.get('add_name').value = 'New Draft C';
    elements.get('add_phone').value = '0777777777';
  } });
  check('C02_REOPEN_DURING_COMMIT_ONE_A_COMMIT', r.batches.length === 1 && r.batches[0].commitCalls === 1);
  check('C02_REOPEN_DURING_COMMIT_NEW_FORM_PRESERVED', r.modal === 'flex' && r.formName === 'New Draft C');
  r = await runAdmission({ fee: 500000, pkg: 1 });
  check('C03_NO_EDIT_NORMAL_CLOSE', r.modal === 'none');

  // Coherent payload proof across profile/finance/inventory/training for one unchanged Draft A.
  resetScenario({ fee: 500000, pkg: 1, uniformFee: 300000, uniformSize: '160' });
  await openAndFill({ fee: 500000, pkg: 1, uniformFee: 300000, uniformSize: '160', name: 'DraftA' });
  elements.get('add_phone').value = 'A_PHONE';
  elements.get('add_notes').value = 'A_NOTES';
  elements.get('add_memberId').value = 'AID';
  trainingDays[0].checked = true;
  await window.addNewStudent();
  const coherentBatch = batches[0];
  const profileSet = coherentBatch?.sets?.find(x => /\/profiles\//.test(x.ref.path));
  const txSet = coherentBatch?.sets?.find(x => /\/transactions\//.test(x.ref.path));
  const invSet = coherentBatch?.sets?.find(x => /\/inventory\//.test(x.ref.path));
  check('PAYLOAD_ONE_BATCH', coherentBatch?.commitCalls === 1);
  check('PAYLOAD_PROFILE_IS_DRAFT_A', profileSet?.payload?.phone === 'A_PHONE' && profileSet?.payload?.notes === 'A_NOTES' && profileSet?.payload?.memberId === 'AID' && Array.isArray(profileSet?.payload?.trainingDays) && profileSet.payload.trainingDays.includes(1), JSON.stringify(profileSet?.payload));
  check('PAYLOAD_FINANCE_IS_DRAFT_A', txSet?.payload?.studentName === 'DraftA' && Number(txSet?.payload?.amount) === 800000, JSON.stringify(txSet?.payload));
  check('PAYLOAD_INVENTORY_IS_DRAFT_A', invSet?.payload?.studentName === 'DraftA' || invSet?.payload?.desc === 'DraftA', JSON.stringify(invSet?.payload));

  // A stale abort must release the existing submit lock so an explicit new Save can proceed.
  r = await runAdmission({ fee: 500000, pkg: 1, prepareAction: secondPrepare(() => { elements.get('add_phone').value = 'changed'; }) });
  check('STALE_ABORT_ZERO_DEBT_OPERATION', !r.effects.some(x => x.kind === 'syncBegin'));
  check('STALE_ABORT_ZERO_RECEIPT', !r.effects.some(x => x.kind === 'receipt'));
  r = await runAdmission({ fee: 500000, pkg: 1 });
  check('STALE_ABORT_RELEASES_SUBMIT_LOCK', r.batches.length === 1 && r.batches[0].commitCalls === 1);
}
`;

if (!harness.includes(marker)) throw new Error('R1.2C marker unavailable');
const tmp = path.join(os.tmpdir(), `admission-draft-snapshot-r1-3a-${process.pid}.mjs`);
try {
  fs.writeFileSync(tmp, harness.replace(marker, scenario + '\n' + marker));
  const run = spawnSync(process.execPath, [tmp], {
    cwd: ROOT,
    env: { ...process.env, ROOT, EXPECT: 'green', R13A_EXPECT: EXPECT },
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  });
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  check(`Behavioral R1.3A ${EXPECT} matrix`, run.status === 0, `rc=${run.status}`);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}

if (EXPECT === 'red') {
  console.log(`\nR1.3A BASELINE RED GATE: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exitCode = 1;
} else {

const students = fs.readFileSync(path.join(ROOT, 'js/modules/students.js'), 'utf8');
const publicStudents = fs.readFileSync(path.join(ROOT, 'public/js/modules/students.js'), 'utf8');
const addStart = students.indexOf('window.addNewStudent = async');
const addEnd = students.indexOf('// ════════════════════════════════════════════════════════════════\n    // XEM / SỬA HỒ SƠ', addStart);
const addBody = students.slice(addStart, addEnd);
const helperStart = students.indexOf('function _captureAdmissionSemanticDraft()');
const helperEnd = students.indexOf('// ════════════════════════════════════════════════════════════════\n// MODULE-LEVEL STATE', helperStart);
const helperBody = students.slice(helperStart, helperEnd);

check('Root/public students parity', students === publicStudents);
check('Structured semantic draft helper exists', helperStart >= 0 && students.includes('function _admissionDraftFingerprint(draft = _captureAdmissionSemanticDraft())'));
for (const field of ['add_name','add_nickname','add_date','add_memberId','add_belt','add_dob','add_gender','add_phone','add_cccd','add_notes','add_branch','add_package','add_fee_default_actual','add_discount','add_discount_pct','add_fee_actual','add_uniform_size','add_uniform_actual','add_uniform_gift','add_shift','add_trainingDay']) {
  check(`Semantic draft covers ${field}`, helperBody.includes(field));
}
check('Semantic draft helper is local/pure', !/getDoc\(|getDocs\(|onSnapshot\(|writeBatch\(|prepareProfileMutation|prepareTransactionMutation|prepareAddItemMutation|beginSyncOperation|exportReceipt/.test(helperBody));
check('Original draft captured once before async prepare', (addBody.match(/const admissionOriginalDraft = _captureAdmissionSemanticDraft\(\);/g)||[]).length === 1 && (addBody.match(/const admissionDraftFingerprint = _admissionDraftFingerprint\(admissionOriginalDraft\);/g)||[]).length === 1);
const prepareAt = addBody.indexOf("await _prepareRegistrationSave('add')");
const profilePlanAt = addBody.indexOf('const profilePlan = StudentService.prepareProfileMutation');
const firstDraftGuardAt = addBody.indexOf("_registrationForms.get('add') !== admissionFormInstance", prepareAt);
check('Draft guard is after prepare and before plans', prepareAt >= 0 && firstDraftGuardAt > prepareAt && profilePlanAt > firstDraftGuardAt);
const finalGuardCommentAt = addBody.indexOf('// Final no-yield authority check');
const syncAt = addBody.indexOf('syncOperationId = window.DebtProfileReadBoundary?.beginSyncOperation?.', finalGuardCommentAt);
const finalDraftGuardAt = addBody.indexOf("_registrationForms.get('add') !== admissionFormInstance", finalGuardCommentAt);
const commitAt = addBody.indexOf('await batch.commit()', finalGuardCommentAt);
check('Final form/draft guard precedes Debt sync', finalDraftGuardAt > finalGuardCommentAt && syncAt > finalDraftGuardAt);
const finalWindow = addBody.slice(finalDraftGuardAt, commitAt);
check('No async yield between final draft guard and batch commit invocation', !/\bawait\b|setTimeout\s*\(|requestAnimationFrame\s*\(|Promise\.(?:resolve|all|race|any)\s*\(/.test(finalWindow));
check('Debt sync starts after draft authorization', syncAt > finalDraftGuardAt);
check('Existing one-batch writer preserved', (addBody.match(/const batch = writeBatch\(_db\(\)\)/g)||[]).length === 1 && (addBody.match(/await batch\.commit\(\)/g)||[]).length === 1);
check('No Admission Firestore read/listener added', !/getDoc\(|getDocs\(|onSnapshot\(/.test(addBody));
check('Existing submit mutex preserved', addBody.includes('if (_addStudentInProgress) return;') && addBody.includes('_addStudentInProgress = true;') && addBody.includes('_addStudentInProgress = false;'));
check('Post-ACK draft continuity preserved', addBody.includes("_registrationForms.get('add') === admissionFormInstance && sameAdmissionDraft"));
check('Stale draft uses local generic warning', students.includes('Dữ liệu đã thay đổi trong lúc xác minh. Vui lòng kiểm tra lại và bấm Lưu.'));

console.log(`\nR1.3A ADMISSION DRAFT SNAPSHOT GATE: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;
}

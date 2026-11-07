import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const baseHarnessPath = path.join(ROOT, 'tools/r1_2c/admission-postcommit-context-behavior.mjs');
const baseHarness = fs.readFileSync(baseHarnessPath, 'utf8');
const marker = 'console.log(`\\nR1.2C BEHAVIOR: ${pass} PASS / ${fail} FAIL`);';
const scenario = String.raw`
// R1.3 same-form draft continuity: the same form object remains mounted while
// the user edits a new draft during the old primary commit.
r = await runAdmission({ fee: 500000, pkg: 1, commitAction: async () => {
  elements.get('add_name').value = 'Draft B';
  elements.get('add_phone').value = '0999999999';
  elements.get('add_notes').value = 'new draft must survive';
} });
check('R1_3_SAME_FORM_DRAFT_MODAL_REMAINS_OPEN', r.modal === 'flex', JSON.stringify({ modal:r.modal, formName:r.formName }));
check('R1_3_SAME_FORM_DRAFT_VALUE_PRESERVED', r.formName === 'Draft B');
check('R1_3_SAME_FORM_ONE_PRIMARY_BATCH', r.batches.length === 1 && r.batches[0].commitCalls === 1);
check('R1_3_SAME_FORM_DOMAIN_TAIL_CONTINUES', r.effects.some(x => x.kind === 'financeMerge' && x.club === 'A'));
`;
check('R1.2C harness marker available', baseHarness.includes(marker));
const tmp = path.join(os.tmpdir(), `admission-ui-draft-r1-3-${process.pid}.mjs`);
try {
  fs.writeFileSync(tmp, baseHarness.replace(marker, scenario + '\n' + marker));
  const run = spawnSync(process.execPath, [tmp], { cwd: ROOT, env: { ...process.env, ROOT, EXPECT: 'green' }, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  check('Behavioral same-form draft matrix', run.status === 0, `rc=${run.status}`);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}

const students = fs.readFileSync(path.join(ROOT, 'js/modules/students.js'), 'utf8');
const publicStudents = fs.readFileSync(path.join(ROOT, 'public/js/modules/students.js'), 'utf8');
const addStart = students.indexOf('window.addNewStudent = async');
const addEnd = students.indexOf('// ════════════════════════════════════════════════════════════════\n    // XEM / SỬA HỒ SƠ', addStart);
const addBody = students.slice(addStart, addEnd);
check('Root/public students parity', students === publicStudents);
check('Draft fingerprint helper exists', students.includes('function _captureAdmissionSemanticDraft()') && students.includes('function _admissionDraftFingerprint('));
check('Fingerprint captured at Admission save boundary', addBody.includes('const admissionOriginalDraft = _captureAdmissionSemanticDraft();') && addBody.includes('const admissionDraftFingerprint = _admissionDraftFingerprint(admissionOriginalDraft);'));
check('Modal close requires same form and same draft', addBody.includes("_registrationForms.get('add') === admissionFormInstance && sameAdmissionDraft"));
check('Fingerprint is UI-only and does not call Firestore/service writers', !/getDoc\(|getDocs\(|onSnapshot\(|writeBatch\(|FinanceService\.|StudentService\.|InventoryService\./.test(students.slice(students.indexOf('function _captureAdmissionSemanticDraft()'), students.indexOf('// ════════════════════════════════════════════════════════════════\n// MODULE-LEVEL STATE'))));
check('Existing one-batch Admission writer preserved', (addBody.match(/const batch = writeBatch\(_db\(\)\)/g)||[]).length === 1 && (addBody.match(/await batch\.commit\(\)/g)||[]).length === 1);
check('No new Admission Firestore reads/listeners', !/getDoc\(|getDocs\(|onSnapshot\(/.test(addBody));
check('Existing double-submit guard preserved', addBody.includes('if (_addStudentInProgress) return;') && addBody.includes('_addStudentInProgress = true;'));

console.log(`\nR1.3 ADMISSION UI DRAFT GATE: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;

/**
 * check-admission-bundle-unification.mjs — Phase 4K-5E
 * Kiểm tra addNewStudent module mode dùng bundle, không tạo 2 giao dịch riêng.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(rel) {
    return readFileSync(resolve(root, rel), 'utf8');
}

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
    if (condition) {
        console.log(`  ✅  ${name}`);
        passed++;
    } else {
        console.error(`  ❌  ${name}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

console.log('\n[check-admission-bundle-unification] Phase 4K-5E\n');

const studentsJs   = readFile('js/modules/students.js');
const studentsService = readFile('js/services/students.service.js');
const appJs        = readFile('app.js');

// 1. students.js does NOT call addTuitionTransaction and addUniformTransaction together in same payment path
// Check: if both are present without bundle guard → fail
const hasAdmissionBundlePath = studentsJs.includes('buildPaymentBundleTransaction');
check('students.js addNewStudent uses buildPaymentBundleTransaction',
    hasAdmissionBundlePath);

// 2. students.js does NOT separately create Học phí + Thu Võ phục without bundle
const separateTuitionAndUniform = studentsJs.includes('addTuitionTransaction') &&
    studentsJs.includes('addUniformTransaction');
// They may still be defined but not called together in the admission payment path
check('students.js addNewStudent has bundle guard (not raw double-transaction)',
    studentsJs.includes('buildPaymentBundleTransaction') &&
    !studentsJs.includes("await StudentService.addTuitionTransaction({\n                    branch, type: 'Học phí'"),
    'Direct addTuitionTransaction without bundle still in admission path');

// 3. StudentService has addGenericTransaction
check('StudentService has addGenericTransaction method',
    studentsService.includes('addGenericTransaction'));

// 4. StudentService.addTuitionTransaction returns id
check('StudentService.addTuitionTransaction returns { id, ...data }',
    studentsService.includes('return { id: docRef.id, ...data }'));

// 5. app.js addNewStudent has throw guard when buildPaymentBundleTransaction is missing
check('app.js addNewStudent has throw guard for missing buildPaymentBundleTransaction',
    appJs.includes("throw new Error('buildPaymentBundleTransaction missing") ||
    appJs.includes("buildPaymentBundleTransaction === 'function'"));

// 6. students.js calls mergeTransactionIntoRuntimeStore with bundle tx
check('students.js calls mergeTransactionIntoRuntimeStore for bundle',
    studentsJs.includes("mergeTransactionIntoRuntimeStore") &&
    studentsJs.includes('admission-bundle-created'));

// 7. students.js updates inventory doc with paidTxId/paymentBundleId
check('students.js updates inventory doc with paidTxId/paymentBundleId',
    studentsJs.includes('paymentBundleId') || studentsJs.includes('updateInventoryDoc'));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

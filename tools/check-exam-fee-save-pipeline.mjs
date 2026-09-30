#!/usr/bin/env node
/**
 * check-exam-fee-save-pipeline.mjs
 * Phase 4K-5D: Verify exam fee save pipeline correctness
 */
import { readFileSync } from 'fs';

let failures = 0;
function fail(msg) { console.error('  FAIL:', msg); failures++; }
function pass(msg) { console.log('  PASS:', msg); }

function findFunctionDef(src, funcExpr) {
    // Find the function definition (assignment), not just any mention
    const idx = src.indexOf(funcExpr + ' = function');
    if (idx !== -1) return idx;
    const idx2 = src.indexOf(funcExpr + ' = async function');
    if (idx2 !== -1) return idx2;
    return src.indexOf(funcExpr);
}

const appJs   = readFileSync('app.js',         'utf8');
const mainJs  = readFileSync('js/main.js',     'utf8');

console.log('\n=== check-exam-fee-save-pipeline ===\n');

// 1. quickCollectExam must use getClubExamFee FIRST (not exam_fee_all_actual first)
const qcIdx = findFunctionDef(appJs, 'window.quickCollectExam');
if (qcIdx === -1) {
    fail('quickCollectExam not found in app.js');
} else {
    const qcBlock = appJs.slice(qcIdx, qcIdx + 800);
    const gceIdx    = qcBlock.indexOf('getClubExamFee');
    const hiddenIdx = qcBlock.indexOf("exam_fee_all_actual");
    if (gceIdx === -1) {
        fail('quickCollectExam does not reference getClubExamFee');
    } else if (hiddenIdx !== -1 && hiddenIdx < gceIdx) {
        fail('quickCollectExam reads exam_fee_all_actual BEFORE getClubExamFee (priority wrong)');
    } else {
        pass('quickCollectExam uses getClubExamFee as primary source');
    }
}

// 2. processBatchUpgrade must be financially isolated.
// Exam fee is collected only through quickCollectExam / bundled payment flows.
const pbIdx = findFunctionDef(appJs, 'window.processBatchUpgrade');
if (pbIdx === -1) {
    fail('processBatchUpgrade not found in app.js');
} else {
    const pbEnd = appJs.indexOf('window.downloadExcelTemplate', pbIdx);
    const pbBlock = appJs.slice(pbIdx, pbEnd === -1 ? pbIdx + 6000 : pbEnd);
    const forbidden = [
        'getClubExamFee', 'exam_fee_all_actual', 'allTransactions',
        'studentsToCharge', 'chargeAmount', 'newTxRef',
        "type: 'Lệ phí thi'", 'collection(db, "clubs", currentClubId, "transactions")'
    ];
    const found = forbidden.filter(token => pbBlock.includes(token));
    if (found.length) {
        fail('processBatchUpgrade still contains exam-payment logic: ' + found.join(', '));
    } else if (!pbBlock.includes('"profiles", name') || !pbBlock.includes('{ merge: true }')) {
        fail('processBatchUpgrade does not preserve profile-only merge writes');
    } else {
        pass('processBatchUpgrade is isolated from exam fee and revenue writes');
    }
}

// 3. refreshExamFeeUI function definition must sync exam_fee_all_actual
const ruIdx = findFunctionDef(mainJs, 'window.refreshExamFeeUI');
if (ruIdx === -1) {
    fail('refreshExamFeeUI function definition not found in main.js');
} else {
    const ruBlock = mainJs.slice(ruIdx, ruIdx + 1200);
    if (!ruBlock.includes('exam_fee_all_actual')) {
        fail('refreshExamFeeUI does not set exam_fee_all_actual');
    } else {
        pass('refreshExamFeeUI syncs exam_fee_all_actual');
    }
}

// 4. refreshExamFeeUI function must format examFeeInput with VND
if (ruIdx !== -1) {
    const ruBlock = mainJs.slice(ruIdx, ruIdx + 1200);
    if (!ruBlock.includes('formatVNDNumber') && !ruBlock.includes("toLocaleString('vi-VN')")) {
        fail('refreshExamFeeUI does not format examFeeInput with VND (formatVNDNumber / toLocaleString)');
    } else {
        pass('refreshExamFeeUI formats examFeeInput with VND');
    }
}

// 5. Save button must parse with parseVNDNumber
const saveIdx = mainJs.indexOf("'saveExamFeeBtn'");
if (saveIdx === -1) {
    fail('saveExamFeeBtn binding not found in main.js');
} else {
    const saveBlock = mainJs.slice(saveIdx, saveIdx + 1200);
    if (!saveBlock.includes('parseVNDNumber')) {
        fail('Save button does not parse fee with parseVNDNumber');
    } else {
        pass('Save button parses fee with parseVNDNumber');
    }
}

// 6. debugExamFeeCollectionSource must exist
if (!mainJs.includes('debugExamFeeCollectionSource')) {
    fail('debugExamFeeCollectionSource not found in main.js');
} else {
    pass('debugExamFeeCollectionSource exists');
}

// 7. debugExamFeeSetting function body must expose input/hidden/source fields
const desIdx = findFunctionDef(mainJs, 'window.debugExamFeeSetting');
if (desIdx === -1) {
    fail('debugExamFeeSetting function definition not found in main.js');
} else {
    const desBlock = mainJs.slice(desIdx, desIdx + 1800);
    if (!desBlock.includes('examFeeInputValue') && !desBlock.includes('inputValue')) {
        fail('debugExamFeeSetting does not report examFeeInput value');
    } else {
        pass('debugExamFeeSetting reports input value');
    }
    if (!desBlock.includes('examFeeActualValue') && !desBlock.includes('exam_fee_all_actual')) {
        fail('debugExamFeeSetting does not report hidden actual value');
    } else {
        pass('debugExamFeeSetting reports hidden actual value');
    }
    if (!desBlock.includes('getClubExamFee') && !desBlock.includes('sourcePriority')) {
        fail('debugExamFeeSetting does not report getClubExamFee source');
    } else {
        pass('debugExamFeeSetting reports getClubExamFee source');
    }
}

console.log('');
if (failures === 0) {
    console.log('ALL CHECKS PASSED — exam fee save pipeline is correct');
    process.exit(0);
} else {
    console.log(`${failures} CHECK(S) FAILED`);
    process.exit(1);
}

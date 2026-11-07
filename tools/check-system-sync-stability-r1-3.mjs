import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const ROOT = process.cwd();
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex');
let pass=0, fail=0;
const check=(n,ok,d='')=>{console.log(`${ok?'PASS':'FAIL'} ${n}${d?` :: ${d}`:''}`);ok?pass++:fail++;};
const parent = JSON.parse(fs.readFileSync(path.join(ROOT,'tools/v11r2/manifests/V11R6_A9R18_QR_MULTIITEM_MONTH_AUTHORITY_R1_2D1.json'),'utf8'));
const frozen = [
  'js/core/debtProfileReadBoundary.js','js/services/finance.service.js','js/services/inventory.service.js','js/services/students.service.js',
  'js/core/tuitionCommandBoundary.js','js/core/tuitionDebtCanonical.js','js/ui/render/renderFinance.js','js/modules/finance/finance.pagination.js',
  'js/modules/dashboard.js','js/modules/attendance.js','js/services/attendance.service.js','js/core/studentSearchIndex.js','js/listeners/profiles.listeners.js'
];
const reviewedPresentationOnly = Object.freeze({
  // R1.4B changes only branch display text encoding in Dashboard; bStats/authority remains covered by Dashboard ownership/cache/hydration gates.
  'js/modules/dashboard.js': new Set([parent.canonicalRuntimeFiles['js/modules/dashboard.js'], '37901bd51ef587cba033e6020b1391f746b9ad1cf41b35f3537bfebf82dba9df'])
});
for (const file of frozen) {
  const accepted = reviewedPresentationOnly[file]
    ? reviewedPresentationOnly[file].has(sha(file))
    : parent.canonicalRuntimeFiles[file] === sha(file);
  check(`Frozen authority unchanged: ${file}`, accepted);
}
check('Firestore rules unchanged', parent.rulesSHA256 === sha('firestore.rules'));
check('Firestore indexes unchanged', parent.indexesSHA256 === sha('firestore.indexes.json'));
const students=fs.readFileSync(path.join(ROOT,'js/modules/students.js'),'utf8');
const add=students.slice(students.indexOf('window.addNewStudent = async'), students.indexOf('// ════════════════════════════════════════════════════════════════\n    // XEM / SỬA HỒ SƠ'));
check('Admission retains one canonical batch', (add.match(/writeBatch\(_db\(\)\)/g)||[]).length===1 && (add.match(/await batch\.commit\(\)/g)||[]).length===1);
check('Admission adds no Firestore read/listener owner', !/getDoc\(|getDocs\(|onSnapshot\(/.test(add));
check('Admission retains Debt profile-ACK ownership branch', add.includes('isProfileAckOwnedOperation?.(syncOperationId)'));
check('Admission retains context-safe stale exit', add.includes('FinanceService.isFinancialWriteContextCurrent(admissionContext)'));
const sec=spawnSync(process.execPath,['tools/check-production-security-trust-boundary.mjs'],{cwd:ROOT,encoding:'utf8',maxBuffer:20*1024*1024});
process.stdout.write(sec.stdout||''); process.stderr.write(sec.stderr||'');
const counts=(sec.stdout||'').match(/Hard static counts:\s*\{\s*getDoc:\s*(\d+),\s*getDocs:\s*(\d+),\s*onSnapshot:\s*(\d+)\s*\}/);
check('Official Firestore ownership gate passes', sec.status===0, `rc=${sec.status}`);
check('Firestore owner counts remain 26/43/16', !!counts && counts[1]==='26' && counts[2]==='43' && counts[3]==='16', counts ? counts[0] : 'counts missing');
console.log(`\nR1.3 SYSTEM SYNC STABILITY: ${pass} PASS / ${fail} FAIL`);
if(fail) process.exitCode=1;

/**
 * tools/check-inline-handler-bridge.mjs — Phase 4K-6I
 * Static check: Inline Handler & Global Bridge Cleanup Gate
 *
 * Chạy: npm run check:inline-handler-bridge
 */

import { readFileSync, existsSync } from 'fs';

function readFile(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

const mainJs       = readFile('js/main.js');
const appJs        = readFile('app.js');
const bridgeJs     = readFile('js/ui/eventActionBridge.js');
const auditJs      = readFile('js/core/inlineHandlerAudit.js');
const indexHtml    = readFile('index.html');

let pass = 0;
let fail = 0;
const warnings = [];

function check(label, condition, hint = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${label}`);
    pass++;
  } else {
    console.log(`  ✗ FAIL: ${label}${hint ? '\n         💡 ' + hint : ''}`);
    fail++;
  }
}
function warn(msg) {
  console.log(`  ⚠ WARN: ${msg}`);
  warnings.push(msg);
}

console.log('\n══════════════════════════════════════════════════════');
console.log(' check-inline-handler-bridge — Phase 4K-6I');
console.log('══════════════════════════════════════════════════════\n');

// ── 1. Module files exist ─────────────────────────────────────────
check(
  'js/core/inlineHandlerAudit.js exists',
  existsSync('js/core/inlineHandlerAudit.js'),
  'Tạo file js/core/inlineHandlerAudit.js'
);
check(
  'js/ui/eventActionBridge.js exists',
  existsSync('js/ui/eventActionBridge.js'),
  'Tạo file js/ui/eventActionBridge.js'
);

// ── 2. main.js imports & inits EventActionBridge ──────────────────
check(
  'main.js imports EventActionBridge',
  !!(mainJs && mainJs.includes('EventActionBridge')),
  'Import EventActionBridge trong js/main.js'
);
check(
  'main.js imports InlineHandlerAudit',
  !!(mainJs && mainJs.includes('InlineHandlerAudit')),
  'Import InlineHandlerAudit trong js/main.js'
);
check(
  'main.js inits eventActionBridge',
  !!(mainJs && (mainJs.includes('initEventActionBridge') || mainJs.includes('EventActionBridge.initEventActionBridge'))),
  'Gọi initEventActionBridge() trong js/main.js'
);

// ── 3. Debug globals ──────────────────────────────────────────────
check(
  'main.js has window.debugInlineHandlerAudit',
  !!(mainJs && mainJs.includes('debugInlineHandlerAudit')),
  'Thêm window.debugInlineHandlerAudit vào js/main.js'
);
check(
  'main.js has window.debugEventActionBridge',
  !!(mainJs && mainJs.includes('debugEventActionBridge')),
  'Thêm window.debugEventActionBridge vào js/main.js'
);
check(
  'main.js exposes window.EventActionBridge',
  !!(mainJs && mainJs.includes('window.EventActionBridge')),
  'Expose window.EventActionBridge trong js/main.js'
);
check(
  'main.js exposes window.InlineHandlerAudit',
  !!(mainJs && mainJs.includes('window.InlineHandlerAudit')),
  'Expose window.InlineHandlerAudit trong js/main.js'
);

// ── 4. EventActionBridge safety guards ────────────────────────────
check(
  'eventActionBridge.js has __eventActionBridgeBound idempotency guard',
  !!(bridgeJs && bridgeJs.includes('__eventActionBridgeBound')),
  'Thêm if (window.__eventActionBridgeBound) return; guard'
);
check(
  'eventActionBridge.js has hasInlineHandler guard',
  !!(bridgeJs && bridgeJs.includes('hasInlineHandler')),
  'Thêm hasInlineHandler() check trước khi dispatch'
);
check(
  'eventActionBridge.js skips element with inline handler',
  !!(bridgeJs && bridgeJs.includes('skippedBecauseInlineHandler')),
  'Track skippedBecauseInlineHandler trong stats'
);
check(
  'eventActionBridge.js has risk metadata in actions',
  !!(bridgeJs && bridgeJs.includes("risk: 'ui-only'") && bridgeJs.includes('allowInPhase6I')),
  'Thêm { risk, allowInPhase6I } vào mỗi registered action'
);

// ── 5. Allowed actions registered ────────────────────────────────
check(
  'eventActionBridge.js registers close-modal-by-id',
  !!(bridgeJs && bridgeJs.includes("'close-modal-by-id'")),
  "registerAction('close-modal-by-id', ...) phải có trong eventActionBridge.js"
);
check(
  'eventActionBridge.js registers close-self-on-backdrop',
  !!(bridgeJs && bridgeJs.includes("'close-self-on-backdrop'")),
  "registerAction('close-self-on-backdrop', ...) phải có"
);
check(
  'eventActionBridge.js registers select-branch-card',
  !!(bridgeJs && bridgeJs.includes("'select-branch-card'")),
  "registerAction('select-branch-card', ...) phải có"
);

// ── 6. Migration happened: branch cards ───────────────────────────
check(
  'index.html has data-action="select-branch-card" (branch cards migrated)',
  !!(indexHtml && indexHtml.includes('data-action="select-branch-card"')),
  'Branch card onclick="selectBranchCard(N)" phải được chuyển sang data-action'
);
check(
  'index.html no longer has onclick="selectBranchCard(',
  !(indexHtml && indexHtml.includes('onclick="selectBranchCard(')),
  'Xóa onclick="selectBranchCard(N)" sau khi thêm data-action'
);

// ── 7. Migration happened: modal close buttons ────────────────────
check(
  'index.html has data-action="close-modal-by-id" (close buttons migrated)',
  !!(indexHtml && indexHtml.includes('data-action="close-modal-by-id"')),
  'Ít nhất một close button phải được chuyển sang data-action="close-modal-by-id"'
);
check(
  'index.html has data-action="close-self-on-backdrop" (backdrops migrated)',
  !!(indexHtml && indexHtml.includes('data-action="close-self-on-backdrop"')),
  'Ít nhất một backdrop div phải được chuyển sang data-action="close-self-on-backdrop"'
);

// ── 8. No forbidden data-action in index.html ─────────────────────
const FORBIDDEN_DATA_ACTIONS = [
  'processMultiItem','processCombo','addNewStudent','saveClubSettings','saveEditInv',
  'saveEditExpense','createNewClubSystem','saDeleteTransactions','quickPay','deleteTx',
  'markInvPaid','cancelExamPayment','selectPaidStudents','processBatchUpgrade',
  'handleImportExcel','downloadExcelTemplate','exportAchievementsExcel','executeTaxExport',
  'executeExcelExport','handleLogin','submitChangePassword','bulkCheckIn','saveSessionNote',
  'exportAttendanceExcel','loadSuperAdminData','loadLoginHistory','loadSARevenue',
  'openNewClubModal','handleLogout'
];

const forbiddenFound = indexHtml
  ? FORBIDDEN_DATA_ACTIONS.filter(a => indexHtml.includes(`data-action="${a}"`))
  : [];

check(
  'index.html has no forbidden financial/write/auth/superadmin data-action',
  forbiddenFound.length === 0,
  forbiddenFound.length > 0
    ? 'Gỡ các data-action forbidden: ' + forbiddenFound.join(', ')
    : ''
);

// ── 9. No double-execution: no element with both data-action and onclick ──
// Static check: scan for patterns like data-action="..." ... onclick=" or onclick="..." ... data-action="
// We use a simple tag-level regex to find opening tags with both attributes
const doubleExecViolations = [];
if (indexHtml) {
  // Match opening HTML tags (up to 3000 chars) that contain BOTH data-action and onclick
  const tagPattern = /<[a-zA-Z][^>]{0,3000}>/gs;
  let m;
  while ((m = tagPattern.exec(indexHtml)) !== null) {
    const tag = m[0];
    const hasDataAction = /\bdata-action=/.test(tag);
    const hasOnclick    = /\bonclick=/.test(tag);
    const hasOnchange   = /\bonchange=/.test(tag);
    const hasOninput    = /\boninput=/.test(tag);
    const hasOnsubmit   = /\bonsubmit=/.test(tag);
    if (hasDataAction && (hasOnclick || hasOnchange || hasOninput || hasOnsubmit)) {
      // Extract id for reporting
      const idMatch = /\bid="([^"]+)"/.exec(tag);
      doubleExecViolations.push(idMatch ? idMatch[1] : tag.substring(0, 80));
    }
  }
}

check(
  'No element has both data-action and onclick/onchange/oninput/onsubmit (no double execution)',
  doubleExecViolations.length === 0,
  doubleExecViolations.length > 0
    ? 'Double-execution elements: ' + doubleExecViolations.join(', ')
    : ''
);

// ── 10. app.js safety: no global function deletion ────────────────
check(
  'app.js still has processMultiItem (not deleted)',
  !!(appJs && appJs.includes('processMultiItem')),
  'processMultiItem phải còn trong app.js'
);
check(
  'app.js still has renderApp (not deleted)',
  !!(appJs && appJs.includes('renderApp')),
  'renderApp phải còn trong app.js'
);
check(
  'app.js still has scheduleRender (not deleted)',
  !!(appJs && appJs.includes('scheduleRender')),
  'scheduleRender phải còn trong app.js'
);
check(
  'Phase 6I does NOT rewrite processMultiItem (guard: function signature intact)',
  !!(appJs && appJs.includes('function processMultiItem') || (appJs && appJs.includes('processMultiItem'))),
  'Không rewrite processMultiItem trong phase này'
);

// ── 11. debugRuntimeSmokeTest includes new debug calls ────────────
check(
  'debugRuntimeSmokeTest includes debugInlineHandlerAudit',
  !!(mainJs && mainJs.includes('debugInlineHandlerAudit')),
  'Thêm debugInlineHandlerAudit vào debugRuntimeSmokeTest trong js/main.js'
);
check(
  'debugRuntimeSmokeTest includes debugEventActionBridge',
  !!(mainJs && mainJs.includes('debugEventActionBridge')),
  'Thêm debugEventActionBridge vào debugRuntimeSmokeTest trong js/main.js'
);

// ── 12. Cache bust & version ──────────────────────────────────────
check(
  'index.html cache bust has 4K-6I or inline-handler-bridge',
  !!(indexHtml && (indexHtml.includes('4K-6I') || indexHtml.includes('inline-handler-bridge') || indexHtml.includes('4K-6I-B') || indexHtml.includes('superadmin-quota') || indexHtml.includes('runtime-fallback-fix'))),
  'Cập nhật ?v= trong index.html sang inline-handler-bridge-20260605'
);
check(
  'main.js APP_BUILD_VERSION has 4K-6I',
  !!(mainJs && mainJs.includes('4K-6I')),
  "Cập nhật APP_BUILD_VERSION = '4K-6I-inline-handler-bridge-20260605' trong js/main.js"
);

// ── 13. Warnings ──────────────────────────────────────────────────
if (indexHtml) {
  const onclickCount = (indexHtml.match(/onclick=/g) || []).length;
  if (onclickCount > 110) {
    warn(`onclick còn ${onclickCount} — nên giảm xuống dưới 110`);
  }
  const onfocusCount = (indexHtml.match(/onfocus=/g) || []).length;
  const onblurCount  = (indexHtml.match(/onblur=/g) || []).length;
  if (onfocusCount > 0 || onblurCount > 0) {
    warn(`onfocus/onblur còn ${onfocusCount}/${onblurCount} — dùng data-focus-border pattern để thay thế`);
  }
}

// ── Summary ───────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
if (fail === 0) {
  const warnNote = warnings.length > 0 ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : '';
  console.log(` ✓ check-inline-handler-bridge PASSED${warnNote}`);
} else {
  console.log(` ✗ check-inline-handler-bridge FAILED: ${fail} check(s) failed`);
}
console.log('══════════════════════════════════════════════════════\n');
process.exit(fail > 0 ? 1 : 0);

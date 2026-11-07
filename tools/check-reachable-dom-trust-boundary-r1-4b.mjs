#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const root = path.resolve(rootArg >= 0 && argv[rootArg + 1] ? argv[rootArg + 1] : '.');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const inv = read('js/modules/inventory.js');
const dash = read('js/modules/dashboard.js');
const miSafety = read('js/core/multiItemInventorySafety.js');
const miUi = read('js/core/inventoryMultiItemReadOnlyUI.js');
const students = read('js/modules/students.js');
const invRenderer = read('js/ui/render/computation/inventoryRenderer.js');
const uiRender = read('js/ui/render.js');
const saRefresh = read('js/core/superAdminServerRefresh.js');

let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log('PASS', name); }
  else { fail++; console.error('FAIL', name, detail); }
}
function sliceBetween(src, start, end) {
  const a = src.indexOf(start);
  const b = a >= 0 ? src.indexOf(end, a + start.length) : -1;
  return a >= 0 ? src.slice(a, b > a ? b : a + 12000) : '';
}

const legacyProfile = sliceBetween(app, "window.openProfile =", "window.addAchievementRow =");
const branchCfg = sliceBetween(app, "window.applyClubConfigUI =", "window.handleLogin =");
const appCat = sliceBetween(app, "window.getCategoryOptionHtml =", "window.loadInvCategories =");
const renderApp = sliceBetween(app, "function renderApp(reason)", "window.renderExamList =");
const examRender = sliceBetween(app, "window.renderExamList = () =>", "window.cancelExamPayment =");
const miRefresh = sliceBetween(app, "window._refreshMiHistoryBadges = async", "window.recalcMiInvDebt =");
const miHistory = sliceBetween(app, "window.loadMiPaymentHistory =", "window.updateMultiItemTotal =");
const invCat = sliceBetween(inv, "window.getCategoryOptionHtml =", "window.loadInvCategories =");
const dashBranch = sliceBetween(dash, "export function renderBranchStats", "export function renderExamBranchFees");
const dashExam = sliceBetween(dash, "export function renderExamBranchFees", "export function renderDashboardSummary");
const miDebtFallback = sliceBetween(miSafety, "renderMultiItemInventoryDebtPanel", "refreshMultiItemInventorySection");

// Pre-existing safe canonical owners must stay safe.
check('CANONICAL_STUDENT_ACHIEVEMENT_SAFE', /escapeHtml\(String\(y\)\)/.test(students) && /escapeHtml\(String\(a\.tournament\)\)/.test(students) && /escapeHtml\(String\(a\.result\)\)/.test(students));
check('CANONICAL_STUDENT_SKIPPED_SAFE_DOM_EVENT', /skippedMonthEl\.addEventListener\('click',\s*\(\)\s*=>\s*window\.removeSkip\(name,\s*mo\)\)/.test(students));
check('CANONICAL_STUDENTS_PAGINATION_FALLBACK_SAFE', /const _fallbackNameToken\s*=\s*encodeURIComponent/.test(students) && /openProfile\(decodeURIComponent\('\$\{_fallbackNameToken\}'\)\)/.test(students) && /escapeHtml\(String\(_rawName/.test(students));
check('CANONICAL_MULTIITEM_READONLY_UI_SAFE_DOM', /opt\.textContent\s*=\s*row\.label/.test(miUi) && /createElement\('option'\)/.test(miUi));

// Proven reachable legacy/profile sinks.
check('LEGACY_ACHIEVEMENT_HTML_TEXT_CLOSED', /_legacyEscapeHtmlFailClosed\(String\(y\)\)/.test(legacyProfile) && /_legacyEscapeHtmlFailClosed\(String\(a\.tournament\)\)/.test(legacyProfile) && /_legacyEscapeHtmlFailClosed\(String\(a\.result\)\)/.test(legacyProfile));
check('LEGACY_SKIPPED_INLINE_JS_REMOVED', !/onclick="removeSkip\('\$\{name\}'/.test(legacyProfile) && /addEventListener\('click',\s*\(\)\s*=>\s*window\.removeSkip\(name,\s*mo\)\)/.test(legacyProfile));
check('LEGACY_SHIFT_OPTION_USES_DOM_OPTION', /new Option\(String\(s\.name\s*\|\|\s*''\)\s*\+\s*_t/.test(legacyProfile) && !/_msHtml\s*\+=\s*'<option[^\n]*s\.name/.test(legacyProfile));

// Inventory category option source is Firestore/Admin editable and must be context-safe.
check('CANONICAL_INVENTORY_CATEGORY_OPTION_ATTR_SAFE', /escapeHtml\(String\(c\)\)/.test(invCat) && !/<option value="\$\{c\}">/.test(invCat));
check('LEGACY_INVENTORY_CATEGORY_OPTION_ATTR_SAFE', /_legacyEscapeHtmlFailClosed\(String\(c\)\)/.test(appCat) && !/<option value="\$\{c\}">/.test(appCat));

// MultiItem fallback debt renderers must not parse item category/size/date/id as raw HTML.
check('CORE_MULTIITEM_DEBT_FALLBACK_DOM_SAFE', !/div\.innerHTML\s*=\s*`<input[^`]*\$\{label\}/s.test(miDebtFallback) && /createElement\('input'\)/.test(miDebtFallback) && /textContent\s*=\s*label/.test(miDebtFallback));
check('APP_MULTIITEM_DEBT_FALLBACK_DOM_SAFE', !/div\.innerHTML\s*=\s*`<input[^`]*\$\{label\}/s.test(miRefresh) && /createElement\('input'\)/.test(miRefresh) && /textContent\s*=\s*label/.test(miRefresh));

// Stored transaction.type history path.
check('MULTIITEM_PAYMENT_HISTORY_TYPE_SAFE', !/\$\{t\.type\}/.test(miHistory) || /_legacyEscapeHtmlFailClosed\(String\(t\.type/.test(miHistory));

// Branch config dropdowns: editable branch labels must be DOM text, not innerHTML interpolation.
check('APP_BRANCH_CONFIG_OPTIONS_DOM_SAFE', !/_branchNames\[_i-1\][^\n]*<\/option>/.test(branchCfg) && /new Option\(/.test(branchCfg));

// Dashboard canonical branch labels.
check('DASHBOARD_BRANCH_STATS_NAME_SAFE', /escapeHtml\(String\(bName/.test(dashBranch) && !/\$\{bName\}/.test(dashBranch));
check('DASHBOARD_EXAM_BRANCH_NAME_SAFE', /escapeHtml\(String\(bn/.test(dashExam) && !/\$\{bn\}/.test(dashExam));

// Legacy dashboard/student branch renderers in fallback renderApp.
check('LEGACY_EXAM_BRANCH_FEE_NAME_SAFE', !/\$\{_bn\}/.test(renderApp) || /_legacyEscapeHtmlFailClosed\(String\(_bn/.test(renderApp));
check('LEGACY_STUDENT_BRANCH_BADGE_SAFE', !/\$\{window\.getBranchNameDisplay\(safeBranch\)\}/.test(renderApp));

// Legacy transaction rows: display fields escaped + inline JS uses opaque URI tokens.
check('LEGACY_TRANSACTION_TYPE_DISPLAY_SAFE', /window\.escapeHtml\(String\(printTypeBadge/.test(renderApp));
check('LEGACY_TRANSACTION_NAME_DISPLAY_SAFE', /window\.escapeHtml\(String\(studentNameBase/.test(renderApp) && /window\.escapeHtml\(String\(cleanName/.test(renderApp));
check('LEGACY_TRANSACTION_INLINE_JS_TOKEN_SAFE', /const _txNameToken\s*=\s*encodeURIComponent/.test(renderApp) && /decodeURIComponent\('\$\{_txTypeToken\}'\)/.test(renderApp));

// Legacy active/debt/quit rows: profile identity must not be raw inline JS and display text must be escaped.
check('LEGACY_STUDENT_ROW_IDENTITY_TOKEN_SAFE', /const _profileNameToken\s*=\s*encodeURIComponent/.test(renderApp) && /openProfile\(decodeURIComponent\('\$\{_profileNameToken\}'\)\)/.test(renderApp));
check('LEGACY_DEBT_DISPLAY_NAME_SAFE', /window\.escapeHtml\(String\(_displayName\(name\)\s*\|\|\s*''\)\)/.test(renderApp));
check('LEGACY_QUIT_ROW_TEXT_SAFE', /data-quit-id="\$\{window\.escapeHtml\(String\(name/.test(renderApp) && /window\.escapeHtml\(String\(p\.memberId/.test(renderApp));

// Legacy inventory list display values must be escaped.
check('LEGACY_INVENTORY_STOCK_TEXT_SAFE', /window\.escapeHtml\(String\(s\.category/.test(renderApp) && /window\.escapeHtml\(String\(s\.size/.test(renderApp));
check('LEGACY_INVENTORY_HISTORY_TEXT_SAFE', /window\.escapeHtml\(String\(displayDesc/.test(renderApp) && /window\.escapeHtml\(String\(txCat/.test(renderApp) && /window\.escapeHtml\(String\(t\.size/.test(renderApp));

// Canonical active inventory computation renderer must encode Firestore-backed stock/history text and handler IDs.
check('CANONICAL_INVENTORY_STOCK_RENDER_SAFE', /escapeHtml\(String\(stock\.category/.test(invRenderer) && /escapeHtml\(String\(stock\.size/.test(invRenderer) && /escapeHtml\(String\(key/.test(invRenderer));
check('CANONICAL_INVENTORY_HISTORY_RENDER_SAFE', /escapeHtml\(String\(rawDesc/.test(invRenderer) && /escapeHtml\(String\(txCat/.test(invRenderer) && /escapeHtml\(String\(t\.size/.test(invRenderer) && /const _token\s*=/.test(invRenderer) && /decodeURIComponent\('\$\{invIdToken\}'\)/.test(invRenderer));
check('CANONICAL_ADMISSION_UNIFORM_SIZE_OPTION_SAFE', /escapeHtml\(String\(size/.test(uiRender) && !/<option value=\"\$\{size\}/.test(uiRender));
check('LEGACY_ADMISSION_UNIFORM_SIZE_OPTION_SAFE', /(?:_legacyEscapeHtmlFailClosed|window\.escapeHtml)\(String\(size/.test(renderApp) && !/<option value=\"\$\{size\}/.test(renderApp));

// Legacy Exam inline handlers carry encoded profile identity.
check('LEGACY_EXAM_PROFILE_IDENTITY_TOKEN_SAFE', /const _examNameToken\s*=\s*encodeURIComponent/.test(examRender) && /quickCollectExam\(decodeURIComponent\('\$\{_examNameToken\}'\)\)/.test(examRender));
check('SUPERADMIN_REFRESH_STATUS_TEXT_SAFE', /el\.textContent\s*=\s*(?:String\(message|message)/.test(saRefresh) && !/el\.innerHTML\s*=\s*message/.test(saRefresh));

// Fidelity primitives: no stripping, URI roundtrip preserves identity.
const fixture = 'Cơ sở A & B <Khu 1> "Thi đấu" O\'Neil';
const escaped = fixture.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
check('DATA_FIDELITY_HTML_ESCAPING_NON_STRIPPING', escaped.includes('&lt;Khu 1&gt;') && escaped.includes('O&#39;Neil') && escaped.includes('&amp;'));
const token = encodeURIComponent(fixture).replace(/'/g,'%27');
check('DATA_FIDELITY_URI_TOKEN_ROUNDTRIP', decodeURIComponent(token) === fixture);

console.log(`R1.4B REACHABLE DOM TRUST BOUNDARY: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);

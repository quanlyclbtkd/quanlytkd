#!/usr/bin/env node
import fs from 'node:fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function exists(file) { return fs.existsSync(file); }
let failures = 0;
function ok(name, condition, details = '') {
  if (condition) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}${details ? ` — ${details}` : ''}`); }
}

const marker = 'role-runtime-audit-profiler-20260704-v5o';
const patch = '4K-6V5O-role-runtime-audit-profiler-20260704';
const audit = read('js/core/roleRuntimeAudit.js');
const auditPub = read('public/js/core/roleRuntimeAudit.js');
const main = read('js/main.js');
const mainPub = read('public/js/main.js');
const app = read('app.js');
const appPub = read('public/app.js');
const idx = read('index.html');
const idxPub = read('public/index.html');
const scheduler = read('js/ui/render/renderScheduler.js');
const schedulerPub = read('public/js/ui/render/renderScheduler.js');
const invalidation = read('js/ui/render/renderInvalidation.js');
const invalidationPub = read('public/js/ui/render/renderInvalidation.js');
const guard = read('js/utils/firestore-guard.js');
const listeners = read('js/utils/listeners.js');
const pkg = JSON.parse(read('package.json'));
const pkgPub = JSON.parse(read('public/package.json'));

ok('runtime audit module exists in source/public', exists('js/core/roleRuntimeAudit.js') && exists('public/js/core/roleRuntimeAudit.js'));
ok('runtime audit module mirrored exactly', audit === auditPub);
ok('V5O build marker in app/index/main', app.includes(patch) && idx.includes(marker) && main.includes(marker));
ok('V5O public build marker in app/index/main', appPub.includes(patch) && idxPub.includes(marker) && mainPub.includes(marker));
ok('main imports roleRuntimeAudit with cache-bust', main.includes("./core/roleRuntimeAudit.js?v=" + marker) && mainPub.includes("./core/roleRuntimeAudit.js?v=" + marker));
ok('main initializes runtime audit in boot path', main.includes('initRoleRuntimeAudit();') && main.includes('Debug-only metrics; no Firestore reads/writes'));
ok('switchTab records audit tab switches', main.includes('trackRuntimeAuditTabSwitch(tabId') && mainPub.includes('trackRuntimeAuditTabSwitch(tabId'));

ok('audit exposes required globals', [
  'window.__runtimeAuditMetrics',
  'window.trackRuntimeAuditEvent',
  'window.trackRuntimeAuditRead',
  'window.trackRuntimeAuditRender',
  'window.trackRuntimeAuditTabSwitch',
  'window.getRoleRuntimeAudit',
  'window.printRoleRuntimeAudit',
  'window.enableRuntimeAuditPanel',
  'window.disableRuntimeAuditPanel'
].every(s => audit.includes(s)));
ok('audit is debug-gated by localStorage/window flags', audit.includes("localStorage.getItem(ENABLE_FLAG) === '1'") && audit.includes('window.__RUNTIME_AUDIT === true'));
ok('audit includes role expectations for superadmin/admin/coach/viewer', ['super_admin', 'admin', 'coach', 'viewer'].every(role => audit.includes(`${role}: {`) || audit.includes(`${role}:`)));
ok('coach runtime audit checks forbidden listener hints', audit.includes('forbiddenHints') && audit.includes('inventoryActiveDebts') && audit.includes('coach listener contains forbidden hint'));
ok('data audit covers status/branch/skippedMonths', audit.includes('skippedMonthsLegacyShape') && audit.includes('missingBranch') && audit.includes('contradictoryStatus'));
ok('audit module does not import/use Firestore APIs', !/\b(getDocs|getDoc|setDoc|updateDoc|deleteDoc|onSnapshot|collection|doc)\b/.test(audit));
ok('audit module does not mutate app business globals', !audit.includes('setDoc(') && !audit.includes('updateDoc(') && !audit.includes('deleteDoc('));

ok('renderScheduler emits runtime render metrics', scheduler.includes('trackRuntimeAuditRender(key') && scheduler.includes("source: 'renderScheduler'") && schedulerPub.includes('trackRuntimeAuditRender(key'));
ok('large-list tracker emits runtime render metrics', invalidation.includes("source: 'trackLargeListRender'") && invalidation.includes('renderedRows') && invalidationPub.includes("source: 'trackLargeListRender'"));
ok('safeGetDocs emits runtime read metrics', guard.includes("source: 'safeGetDocs'") && guard.includes('trackRuntimeAuditRead(collName'));
ok('listener registry emits runtime read/listener metrics', listeners.includes("source: 'registerListener'") && listeners.includes('trackRuntimeAuditRead(key'));

const scripts = pkg.scripts || {};
const publicScripts = pkgPub.scripts || {};
ok('package has V5O check script', !!scripts['check:v5o-role-runtime-audit-profiler'] && scripts['check:v5o-role-runtime-audit-profiler'].includes('check-v5o-role-runtime-audit-profiler.mjs'));
ok('package has role-based check scripts', ['check:role-superadmin','check:role-admin','check:role-coach','check:role-common','check:performance','check:deploy-safe'].every(k => !!scripts[k]));
ok('default check includes V5O check', String(scripts.check || '').includes('check:v5o-role-runtime-audit-profiler'));
ok('public package mirrors scripts', ['check:v5o-role-runtime-audit-profiler','check:role-superadmin','check:role-admin','check:role-coach'].every(k => publicScripts[k] === scripts[k]));
ok('role-superadmin includes SuperAdmin recovery and revenue checks', scripts['check:role-superadmin'].includes('check:v5k-superadmin-access-admin-provisioning-recovery') && scripts['check:role-superadmin'].includes('check:v5l-superadmin-revenue-cache-fallback'));
ok('role-admin includes debt/search/zalo/status checks', scripts['check:role-admin'].includes('check:v5c-tx-delete-reconcile-smart-search') && scripts['check:role-admin'].includes('check:v5g-given-name-priority-search-unification') && scripts['check:role-admin'].includes('check:v5n-debt-zalo-feature-off'));
ok('role-coach includes coach branch and attendance checks', scripts['check:role-coach'].includes('check:coach-attendance-only-read-boundary') && scripts['check:role-coach'].includes('check:security-coach-branch-boundary'));

if (failures) {
  console.error(`\nV5O role runtime audit profiler check FAILED: ${failures} lỗi.`);
  process.exit(1);
}
console.log('\nV5O role runtime audit profiler check PASS.');

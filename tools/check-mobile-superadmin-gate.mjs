/**
 * tools/check-mobile-superadmin-gate.mjs
 * Phase 4K-5Q — verify Mobile SuperAdmin Gate requirements
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

function readFile(rel) {
  return readFileSync(resolve(root, rel), 'utf-8');
}

let failures = 0;
function fail(msg) { console.error('  FAIL:', msg); failures++; }
function pass(msg) { console.log('  PASS:', msg); }

console.log('\n=== check-mobile-superadmin-gate ===\n');

const appJs   = readFile('app.js');
const mainJs  = readFile('js/main.js');

// 1. isSuperAdminRole must exist
if (appJs.includes('window.isSuperAdminRole = function')) {
  pass('window.isSuperAdminRole defined');
} else {
  fail('window.isSuperAdminRole NOT found in app.js');
}

// 2. openMobileMenu must NOT use old (admin || super_admin) pattern for mmsAdminBtn
const oldPattern = "(window.userRole === 'admin' || window.userRole === 'super_admin') ? 'block' : 'none'";
// Allow the old pattern in OTHER places (e.g. manageBtnWrap), but NOT inside openMobileMenu
const openMenuIdx = appJs.indexOf('window.openMobileMenu = () => {');
const closeMobileMenuIdx = appJs.indexOf('window.closeMobileMenu = () => {');
if (openMenuIdx !== -1 && closeMobileMenuIdx !== -1) {
  const menuBlock = appJs.slice(openMenuIdx, closeMobileMenuIdx);
  if (menuBlock.includes(oldPattern)) {
    fail('openMobileMenu still uses old (admin || super_admin) condition for mmsAdminBtn');
  } else {
    pass('openMobileMenu does NOT use old admin||super_admin condition');
  }
} else {
  fail('Could not locate openMobileMenu / closeMobileMenu block');
}

// 3. openNewClubModal must guard isSuperAdminRole
if (appJs.includes('window.openNewClubModal') && appJs.includes('isSuperAdminRole') &&
    appJs.indexOf('isSuperAdminRole') > appJs.indexOf('window.openNewClubModal = () => {')) {
  pass('openNewClubModal has isSuperAdminRole guard');
} else {
  fail('openNewClubModal does NOT contain isSuperAdminRole guard');
}

// 4. debugMobileSuperAdminGate must exist
if (appJs.includes('window.debugMobileSuperAdminGate = function')) {
  pass('window.debugMobileSuperAdminGate defined');
} else {
  fail('window.debugMobileSuperAdminGate NOT found in app.js');
}

// 5. debugRuntimeSmokeTest includes debugMobileSuperAdminGate
if (mainJs.includes('debugMobileSuperAdminGate')) {
  pass('debugRuntimeSmokeTest includes debugMobileSuperAdminGate');
} else {
  fail('debugRuntimeSmokeTest does NOT include debugMobileSuperAdminGate');
}

console.log(`\nResult: ${failures === 0 ? '✅ ALL PASS' : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures > 0 ? 1 : 0);

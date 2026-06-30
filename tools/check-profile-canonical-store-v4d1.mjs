#!/usr/bin/env node
/**
 * Phase 4K-6V4D1 — Profile Canonical Store Read-only Audit checks.
 * Ensures canonical store is loaded, read-only, no extra Firestore calls, and exposes audit/debug API.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(process.cwd());
const failures = [];
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }
function check(name, condition, detail = '') {
  if (condition) console.log(`✅ ${name}`);
  else { console.error(`❌ ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
}
function includes(file, text) { return read(file).includes(text); }

console.log('\n🔍 Phase 4K-6V4D1 — Profile Canonical Store Read-only Audit checks\n');

const build = 'profile-canonical-store-runtime-recovery-20260628-v4d1a';
const runtimeBuild = 'coach-quit-authoritative-fix-20260630-v4d4';
const baseBuild = 'profile-canonical-store-20260628-v4d1';
const version = '4K-6V4D1-profile-canonical-store-readonly-audit-20260628';
const runtimeVersion = '4K-6V4D1A-profile-canonical-store-runtime-recovery-20260628';

check('profileCanonicalStore.js exists', existsSync(resolve(root, 'js/core/profileCanonicalStore.js')));
check('public mirror profileCanonicalStore.js exists', existsSync(resolve(root, 'public/js/core/profileCanonicalStore.js')));

const index = read('index.html');
const main = read('js/main.js');
const pkg = read('package.json');
const src = read('js/core/profileCanonicalStore.js');
const publicSrc = read('public/js/core/profileCanonicalStore.js');

check('index loads profileCanonicalStore after tuitionDebtCanonical and before app.js',
  index.indexOf(`js/core/tuitionDebtCanonical.js?v=${runtimeBuild}`) > -1 &&
  index.indexOf(`js/core/profileCanonicalStore.js?v=${runtimeBuild}`) > index.indexOf(`js/core/tuitionDebtCanonical.js?v=${runtimeBuild}`) &&
  index.indexOf(`js/core/profileCanonicalStore.js?v=${runtimeBuild}`) < index.indexOf(`app.js?v=${runtimeBuild}`));
check('index cache-busts app.js and main.js to V4D1A', index.includes(`app.js?v=${runtimeBuild}`) && index.includes(`./js/main.js?v=${runtimeBuild}`));
check('main.js retains V4D1 lineage marker', main.includes(`APP_BUILD_VERSION = '${runtimeVersion}'`) || main.includes(`APP_PATCH_VERSION = '${runtimeVersion}'`) || main.includes(`APP_BUILD_VERSION = '${version}'`) || main.includes(`APP_PATCH_VERSION = '${version}'`));
check('profile canonical store exports public debug/audit API',
  src.includes('window.ProfileCanonicalStore') || src.includes('global.ProfileCanonicalStore'));
check('profile canonical store exposes getProfileCanonicalStoreStatus', src.includes('getProfileCanonicalStoreStatus'));
check('profile canonical store exposes auditProfileCanonicalStore', src.includes('auditProfileCanonicalStore'));
check('profile canonical store exposes debugProfileCanonical', src.includes('debugProfileCanonical'));
check('profile canonical store exposes debugProfileCanonicalById', src.includes('debugProfileCanonicalById'));
check('profile canonical store creates status/branch/month/search indexes',
  src.includes('byStatus') && src.includes('byBranch') && src.includes('skippedByMonth') && src.includes('searchIndex'));
check('profile canonical store uses already loaded profile sources only',
  src.includes('st.profiles') && src.includes('global.allProfiles') && src.includes('empty-local-cache'));
check('profile canonical store is read-only: no Firestore read/write APIs',
  !/\b(getDocs|onSnapshot|getCountFromServer|runAggregationQuery|updateDoc|setDoc|addDoc|deleteDoc|writeBatch|collection\(|query\(|where\()\b/.test(src));
check('profile canonical store reports noRead/extraReads safety', src.includes('noRead: true') && src.includes('extraReads: 0'));
check('public mirror matches source helper', publicSrc === src);
check('package.json includes V4D1 gate in npm check',
  pkg.includes('check:profile-canonical-store') && pkg.includes('check-profile-canonical-store-v4d1.mjs'));

const context = {
  window: {},
  globalThis: {},
  console: { log(){}, warn(){}, table(){}, error(){} }
};
context.window.console = context.console;
context.window.BranchIdentity = {
  normalize(value, options = {}) {
    const raw = String(value || '').trim();
    if (!raw) return options.fallback || 'CS1';
    const folded = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (folded === 'mac dinh' || folded === 'default') return 'CS1';
    const m = folded.match(/^cs0*([1-9]|10)$/);
    return m ? `CS${Number(m[1])}` : raw;
  },
  aliases(value) { return value === 'CS1' ? ['CS1', 'Mặc định'] : [value]; }
};
context.window.TuitionDebtCanonical = {
  normalizeMonth(value) {
    const raw = String(value || '').toLowerCase();
    if (/tháng\s+năm|thang\s+nam|05\/2026|5\/2026|2026-05/.test(raw)) return '2026-05';
    if (/tháng\s+sáu|thang\s+sau|06\/2026|6\/2026|2026-06/.test(raw)) return '2026-06';
    if (/tháng\s+tư|thang\s+tu|04\/2026|4\/2026|2026-04/.test(raw)) return '2026-04';
    return '';
  }
};
context.window.__store = {
  profiles: {
    A: { profileId: 'A1', name: 'Nguyễn Văn A', status: 'active', branch: 'Mặc định', paidUntil: 'Tháng Năm 2026', skippedMonths: ['Tháng Sáu 2026'], phone: '0901' },
    B: { profileId: 'B1', name: 'Trần Thị B', status: 'Đã nghỉ', branch: 'CS02', paidUntil: '04/2026' },
    C: { profileId: 'C1', name: 'Lê Văn C', status: 'trial', branch: 'CS1', paidUntil: 'bad-month' },
    D: { profileId: 'C1', name: 'Lê Văn D', branch: '', skippedMonths: ['bad-month'] }
  },
  _dataVersion: 1
};
vm.createContext(context);
vm.runInContext(src, context, { filename: 'profileCanonicalStore.js' });
const api = context.window.ProfileCanonicalStore;
check('VM API initialized', !!api && api.version === version);
const store = api.ensure({ force: true, reason: 'test' });
check('VM store builds from local profile cache', store.ready && store.totalRawProfiles === 4 && store.extraReads === 0 && store.noRead === true);
check('canonical branch normalizes aliases', store.byId.A1.branchCanonical === 'CS1' && store.byId.B1.branchCanonical === 'CS2');
check('canonical status classifies active/trial/quit',
  store.byId.A1.statusCanonical === 'active' && store.byId.B1.statusCanonical === 'quit' && store.byId.C1.statusCanonical === 'trial');
check('canonical month normalizes paidUntil and skippedMonths',
  store.byId.A1.paidUntilCanonical === '2026-05' && store.byId.A1.skippedMonthsCanonical.includes('2026-06'));
check('search index can find by Vietnamese name fragment', api.debugProfileCanonical('nguyen van a').profileId === 'A1');
check('debug by id returns canonical row', api.debugProfileCanonicalById('B1').statusCanonical === 'quit');
const status = api.getStatus();
check('getProfileCanonicalStoreStatus shape is stable', status.ready && status.totalCanonicalProfiles === 4 && status.duplicateProfileIdCount === 1);
const audit = api.audit();
check('audit detects data warnings without writes',
  audit.invalidPaidUntilCount >= 1 && audit.invalidSkippedMonthCount >= 1 && audit.duplicateProfileIdCount === 1 && audit.extraReads === 0);
check('global debug functions exported',
  typeof context.window.getProfileCanonicalStoreStatus === 'function' &&
  typeof context.window.auditProfileCanonicalStore === 'function' &&
  typeof context.window.debugProfileCanonical === 'function' &&
  typeof context.window.debugProfileCanonicalById === 'function');

console.log(`\n📊 Results: ${27 - failures.length} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const version = 'coach-attendance-tap-stability-20260701-v5c';

const files = {
  index: read('index.html'),
  scheduler: read('js/ui/render/renderScheduler.js'),
  renderFinance: read('js/ui/render/renderFinance.js'),
  finance: read('js/modules/finance.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  renderStudents: read('js/ui/render/renderStudents.js'),
  profileStore: read('js/data/studentProfileStore.js'),
  publicScheduler: read('public/js/ui/render/renderScheduler.js'),
  publicRenderFinance: read('public/js/ui/render/renderFinance.js'),
  publicFinance: read('public/js/modules/finance.js'),
  publicProfiles: read('public/js/listeners/profiles.listeners.js'),
  publicRenderStudents: read('public/js/ui/render/renderStudents.js'),
};

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}

console.log('\n=== Phase 4K-6V4D10 — Admin TX Slow Render + Quit Full Authoritative ===\n');

check('Cache-bust version updated in index/main/app',
  files.index.includes(`app.js?v=${version}`) && files.index.includes(`./js/main.js?v=${version}`));

check('renderScheduler slow warnings are production-gated and threshold raised',
  files.scheduler.includes('const SLOW_MS         = 32') &&
  files.scheduler.includes('window.__DEBUG_RENDER_PERF === true') &&
  files.scheduler.includes('Slow-render diagnostics are useful while developing'));

check('finance island skips identical table DOM replacement',
  files.renderFinance.includes('el.__lastFinanceIslandHtml === nextHtml') &&
  files.renderFinance.includes('el.__lastFinanceIslandHtml = nextHtml'));

check('transaction pagination avoids duplicate finance-domain invalidation after first page load',
  files.finance.includes('Phase 4K-6V4D10: one-page transaction load must not trigger') &&
  !files.finance.includes("window.invalidateFinance('tx-pagination-data-hydrated')"));

check('loadFullProfilesFallback accepts forceQuitAuthoritative option',
  files.profiles.includes('export async function loadFullProfilesFallback(reason, options = {})') &&
  files.profiles.includes('forceQuitAuthoritative'));

check('quit authoritative pass has one guarded force attempt for Admin',
  files.profiles.includes('quitAuthoritativeForceAttempted') &&
  files.profiles.includes('forceQuitAuthoritative: force'));

check('quit render triggers authoritative reconciliation from Đã nghỉ tab',
  files.renderStudents.includes('function _ensureQuitAuthorityFromRender') &&
  files.renderStudents.includes("_ensureQuitAuthorityFromRender('quit-island-render')"));

check('quit island prefers direct full rows once authority is confirmed',
  files.renderStudents.includes('_quitAuthorityReady || _isQuitMobileViewport()'));

check('ensureProfilesForTab treats compat quit data as potentially partial',
  files.profileStore.includes('compatCount can be partial active/targeted data') &&
  files.profileStore.includes('ensure-quit-tab-force-authority'));

check('Public mirror synced for scheduler and finance render changes',
  files.publicScheduler.includes('const SLOW_MS         = 32') &&
  files.publicRenderFinance.includes('el.__lastFinanceIslandHtml === nextHtml'));

check('Public mirror synced for quit authoritative changes',
  files.publicProfiles.includes('forceQuitAuthoritative: force') &&
  files.publicRenderStudents.includes("_ensureQuitAuthorityFromRender('quit-island-render')"));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D10 checks passed.\n');

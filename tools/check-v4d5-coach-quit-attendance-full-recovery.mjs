#!/usr/bin/env node
/** Phase 4K-6V4D5 — Coach Login + Quit Full List Recovery gate. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  main: read('js/main.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  renderStudents: read('js/ui/render/renderStudents.js'),
  finance: read('js/modules/finance.js'),
  publicProfiles: read('public/js/listeners/profiles.listeners.js'),
  publicRenderStudents: read('public/js/ui/render/renderStudents.js'),
  publicFinance: read('public/js/modules/finance.js'),
};
const BUILD = 'coach-quit-attendance-full-recovery-20260630-v4d5';
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name); } }
console.log('\n=== Phase 4K-6V4D5 — Coach Login + Quit Full List Recovery ===\n');
check('index/app/main cache-bust to V4D5', files.index.includes(`app.js?v=${BUILD}`) && files.index.includes(`./js/main.js?v=${BUILD}`) && files.main.includes(`profiles.listeners.js?v=${BUILD}`));
check('APP_PATCH_VERSION marks V4D5', files.app.includes("APP_PATCH_VERSION = '4K-6V4D5-coach-quit-attendance-full-recovery-20260630'") && files.main.includes("APP_PATCH_VERSION = '4K-6V4D5-coach-quit-attendance-full-recovery-20260630'"));
check('legacy app has robust classifier before module availability', files.app.includes('window.classifyProfileStatus = window.classifyProfileStatus || function(profile)') && files.app.includes("'quitDate','stoppedDate','leftDate','inactiveDate','nghiDate','ngayNghi'"));
check('legacy app no longer empties coach profiles when module unavailable', files.app.includes('using branch-safe legacy fallback') && files.app.includes('onSnapshot(_q') && files.app.includes("where('branch', '==', _alias)"));
check('legacy app coach fallback filters quit locally and repaints attendance', files.app.includes("window.classifyProfileStatus(_data)") && files.app.includes("_kind !== 'quit'") && files.app.includes('window.renderAttendanceList'));
check('coach listener primary query is branch-only', files.profiles.includes("activeQuery = isCoach\n                    ? fbQuery(profRef, fbWhere('branch', '==', coachBranch))") && files.profiles.includes('so status+branch queries silently under-load'));
check('coach primary snapshot filters quit locally', files.profiles.includes('if (!isCoach || classifyProfileStatus(data) !== \'quit\') activeMap[id] = data;'));
check('coach alias listener is branch-only', files.profiles.includes("const aliasQuery = fbQuery(profRef, fbWhere('branch', '==', alias));") && !files.profiles.includes("const aliasQuery = fbQuery(profRef, statusConstraint, fbWhere('branch', '==', alias));"));
check('coach alias snapshot filters quit locally', files.profiles.includes("if (classifyProfileStatus(data) !== 'quit') aliasMap[id] = data;"));
check('quit render prefers authoritative full union on both web and mobile', files.renderStudents.includes('both web and mobile must prefer the authoritative full') && files.renderStudents.includes('_directPreview.count >= _cachedQuitRows'));
check('finance service imports are cache-busted to V4D5 to avoid stale 503 module abort', files.finance.includes(`finance.service.js?v=${BUILD}`) && files.finance.includes(`students.service.js?v=${BUILD}`));
check('public mirror is synced', files.publicProfiles.includes('branch-only alias listener') && files.publicRenderStudents.includes('both web and mobile must prefer') && files.publicFinance.includes(`finance.service.js?v=${BUILD}`));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D5 checks passed.\n');

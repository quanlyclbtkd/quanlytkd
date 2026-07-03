#!/usr/bin/env node
import fs from 'fs';

const checks = [];
const read = (p) => fs.readFileSync(p, 'utf8');
function check(name, ok, detail = '') { checks.push({ name, ok: !!ok, detail }); }

const render = read('js/ui/render.js');
const renderPub = read('public/js/ui/render.js');
const attendance = read('js/modules/attendance.js');
const attendancePub = read('public/js/modules/attendance.js');
const renderStudents = read('js/ui/render/renderStudents.js');
const renderStudentsPub = read('public/js/ui/render/renderStudents.js');
const app = read('app.js');
const index = read('index.html');
const main = read('js/main.js');

<<<<<<< HEAD
check('cache bust updated to V4D1A in index', index.includes('coach-runtime-recovery-login-history-cache-guard-20260703-v5d'));
check('main imports render.js with V4D1A cache bust', main.includes('./ui/render.js?v=coach-runtime-recovery-login-history-cache-guard-20260703-v5d'));
=======
check('cache bust updated to V4D1A in index', index.includes('profile-canonical-store-runtime-recovery-20260628-v4d1a'));
check('main imports render.js with V4D1A cache bust', main.includes('./ui/render.js?v=profile-canonical-store-runtime-recovery-20260628-v4d1a'));
>>>>>>> parent of 4757e42 (upload)
check('render.js has small UI refresh helper', render.includes('function _refreshSmallStudentUi(tabId, reason)'));
check('render.js early return calls small UI refresh', render.includes("_refreshSmallStudentUi(earlyTabId, 'renderApp-dataVersion-unchanged')"));
check('render.js small UI refresh always renders birthday banner', render.includes("typeof window._renderHomeBirthdayBanner === 'function'") && render.includes('window._renderHomeBirthdayBanner()'));
check('render.js skipped section uses merged local profiles', render.includes('function _profilesForSmallUi()') && render.includes('getAllProfilesCompat'));
check('render.js skipped section still canonical-normalizes skipped month', render.includes('_renderSkippedMonthSection(_profilesForSmallUi()') && render.includes('_normalizeSkippedMonthValue'));
check('attendance birthday accepts birthDate', attendance.includes('p.birthDate'));
check('attendance birthday accepts birthday', attendance.includes('p.birthday'));
check('attendance birthday accepts ngaySinh', attendance.includes('p.ngaySinh'));
check('renderStudents merges canonical quit store', renderStudents.includes('canonicalStore') && renderStudents.includes('canonicalStore.quitProfiles'));
check('renderStudents merges allProfiles quit fallback', renderStudents.includes('Object.assign({}, window.allProfiles || {}, (window.__store && window.__store.profiles) || {})'));
check('renderStudents renders direct quit fallback before quitLoaded', renderStudents.includes('if (!_quitLoaded && _hasDirectQuit)'));
check('renderStudents chooses direct if cached quit rows partial', renderStudents.includes('_directPreview.count > ((_htmlQ.match(/data-quit-id=/g) || []).length)'));
check('legacy app render early return refreshes small UI', app.includes('if(_dataVersion === _lastRenderedVersion) { _legacyRefreshSmallStudentUi(); return; }'));
check('legacy app has small UI refresh helper', app.includes('function _legacyRefreshSmallStudentUi()'));
check('legacy app small UI uses merged profiles', app.includes('function _legacyProfilesForSmallUi()') && app.includes('getAllProfilesCompat'));
check('public render.js synced', renderPub.includes('function _refreshSmallStudentUi(tabId, reason)'));
check('public attendance synced', attendancePub.includes('p.birthDate') && attendancePub.includes('p.birthday'));
check('public renderStudents synced', renderStudentsPub.includes('if (!_quitLoaded && _hasDirectQuit)'));
check('no new Firestore reads in profile canonical store', !read('js/core/profileCanonicalStore.js').match(/\b(getDocs|onSnapshot|getCountFromServer|runAggregationQuery)\b/));
check('V4D1A does not introduce writes in profile canonical store', !read('js/core/profileCanonicalStore.js').match(/\b(setDoc|updateDoc|writeBatch|deleteDoc|addDoc)\b/));

const failed = checks.filter(c => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
console.log(`\nV4D1A Runtime Recovery: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);

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

check('cache bust updated to V4D1A-or-later in index', index.includes('quit-context-render-loop-guard-20260722-v5s') || index.includes('profile-canonical-store-runtime-recovery-20260628-v4d1a'));
check('main imports render.js with V4D1A-or-later cache bust', main.includes('./ui/render.js?v=student-given-name-priority-20260811-v5u3') || main.includes('./ui/render.js?v=quit-context-render-loop-guard-20260722-v5s') || main.includes('./ui/render.js?v=profile-canonical-store-runtime-recovery-20260628-v4d1a'));
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
check('renderStudents uses QuitProfileBoundary as the single source once available', renderStudents.includes('if (window.QuitProfileBoundary)') && (renderStudents.includes("ensureComplete?.('render-quit-island')") || (renderStudents.includes('_requestQuitAuthorityForRender') && renderStudents.includes('boundary.ensureComplete?.'))) && renderStudents.includes('never restore #quitList from computation/legacy HTML caches'));
check('renderStudents ignores cached quit rows when boundary is present', renderStudents.indexOf('if (window.QuitProfileBoundary)') < renderStudents.indexOf("const cached = getStudentsCachedHtml('quitRows')") && renderStudents.includes('Standalone legacy fallback only when the V5R boundary module is absent'));
check('legacy app render early return refreshes small UI', app.includes('if(_dataVersion === _lastRenderedVersion) { _legacyRefreshSmallStudentUi(); return; }'));
check('legacy app has small UI refresh helper', app.includes('function _legacyRefreshSmallStudentUi()'));
check('legacy app small UI uses merged profiles', app.includes('function _legacyProfilesForSmallUi()') && app.includes('getAllProfilesCompat'));
check('public render.js synced', renderPub.includes('function _refreshSmallStudentUi(tabId, reason)'));
check('public attendance synced', attendancePub.includes('p.birthDate') && attendancePub.includes('p.birthday'));
check('public renderStudents synced', renderStudentsPub.includes('if (window.QuitProfileBoundary)') && renderStudentsPub.includes('Standalone legacy fallback only when the V5R boundary module is absent'));
check('no new Firestore reads in profile canonical store', !read('js/core/profileCanonicalStore.js').match(/\b(getDocs|onSnapshot|getCountFromServer|runAggregationQuery)\b/));
check('V4D1A does not introduce writes in profile canonical store', !read('js/core/profileCanonicalStore.js').match(/\b(setDoc|updateDoc|writeBatch|deleteDoc|addDoc)\b/));

const failed = checks.filter(c => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
console.log(`\nV4D1A Runtime Recovery: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);

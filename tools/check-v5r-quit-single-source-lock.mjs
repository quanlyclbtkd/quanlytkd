#!/usr/bin/env node
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
let pass=0, fail=0;
const check=(n,o)=>{o?(pass++,console.log('✅',n)):(fail++,console.error('❌',n))};
const build='quit-context-render-loop-guard-20260722-v5s';
const searchBuild='student-given-name-priority-20260811-v5u3';
const appBuild='attendance-excel-documentid-sdk-fix-20260801-v5u2e';
const index=read('index.html');
const main=read('js/main.js');
const store=read('js/data/studentProfileStore.js');
const listener=read('js/listeners/profiles.listeners.js');
const boundary=read('js/data/quitProfileBoundary.js');
const render=read('js/ui/render/renderStudents.js');
const students=read('js/modules/students.js');
const statusBoundary=read('js/core/studentStatusCommandBoundary.js');
const app=read('app.js');
const pubBoundary=read('public/js/data/quitProfileBoundary.js');
const pkg=JSON.parse(read('package.json'));

check('V5R build marker active', (index.includes(`app.js?v=${appBuild}`) || index.includes(`app.js?v=${build}`)) && (index.includes(`js/main.js?v=${searchBuild}`) || index.includes(`js/main.js?v=${build}`)) && (main.includes(`quitProfileBoundary.js?v=${searchBuild}`) || main.includes(`quitProfileBoundary.js?v=${build}`)));
check('complete mode is dedicated quit store only', boundary.includes("_metrics.lastMode = 'complete-single-source'") && boundary.includes('if (complete)') && boundary.includes("'studentProfileStore.quitProfiles'"));
check('legacy/canonical union is preview-only', boundary.includes('loading-preview-union') && boundary.includes('window.allProfiles.preview') && boundary.includes('canonical.quitProfiles.preview'));
check('boundary dedupes preview by stable identity', boundary.includes('function _identity') && boundary.includes('identityIndex') && boundary.includes('delete target[previousKey]'));
check('active bucket removes restored ids from quit bucket', store.includes('an active id cannot remain in quit/other caches') && store.includes('delete _store.quitProfiles[id]'));
check('quit bucket removes ids from active bucket', store.includes('a quit id cannot remain in active/other caches') && store.includes('delete _store.activeProfiles[id]'));
check('quit authority is club-scoped', listener.includes('quitAuthorityClubId') && listener.includes('sameClub') && listener.includes('_state.quitAuthorityClubId === currentClubId'));
const quitLoadStart = listener.indexOf('export async function loadQuitProfilesIfNeeded');
const quitLoadEnd = listener.indexOf('export async function ensureQuitProfilesComplete', quitLoadStart);
const quitLoadSegment = quitLoadStart >= 0 && quitLoadEnd > quitLoadStart ? listener.slice(quitLoadStart, quitLoadEnd) : '';
check('quit authority is event-driven: no 60-second mandatory refresh or polling',
  !/ageMs\s*>\s*60000/.test(quitLoadSegment) &&
  !/setInterval\s*\(/.test(quitLoadSegment) &&
  listener.includes('waiting 60 seconds MUST NOT trigger another') &&
  listener.includes("if (!forceRefresh && sameClub && !dirty && _state.quitCompletenessReconciled && isQuitComplete()) return true;"));
check('quit authority keeps one existing authoritative getDocs flight',
  (quitLoadSegment.match(/fbGetDocs\(ctx\.profRef\)/g) || []).length === 1 &&
  quitLoadSegment.includes('if (_quitAuthorityPromise) return _quitAuthorityPromise') &&
  quitLoadSegment.includes('_quitAuthorityPromise = (async () =>'));
check('membership mutations mark quit authority dirty',
  listener.includes("_state.quitAuthorityState = 'dirty'") &&
  listener.includes('active-query-membership-change:') &&
  listener.includes('markQuitComplete(false)') &&
  statusBoundary.includes('window.markQuitAuthorityDirty?.(`${reason}:quit-profile-mutation`)'));
check('current quit tab refreshes authoritatively after membership change',
  listener.includes("window.getCurrentActiveTabId?.() === 'quit'") &&
  listener.includes("ensureQuitProfilesComplete('active-query-membership-current-quit')"));
check('Coach fails closed before quit full-profile authority read',
  quitLoadSegment.includes('if (_isCoachContext(ctx))') &&
  quitLoadSegment.includes("window.RoleReadBoundary?.canMount?.('profiles.quit'") &&
  quitLoadSegment.indexOf('if (_isCoachContext(ctx))') < quitLoadSegment.indexOf('const fbGetDocs = fb.getDocs'));
check('renderQuitIsland ignores cached quit HTML when boundary exists', render.includes('V5R single-render-source lock') && render.includes('if (window.QuitProfileBoundary)') && render.includes("getStudentsCachedHtml('quitRows')") && render.indexOf("getStudentsCachedHtml('quitRows')") > render.indexOf('Standalone legacy fallback only'));
check('legacy tab switch cannot restore cached quit HTML', app.includes('the quit tab must never be restored from legacy tabHtmlCache') && app.includes("QuitProfileBoundary.ensureComplete?.('legacy-switch-tab-quit')"));
check('profile rename updates canonical store immediately', (students.includes('profile-rename-remove-old') && students.includes('profile-rename-merge-new') && students.includes('profile-rename-status-sync')) || (students.includes('StudentStatusCommandBoundary.updateProfile') && statusBoundary.includes('studentProfileStore?.removeProfile') && statusBoundary.includes('studentProfileStore?.mergeProfile') && statusBoundary.includes('_commitRename')));
check('public boundary mirror synced', boundary === pubBoundary);
check('V5R module performs no Firestore IO', !/\b(getDocs|getDoc|onSnapshot|setDoc|updateDoc|deleteDoc)\b/.test(boundary));
check('package exposes V5R checks', pkg.scripts?.['check:v5r-quit-single-source-lock']?.includes('check-v5r-quit-single-source-lock.mjs') && pkg.scripts?.['check:v5r-quit-source-behavior']?.includes('check-v5r-quit-source-behavior.mjs'));
console.log(`\nPASS ${pass}/${pass+fail}`); if(fail) process.exit(1);

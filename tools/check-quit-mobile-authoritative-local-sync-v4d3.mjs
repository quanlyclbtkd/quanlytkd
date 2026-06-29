#!/usr/bin/env node
/** Phase 4K-6V4D3 — Quit Mobile Authoritative Local Sync */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const students = read('js/modules/students.js');
const renderStudents = read('js/ui/render/renderStudents.js');
const profilesListener = read('js/listeners/profiles.listeners.js');
const profileStore = read('js/data/studentProfileStore.js');
const main = read('js/main.js');
const index = read('index.html');

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}

console.log('\n=== Phase 4K-6V4D3 — Quit Mobile Authoritative Local Sync ===\n');
const buildV4D3 = 'quit-mobile-authoritative-local-sync-20260628-v4d3';
const buildV4D4 = 'quit-authoritative-full-sync-20260629-v4d4';
const buildV4D5 = 'coach-attendance-branch-hydration-20260630-v4d6';

check('Cache bust updated for index main module',
  index.includes(`./js/main.js?v=${buildV4D3}`) || index.includes(`./js/main.js?v=${buildV4D4}`) || index.includes(`./js/main.js?v=${buildV4D5}`));
check('Main imports quit/profile/render modules with V4D3 build',
  (main.includes(`./listeners/profiles.listeners.js?v=${buildV4D3}`) || main.includes(`./listeners/profiles.listeners.js?v=${buildV4D4}`) || main.includes(`./listeners/profiles.listeners.js?v=${buildV4D5}`)) &&
  (main.includes(`./ui/render/renderStudents.js?v=${buildV4D3}`) || main.includes(`./ui/render/renderStudents.js?v=${buildV4D4}`) || main.includes(`./ui/render/renderStudents.js?v=${buildV4D5}`)) &&
  (main.includes(`./modules/students.js?v=${buildV4D3}`) || main.includes(`./modules/students.js?v=${buildV4D4}`) || main.includes(`./modules/students.js?v=${buildV4D5}`)));
check('syncStudentStatusLocal writes newly quit profile into studentProfileStore',
  students.includes("studentProfileStore.mergeProfile(key, nextProfile") &&
  students.includes("reason + ':status-local-sync'"));
check('syncStudentStatusLocal keeps a local quit journal that survives active-only snapshots',
  students.includes('window.__store._localQuitProfiles') &&
  students.includes('window.__store._localQuitProfiles[key] = nextProfile') &&
  students.includes('delete window.__store._localQuitProfiles[key]'));
check('syncStudentStatusLocal repaints quit tab immediately when the user is already there',
  students.includes("_tab === 'quit'") &&
  students.includes("renderQuitList({ reason: reason + ':immediate-quit-repaint' })"));
check('renderQuitIsland direct source includes local quit journal before compat fallbacks',
  renderStudents.includes('const localQuit = (window.__store && window.__store._localQuitProfiles) || {}') &&
  renderStudents.includes('Object.assign(merged, storeQuit, localQuit)'));
check('students pagination authoritative quit entries include local quit journal',
  students.includes('const localQuit = (window.__store && window.__store._localQuitProfiles) || {}') &&
  students.includes('Object.assign({}, storeQuit, localQuit)'));
check('Mobile detection covers phones/tablets beyond 767px CSS width',
  renderStudents.includes("'(max-width: 1024px)'") &&
  renderStudents.includes("'(pointer: coarse)'") &&
  students.includes("'(max-width: 1024px)'"));
check('Quit full reconciliation flag is only set true after successful fallback',
  profilesListener.includes("const ok = await loadFullProfilesFallback('quit-tab-authoritative-reconcile:'") &&
  profilesListener.includes('_state.quitCompletenessReconciled = !!ok'));
check('Authoritative quit ensure API exists and uses guarded full fallback',
  profilesListener.includes('export async function ensureQuitProfilesAuthoritative') &&
  (profilesListener.includes("loadFullProfilesFallback('quit-authoritative-mobile:") || profilesListener.includes("loadFullProfilesFallback('quit-authoritative-full-sync:")) &&
  profilesListener.includes('fallbackInProgress'));
check('ensureProfilesForTab retries authoritative quit reconciliation after targeted cache',
  profileStore.includes('ensureQuitProfilesAuthoritative') &&
  profileStore.includes('ensure-quit-tab-authoritative'));
check('Main exposes ensureQuitProfilesAuthoritative globally',
  main.includes('ensureQuitProfilesAuthoritative,') &&
  main.includes('window.ensureQuitProfilesAuthoritative = ensureQuitProfilesAuthoritative'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D3 checks passed.\n');

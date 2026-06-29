#!/usr/bin/env node
/** Phase 4K-6V4D5 — Quit/Coach Authoritative Full Sync (Web + Mobile) */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const main = read('js/main.js');
const profiles = read('js/listeners/profiles.listeners.js');
const statusConfig = read('js/data/profileStatusConfig.js');
const renderStudents = read('js/ui/render/renderStudents.js');
const studentsRenderer = read('js/ui/render/computation/studentsRenderer.js');
const students = read('js/modules/students.js');
const app = read('app.js');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

const build = 'quit-mobile-coach-login-repair-20260629-v4d5';
console.log('\n=== Phase 4K-6V4D5 — Quit/Coach Authoritative Full Sync ===\n');

check('Cache-bust updated for index/app/main V4D5',
  index.includes(`app.js?v=${build}`) && index.includes(`./js/main.js?v=${build}`));
check('Main imports quit-critical modules with V4D5 cache-bust',
  main.includes(`./listeners/profiles.listeners.js?v=${build}`) &&
  main.includes(`./ui/render/renderStudents.js?v=${build}`) &&
  main.includes(`./modules/students.js?v=${build}`));
check('Targeted quit cache is explicitly not considered authoritative',
  profiles.includes('quitTargetedLoaded') &&
  profiles.includes('Do NOT set quitCompletenessReconciled here') &&
  profiles.includes('targeted queries can be partial'));
check('Quit loader only skips when quitLoaded and quitCompletenessReconciled are both true',
  profiles.includes('if (_state.quitLoaded && _state.quitCompletenessReconciled) return true'));
check('Authoritative quit fallback bypasses generic max fallback with its own capped guard',
  profiles.includes('forceQuitAuthoritative') &&
  profiles.includes('maxQuitAuthoritativeFallbackPerSession') &&
  profiles.includes('quitAuthoritativeFallbackCount'));
check('Quit tab reconciliation calls forced authoritative full fallback',
  profiles.includes("loadFullProfilesFallback('quit-tab-authoritative-reconcile:") &&
  profiles.includes('{ forceQuitAuthoritative: true }'));
check('Ensure quit authoritative API uses full-sync reason and forced fallback',
  profiles.includes("loadFullProfilesFallback('quit-authoritative-full-sync:") &&
  profiles.includes('{ forceQuitAuthoritative: true }'));
check('Status classifier covers common legacy Vietnamese quit values including temporary pause/dừng tập',
  ['bao_nghi','tam_nghi','tam_dung','dung_tap'].every(s => statusConfig.includes(s)) &&
  statusConfig.includes("status.includes('dung')") && statusConfig.includes("status.includes('dừng')"));
check('renderQuitIsland renders authoritative full list on web and mobile once loaded',
  renderStudents.includes('quit-island-authoritative-full') &&
  renderStudents.includes('_buildAuthoritativeQuitRows({ mobileFull: true, forceAll: true })'));
check('renderStudents builder never page-limits Đã nghỉ',
  renderStudents.includes('const forceAll = true') && renderStudents.includes('const limit = entries.length'));
check('studentsRenderer disables quit pagination limit and load-more row',
  studentsRenderer.includes('const _quitLimit    = Number.MAX_SAFE_INTEGER') &&
  studentsRenderer.includes('no load-more row for Đã nghỉ'));
check('students pagination control treats quit as full list on web and mobile',
  students.includes('web + mobile both show all quit profiles') &&
  students.includes('const _quitLimit   = _quitEntries.length'));
check('Legacy app.js render also removes quit page limit/load-more',
  app.includes('const _quitLimit     = Number.MAX_SAFE_INTEGER') &&
  app.includes('no load-more row for Đã nghỉ'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D5 checks passed.\n');

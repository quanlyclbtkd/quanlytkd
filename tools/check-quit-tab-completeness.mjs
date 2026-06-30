#!/usr/bin/env node
/** Phase 4K-6V4B2 — Quit Tab Completeness + Name Display */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const profiles = read('js/listeners/profiles.listeners.js');
const renderer = read('js/ui/render/computation/studentsRenderer.js');
const statusConfig = read('js/data/profileStatusConfig.js');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4B2 — Quit Tab Completeness + Name Display ===\n');

check('Quit lazy loader still blocks Coach quit profile reads',
  profiles.includes("canMount?.('profiles.quit'") && profiles.includes('return false;'));
check('Quit lazy loader keeps status query as primary source',
  profiles.includes('status-in-quit') && profiles.includes('getQuitQueryValues()'));
check('Quit lazy loader includes legacy boolean quit signals',
  ['active==false','isActive==false','quit==true','isQuit==true','stopped==true'].every(s => profiles.includes(s)));
check('Quit lazy loader includes quitDate existence signal',
  profiles.includes("label: 'quitDate!=null'") && profiles.includes("field: 'quitDate'"));
check('Quit lazy loader does not accept non-quit documents from broad legacy signals',
  profiles.includes("classifyProfileStatus(data) === 'quit'") && profiles.includes('quitMap[id] = data'));
check('Quit lazy loader records total docs read and per-query diagnostics',
  profiles.includes('docsRead += snap.size') && profiles.includes('queryResults.push') && profiles.includes('queryCount: quitQueries.length'));
check('Quit query failure is per-signal and does not abort the whole load',
  profiles.includes("Quit legacy query lỗi") && profiles.includes('continue') === false && profiles.includes('for (const item of quitQueries)'));
check('Quit list uses full/lazy profile store instead of active pagination currentItems',
  renderer.includes('const useFullProfileQuitRender = buildQuit && fullProfilesCount > 0') &&
  renderer.includes('!useFullProfileQuitRender'));
check('PASS1 renders quit rows even when pagination is enabled if full quit profiles exist',
  renderer.includes('(!pgStudentsActive || useFullProfileQuitRender) && buildQuit'));
check('Quit load-more is full-profile aware or removed because Đã nghỉ renders complete list',
  renderer.includes('if (!pgStudentsActive || useFullProfileQuitRender)') ||
  (renderer.includes('Number.MAX_SAFE_INTEGER') && renderer.includes('no Load More for Đã nghỉ')));
check('Quit row display prefers profile.name/fullName/displayName but keeps doc ID for openProfile',
  renderer.includes('function _profileDisplayName') && renderer.includes('data.name') &&
  renderer.includes('const displayName = _profileDisplayName(name, p)') &&
  renderer.includes("onclick=\"openProfile('${safeNameEsc}')\""));
check('Profile status classifier recognizes legacy quit signals used by loader',
  statusConfig.includes('profile.active === false') && statusConfig.includes('profile.isActive === false') &&
  statusConfig.includes('profile.quit === true') && statusConfig.includes('profile.stopped === true'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4B2 checks passed.\n');

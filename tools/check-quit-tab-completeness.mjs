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
check('Quit loader uses authoritative full sync instead of partial status query',
  profiles.includes('targeted quit queries were the root cause') && profiles.includes('ensureQuitProfilesAuthoritative'));
check('Classifier still recognizes legacy boolean quit signals',
  ['profile.active === false','profile.isActive === false','profile.quit === true','profile.stopped === true'].every(s => statusConfig.includes(s)));
check('Classifier still recognizes quitDate existence signal',
  statusConfig.includes("const _dateQuitFields = ['quitDate'") && statusConfig.includes('ngayNghi'));
check('Full fallback classifies complete collection before rendering quit rows',
  profiles.includes('const _fallbackQuit') && profiles.includes("if (_fKind === 'quit') _fallbackQuit[_fId] = _fData"));
check('Full authoritative quit sync records full fallback read attribution',
  profiles.includes("recordFirestoreReadAttribution('profiles.fullFallbackQuery'") && profiles.includes('forceQuitAuthoritative'));
check('Authoritative quit sync is single-flight and exposes failure metrics',
  profiles.includes('quitAuthoritativePromise') && profiles.includes('quitAuthoritativeLastError'));
check('Quit list uses full/lazy profile store instead of active pagination currentItems',
  renderer.includes('const useFullProfileQuitRender = buildQuit && fullProfilesCount > 0') &&
  renderer.includes('!useFullProfileQuitRender'));
check('PASS1 renders quit rows even when pagination is enabled if full quit profiles exist',
  renderer.includes('(!pgStudentsActive || useFullProfileQuitRender) && buildQuit'));
check('Quit load-more is removed so Đã nghỉ is never page-limited',
  renderer.includes('No load-more row for Đã nghỉ') && renderer.includes('Number.MAX_SAFE_INTEGER'));
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

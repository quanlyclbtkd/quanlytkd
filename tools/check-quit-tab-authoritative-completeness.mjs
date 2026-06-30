#!/usr/bin/env node
/** Phase 4K-6V4B3 — Quit Tab Authoritative Completeness */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const profiles = read('js/listeners/profiles.listeners.js');
const statusConfig = read('js/data/profileStatusConfig.js');
const renderer = read('js/ui/render/computation/studentsRenderer.js');

let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}
console.log('\n=== Phase 4K-6V4B3 — Quit Tab Authoritative Completeness ===\n');

check('Quit loader still blocks Coach quit/full reads',
  profiles.includes("canMount?.('profiles.quit'") && profiles.includes('return false;') &&
  profiles.includes("canMount?.('profiles.full-fallback'"));
check('Classifier treats quitDate/date legacy signals as quit before active flags',
  statusConfig.includes("const _dateQuitFields = ['quitDate'") &&
  statusConfig.indexOf('_dateQuitFields') < statusConfig.indexOf('if (profile.active === true || profile.isActive === true)'));
check('Quit loader queries legacy status aliases such as Đã nghỉ and Nghỉ tập',
  profiles.includes('legacyStatusAliases') && profiles.includes("'Đã nghỉ'") && profiles.includes("'Nghỉ tập'") &&
  profiles.includes('status-alias-in-'));
check('Quit loader queries additional date fields beyond quitDate',
  ['ngayNghi!=null','inactiveDate!=null','stoppedDate!=null','leftDate!=null'].every(s => profiles.includes(s)));
check('Targeted quit loader still filters every result through classifier',
  profiles.includes("classifyProfileStatus(data) === 'quit'") && profiles.includes('quitMap[id] = data'));
check('Existing full/fallback quit profiles are preserved before setting targeted map',
  profiles.includes('getQuitProfiles') && profiles.includes('Object.entries(existingQuit') && profiles.includes('!quitMap[id]'));
check('Admin quit tab runs one authoritative full reconciliation after targeted load',
  profiles.includes('quitCompletenessReconciled') &&
  profiles.includes("loadFullProfilesFallback('quit-tab-authoritative-reconcile:'") &&
  profiles.includes('!_isCoachContext(ctx)'));
check('Full fallback classifies full collection into quitProfiles',
  profiles.includes('const _fallbackQuit') && profiles.includes("if (_fKind === 'quit') _fallbackQuit[_fId] = _fData") &&
  profiles.includes('setQuitProfiles(_fallbackQuit'));
check('Quit renderer uses full profile store and not active pagination when full quit profiles exist',
  renderer.includes('const useFullProfileQuitRender = buildQuit && fullProfilesCount > 0') &&
  renderer.includes('(!pgStudentsActive || useFullProfileQuitRender) && buildQuit'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4B3 checks passed.\n');

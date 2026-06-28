#!/usr/bin/env node
/**
 * Phase 4K-6V4D1A — Active skipped-month + Quit tab regression guard.
 * Ensures monthly "Báo nghỉ" is not classified as permanent quit, while
 * permanent quit aliases still load into the Đã nghỉ tab.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n🔍 Phase 4K-6V4D1A — Active skip / quit regression guard\n');

const build = 'profile-canonical-store-regression-hotfix-20260628-v4d1a';
const version = '4K-6V4D1A-active-skip-quit-regression-hotfix-20260628';
const index = read('index.html');
const main = read('js/main.js');
const statusConfig = read('js/data/profileStatusConfig.js');
const render = read('js/ui/render.js');
const legacy = read('app.js');
const tuition = read('js/core/tuitionDebtCanonical.js');
const store = read('js/core/profileCanonicalStore.js');
const profiles = read('js/listeners/profiles.listeners.js');

check('index/main cache-bust V4D1A', index.includes(`app.js?v=${build}`) && index.includes(`./js/main.js?v=${build}`));
check('APP_PATCH_VERSION is V4D1A', main.includes(`APP_PATCH_VERSION = '${version}'`));
check('profileStatusConfig exposes monthly skip classifier', statusConfig.includes('export function isMonthlySkipStatusValue'));
check('monthly Báo nghỉ returns active before generic nghỉ quit fallback',
  statusConfig.includes('if (isMonthlySkipStatusValue(status)) return \'active\';') &&
  statusConfig.indexOf('if (isMonthlySkipStatusValue(status)) return \'active\';') < statusConfig.indexOf("status.includes('đã nghỉ')"));
check('active=true + Báo nghỉ is not forced quit',
  statusConfig.includes('if (isMonthlySkipStatusValue(_rawQ)) return \'active\';') &&
  !statusConfig.includes("if (_rawQ.includes('nghỉ') || _rawQ.includes('nghi')) return 'quit';"));
check('render skipped section treats selected skipped month as active unless permanent quit',
  render.includes('function _hasPermanentQuitSignal') &&
  render.includes('if (_hasSkippedMonthForSelectedMonth(p, selectedMonth) && !_hasPermanentQuitSignal(p)) return true;') &&
  render.includes('return _hasSkippedMonthForSelectedMonth(profile, selectedMonth) && _isActiveProfileForSkippedSection(profile, selectedMonth);'));
check('legacy app skipped section has same permanent-quit guard',
  legacy.includes('function _legacyHasPermanentQuitSignal') &&
  legacy.includes('if (_legacyHasSkippedMonth(p, selectedMonth) && !_legacyHasPermanentQuitSignal(p)) return true;'));
check('tuitionDebtCanonical no longer classifies bao nghi as permanent quit text',
  tuition.includes('_isMonthlySkipStatusValue') && !tuition.includes('nghi|da nghi|nghi tap|bao nghi'));
check('profileCanonicalStore no longer classifies bao nghi as permanent quit text',
  store.includes('_isMonthlySkipStatusValue') && !store.includes('nghi|da nghi|nghi tap|bao nghi|tam dung'));
check('quit tab targeted aliases include more permanent quit legacy values',
  ['Dừng tập','Ngừng tập','Bỏ tập','Thôi tập'].every(s => profiles.includes(`'${s}'`)) && profiles.includes('status-alias-in-'));
check('quit tab targeted aliases do not include monthly Báo nghỉ',
  !profiles.includes("'Báo nghỉ'") && !profiles.includes("'Bao nghi'") && !profiles.includes("'Báo nghỉ tháng'"));

// Dynamic classifier smoke test without Firestore/browser.
const mod = await import(path.join(root, 'js/data/profileStatusConfig.js'));
check('classifyProfileStatus: Báo nghỉ stays active', mod.classifyProfileStatus({ status: 'Báo nghỉ', skippedMonths: ['2026-06'] }) === 'active');
check('classifyProfileStatus: Báo nghỉ tháng stays active', mod.classifyProfileStatus({ status: 'Báo nghỉ tháng 06/2026' }) === 'active');
check('classifyProfileStatus: Đã nghỉ remains quit', mod.classifyProfileStatus({ status: 'Đã nghỉ' }) === 'quit');
check('classifyProfileStatus: Dừng tập remains quit', mod.classifyProfileStatus({ status: 'Dừng tập' }) === 'quit');
check('classifyProfileStatus: active=false overrides Báo nghỉ', mod.classifyProfileStatus({ status: 'Báo nghỉ', active: false }) === 'quit');

console.log(`\n📊 Results: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);

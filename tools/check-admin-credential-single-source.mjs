/**
 * Phase 4K-6V5U5 — Admin Credential Single Source Gate
 * Firebase Authentication is the only password authority. Firestore may only
 * contain legacy credential fields until explicit SuperAdmin cleanup.
 */
import { readFileSync } from 'fs';
import path from 'path';

const root = process.cwd();
const read = rel => readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const sa = read('js/modules/superadmin.js');
const rules = read('firestore.rules');
const index = read('index.html');
const fbConfig = read('js/firebase/config.js');
let pass = 0, fail = 0;
const check = (label, cond, hint='') => {
  if (cond) { console.log('✅ PASS ', label); pass++; }
  else { console.error('❌ FAIL ', label); if (hint) console.error('       💡', hint); fail++; }
};
const sliceBetween = (src, start, end, max=50000) => {
  const i = src.indexOf(start); if (i < 0) return '';
  const j = end ? src.indexOf(end, i + start.length) : -1;
  return src.slice(i, j >= 0 ? j : i + max);
};

console.log('\n🔐 Phase 4K-6V5U5 — Admin Credential Single Source Gate\n');

const createClub = sliceBetween(app, 'window.createNewClubSystem = async', 'window.switchSATab');
const changePw = sliceBetween(app, 'window.submitChangePassword = async', '//  SUPER ADMIN: GỬI EMAIL');
const forceReplace = sliceBetween(sa, 'window.forceReplaceAdmin = async', '// ════════════════════════════════════════════════════════════\n      // 10. editClubName');
const renderRows = sliceBetween(sa, 'window._renderSAClubRows =', '// ════════════════════════════════════════════════════════════\n      // 8.');
const resetPw = sliceBetween(sa, 'window.saResetAdminPassword = async', '// ════════════════════════════════════════════════════════════\n      // window.SuperAdminModule');
const cleanup = sliceBetween(sa, '_cleanupLegacyAdminCredentials = async', '// ── Phase 4.0B: branch upgrade modal state');

check('createNewClubSystem vẫn dùng Firebase Auth để tạo Admin', /createUserWithEmailAndPassword\(secondaryAuth,\s*email,\s*pass\)/.test(createClub));
check('createNewClubSystem không ghi adminPassword vào Firestore', !/adminPassword\s*:/.test(createClub));
check('createNewClubSystem không echo plaintext password sau khi tạo', !/\$\{\s*pass\s*\}/.test(createClub));
check('createNewClubSystem không ghi password vào local/session storage', !/(localStorage|sessionStorage)\s*\.\s*(setItem|\[)/.test(createClub) || !/pass(word)?/i.test(createClub.match(/(?:localStorage|sessionStorage)[\s\S]{0,180}/)?.[0] || ''));

check('changePW dùng updatePassword(Firebase Auth)', /updatePassword\(user,\s*newPw\)/.test(changePw));
check('changePW không ghi adminPassword/passwordChangedAt', !/adminPassword|passwordChangedAt/.test(changePw));
check('changePW thông báo Firebase Authentication là nguồn thay đổi', /Firebase Authentication/.test(changePw));

check('forceReplaceAdmin vẫn tạo tài khoản bằng Firebase Auth', /createUserWithEmailAndPassword\(secondaryAuth,\s*newEmail,\s*newPass\)/.test(forceReplace));
check('forceReplaceAdmin không ghi adminPassword vào Firestore', !/adminPassword\s*:/.test(forceReplace));
check('forceReplaceAdmin không echo newPass trong confirm/alert template', !/\$\{\s*newPass\s*\}/.test(forceReplace));
check('forceReplaceAdmin không đưa newPass vào DOM/dataset/storage/console', !/(innerHTML|dataset|localStorage|sessionStorage|console\.(?:log|info|debug|warn))[^\n]{0,180}newPass/.test(forceReplace));

check('SuperAdmin renderer không đọc data.adminPassword', !/data\.adminPassword/.test(renderRows));
check('SuperAdmin renderer không còn _safePass', !/_safePass/.test(renderRows));
check('SuperAdmin renderer không còn data-pw', !/data-pw/.test(renderRows));
check('SuperAdmin renderer không còn nút reveal plaintext password', !/(data-pw|_safePass|e\.dataset\.pw|MK:\s*<|••••••|>👁<)/i.test(renderRows));

check('Reset password vẫn dùng sendPasswordResetEmail()', /sendPasswordResetEmail\(auth,\s*adminEmail\)/.test(resetPw));

check('Có maintenance cleanup explicit module-owned', /cleanupLegacyAdminCredentials:\s*_cleanupLegacyAdminCredentials/.test(sa));
check('Không tạo window.cleanupLegacyAdminCredentials global mới', !/window\.cleanupLegacyAdminCredentials\s*=/.test(sa));
check('Cleanup dùng clubDataList đã load', /window\._saClubData\?\.clubDataList/.test(cleanup));
check('Cleanup không query clubs lần hai', !/(getDocs\s*\(|loadSuperAdminData\s*\()/.test(cleanup));
check('Cleanup có confirm explicit', /confirm\s*\(/.test(cleanup));
check('Cleanup dùng writeBatch', /writeBatch\(db\)/.test(cleanup));
check('Cleanup xóa adminPassword bằng deleteField()', /adminPassword:\s*deleteField\(\)/.test(cleanup));
check('Cleanup xử lý passwordChangedAt legacy', /passwordChangedAt/.test(cleanup) && /deleteField\(\)/.test(cleanup));
check('Cleanup không auto-run từ loadSuperAdminData', !/await\s+_cleanupLegacyAdminCredentials\s*\(/.test(sa));

check('Firestore Rules chặn secret mới khi CREATE club', /clubCreateHasNoAdminPasswordSecret/.test(rules) && /allow create:\s*if isSuperAdmin\(\) && clubCreateHasNoAdminPasswordSecret\(\)/.test(rules));
check('Firestore Rules có transition helper cho legacy password', /function clubAdminPasswordTransitionSafe\(\)/.test(rules));
check('Legacy secret unchanged vẫn được transition helper cho phép', /newSecret\s*==\s*oldSecret/.test(rules));
check('Chỉ SuperAdmin được phép chuyển secret về empty/removal', /isSuperAdmin\(\)\s*&&\s*newSecret\s*==\s*''/.test(rules));
check('Club update áp dụng password transition guard', /allow update:\s*if \(isSuperAdmin\(\) \|\| isClubAdmin\(clubId\)\) && clubAdminPasswordTransitionSafe\(\)/.test(rules));

check('index.html expose deleteField trong Firebase bridge', /deleteField/.test(index) && /window\._fb_init/.test(index));
check('js/firebase/config.js expose deleteField', /deleteField/.test(fbConfig));

const runtimeNonMaintenanceRefs = [app, renderRows, forceReplace, changePw, createClub].join('\n');
check('Không còn runtime password Firestore copy ngoài maintenance/rules', !/adminPassword/.test(runtimeNonMaintenanceRefs));

console.log(`\n📊 Kết quả: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
console.log('✅ Admin Credential Single Source Gate PASS.\n');

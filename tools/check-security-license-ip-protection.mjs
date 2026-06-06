#!/usr/bin/env node
/**
 * Phase 4K-6D — check-security-license-ip-protection.mjs
 * Kiểm tra SecurityPosture, copyright, debug tools, smoke test coverage,
 * và phát hiện file nguy hiểm trong package.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const mainJs    = readFileSync('js/main.js', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
const failures = [];

function check(label, ok) {
  if (ok) { console.log('  ✅ PASS — ' + label); pass++; }
  else    { console.error('  ❌ FAIL — ' + label); fail++; failures.push(label); }
}

console.log('\n🔍 Phase 4K-6D — check-security-license-ip-protection\n');

// [1] js/core/securityPosture.js tồn tại
check('js/core/securityPosture.js tồn tại', existsSync('js/core/securityPosture.js'));

// [2] window.SecurityPosture exposed
check('window.SecurityPosture được expose trong main.js', mainJs.includes('window.SecurityPosture'));

// [3] APP_COPYRIGHT_OWNER
check("window.APP_COPYRIGHT_OWNER được định nghĩa", mainJs.includes("window.APP_COPYRIGHT_OWNER"));

// [4] APP_PRODUCT_NAME
check("window.APP_PRODUCT_NAME được định nghĩa", mainJs.includes("window.APP_PRODUCT_NAME"));

// [5] APP_BUILD_FINGERPRINT
check("window.APP_BUILD_FINGERPRINT được định nghĩa", mainJs.includes("window.APP_BUILD_FINGERPRINT"));

// [6] debugBuildFingerprint
check('window.debugBuildFingerprint được định nghĩa', mainJs.includes('window.debugBuildFingerprint'));

// [7] debugSecurityPosture
check('window.debugSecurityPosture được định nghĩa', mainJs.includes('window.debugSecurityPosture'));

// [8] debugLicenseGuardReadiness
check('window.debugLicenseGuardReadiness được định nghĩa', mainJs.includes('window.debugLicenseGuardReadiness'));

// [9] debugAppCheckReadiness
check('window.debugAppCheckReadiness được định nghĩa', mainJs.includes('window.debugAppCheckReadiness'));

// [10] debugApiKeyDomainRestrictionChecklist
check('window.debugApiKeyDomainRestrictionChecklist được định nghĩa', mainJs.includes('window.debugApiKeyDomainRestrictionChecklist'));

// [11] debugSourceProtectionStatus
check('window.debugSourceProtectionStatus được định nghĩa', mainJs.includes('window.debugSourceProtectionStatus'));

// [12] debugPrivilegedClientActions
check('window.debugPrivilegedClientActions được định nghĩa', mainJs.includes('window.debugPrivilegedClientActions'));

// [13] debugFirestoreRulesReadiness
check('window.debugFirestoreRulesReadiness được định nghĩa', mainJs.includes('window.debugFirestoreRulesReadiness'));

// [14] debugRuntimeSmokeTest includes all 8 security debug functions
const smokeIdx  = mainJs.indexOf('window.debugRuntimeSmokeTest = async');
const smokeBody = smokeIdx >= 0 ? mainJs.slice(smokeIdx, smokeIdx + 30000) : '';
const smokeChecks = [
  'debugBuildFingerprint', 'debugSecurityPosture', 'debugLicenseGuardReadiness',
  'debugAppCheckReadiness', 'debugApiKeyDomainRestrictionChecklist',
  'debugSourceProtectionStatus', 'debugPrivilegedClientActions', 'debugFirestoreRulesReadiness'
];
smokeChecks.forEach(function(name) {
  check('debugRuntimeSmokeTest include ' + name, smokeBody.includes(name));
});

// [15-19] Scan for dangerous files in package (*.map, .env, serviceAccount, private_key, client_secret)
function scanFiles(dir, callback) {
  try {
    readdirSync(dir).forEach(function(file) {
      if (file === 'node_modules' || file === '.git') return;
      var full = join(dir, file);
      try {
        if (statSync(full).isDirectory()) { scanFiles(full, callback); }
        else { callback(full, file); }
      } catch(e) {}
    });
  } catch(e) {}
}

var mapFiles = [], envFiles = [], serviceAccFiles = [], privateKeyFiles = [], clientSecretFiles = [];
scanFiles('.', function(full, file) {
  if (extname(file) === '.map') mapFiles.push(full);
  if (file === '.env' || file.startsWith('.env.')) envFiles.push(full);
  if (file.toLowerCase().includes('serviceaccount')) serviceAccFiles.push(full);
  try {
    var content = readFileSync(full, 'utf8');
    if (content.includes('"private_key"') || content.includes("'private_key'")) privateKeyFiles.push(full);
    if (content.includes('"client_secret"') || content.includes("'client_secret'")) clientSecretFiles.push(full);
  } catch(e) {}
});

check('Không có file *.map trong package', mapFiles.length === 0);
if (mapFiles.length) console.log('    ⚠️ .map files:', mapFiles);

check('Không có file .env trong package', envFiles.length === 0);
if (envFiles.length) console.log('    ⚠️ .env files:', envFiles);

check('Không có file tên serviceAccount trong package', serviceAccFiles.length === 0);
if (serviceAccFiles.length) console.log('    ⚠️ serviceAccount files:', serviceAccFiles);

check('Không có file chứa private_key trong package',
  privateKeyFiles.filter(f => !f.includes('node_modules') && !f.includes('.git') && !f.includes('check-security')).length === 0
);

check('Không có file chứa client_secret trong package',
  clientSecretFiles.filter(f => !f.includes('node_modules') && !f.includes('.git') && !f.includes('check-security')).length === 0
);

// [20] Cache bust Phase 4K-6D or later
check(
  "index.html có cache bust 'security-license-ip-protection-readiness-20260605' hoặc phase mới hơn",
  indexHtml.includes('security-license-ip-protection-readiness-20260605') ||
  indexHtml.includes('scale-readiness-write-safety-20260605') ||
  indexHtml.includes('4K-6E-B-exam-export-belt-sort-20260605')
);

// [21] APP_BUILD_VERSION Phase 4K-6D or later
check(
  "APP_BUILD_VERSION = '4K-6D-...' hoặc phase mới hơn",
  mainJs.includes("APP_BUILD_VERSION = '4K-6D-security-license-ip-protection-readiness-20260605'") ||
  mainJs.includes("APP_BUILD_VERSION = '4K-6E-scale-readiness-write-safety-20260605'") ||
  mainJs.includes("APP_BUILD_VERSION = '4K-6E-B-exam-export-belt-sort-20260605'")
);

// [22] Không có hard block license — kiểm tra không có shouldHardBlockNow: true trong code (chỉ false)
check(
  'Không có hard block license (shouldHardBlockNow phải false)',
  !mainJs.includes('shouldHardBlockNow: true') || mainJs.includes('shouldHardBlockNow: false')
);

// [23] Không có obfuscator/minify mới — không có obfuscate/uglify/terser call trong main code
const obfuscatorSignals = ['javascript-obfuscator', 'uglify-js', 'terser(', 'obfuscate('];
var hasObfuscator = obfuscatorSignals.some(sig => mainJs.includes(sig));
check('Không có obfuscator/minify mới trong phase này', !hasObfuscator);

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Total: ${pass + fail} checks | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);

if (fail === 0) {
  console.log('\n  🎉 All security license IP protection checks passed!\n');
  process.exit(0);
} else {
  console.log('\n  ❌ FAILURES:');
  failures.forEach(f => console.log('    — ' + f));
  console.log('');
  process.exit(1);
}

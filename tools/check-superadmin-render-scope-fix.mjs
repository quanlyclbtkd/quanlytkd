// tools/check-superadmin-render-scope-fix.mjs — Phase 4K-6I-E
import { readFileSync } from 'fs';
let passes = 0, failures = 0;
function check(cond, pass, fail) {
  if (cond) { console.log('  ✓ PASS:', pass); passes++; }
  else { console.log('  ✗ FAIL:', fail); failures++; }
}
function readFile(p) {
  const path = new URL('../' + p, import.meta.url).pathname;
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}
console.log('══════════════════════════════════════════════════════');
console.log(' check-superadmin-render-scope-fix — Phase 4K-6I-E');
console.log('══════════════════════════════════════════════════════');
console.log();
const sa = readFile('js/modules/superadmin.js');
const main = readFile('js/main.js');
const index = readFile('index.html');
const pkg = readFile('package.json');
check(sa && sa.includes('function _saFmtRevenueShort') && sa.includes('function _saFmtRevenueFull'), 'module-level SuperAdmin revenue formatters exist', 'missing module-level _saFmtRevenueShort/_saFmtRevenueFull');
check(sa && sa.includes('window.__saRenderScopeFix = true'), 'render scope fix marker is present', 'missing __saRenderScopeFix marker');
check(sa && sa.includes('debugSuperAdminRenderScopeFix'), 'debugSuperAdminRenderScopeFix defined', 'missing debugSuperAdminRenderScopeFix');
check(sa && sa.includes('const revenueShortDisplay = _saFmtRevenueShort(revenueTotal)') && sa.includes('const revenueFullDisplay = _saFmtRevenueFull(revenueTotal)'), '_renderSAClubRows uses module-level formatters', '_renderSAClubRows may still use scoped _fmtRevenueShort/_fmtRevenueFull');
check(!(sa && /const\s+revenueShortDisplay\s*=\s*_fmtRevenueShort\(/.test(sa)), '_renderSAClubRows no longer calls scoped _fmtRevenueShort', '_renderSAClubRows still calls scoped _fmtRevenueShort');
check(!(sa && /const\s+revenueFullDisplay\s*=\s*_fmtRevenueFull\(/.test(sa)), '_renderSAClubRows no longer calls scoped _fmtRevenueFull', '_renderSAClubRows still calls scoped _fmtRevenueFull');
check(main && main.includes('debugSuperAdminRenderScopeFix'), 'debugRuntimeSmokeTest includes debugSuperAdminRenderScopeFix', 'runtime smoke missing debugSuperAdminRenderScopeFix');
check(main && main.includes('4K-6I-E-superadmin-render-scope-fix'), 'APP_BUILD_VERSION updated to 4K-6I-E', 'APP_BUILD_VERSION not updated to 4K-6I-E');
check(index && index.includes('superadmin-render-scope-fix-20260607'), 'index.html cache bust updated to 4K-6I-E', 'index.html cache bust not updated to 4K-6I-E');
check(pkg && pkg.includes('check:superadmin-render-scope-fix'), 'package.json includes check:superadmin-render-scope-fix', 'package.json missing check:superadmin-render-scope-fix');
console.log();
console.log('══════════════════════════════════════════════════════');
if (failures === 0) console.log(' ✓ check-superadmin-render-scope-fix PASSED');
else { console.log(` ✗ check-superadmin-render-scope-fix FAILED — ${failures} failure${failures !== 1 ? 's' : ''}`); process.exit(1); }
console.log('══════════════════════════════════════════════════════');

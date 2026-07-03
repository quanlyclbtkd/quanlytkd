import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const files = {
  index: read('index.html'),
  main: read('js/main.js'),
  superadmin: read('js/modules/superadmin.js'),
  publicSuperadmin: read('public/js/modules/superadmin.js'),
  quitParity: read('tools/check-quit-tab-mobile-parity.mjs'),
  attendanceShift: read('tools/check-attendance-shift-filter.mjs'),
  pkg: read('package.json'),
};
const pkg = JSON.parse(files.pkg);
const build = 'given-name-priority-search-unification-20260703-v5g';
const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });

check('V5E cache-bust active in index/app/main',
  files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`) && files.main.includes(`modules/superadmin.js?v=${build}`));
check('SuperAdmin monthStats has explicit null-safe guard',
  files.superadmin.includes('const _monthStatsSafe = monthStats ? monthStats : null') && files.superadmin.includes('Never dereference monthStats'));
check('SuperAdmin revenue display still uses derived safe revenue values',
  files.superadmin.includes('revenueShortDisplay') && files.superadmin.includes('revenueFullDisplay') && !files.superadmin.includes('Lỗi tải dữ liệu. Bạn cần quyền Super Admin!'));
check('public superadmin mirror synced',
  files.publicSuperadmin.includes('4K-6V5F') && files.publicSuperadmin.includes('const _monthStatsSafe = monthStats ? monthStats : null'));
check('check:all includes SuperAdmin monthStats guard',
  pkg.scripts['check:all']?.includes('check:superadmin-monthstats'));
check('check:all includes SuperAdmin hotfix guard',
  pkg.scripts['check:all']?.includes('check:superadmin-hotfix'));
check('check:all includes DB ready guard',
  pkg.scripts['check:all']?.includes('check:db-ready-guards'));
check('main check includes V5E guard',
  pkg.scripts.check?.includes('check:v5e-audit-gate-superadmin-hardening'));
check('quit tab mobile parity gate accepts current build',
  files.quitParity.includes(`const build = '${build}'`));
check('attendance shift filter gate accepts nextCache filtered load',
  files.attendanceShift.includes('nextCache\\[_id\\]'));

let failed = 0;
for (const c of checks) {
  if (c.ok) console.log('PASS', c.name);
  else { console.error('FAIL', c.name); failed++; }
}
if (failed) {
  console.error(`\n[check-v5e-audit-gate-superadmin-hardening] FAILED ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`\n[check-v5e-audit-gate-superadmin-hardening] PASS ${checks.length}/${checks.length}`);

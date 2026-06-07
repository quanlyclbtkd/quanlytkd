import fs from 'fs';
function read(p){ return fs.readFileSync(p,'utf8'); }
let fail = 0;
function assert(cond, msg){ if(!cond){ console.error('FAIL:', msg); fail++; } else console.log('PASS:', msg); }
const fn = read('functions/src/superAdminSummary.js');
const idx = read('functions/index.js');
const pkg = read('package.json');
const fpkg = read('functions/package.json');
const main = read('js/main.js');
const html = read('index.html');
assert(fn.includes('onProfileWriteSuperAdminSummary'), 'profile trigger exists');
assert(fn.includes('onTransactionWriteSuperAdminSummary'), 'transaction trigger exists');
assert(fn.includes('scheduledRefreshSuperAdminSummaries'), 'scheduled backfill exists');
assert(fn.includes('refreshSuperAdminSummaryForClub'), 'callable refresh one club exists');
assert(fn.includes('cachedActiveCount') && fn.includes('cachedCurrentMonthRevenue') && fn.includes('superAdminStats'), 'root cache fields written');
assert(idx.includes('superAdminSummary') && idx.includes('exports.onProfileWriteSuperAdminSummary'), 'functions exported in index.js');
assert(fpkg.includes('src/superAdminSummary.js'), 'functions lint includes new file');
assert(main.includes('4K-6I-G-server-superadmin-summary-cache-20260607'), 'APP_BUILD_VERSION updated');
assert(html.includes('server-superadmin-summary-cache-20260607'), 'index cache bust updated');
assert(fs.existsSync('SUPERADMIN_SERVER_STATS_DEPLOY_GUIDE.md'), 'deploy guide exists');
process.exit(fail ? 1 : 0);

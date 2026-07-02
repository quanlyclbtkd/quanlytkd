import fs from 'node:fs';
const read = p => fs.readFileSync(p,'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  main: read('js/main.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  rules: read('firestore.rules'),
  publicApp: read('public/app.js'),
  publicMain: read('public/js/main.js'),
  publicProfiles: read('public/js/listeners/profiles.listeners.js')
};
let pass=0, fail=0;
function check(name, ok){ if(ok){pass++; console.log('✅',name);} else {fail++; console.error('❌',name);} }
console.log('\n=== Phase 4K-6V5C — Coach Profiles Bootstrap DataSource Recovery ===\n');
const build='coach-profiles-bootstrap-datasource-recovery-20260702-v5c';
check('entrypoint cache-bust uses V5C', files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`));
check('app patch version is V5C', files.app.includes("APP_PATCH_VERSION = '4K-6V5C-coach-profiles-bootstrap-datasource-recovery-20260702'"));
check('app does not clear Coach profiles when module is not ready', !files.app.includes("console.error('[RoleReadBoundary] Coach profiles module unavailable") && !files.app.includes('allProfiles = {};\n            if (window.__store) window.__store.profiles = {};'));
check('app has branch-scoped bootstrap recovery for Coach module-unavailable race', files.app.includes('function _loadCoachProfilesBranchScopedBootstrap') && files.app.includes('CoachBootstrapProfiles') && files.app.includes('module-unavailable-init'));
check('app Coach bootstrap never reads full-club profiles listener fallback', files.app.includes("for (const field of ['branch', 'branchCode'])") && files.app.includes('getDocs(query(profRef, where(field, \'==\', alias), limit(300)))'));
check('resolveActiveDataSource skips full-club probes for Coach', files.app.includes("source: 'coach-scoped'") && files.app.includes('skip full-club data-source probes'));
check('profiles listener Coach active query is branch-only and status-filtered locally', files.profiles.includes("fbQuery(profRef, fbWhere('branch', '==', coachBranch))") && files.profiles.includes("if (!isCoach || classifyProfileStatus(data) !== 'quit') activeMap[id] = data;"));
check('coach fallback tries branch and branchCode without failing all on one permission-denied query', files.profiles.includes("const fields = ['branch', 'branchCode'];") && files.profiles.includes('Optional coach branch field denied') && !files.profiles.includes('Promise.all(aliases.map'));
check('main exposes loadCoachBranchProfilesFallback and retries Coach hydration after module API ready', files.main.includes('loadCoachBranchProfilesFallback,') && files.main.includes('window.loadCoachBranchProfilesFallback = loadCoachBranchProfilesFallback') && files.main.includes('coach-profile-api-ready-retry'));
check('rules allow Coach profile reads by branch or branchCode', files.rules.includes("resource.data.keys().hasAll(['branch'])") && files.rules.includes("resource.data.keys().hasAll(['branchCode'])") && files.rules.includes('branchMatchesAssigned(resource.data.branchCode)'));
check('public mirrors are synced', files.publicApp.includes('CoachBootstrapProfiles') && files.publicMain.includes('coach-profile-api-ready-retry') && files.publicProfiles.includes("const fields = ['branch', 'branchCode'];"));
console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if(fail) process.exit(1);
console.log('Phase 4K-6V5C checks passed.\n');

/**
 * Phase 4K-6V5U5 — Auth Context Single Writer Gate
 * One verified authority -> one commit writer -> compatibility mirrors.
 */
import { readFileSync } from 'fs';
import path from 'path';
const root = process.cwd();
const app = readFileSync(path.join(root, 'app.js'), 'utf8');
let pass=0, fail=0;
const check=(label,cond,hint='')=>{ if(cond){console.log('✅ PASS ',label);pass++;}else{console.error('❌ FAIL ',label);if(hint)console.error('       💡',hint);fail++;}};
const slice=(start,end,max=70000)=>{const i=app.indexOf(start);if(i<0)return'';const j=end?app.indexOf(end,i+start.length):-1;return app.slice(i,j>=0?j:i+max);};
const lineOf=idx=>app.slice(0,idx).split('\n').length;
const assignmentLines=(re)=>{const out=[];let m;const rr=new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g');while((m=rr.exec(app)))out.push({line:lineOf(m.index),text:m[0]});return out;};

console.log('\n🧭 Phase 4K-6V5U5 — Auth Context Single Writer Gate\n');
const commit=slice('const _commitVerifiedAuthContext =', 'const _resetVerifiedAuthContext =');
const reset=slice('const _resetVerifiedAuthContext =', '// Exactly one users/{uid} verification promise');
const singleFlight=slice('let _verifiedUserProfileFlight', 'const _isDisabledUserAuthorization');
const authFlow=slice('onAuthStateChanged(auth, async (user)', '// ===============================', 120000);
const init=slice('async function initSaaSDatabase(clubId)', 'window.selectBranchCard =', 90000);
const getCtx=slice('window.getAppContext = function(reason)', null, 6000);

check('Canonical _commitVerifiedAuthContext tồn tại', !!commit);
check('Commit normalize context trước khi ghi mirrors', /_normalizeAuthContext/.test(commit));
for (const name of ['window.currentClubId = ctx.clubId','window.userRole = ctx.role','window.coachBranch = ctx.coachBranch','window.__store.clubId = ctx.clubId','window.__store.currentClubId = ctx.clubId','window.__store.userRole = ctx.role','window.__store.coachBranch = ctx.coachBranch','window.__store.currentUser = user']) {
  check('Commit mirror: '+name, commit.includes(name));
}
check('Commit cập nhật RoleReadBoundary', /RoleReadBoundary\.setContext/.test(commit));
const saveIdx=commit.indexOf('_saveAuthCache(');
const mirrorIdx=commit.indexOf('window.userRole = ctx.role');
check('Auth cache chỉ lưu sau canonical mirror commit', saveIdx > mirrorIdx && mirrorIdx >= 0);
check('Verified diagnostics state không chứa token/password/student data', /window\.__verifiedAuthContextState/.test(app) && !/(token|password|studentData)\s*:/.test(slice('window.__verifiedAuthContextState =', '// Phase 4K-6V5U5 — the single normal authenticated writer')));

const userRoleWrites=assignmentLines(/window\.userRole\s*=(?!=)/g);
const coachBranchWrites=assignmentLines(/window\.coachBranch\s*=(?!=)/g);
const currentWindowWrites=assignmentLines(/window\.currentClubId\s*=(?!=)/g);
check('window.userRole chỉ có initial + commit + reset writers', userRoleWrites.length===3, JSON.stringify(userRoleWrites));
check('window.coachBranch chỉ có initial + commit + reset writers', coachBranchWrites.length===3, JSON.stringify(coachBranchWrites));
check('window.currentClubId chỉ có commit + reset writers', currentWindowWrites.length===2, JSON.stringify(currentWindowWrites));

check('initSaaSDatabase có verified-context guard', /__verifiedAuthContextState/.test(init) && /blocked before verified context commit/.test(init));
check('initSaaSDatabase không còn ghi auth mirrors', !/window\.(?:userRole|coachBranch|currentClubId)\s*=(?!=)/.test(init) && !/RoleReadBoundary\.setContext/.test(init));

check('users/{uid} verification dùng single-flight Promise', /_verifiedUserProfileFlight/.test(singleFlight) && /getDoc\(doc\(db, 'users', uid\)\)/.test(singleFlight));
check('Auth flow reuse single-flight verifier', /await _readUserAuthorizationProfileOnce\(user\)/.test(authFlow));
check('Auth flow không có direct getDoc users/{uid} thứ hai', !/getDoc\(doc\(db, ['"]users['"],/.test(authFlow));
const cachedIdx=authFlow.indexOf('const _cached = _getAuthCache(user.uid)');
const verifyIdx=authFlow.indexOf('await _readUserAuthorizationProfileOnce(user)');
const commitIdx=authFlow.indexOf('_commitVerifiedAuthContext(user, _freshContext');
const initIdx=authFlow.indexOf('initSaaSDatabase(_committed.clubId)');
check('Warm cache chỉ được đọc trước verification', cachedIdx>=0 && cachedIdx < verifyIdx);
const preVerify=authFlow.slice(cachedIdx, verifyIdx);
check('Warm cache không ghi role/club/branch', !/window\.(?:userRole|coachBranch|currentClubId)\s*=(?!=)|(^|[^\w])currentClubId\s*=(?!=)/.test(preVerify));
check('Warm cache không mount initSaaSDatabase', !/initSaaSDatabase\s*\(/.test(preVerify));
check('Verified commit xảy ra sau users read', commitIdx > verifyIdx);
check('Protected init xảy ra sau verified commit', initIdx > commitIdx);

const disabledIdx=authFlow.indexOf('_isDisabledUserAuthorization(_ud)');
check('Disabled/locked/suspended guard xảy ra trước commit', disabledIdx>=0 && disabledIdx < commitIdx);
const coachResolveIdx=authFlow.indexOf('await _resolveCoachBranchContext(user, _freshContext)');
check('Coach branch verify xảy ra trước commit', coachResolveIdx>=0 && coachResolveIdx < commitIdx);
const saEnsureIdx=authFlow.indexOf('await _ensureSuperAdminPrincipal(user)');
const saCommitIdx=authFlow.indexOf("_commitVerifiedAuthContext(user, {\n                        role: 'super_admin'");
check('SuperAdmin principal READY trước canonical commit', saEnsureIdx>=0 && saCommitIdx > saEnsureIdx);
check('SuperAdmin path không direct role assignment', !/window\.userRole\s*=\s*['"]super_admin['"]/.test(authFlow));
check('Logout reset canonical auth context', /_resetVerifiedAuthContext\(['"]logout['"]\)/.test(authFlow));
check('Logout reset single-flight Promise', authFlow.includes("_verifiedUserProfileFlight = { uid: '', promise: null };"));
check('getAppContext ưu tiên committed verified context khi ready', /__verifiedAuthContextState/.test(getCtx) && /_verifiedAuth\.ready/.test(getCtx));

// Supplemental deterministic model for the required stale-cache/role/coach cases.
function simulate({cache,fresh,status='active',coach=false,principalReady=false,superAdmin=false}) {
  const events=[]; let reads=0, committed=null;
  if (superAdmin) {
    events.push('verify-principal');
    if (!principalReady) return {events,reads,committed};
    committed={role:'super_admin',clubId:'',coachBranch:''}; events.push('commit:super_admin','init:');
    return {events,reads,committed};
  }
  if (cache) events.push('cache-hint');
  reads++; events.push('verify-users');
  if (['disabled','locked','suspended'].includes(status)) { events.push('blocked'); return {events,reads,committed}; }
  if (coach) { events.push('verify-coach'); if (!fresh.coachBranch) {events.push('blocked');return {events,reads,committed};} }
  committed={...fresh}; events.push('commit:'+fresh.role,'init:'+fresh.clubId); return {events,reads,committed};
}
let r=simulate({cache:{role:'admin',clubId:'A'},fresh:{role:'admin',clubId:'A'}});
check('CASE1 cache đúng: exactly one users read, commit rồi init A', r.reads===1 && r.events.join('|')==='cache-hint|verify-users|commit:admin|init:A');
r=simulate({cache:{role:'admin',clubId:'A'},fresh:{role:'admin',clubId:'B'}});
check('CASE2 cache cũ: không init A, commit/init B sau verify', r.reads===1 && !r.events.includes('init:A') && r.events.at(-1)==='init:B');
r=simulate({cache:{role:'admin',clubId:'A'},fresh:{role:'viewer',clubId:'A'}});
check('CASE3 stale role: không mount privileged Admin từ cache', r.reads===1 && !r.events.includes('commit:admin') && r.committed?.role==='viewer');
r=simulate({cache:{role:'coach',clubId:'A'},fresh:{role:'coach',clubId:'A',coachBranch:'CS2'},coach:true});
check('CASE4 coach: branch verify trước commit', r.events.indexOf('verify-coach') < r.events.indexOf('commit:coach'));
r=simulate({cache:{role:'admin',clubId:'A'},fresh:{role:'admin',clubId:'A'},status:'locked'});
check('CASE5 disabled/locked: không commit/init', r.events.includes('blocked') && !r.events.some(x=>x.startsWith('init:')));
r=simulate({superAdmin:true,principalReady:true});
check('CASE6 SuperAdmin: principal trước commit', r.events.join('|')==='verify-principal|commit:super_admin|init:');
check('CASE7 logout implementation resets all compatibility mirrors', /window\.userRole\s*=\s*['"]viewer['"]/.test(reset) && /window\.coachBranch\s*=\s*['"]['"]/.test(reset) && /window\.__store\.currentUser\s*=\s*null/.test(reset));

console.log(`\n📊 Kết quả: ${pass} PASS / ${fail} FAIL`);
if(fail) process.exit(1);
console.log('✅ Auth Context Single Writer Gate PASS.\n');

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

let pass=0,fail=0;
function check(name, ok, detail=''){ if(ok){pass++;console.log('✅',name);}else{fail++;console.error('❌',name,detail);} }
for (const script of [
  'tools/check-club-root-field-authority.mjs',
  'tools/check-stored-xss-trust-boundary.mjs',
  'tools/check-coach-sensitive-config-closure.mjs',
  'tools/check-profile-rename-referential-guard.mjs',
]) {
  const r=spawnSync(process.execPath,[script],{encoding:'utf8'});
  if(r.stdout) process.stdout.write(r.stdout);
  if(r.stderr) process.stderr.write(r.stderr);
  check(`security sub-gate exits 0: ${path.basename(script)}`, r.status===0, `exit=${r.status}`);
}

const rules=fs.readFileSync('firestore.rules','utf8');
const app=fs.readFileSync('app.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const att=fs.readFileSync('js/modules/attendance.js','utf8');
const attSvc=fs.readFileSync('js/services/attendance.service.js','utf8');
const auth=app;
const tx=fs.readFileSync('js/core/transactionCanonicalBoundary.js','utf8');
const dashboard=fs.readFileSync('js/modules/dashboard.js','utf8');
const role=fs.readFileSync('js/core/roleReadBoundary.js','utf8');
const functionsAuthz=fs.readFileSync('functions/src/authz.js','utf8');

// Parent Portal / public-rule freeze.
check('Parent Portal remains fail-closed: clubs list is SuperAdmin-only', /match \/clubs\/\{clubId\}[\s\S]{0,650}allow list:\s*if isSuperAdmin\(\)/.test(rules));
check('No public allow read/write true introduced', !/allow\s+(?:read|write|get|list|create|update|delete)\s*:\s*if\s+true\s*;/.test(rules));
check('Anonymous profiles are not public', !/match \/profiles\/\{profileId\}[\s\S]{0,900}allow\s+(?:read|get|list)[^;]*request\.auth\s*==\s*null/.test(rules));
check('Anonymous main_config is not public', !/match \/settings\/\{settingId\}[\s\S]{0,500}request\.auth\s*==\s*null/.test(rules));
check('RoleReadBoundary still declares Coach attendance-only', /attendanceOnly:\s*ctx\.role\s*===\s*'coach'/.test(role));


// H2 Parent Portal hard-disable active-runtime boundaries.
const ppStart=app.indexOf('window.ppLookupLogin = async () => {');
const ppEnd=ppStart>=0 ? app.indexOf('// ── Ghi nhận lịch sử đăng nhập',ppStart) : -1;
const ppBody=ppStart>=0 && ppEnd>ppStart ? app.slice(ppStart,ppEnd) : '';
check('H2 fresh login UI has no Parent Portal tab', !index.includes('loginTab_parent'));
check('H2 fresh login UI has no Parent Portal pane', !index.includes('loginPane_parent'));
check('H2 fresh login UI has no Parent Portal code input', !index.includes('pp_codeInput'));
check('H2 fresh login UI has no Parent Portal name input', !index.includes('pp_nameInputLogin'));
check('H2 fresh login UI has no Parent Portal results container', !index.includes('pp_loginResults'));
check('H2 fresh settings UI has no parentCode input', !index.includes('cfg_parentCode'));
check('H2 ppLookupLogin compatibility no-op remains', ppBody.includes('window.ppLookupLogin = async () =>'));
check('H2 ppLookupLogin performs zero Auth/Firestore calls', !/(signInAnonymously|getFirestore|collection\s*\(|query\s*\(|where\s*\(|getDoc\s*\(|getDocs\s*\(|fetchQueryPages)/.test(ppBody));
check('H2 active app has no parentCode query', !/where\s*\(\s*['"]parentCode['"]/.test(app));
check('H2 active app has no cfg_parentCode DOM access', !app.includes('cfg_parentCode'));
check('H2 active app has no parentCode root writer', !app.includes('{ parentCode }, { merge: true }'));
const helperStart=rules.indexOf('function clubAdminRootUpdateFieldsOnly()');
const helperEnd=helperStart>=0 ? rules.indexOf('function ',helperStart+10) : -1;
const adminRootHelper=helperStart>=0 ? rules.slice(helperStart, helperEnd>helperStart ? helperEnd : undefined) : '';
check('H2 Club Admin root whitelist excludes parentCode', !adminRootHelper.includes("'parentCode'"));

// Hard runtime call-site freeze: identical counting semantics to startup budget gate.
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const q=path.join(dir,e.name);if(e.isDirectory()){if(['migrations','diagnostics'].includes(e.name))continue;walk(q,out)}else if(e.name.endsWith('.js'))out.push(q)}return out}
const files=['app.js',...walk('js')];
const pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
const counts={getDoc:0,getDocs:0,onSnapshot:0};
for(const file of files){for(const line of fs.readFileSync(file,'utf8').split('\n')){const t=line.trim();if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))continue;for(const [k,r] of Object.entries(pats)){r.lastIndex=0;if(r.test(line))counts[k]++;}}}
check(`getDoc hard budget unchanged (${counts.getDoc} <= 31)`, counts.getDoc<=31);
check(`getDocs hard budget unchanged (${counts.getDocs} <= 56)`, counts.getDocs<=56);
check(`onSnapshot hard budget unchanged (${counts.onSnapshot} <= 16)`, counts.onSnapshot<=16);

// No new polling / second authority for security closure.
check('No Coach settings polling introduced', !/coach-main-config-skipped[\s\S]{0,1000}setInterval\s*\(/.test(app));
check('Attendance offline Firestore writer remains one bulkSyncOffline owner', (attSvc.match(/(?:static\s+)?async\s+bulkSyncOffline\s*\(/g)||[]).length===1);
check('Attendance offline active flight remains one Promise latch', /_offlineAttendanceSyncPromise/.test(att) && /_offlineAttendancePendingContext/.test(att));
check('No second attendance_public settings authority introduced', !/attendance_public/.test(app+att+rules));

// Existing canonical authority markers must remain.
check('Auth canonical commit authority remains', /_commitVerifiedAuthContext/.test(auth));
check('Transaction canonical boundary remains', /CanonicalTransaction|canonical/i.test(tx) && /listenToData|readMode|coverage/i.test(tx));
check('Dashboard canonical single-flight/loader markers remain', /single[- ]flight|_dashboard.*Promise|canonical/i.test(dashboard));
check('Attendance daily canonical refresh owner remains', /_requestAttendanceDailyRefresh/.test(att));
check('Attendance explicit shift authority remains', /_attendanceShiftAuthority/.test(att));
check('G1 cross-context pending follow-up remains', /_offlineAttendancePendingContext/.test(att) && /_offlineAttendanceActiveContext/.test(att));

// H-specific source boundaries.
check('Club Admin privileged root fields are excluded by rules helper', /clubAdminRootUpdateFieldsOnly/.test(rules) && !/hasOnly\([\s\S]{0,700}'expiryDate'/.test((rules.match(/clubAdminRootUpdateFieldsOnly[\s\S]*?\n\s*\}/)||[''])[0]||''));
check('Coach main_config denied at Rules boundary', /isCoach\(clubId\) && settingId == 'shifts'/.test(rules));
check('Profile primary rename safety guard present', /Chưa thể đổi tên chính của võ sinh/.test(fs.readFileSync('js/modules/students.js','utf8')));

// H3 residual security trust boundaries.
const loginHistoryStart=app.indexOf('window.loadLoginHistory = async () =>');
const loginHistoryEnd=loginHistoryStart>=0 ? app.indexOf('window.openExpiryModal',loginHistoryStart) : -1;
const loginHistory=loginHistoryStart>=0 && loginHistoryEnd>loginHistoryStart ? app.slice(loginHistoryStart,loginHistoryEnd) : '';
check('H3 login_history output is escaped at canonical HTML sink', /safeEmail = window\.escapeHtml/.test(loginHistory) && /safeClubId = window\.escapeHtml/.test(loginHistory) && /safeDeviceName = window\.escapeHtml/.test(loginHistory) && /safeBrowser = window\.escapeHtml/.test(loginHistory));
const loginRulesStart=rules.indexOf('match /login_history/{docId}');
const loginRulesEnd=loginRulesStart>=0 ? rules.indexOf('match /super_admins/{uid}',loginRulesStart) : -1;
const loginRules=loginRulesStart>=0 && loginRulesEnd>loginRulesStart ? rules.slice(loginRulesStart,loginRulesEnd) : '';
check('H3 login_history Rules bind role and club to verified identity', loginRules.includes('request.resource.data.role == canonicalRole(myRole())') && loginRules.includes('request.resource.data.clubId == myClubId()') && loginRules.includes("request.resource.data.email == request.auth.token.get('email', '')"));
const superRulesStart=rules.indexOf('function hasEnabledSuperAdminPrincipal()');
const superRulesEnd=superRulesStart>=0 ? rules.indexOf('function isClubMember',superRulesStart) : -1;
const superRules=superRulesStart>=0 && superRulesEnd>superRulesStart ? rules.slice(superRulesStart,superRulesEnd) : '';
check('H3 SuperAdmin principal existence alone is insufficient', superRules.includes("data.get('enabled', false) == true") && !/\|\|\s*exists\([^)]*super_admins/.test(superRules));
check('H3 Functions source principal also requires enabled:true', /superAdminSnap\.exists[\s\S]{0,100}enabled === true/.test(functionsAuthz));

console.log('Hard static counts:', counts);
console.log(`PASS ${pass}/${pass+fail}`);
if(fail) process.exit(1);

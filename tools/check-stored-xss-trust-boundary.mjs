#!/usr/bin/env node
import fs from 'node:fs';
import { escapeHtml } from '../js/utils/helpers.js';

let pass=0, fail=0;
function check(name, ok, detail=''){ if(ok){pass++;console.log('✅',name);}else{fail++;console.error('❌',name,detail);} }
const read = p => fs.readFileSync(p,'utf8');
const sa=read('js/modules/superadmin.js');
const att=read('js/modules/attendance.js');
const app=read('app.js');
const fin=read('js/ui/render/computation/financeRenderer.js');
const inv=read('js/modules/inventory.js');
const students=read('js/modules/students.js');
const studentRenderer=read('js/ui/render/computation/studentsRenderer.js');
const format=read('js/utils/format.js');

const fixtures = [
  '<img src=x onerror="window.__xss=1">',
  '"><svg onload="window.__xss=2">',
  '</div><img src=x onerror="window.__xss=3">',
  "O'Brien", '"Test Club"', '<>&"\''
];
for (const input of fixtures) {
  const out=escapeHtml(input);
  check(`escapeHtml fixture is inert: ${input.slice(0,22)}`, !/[<>]/.test(out) && !/<(?:img|svg|script)/i.test(out), out);
}
check('escapeHtml preserves apostrophe as display-safe entity', escapeHtml("O'Brien") === 'O&#039;Brien');
check('escapeHtml escapes full HTML special set', escapeHtml('<>&"\'') === '&lt;&gt;&amp;&quot;&#039;');

const saRender = sa.slice(sa.indexOf('listEl.innerHTML = clubDataList.map'), sa.indexOf('// ── Mobile card', sa.indexOf('listEl.innerHTML = clubDataList.map')) + 7000);
check('SuperAdmin clubName display uses canonical escapeHtml', /const _safeCname = escapeHtml\(cname\)/.test(saRender) && /\$\{_safeCname\}/.test(saRender));
check('SuperAdmin adminEmail display uses canonical escapeHtml', /const _safeEmail = escapeHtml\(email\)/.test(saRender) && /\$\{_safeEmail\}/.test(saRender));
check('SuperAdmin inline actions receive canonical club token, not clubName/email', /_cidToken/.test(saRender) && !/openExpiryModal\([^\n]*_safeCname/.test(saRender) && !/saResetAdminPassword\([^\n]*_safeEmail/.test(saRender));
check('SuperAdmin club token is URI-encoded for inline JS context', /encodeURIComponent\(/.test(sa) && /replace\(\/'\/g,\s*'%27'\)/.test(sa));

check('Attendance coach names escaped before branch-summary innerHTML', /data\.coaches\.map\(escapeHtml\)/.test(att) && /escapeHtml\(n\.coach\)/.test(att));
check('Attendance coach note escaped and pre-line preserved', /white-space:pre-line;[^`]*\$\{pfx\}\$\{escapeHtml\(n\.note\)\}/.test(att));
check('Attendance card profile name/nickname/belt use canonical escapeHtml', /_safeNameHtml = escapeHtml\(name\)/.test(att) && /_safeNicknameHtml = escapeHtml\(_nickname\)/.test(att) && /_safeBeltHtml = escapeHtml\(beltShort\)/.test(att));
check('Attendance monthly profile name is escaped and inline JS gets URI token', /_nameToken=encodeURIComponent/.test(att) && /\$\{escapeHtml\(r\.name\)\}/.test(att));

check('Admin session note renderer escapes coachName/note/branch', /escapeHtml[^\n]*coachName|window\.escapeHtml[^\n]*coachName/.test(app) && /escapeHtml[^\n]*data\.note|window\.escapeHtml[^\n]*data\.note/.test(app));
check('Admin notification renderer escapes notePreview', /escapeHtml[^\n]*notePreview|window\.escapeHtml[^\n]*notePreview/.test(app));
check('Transaction descriptions escaped at both canonical and legacy render boundaries', /_escHtml\(tx\.description\)/.test(fin) && /window\.escapeHtml\(String\(t\.description/.test(app));
check('Inventory category display text escaped', /escapeHtml\(cat\.name\)/.test(inv) && /window\.escapeHtml\(String\(cat\.name/.test(app));
check('Student debt display names escaped', /escapeHtml\(d\.name\)/.test(students) && /window\.escapeHtml\(String\(d\.name/.test(app));
check('Student active-row display/name metadata escaped', /safeDisplay = escapeHtml\(_disp\(name\)\)/.test(studentRenderer) && /escapeHtml\(p\.nickname\)/.test(studentRenderer));
check('Belt badge text escapes canonical value', /escapeHtml\(belt\)/.test(format) && /const safeBelt = window\.escapeHtml/.test(app));
check('Exam profile name display escapes HTML', /window\.escapeHtml\(String\(name \|\| ''\)\)/.test(app));
check('Known raw SuperAdmin P0 render patterns absent', !/\$\{cname\}/.test(saRender) && !/title="\$\{email\}"/.test(saRender));
check('Known raw Coach-note P0 pattern absent', !/\$\{n\.note\}/.test(att) && !/\$\{n\.coach\}/.test(att));

const loginHistoryStart=app.indexOf('window.loadLoginHistory = async () =>');
const loginHistoryEnd=loginHistoryStart>=0 ? app.indexOf('window.openExpiryModal',loginHistoryStart) : -1;
const loginHistory=loginHistoryStart>=0 && loginHistoryEnd>loginHistoryStart ? app.slice(loginHistoryStart,loginHistoryEnd) : '';
check('login_history email is escaped before innerHTML', /safeEmail = window\.escapeHtml\(String\(item\.email/.test(loginHistory) && /\$\{safeEmail\}/.test(loginHistory));
check('login_history clubId is escaped before innerHTML', /safeClubId = window\.escapeHtml\(String\(item\.clubId/.test(loginHistory) && /\$\{safeClubId\}/.test(loginHistory));
check('login_history deviceName is escaped before innerHTML', /safeDeviceName = window\.escapeHtml\(String\(item\.deviceName/.test(loginHistory) && /\$\{safeDeviceName\}/.test(loginHistory));
check('login_history os is escaped before innerHTML', /safeOs = window\.escapeHtml\(String\(item\.os/.test(loginHistory) && /\$\{safeOs\}/.test(loginHistory));
check('login_history browser is escaped before innerHTML', /safeBrowser = window\.escapeHtml\(String\(item\.browser/.test(loginHistory) && /\$\{safeBrowser\}/.test(loginHistory));
check('login_history filterClub is escaped before innerHTML', /safeFilterClub = window\.escapeHtml\(String\(filterClub/.test(loginHistory) && /safeFilterClub/.test(loginHistory));
const loginGuideStart=app.indexOf('function _showLoginHistoryRulesGuide');
const loginGuideEnd=loginGuideStart>=0 ? app.indexOf('window.loadLoginHistory',loginGuideStart) : -1;
const loginGuide=loginGuideStart>=0 && loginGuideEnd>loginGuideStart ? app.slice(loginGuideStart,loginGuideEnd) : '';
check('login_history error guide uses canonical escapeHtml for error/uid/email', /safeErrorMsg = window\.escapeHtml/.test(loginGuide) && /safeUid = window\.escapeHtml/.test(loginGuide) && /safeEmail = window\.escapeHtml/.test(loginGuide));
check('login_history raw Firestore display interpolations are absent', !/\$\{item\.(?:email|clubId|os|browser)(?:\s*\|\||\})/.test(loginHistory) && !/\$\{item\.deviceName\}/.test(loginHistory) && !/\+ filterClub/.test(loginHistory));
const revenueStart=app.indexOf('window.loadSARevenue = async () =>');
const revenueEnd=revenueStart>=0 ? app.indexOf('// ═══ PARENT PORTAL RETIRED',revenueStart) : -1;
const revenue=revenueStart>=0 && revenueEnd>revenueStart ? app.slice(revenueStart,revenueEnd) : '';
check('SuperAdmin revenue clubName is escaped before innerHTML', /safeClubName = window\.escapeHtml\(String\(r\.cname/.test(revenue) && /safeClubName/.test(revenue));
check('SuperAdmin revenue clubId is escaped before innerHTML', /safeClubId = window\.escapeHtml\(String\(r\.cid/.test(revenue) && /safeClubId/.test(revenue));
check('SuperAdmin revenue error message is escaped before innerHTML', /safeRevenueError = window\.escapeHtml\(String\(e\?\.message/.test(revenue) && /safeRevenueError/.test(revenue));
check('SuperAdmin revenue raw club/error HTML concatenations are absent', !/\+ r\.(?:cname|cid) \+/.test(revenue) && !/\+ e\.message \+/.test(revenue));

console.log(`PASS ${pass}/${pass+fail}`);
if(fail) process.exit(1);

#!/usr/bin/env node
import fs from 'node:fs';
let pass=0,fail=0; const c=(n,x,d='')=>x?(pass++,console.log('✅',n)):(fail++,console.error('❌',n,d));
const app=fs.readFileSync('app.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const role=fs.readFileSync('js/core/roleReadBoundary.js','utf8');
const start=app.indexOf("const settingsRef = doc(db, \"clubs\", clubId, \"settings\", \"main_config\")");
const end=app.indexOf('// [Phase 3.6C] invStats listener', start);
const block=app.slice(start,end);
c('Coach attendance-only runtime role captured before settings mount', /_coachAttendanceOnlyRuntime[\s\S]*isCoachAttendanceOnly/.test(block));
c('Coach branch completes settings-ready without main_config snapshot', /if \(_coachAttendanceOnlyRuntime\)[\s\S]*coach-main-config-skipped[\s\S]*_completeSettingsReady\(\{ skipped: true/.test(block));
c('main_config onSnapshot is only in non-Coach else path', /if \(_coachAttendanceOnlyRuntime\)[\s\S]*else if \(window\.safeRegisterSnapshot\)[\s\S]*onSnapshot\(settingsRef/.test(block));
c('settings-ready event lifecycle is preserved', /app:settings-ready/.test(block) && /coach-attendance-only/.test(block));
c('Coach startup does not getDoc(settingsRef)', !/getDoc\s*\(\s*settingsRef\s*\)/.test(block));
c('Rules deny Coach main_config and allow only shifts', /isCoach\(clubId\)\s*&&\s*settingId\s*==\s*'shifts'/.test(rules) && !/isCoach\(clubId\)[^;]{0,160}main_config/.test(rules));
c('Coach has no settings list permission', /allow list:\s*if isSuperAdmin\(\) \|\| isAdminOrViewer\(clubId\)/.test(rules));
for (const domain of ['transactions.month','inventory.stats','inventory.history','debt.coverage','exam.settings']) c(`RoleReadBoundary still blocks Coach financial domain ${domain}`, role.includes(`'${domain}'`));
c('No attendance_public projection/source introduced', !/attendance_public/.test(app + rules));
console.log(`PASS ${pass}/${pass+fail}`); if(fail)process.exit(1);

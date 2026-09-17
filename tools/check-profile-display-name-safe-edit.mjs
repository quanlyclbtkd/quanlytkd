#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

let pass=0, fail=0;
function check(name, ok, detail='') { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name, detail); } }
const read = p => fs.readFileSync(p, 'utf8');
const students = read('js/modules/students.js');
const boundary = read('js/core/studentStatusCommandBoundary.js');
const store = read('js/core/profileCanonicalStore.js');
const search = read('js/core/studentSearchIndex.js');
const app = read('app.js');
const renderer = read('js/ui/render/computation/studentsRenderer.js');
const attendance = read('js/modules/attendance.js');
const service = read('js/services/students.service.js');
const finance = read('js/modules/finance.js');
const reports = read('js/modules/reports.js');

const u0=students.indexOf('window.updateProfile = async () =>');
const u1=students.indexOf('window.deleteProfile = async', u0);
const update=students.slice(u0,u1);
const o0=students.indexOf('window.openProfile = (name) =>');
const o1=students.indexOf('window.updateProfile = async', o0);
const open=students.slice(o0,o1);

check('N1/N4 openProfile keeps immutable key in m_old_name', /m_old_name'\)\.value\s*=\s*profileKey/.test(open));
check('N1/N4 openProfile resolves editable display label', /m_name_input'\)\.value\s*=\s*_resolveDisplayName\(profileKey, p\)/.test(open));
check('N2/N5 update writes displayName only on same canonical key', /displayName:\s*requestedDisplayName/.test(update) && /oldName:\s*profileKey[\s\S]{0,100}newName:\s*profileKey/.test(update));
check('N2/N21 no rename/create/delete profile path in display edit', !/renameWithBatch|createProfile|deleteProfile|writeBatch\s*\(/.test(update));
check('N6 no Attendance history migration from display edit', !/AttendanceService|attendance\//.test(update));
check('N6 no historical transaction rewrite from display edit', !/findTransactionsByStudent|txUpdates|newDesc/.test(update));
check('legacy renameWithBatch retained but unreachable from display edit', /renameWithBatch/.test(service) && !/renameWithBatch/.test(update));
check('N7/N8 Attendance doc identity still profileKey/name based', /getAttendanceDocId\(name, writeDate, writeShiftId\)/.test(attendance) && /currentAttendanceData\[name\]/.test(attendance));
check('N7 Daily Attendance visible label resolves current profile', /_attDisplayName\(name, p\)/.test(attendance));
check('N9 Monthly Attendance keeps r.name action token', /_nameToken=encodeURIComponent\(String\(r\.name/.test(attendance) && /showAttMemberHistory\(decodeURIComponent/.test(attendance));
check('N9 Monthly Attendance visible label resolves current displayName', /resolveDisplayName\?\.\(r\.name, _mProfile\)/.test(attendance) && /resolveDisplayName\?\.\(r\.name, _dtProfile\)/.test(attendance));
check('N10 debt row label uses profile display resolver', /_disp\(_profileDisplayName\(name, p\)\)/.test(renderer));
check('N10/N12 debt actions retain profileKey', /openQuickPayModal\('\$\{safeNameEsc\}'/.test(renderer) && /generateMultiMonthPaymentRequest\('\$\{safeNameEsc\}'/.test(renderer));
check('N15 quit/restore action retains profileKey', /renderQuitRow[\s\S]*openProfile\('\$\{safeNameEsc\}'\)/.test(renderer));
check('N16 search entry prefers displayName', /profile\.displayName \|\| profile\.name/.test(search));
check('N19 search tokens preserve immutable id/profileKey', /id, name, p\.displayName/.test(search));
check('N17/N18 search still indexes code + phone fields', /_codeFields/.test(search) && /_phoneFields/.test(search));
check('N20 same profile update invalidates RAM search index', /StudentSearchIndex\?\.invalidate/.test(boundary) && /_dataVersion/.test(boundary));
check('N13 Exam canonical identity remains profileId=profileKey', /profileId:\s*name/.test(app) && /profileId:\s*name/.test(finance));
check('N13 new Exam visible labels use displayName', /studentName:\s*_examDisplayName/.test(app) && /profileName:\s*_examDisplayName/.test(app) && /studentName:\s*displayName/.test(finance) && /profileName:\s*displayName/.test(finance));
check('N13 Exam UI displays resolved name but actions retain profileKey', /examDisplayName/.test(app) && /openProfile\('\$\{safeName\}'\)/.test(app) && /quickCollectExam\('\$\{safeName\}'\)/.test(app));
check('N13 Exam ledger prioritizes exact profileId before visible label', /String\(t\.profileId \|\| t\.studentId \|\| ''\)\.trim\(\)/.test(app));
check('Report/export labels resolve displayName without changing roster key', /resolveReportDisplayName/.test(reports) && /roster\[name\]/.test(reports));

check('resolver is pure and displayName-first', /function resolveDisplayName\(profileKey, profile\)/.test(store) && /p\.displayName \|\| p\.name \|\| p\.fullName \|\| p\.studentName \|\| profileKey/.test(store));
check('resolver adds zero Firestore reads/writes/listeners', !/\bgetDoc(?:s)?\s*\(|\bonSnapshot\s*\(|\bsetDoc\s*\(|\bupdateDoc\s*\(/.test(store));

const helperStart=app.indexOf('function normalizeSearchText');
const helperEnd=app.indexOf('window.buildStudentSearchIndex = window.buildStudentSearchIndex || buildStudentSearchIndex;', helperStart);
if (helperStart>=0 && helperEnd>helperStart) {
  const ctx={}; vm.createContext(ctx); vm.runInContext(app.slice(helperStart,helperEnd)+';this.build=buildStudentSearchIndex;',ctx);
  const out=ctx.build({displayName:'Nguyễn Văn Anh',name:'Nguyễn Văn A',memberId:'HV001',phone:'0901234567'},'Nguyễn Văn A');
  check('N16 dynamic searchName follows displayName', out.searchName === 'nguyen van anh');
  check('N17 dynamic memberId remains indexed', out.searchCode === 'hv001');
  check('N18 dynamic phone remains indexed', out.searchPhone === '0901234567');
}

console.log(`PASS ${pass}/${pass+fail}`);
if (fail) process.exit(1);

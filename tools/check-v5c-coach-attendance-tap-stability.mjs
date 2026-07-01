import fs from 'fs';

const files = {
  attendance: 'js/modules/attendance.js',
  attendancePublic: 'public/js/modules/attendance.js',
  rules: 'firestore.rules',
  publicRules: 'public/firestore.rules',
  app: 'app.js',
  main: 'js/main.js',
  index: 'index.html'
};
let failures = 0;
function read(path) { return fs.readFileSync(path, 'utf8'); }
function ok(condition, message) {
  if (!condition) { failures++; console.error('❌ ' + message); }
  else console.log('✅ ' + message);
}
const att = read(files.attendance);
const attPub = read(files.attendancePublic);
const rules = read(files.rules);
const rulesPub = read(files.publicRules);
const app = read(files.app);
const main = read(files.main);
const index = read(files.index);

for (const [label, src] of [['attendance', att], ['public attendance', attPub]]) {
  ok(src.includes('data-att-doc-id="') && src.includes('dataset.attDocId'), label + ' uses stable attendance doc id on cards');
  ok(src.includes('function _findAttCardByDocId') && src.includes('function _resolveAttCard'), label + ' updates DOM by stable docId rather than only render index');
  ok(src.includes('function _resolveCurrentAttendanceEntry') && src.includes('getAttendanceDocId(n, _attCurrentDate'), label + ' resolves clicked card back to the current entry by docId');
  ok(src.includes('const currentStatus = _attendanceCache[docId] ?? window.currentAttendanceData[name] ?? 0'), label + ' reads current status from docId cache first');
  ok(src.includes('_setAttCardStatus(idx, newStatus, docId)') && src.includes('_setAttCardSaving(idx, true, docId)'), label + ' toggles/saving state with docId-stable DOM targeting');
  ok(src.includes('data-att-status-label="1"'), label + ' status label is located inside the stable card');
  ok(src.includes('const _ATT_TOGGLE_ORDER = Object.freeze([0, 1, 3, 2])'), label + ' preserves coach-friendly cycle without changing storage codes');
}
for (const [label, src] of [['rules', rules], ['public rules', rulesPub]]) {
  ok(src.includes('resourceAttendanceLegacyBranchRepairable'), label + ' includes legacy attendance branch repair helper');
  ok(src.includes('coachCanUpdateAttendanceResource') && src.includes('requestBranchMatchesCoach()'), label + ' lets coach repair only with assigned branch request');
  ok(src.includes('allow update: if isSuperAdmin()') && src.includes('isCoach(clubId) && coachCanUpdateAttendanceResource()'), label + ' update rule uses coach legacy repair boundary');
  ok(src.includes('allow get, list: if isSuperAdmin()') && src.includes('resourceBranchMatchesCoach()'), label + ' read rule remains branch scoped');
}
ok(app.includes('4K-6V5C-coach-attendance-tap-stability-20260701'), 'app version marker updated to V5C');
ok(main.includes('4K-6V5C-coach-attendance-tap-stability-20260701'), 'main version marker updated to V5C');
ok(index.includes('coach-attendance-tap-stability-20260701-v5c'), 'index cache bust updated to V5C');
if (failures) {
  console.error(`\n${failures} V5C checks failed.`);
  process.exit(1);
}
console.log('\n✅ V5C coach attendance tap stability checks passed.');

import fs from 'fs';

const files = {
  attendance: 'js/modules/attendance.js',
  attendancePublic: 'public/js/modules/attendance.js',
  main: 'js/main.js',
  app: 'app.js',
  index: 'index.html',
};

let failures = 0;
function read(path) { return fs.readFileSync(path, 'utf8'); }
function ok(condition, message) {
  if (!condition) { failures++; console.error('❌ ' + message); }
  else console.log('✅ ' + message);
}

const att = read(files.attendance);
const attPub = read(files.attendancePublic);
const main = read(files.main);
const app = read(files.app);
const index = read(files.index);

for (const [label, src] of [['attendance', att], ['public attendance', attPub]]) {
  ok(src.includes('Phase 4K-6V5C: Coach attendance queued tap fix'), label + ' carries V5C patch marker');
  ok(src.includes('const _attQueuedStatusByDocId = new Map()'), label + ' keeps queued tap status by attendance document');
  ok(src.includes('function _getLocalAttendanceStatus(name, docId)'), label + ' reads pending/local status before toggling again');
  ok(src.includes('function _applyLocalAttendanceStatus(name, docId, status, idx'), label + ' applies optimistic local status immediately');
  ok(src.includes('function _persistAttendanceStatus(name, p, docId, status)'), label + ' centralizes attendance record persistence');
  ok(src.includes('while (true)') && src.includes('_attQueuedStatusByDocId.get(docId)') && src.includes('continue;'), label + ' drains queued taps sequentially instead of ignoring them');
  ok(src.includes('if (_isAttendanceWriteLocked(docId))') && src.includes('_attQueuedStatusByDocId.set(docId, newStatus)'), label + ' queues tap while a write is in flight');
  ok(src.includes('data-att-docid=') && src.includes('data-att-label-docid='), label + ' renders stable document identity on cards and labels');
  ok(src.includes('_findAttCard(idx, meta)') && src.includes('_findAttLabel(idx, meta)'), label + ' updates current card even after render reorder');
  ok(!src.includes('pointer-events:none;opacity:0.72'), label + ' no longer disables taps while saving');
  ok(src.includes('const _ATT_TOGGLE_ORDER = Object.freeze([0, 1, 3, 2])'), label + ' preserves correct cycle 0→1→3→2');
}

ok(app.includes('4K-6V5C-coach-attendance-toggle-queue-fix-20260701'), 'app version marker updated to V5C');
ok(main.includes('4K-6V5C-coach-attendance-toggle-queue-fix-20260701'), 'main version marker updated to V5C');
ok(index.includes('coach-attendance-toggle-queue-fix-20260701-v5c'), 'index cache-bust updated to V5C');

if (failures) {
  console.error(`\n${failures} V5C checks failed.`);
  process.exit(1);
}
console.log('\n✅ V5C coach attendance toggle queue fix checks passed.');

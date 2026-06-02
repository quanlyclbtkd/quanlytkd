/**
 * tools/check-firestore-indexes.mjs — Phase 4J-9
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra firestore.indexes.json không rỗng và deploy-ready.
 *
 * Chạy: node tools/check-firestore-indexes.mjs
 * Hoặc: npm run check:firestore-indexes
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

let pass = 0;
let fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.error('  ❌ ' + label);
        if (hint) console.error('     → ' + hint);
        fail++;
        errors.push(label);
    }
}

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4J-9 — Firestore Indexes Readiness Check');
console.log('══════════════════════════════════════════════════════════\n');

// ── Section 1: firestore.indexes.json ────────────────────────────────
console.log('▸ Section 1: firestore.indexes.json');
const raw = readFile('firestore.indexes.json');
check('firestore.indexes.json exists', !!raw, 'Tạo file firestore.indexes.json');
let parsed = null;
if (raw) {
    try {
        parsed = JSON.parse(raw);
        check('File là valid JSON', true);
    } catch(e) {
        check('File là valid JSON', false, 'JSON parse error: ' + e.message);
    }
    if (parsed) {
        check('indexes array tồn tại', Array.isArray(parsed.indexes), 'Thêm mảng "indexes" vào file');
        check('indexes không rỗng (production-scale phase)',
            parsed.indexes && parsed.indexes.length > 0,
            'Thêm composite indexes từ FIRESTORE_INDEXES.md — production deploy yêu cầu indexes đầy đủ');
        if (parsed.indexes && parsed.indexes.length > 0) {
            const txIdx  = parsed.indexes.filter(i => i.collectionGroup === 'transactions');
            const profIdx = parsed.indexes.filter(i => i.collectionGroup === 'profiles');
            const attIdx = parsed.indexes.filter(i => i.collectionGroup === 'attendance');
            check('Có index cho transactions',  txIdx.length  > 0, 'Thêm index: transactions(branch+txMonth+timestamp)');
            check('Có index cho profiles',      profIdx.length > 0, 'Thêm index: profiles(status+branch+createdAt)');
            check('Có index cho attendance',    attIdx.length  > 0, 'Thêm index: attendance(date+shiftId)');
            check('Có index searchName hoặc searchPhone',
                parsed.indexes.some(i => i.fields && i.fields.some(f =>
                    f.fieldPath === 'searchName' || f.fieldPath === 'searchPhone')),
                'Thêm index server-side search: profiles(searchName ASC) và profiles(searchPhone ASC)');
            check('Có index cho isOwed (debt query)',
                parsed.indexes.some(i => i.fields && i.fields.some(f => f.fieldPath === 'isOwed')),
                'Thêm index: profiles(status+isOwed+branch) cho query nợ học phí');
            check('Có index transactions date range (SA revenue)',
                txIdx.some(i => i.fields && i.fields.some(f => f.fieldPath === 'date')),
                'Thêm index: transactions(date ASC, timestamp ASC) cho SuperAdmin revenue pagination');
        }
    }
}
console.log();

// ── Section 2: FIRESTORE_INDEXES.md tồn tại ──────────────────────────
console.log('▸ Section 2: FIRESTORE_INDEXES.md');
const md = readFile('FIRESTORE_INDEXES.md');
check('FIRESTORE_INDEXES.md tồn tại', !!md, 'Tạo FIRESTORE_INDEXES.md với danh sách indexes');
console.log();

// ── Section 3: firebase.json firestore config ─────────────────────────
console.log('▸ Section 3: firebase.json — Firestore indexes config');
const fbRaw = readFile('firebase.json');
if (fbRaw) {
    let fb = null;
    try { fb = JSON.parse(fbRaw); } catch(_) {}
    if (fb) {
        check('firebase.json có firestore.indexes config',
            fb.firestore && fb.firestore.indexes === 'firestore.indexes.json',
            'Thêm "indexes": "firestore.indexes.json" vào phần firestore trong firebase.json');
        check('firebase.json có firestore.rules config',
            fb.firestore && !!fb.firestore.rules,
            'Thêm "rules": "firestore.rules" vào phần firestore trong firebase.json');
    }
}
console.log();

// ── Section 4: Cache headers deploy-friendly ──────────────────────────
console.log('▸ Section 4: firebase.json — Cache Headers');
if (fbRaw) {
    const _jsNoCache  = fbRaw.includes('"**/*.@(js|mjs)"') && fbRaw.includes('"no-cache, must-revalidate"');
    const _cssNoCache = fbRaw.includes('"**/*.css"')       && fbRaw.includes('"no-cache, must-revalidate"');
    check('JS không còn no-cache, must-revalidate toàn bộ',  !_jsNoCache,
        'Sửa firebase.json: JS/CSS nên dùng public, max-age=3600 thay vì no-cache');
    check('CSS không còn no-cache, must-revalidate toàn bộ', !_cssNoCache,
        'Sửa firebase.json: CSS nên dùng public, max-age=3600 thay vì no-cache');
    check('index.html vẫn giữ no-cache',
        fbRaw.includes('index.html') && fbRaw.includes('no-cache'),
        'index.html phải giữ no-cache để user nhận bản mới ngay sau deploy');
}
console.log();

// ── Final Summary ─────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Firestore indexes deploy-ready!');
    console.log('  Để deploy indexes: firebase deploy --only firestore:indexes');
    console.log('══════════════════════════════════════════════════════════\n');
}

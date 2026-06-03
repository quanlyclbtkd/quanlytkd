/**
 * tools/backfill-student-search-index.mjs — Phase 4.0B-4J-8A (Phase 4)
 * ─────────────────────────────────────────────────────────────────────────
 * Backfill searchName / searchPhone / searchCode cho profile võ sinh cũ.
 *
 * MẶC ĐỊNH: Chỉ DRY-RUN (không ghi Firestore).
 *
 * Dry-run (xem sẽ update gì):
 *   node tools/backfill-student-search-index.mjs --project quanly-tst --clubId <clubId>
 *
 * Ghi thật (bắt buộc --execute + --confirm):
 *   node tools/backfill-student-search-index.mjs \
 *     --project quanly-tst \
 *     --clubId <clubId> \
 *     --execute \
 *     --confirm "BACKFILL SEARCH INDEX <clubId>"
 *
 * Flags:
 *   --project   Firebase project ID (bắt buộc)
 *   --clubId    Club document ID (bắt buộc)
 *   --execute   Cho phép ghi Firestore (mặc định: false)
 *   --confirm   Phải khớp "BACKFILL SEARCH INDEX <clubId>" khi dùng --execute
 *   --limit     Giới hạn số profile để test (mặc định: không giới hạn)
 *   --pageSize  Số profile mỗi lần đọc (mặc định: 300)
 * ─────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import { readFileSync }        from 'fs';
import { resolve, dirname }    from 'path';
import { fileURLToPath }       from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

// ── Parse CLI args ───────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
            args[key] = val;
        }
    }
    return args;
}

const args = parseArgs(process.argv);

const PROJECT  = args.project;
const CLUB_ID  = args.clubId;
const EXECUTE  = args.execute === true || args.execute === 'true';
const CONFIRM  = args.confirm || '';
const LIMIT    = args.limit  ? parseInt(args.limit, 10) : Infinity;
const PAGE_SIZE = args.pageSize ? parseInt(args.pageSize, 10) : 300;
const BATCH_CAP = 450; // Firestore batch write max

if (!PROJECT || !CLUB_ID) {
    console.error('\n❌ Thiếu tham số bắt buộc!\n');
    console.error('Cú pháp:');
    console.error('  node tools/backfill-student-search-index.mjs --project <projectId> --clubId <clubId>');
    console.error('\nVí dụ:');
    console.error('  node tools/backfill-student-search-index.mjs --project quanly-tst --clubId CLB001\n');
    process.exit(1);
}

if (EXECUTE) {
    const expectedConfirm = `BACKFILL SEARCH INDEX ${CLUB_ID}`;
    if (CONFIRM !== expectedConfirm) {
        console.error('\n❌ EXECUTE mode yêu cầu --confirm chính xác!\n');
        console.error(`   Cần: --confirm "${expectedConfirm}"`);
        console.error(`   Nhận: --confirm "${CONFIRM}"\n`);
        process.exit(1);
    }
}

// ── Search index helpers (không dùng module import để tránh path issues) ────

function removeVietnameseTones(str) {
    if (!str) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function normalizeSearchText(value) {
    return removeVietnameseTones(String(value || ''))
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizePhone(value) {
    return String(value || '').replace(/[^\d]/g, '');
}

function buildStudentSearchIndex(profile, docId) {
    const name  = profile?.name || docId || '';
    const phone = profile?.phone || profile?.parentPhone || profile?.phoneNumber || '';
    const code  = profile?.studentCode || profile?.memberId || profile?.code || '';

    const sName  = normalizeSearchText(name);
    const sPhone = normalizePhone(phone);
    const sCode  = normalizeSearchText(code);

    return {
        searchName:     sName,
        searchPhone:    sPhone,
        searchCode:     sCode,
        searchKeywords: [sName, sPhone, sCode].filter(Boolean),
    };
}

function needsUpdate(profile, idx, docId) {
    if (!profile.searchName && idx.searchName)  return true;
    if (!profile.searchPhone && idx.searchPhone) return true;
    if (!profile.searchCode  && idx.searchCode)  return true;
    if (profile.searchName  !== idx.searchName)  return true;
    if (profile.searchPhone !== idx.searchPhone) return true;
    if (profile.searchCode  !== idx.searchCode)  return true;
    return false;
}

// ── Init Firebase Admin ──────────────────────────────────────────────────────

let db;
try {
    // Thử đọc service account từ GOOGLE_APPLICATION_CREDENTIALS
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath) {
        const cred = JSON.parse(readFileSync(credPath, 'utf8'));
        initializeApp({ credential: cert(cred), projectId: PROJECT });
    } else {
        // Application Default Credentials (gcloud auth application-default login)
        const { applicationDefault } = await import('firebase-admin/app');
        initializeApp({ credential: applicationDefault(), projectId: PROJECT });
    }
    db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
} catch (initErr) {
    console.error('\n❌ Không thể khởi tạo Firebase Admin SDK:', initErr.message);
    console.error('\nHướng dẫn:');
    console.error('  1. Đặt GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json>');
    console.error('  hoặc');
    console.error('  2. Chạy: gcloud auth application-default login\n');
    process.exit(1);
}

// ── Main logic ───────────────────────────────────────────────────────────────

const MODE = EXECUTE ? '🔴 EXECUTE (sẽ ghi Firestore)' : '🟡 DRY-RUN (chỉ xem, KHÔNG ghi)';

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Backfill Student Search Index — Phase 4.0B-4J-8A');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Project : ${PROJECT}`);
console.log(`  Club ID : ${CLUB_ID}`);
console.log(`  Mode    : ${MODE}`);
console.log(`  PageSize: ${PAGE_SIZE}`);
if (isFinite(LIMIT)) console.log(`  Limit   : ${LIMIT}`);
console.log('══════════════════════════════════════════════════════════\n');

const profilesCol = db.collection(`clubs/${CLUB_ID}/profiles`);

let scanned    = 0;
let wouldUpdate = 0;
let updated    = 0;
let skipped    = 0;
let errors     = 0;
let lastDoc    = null;
let done       = false;

while (!done) {
    let q = profilesCol.orderBy('__name__').limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const docsToUpdate = [];

    for (const docSnap of snap.docs) {
        if (scanned >= LIMIT) { done = true; break; }
        scanned++;

        const profile = docSnap.data();
        const docId   = docSnap.id;
        const idx     = buildStudentSearchIndex(profile, docId);

        if (needsUpdate(profile, idx, docId)) {
            wouldUpdate++;
            docsToUpdate.push({ ref: docSnap.ref, idx });
        } else {
            skipped++;
        }
    }

    // Batch write (chỉ khi EXECUTE)
    if (EXECUTE && docsToUpdate.length > 0) {
        for (let i = 0; i < docsToUpdate.length; i += BATCH_CAP) {
            const chunk = docsToUpdate.slice(i, i + BATCH_CAP);
            const batch = db.batch();
            for (const { ref, idx } of chunk) {
                batch.update(ref, {
                    searchName:     idx.searchName,
                    searchPhone:    idx.searchPhone,
                    searchCode:     idx.searchCode,
                    searchKeywords: idx.searchKeywords,
                });
            }
            try {
                await batch.commit();
                updated += chunk.length;
                process.stdout.write(`\r  Đã ghi: ${updated} docs...`);
            } catch (writeErr) {
                errors += chunk.length;
                console.error(`\n  ❌ Lỗi batch write:`, writeErr.message);
            }
        }
    }

    if (snap.size < PAGE_SIZE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
}

if (EXECUTE && updated > 0) process.stdout.write('\n');

// ── Report ───────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Kết quả backfill:');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Scanned    : ${scanned}`);
console.log(`  WouldUpdate: ${wouldUpdate}`);
if (EXECUTE) {
    console.log(`  Updated    : ${updated}`);
    console.log(`  Errors     : ${errors}`);
} else {
    console.log(`  Would write: ${wouldUpdate} (dry-run — không ghi)`);
}
console.log(`  Skipped    : ${skipped} (đã có index đúng)`);
console.log('══════════════════════════════════════════════════════════');

if (!EXECUTE) {
    console.log('\n  Muốn ghi thật? Chạy lại với:');
    console.log(`  node tools/backfill-student-search-index.mjs \\`);
    console.log(`    --project ${PROJECT} --clubId ${CLUB_ID} \\`);
    console.log(`    --execute --confirm "BACKFILL SEARCH INDEX ${CLUB_ID}"\n`);
} else {
    if (errors > 0) {
        console.log(`\n  ⚠️  Có ${errors} lỗi batch write. Kiểm tra Firestore Rules và thử lại.\n`);
        process.exit(1);
    } else {
        console.log('\n  ✅ Backfill hoàn tất thành công!\n');
    }
}

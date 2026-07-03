/**
 * tools/backfill-student-search-index.mjs — Phase 4.0B-4J-8A
 * ────────────────────────────────────────────────────────────────
 * Backfill searchName / searchPhone / searchCode / searchNickname
 * cho tất cả hồ sơ võ sinh chưa có search index.
 *
 * MẶC ĐỊNH: dry-run (chỉ báo cáo, không ghi).
 * Phải thêm --execute --confirm "BACKFILL SEARCH INDEX <clubId>" mới ghi thật.
 *
 * Lệnh dry-run:
 *   node tools/backfill-student-search-index.mjs --project quanly-tst --clubId CLB_ID --dry-run
 *
 * Lệnh execute (bắt buộc confirm):
 *   node tools/backfill-student-search-index.mjs --project quanly-tst --clubId CLB_ID --execute --confirm "BACKFILL SEARCH INDEX CLB_ID"
 *
 * Không chạy tự động. Không backfill khi login.
 * ────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
};
const hasFlag = (flag) => args.includes(flag);

const projectId = getArg('--project');
const clubId    = getArg('--clubId');
// --write là alias đơn giản của --execute (bỏ qua confirm requirement)
const isWriteMode = hasFlag('--write');
const isDryRun  = !hasFlag('--execute') && !isWriteMode;
const confirmStr = getArg('--confirm') || '';
const expectedConfirm = clubId ? `BACKFILL SEARCH INDEX ${clubId}` : '';

// ── Validate inputs ────────────────────────────────────────────
if (!projectId) {
    console.error('❌ Thiếu --project. Vui lòng cung cấp Firebase project ID.');
    console.error('   Ví dụ: node tools/backfill-student-search-index.mjs --project quanly-tst --clubId CLB_ID --dry-run');
    process.exit(1);
}

if (!clubId) {
    console.error('❌ Thiếu --clubId. Không thể chạy backfill mà không có club ID.');
    process.exit(1);
}

if (!isDryRun && !isWriteMode && confirmStr !== expectedConfirm) {
    console.error(`❌ --execute yêu cầu --confirm "${expectedConfirm}"`);
    console.error(`   Bạn đã nhập: "${confirmStr}"`);
    console.error('   Chạy dry-run trước để kiểm tra: thêm --dry-run thay --execute');
    console.error('   Hoặc dùng --write để bỏ qua confirm (thêm --project và --clubId).');
    process.exit(1);
}

// ── Normalize helpers (mirror từ app.js — không import để tránh phụ thuộc) ─
function normalizeSearchText(value) {
    const raw = String(value || '').trim();
    const noTone = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
    return noTone.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizePhoneForSearch(value) {
    return String(value || '').replace(/\D/g, '');
}

function buildStudentSearchIndex(profile = {}, name = '') {
    const _nameStr = String(name || profile.name || profile.profileName || '').trim();
    const phone =
        profile.phone ||
        profile.parentPhone ||
        profile.phone1 ||
        profile.contactPhone ||
        profile.guardianPhone ||
        '';
    const studentCode =
        profile.studentCode ||
        profile.memberId ||
        profile.code ||
        profile.idCode ||
        profile.studentId ||
        '';
    const nickname =
        profile.nickname ||
        profile.shortName ||
        profile.alias ||
        '';
    const searchName = normalizeSearchText(_nameStr);
    const searchNameTokens = searchName.split(' ').filter(Boolean).slice(0, 10);
    return {
        searchName,
        searchGivenName: searchNameTokens[searchNameTokens.length - 1] || '',
        searchNameTokens,
        searchPhone: normalizePhoneForSearch(phone),
        searchCode: normalizeSearchText(studentCode),
        searchNickname: normalizeSearchText(nickname),
    };
}

function needsUpdate(docData, docId) {
    const expected = buildStudentSearchIndex(docData, docId);
    return (
        docData.searchName       !== expected.searchName       ||
        docData.searchPhone      !== expected.searchPhone      ||
        docData.searchCode       !== expected.searchCode       ||
        docData.searchNickname   !== expected.searchNickname   ||
        !docData.searchNameTokens
    );
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  Phase 4.0B-4J-8A — Backfill Student Search Index');
    console.log('══════════════════════════════════════════════════════════');
    console.log('  Project :', projectId);
    console.log('  Club ID :', clubId);
    console.log('  Mode    :', isDryRun ? '🔍 DRY-RUN (không ghi)' : '✍️  EXECUTE (ghi thật)');
    console.log('');

    // Try to load firebase-admin
    let admin;
    try {
        const mod = await import('firebase-admin');
        admin = mod.default || mod;
    } catch (_) {
        console.error('❌ Thiếu firebase-admin. Cài đặt: npm install firebase-admin');
        console.error('   Sau đó set GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json');
        console.error('   Hoặc: gcloud auth application-default login');
        process.exit(1);
    }

    // Init app
    try {
        if (!admin.apps.length) {
            admin.initializeApp({ projectId });
        }
    } catch (e) {
        console.error('❌ Không thể khởi tạo Firebase Admin:', e.message);
        console.error('   Kiểm tra GOOGLE_APPLICATION_CREDENTIALS hoặc gcloud credentials.');
        process.exit(1);
    }

    const db = admin.firestore();
    const READ_BATCH  = 200;
    const WRITE_BATCH = 400;

    const stats = {
        scanned: 0,
        needUpdate: 0,
        skipped: 0,
        updated: 0,
        errors: 0,
    };

    console.log(`Đang đọc hồ sơ theo batch ${READ_BATCH}...\n`);

    let lastDoc = null;
    let page = 0;

    // Collect docs that need update
    const toUpdate = [];

    while (true) {
        let q = db.collection('clubs').doc(clubId).collection('profiles')
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(READ_BATCH);
        if (lastDoc) q = q.startAfter(lastDoc);

        const snap = await q.get();
        const docs = snap.docs;
        if (docs.length === 0) break;

        stats.scanned += docs.length;
        page++;
        process.stdout.write(`  Trang ${page}: đọc ${docs.length} docs (tổng: ${stats.scanned})\r`);

        for (const d of docs) {
            const data = d.data();
            if (needsUpdate(data, d.id)) {
                stats.needUpdate++;
                const idx = buildStudentSearchIndex(data, d.id);
                toUpdate.push({ id: d.id, idx });
            } else {
                stats.skipped++;
            }
        }

        lastDoc = docs[docs.length - 1];
        if (docs.length < READ_BATCH) break;
    }

    console.log(`\n\nKết quả scan:`);
    console.log(`  Scanned   : ${stats.scanned}`);
    console.log(`  Cần update: ${stats.needUpdate}`);
    console.log(`  Đã có idx : ${stats.skipped}`);

    if (isDryRun) {
        console.log('\n🔍 DRY-RUN — Không ghi. Để thực thi:');
        console.log(`   node tools/backfill-student-search-index.mjs --project ${projectId} --clubId ${clubId} --execute --confirm "${expectedConfirm}"`);
    } else {
        console.log('\nĐang ghi search index...');
        for (let i = 0; i < toUpdate.length; i += WRITE_BATCH) {
            const batch = db.batch();
            const chunk = toUpdate.slice(i, i + WRITE_BATCH);
            for (const { id, idx } of chunk) {
                const ref = db.collection('clubs').doc(clubId).collection('profiles').doc(id);
                batch.update(ref, idx);
            }
            try {
                await batch.commit();
                stats.updated += chunk.length;
                process.stdout.write(`  Đã ghi ${stats.updated}/${stats.needUpdate}\r`);
            } catch (e) {
                stats.errors += chunk.length;
                console.error(`\n  ❌ Lỗi batch [${i}–${i + chunk.length}]:`, e.message);
            }
        }
        console.log(`\n\n✅ Ghi xong: ${stats.updated} docs`);
        if (stats.errors > 0) console.error(`❌ Lỗi: ${stats.errors} docs`);
    }

    // Write report
    const report = {
        runAt: new Date().toISOString(),
        projectId,
        clubId,
        mode: isDryRun ? 'dry-run' : 'execute',
        stats,
    };
    const reportPath = resolve(__dirname, '..', 'backfill-search-index-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport: backfill-search-index-report.json`);
    console.log('══════════════════════════════════════════════════════════\n');
}

main().catch(e => {
    if (e.message && e.message.includes('credential')) {
        console.error('❌ Missing Firebase Admin credentials.');
        console.error('   Set GOOGLE_APPLICATION_CREDENTIALS hoặc: gcloud auth application-default login');
    } else {
        console.error('❌ Lỗi không mong đợi:', e.message);
    }
    process.exit(1);
});

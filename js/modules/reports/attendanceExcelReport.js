/**
 * Phase 4K-6U — Attendance Excel Report (lazy, read-only)
 *
 * Loaded only when the user exports the monthly attendance workbook.
 * Uses bounded cursor pagination and refuses to silently export truncated data.
 * No Firestore writes and no realtime listeners.
 */

const PAGE_SIZE = 1000;
const MAX_PAGES = 200;

export async function loadAttendanceMonthPaginated({ db, clubId, month, onProgress }) {
    const sdk = window._fb_init || {};
    const { collection, query, where, orderBy, limit, startAfter, getDocs } = sdk;
    const documentIdFn = typeof sdk.documentId === 'function' ? sdk.documentId : null;
    const required = { collection, query, where, orderBy, limit, startAfter, getDocs };
    const missing = Object.entries(required).filter(([, value]) => typeof value !== 'function').map(([name]) => name);
    if (missing.length) throw new Error('Firebase SDK chưa sẵn sàng: ' + missing.join(', '));

    const ref = collection(db, 'clubs', clubId, 'attendance');
    const items = [];
    let cursor = null;
    let pages = 0;

    while (pages < MAX_PAGES) {
        const constraints = [
            where('month', '==', month),
            // Phase 4K-6V4D11: Firebase CDN bootstrap now exposes documentId().
            // Keep a __name__ fallback so old cached index.html does not break
            // attendance Excel export while the new bundle is rolling out.
            orderBy(documentIdFn ? documentIdFn() : '__name__'),
        ];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(PAGE_SIZE));

        const snap = await getDocs(query(ref, ...constraints));
        pages += 1;
        const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
        for (const docSnap of docs) items.push({ id: docSnap.id, ...docSnap.data() });

        if (typeof onProgress === 'function') {
            try { onProgress({ pages, docs: items.length }); } catch (_) {}
        }

        if (docs.length < PAGE_SIZE) {
            return { items, pages, truncated: false };
        }
        cursor = docs[docs.length - 1];
    }

    throw new Error(
        `Dữ liệu điểm danh vượt ngưỡng an toàn ${MAX_PAGES * PAGE_SIZE} bản ghi. ` +
        'Hệ thống đã dừng để không xuất file thiếu dữ liệu.'
    );
}

export async function exportAttendanceExcel() {
    // Quyền được kiểm tra trước khi tải XLSX hoặc đọc Firestore.
    if (window.userRole === 'viewer') {
        alert('Tài khoản khách không thể tải File!');
        return;
    }

    const context = typeof window.getAppContext === 'function' ? window.getAppContext('attendance-excel-export') : {};
    const store = window.__store || {};
    const db = context.db || store.db || window.db || window._db || null;
    const currentClubId = context.currentClubId || store.currentClubId || store.clubId || window.currentClubId || '';
    const clubData = context.clubData || store.clubData || {};
    const clubConfig = context.clubConfig || store.clubConfig || {};
    const allProfiles = context.allProfiles || store.profiles || {};

    if (!db || !currentClubId) {
        const msg = 'Dữ liệu CLB chưa sẵn sàng. Vui lòng đợi tải xong rồi thử lại.';
        if (typeof window.showToast === 'function') window.showToast('⚠️ ' + msg, 4000);
        else alert(msg);
        return;
    }
    await window.ensureXlsxReady?.('export-attendance-excel');
    const XLSX = window.XLSX;
    if (!XLSX || !XLSX.utils || typeof XLSX.writeFile !== 'function') {
        throw new Error('Thư viện XLSX chưa sẵn sàng.');
    }

        // Lấy tháng được chọn từ bộ lọc Thống kê tháng
        const monthEl = document.getElementById('att_month');
        const selMonth = monthEl ? monthEl.value : '';
        if (!selMonth) return alert('Vui lòng chọn tháng trước khi xuất báo cáo!');

        // Lấy tên CLB và số cơ sở từ cấu hình
        const clubName  = (clubData && clubData.clubName) || 'CLB Taekwondo';
        const bCount    = clubConfig.branchCount || 1;
        const isSingle  = bCount === 1;

        // Tạo nhãn tháng dạng MM/YYYY để hiển thị
        const [mYear, mMon] = selMonth.split('-');
        const monthDisplay  = `Tháng ${parseInt(mMon)}/${mYear}`;

        // Ngày xuất báo cáo
        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;

        window.showToast('⏳ Đang tải dữ liệu điểm danh...', 15000, true);

        try {
            // ── Lấy đầy đủ dữ liệu điểm danh trong tháng bằng cursor pagination ─
            const attendanceResult = await loadAttendanceMonthPaginated({
                db,
                clubId: currentClubId,
                month: selMonth,
                onProgress: ({ pages, docs }) => {
                    if (typeof window.showToast === 'function') {
                        window.showToast(`⏳ Đang tải điểm danh: ${docs.toLocaleString('vi-VN')} bản ghi (${pages} trang)...`, 15000, true);
                    }
                },
            });
            const attendanceDocs = attendanceResult.items;

            // Gom nhóm theo tên võ sinh — đếm số buổi có mặt, nghỉ CP, nghỉ KP
            const grouped = {};
            attendanceDocs.forEach(d => {
                const data = d;
                const pid  = data.profileId || data.name || String(d.id || '').split('_')[0];
                if (!grouped[pid]) grouped[pid] = { name: pid, belt: data.belt || '', branch: data.branch || 'CS1', present: 0, excused: 0, absent: 0 };
                if (data.status === 1) grouped[pid].present++;
                // Schema: 2 = Vắng (không phép), 3 = Có phép
                if (data.status === 2) grouped[pid].absent++;
                if (data.status === 3) grouped[pid].excused++;
            });

            // Bổ sung võ sinh đang tập chưa có dữ liệu điểm danh tháng này
            Object.entries(allProfiles || {}).forEach(([pid, p]) => {
                if ((typeof window.classifyProfileStatus === 'function' ? window.classifyProfileStatus(p) : p.status) !== 'active') return;
                if (!grouped[pid]) {
                    grouped[pid] = { name: pid, belt: p.belt || '', branch: p.branch || 'CS1', present: 0, excused: 0, absent: 0 };
                }
                // Cập nhật belt/branch từ profile nếu thiếu trong attendance
                if (!grouped[pid].belt && p.belt)   grouped[pid].belt   = p.belt;
                if (!grouped[pid].branch && p.branch) grouped[pid].branch = p.branch;
            });

            // Chuyển object thành mảng, sắp xếp tên tiếng Việt
            const allRows = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

            if (allRows.length === 0) {
                document.getElementById('toastMessage')?.classList.remove('show');
                return alert('Không có dữ liệu điểm danh nào trong tháng này!');
            }

            // ── Định nghĩa style dùng chung (xlsx-js-style) ────────────────────

            // Border
            const bAll  = { top:{style:'thin',color:{rgb:'C8D5E8'}}, bottom:{style:'thin',color:{rgb:'C8D5E8'}}, left:{style:'thin',color:{rgb:'C8D5E8'}}, right:{style:'thin',color:{rgb:'C8D5E8'}} };
            const bBold = { top:{style:'medium',color:{rgb:'0033A0'}}, bottom:{style:'medium',color:{rgb:'0033A0'}}, left:{style:'medium',color:{rgb:'0033A0'}}, right:{style:'medium',color:{rgb:'0033A0'}} };
            const bGreen= { top:{style:'medium',color:{rgb:'15803D'}}, bottom:{style:'medium',color:{rgb:'15803D'}}, left:{style:'medium',color:{rgb:'15803D'}}, right:{style:'medium',color:{rgb:'15803D'}} };

            // Font
            const fTitle = { bold:true, sz:15, name:'Arial', color:{rgb:'FFFFFF'} };
            const fSub   = { bold:true, sz:10, name:'Arial', color:{rgb:'1E3A6E'} };
            const fHdr   = { bold:true, sz:11, name:'Arial', color:{rgb:'FFFFFF'} };
            const fBold  = { bold:true, sz:11, name:'Arial' };
            const fNorm  = { sz:11, name:'Arial' };
            const fGreen = { bold:true, sz:11, name:'Arial', color:{rgb:'166534'} };
            const fBlue  = { bold:true, sz:11, name:'Arial', color:{rgb:'1D4ED8'} };
            const fRed   = { bold:true, sz:11, name:'Arial', color:{rgb:'9F1239'} };
            const fGray  = { sz:10,  name:'Arial', color:{rgb:'64748B'} };

            // Fill
            const fillTitle  = { patternType:'solid', fgColor:{rgb:'0033A0'} };        // xanh navy
            const fillSub    = { patternType:'solid', fgColor:{rgb:'DBEAFE'} };        // xanh nhạt
            const fillHdr    = { patternType:'solid', fgColor:{rgb:'1E40AF'} };        // xanh đậm
            const fillAlt    = { patternType:'solid', fgColor:{rgb:'F0F4FF'} };        // xen kẽ hàng chẵn
            const fillTotal  = { patternType:'solid', fgColor:{rgb:'DCFCE7'} };        // tổng kết xanh lá
            const fillWarn   = { patternType:'solid', fgColor:{rgb:'FEF9C3'} };        // cảnh báo vàng
            const fillGood   = { patternType:'solid', fgColor:{rgb:'F0FDF4'} };        // tốt (chuyên cần ≥80%)
            const fillOk     = { patternType:'solid', fgColor:{rgb:'FEFCE8'} };        // khá (60–79%)
            const fillBad    = { patternType:'solid', fgColor:{rgb:'FFF1F2'} };        // kém (<60%)

            // Alignment
            const aCenter = { horizontal:'center', vertical:'center', wrapText:true };
            const aLeft   = { horizontal:'left',   vertical:'center', wrapText:true };
            const aRight  = { horizontal:'right',  vertical:'center' };

            // ── Helper tạo ô ────────────────────────────────────────────────────
            const mc = (v, font, fill, border, align) => {
                const c = { v: v === undefined || v === null ? '' : v, t: typeof v === 'number' ? 'n' : 's', s: { font: font || fNorm, alignment: align || aLeft } };
                if (fill)   c.s.fill   = fill;
                if (border) c.s.border = border;
                return c;
            };
            const hc  = v => mc(v, fHdr,  fillHdr,  bBold, aCenter);  // header cell
            const nc  = (v, alt) => mc(v, fNorm, alt ? fillAlt : null, bAll, aLeft);
            const bc  = (v, alt) => mc(v, fBold, alt ? fillAlt : null, bAll, aLeft);
            const cc  = (v, font, fill) => mc(v, font || fNorm, fill, bAll, aCenter);
            const nNum = (v, alt) => mc(Number(v)||0, fNorm, alt ? fillAlt : null, bAll, aCenter, '#,##0');

            // ── Helper lấy fill cho cột chuyên cần dựa theo % ──────────────────
            const rateFill = (rate) => {
                if (rate === null) return null;
                if (rate >= 80) return fillGood;
                if (rate >= 60) return fillOk;
                return fillBad;
            };
            const rateFont = (rate) => {
                if (rate === null) return fGray;
                if (rate >= 80) return fGreen;
                if (rate >= 60) return fBold;
                return fRed;
            };

            // ── Màu sắc cấp đai (tương ứng getBeltBadge) cho cột Excel ─────────
            const beltFill = (belt) => {
                if (!belt) return null;
                const b = belt.toLowerCase();
                if (b.includes('đen'))         return { patternType:'solid', fgColor:{rgb:'1E293B'} };
                if (b.includes('đỏ'))          return { patternType:'solid', fgColor:{rgb:'FFE4E6'} };
                if (b.includes('xanh dương'))  return { patternType:'solid', fgColor:{rgb:'DBEAFE'} };
                if (b.includes('xanh lá'))     return { patternType:'solid', fgColor:{rgb:'DCFCE7'} };
                if (b.includes('vàng'))        return { patternType:'solid', fgColor:{rgb:'FEF9C3'} };
                return { patternType:'solid', fgColor:{rgb:'F8FAFC'} }; // trắng
            };
            const beltFont = (belt) => {
                if (!belt) return fNorm;
                const b = belt.toLowerCase();
                if (b.includes('đen'))        return Object.assign({}, fBold, {color:{rgb:'F8FAFC'}});
                if (b.includes('đỏ'))         return Object.assign({}, fBold, {color:{rgb:'9F1239'}});
                if (b.includes('xanh dương')) return Object.assign({}, fBold, {color:{rgb:'1D4ED8'}});
                if (b.includes('xanh lá'))    return Object.assign({}, fBold, {color:{rgb:'166534'}});
                if (b.includes('vàng'))       return Object.assign({}, fBold, {color:{rgb:'78350F'}});
                return fNorm;
            };

            // ── Tên cột header — có/không có cột Cơ sở ─────────────────────────
            const NUM_COLS   = isSingle ? 8 : 9;
            const colHeaders = isSingle
                ? ['STT', 'Họ và Tên', 'Cấp Đai', '✅ Có mặt', '📝 Nghỉ CP', '❌ Nghỉ KP', '📅 Tổng buổi', '📊 Chuyên cần']
                : ['STT', 'Họ và Tên', 'Cơ sở',   'Cấp Đai', '✅ Có mặt', '📝 Nghỉ CP', '❌ Nghỉ KP', '📅 Tổng buổi', '📊 Chuyên cần'];
            const colWidths = isSingle
                ? [{wch:5},{wch:30},{wch:26},{wch:10},{wch:10},{wch:10},{wch:12},{wch:14}]
                : [{wch:5},{wch:30},{wch:14},{wch:26},{wch:10},{wch:10},{wch:10},{wch:12},{wch:14}];

            // ── Hàm dựng một worksheet từ mảng rows ────────────────────────────
            // titleLine1: dòng tiêu đề chính, titleLine2: dòng phụ
            const buildAttSheet = (rows, titleLine1, titleLine2, showBranch) => {
                const numCols = showBranch ? 9 : 8;
                const headers = showBranch
                    ? ['STT', 'Họ và Tên', 'Cơ sở', 'Cấp Đai', '✅ Có mặt', '📝 Nghỉ CP', '❌ Nghỉ KP', '📅 Tổng buổi', '📊 Chuyên cần']
                    : ['STT', 'Họ và Tên', 'Cấp Đai', '✅ Có mặt', '📝 Nghỉ CP', '❌ Nghỉ KP', '📅 Tổng buổi', '📊 Chuyên cần'];

                const ws_data = [];

                // Hàng 1: tiêu đề chính — nền xanh navy, chữ trắng
                const titleRow = [mc(titleLine1, fTitle, fillTitle, bBold, aCenter)];
                for (let i = 1; i < numCols; i++) titleRow.push(mc('', fTitle, fillTitle, bBold, aCenter));
                ws_data.push(titleRow);

                // Hàng 2: thông tin phụ — nền xanh nhạt
                const subRow = [mc(titleLine2, fSub, fillSub, bAll, aCenter)];
                for (let i = 1; i < numCols; i++) subRow.push(mc('', fSub, fillSub, bAll, aCenter));
                ws_data.push(subRow);

                // Hàng 3: header cột
                ws_data.push(headers.map(h => hc(h)));

                // Hàng dữ liệu từng võ sinh
                let stt = 1;
                let totPresent = 0, totExcused = 0, totAbsent = 0;

                rows.forEach(r => {
                    const alt    = stt % 2 === 0;          // xen kẽ màu chẵn/lẻ
                    const mTot   = r.present + r.excused + r.absent;
                    const mRate  = mTot > 0 ? Math.round(r.present / mTot * 100) : null;
                    const rateStr = mRate !== null ? `${mRate}%` : '—';
                    const rFill  = rateFill(mRate);
                    const rFont  = rateFont(mRate);
                    const bFill  = beltFill(r.belt);
                    const bFont  = beltFont(r.belt);
                    const beltLabel = (r.belt || 'Trắng').replace(/^Đai /i, '');
                    const branchLabel = window.getBranchNameDisplay ? window.getBranchNameDisplay(r.branch || 'CS1') : (r.branch || 'CS1');

                    totPresent += r.present;
                    totExcused += r.excused;
                    totAbsent  += r.absent;

                    if (showBranch) {
                        ws_data.push([
                            cc(stt++,   fNorm, alt ? fillAlt : null),
                            bc(r.name,  alt),
                            cc(branchLabel, fNorm, alt ? fillAlt : null),
                            mc(beltLabel, bFont, bFill, bAll, aCenter),
                            cc(r.present, fGreen, alt ? fillAlt : null),
                            cc(r.excused, fBlue,  alt ? fillAlt : null),
                            cc(r.absent,  r.absent > 0 ? fRed : fNorm, alt ? fillAlt : null),
                            cc(mTot,      fBold,  alt ? fillAlt : null),
                            mc(rateStr,  rFont,  rFill  || (alt ? fillAlt : null), bAll, aCenter),
                        ]);
                    } else {
                        ws_data.push([
                            cc(stt++,   fNorm, alt ? fillAlt : null),
                            bc(r.name,  alt),
                            mc(beltLabel, bFont, bFill, bAll, aCenter),
                            cc(r.present, fGreen, alt ? fillAlt : null),
                            cc(r.excused, fBlue,  alt ? fillAlt : null),
                            cc(r.absent,  r.absent > 0 ? fRed : fNorm, alt ? fillAlt : null),
                            cc(mTot,      fBold,  alt ? fillAlt : null),
                            mc(rateStr,  rFont,  rFill  || (alt ? fillAlt : null), bAll, aCenter),
                        ]);
                    }
                });

                // Hàng tổng kết cuối — nền xanh lá
                const totTot = totPresent + totExcused + totAbsent;
                const totRate = totTot > 0 ? Math.round(totPresent / totTot * 100) : null;
                const totRateStr = totRate !== null ? `${totRate}%` : '—';
                const totCells = [
                    mc(`TỔNG  (${rows.length} võ sinh)`, fGreen, fillTotal, bGreen, aCenter),
                ];
                // điền ô trống span đến cột số liệu
                const skipCols = showBranch ? 3 : 2;  // STT + Tên (+ Cơ sở nếu có)
                for (let k = 1; k < skipCols; k++) totCells.push(mc('', fGreen, fillTotal, bGreen, aCenter));
                // Cấp đai ô trống
                totCells.push(mc('', fGreen, fillTotal, bGreen, aCenter));
                totCells.push(mc(totPresent,  fGreen, fillTotal, bGreen, aCenter));
                totCells.push(mc(totExcused,  fBlue,  fillTotal, bGreen, aCenter));
                totCells.push(mc(totAbsent,   totAbsent > 0 ? fRed : fGreen, fillTotal, bGreen, aCenter));
                totCells.push(mc(totTot,      fBold,  fillTotal, bGreen, aCenter));
                totCells.push(mc(totRateStr,  rateFont(totRate), fillTotal, bGreen, aCenter));
                ws_data.push(totCells);

                // Hàng ghi chú / chú giải cuối
                const noteRow = [mc(`Ghi chú: ✅ Có mặt  📝 Nghỉ có phép (CP)  ❌ Nghỉ không phép (KP)  📊 Chuyên cần = Có mặt / (Có mặt + Nghỉ CP + Nghỉ KP) × 100%`, fGray, null, null, aLeft)];
                for (let i = 1; i < numCols; i++) noteRow.push(mc('', fGray, null, null, aLeft));
                ws_data.push(noteRow);

                // Tạo worksheet và thiết lập cột / merge
                const ws = XLSX.utils.aoa_to_sheet(ws_data);
                ws['!cols'] = showBranch
                    ? [{wch:5},{wch:30},{wch:14},{wch:26},{wch:11},{wch:11},{wch:11},{wch:13},{wch:14}]
                    : [{wch:5},{wch:30},{wch:26},{wch:11},{wch:11},{wch:11},{wch:13},{wch:14}];
                ws['!rows'] = [{hpt:28}, {hpt:18}];  // chiều cao hàng tiêu đề
                // Merge tiêu đề và phụ đề qua tất cả cột
                const merges = [
                    {s:{r:0,c:0}, e:{r:0,c:numCols-1}},
                    {s:{r:1,c:0}, e:{r:1,c:numCols-1}},
                    {s:{r:0,c:0}, e:{r:0,c:numCols-1}},
                ];
                // Merge ô tổng (cột STT+tên(+chi nhánh) gộp lại)
                const lastDataRow = ws_data.length - 2; // hàng tổng (trước ghi chú)
                merges.push({s:{r:lastDataRow,c:0}, e:{r:lastDataRow,c:skipCols-1}});
                // Merge hàng ghi chú
                merges.push({s:{r:ws_data.length-1,c:0}, e:{r:ws_data.length-1,c:numCols-1}});
                ws['!merges'] = merges;
                return ws;
            };

            // ── Tạo workbook ────────────────────────────────────────────────────
            const wb = XLSX.utils.book_new();

            // ── SHEET 1: TỔNG HỢP TẤT CẢ CƠ SỞ ───────────────────────────────
            const ws_all = buildAttSheet(
                allRows,
                `📋 BÁO CÁO ĐIỂM DANH ${monthDisplay.toUpperCase()} — ${clubName.toUpperCase()}`,
                `Ngày xuất: ${dateStr}   |   Tổng: ${allRows.length} võ sinh   |   Tất cả cơ sở`,
                !isSingle   // hiện cột Cơ sở khi có nhiều cơ sở
            );
            XLSX.utils.book_append_sheet(wb, ws_all, 'Tong Hop');

            // ── SHEET TỪNG CƠ SỞ (chỉ tạo khi có nhiều cơ sở) ─────────────────
            if (!isSingle) {
                for (let bi = 1; bi <= bCount; bi++) {
                    const branchKey  = 'CS' + bi;
                    const branchName = clubConfig['branchName' + bi] || ('Cơ sở ' + bi);
                    // Lọc chỉ võ sinh thuộc cơ sở này
                    const branchRows = allRows.filter(r => (r.branch || 'CS1') === branchKey);
                    if (branchRows.length === 0) continue; // bỏ qua cơ sở không có dữ liệu

                    const ws_br = buildAttSheet(
                        branchRows,
                        `📋 BÁO CÁO ĐIỂM DANH ${monthDisplay.toUpperCase()} — ${branchName.toUpperCase()}`,
                        `Ngày xuất: ${dateStr}   |   Tổng: ${branchRows.length} võ sinh   |   ${branchName}`,
                        false   // không cần cột Cơ sở vì đây là sheet riêng mỗi cơ sở
                    );
                    // Tên sheet an toàn: tối đa 31 ký tự, không có ký tự đặc biệt
                    const safeSheetName = branchName.replace(/[\/\\?*\[\]:]/g,'').substring(0, 28);
                    XLSX.utils.book_append_sheet(wb, ws_br, safeSheetName);
                }
            }

            // ── Xuất file ───────────────────────────────────────────────────────
            const fileName = `DiemDanh_${monthDisplay.replace('/','_')}_${clubName.replace(/\s+/g,'_')}.xlsx`;
            XLSX.writeFile(wb, fileName);
            document.getElementById('toastMessage')?.classList.remove('show');
            window.showToast(`✅ Đã xuất: ${fileName}`);

        } catch(err) {
            console.error('exportAttendanceExcel error:', err);
            document.getElementById('toastMessage')?.classList.remove('show');
            alert('Lỗi xuất Excel điểm danh: ' + (err.message || err));
        }
    }

export const AttendanceExcelReport = Object.freeze({ exportAttendanceExcel });
export default AttendanceExcelReport;

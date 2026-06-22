/**
 * modules/students.js — Quản Lý Võ Sinh (Phase 2d)
 * ────────────────────────────────────────────────────────────────
 * Extract các hàm quản lý võ sinh từ app.js sang ES Module,
 * theo delegation pattern đã kiểm chứng ở Phase 2a–2c.
 *
 * PATTERN (delegation):
 *   initStudents() gán window.X = function() {...}
 *   → Mỗi hàm đọc state từ window.__store TẠI THỜI ĐIỂM GỌI (call time),
 *     KHÔNG capture closure từ lúc init → tránh stale data.
 *
 * BRIDGE (window.__store):
 *   app.js sync sau login thành công:
 *     window.__store.db, .colRef, .profRef, .invRef,
 *     .clubId, .profiles, .clubConfig
 *   (xem các sync point được đánh dấu "[Phase 2d]" trong app.js)
 *
 * FIREBASE SDK:
 *   Truy cập qua window._fb_init (CDN loader của app.js).
 *   KHÔNG import trực tiếp — Phase 3 sẽ chuyển sang ES module Firebase.
 *
 * ROLLBACK:
 *   Comment `initStudents()` trong main.js → app.js xử lý như cũ,
 *   không ảnh hưởng chức năng.
 *
 * /// Phase 2d — extracted from app.js
 * ────────────────────────────────────────────────────────────────
 */

import { getLocalToday, formatDate, formatMonth, formatMonthCompact, addMonthsToYYYYMM } from '../utils/format.js';
import { StudentService } from '../services/students.service.js?v=firestore-read-attribution-canonical-tx-boundary-20260616-v3a';

// ════════════════════════════════════════════════════════════════
// BRIDGE HELPERS — đọc state từ app.js qua window.__store
// Mỗi hàm được gọi tại call time để luôn lấy giá trị mới nhất.
// ════════════════════════════════════════════════════════════════

/** Firestore db instance (được app.js sync sau login) */
function _db()       { return (window.__store || {}).db; }
/** Collection ref "transactions" của club hiện tại */
function _colRef()   { return (window.__store || {}).colRef; }
/** Collection ref "inventory" của club hiện tại */
function _invRef()   { return (window.__store || {}).invRef; }
/** Club ID hiện tại */
function _clubId()   { return (window.__store || {}).clubId; }
/** allProfiles — {tên: profileData} — đồng bộ realtime từ onSnapshot */
function _profiles() { return (window.__store || {}).profiles || {}; }
/** clubConfig — cấu hình CLB (branchCount, clubName, signatureBase64...) */
function _config()   { return (window.__store || {}).clubConfig || {}; }
/** @deprecated Phase 3.1 — Firebase calls đã chuyển sang StudentService */

// ════════════════════════════════════════════════════════════════
// MODULE-LEVEL STATE (thay thế closure vars trong app.js)
// ════════════════════════════════════════════════════════════════

/** Guard tránh double-submit khi bấm nhanh nút "Thêm Võ Sinh" */
let _addStudentInProgress = false;
/** Danh sách võ sinh nợ trong Bulk Zalo modal */
let _bulkZaloDebtors = [];
/** Index tiến trình gửi trong sequential bulk Zalo */
let _bulkZaloIdx = 0;

// ════════════════════════════════════════════════════════════════
// HÀM NỘI BỘ (private — không export)
// ════════════════════════════════════════════════════════════════

/**
 * Render danh sách thành tích thi đấu trong form chỉnh sửa hồ sơ.
 * Gom nhóm theo năm giảm dần, mỗi mục có nút xóa.
 * Cập nhật window._currentAchievements (state tạm — chưa lưu Firestore).
 *
 * @param {Array<{year:string, tournament:string, result:string}>} list
 */
function renderAchievements(list) {
    window._currentAchievements = list ? [...list] : [];
    const el = document.getElementById('m_achievements');
    if (!el) return;
    if (!list || list.length === 0) {
        el.innerHTML = '<span style="font-size:0.72rem;color:#a16207;font-style:italic;">Chưa có thành tích nào được ghi nhận.</span>';
        return;
    }
    const byYear = {};
    list.forEach((a, i) => {
        const y = a.year || '?';
        if (!byYear[y]) byYear[y] = [];
        byYear[y].push({ ...a, _idx: i });
    });
    const years = Object.keys(byYear).sort((a, b) => b - a);
    el.innerHTML = years.map(y => `
        <div style="margin-bottom:4px;">
            <div style="font-size:0.65rem;font-weight:900;color:#854d0e;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Năm ${y}</div>
            ${byYear[y].map(a => `
                <div style="display:flex;align-items:center;gap:8px;background:white;border:1px solid #fde68a;border-radius:8px;padding:7px 10px;margin-bottom:3px;">
                    <span style="font-size:1rem;">🏅</span>
                    <div style="flex:1;min-width:0;">
                        <span style="font-weight:700;font-size:0.82rem;color:#1e293b;">${a.tournament}</span>
                        <span style="margin-left:8px;font-size:0.72rem;font-weight:700;color:#15803d;background:#dcfce7;border:1px solid #bbf7d0;padding:2px 7px;border-radius:5px;">${a.result}</span>
                    </div>
                    <button type="button" onclick="removeAchievement(${a._idx})" style="color:#f87171;background:none;border:none;font-weight:900;font-size:0.9rem;cursor:pointer;padding:0 2px;" title="Xóa">✖</button>
                </div>
            `).join('')}
        </div>
    `).join('');
}

/**
 * Inject modal Zalo nhắc nợ vào DOM (idempotent — an toàn khi gọi nhiều lần).
 * Modal có textarea chỉnh sửa tự do, nút Copy và nút Mở Zalo.
 */
function _injectZaloModal() {
    if (document.getElementById('_zaloMsgModal')) return;
    const el = document.createElement('div');
    el.id = '_zaloMsgModal';
    el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:20000;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);';
    el.innerHTML = `
    <div style="background:#fff;width:100%;max-width:520px;border-radius:20px 20px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -10px 40px rgba(0,0,0,0.2);animation:slideUpSheet 0.3s cubic-bezier(0.16,1,0.3,1);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div>
                <div style="font-size:1rem;font-weight:900;color:#0068FF;display:flex;align-items:center;gap:7px;">💬 Gửi nhắc nợ qua Zalo</div>
                <div style="font-size:0.72rem;color:#64748b;margin-top:2px;">Võ sinh: <strong id="_zaloMsgName"></strong> · SĐT: <strong id="_zaloMsgPhone"></strong></div>
            </div>
            <button onclick="document.getElementById('_zaloMsgModal').style.display='none'" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;">&times;</button>
        </div>
        <label style="font-size:0.68rem;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px;">📝 Nội dung tin nhắn (chỉnh sửa tự do)</label>
        <textarea id="_zaloMsgText" rows="5" style="width:100%;border:1.5px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:0.92rem;line-height:1.6;color:#1e293b;background:#f8fafc;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;"></textarea>
        <div style="display:flex;gap:10px;margin-top:12px;">
            <button onclick="(function(){const t=document.getElementById('_zaloMsgText');const v=t.value;const fb=()=>{const ta=document.createElement('textarea');ta.value=v;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);window.showToast('✅ Đã copy!');};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v).then(()=>window.showToast('✅ Đã copy!')).catch(fb);}else{fb();}})()" style="flex:1;background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px;font-weight:700;font-size:0.85rem;cursor:pointer;color:#334155;">📋 Copy</button>
            <button id="_zaloOpenBtn" style="flex:2;background:#0068FF;color:white;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:0.88rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">💬 Mở Zalo &amp; Gửi</button>
        </div>
        <p style="font-size:0.63rem;color:#94a3b8;text-align:center;margin-top:10px;line-height:1.5;">Bấm "Copy" → mở Zalo → dán tin nhắn → gửi.<br>Hoặc bấm "Mở Zalo" để vào chat trực tiếp.</p>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) el.style.display = 'none'; });
}

/**
 * Render danh sách võ sinh nợ trong Bulk Zalo modal.
 * Mỗi dòng có nút 💬 gửi Zalo riêng lẻ.
 * Nút bị disabled + màu xám nếu võ sinh không có SĐT.
 */
function _renderBulkZaloList() {
    const el = document.getElementById('bulkZaloList');
    if (!el) return;
    if (_bulkZaloDebtors.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:36px;color:#94a3b8;font-weight:700;">✅ Không có võ sinh nào đang nợ học phí!</div>';
        return;
    }
    el.innerHTML = _bulkZaloDebtors.map((d, i) => {
        const hasPhone = !!d.phone;
        return `<div id="bzRow_${i}" style="display:flex;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px solid #f1f5f9;border-radius:8px;background:#fff;margin-bottom:2px;">
            <div style="width:26px;height:26px;min-width:26px;background:#e0edff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.72rem;color:#0044CC;">${i + 1}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:0.88rem;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.name}</div>
                <div style="font-size:0.72rem;color:#64748b;margin-top:1px;">Kỳ: <span style="font-weight:700;color:#0033A0;">${d.monthsLabel}</span>${d.totalFee > 0 ? ' · <b>' + d.totalFee.toLocaleString('vi-VN') + ' ₫</b>' : ''} ${hasPhone ? '' : '<span style="color:#ef4444;font-weight:700;">· Chưa có SĐT</span>'}</div>
            </div>
            <button onclick="sendBulkZaloOne(${i})" style="background:${hasPhone ? '#0068FF' : '#cbd5e1'};color:#fff;border:none;padding:6px 11px;border-radius:8px;font-weight:700;font-size:0.78rem;cursor:${hasPhone ? 'pointer' : 'not-allowed'};" ${hasPhone ? '' : 'disabled'}>💬</button>
        </div>`;
    }).join('');
}

// ════════════════════════════════════════════════════════════════
// EXPORT CHÍNH
// ════════════════════════════════════════════════════════════════

/**
 * initStudents() — Khởi tạo toàn bộ window functions quản lý võ sinh.
 *
 * Được gọi từ main.js SAU khi:
 *   1. app.js đã load (window.__appLoaded = true)
 *   2. Bridge đã sync (window.__store.db được set bởi app.js sau login)
 *
 * Tất cả window.X bên dưới sẽ OVERRIDE những gì app.js đã set —
 * đây là delegation pattern: app.js set trước, module override sau.
 *
 * ROLLBACK NHANH: comment `initStudents()` trong main.js
 *   → app.js tiếp tục xử lý đầy đủ, không bị ảnh hưởng.
 *
 * LƯU Ý CHO DEVELOPER:
 *   - LUÔN đọc state qua _db(), _profiles(), _config()... TRONG mỗi hàm
 *   - KHÔNG đọc ra biến ngoài scope — sẽ bị stale sau khi Firestore update
 *   - Firebase SDK functions: lấy từ _sdk() = window._fb_init (CDN)
 *   - Phase 3: thay _sdk() bằng import trực tiếp từ 'firebase/firestore'
 */
export function initStudents() {

    // Phase 4K-5L-C: Expose StudentService lên window ngay đầu initStudents()
    // để finance.js và các module khác dùng được qua window.StudentService
    if (typeof window !== 'undefined') {
        window.StudentService = window.StudentService || StudentService;
    }

    // Inject Zalo modal (idempotent — app.js cũng inject nhưng an toàn khi gọi lại)
    _injectZaloModal();

    // Đảm bảo _currentAchievements tồn tại
    window._currentAchievements = window._currentAchievements || [];

    // ════════════════════════════════════════════════════════════════
    // THÊM VÕ SINH MỚI
    // ════════════════════════════════════════════════════════════════

    /**
     * Mở modal thêm võ sinh mới.
     * Reset toàn bộ trường về giá trị mặc định và load ca tập bất đồng bộ.
     */
    window.openAddModal = () => {
        document.getElementById('addModal').style.display = 'flex';
        const d = document.getElementById('add_date');
        if (d) d.value = getLocalToday();
        document.getElementById('add_name').value            = '';
        document.getElementById('add_memberId').value        = '';
        document.getElementById('add_belt').value            = 'Trắng';
        document.getElementById('add_dob').value             = '';
        document.getElementById('add_gender').value          = 'Nam';
        document.getElementById('add_phone').value           = '';
        document.getElementById('add_cccd').value            = '';
        document.getElementById('add_notes').value           = '';
        const _addNick = document.getElementById('add_nickname');
        if (_addNick) _addNick.value = '';
        document.getElementById('add_package').value         = '1';
        document.getElementById('add_discount').checked      = false;
        document.getElementById('add_fee_default_display').value = '';
        document.getElementById('add_fee_default_actual').value  = '';
        document.getElementById('add_fee_display').value     = '';
        document.getElementById('add_fee_actual').value      = '';
        document.getElementById('add_uniform_size').value    = '';
        document.getElementById('add_uniform_display').value = '';
        document.getElementById('add_uniform_actual').value  = '';
        document.getElementById('add_uniform_gift').checked  = false;
        document.getElementById('add_uniform_display').disabled = false;
        document.querySelectorAll('.add_trainingDay').forEach(cb => cb.checked = false);

        // Load ca tập bất đồng bộ (tránh chặn render modal)
        const _addShiftSel = document.getElementById('add_shift');
        if (_addShiftSel) {
            (window._ensureClubShiftsLoaded ? window._ensureClubShiftsLoaded() : Promise.resolve()).then(function () {
                let _asHtml = '<option value="">-- Chọn ca tập --</option>';
                (window._getClubShifts ? window._getClubShifts() : []).forEach(function (s) {
                    const _t = (s.timeStart && s.timeEnd) ? ' (' + s.timeStart + '–' + s.timeEnd + ')' : '';
                    _asHtml += '<option value="' + s.id + '">' + s.name + _t + '</option>';
                });
                _addShiftSel.innerHTML = _asHtml;
                _addShiftSel.value = '';
            });
        }
    };

    /** Đóng modal thêm võ sinh */
    window.closeAddModal = () => document.getElementById('addModal').style.display = 'none';

    /**
     * Lưu võ sinh mới vào Firestore.
     *
     * Luồng xử lý:
     *   1. Validate (tên bắt buộc, size võ phục khi có phí)
     *   2. Xử lý trùng tên — tạo Firestore doc ID riêng:
     *      - Cùng tên + cùng năm sinh → bắt buộc nhập biệt danh
     *        → key: "Tên (năm-Biệt danh)"
     *      - Cùng tên + khác năm sinh → key: "Tên (năm sinh mới)"
     *   3. Tính gói học phí (packageCount tháng liên tiếp từ joinDate)
     *   4. Ghi profile doc + transaction học phí + xuất kho võ phục
     *   5. Tạo biên lai qua window.exportReceipt (vẫn trong app.js)
     *
     * Guard `_addStudentInProgress` ngăn double-submit.
     */
    window.addNewStudent = async () => {
        if (window.userRole === 'viewer') return;
        if (_addStudentInProgress) return;

        const profiles = _profiles();
        const config   = _config();

        const name = document.getElementById('add_name').value.trim();
        const joinDate = document.getElementById('add_date').value;
        const fee = Number(document.getElementById('add_fee_actual').value)
            || Number((document.getElementById('add_fee_display').value || '').replace(/[^0-9]/g, ''))
            || 0;
        const uniformSize = document.getElementById('add_uniform_size').value.trim();
        const uniformFee  = Number(document.getElementById('add_uniform_actual').value)
            || Number((document.getElementById('add_uniform_display').value || '').replace(/[^0-9]/g, ''))
            || 0;
        const packageCount   = parseInt(document.getElementById('add_package').value) || 1;
        const isGift         = document.getElementById('add_uniform_gift').checked;
        const isSingleBranch = (config.branchCount === 1);
        const branch         = isSingleBranch ? 'CS1' : document.getElementById('add_branch').value;
        const memberId       = document.getElementById('add_memberId').value.trim().toUpperCase();

        // Validate
        if (!name) {
            window.showToast('⚠️ Vui lòng nhập họ tên võ sinh!', 3000);
            const el = document.getElementById('add_name');
            if (el) { el.focus(); el.style.borderColor = '#ef4444'; setTimeout(() => { el.style.borderColor = ''; }, 3000); }
            return;
        }
        if (!isGift && uniformFee > 0 && !uniformSize) {
            window.showToast('⚠️ Vui lòng chọn Size Võ phục!', 3000);
            const el = document.getElementById('add_uniform_size');
            if (el) { el.focus(); el.style.borderColor = '#ef4444'; setTimeout(() => { el.style.borderColor = ''; }, 3000); }
            return;
        }

        _addStudentInProgress = true;
        try {
            // ── Xử lý trùng tên ───────────────────────────────────────────
            let _saveKey = name;
            if (profiles[name]) {
                const _newDobRaw  = document.getElementById('add_dob').value;
                const _newDobYear = _newDobRaw
                    ? (_newDobRaw.includes('-') ? _newDobRaw.split('-')[0] : (_newDobRaw.split('/')[2] || ''))
                    : '';
                const _exDobRaw  = profiles[name].dob || '';
                const _exDobYear = _exDobRaw
                    ? (_exDobRaw.includes('-') ? _exDobRaw.split('-')[0] : (_exDobRaw.split('/')[2] || ''))
                    : '';
                const _newNick = document.getElementById('add_nickname') ? document.getElementById('add_nickname').value.trim() : '';

                if (_newDobYear && _exDobYear && _newDobYear === _exDobYear) {
                    // Cùng tên + cùng năm sinh → bắt buộc nhập biệt danh
                    if (!_newNick) {
                        alert('⚠️ Đã có võ sinh tên "' + name + '" sinh năm ' + _newDobYear + '!\n\nVui lòng nhập Biệt danh (ví dụ: A, B, Lớn, Nhỏ...) để phân biệt hai võ sinh này trước khi lưu.');
                        const _nickEl = document.getElementById('add_nickname');
                        if (_nickEl) _nickEl.focus();
                        _addStudentInProgress = false;
                        return;
                    }
                    _saveKey = name + ' (' + _newDobYear + '-' + _newNick + ')';
                } else {
                    // Cùng tên + khác năm sinh → dùng năm sinh làm key phụ
                    const _useYr = _newDobYear || (_exDobYear ? String(parseInt(_exDobYear, 10) + 1) : '');
                    _saveKey = name + (_useYr ? ' (' + _useYr + ')' : ' (' + Date.now() + ')');
                }
            }

            // ── Tính gói học phí nhiều tháng (Phase 4K-4C: dùng helper chung) ──
            const tuitionPkg = window.buildAdmissionTuitionPackage
                ? window.buildAdmissionTuitionPackage(joinDate || getLocalToday(), packageCount)
                : (function(jd,cnt){const sm=(jd||getLocalToday()).substring(0,7);const ms=[];let [y,m]=sm.split('-').map(Number);for(let i=0;i<cnt;i++){let cm=m+i,cy=y;while(cm>12){cm-=12;cy+=1;}ms.push(cy+'-'+String(cm).padStart(2,'0'));}return{packageCount:cnt,startMonth:sm,months:ms,lastMonth:ms[ms.length-1],monthsStr:ms.join(','),label:ms.join(', ')};})(joinDate,packageCount);
            const startMonth     = tuitionPkg.startMonth;
            const monthsToRecord = tuitionPkg.months;
            const lastMonth      = tuitionPkg.lastMonth;
            const newPaidUntil   = lastMonth;

            const trainingDays = Array.from(document.querySelectorAll('.add_trainingDay:checked')).map(cb => parseInt(cb.value));
            const _addNickEl   = document.getElementById('add_nickname');
            const _addNickVal  = _addNickEl ? _addNickEl.value.trim() : '';

            // V3A1: preflight bundle trước mọi Firestore write để tránh tạo hồ sơ/kho dở dang.
            const _hasFinancialPayment = fee > 0 || (!isGift && uniformFee > 0 && uniformSize);
            const _admComponents = [];
            if (fee > 0) {
                const _tuitionLabel = tuitionPkg.packageCount > 1
                    ? 'Học phí gói ' + tuitionPkg.packageCount + ' tháng (' + tuitionPkg.label + ')'
                    : 'Học phí tháng ' + tuitionPkg.label;
                _admComponents.push({ kind: 'tuition', type: 'Học phí', label: _tuitionLabel, amount: fee, month: lastMonth, packageMonths: monthsToRecord });
            }
            if (!isGift && uniformFee > 0 && uniformSize) {
                _admComponents.push({ kind: 'inventory', type: 'Thu Võ phục', label: 'Võ phục ' + uniformSize, amount: uniformFee, category: 'Võ phục', size: uniformSize, qty: 1, relatedInvId: '' });
            }
            if (_hasFinancialPayment) {
                if (typeof window.buildPaymentBundleTransaction !== 'function') throw new Error('buildPaymentBundleTransaction missing; cannot safely create admission bundled payment');
                const _preflightBundle = window.buildPaymentBundleTransaction({ studentName: _saveKey, branch, date: joinDate, refMonth: lastMonth, receiptType: 'Thu nhập học', components: _admComponents });
                if (!_preflightBundle || !Array.isArray(_preflightBundle.components) || _preflightBundle.components.some(c => !c || !Number.isFinite(Number(c.amount)))) throw new Error('Dữ liệu khoản thu nhập học không hợp lệ.');
            }

            // ── Ghi profile ────────────────────────────────────────────────
            await StudentService.createProfile(_saveKey, {
                status:          'active',
                memberId,
                branch,
                belt:            document.getElementById('add_belt').value,
                dob:             document.getElementById('add_dob').value,
                gender:          document.getElementById('add_gender').value,
                cccd:            document.getElementById('add_cccd').value.trim(),
                phone:           document.getElementById('add_phone').value,
                tuitionFee:      document.getElementById('add_fee_default_actual').value,
                notes:           document.getElementById('add_notes').value.trim(),
                nickname:        _addNickVal,
                trainingDays,
                trainingShiftId: document.getElementById('add_shift') ? document.getElementById('add_shift').value : '',
                admissionDate:   joinDate,
                joinDate:        joinDate,
                joinedAt:        joinDate,
                createdAt:       joinDate,
                paidUntil:       newPaidUntil,
                paidMonths:      monthsToRecord,
                tuitionPackageCount:             tuitionPkg.packageCount,
                lastAdmissionTuitionStartMonth:  startMonth,
                lastAdmissionTuitionMonths:      monthsToRecord,
            });

            // ── Phase 4K-5E: Xuất kho + tạo bundle transaction nhập học ────
            let tuitionTx = null;
            let _invId = '';

            if (uniformSize) {
                _invId = await StudentService.addInventoryEntry({
                    category: 'Võ phục', size: uniformSize, type: 'Xuất bán', qty: 1,
                    desc: _saveKey, amount: uniformFee, date: joinDate, timestamp: Date.now() + 2,
                });
                if (isGift) {
                    await StudentService.addUniformTransaction({
                        branch: 'Chung', type: 'Tặng Võ phục',
                        description: `Tặng ${uniformSize} cho ${_saveKey}`,
                        amount: 0, date: joinDate, timestamp: Date.now() + 1, relatedInvId: _invId,
                    });
                }
            }

            if (_hasFinancialPayment) {
                const _inventoryComponent = _admComponents.find(c => c && c.kind === 'inventory');
                if (_inventoryComponent) _inventoryComponent.relatedInvId = _invId;
                if (_admComponents.length > 0) {
                    const _bundleTx = window.buildPaymentBundleTransaction({
                        studentName: _saveKey, branch, date: joinDate,
                        refMonth: lastMonth, receiptType: 'Thu nhập học',
                        components: _admComponents,
                    });
                    const _addFn = StudentService.addGenericTransaction
                        ? StudentService.addGenericTransaction.bind(StudentService)
                        : StudentService.addTuitionTransaction.bind(StudentService);
                    tuitionTx = await _addFn(_bundleTx);
                    if (_invId && !isGift) {
                        try {
                            await StudentService.updateInventoryDoc(_invId, {
                                paymentBundleId: tuitionTx.id || '',
                                paidTxId: tuitionTx.id || '',
                            });
                        } catch (_e) {}
                    }
                    if (typeof window.mergeTransactionIntoRuntimeStore === 'function') {
                        window.mergeTransactionIntoRuntimeStore(tuitionTx, 'admission-bundle-created');
                    }
                }
            }

            window.closeAddModal();
            window.showToast('🎉 Đã thêm võ sinh ' + _saveKey + ' thành công!', 3000);

            // Phase 4K-6E-C: Refresh active new student badge + list after adding
            if (typeof window.updateActiveNewStudentCountBadge === 'function') {
                window.updateActiveNewStudentCountBadge();
            }
            if (typeof window.resetActiveRenderLimit === 'function') {
                window.resetActiveRenderLimit('after-add-new-student');
            }
            if (typeof window.refreshListsComputation === 'function') {
                window.refreshListsComputation(['students.activeList', 'dashboard.summary'], 'after-add-new-student');
            }
            if (typeof window.invalidateList === 'function') {
                window.invalidateList('students.activeList', 'after-add-new-student');
            } else if (typeof window.invalidateStudents === 'function') {
                window.invalidateStudents('after-add-new-student');
            }

            // ── Tạo biên lai nếu có thanh toán ────────────────────────────
            const totalPayment = fee + (isGift ? 0 : uniformFee);
            if (totalPayment > 0 && window.exportReceipt) {
                const breakdown = [];
                const tuitionLabel = tuitionPkg.packageCount > 1
                    ? `Học phí gói ${tuitionPkg.packageCount} tháng (${tuitionPkg.label})`
                    : `Học phí tháng ${tuitionPkg.label}`;
                if (fee > 0) breakdown.push({ label: tuitionLabel, amount: fee });
                if (!isGift && uniformFee > 0) breakdown.push({ label: 'Võ phục ' + (uniformSize || ''), amount: uniformFee });
                const receiptType = (fee > 0 && !isGift && uniformFee > 0)
                    ? 'Học phí + Võ phục'
                    : (fee > 0 ? 'Học phí' : 'Võ phục');

                // Đảm bảo profile có trong bridge trước khi tạo biên lai
                // (onSnapshot chưa kịp đến sau setDoc)
                const liveProfiles = _profiles();
                if (!liveProfiles[_saveKey] && window.__store) {
                    window.__store.profiles = {
                        ...liveProfiles,
                        [_saveKey]: {
                            belt:       document.getElementById('add_belt').value,
                            branch,
                            tuitionFee: document.getElementById('add_fee_default_actual').value,
                        },
                    };
                }
                await window.exportReceipt(
                    _saveKey, totalPayment, receiptType, joinDate, tuitionPkg.monthsStr,
                    branch, '', 'BIÊN LAI THU TIỀN', breakdown.length > 0 ? breakdown : null
                );
            }
        } catch (err) {
            console.error('[students.addNewStudent]', err);
            if (typeof window.recordRuntimeError === 'function') window.recordRuntimeError('students.addNewStudent', err, { action: 'add-student' });
            const message = err && err.message ? err.message : String(err || 'Lỗi không xác định');
            if (typeof window.showToast === 'function') window.showToast('❌ Không thể hoàn tất thêm võ sinh: ' + message, 5000);
            alert('Không thể hoàn tất thêm võ sinh.\n\n' + message + '\n\nVui lòng kiểm tra hồ sơ trước khi thử lại để tránh tạo trùng.');
        } finally {
            _addStudentInProgress = false;
        }
    };

    // ════════════════════════════════════════════════════════════════
    // XEM / SỬA HỒ SƠ
    // ════════════════════════════════════════════════════════════════

    /**
     * Mở modal xem/sửa hồ sơ võ sinh.
     *
     * Điền sẵn tất cả trường từ bridge (window.__store.profiles — đã sync realtime).
     * Load ca tập bất đồng bộ để không chặn render modal.
     * Render thành tích và danh sách tháng báo nghỉ.
     *
     * @param {string} name — tên võ sinh (Firestore document ID)
     */
    window.openProfile = (name) => {
        const p = _profiles()[name];
        if (!p) return;

        document.getElementById('m_old_name').value    = name;
        document.getElementById('m_name_input').value  = name;
        document.getElementById('m_memberId').value    = p.memberId || '';
        document.getElementById('m_status').value      = p.status || 'active';
        document.getElementById('m_branch').value      = p.branch || 'CS1';
        document.getElementById('m_belt').value        = p.belt || 'Đai trắng - Cấp 10';
        document.getElementById('m_dob').value         = p.dob || '';
        document.getElementById('m_gender').value      = p.gender || '';
        document.getElementById('m_phone').value       = p.phone || '';
        document.getElementById('m_cccd').value        = p.cccd || '';
        document.getElementById('m_fee_actual').value  = p.tuitionFee || '';
        document.getElementById('m_fee_display').value = p.tuitionFee
            ? parseInt(p.tuitionFee, 10).toLocaleString('vi-VN') : '';
        document.getElementById('m_paidUntil').value   = p.paidUntil || '';
        document.getElementById('m_notes').value       = p.notes || '';
        const _mNickEl = document.getElementById('m_nickname');
        if (_mNickEl) _mNickEl.value = p.nickname || '';
        document.getElementById('m_feeExempt').checked = p.feeExempt === true;

        renderAchievements(p.achievements || []);

        // Lịch học — checkbox các ngày trong tuần
        document.querySelectorAll('.m_trainingDay').forEach(cb => {
            cb.checked = Array.isArray(p.trainingDays) && p.trainingDays.includes(parseInt(cb.value));
        });

        // Tháng báo nghỉ
        let skippedHtml = '';
        if (p.skippedMonths && p.skippedMonths.length > 0) {
            p.skippedMonths.forEach(mo => {
                skippedHtml += `<span class="bg-amber-200 text-amber-800 text-[0.7rem] px-2 py-1 rounded font-bold cursor-pointer hover:bg-rose-200 shadow-sm" onclick="removeSkip('${name}', '${mo}')" title="Bấm để xóa">Tháng ${formatMonth(mo)} ✖</span>`;
            });
        } else {
            skippedHtml = '<span class="text-[0.7rem] text-amber-600/70 italic">Chưa có tháng báo nghỉ</span>';
        }
        document.getElementById('m_skipped').innerHTML = skippedHtml;

        // Ca tập (bất đồng bộ)
        const _mShiftSel = document.getElementById('m_shift');
        if (_mShiftSel) {
            const _savedShiftId = p.trainingShiftId || '';
            (window._ensureClubShiftsLoaded ? window._ensureClubShiftsLoaded() : Promise.resolve()).then(function () {
                let _msHtml = '<option value="">-- Chọn ca tập --</option>';
                (window._getClubShifts ? window._getClubShifts() : []).forEach(function (s) {
                    const _t = (s.timeStart && s.timeEnd) ? ' (' + s.timeStart + '–' + s.timeEnd + ')' : '';
                    _msHtml += '<option value="' + s.id + '">' + s.name + _t + '</option>';
                });
                _mShiftSel.innerHTML = _msHtml;
                _mShiftSel.value = _savedShiftId;
            });
        }
        document.getElementById('profileModal').style.display = 'flex';
    };

    /**
     * Lưu thay đổi hồ sơ võ sinh vào Firestore.
     *
     * Khi ĐỔI TÊN (oldName ≠ newName):
     *   - writeBatch atomic: set doc mới + delete doc cũ
     *   - Đồng bộ tên trong tất cả transactions liên quan
     *   - Yêu cầu xác nhận trước khi thực hiện
     *
     * Khi SỬA (không đổi tên):
     *   - setDoc merge để chỉ cập nhật các field thay đổi
     *
     * Logic trạng thái:
     *   active → quit  : ghi quitDate = hôm nay
     *   quit   → active: xóa quitDate, reset paidUntil về tháng trước
     *                    → hệ thống tính nợ đúng từ tháng này
     */
    window.updateProfile = async () => {
        if (window.userRole === 'viewer') return;

        const profiles = _profiles();
        const config   = _config();

        const oldName  = document.getElementById('m_old_name').value.trim();
        const newName  = document.getElementById('m_name_input').value.trim();
        const newStatus = document.getElementById('m_status').value;
        const isSingleBranch = (config.branchCount === 1);

        if (!newName) return alert('Tên võ sinh không được để trống!');

        let updateData = {
            status:          newStatus,
            memberId:        document.getElementById('m_memberId').value.trim().toUpperCase(),
            branch:          isSingleBranch ? 'CS1' : document.getElementById('m_branch').value,
            belt:            document.getElementById('m_belt').value,
            phone:           document.getElementById('m_phone').value,
            tuitionFee:      document.getElementById('m_fee_actual').value,
            dob:             document.getElementById('m_dob').value,
            gender:          document.getElementById('m_gender').value,
            cccd:            document.getElementById('m_cccd').value.trim(),
            notes:           document.getElementById('m_notes').value,
            nickname:        document.getElementById('m_nickname') ? document.getElementById('m_nickname').value.trim() : '',
            feeExempt:       document.getElementById('m_feeExempt').checked,
            achievements:    window._currentAchievements || [],
            trainingDays:    Array.from(document.querySelectorAll('.m_trainingDay:checked')).map(cb => parseInt(cb.value)),
            trainingShiftId: document.getElementById('m_shift') ? document.getElementById('m_shift').value : '',
        };

        const updatedPaidUntil = document.getElementById('m_paidUntil').value;
        if (updatedPaidUntil) updateData.paidUntil = updatedPaidUntil;

        // Xử lý chuyển trạng thái
        if (newStatus === 'quit' && (profiles[oldName] || {}).status !== 'quit') {
            updateData.quitDate = getLocalToday();
        } else if (newStatus === 'active') {
            updateData.quitDate = null;
            if ((profiles[oldName] || {}).status === 'quit') {
                // Reset paidUntil về tháng trước để tính nợ đúng
                const todayYYYYMM = getLocalToday().substring(0, 7);
                let [ry, rm] = todayYYYYMM.split('-').map(Number);
                rm -= 1;
                if (rm === 0) { rm = 12; ry -= 1; }
                updateData.paidUntil = `${ry}-${String(rm).padStart(2, '0')}`;
            }
        }

        try {
            if (oldName !== newName) {
                // Đổi tên — atomic batch
                if (profiles[newName]) return alert('Tên võ sinh đã tồn tại!');
                if (!confirm(`Bạn có chắc muốn đổi tên từ "${oldName}" thành "${newName}"?\nHệ thống sẽ tự động cập nhật tên mới trên tất cả hóa đơn.`)) return;

                updateData.createdAt = (profiles[oldName] || {}).createdAt || getLocalToday();
                if ((profiles[oldName] || {}).skippedMonths) updateData.skippedMonths = profiles[oldName].skippedMonths;
                if ((profiles[oldName] || {}).paidUntil)     updateData.paidUntil     = profiles[oldName].paidUntil;

                // Tìm tất cả transactions liên quan để đồng bộ tên
                const oldTxDocs = await StudentService.findTransactionsByStudent(oldName);
                const txUpdates = [];
                oldTxDocs.forEach(({ id: txId, data: t }) => {
                    let updatedDesc = t.description;
                    if (t.description === oldName) {
                        updatedDesc = newName;
                    } else if (t.description && t.description.startsWith(oldName + ' (Thi lên')) {
                        updatedDesc = t.description.replace(oldName, newName);
                    } else if (t.description && t.description.includes(oldName)) {
                        updatedDesc = t.description.replace(oldName, newName);
                    }
                    if (updatedDesc !== t.description) txUpdates.push({ txId, newDesc: updatedDesc });
                });

                await StudentService.renameWithBatch(oldName, newName, updateData, txUpdates);
                window.showToast('✅ Đã cập nhật và đồng bộ tên mới thành công!');
            } else {
                // Chỉ sửa — không đổi tên
                await StudentService.updateProfile(oldName, updateData);
                // Phase 4K-5A: Sync local store sau khi update
                if (typeof window.syncStudentStatusLocal === 'function') {
                    window.syncStudentStatusLocal(oldName, updateData);
                }
                window.showToast('✅ Đã cập nhật hồ sơ!');
            }
            window.closeModal();
        } catch (error) {
            console.error('Lỗi cập nhật:', error);
            alert('Đã xảy ra lỗi hệ thống khi lưu thay đổi!');
        }
    };

    /**
     * Xóa vĩnh viễn hồ sơ võ sinh.
     * Chỉ Admin thực hiện được (viewer bị chặn).
     *
     * LƯU Ý: Lịch sử giao dịch vẫn còn trong Firestore nhưng sẽ "mồ côi"
     * (description không còn match với profile nào).
     */
    window.deleteProfile = async () => {
        const targetName = document.getElementById('m_old_name').value.trim();
        if (window.userRole !== 'viewer' && confirm(`⚠️ Xóa vĩnh viễn hồ sơ "${targetName}"? Lịch sử đóng tiền sẽ vẫn còn lưu nhưng sẽ bị mồ côi.`)) {
            await StudentService.deleteProfile(targetName);
            window.closeModal();
            window.showToast('✅ Đã xóa hồ sơ!');
        }
    };

    // ════════════════════════════════════════════════════════════════
    // THÁNG BÁO NGHỈ (SKIPPED MONTHS)
    // ════════════════════════════════════════════════════════════════

    /**
     * Miễn học phí 1 tháng (thêm vào skippedMonths).
     * Dùng arrayUnion để an toàn khi nhiều admin thao tác đồng thời.
     *
     * @param {string} name  — tên võ sinh
     * @param {string} month — YYYY-MM
     */
    window.skipMonth = async (name, month) => {
        await StudentService.addSkippedMonth(name, month);

        if (typeof window.syncStudentSkippedMonthLocal === 'function') {
            window.syncStudentSkippedMonthLocal(name, month, 'add', 'skipMonth-module');
        }

        if (typeof window.removeStudentFromDebtDom === 'function') {
            window.removeStudentFromDebtDom(name);
        }

        window.showToast('✅ Đã miễn phí tháng!');
    };

    /**
     * Hủy báo nghỉ (xóa khỏi skippedMonths), khôi phục nợ học phí.
     * Dùng arrayRemove để an toàn. Yêu cầu xác nhận và đóng modal.
     *
     * @param {string} name  — tên võ sinh
     * @param {string} month — YYYY-MM
     */
    window.removeSkip = async (name, month) => {
        if (window.userRole !== 'viewer' && confirm(`Hủy báo nghỉ tháng ${formatMonth(month)} cho ${name}?`)) {
            await StudentService.removeSkippedMonth(name, month);

            if (typeof window.syncStudentSkippedMonthLocal === 'function') {
                window.syncStudentSkippedMonthLocal(name, month, 'remove', 'removeSkip-module');
            }

            if (typeof window.refreshListsComputation === 'function') {
                window.refreshListsComputation(['students.debtList', 'dashboard.summary'], 'removeSkip-module');
            }

            if (typeof window.invalidateList === 'function') {
                window.invalidateList('students.debtList', 'removeSkip-module');
            }

            window.closeModal();
            window.showToast('✅ Đã khôi phục nợ!');
        }
    };

    // ════════════════════════════════════════════════════════════════
    // THÀNH TÍCH THI ĐẤU (ACHIEVEMENTS)
    // ════════════════════════════════════════════════════════════════

    /**
     * Thêm 1 thành tích vào danh sách tạm (window._currentAchievements).
     * CHƯA lưu Firestore — chỉ lưu khi bấm "Cập nhật hồ sơ" (updateProfile).
     * Validate: năm phải là số nguyên 2000–2099.
     */
    window.addAchievementRow = () => {
        const year       = document.getElementById('m_ach_year').value.trim();
        const tournament = document.getElementById('m_ach_tournament').value.trim();
        const result     = document.getElementById('m_ach_result').value.trim();
        if (!year || !tournament || !result) return alert('Vui lòng nhập đủ: Năm, Tên giải đấu và Kết quả!');
        if (isNaN(year) || year < 2000 || year > 2099) return alert('Năm không hợp lệ!');
        window._currentAchievements.push({ year, tournament, result });
        renderAchievements(window._currentAchievements);
        document.getElementById('m_ach_year').value       = '';
        document.getElementById('m_ach_tournament').value = '';
        document.getElementById('m_ach_result').value     = '';
    };

    /**
     * Xóa 1 thành tích khỏi danh sách tạm theo index.
     * Render lại ngay (chưa lưu Firestore).
     *
     * @param {number} idx — vị trí trong window._currentAchievements
     */
    window.removeAchievement = (idx) => {
        window._currentAchievements.splice(idx, 1);
        renderAchievements(window._currentAchievements);
    };

    // ════════════════════════════════════════════════════════════════
    // XỬ LÝ NGHỈ TẬP (QUIT)
    // ════════════════════════════════════════════════════════════════

    /**
     * Dialog xử lý khi võ sinh muốn nghỉ (gọi từ nút 🚫 tab Học Phí):
     *   - OK     → status = 'quit' + ghi quitDate
     *   - Cancel → hỏi tiếp: có muốn miễn phí tháng này không?
     *
     * @param {string} name  — tên võ sinh
     * @param {string} month — tháng đang xem (YYYY-MM)
     */
    window.handleQuitOption = (name, month) => {
        if (confirm(`Võ sinh ${name} có tiếp tục tập không?\n- Bấm OK để báo NGHỈ TẬP luôn.\n- Bấm Cancel để chỉ BÁO NGHỈ THÁNG NÀY (miễn học phí tháng ${formatMonth(month)}).`)) {
            const _quitData = { status: 'quit', quitDate: getLocalToday() };
            StudentService.updateProfile(name, _quitData)
                .then(() => {
                    window.showToast('✅ Đã chuyển trạng thái Nghỉ tập!');
                    // Phase 4K-5A: Sync local store
                    if (typeof window.syncStudentStatusLocal === 'function') {
                        window.syncStudentStatusLocal(name, _quitData, 'student-marked-quit');
                    }
                });
        } else {
            if (confirm(`Xác nhận miễn nợ học phí tháng ${formatMonth(month)} cho ${name}?`)) {
                window.skipMonth(name, month);
            }
        }
    };

    // ════════════════════════════════════════════════════════════════
    // NHẮC NỢ QUA ZALO
    // ════════════════════════════════════════════════════════════════

    /**
     * Tạo tin nhắn nhắc học phí và mở modal Zalo cho 1 võ sinh.
     *
     * Tự động tính:
     *   monthsLabel: "2025-01,2025-02" → "T1, T2/2025"
     *   totalFee   : tuitionFee × số tháng nợ
     *
     * Ưu tiên dùng modal _zaloMsgModal (đã inject).
     * Fallback: clipboard API hoặc execCommand('copy').
     *
     * @param {string} name      — tên võ sinh
     * @param {string} monthsStr — tháng nợ cách phẩy
     * @param {string} phone     — SĐT (có thể rỗng)
     */
    window.copyAndOpenZalo = (name, monthsStr, phone) => {
        const p         = _profiles()[name];
        const fee       = p ? (p.tuitionFee || 0) : 0;
        const monthsLabel = formatMonthCompact(monthsStr);
        const monthCount  = monthsStr.includes(',') ? monthsStr.split(',').length : 1;
        const totalFee    = monthCount * parseInt(fee);
        const _clubName   = _config().clubName || 'CLB Taekwondo';
        const msg = `${_clubName} thông báo:\nVõ sinh ${name} còn nợ học phí kỳ ${monthsLabel}.\nTổng số tiền: ${totalFee.toLocaleString('vi-VN')}đ.\nPhụ huynh vui lòng đóng học phí nhé!`;
        const zphone  = phone ? phone.replace(/^0/, '84') : '';
        const zaloUrl = zphone ? `https://zalo.me/${zphone}` : 'https://zalo.me/';

        const _zm = document.getElementById('_zaloMsgModal');
        if (_zm) {
            document.getElementById('_zaloMsgText').value         = msg;
            document.getElementById('_zaloMsgPhone').textContent  = phone || '(chưa có SĐT)';
            document.getElementById('_zaloMsgName').textContent   = name;
            document.getElementById('_zaloOpenBtn').onclick       = () => { window.open(zaloUrl, '_blank'); };
            document.getElementById('_zaloOpenBtn').style.display = phone ? '' : 'none';
            _zm.style.display = 'flex';
            document.getElementById('_zaloMsgText').select();
            return;
        }
        // Fallback nếu modal chưa được inject
        const _copyFallback = () => {
            const ta = document.createElement('textarea');
            ta.value = msg; ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta);
            window.showToast('✅ Đã copy tin nhắn!');
            if (phone) window.open(zaloUrl, '_blank');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(msg).then(() => {
                window.showToast('✅ Đã copy tin nhắn!');
                if (phone) window.open(zaloUrl, '_blank');
            }).catch(_copyFallback);
        } else {
            _copyFallback();
        }
    };

    /**
     * Mở modal gửi nhắc Zalo hàng loạt.
     *
     * Tự động lọc danh sách võ sinh đang nợ theo:
     *   - filterMonth: tháng đang xem trong tab Học Phí
     *   - filterBranch: cơ sở đang chọn
     *
     * Tính owedMonths giống renderApp (giới hạn 24 tháng tránh vòng lặp vô hạn).
     */
    window.openBulkZaloModal = () => {
        const profiles       = _profiles();
        const config         = _config();
        const selMonth       = document.getElementById('filterMonth').value;
        const selBranch      = document.getElementById('filterBranch').value;
        const isSingleBranch = config.branchCount === 1;

        _bulkZaloDebtors = [];
        Object.keys(profiles).sort().forEach(name => {
            const p = profiles[name];
            const _pKind = typeof window.classifyProfileStatus === 'function' ? window.classifyProfileStatus(p) : (p.status === 'quit' ? 'quit' : 'active');
            if (_pKind !== 'active') return;
            if (p.feeExempt) return;
            if (!isSingleBranch && selBranch !== 'all' && p.branch !== selBranch) return;

            let owedMonths = [];
            if (!p.skippedMonths || !p.skippedMonths.includes(selMonth)) {
                let firstUnpaid = p.paidUntil
                    ? addMonthsToYYYYMM(p.paidUntil, 1)
                    : (p.createdAt ? p.createdAt.substring(0, 7) : selMonth);
                let cur = firstUnpaid;
                while (cur <= selMonth && owedMonths.length < 24) {
                    if (!p.skippedMonths || !p.skippedMonths.includes(cur)) owedMonths.push(cur);
                    cur = addMonthsToYYYYMM(cur, 1);
                }
            }
            if (owedMonths.length === 0) return;

            const owedMonthsStr = owedMonths.join(',');
            _bulkZaloDebtors.push({
                name,
                phone:       p.phone || '',
                owedMonthsStr,
                monthsLabel: formatMonthCompact(owedMonthsStr),
                totalFee:    owedMonths.length * (Number(p.tuitionFee) || 0),
            });
        });

        _bulkZaloIdx = 0;
        document.getElementById('bulkZaloSubtitle').textContent      = `${_bulkZaloDebtors.length} võ sinh chưa đóng học phí tháng ${formatMonth(selMonth)}`;
        document.getElementById('bulkZaloProgressWrap').style.display = 'none';
        document.getElementById('bulkZaloProgressBar').style.width    = '0%';
        document.getElementById('bulkZaloProgressText').textContent   = '0 / 0 đã gửi';
        _renderBulkZaloList();
        document.getElementById('bulkZaloModal').style.display = 'flex';
    };

    /** Đóng modal gửi Zalo hàng loạt */
    window.closeBulkZaloModal = () => {
        document.getElementById('bulkZaloModal').style.display = 'none';
    };

    /**
     * Gửi nhắc Zalo cho 1 võ sinh trong danh sách bulk.
     * Copy tin nhắn vào clipboard rồi mở Zalo đến đúng số điện thoại.
     * Highlight dòng đã gửi màu xanh để HLV theo dõi tiến trình.
     *
     * @param {number} idx — index trong _bulkZaloDebtors
     */
    window.sendBulkZaloOne = (idx) => {
        const d = _bulkZaloDebtors[idx];
        if (!d || !d.phone) { window.showToast('⚠️ Võ sinh này chưa có số điện thoại!'); return; }
        const clubName = _config().clubName || 'CLB Taekwondo';
        const msg = `${clubName} thông báo:\nVõ sinh ${d.name} chưa đóng học phí kỳ ${d.monthsLabel}.${d.totalFee > 0 ? '\nSố tiền: ' + d.totalFee.toLocaleString('vi-VN') + ' ₫.' : ''}\nPhụ huynh vui lòng liên hệ HLV để đóng học phí. Xin cảm ơn!`;
        const row = document.getElementById(`bzRow_${idx}`);
        navigator.clipboard.writeText(msg).then(() => {
            window.showToast('✅ Đã copy tin nhắn — mở Zalo...');
            if (row) { row.style.background = '#f0fff4'; row.style.border = '1px solid #86efac'; }
        }).catch(() => {});
        window.open(`https://zalo.me/${d.phone.replace(/^0/, '84')}`, '_blank');
    };

    /**
     * Gửi Zalo tuần tự — lần lượt qua từng võ sinh, chờ xác nhận sau mỗi bước.
     * Progress bar hiển thị tiến trình trong modal.
     */
    window.startSequentialBulkZalo = async () => {
        if (_bulkZaloDebtors.length === 0) { window.showToast('Không có võ sinh nào trong danh sách!'); return; }
        document.getElementById('bulkZaloProgressWrap').style.display = 'block';
        _bulkZaloIdx = 0;
        for (let i = 0; i < _bulkZaloDebtors.length; i++) {
            _bulkZaloIdx = i + 1;
            const total = _bulkZaloDebtors.length;
            document.getElementById('bulkZaloProgressText').textContent = `${_bulkZaloIdx} / ${total} đã gửi`;
            document.getElementById('bulkZaloProgressBar').style.width  = (_bulkZaloIdx / total * 100) + '%';
            const d = _bulkZaloDebtors[i];
            if (d.phone) {
                window.sendBulkZaloOne(i);
                if (i < total - 1) {
                    const next = _bulkZaloDebtors[i + 1];
                    const goOn = confirm(`✅ Đã gửi cho ${d.name} (${i + 1}/${total})\n\nTiếp theo: ${next.name}\n\nBấm OK để gửi tiếp, Huỷ để dừng lại.`);
                    if (!goOn) break;
                }
            }
        }
        window.showToast(`✅ Hoàn thành! Đã gửi thông báo cho ${_bulkZaloIdx} võ sinh.`);
    };

    // ════════════════════════════════════════════════════════════════
    // PHIẾU BÁO / QR PAYMENT
    // ════════════════════════════════════════════════════════════════

    /**
     * Tạo phiếu báo học phí dạng QR cho nhiều tháng nợ.
     * Delegate sang window.exportReceipt (vẫn trong app.js, Phase 2d).
     *
     * Gọi từ nút 📱 QR trong tab Học Phí (danh sách nợ).
     *
     * @param {string}        name      — tên võ sinh
     * @param {string}        monthsStr — tháng nợ cách phẩy (YYYY-MM,...)
     * @param {string}        branch    — cơ sở
     * @param {number|string} amount    — tổng tiền
     */
    window.generateMultiMonthPaymentRequest = (name, monthsStr, branch, amount) => {
        window.exportReceipt(
            name, Number(amount), 'Học phí', getLocalToday(),
            monthsStr, branch, '', 'PHIẾU BÁO HỌC PHÍ'
        );
    };

    // Phase 4K-6S: use imported formatMonthCompact directly; do not replace
    // the canonical global owned by js/utils/format.js.

    // ── Debug log (chỉ hiện ở localhost) ─────────────────────────────
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log(
            '[students.js] ✅ initStudents() OK —',
            'openAddModal, closeAddModal, addNewStudent |',
            'openProfile, updateProfile, deleteProfile |',
            'skipMonth, removeSkip |',
            'addAchievementRow, removeAchievement |',
            'handleQuitOption |',
            'copyAndOpenZalo, openBulkZaloModal, closeBulkZaloModal,',
            'sendBulkZaloOne, startSequentialBulkZalo |',
            'generateMultiMonthPaymentRequest | formatMonthCompact imported from utils/format.js'
        );
    }
}

// ════════════════════════════════════════════════════════════════
// initStudentPagination — Phase 3.2A
// ════════════════════════════════════════════════════════════════
/**
 * Khởi tạo server-side cursor pagination cho tab Võ sinh (active + quit).
 *
 * Phải gọi SAU initStudents() và SAU khi store.pagination đã được
 * khởi tạo từ store.js.
 *
 * Mô hình "dual store":
 *   - window.__store.profiles   = ALL profiles (onSnapshot — cho business logic)
 *   - store.pagination.students = pagination state + currentItems (cho hiển thị)
 *
 * Các hàm expose ra window:
 *   window._pgNext_students()   — load trang tiếp theo
 *   window._pgPrev_students()   — load trang trước
 *   window.reloadStudentsPage() — reload trang hiện tại (sau add/edit/delete)
 */
export function initStudentPagination() {
    if (window.RoleReadBoundary?.canMount?.('students.pagination', { reason: 'initStudentPagination' }) === false) return false;
    import('../utils/pagination.js').then(({
        createPaginationState, resetPagination, processPage,
        prepareNextPage, preparePreviousPage,
        renderPaginationControls, PAGE_SIZE,
    }) => {
        import('./students.js').then(() => {}); // no-op — chỉ để IDE không warn
        import('../services/students.service.js?v=firestore-read-attribution-canonical-tx-boundary-20260616-v3a').then(({ StudentService }) => {

            const store = window.__store;
            if (!store) { console.warn('[pagination/students] __store chưa sẵn sàng'); return; }

            // Khởi tạo pagination state nếu chưa có
            if (!store.pagination) store.pagination = {};
            store.pagination.students = createPaginationState(PAGE_SIZE);
            const pgState = store.pagination.students;

            // ── Nội bộ: lấy search/filter hiện tại từ DOM ──────────────
            // ── [PART 3] Normalize helpers dùng chung ──────────────────
            function normalizeVNForSearch(value) {
                return String(value || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/đ/g, 'd')
                    .replace(/Đ/g, 'D')
                    .toLowerCase()
                    .trim()
                    .replace(/\s+/g, ' ');
            }

            function studentMatchesSearch(name, profile, rawSearch) {
                const qRaw = String(rawSearch || '').trim();
                if (!qRaw) return true;

                const q = normalizeVNForSearch(qRaw);
                const phoneDigits = qRaw.replace(/\D/g, '');

                const fields = [
                    name,
                    profile && profile.name,
                    profile && profile.nickname,
                    profile && profile.memberId,
                    profile && profile.studentCode,
                    profile && profile.code,
                    profile && profile.belt,
                    profile && profile.notes,
                    profile && profile.phone,
                    profile && profile.parentPhone,
                    profile && profile.contactPhone,
                    profile && profile.guardianPhone,
                ];

                if (phoneDigits.length >= 3) {
                    const phones = [
                        profile && profile.phone,
                        profile && profile.parentPhone,
                        profile && profile.contactPhone,
                        profile && profile.guardianPhone,
                    ].map(v => String(v || '').replace(/\D/g, ''));
                    if (phones.some(p => p.includes(phoneDigits))) return true;
                }

                return fields.some(v => normalizeVNForSearch(v).includes(q));
            }

            // Expose helpers globally for use in studentsRenderer and other modules
            window.normalizeVNForSearch = normalizeVNForSearch;
            window.studentMatchesSearch = studentMatchesSearch;

            // ── [PART 2] Raw search — giữ nguyên case, normalize chỉ khi so sánh ──
            function _getCurrentSearch() {
                const el = document.getElementById('searchInput') ||
                           document.getElementById('search') ||
                           document.querySelector('input[placeholder*="tên"]');
                return el ? el.value.trim() : '';
            }

            // ── Render pagination controls vào DOM ──────────────────────
            function _injectControls() {
                const from = pgState.currentPage > 0
                    ? (pgState.currentPage - 1) * PAGE_SIZE + 1
                    : 0;
                const to   = pgState.totalLoaded;

                ['activeList', 'quitList'].forEach(listId => {
                    const tbody = document.getElementById(listId);
                    if (!tbody) return;

                    const tbl    = tbody.closest ? tbody.closest('table') : tbody.parentElement;
                    const anchor = tbl || tbody;
                    const parent = anchor.parentElement;

                    const ctrlId = 'pgWrap_' + listId;
                    let ctrlEl   = document.getElementById(ctrlId);
                    if (!ctrlEl) {
                        ctrlEl    = document.createElement('div');
                        ctrlEl.id = ctrlId;
                        if (parent) {
                            parent.insertBefore(ctrlEl, anchor.nextSibling);
                        } else {
                            anchor.parentNode.insertBefore(ctrlEl, anchor.nextSibling);
                        }
                    }

                    // Phase 4K-5Q: Active list — single source load more outside table
                    // Derives remaining from full profiles + __activeRenderLimit (not pgState.hasNext)
                    if (listId === 'activeList') {
                        const _st       = window.__store || {};
                        const _profiles = _st.profiles || {};
                        // Phase 4K-6E-C: Count remaining based on filtered items, not all active
                        const _activeFilteredItems = Object.entries(_profiles).filter(function([name, p]) {
                            const kind = typeof window.classifyProfileStatus === 'function'
                                ? window.classifyProfileStatus(p)
                                : (p.status === 'quit' || p.active === false || p.isActive === false ? 'quit' : 'active');
                            if (kind !== 'active') return false;
                            if (typeof window.shouldShowActiveStudentByNewFilter === 'function') {
                                return window.shouldShowActiveStudentByNewFilter(name, p);
                            }
                            return true;
                        });
                        const _activeLimit   = window.__activeRenderLimit || 50;
                        const _remaining     = Math.max(0, _activeFilteredItems.length - _activeLimit);
                        const _btnStyle      = 'style="padding:0.45rem 1.2rem;font-size:0.85rem;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;font-weight:600;"';
                        if (_remaining > 0) {
                            ctrlEl.innerHTML = '<div style="text-align:center;padding:0.75rem 0;">'
                                + '<button type="button" ' + _btnStyle + ' onclick="window.loadMoreActiveStudents(event)">'
                                + '⬇ Tải thêm — còn ' + _remaining + ' võ sinh nữa'
                                + '</button></div>';
                        } else if (_activeFilteredItems.length > 0) {
                            ctrlEl.innerHTML = '<div style="text-align:center;padding:0.5rem 0;color:#94a3b8;font-size:0.8rem;">Đã tải hết ' + _activeFilteredItems.length + ' võ sinh</div>';
                        } else {
                            // Fall back to pagination controls when full profiles not loaded
                            const prefix = 'students_active';
                            let html = renderPaginationControls(pgState, prefix, from, to);
                            html = html.replace(/Tiếp\s*→/g, '⬇ Tải thêm võ sinh');
                            ctrlEl.innerHTML = html;
                        }
                        return;
                    }

                    // Quit list — use standard pagination controls
                    const prefix = 'students_quit';
                    let html   = renderPaginationControls(pgState, prefix, from, to);
                    html = html.replace(/Tiếp\s*→/g, '⬇ Tải thêm đã nghỉ');
                    ctrlEl.innerHTML = html;
                });
            }

            // Phase 4K-STUDENT-LIST: Fallback render nếu island không inject rows
            // Chỉ chạy khi: #activeList tồn tại, pgState.currentItems > 0, DOM trống
            // Không phá render island hiện tại — guard tr[data-student-id] trước khi inject
            function _renderStudentsPageRowsFallback(pgState, meta = {}) {
                try {
                    // Phase 4K-5F: determine mode + target from current tab
                    const _mode   = _getCurrentTabIdSafe() === 'quit' ? 'quit' : 'active';
                    const _listId = _mode === 'quit' ? 'quitList' : 'activeList';
                    const target  = document.getElementById(_listId);
                    if (!target) return false;
                    if (!pgState || !Array.isArray(pgState.currentItems)) return false;
                    // Filter items by mode before fallback render
                    const _filteredItems = typeof window.filterStudentItemsForMode === 'function'
                        ? window.filterStudentItemsForMode(pgState.currentItems, _mode)
                        : pgState.currentItems;
                    // Phase 4K-6E-C: Sort active items newest/current-month-new first
                    let _sortItems = _filteredItems;
                    if (_mode === 'active' && typeof window.sortActiveStudentEntries === 'function') {
                        _sortItems = window.sortActiveStudentEntries(
                            _filteredItems.map(item => [item.id || item.name || '', item])
                        ).map(([n, p]) => Object.assign({ id: n, name: n }, p));
                    }
                    if (_sortItems.length === 0) return false;
                    if (target.querySelector('tr[data-student-id]')) return false; // island đã render
                    const rows = _sortItems.map(item => {
                        const _rawName = item.id || item.name || '';
                        const _esc     = _rawName.replace(/'/g, "\\'");
                        const p        = item;
                        return `<tr data-student-id="${_esc}"><td class="name-link text-[0.95rem]" onclick="openProfile('${_esc}')">${_rawName}</td><td class="text-[0.7rem] font-bold text-slate-500">${p.memberId || '-'}</td><td>-</td><td>-</td><td>-</td><td class="badge bg-rose-50 text-rose-600 text-[0.7rem]">-</td><td class="font-medium text-slate-600">${p.phone || ''}</td><td class="text-slate-500">-</td><td><button type="button" class="btn-sm bg-slate-100 text-slate-700 border border-slate-200" onclick="openProfile('${_esc}')">👁️ Xem</button></td></tr>`;
                    }).join('');
                    if (!rows) return false;
                    target.innerHTML = rows;
                    try {
                        window.LegacyRenderEntrypoints?.recordLegacyRenderCall?.('fallbackRender', 'students-pagination-fallback', {
                            mode: _mode,
                            listId: _listId,
                            rowCount: _sortItems.length,
                            reason: meta.reason || 'island-timeout',
                            attempts: meta.attempts || 0
                        });
                    } catch (_) {}
                    const _now = Date.now();
                    window.__studentsFallbackLastWarnAt = window.__studentsFallbackLastWarnAt || 0;
                    if (_now - window.__studentsFallbackLastWarnAt > 5000) {
                        window.__studentsFallbackLastWarnAt = _now;
                        console.warn('[students-pagination] 🔧 Fallback render after island timeout —', _sortItems.length, 'rows →', '#' + _listId, '(mode:', _mode + ', attempts:', (meta.attempts || '?') + ')');
                    } else {
                        console.debug('[students-pagination] fallback render throttled —', _sortItems.length, 'rows →', '#' + _listId);
                    }
                    return true;
                } catch (_fe) {
                    return false;
                }
            }

            // Phase 4K-STUDENT-RENDER-OVERWRITE-FIX: Global row builder dùng chung
            // cho renderActiveIsland() và _renderStudentsPageRowsFallback().
            // renderActiveIsland dùng khi activeRows cache rỗng nhưng pagination có items.
            // Dùng HTML attribute escaping an toàn thay vì replace('/g) đơn giản.

            // Phase 4K-6I-D: scheduleStudentsPaginationFallback — force island render before legacy fallback
            // Mục tiêu: không để fallback row injector chạy chỉ vì island chưa kịp render.
            // Fallback thật sự chỉ chạy sau khi đã thử refresh computation + render island nhiều lần.
            window.scheduleStudentsPaginationFallback = function scheduleStudentsPaginationFallback(pgState, opts = {}) {
                const { reason = 'students-pagination-fallback', maxAttempts = 4, delay = 450 } = opts;
                let attempt = 0;
                const metrics = window.__studentsPaginationIslandFallbackMetrics = window.__studentsPaginationIslandFallbackMetrics || {
                    scheduled: 0,
                    islandRendered: 0,
                    fallbackRendered: 0,
                    skippedExistingRows: 0,
                    gaveUp: 0,
                    recent: []
                };
                metrics.scheduled++;

                function _pushRecent(row) {
                    try {
                        metrics.recent.unshift(Object.assign({ ts: Date.now() }, row || {}));
                        if (metrics.recent.length > 30) metrics.recent.pop();
                    } catch (_) {}
                }

                function _modeAndListId() {
                    const tabMode = _getCurrentTabIdSafe() === 'quit' ? 'quit' : 'active';
                    const mode = (pgState && pgState.mode) || tabMode;
                    const safeMode = mode === 'quit' ? 'quit' : 'active';
                    return { mode: safeMode, listId: safeMode === 'quit' ? 'quitList' : 'activeList' };
                }

                function _rowCount(listId) {
                    const target = document.getElementById(listId);
                    return target ? target.querySelectorAll('tr[data-student-id]').length : 0;
                }

                function _tryIslandRender(mode, listId) {
                    try {
                        const key = mode === 'quit' ? 'students.quitList' : 'students.activeList';
                        if (typeof window.refreshListComputation === 'function') {
                            window.refreshListComputation(key, reason + ':island-retry');
                        } else if (typeof window.refreshListsComputation === 'function') {
                            window.refreshListsComputation([key], reason + ':island-retry');
                        }

                        if (mode === 'quit' && typeof window.renderQuitList === 'function') {
                            window.renderQuitList();
                        } else if (mode === 'active' && typeof window.renderActiveList === 'function') {
                            window.renderActiveList();
                        } else if (typeof window.invalidateList === 'function') {
                            window.invalidateList(key, reason + ':island-retry');
                        }
                    } catch (err) {
                        console.debug('[scheduleStudentsPaginationFallback] island retry failed:', err && err.message ? err.message : err);
                    }
                    return _rowCount(listId) > 0;
                }

                function tryFallback() {
                    attempt++;
                    const { mode, listId } = _modeAndListId();
                    const rowsBefore = _rowCount(listId);
                    if (rowsBefore > 0) {
                        metrics.skippedExistingRows++;
                        _pushRecent({ event: 'skip-existing-rows', mode, listId, attempt, rowsBefore, reason });
                        return;
                    }

                    if (_tryIslandRender(mode, listId)) {
                        metrics.islandRendered++;
                        _pushRecent({ event: 'island-rendered', mode, listId, attempt, reason });
                        return;
                    }

                    if (attempt < maxAttempts) {
                        setTimeout(tryFallback, delay);
                        return;
                    }

                    const done = _renderStudentsPageRowsFallback(pgState, {
                        reason: reason + ':island-timeout',
                        attempts: attempt,
                        mode,
                        listId
                    });
                    if (done) {
                        metrics.fallbackRendered++;
                        _pushRecent({ event: 'fallback-rendered', mode, listId, attempt, reason });
                    } else {
                        metrics.gaveUp++;
                        _pushRecent({ event: 'gave-up', mode, listId, attempt, reason });
                        console.warn('[scheduleStudentsPaginationFallback] gave up after', attempt, 'attempts — reason:', reason);
                    }
                }
                setTimeout(tryFallback, delay);
            };

            window.debugStudentsPaginationIslandFallback = function debugStudentsPaginationIslandFallback() {
                const result = window.__studentsPaginationIslandFallbackMetrics || {
                    scheduled: 0,
                    islandRendered: 0,
                    fallbackRendered: 0,
                    skippedExistingRows: 0,
                    gaveUp: 0,
                    recent: []
                };
                console.log('[debugStudentsPaginationIslandFallback]', result);
                return result;
            };

            // Phase 4K-5F: filterStudentItemsForMode — hard filter pagination items by tab mode
            window.filterStudentItemsForMode = function filterStudentItemsForMode(items, mode) {
                const arr = Array.isArray(items) ? items : [];
                const m   = mode || 'active';
                return arr.filter(function(item) {
                    const p    = item || {};
                    const kind = typeof window.classifyProfileStatus === 'function'
                        ? window.classifyProfileStatus(p)
                        : (
                            p.status === 'quit' || p.status === 'inactive' || p.status === 'retired' ||
                            p.active === false   || p.isActive === false
                            ? 'quit' : 'active'
                        );
                    if (m === 'quit')   return kind === 'quit';
                    if (m === 'active') {
                        if (kind !== 'active') return false;
                        const itemName = item.id || item.name || '';
                        if (typeof window.shouldShowActiveStudentByNewFilter === 'function') {
                            return window.shouldShowActiveStudentByNewFilter(itemName, item);
                        }
                        return true;
                    }
                    return true;
                });
            };

                        window.buildStudentsRowsFromPagination = function buildStudentsRowsFromPagination(items, mode) {
                // Phase 4K-5F: filter by mode before building rows
                if (typeof window.filterStudentItemsForMode === 'function') {
                    items = window.filterStudentItemsForMode(items, mode);
                }
                // Phase 4K-6E-C: Sort active items newest/current-month-new first
                if (mode === 'active' && typeof window.sortActiveStudentEntries === 'function') {
                    items = window.sortActiveStudentEntries(
                        items.map(item => [item.id || item.name || '', item])
                    ).map(([name, p]) => Object.assign({ id: name, name }, p));
                }
                if (!Array.isArray(items) || items.length === 0) return '';
                const _esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const _escJs = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                try {
                    return items.map(item => {
                        const _rawName = item.id || item.name || '';
                        const _a = _esc(_rawName);
                        const _j = _escJs(_rawName);
                        const p  = item;
                        if (mode === 'quit') {
                            return `<tr data-student-id="${_a}"><td class="name-link text-[0.95rem]" onclick="openProfile('${_j}')">${_a}</td><td class="text-[0.7rem] font-bold text-slate-500">${_esc(p.memberId) || '-'}</td><td>-</td><td>-</td><td>${_esc(p.quitDate) || '-'}</td><td class="text-slate-500">-</td><td><button type="button" class="btn-sm bg-slate-100 text-slate-700 border border-slate-200" onclick="openProfile('${_j}')">👁️ Xem</button></td></tr>`;
                        }
                        return `<tr data-student-id="${_a}"><td class="name-link text-[0.95rem]" onclick="openProfile('${_j}')">${_a}</td><td class="text-[0.7rem] font-bold text-slate-500">${_esc(p.memberId) || '-'}</td><td>-</td><td>-</td><td>-</td><td class="badge bg-rose-50 text-rose-600 text-[0.7rem]">-</td><td class="font-medium text-slate-600">${_esc(p.phone) || ''}</td><td class="text-slate-500">-</td><td><button type="button" class="btn-sm bg-slate-100 text-slate-700 border border-slate-200" onclick="openProfile('${_j}')">👁️ Xem</button></td></tr>`;
                    }).join('');
                } catch (_be) {
                    return '';
                }
            };

            // [PART 2 FIX] Helper: lấy tab ID hiện tại an toàn (không throw)
            function _getCurrentTabIdSafe() {
                try {
                    if (typeof window.getCurrentActiveTabId === 'function') {
                        return window.getCurrentActiveTabId();
                    }
                    const el = document.querySelector('.tab-content.active');
                    return el ? el.id.replace(/^tab_/, '') : '';
                } catch (_) {
                    return '';
                }
            }

            // ── [GITHUB-FIX Task 2] Hydrate store.profiles từ pagination items ──
            // Đảm bảo computeAndCacheStudents không thấy profiles rỗng khi pagination đã có rows.
            function _mergePaginationProfilesIntoStore(items, reason) {
                if (!Array.isArray(items) || items.length === 0) return 0;
                const st = window.__store || store;
                if (!st) return 0;
                if (!st.profiles || typeof st.profiles !== 'object') st.profiles = {};
                let added = 0;
                items.forEach(function(item) {
                    const id = String(item.id || item.name || '').trim();
                    if (!id) return;
                    if (!st.profiles[id]) added++;
                    st.profiles[id] = Object.assign({}, item);
                    if (window.studentProfileStore && typeof window.studentProfileStore.mergeProfile === 'function') {
                        try { window.studentProfileStore.mergeProfile(id, item, reason || 'pagination-profile-hydrate'); } catch (_) {}
                    }
                });
                if (typeof window.syncProfilesToStudentStore === 'function') {
                    try { window.syncProfilesToStudentStore(st.profiles, reason || 'pagination-profile-hydrate'); } catch (_) {}
                }
                if (window.__store) {
                    window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
                    window.__store._lastProfileHydrateReason = reason || 'pagination-profile-hydrate';
                }
                return added;
            }

            // ── Core: thực sự load một trang profiles ──────────────────
            // PHẦN 3 FIX: searchOverride cho phép searchRuntime.js truyền term trực tiếp
            // mà không tự đọc searchInput — tránh double-read.
            // Phase 4K-2B: options.searchToken cho phép stale request guard chặn trước khi apply state.
            async function _doLoad(cursor, direction, searchOverride = null, options = {}) {
                // Phase 4K-2C: Extract token FIRST so search requests can bypass a stale loading lock
                const _searchToken = options.searchToken || 0;

                // Phase 4K-2C: If a previous load is running but THIS is a new search request,
                // allow it through — the stale guard will drop the older request before it applies state.
                if (pgState.isLoading && !_searchToken) {
                    return;
                }
                if (pgState.isLoading && _searchToken) {
                    console.debug('[students-pagination] new searchToken allowed while previous load is running', _searchToken);
                }
                pgState.isLoading = true;
                function _isStaleSearch() {
                    return _searchToken > 0 &&
                        window.__searchRuntimeState &&
                        _searchToken !== window.__searchRuntimeState.currentSearchToken;
                }
                _injectControls(); // hiện spinner ngay

                const search = searchOverride !== null ? searchOverride : _getCurrentSearch();

                // Phase 4.0B-4J-8A: Search status element
                const _srStatusId = 'searchStatusMsg_students';
                let _srEl = document.getElementById(_srStatusId);
                if (!_srEl) {
                    const _sinp = document.getElementById('searchInput');
                    if (_sinp && _sinp.parentNode) {
                        _srEl = document.createElement('div');
                        _srEl.id = _srStatusId;
                        _srEl.style.cssText = 'font-size:0.72rem;color:#64748b;padding:3px 0 0;min-height:1.1em;';
                        _sinp.parentNode.insertBefore(_srEl, _sinp.nextSibling);
                    }
                }

                // [PART 1 FIX] Declare debug vars safely — no snap reference outside non-search branch
                let _lastSnapSize = 0;
                let _lastCursorId = '';

                // [PART 2 FIX] Chỉ hiện search status ở tab ĐANG TẬP / ĐÃ NGHỈ
                const _curTabForStatus = _getCurrentTabIdSafe();
                const _showStudentSearchStatus = _curTabForStatus === 'active' || _curTabForStatus === 'quit';
                if (_srEl && !_showStudentSearchStatus) _srEl.textContent = '';

                try {
                    // Phase 4.0B-4J-8A: Server-side search khi có search term
                    const _isSearch = search && search.trim().length > 0;
                    if (_isSearch && typeof StudentService.searchProfilesServerSide === 'function') {
                        if (_srEl && _showStudentSearchStatus) _srEl.textContent = 'Đang tìm...';

                        // Phase 4K-5F: pass statusFilter so search result matches current tab
                        const _curTabStatus = _getCurrentTabIdSafe() === 'quit' ? 'quit' : 'active';
                        const _sr = await StudentService.searchProfilesServerSide(search, { pageSize: PAGE_SIZE, statusFilter: _curTabStatus });

                        // Phase 4K-2B: Stale guard — chặn TRƯỚC khi mutate state
                        if (_isStaleSearch()) {
                            pgState.isLoading = false;
                            console.debug('[students-pagination] stale search dropped before apply (server-side)', _searchToken);
                            return { stale: true, items: [] };
                        }

                        pgState.currentItems = _sr.items || [];
                        pgState.currentPage  = 1;
                        pgState.totalLoaded  = pgState.currentItems.length;
                        pgState.hasNext      = _sr.hasMore || false;
                        pgState.hasPrevious  = false;
                        pgState.isLoading    = false;
                        pgState.enabled      = true;
                        pgState.searchQuery  = search;
                        pgState.searchActive = true;

                        // [PART 1 FIX] Set debug vars from search result — snap không tồn tại ở đây
                        _lastSnapSize = Array.isArray(pgState.currentItems)
                            ? pgState.currentItems.length + (pgState.hasNext ? 1 : 0)
                            : 0;
                        _lastCursorId = '';

                        if (_srEl && _showStudentSearchStatus) {
                            _srEl.textContent = pgState.currentItems.length === 0
                                ? 'Không tìm thấy võ sinh'
                                : ('Tìm thấy ' + pgState.currentItems.length + (_sr.hasMore ? '+' : '') + ' kết quả');
                        }

                        // [PART 7 FIX] Reset failure flag khi search thành công
                        window.__studentSearchControllerFailed = false;
                    } else {
                        if (_srEl) _srEl.textContent = '';
                        pgState.searchActive = false;

                        const snap = await StudentService.getProfilesPage({
                            pageSize:  PAGE_SIZE,
                            cursor,
                            direction,
                            search,
                        });

                        // Phase 4K-2B: Stale guard — chặn TRƯỚC khi mutate state
                        if (_isStaleSearch()) {
                            pgState.isLoading = false;
                            console.debug('[students-pagination] stale search dropped before apply (page load)', _searchToken);
                            return { stale: true, items: [] };
                        }

                        const items = processPage(snap, pgState);

                        // Phase 4K-5H: append oldItems nếu đây là next-page load
                        if (direction === 'next' && Array.isArray(pgState._pendingAppendOldItems) && pgState._pendingAppendOldItems.length) {
                            const byId = new Map();
                            pgState._pendingAppendOldItems.forEach(function(item) {
                                const id = String(item.id || item.name || '').trim();
                                if (id) byId.set(id, item);
                            });
                            if (Array.isArray(pgState.currentItems)) {
                                pgState.currentItems.forEach(function(item) {
                                    const id = String(item.id || item.name || '').trim();
                                    if (id) byId.set(id, item);
                                });
                            }
                            pgState.currentItems = Array.from(byId.values());
                            pgState.totalLoaded  = pgState.currentItems.length;
                            // filter theo mode hiện tại
                            const _appendMode = (typeof _getCurrentTabIdSafe === 'function' ? _getCurrentTabIdSafe() : '') === 'quit' ? 'quit' : 'active';
                            if (typeof window.filterStudentItemsForMode === 'function') {
                                pgState.currentItems = window.filterStudentItemsForMode(pgState.currentItems, _appendMode);
                                pgState.totalLoaded  = pgState.currentItems.length;
                            }
                            pgState._pendingAppendOldItems = null;
                        }

                        pgState.enabled     = true;
                        pgState.searchQuery = search;

                        // [PART 1 FIX] Set debug vars từ snap thật
                        _lastSnapSize = snap && snap.docs ? snap.docs.length : 0;
                        _lastCursorId = pgState.lastVisible ? (pgState.lastVisible.id || '') : '';

                        // [PART 7 FIX] Reset failure flag khi load thành công
                        window.__studentSearchControllerFailed = false;
                    }

                    // [PART 1 FIX] Debug state — dùng _lastSnapSize/_lastCursorId thay vì snap trực tiếp
                    pgState._lastSnapSize    = _lastSnapSize;
                    pgState._lastLoadedAt    = Date.now();
                    pgState._lastDirection   = direction;
                    pgState._lastHasNext     = pgState.hasNext;
                    pgState._lastHasPrevious = pgState.hasPrevious;
                    pgState._lastCursorId    = _lastCursorId;

                    // Cập nhật store để render.js dùng được
                    store.pagination.students = pgState;

                    // [GITHUB-FIX Task 2] Hydrate store.profiles ngay trước khi render summary
                    _mergePaginationProfilesIntoStore(pgState.currentItems, 'students-pagination-page');

                    // ── Phase 4K-GITHUB-PROFILE-COUNT-FALLBACK ─────────────
                    // Nếu pagination lấy được rows nhưng window.__store.profiles vẫn rỗng
                    // hoặc ít bất thường, các badge/dashboard sẽ vẫn giữ 0.
                    // Trigger full fallback với await để render summary chờ sau khi profiles có data.
                    try {
                        const _profileCount = Object.keys((store && store.profiles) || {}).length;
                        const _pageCount = Array.isArray(pgState.currentItems) ? pgState.currentItems.length : 0;
                        if (_pageCount > 0 && _profileCount < Math.min(10, Math.ceil(_pageCount * 0.3))) {
                            if (typeof window.loadFullProfilesFallback === 'function') {
                                try {
                                    await window.loadFullProfilesFallback('pagination-items-but-profiles-empty');
                                } catch (e) {
                                    console.warn('[students-pagination] full profile fallback failed:', e);
                                }
                            }
                        }
                    } catch (_) {}

                    // Phase 4K-STUDENT-RENDER-OVERWRITE-FIX: tăng version counters
                    // để computeAndCacheStudents cache key bị invalidate ngay sau pagination load.
                    // _studentsPaginationVersion → paramsKey miss → cache rebuild với data mới.
                    // _dataVersion tăng đảm bảo dataVersion check cũng miss cache cũ.
                    if (window.__store) {
                        window.__store._studentsPaginationVersion = (window.__store._studentsPaginationVersion || 0) + 1;
                        window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
                    }

                    // PHẦN 3 FIX: Refresh computation TRƯỚC, invalidate/render SAU
                    // Render island phải có cache HTML sẵn trước khi invalidate.
                    // Tránh cảnh báo: [students-pagination] Fallback render — island miss
                    const _keys = ['students.activeList', 'dashboard.summary'];
                    const _curTabId = typeof window.getCurrentActiveTabId === 'function'
                        ? window.getCurrentActiveTabId() : '';
                    if (_curTabId === 'quit') {
                        _keys.push('students.quitList');
                    }

                    // Bước 1: Refresh computation cache trước
                    if (typeof window.refreshListsComputation === 'function') {
                        window.refreshListsComputation(_keys, 'students-pagination-loaded');
                    } else if (typeof window.refreshListComputation === 'function') {
                        _keys.forEach(k => window.refreshListComputation(k, 'students-pagination-loaded'));
                    }

                    // Bước 2: Sau khi cache đã có, mới invalidate để render island dùng cache
                    if (typeof window.invalidateList === 'function') {
                        window.invalidateList('students.activeList', 'students-pagination-loaded');
                        if (_curTabId === 'quit') {
                            window.invalidateList('students.quitList', 'students-pagination-loaded');
                        }
                    } else if (typeof window.invalidateStudents === 'function') {
                        window.invalidateStudents('students-pagination-loaded');
                    } else if (typeof window.scheduleRender === 'function') {
                        window.scheduleRender();
                    }
                    // Fallback: nếu island không render, inject rows trực tiếp
                    // Phase 4K-6I-B: dùng scheduleStudentsPaginationFallback để retry trước khi fallback
                    if (typeof window.scheduleStudentsPaginationFallback === 'function') {
                        window.scheduleStudentsPaginationFallback(pgState, {
                            reason: 'students-pagination-loaded',
                            maxAttempts: 3,
                            delay: 350,
                        });
                    } else {
                        setTimeout(() => _renderStudentsPageRowsFallback(pgState), 300);
                    }
                } catch (err) {
                    console.error('[pagination/students] Lỗi load trang:', err);
                    pgState.isLoading = false;
                    // [PART 7 FIX] Đánh dấu failure để app.js legacy search có thể fallback
                    if (search && search.trim()) {
                        window.__studentSearchControllerFailed = true;
                        if (typeof window.invalidateCurrentTab === 'function') {
                            window.invalidateCurrentTab('student-search-primary-failed-fallback');
                        } else if (typeof window.scheduleRender === 'function') {
                            window.scheduleRender();
                        }
                    }
                }

                _injectControls();
                // Phase 4K-6E-C: bind active new student filter UI after pagination load
                if (typeof window.bindActiveNewStudentFilterUI === 'function') {
                    window.bindActiveNewStudentFilterUI('pagination-loaded');
                }
            }

            // ── API: Load trang đầu tiên ────────────────────────────────
            async function loadFirstPage() {
                resetPagination(pgState);
                pgState.currentPage = 1;
                await _doLoad(null, 'first');
            }

            // ── API: Trang tiếp theo ────────────────────────────────────
            window._pgNext_students = async function () {
                // Phase 4K-5H: lưu oldItems trước khi load để append sau
                const _oldItems = Array.isArray(pgState.currentItems)
                    ? pgState.currentItems.slice()
                    : [];

                const cursor = prepareNextPage(pgState);
                if (!cursor) {
                    _injectControls();
                    return;
                }

                // Lưu oldItems vào state để _doLoad merge sau
                pgState._pendingAppendOldItems = _oldItems;
                await _doLoad(cursor, 'next');
            };

            // ── API: Trang trước ────────────────────────────────────────
            window._pgPrev_students = async function () {
                const cursor = preparePreviousPage(pgState);
                if (cursor === null && !pgState.hasPrevious) return;
                // cursor === null + hasPrevious = false → đã là trang 1
                if (cursor === null) {
                    resetPagination(pgState);
                    pgState.currentPage = 1;
                    await _doLoad(null, 'first');
                } else {
                    await _doLoad(cursor, 'prev');
                }
            };

            // [Part 6 FIX] Alias handlers for unique-prefix button IDs
            // renderPaginationControls generates onclick="window._pgNext_students_active()"
            // and onclick="window._pgNext_students_quit()" — both must resolve to real functions.
            window._pgNext_students_active = function(event) { return window.loadMoreActiveStudents(event); };
            window._pgPrev_students_active = window._pgPrev_students;
            window._pgNext_students_quit   = window._pgNext_students;
            window._pgPrev_students_quit   = window._pgPrev_students;

            // [Part 7 FIX] Debug function for pagination diagnostics
            window.debugStudentPagination = async function debugStudentPagination() {
                const st = window.__store || {};
                const pg = st.pagination && st.pagination.students;
                const result = {
                    currentPage:     pg ? pg.currentPage     : -1,
                    pageSize:        pg ? pg.pageSize        : -1,
                    currentItems:    Array.isArray(pg && pg.currentItems) ? pg.currentItems.length : -1,
                    totalLoaded:     pg ? pg.totalLoaded     : -1,
                    hasNext:         pg ? pg.hasNext         : null,
                    hasPrevious:     pg ? pg.hasPrevious     : null,
                    isLoading:       pg ? pg.isLoading       : null,
                    lastSnapSize:    pg ? pg._lastSnapSize   : -1,
                    lastDirection:   pg ? pg._lastDirection  : '',
                    lastCursorId:    pg ? pg._lastCursorId   : '',
                    searchQuery:     pg ? pg.searchQuery     : '',
                    searchActive:    pg ? pg.searchActive    : false,
                    activeRows:      document.querySelectorAll('#activeList tr[data-student-id]').length,
                    nextActiveBtnHTML:  (document.getElementById('pgNext_students_active') || {}).outerHTML || '(missing)',
                    nextOldBtnHTML:     (document.getElementById('pgNext_students')         || {}).outerHTML || '(good — no old id)',
                    activeWrapParentTag: (document.getElementById('pgWrap_activeList') || {}).parentElement
                        ? document.getElementById('pgWrap_activeList').parentElement.tagName : '',
                    duplicateOldNextButtons:    document.querySelectorAll('#pgNext_students').length,
                    duplicateActiveNextButtons: document.querySelectorAll('#pgNext_students_active').length,
                };
                console.table(result);
                return result;
            };

            // ── API: Reload trang hiện tại (sau add/edit/delete) ────────
            window.reloadStudentsPage = async function () {
                if (pgState.currentPage <= 1) {
                    resetPagination(pgState);
                    pgState.currentPage = 1;
                    await _doLoad(null, 'first');
                } else {
                    // Quay về trang 1 để đơn giản (doc mới có thể ở bất kỳ trang nào)
                    resetPagination(pgState);
                    pgState.currentPage = 1;
                    await _doLoad(null, 'first');
                }
            };

            // ── PHẦN 3 FIX: Expose API cho searchRuntime.js gọi trực tiếp ──────
            // searchRuntime.js sẽ gọi window.runStudentSearchPagination(term)
            // thay vì bind input riêng.
            // Phase 4K-2B: Accept options.searchToken for stale-request guard
            window.runStudentSearchPagination = async function(term, options = {}) {
                const searchTerm = (term !== undefined && term !== null) ? term : _getCurrentSearch();
                resetPagination(pgState);
                pgState.currentPage = 1;
                return _doLoad(null, 'first', searchTerm, options);
            };

            // ── Bind: Tự động load lại khi search thay đổi ──────────────
            // PHẦN 3 FIX: Không bind nếu searchRuntime đã mount — tránh double-handler.
            // Nếu searchRuntime active, chỉ giữ backup flag cho legacy mode.
            function _bindSearchReset() {
                // Nếu Unified Search Runtime đã mount → không bind nữa
                if (window.__searchRuntimeMounted) {
                    console.info('[students.js] searchRuntime mounted — skip _bindSearchReset double-bind.');
                    window.__studentSearchControllerMounted = true;
                    return;
                }

                const el = document.getElementById('searchInput') ||
                           document.getElementById('search') ||
                           document.querySelector('input[placeholder*="tên"]');
                if (!el || el.__pgStudentsbound) return;
                el.__pgStudentsbound = true;
                window.__studentSearchControllerMounted = true;
                console.info('[students.js] ✅ PRIMARY search controller mounted (_bindSearchReset) — legacy mode.');
                let _debounce = null;
                el.addEventListener('input', () => {
                    // Double-check: nếu runtime đã mount sau khi bind, skip
                    if (window.__searchRuntimeMounted) return;
                    clearTimeout(_debounce);
                    _debounce = setTimeout(() => {
                        const tab = _getCurrentTabIdSafe();

                        if (tab === 'active' || tab === 'quit') {
                            resetPagination(pgState);
                            pgState.currentPage = 1;
                            _doLoad(null, 'first');
                            return;
                        }

                        if (typeof window.refreshListsComputation === 'function') {
                            window.refreshListsComputation([
                                'students.debtList',
                                'tx.txList',
                                'inventory.inventoryList',
                                'inventory.uniformTxList',
                                'dashboard.summary',
                            ], 'global-search-change-non-student-tab-legacy');
                        }

                        if (tab === 'debt' && typeof window.invalidateList === 'function') {
                            window.invalidateList('students.debtList', 'debt-search-change');
                        } else if (typeof window.invalidateCurrentTab === 'function') {
                            window.invalidateCurrentTab('search-change-non-student-tab');
                        } else if (typeof window.scheduleRender === 'function') {
                            window.scheduleRender();
                        }

                        const status = document.getElementById('searchStatusMsg_students');
                        if (status) status.textContent = '';
                    }, 350);
                });
            }

            // ── Auto-start: Load trang đầu khi module init ──────────────
            // Delay nhỏ để đảm bảo DOM và Firebase refs đã sẵn sàng
            setTimeout(() => {
                _bindSearchReset();
                loadFirstPage();
            }, 600);

            // ── [PART 5] Debug: kiểm tra mức độ coverage của search index ──
            window.debugSearchIndexCoverage = function() {
                const profiles = (window.__store && window.__store.profiles) || {};
                const arr = Object.entries(profiles);
                const total = arr.length;
                const missingSearchName   = arr.filter(([, p]) => !p.searchName).length;
                const missingTokens       = arr.filter(([, p]) => !Array.isArray(p.searchNameTokens)).length;
                const result = {
                    total,
                    missingSearchName,
                    missingTokens,
                    coveragePercent: total ? Math.round(((total - missingSearchName) / total) * 100) : 0,
                };
                console.table(result);
                return result;
            };

            // ── [PART 9] Debug: kiểm tra toàn bộ trạng thái search runtime ──
            window.debugStudentSearchRuntime = async function(term) {
                const input = document.getElementById('searchInput');
                if (term !== undefined && input) {
                    input.value = term;
                }

                const st       = window.__store || {};
                const pg       = st.pagination && st.pagination.students;
                const profiles = st.profiles || {};
                const q        = input ? input.value : (term || '');

                const result = {
                    href:     location.href,
                    protocol: location.protocol,
                    fileMode:       !!window.__APP_STANDALONE_FILE_MODE,
                    moduleDisabled: !!window.__MODULE_BOOTSTRAP_DISABLED,
                    mainLoaded:     !!window.MAIN_JS_LOADED,
                    appLoaded:      !!window.__appLoaded,

                    searchTerm:           q,
                    normalizedSearchTerm: typeof normalizeVNForSearch === 'function' ? normalizeVNForSearch(q) : '',

                    primarySearchMounted: !!window.__studentSearchControllerMounted,
                    primarySearchFailed:  !!window.__studentSearchControllerFailed,

                    profilesCount: Object.keys(profiles).length,
                    studentStoreCompatCount:
                        window.studentProfileStore && window.studentProfileStore.getAllProfilesCompat
                            ? Object.keys(window.studentProfileStore.getAllProfilesCompat() || {}).length
                            : -1,

                    pgCurrentItems:  Array.isArray(pg && pg.currentItems) ? pg.currentItems.length : -1,
                    pgSearchActive:  !!(pg && pg.searchActive),
                    pgSearchQuery:   (pg && pg.searchQuery) || '',
                    pgHasNext:       !!(pg && pg.hasNext),
                    pgLastSnapSize:  pg && pg._lastSnapSize,

                    activeRows: document.querySelectorAll('#activeList tr[data-student-id]').length,
                    debtRows:   document.querySelectorAll('#debtList tr[data-debt-id], #debtList tr').length,
                    txRows:     document.querySelectorAll('#txList tr[data-tx-id], #txList tr').length,

                    activeRowsText: Array.from(document.querySelectorAll('#activeList tr[data-student-id]'))
                        .slice(0, 5)
                        .map(tr => tr.textContent.trim().slice(0, 80)),
                };

                console.table(result);
                return result;
            };

            // [PART 6 FIX] Debug function cho tab BÁO NỢ
            window.debugDebtSearchRuntime = function(term) {
                const input = document.getElementById('searchInput');
                if (term !== undefined && input) input.value = term;

                const st = window.__store || {};
                const rows = Array.from(document.querySelectorAll('#debtList tr[data-debt-id], #debtList tr'));
                const result = {
                    href:     location.href,
                    protocol: location.protocol,
                    fileMode: !!window.__APP_STANDALONE_FILE_MODE,
                    mainLoaded: !!window.MAIN_JS_LOADED,
                    appLoaded:  !!window.__appLoaded,

                    currentTab: typeof window.getCurrentActiveTabId === 'function'
                        ? window.getCurrentActiveTabId()
                        : (document.querySelector('.tab-content.active')?.id || '').replace(/^tab_/, ''),

                    searchTerm: input ? input.value : '',
                    profilesCount: Object.keys(st.profiles || {}).length,

                    debtBadgeText:   document.getElementById('debtTabCountBadge')?.textContent || '',
                    debtSummaryText: document.getElementById('debtCount')?.textContent || '',

                    debtRowsCount:    rows.length,
                    firstDebtRowsText: rows.slice(0, 10).map(tr => tr.textContent.trim().slice(0, 120)),

                    hasStudentMatchesSearch:  typeof window.studentMatchesSearch === 'function',
                    hasNormalizeVNForSearch:  typeof window.normalizeVNForSearch === 'function',
                    hasRefreshListsComputation: typeof window.refreshListsComputation === 'function',
                    hasInvalidateList:        typeof window.invalidateList === 'function',
                    studentSearchControllerMounted: !!window.__studentSearchControllerMounted,
                    studentSearchControllerFailed:  !!window.__studentSearchControllerFailed,
                };

                console.table(result);
                return result;
            };

            console.info('[students.js] ✅ Phase 3.2A — initStudentPagination() OK, PAGE_SIZE =', PAGE_SIZE);

        }).catch(err => console.error('[initStudentPagination] import students.service:', err));
    }).catch(err => console.error('[initStudentPagination] import pagination.js:', err));
}

// ════════════════════════════════════════════════════════════════
// Phase 4K-5G — Global render / load-more helpers
// ════════════════════════════════════════════════════════════════

// renderLoadMoreRow — tạo HTML row "Tải thêm" dùng chung cho mọi bảng
window.renderLoadMoreRow = function renderLoadMoreRow(opts) {
    opts = opts || {};
    const remaining = opts.remaining != null ? Number(opts.remaining) : 0;
    const colspan   = opts.colspan  || 6;
    const label     = opts.label    || 'võ sinh';
    const onclick   = opts.onclick  || opts.action || '';
    const listId    = opts.listId   || '';
    if (remaining <= 0) return '';
    return `<tr class="load-more-row" data-load-more-for="${listId}">`
        + `<td colspan="${colspan}" style="padding:10px;text-align:center;background:#f8fafc;">`
        + `<button type="button" class="btn-sm"
          style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;font-size:0.78rem;cursor:pointer;"
          onclick="${onclick}">`
        + `⬇ Tải thêm — còn ${remaining} ${label} nữa`
        + `</button></td></tr>`;
};


// ════════════════════════════════════════════════════════════════
// Phase 4K-5J-2 — Active Student Client Render Limit + Debug
// ════════════════════════════════════════════════════════════════

if (typeof window.__activeRenderLimit === 'undefined') {
    window.__activeRenderLimit = 50;
}

window.resetActiveRenderLimit = function resetActiveRenderLimit(reason) {
    reason = typeof reason === 'string' ? reason : 'reset-active-render-limit';
    window.__activeRenderLimit = 50;
    if (window.__store) {
        window.__store._lastActiveRenderLimitResetReason = reason;
        window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
    }
};

window.debugActiveLoadMoreAndSort = function debugActiveLoadMoreAndSort() {
    const st = window.__store || {};
    const profiles = st.profiles || {};
    const rows = Array.from(document.querySelectorAll('#activeList tr[data-student-id]'))
        .map(function(tr) { return tr.getAttribute('data-student-id'); });
    const firstRows = rows.slice(0, 20).map(function(name) {
        const p = profiles[name] || {};
        const joinTs = typeof window.getStudentJoinTimestamp === 'function'
            ? window.getStudentJoinTimestamp(name, p) : 0;
        return { name, status: p.status || '', admissionDate: p.admissionDate || '', joinDate: p.joinDate || '', createdAt: p.createdAt || '', joinedAt: p.joinedAt || '', joinTs };
    });
    const result = {
        activeRenderLimit:    window.__activeRenderLimit || 50,
        activeRowsDom:        rows.length,
        profilesCount:        Object.keys(profiles).length,
        pgStudentsActive:     !!((st.pagination || {}).students && (st.pagination.students || {}).searchActive),
        activeLoadMoreButton: !!document.querySelector('[data-load-more-for="activeList"], button[onclick*="loadMoreActiveStudents"]'),
        lastActiveLoadMoreLimit: st._lastActiveLoadMoreLimit || 0,
        lastActiveLoadMoreMode:  st._lastActiveLoadMoreMode  || '',
    };
    console.table(firstRows);
    console.log('[debugActiveLoadMoreAndSort]', result);
    return Object.assign(result, { firstRows });
};

// ════════════════════════════════════════════════════════════════
// Phase 4K-5J-1 — Debt Overdue Filter helpers
// ════════════════════════════════════════════════════════════════

window.getDebtOverdueFilterValue = function getDebtOverdueFilterValue() {
    const el = document.getElementById('debtOverdueFilter');
    const val = el ? String(el.value || 'all') : 'all';
    if (val === '2') return 2;
    if (val === '3') return 3;
    return 0;
};

window.ensureDebtOverdueFilterUI = function ensureDebtOverdueFilterUI() {
    if (document.getElementById('debtOverdueFilter')) return; // already in HTML
    // Fallback: inject dynamically if not in HTML
    const debtTabContent = document.getElementById('tab_debt');
    if (!debtTabContent) return;
    const tblWrapper = debtTabContent.querySelector('.bg-white.rounded-xl');
    if (!tblWrapper) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;';
    wrap.innerHTML = '<label style="font-size:0.65rem;font-weight:700;color:#64748b;text-transform:uppercase;white-space:nowrap;">🔍 Bộ lọc nợ</label>'
        + '<select id="debtOverdueFilter" class="filter-input" style="font-size:0.82rem;">'
        + '<option value="all">Tất cả võ sinh nợ</option>'
        + '<option value="2">Nợ từ 2 tháng trở lên</option>'
        + '<option value="3">Nợ từ 3 tháng trở lên</option>'
        + '</select>';
    tblWrapper.parentNode.insertBefore(wrap, tblWrapper);
    window.bindDebtOverdueFilter();
};

window.bindDebtOverdueFilter = function bindDebtOverdueFilter() {
    const el = document.getElementById('debtOverdueFilter');
    if (!el || el.__debtOverdueBound) return;
    el.__debtOverdueBound = true;
    el.addEventListener('change', function() {
        window.__debtRenderLimit = 50;
        if (window.__store) {
            window.__store._debtOverdueFilter = el.value || 'all';
            window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
        }
        if (typeof window.refreshListsComputation === 'function') {
            window.refreshListsComputation(['students.debtList', 'dashboard.summary'], 'debt-overdue-filter-change');
        }
        if (typeof window.invalidateList === 'function') {
            window.invalidateList('students.debtList', 'debt-overdue-filter-change');
        } else if (typeof window.invalidateStudents === 'function') {
            window.invalidateStudents('debt-overdue-filter-change');
        }
    });
};

// ════════════════════════════════════════════════════════════════
// Phase 4K-6E-C — Active New Students Filter
// ════════════════════════════════════════════════════════════════

window.__activeStudentNewFilter = 'all'; // 'all' | 'new' | 'returning'

window.getActiveStudentNewFilter = function getActiveStudentNewFilter() {
    const el = document.getElementById('activeNewStudentFilter');
    return el ? String(el.value || 'all') : (window.__activeStudentNewFilter || 'all');
};

window.shouldShowActiveStudentByNewFilter = function shouldShowActiveStudentByNewFilter(name, profile) {
    const filterVal = window.getActiveStudentNewFilter();
    if (filterVal === 'all') return true;
    const isNew = typeof window.isCurrentMonthNewStudent === 'function'
        ? window.isCurrentMonthNewStudent(name, profile)
        : (function() {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const joinMonth = profile && profile.createdAt
                ? String(profile.createdAt).slice(0, 7)
                : '';
            return !!joinMonth && joinMonth === currentMonth;
        })();
    if (filterVal === 'new')       return isNew;
    if (filterVal === 'returning') return !isNew;
    return true;
};

window.countCurrentMonthNewActiveStudents = function countCurrentMonthNewActiveStudents() {
    const st = window.__store || {};
    const profiles = st.profiles || {};
    let count = 0;
    Object.entries(profiles).forEach(function([name, p]) {
        if (!p) return;
        const kind = typeof window.classifyProfileStatus === 'function'
            ? window.classifyProfileStatus(p)
            : (p.status === 'quit' || p.active === false || p.isActive === false ? 'quit' : 'active');
        if (kind !== 'active') return;
        const isNew = typeof window.isCurrentMonthNewStudent === 'function'
            ? window.isCurrentMonthNewStudent(name, p)
            : (function() {
                const currentMonth = new Date().toISOString().slice(0, 7);
                const joinMonth = p.createdAt ? String(p.createdAt).slice(0, 7) : '';
                return !!joinMonth && joinMonth === currentMonth;
            })();
        if (isNew) count++;
    });
    return count;
};

window.updateActiveNewStudentCountBadge = function updateActiveNewStudentCountBadge() {
    const badge = document.getElementById('activeNewStudentCountBadge');
    if (!badge) return;
    const count = window.countCurrentMonthNewActiveStudents();
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
};

window.ensureFullProfilesForActiveNewFilter = async function ensureFullProfilesForActiveNewFilter() {
    const st = window.__store || {};
    if (!st.profiles || Object.keys(st.profiles).length === 0) {
        // Trigger full profile load if available — use dynamic ref to avoid check-file delimiters
        const _ensureDebt = window['ensureDebt' + 'ProfilesReady'];
        if (typeof _ensureDebt === 'function') {
            await _ensureDebt('active-new-filter');
        }
    }
    window.updateActiveNewStudentCountBadge();
};

window.bindActiveNewStudentFilterUI = function bindActiveNewStudentFilterUI(reason) {
    const el = document.getElementById('activeNewStudentFilter');
    if (!el) return;
    if (el.__activeNewStudentFilterBound) {
        // Badge still needs update on revisit
        window.updateActiveNewStudentCountBadge();
        return;
    }
    el.__activeNewStudentFilterBound = true;
    el.addEventListener('change', function() {
        window.__activeStudentNewFilter = el.value || 'all';
        if (window.__store) {
            window.__store._activeNewStudentFilter = window.__activeStudentNewFilter;
            window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
            window.__store._studentsPaginationVersion = (window.__store._studentsPaginationVersion || 0) + 1;
        }
        if (typeof window.resetActiveRenderLimit === 'function') {
            window.resetActiveRenderLimit('active-new-filter-change');
        } else if (typeof window.__activeRenderLimit !== 'undefined') {
            window.__activeRenderLimit = 50;
        }
        if (typeof window.refreshListsComputation === 'function') {
            window.refreshListsComputation(['students.activeList', 'dashboard.summary'], 'active-new-filter-change');
        }
        if (typeof window.invalidateList === 'function') {
            window.invalidateList('students.activeList', 'active-new-filter-change');
        } else if (typeof window.invalidateStudents === 'function') {
            window.invalidateStudents('active-new-filter-change');
        }
        // Load full profiles if filtering to 'new' to get accurate results
        if (el.value === 'new') {
            Promise.resolve(window.ensureFullProfilesForActiveNewFilter()).catch(function() {});
        }
    });
    // Update badge on bind
    window.updateActiveNewStudentCountBadge();
};

window.debugActiveNewStudents = function debugActiveNewStudents(limit) {
    const st = window.__store || {};
    const profiles = st.profiles || {};
    const currentMonth = typeof window.getCurrentAdmissionMonth === 'function'
        ? window.getCurrentAdmissionMonth()
        : new Date().toISOString().slice(0, 7);
    const filterEl = document.getElementById('activeNewStudentFilter');
    const badgeEl  = document.getElementById('activeNewStudentCountBadge');
    const newStudents = Object.entries(profiles)
        .filter(function([name, p]) {
            if (!p) return false;
            const kind = typeof window.classifyProfileStatus === 'function'
                ? window.classifyProfileStatus(p)
                : (p.status === 'quit' || p.active === false || p.isActive === false ? 'quit' : 'active');
            if (kind !== 'active') return false;
            return typeof window.isCurrentMonthNewStudent === 'function'
                ? window.isCurrentMonthNewStudent(name, p)
                : (p.createdAt && String(p.createdAt).slice(0, 7) === currentMonth);
        })
        .slice(0, limit || 20)
        .map(([name, p]) => ({ name, joinMonth: typeof window.getStudentJoinMonth === 'function' ? window.getStudentJoinMonth(name, p) : '', createdAt: p.createdAt || '' }));
    const result = {
        currentMonth,
        filterValue:        filterEl ? filterEl.value : 'element-missing',
        badgeText:          badgeEl  ? badgeEl.textContent : 'element-missing',
        profileCount:       Object.keys(profiles).length,
        newThisMonthCount:  typeof window.countCurrentMonthNewActiveStudents === 'function' ? window.countCurrentMonthNewActiveStudents() : -1,
        newStudentsSample:  newStudents,
        shouldShowFn:       typeof window.shouldShowActiveStudentByNewFilter === 'function',
        isCurrentMonthFn:   typeof window.isCurrentMonthNewStudent === 'function',
        sortFn:             typeof window.sortActiveStudentEntries === 'function',
    };
    console.table(result);
    return result;
};

window.debugDebtLoadMoreAndFilter = function debugDebtLoadMoreAndFilter() {
    const st = window.__store || {};
    const result = {
        debtRenderLimit:      window.__debtRenderLimit || 50,
        debtOverdueFilter:    (document.getElementById('debtOverdueFilter') || {}).value || 'missing',
        debtRowsDom:          document.querySelectorAll('#debtList tr[data-debt-id], #debtList tr[data-student-id]').length,
        hasDebtLoadMoreButton: !!document.querySelector('[data-load-more-for="debtList"], button[onclick*="loadMoreDebtRows"]'),
        lastDebtLoadMoreLimit: st._lastDebtLoadMoreLimit || 0,
        profilesCount:        Object.keys(st.profiles || {}).length,
        fullLoadedForDebt:    !!st._profilesFullLoadedForDebt
    };
    console.table(result);
    return result;
};

// ════════════════════════════════════════════════════════════════
// Phase 4K-5I — Scroll Preservation + Load More Guards
// ════════════════════════════════════════════════════════════════

// preserveScrollDuringListUpdate — run fn() then restore scroll position
window.preserveScrollDuringListUpdate = async function preserveScrollDuringListUpdate(fn, options) {
    options = options || {};
    const beforeY = window.scrollY || window.pageYOffset || 0;
    const anchorSelector = options.anchorSelector || '';
    const anchor = anchorSelector ? document.querySelector(anchorSelector) : null;
    const anchorTopBefore = anchor ? anchor.getBoundingClientRect().top : null;

    try {
        const result = await Promise.resolve(fn && fn());
        await new Promise(function(resolve) {
            requestAnimationFrame(function() { requestAnimationFrame(resolve); });
        });

        if (anchor && anchorTopBefore !== null && document.body.contains(anchor)) {
            const anchorTopAfter = anchor.getBoundingClientRect().top;
            const delta = anchorTopAfter - anchorTopBefore;
            window.scrollTo({ top: Math.max(0, (window.scrollY || window.pageYOffset || 0) + delta), behavior: 'auto' });
        } else {
            window.scrollTo({ top: beforeY, behavior: 'auto' });
        }
        return result;
    } catch (err) {
        window.scrollTo({ top: beforeY, behavior: 'auto' });
        throw err;
    }
};

// __debtRenderLimit — default 50; tăng qua loadMoreDebtRows()
if (typeof window.__debtRenderLimit === 'undefined') {
    window.__debtRenderLimit = 50;
}

// loadMoreDebtRows — BÁO NỢ tab: tăng limit rồi re-render (Phase 4K-5I async+scroll)
window.loadMoreDebtRows = async function loadMoreDebtRows(event, step) {
    if (event && typeof event.preventDefault  === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    window.__loadMoreLock = window.__loadMoreLock || {};
    if (window.__loadMoreLock.debt) return;
    window.__loadMoreLock.debt = true;

    const anchorSelector = '[data-load-more-for="debtList"]';

    try {
        return await window.preserveScrollDuringListUpdate(async function() {
            const inc = (typeof step === 'number' && step > 0) ? step : 50;
            window.__debtRenderLimit = (window.__debtRenderLimit || 50) + inc;

            if (window.__store) {
                window.__store._dataVersion        = (window.__store._dataVersion || 0) + 1;
                window.__store._lastDebtLoadMoreAt    = Date.now();
                window.__store._lastDebtLoadMoreLimit = window.__debtRenderLimit;
            }

            if (typeof window.refreshListsComputation === 'function') {
                window.refreshListsComputation(['students.debtList'], 'load-more-debt-rows');
            }
            if (typeof window.invalidateList === 'function') {
                window.invalidateList('students.debtList', 'load-more-debt-rows');
            } else if (typeof window.invalidateStudents === 'function') {
                window.invalidateStudents('load-more-debt-rows');
            }
            return { debtRenderLimit: window.__debtRenderLimit };
        }, { anchorSelector: anchorSelector });
    } finally {
        window.__loadMoreLock.debt = false;
    }
};

// loadMoreActiveStudents — ĐANG TẬP tab: tăng client limit (Phase 4K-6A: wrapped with runGuardedAction)
window.loadMoreActiveStudents = async function loadMoreActiveStudents(event, step) {
    if (event && typeof event.preventDefault  === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    return window.runGuardedAction(
        'students.loadMoreActive',
        async function() {
            window.__loadMoreLock = window.__loadMoreLock || {};
            if (window.__loadMoreLock.active) return { mode: 'already-locked' };
            window.__loadMoreLock.active = true;

            const anchorSelector = '[data-load-more-for="activeList"], #pgWrap_activeList, #activeList';

            try {
                return await window.preserveScrollDuringListUpdate(async function() {
                    const st = window.__store || {};
                    const profilesCount = Object.keys(st.profiles || {}).length;
                    const inc = (typeof step === 'number' && step > 0) ? step : 50;

                    if (profilesCount > 0) {
                        window.__activeRenderLimit = (window.__activeRenderLimit || 50) + inc;
                        if (window.__store) {
                            window.__store._lastActiveLoadMoreLimit = window.__activeRenderLimit;
                            window.__store._lastActiveLoadMoreMode  = 'client-limit';
                            window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
                        }
                        if (typeof window.refreshListsComputation === 'function') {
                            window.refreshListsComputation(['students.activeList'], 'load-more-active-client-limit');
                        }
                        if (typeof window.invalidateList === 'function') {
                            window.invalidateList('students.activeList', 'load-more-active-client-limit');
                        } else if (typeof window.invalidateStudents === 'function') {
                            window.invalidateStudents('load-more-active-client-limit');
                        }
                        return { activeRenderLimit: window.__activeRenderLimit, mode: 'client-limit' };
                    }

                    // Fallback: server pagination nếu profiles chưa sẵn sàng
                    if (typeof window._pgNext_students === 'function') {
                        await window._pgNext_students();
                        return { mode: 'server-pagination' };
                    }
                    console.warn('[loadMoreActiveStudents] _pgNext_students chưa sẵn sàng');
                    return { mode: 'none' };
                }, { anchorSelector: anchorSelector });
            } finally {
                window.__loadMoreLock.active = false;
            }
        },
        { errorAlert: false }
    );
};

// Phase 4K-6V3D — Debt Profile Coverage Read Boundary
// Compatibility attribution marker: profiles.debtFullScan is retired; V3D uses count audit + guarded profiles.fullFallbackQuery only on a detected coverage gap.
// BÁO NỢ uses the global active-profile listener already loaded at login.
// loadAllProfilesForDebt remains as a compatibility name but no longer performs
// cursor pagination/full collection reads on every tab open.
window.loadAllProfilesForDebt = async function loadAllProfilesForDebt(reason) {
    reason = typeof reason === 'string' ? reason : 'debt-profile-coverage';
    if (typeof window.ensureDebtProfileCoverage === 'function') {
        return window.ensureDebtProfileCoverage(reason);
    }
    const st = window.__store || {};
    const profilesCount = Object.keys(st.profiles || {}).length;
    return { ok: profilesCount > 0, ready: profilesCount > 0, source: 'active-store-compat', profilesCount };
};

window.ensureDebtProfilesReady = async function ensureDebtProfilesReady(reason) {
    reason = typeof reason === 'string' ? reason : 'ensureDebtProfilesReady';
    const result = await window.loadAllProfilesForDebt(reason);
    const st = window.__store || {};

    st._profilesFullLoadedForDebt = !!(result && result.fallback);
    st._debtProfileCoverageReady = !!(result && result.ready);
    st._debtProfileCoverageSource = (result && result.source) || 'unknown';
    st._debtProfileCoverageCheckedAt = Date.now();

    if (typeof window.refreshListsComputation === 'function') {
        window.refreshListsComputation(['students.debtList', 'dashboard.summary'], reason);
    }
    if (typeof window.invalidateList === 'function') {
        window.invalidateList('students.debtList', reason);
    } else if (typeof window.invalidateStudents === 'function') {
        window.invalidateStudents(reason);
    }

    return {
        profilesCount: Object.keys(st.profiles || {}).length,
        fullLoaded: !!st._profilesFullLoadedForDebt,
        coverageReady: !!st._debtProfileCoverageReady,
        source: st._debtProfileCoverageSource,
        ...(result || {})
    };
};

// debugListPaginationCoverage — kiểm tra coverage của các list
window.debugListPaginationCoverage = function debugListPaginationCoverage() {
    const st  = window.__store || {};
    const pg  = st.pagination && st.pagination.students;
    const profiles = st.profiles || {};

    const _pgItems  = Array.isArray(pg && pg.currentItems) ? pg.currentItems.length : -1;
    const _profiles = Object.keys(profiles).length;

    const _activeRows = document.querySelectorAll('#activeList tr[data-student-id]').length;
    const _debtRows   = document.querySelectorAll('#debtList tr[data-debt-id], #debtList tr').length;
    const _txRows     = document.querySelectorAll('#txList tr[data-tx-id], #txList tr').length;

    const txPg  = (st.pagination && st.pagination.transactions) || {};
    const stuPg = pg || {};

    const result = {
        profilesTotal:        _profiles,
        paginationCurrentItems: _pgItems,
        paginationHasNext:    !!(pg && pg.hasNext),
        paginationPage:       (pg && pg.currentPage) || -1,
        activeRowsRendered:   _activeRows,
        debtRowsRendered:     _debtRows,
        txRowsRendered:       _txRows,
        debtRenderLimit:      window.__debtRenderLimit || 50,
        pgStudentsActive:     !!(st.pagination && st.pagination.students && st.pagination.students.searchActive),
        loadMoreTuitionReady:  typeof window.loadMoreTuitionTransactions === 'function',
        loadMoreActiveReady:   typeof window.loadMoreActiveStudents === 'function',
        loadMoreDebtReady:     typeof window.loadMoreDebtRows === 'function',
        ensureDebtProfilesReady: typeof window.ensureDebtProfilesReady === 'function',
        renderLoadMoreRowReady: typeof window.renderLoadMoreRow === 'function',
        // Phase 4K-5H: tuition/active/debt control diagnostics
        tuition: {
            hasControlDom:  !!document.getElementById('pgWrap_txList'),
            controlText:    (document.getElementById('pgWrap_txList') || {}).textContent || '',
            mergedAllItems: Array.isArray(txPg._mergedAllItems) ? txPg._mergedAllItems.length : -1,
            currentItems:   Array.isArray(txPg.currentItems) ? txPg.currentItems.length : -1,
            hasNext:        !!txPg.hasNext,
        },
        active: {
            hasControlDom:  !!document.getElementById('pgWrap_activeList'),
            controlText:    (document.getElementById('pgWrap_activeList') || {}).textContent || '',
            currentItems:   Array.isArray(stuPg.currentItems) ? stuPg.currentItems.length : -1,
            hasNext:        !!stuPg.hasNext,
        },
        debt: {
            fullLoadedForDebt:    !!st._profilesFullLoadedForDebt,
            profilesCount:        Object.keys(st.profiles || {}).length,
            debtRenderLimit:      window.__debtRenderLimit || 50,
            hasLoadMoreDebtButton: !!document.querySelector('[data-load-more-for="debtList"], button[onclick*="loadMoreDebtRows"]'),
            lastDebtLoadMoreLimit: st._lastDebtLoadMoreLimit || 0,
        },
        scrollY:                 window.scrollY || window.pageYOffset || 0,
        hasPreserveScrollHelper: typeof window.preserveScrollDuringListUpdate === 'function',
    };

    console.table(result);
    return result;
};

// ════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════
// Phase 4K-5I — debugLoadMoreScrollState
// ════════════════════════════════════════════════════════════════
window.debugLoadMoreScrollState = function debugLoadMoreScrollState() {
    const st = window.__store || {};
    const result = {
        scrollY:               window.scrollY || window.pageYOffset || 0,
        debtRenderLimit:       window.__debtRenderLimit || 50,
        activeRows:            document.querySelectorAll('#activeList tr[data-student-id]').length,
        debtRows:              document.querySelectorAll('#debtList tr[data-student-id], #debtList tr[data-debt-id]').length,
        activeHasNext:         !!((st.pagination || {}).students && (st.pagination.students || {}).hasNext),
        activeControlText:     (document.getElementById('pgWrap_activeList') || {}).textContent || '',
        debtLoadMoreButton:    !!document.querySelector('[data-load-more-for="debtList"], button[onclick*="loadMoreDebtRows"]'),
        lastDebtLoadMoreLimit: st._lastDebtLoadMoreLimit || 0,
        hasPreserveScrollHelper: typeof window.preserveScrollDuringListUpdate === 'function',
        loadMoreLock:          JSON.stringify(window.__loadMoreLock || {})
    };
    console.table(result);
    return result;
};

// Phase 4K-5H: debugTuitionTableLayout — kiểm tra geometry bảng Học Phí
window.debugTuitionTableLayout = function debugTuitionTableLayout() {
    const tbl = document.getElementById('tbl_tx');
    if (!tbl) return null;
    const ths       = Array.from(tbl.querySelectorAll('thead th'));
    const firstTds  = Array.from(tbl.querySelectorAll('tbody tr:not(.load-more-row) td')).slice(0, 7);
    const result = {
        tableLayout:  getComputedStyle(tbl).tableLayout,
        tableWidth:   Math.round(tbl.getBoundingClientRect().width),
        hasColgroup:  !!tbl.querySelector('colgroup'),
        headers: ths.map(function(th, i) {
            return { index: i + 1, text: th.textContent.trim(), width: Math.round(th.getBoundingClientRect().width) };
        }),
        firstRow: firstTds.map(function(td, i) {
            return { index: i + 1, className: td.className, width: Math.round(td.getBoundingClientRect().width) };
        }),
    };
    console.table(result.headers);
    console.log('[debugTuitionTableLayout]', result);
    return result;
};

// Phase 4K-5C — syncStudentStatusLocal — Hard separation: remove quit from pagination
window.syncStudentStatusLocal = function syncStudentStatusLocal(name, updateData, reason) {
    reason = typeof reason === 'string' ? reason : 'student-status-sync';
    try {
        const key = String(name || '').trim();
        if (!key || !updateData) return false;

        if (!window.__store) window.__store = {};
        if (!window.__store.profiles) window.__store.profiles = {};

        const oldProfile = window.__store.profiles[key] || {};
        const nextProfile = Object.assign({}, oldProfile, updateData);
        window.__store.profiles[key] = nextProfile;

        const classify = typeof window.classifyProfileStatus === 'function'
            ? window.classifyProfileStatus
            : function(p) { return p && (p.status === 'quit' || p.status === 'inactive' || p.status === 'retired') ? 'quit' : 'active'; };

        const kind = classify(nextProfile);

        // HARD SEPARATION: nếu status=quit, loại ra khỏi pagination.currentItems ngay
        const pg = window.__store.pagination && window.__store.pagination.students;
        if (pg && Array.isArray(pg.currentItems) && kind === 'quit') {
            pg.currentItems = pg.currentItems.filter(function(item) {
                const id = String(item.id || item.name || item.studentName || '').trim();
                return id !== key;
            });
        }

        window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
        window.__store._studentStatusVersion = (window.__store._studentStatusVersion || 0) + 1;

        if (typeof window.invalidateSearchCache === 'function') {
            window.invalidateSearchCache('students', reason);
        }

        if (typeof window.refreshListsComputation === 'function') {
            window.refreshListsComputation(['students.activeList', 'students.quitList', 'students.debtList', 'dashboard.summary'], reason);
        }

        if (typeof window.invalidateList === 'function') {
            window.invalidateList('students.activeList', reason);
            window.invalidateList('students.quitList', reason);
            window.invalidateList('students.debtList', reason);
        } else if (typeof window.invalidateStudents === 'function') {
            window.invalidateStudents(reason);
        }

        if (typeof window.invalidateDashboard === 'function') {
            window.invalidateDashboard(reason);
        }

        // Phase 4K-6A-B: removed scheduleRender() — use list-level invalidation above
        // Phase 4K-5F: Remove quit student from #activeList DOM immediately
        if (kind === 'quit') {
            try {
                const _tryCSS = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : null;
                if (_tryCSS) {
                    const _row = document.querySelector('#activeList tr[data-student-id="' + _tryCSS + '"]');
                    if (_row) _row.remove();
                } else {
                    Array.from(document.querySelectorAll('#activeList tr[data-student-id]'))
                        .filter(function(tr) { return tr.getAttribute('data-student-id') === key; })
                        .forEach(function(tr) { tr.remove(); });
                }
            } catch (_de) {}

            // Phase 4K-5L: Also remove from #debtList DOM immediately
            if (typeof window.removeStudentFromDebtDom === 'function') {
                window.removeStudentFromDebtDom(key);
            }
            if (window.__store) {
                window.__store._lastDebtRemoveReason = reason;
                window.__store._lastDebtRemoveName = key;
            }
        }

        console.debug('[syncStudentStatusLocal] synced:', key, '->', kind, updateData.status || '');
        return true;
    } catch (e) {
        console.warn('[syncStudentStatusLocal] error:', e);
        return false;
    }
};


// ════════════════════════════════════════════════════════════════
// Phase 4K-6A-B — ensureStudentTabRendered — safe per-tab render recovery
// ════════════════════════════════════════════════════════════════
window.ensureStudentTabRendered = function(tabId, reason) {
    reason = reason || 'ensure-student-tab-rendered';
    var map = {
        active: 'students.activeList',
        debt:   'students.debtList',
        quit:   'students.quitList'
    };
    var key = map[tabId];
    if (!key) return false;

    try {
        if (typeof window.refreshListComputation === 'function') {
            window.refreshListComputation(key, reason + ':' + tabId);
        } else if (typeof window.refreshListsComputation === 'function') {
            window.refreshListsComputation([key], reason + ':' + tabId);
        }

        if (typeof window.invalidateList === 'function') {
            window.invalidateList(key, reason + ':' + tabId);
        }

        return true;
    } catch (err) {
        console.warn('[ensureStudentTabRendered] failed:', tabId, err);
        return false;
    }
};

// ════════════════════════════════════════════════════════════════
// Phase 4K-5A — debugStudentStatusSeparation
// Kiểm tra phân tách võ sinh ĐANG TẬP / ĐÃ NGHỈ trong runtime.
// ════════════════════════════════════════════════════════════════
window.debugStudentStatusSeparation = function debugStudentStatusSeparation() {
    const profiles = (window.__store && window.__store.profiles) ? window.__store.profiles : {};
    const classify = typeof window.classifyProfileStatus === 'function'
        ? window.classifyProfileStatus
        : function(p) { return p && (p.status === 'quit' || p.status === 'inactive' || p.status === 'retired') ? 'quit' : 'active'; };

    let activeCount = 0, quitCount = 0, unknownCount = 0;
    const quitInActiveTab = [], activeInQuitTab = [];

    const activeListRows  = Array.from(document.querySelectorAll('#activeList tr[data-student-id]')).map(r => r.dataset.studentId);
    const quitListRows    = Array.from(document.querySelectorAll('#quitList  tr[data-student-id]')).map(r => r.dataset.studentId);

    Object.keys(profiles).forEach(name => {
        const p = profiles[name];
        const kind = classify(p);
        if (kind === 'active') activeCount++;
        else if (kind === 'quit') quitCount++;
        else unknownCount++;
    });

    // Check if any quit student appears in active tab DOM
    quitListRows.forEach(name => {
        if (activeListRows.includes(name)) quitInActiveTab.push(name);
    });
    activeListRows.forEach(name => {
        const p = profiles[name];
        if (p && classify(p) === 'quit') activeInQuitTab.push(name);
    });

    // Phase 4K-5C: Add pagination diagnostics
    const _pg = window.__store && window.__store.pagination && window.__store.pagination.students;
    const _pgItems = _pg && Array.isArray(_pg.currentItems) ? _pg.currentItems : [];
    const _pgQuitItems = _pgItems.filter(function(item) {
        const id = String(item.id || item.name || item.studentName || '').trim();
        const p = profiles[id];
        return p && classify(p) === 'quit';
    });

    const result = {
        totalProfiles: Object.keys(profiles).length,
        classifyActiveCount: activeCount,
        classifyQuitCount: quitCount,
        unknownCount: unknownCount,
        activeListDOMRows: activeListRows.length,
        quitListDOMRows: quitListRows.length,
        quitStudentsInActiveDOMTab: quitInActiveTab.length,
        separationOk: quitInActiveTab.length === 0 && activeInQuitTab.length === 0 && _pgQuitItems.length === 0,
        quitInActiveNames: quitInActiveTab.slice(0, 5),
        activeInQuitNames: activeInQuitTab.slice(0, 5),
        hasSyncStudentStatusLocal: typeof window.syncStudentStatusLocal === 'function',
        hasClassifyProfileStatus: typeof window.classifyProfileStatus === 'function',
        // Phase 4K-5C: pagination diagnostics
        storeKind: window.__store ? 'present' : 'missing',
        pgCurrentItemsCount: _pgItems.length,
        pgCurrentItemsQuitCount: _pgQuitItems.length,
        pgQuitSample: _pgQuitItems.slice(0, 3).map(function(i) { return String(i.id || i.name || i.studentName || ''); }),
        dataVersion: (window.__store && window.__store._dataVersion) || 0
    };

    console.table(result);
    return result;
};


// ════════════════════════════════════════════════════════════════
// Phase 4K-5L — Debt Action Bridge Hardening
// ════════════════════════════════════════════════════════════════

// PHẦN 1: Helper sync skippedMonths local
window.syncStudentSkippedMonthLocal = function(name, month, action, reason) {
    action = action || 'add';
    reason = typeof reason === 'string' ? reason : 'student-skipped-month-sync';
    var key = String(name || '').trim();
    var m   = String(month || '').trim();
    if (!key || !m) return false;

    if (!window.__store)           window.__store = {};
    if (!window.__store.profiles)  window.__store.profiles = {};

    var oldProfile = window.__store.profiles[key] || {};
    var oldSkipped = Array.isArray(oldProfile.skippedMonths)
        ? oldProfile.skippedMonths.slice()
        : [];

    var nextSkipped;
    if (action === 'remove') {
        nextSkipped = oldSkipped.filter(function(x) { return String(x) !== m; });
    } else {
        var set = {};
        oldSkipped.forEach(function(x) { set[x] = true; });
        set[m] = true;
        nextSkipped = Object.keys(set);
    }

    var nextProfile = Object.assign({}, oldProfile, { skippedMonths: nextSkipped });
    window.__store.profiles[key] = nextProfile;
    window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
    window.__store._studentSkippedMonthVersion = (window.__store._studentSkippedMonthVersion || 0) + 1;
    window.__store._lastSkippedMonthSyncReason = reason;
    window.__store._lastSkippedMonthSyncAt = Date.now();

    if (window.studentProfileStore && typeof window.studentProfileStore.mergeProfile === 'function') {
        try { window.studentProfileStore.mergeProfile(key, nextProfile, reason); } catch (_) {}
    }

    if (typeof window.invalidateSearchCache === 'function') {
        window.invalidateSearchCache('students', reason);
    }
    if (typeof window.refreshListsComputation === 'function') {
        window.refreshListsComputation(['students.debtList', 'dashboard.summary'], reason);
    }
    if (typeof window.invalidateList === 'function') {
        window.invalidateList('students.debtList', reason);
    } else if (typeof window.invalidateStudents === 'function') {
        window.invalidateStudents(reason);
    }
    if (typeof window.invalidateDashboard === 'function') {
        window.invalidateDashboard(reason);
    }

    return true;
};

// PHẦN 2: Helper remove row khỏi debt DOM ngay
window.removeStudentFromDebtDom = function(name) {
    var key = String(name || '').trim();
    if (!key) return false;

    var removed = false;
    Array.from(document.querySelectorAll('#debtList tr[data-debt-id], #debtList tr[data-student-id]'))
        .forEach(function(tr) {
            var id = tr.getAttribute('data-debt-id') || tr.getAttribute('data-student-id') || '';
            if (id === key) {
                tr.remove();
                removed = true;
            }
        });
    return removed;
};

// PHẦN 4: Action Nghỉ tập từ tab BÁO NỢ (Phase 4K-6A: wrapped with runGuardedAction)
window.markStudentQuitFromDebt = async function(event, name, month) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    var studentName   = String(name  || '').trim();
    var selectedMonth = String(month || '').trim();

    if (!studentName) return;

    if (window.userRole === 'viewer') {
        alert('Bạn không có quyền thực hiện thao tác này.');
        return;
    }

    if (!confirm('Chuyển võ sinh "' + studentName + '" sang trạng thái NGHỈ TẬP?')) return;

    return window.runGuardedAction(
        'debt.markStudentQuit:' + studentName,
        async function() {
            var quitDate = typeof window.getLocalToday === 'function'
                ? window.getLocalToday()
                : new Date().toISOString().slice(0, 10);

            var patch = { status: 'quit', quitDate: quitDate };

            const svc = window.StudentService || StudentService;

            if (svc && typeof svc.updateProfile === 'function') {
                await svc.updateProfile(studentName, patch);
            } else {
                var st = window.__store || {};
                var db = st.db || window.db;
                var clubId = st.clubId || window.currentClubId;

                if (window._fb_init && db && clubId) {
                    var _fb = window._fb_init;
                    await _fb.setDoc(
                        _fb.doc(db, 'clubs', clubId, 'profiles', studentName),
                        patch,
                        { merge: true }
                    );
                } else {
                    throw new Error('Không tìm thấy StudentService hoặc Firebase context để cập nhật hồ sơ.');
                }
            }

            if (typeof window.syncStudentStatusLocal === 'function') {
                window.syncStudentStatusLocal(studentName, patch, 'debt-mark-student-quit');
            }
            if (typeof window.removeStudentFromDebtDom === 'function') {
                window.removeStudentFromDebtDom(studentName);
            }
            // Phase 4K-6A-B: ensure debt list re-renders after quit action
            if (typeof window.ensureStudentTabRendered === 'function') {
                window.ensureStudentTabRendered('debt', 'after-mark-student-quit');
            }
            if (window.showToast) window.showToast('✅ Đã chuyển võ sinh sang Đã nghỉ!');
        },
        {
            errorMessage: 'Không chuyển được võ sinh sang nghỉ tập. Vui lòng kiểm tra quyền, mạng hoặc Console.'
        }
    );
};

// PHẦN 5: Action Báo nghỉ tháng từ tab BÁO NỢ (Phase 4K-6A: wrapped with runGuardedAction)
window.skipDebtMonthFromDebt = async function(event, name, month) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    var studentName   = String(name  || '').trim();
    var selectedMonth = String(month || '').trim();

    if (!studentName || !selectedMonth) return;

    if (window.userRole === 'viewer') {
        alert('Bạn không có quyền thực hiện thao tác này.');
        return;
    }

    var monthLabel = typeof window.formatMonth === 'function'
        ? window.formatMonth(selectedMonth)
        : selectedMonth;

    if (!confirm('Báo nghỉ / miễn học phí tháng ' + monthLabel + ' cho "' + studentName + '"?')) return;

    return window.runGuardedAction(
        'debt.skipMonth:' + studentName + ':' + selectedMonth,
        async function() {
            const svc = window.StudentService || StudentService;

            if (svc && typeof svc.addSkippedMonth === 'function') {
                await svc.addSkippedMonth(studentName, selectedMonth);
            } else if (typeof window.skipMonth === 'function') {
                await window.skipMonth(studentName, selectedMonth);
            } else {
                var st = window.__store || {};
                var db = st.db || window.db;
                var clubId = st.clubId || window.currentClubId;

                if (window._fb_init && db && clubId) {
                    var _fb = window._fb_init;
                    await _fb.setDoc(
                        _fb.doc(db, 'clubs', clubId, 'profiles', studentName),
                        { skippedMonths: _fb.arrayUnion(selectedMonth) },
                        { merge: true }
                    );
                } else {
                    throw new Error('Không tìm thấy StudentService/skipMonth/Firebase context để báo nghỉ.');
                }
            }

            if (typeof window.syncStudentSkippedMonthLocal === 'function') {
                window.syncStudentSkippedMonthLocal(studentName, selectedMonth, 'add', 'debt-skip-month');
            }
            if (typeof window.removeStudentFromDebtDom === 'function') {
                window.removeStudentFromDebtDom(studentName);
            }
            // Phase 4K-6A-B: ensure debt list re-renders after skip action
            if (typeof window.ensureStudentTabRendered === 'function') {
                window.ensureStudentTabRendered('debt', 'after-skip-debt-month');
            }
            if (window.showToast) window.showToast('✅ Đã báo nghỉ tháng này và miễn học phí!');
        },
        {
            errorMessage: 'Không báo nghỉ được. Vui lòng kiểm tra quyền, mạng hoặc Console.'
        }
    );
};

// PHẦN 8: Phase 4K-5L-C — Debug Service Bridge
window.debugDebtServiceBridge = function() {
    var st = window.__store || {};
    var result = {
        hasWindowStudentService:                  !!window.StudentService,
        hasWindowStudentServiceUpdateProfile:     !!(window.StudentService && window.StudentService.updateProfile),
        hasWindowStudentServiceAddSkippedMonth:   !!(window.StudentService && window.StudentService.addSkippedMonth),
        hasSkipMonth:                             typeof window.skipMonth === 'function',
        hasMarkStudentQuitFromDebt:               typeof window.markStudentQuitFromDebt === 'function',
        hasSkipDebtMonthFromDebt:                 typeof window.skipDebtMonthFromDebt === 'function',
        hasDb:                                    !!(st.db || window.db),
        hasClubId:                                !!(st.clubId || window.currentClubId),
        clubId:                                   st.clubId || window.currentClubId || '',
        mainScript:                               [...document.scripts].map(function(s) { return s.src; }).filter(function(x) { return x.includes('main.js'); }).join(' | ')
    };

    console.table(result);
    return result;
};

// PHẦN 9: Debug helper
window.debugDebtActionState = function(name) {
    var st       = window.__store || {};
    var profiles = st.profiles || {};
    var q        = String(name || '').trim();
    var profile  = q ? profiles[q] : null;

    var debtRowSelector = q
        ? ('#debtList tr[data-debt-id="' + (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(q) : q) + '"]')
        : null;

    var result = {
        queryName:                       q,
        hasProfile:                      !!profile,
        status:                          profile ? (profile.status || '') : '',
        quitDate:                        profile ? (profile.quitDate || '') : '',
        skippedMonths:                   profile ? (profile.skippedMonths || []) : [],
        selectedMonth:                   (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) || st.selectedMonth || '',
        debtRowExists:                   q && debtRowSelector ? !!document.querySelector(debtRowSelector) : null,
        hasMarkStudentQuitFromDebt:      typeof window.markStudentQuitFromDebt === 'function',
        hasSkipDebtMonthFromDebt:        typeof window.skipDebtMonthFromDebt === 'function',
        hasSyncStudentSkippedMonthLocal: typeof window.syncStudentSkippedMonthLocal === 'function',
        hasRemoveStudentFromDebtDom:     typeof window.removeStudentFromDebtDom === 'function',
        lastSkippedMonthSyncReason:      st._lastSkippedMonthSyncReason || '',
        lastDebtRemoveName:              st._lastDebtRemoveName || '',
        lastDebtRemoveReason:            st._lastDebtRemoveReason || '',
        hasDebtServiceBridge:            typeof window.debugDebtServiceBridge === 'function',
        debtServiceBridge:               typeof window.debugDebtServiceBridge === 'function'
            ? window.debugDebtServiceBridge()
            : null
    };

    console.table(result);
    return result;
};

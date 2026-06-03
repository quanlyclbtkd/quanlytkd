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

import { getLocalToday, formatDate, formatMonth, addMonthsToYYYYMM } from '../utils/format.js';
import { StudentService } from '../services/students.service.js';

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
        const branch         = isSingleBranch ? 'Mặc định' : document.getElementById('add_branch').value;
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

            // ── Tính gói học phí nhiều tháng ──────────────────────────────
            const startMonth     = joinDate.substring(0, 7);
            const monthsToRecord = [];
            let [y, m] = startMonth.split('-').map(Number);
            for (let i = 0; i < packageCount; i++) {
                let curM = m + i, curY = y;
                while (curM > 12) { curM -= 12; curY += 1; }
                monthsToRecord.push(`${curY}-${curM.toString().padStart(2, '0')}`);
            }
            const newPaidUntil = addMonthsToYYYYMM(startMonth, packageCount - 1);

            const trainingDays = Array.from(document.querySelectorAll('.add_trainingDay:checked')).map(cb => parseInt(cb.value));
            const _addNickEl   = document.getElementById('add_nickname');
            const _addNickVal  = _addNickEl ? _addNickEl.value.trim() : '';

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
                createdAt:       joinDate,
                paidUntil:       newPaidUntil,
                paidMonths:      monthsToRecord,
            });

            // ── Ghi transaction học phí ────────────────────────────────────
            if (fee > 0) {
                await StudentService.addTuitionTransaction({
                    branch, type: 'Học phí', description: _saveKey,
                    amount: fee, date: joinDate, txMonth: startMonth,
                    packageMonths: monthsToRecord, timestamp: Date.now(),
                });
            }

            // ── Xuất kho võ phục + ghi transaction ────────────────────────
            if (uniformSize) {
                const invId = await StudentService.addInventoryEntry({
                    size: uniformSize, type: 'Xuất bán', qty: 1,
                    desc: _saveKey, amount: uniformFee, date: joinDate, timestamp: Date.now() + 2,
                });
                if (isGift) {
                    await StudentService.addUniformTransaction({
                        branch: 'Chung', type: 'Tặng Võ phục',
                        description: `Tặng ${uniformSize} cho ${_saveKey}`,
                        amount: 0, date: joinDate, timestamp: Date.now() + 1, relatedInvId: invId,
                    });
                } else if (uniformFee > 0) {
                    await StudentService.addUniformTransaction({
                        branch: 'Chung', type: 'Thu Võ phục',
                        description: _saveKey, uniformSize,
                        amount: uniformFee, date: joinDate, timestamp: Date.now() + 1, relatedInvId: invId,
                    });
                }
                // Cập nhật inventory_stats (số dư + số xuất)
                await StudentService.decrementInventoryStock(uniformSize);
            }

            window.closeAddModal();
            window.showToast('🎉 Đã thêm võ sinh ' + _saveKey + ' thành công!', 3000);

            // ── Tạo biên lai nếu có thanh toán ────────────────────────────
            const totalPayment = fee + (isGift ? 0 : uniformFee);
            if (totalPayment > 0 && window.exportReceipt) {
                const breakdown = [];
                if (fee > 0) breakdown.push({ label: 'Học phí tháng ' + startMonth.replace('-', '/'), amount: fee });
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
                    _saveKey, totalPayment, receiptType, joinDate, startMonth,
                    branch, '', 'BIÊN LAI THU TIỀN', breakdown.length > 1 ? breakdown : null
                );
            }
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
            branch:          isSingleBranch ? 'Mặc định' : document.getElementById('m_branch').value,
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
            StudentService.updateProfile(name, { status: 'quit', quitDate: getLocalToday() })
                .then(() => window.showToast('✅ Đã chuyển trạng thái Nghỉ tập!'));
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
        const monthsLabel = window.formatMonthCompact(monthsStr);
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
            if (p.status !== 'active') return;
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
                monthsLabel: window.formatMonthCompact(owedMonthsStr),
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

    // ════════════════════════════════════════════════════════════════
    // FORMAT HELPERS (backward-compat alias)
    // ════════════════════════════════════════════════════════════════

    /**
     * Rút gọn danh sách tháng thành chuỗi ngắn gọn cho UI.
     *
     * Ví dụ:
     *   "2025-01,2025-02,2025-03" → "T1, T2, T3/2025"
     *   "2024-12,2025-01"         → "T12/2024; T1/2025"
     *   "2025-03"                  → "03/2025"  (single month — dùng formatMonth)
     *
     * Override window.formatMonthCompact từ app.js với ES module version
     * (logic tương đương nhưng sort đúng số thứ tự tháng).
     */
    window.formatMonthCompact = (monthsStr) => {
        if (!monthsStr || !monthsStr.includes(',')) return formatMonth(monthsStr);
        const months = monthsStr.split(',').map(s => s.trim());
        const byYear = {};
        months.forEach(mo => {
            const [yr, mn] = mo.split('-');
            if (!byYear[yr]) byYear[yr] = [];
            byYear[yr].push(parseInt(mn));
        });
        return Object.keys(byYear).sort().map(yr =>
            byYear[yr].sort((a, b) => a - b).map(mn => `T${mn}`).join(', ') + `/${yr}`
        ).join('; ');
    };

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
            'generateMultiMonthPaymentRequest, formatMonthCompact'
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
    import('../utils/pagination.js').then(({
        createPaginationState, resetPagination, processPage,
        prepareNextPage, preparePreviousPage,
        renderPaginationControls, PAGE_SIZE,
    }) => {
        import('./students.js').then(() => {}); // no-op — chỉ để IDE không warn
        import('../services/students.service.js').then(({ StudentService }) => {

            const store = window.__store;
            if (!store) { console.warn('[pagination/students] __store chưa sẵn sàng'); return; }

            // Khởi tạo pagination state nếu chưa có
            if (!store.pagination) store.pagination = {};
            store.pagination.students = createPaginationState(PAGE_SIZE);
            const pgState = store.pagination.students;

            // ── Nội bộ: lấy search/filter hiện tại từ DOM ──────────────
            function _getCurrentSearch() {
                const el = document.getElementById('searchInput') ||
                           document.getElementById('search') ||
                           document.querySelector('input[placeholder*="tên"]');
                return el ? el.value.trim().toLowerCase() : '';
            }

            // ── Render pagination controls vào DOM ──────────────────────
            function _injectControls() {
                const from = pgState.currentPage > 0
                    ? (pgState.currentPage - 1) * PAGE_SIZE + 1
                    : 0;
                const to   = pgState.totalLoaded;
                const html = renderPaginationControls(pgState, 'students', from, to);

                ['activeList', 'quitList'].forEach(listId => {
                    const table = document.getElementById(listId);
                    if (!table) return;
                    const ctrlId  = 'pgWrap_' + listId;
                    let ctrlEl    = document.getElementById(ctrlId);
                    if (!ctrlEl) {
                        ctrlEl      = document.createElement('div');
                        ctrlEl.id   = ctrlId;
                        table.parentNode.insertBefore(ctrlEl, table.nextSibling);
                    }
                    ctrlEl.innerHTML = html;
                });
            }

            // Phase 4K-STUDENT-LIST: Fallback render nếu island không inject rows
            // Chỉ chạy khi: #activeList tồn tại, pgState.currentItems > 0, DOM trống
            // Không phá render island hiện tại — guard tr[data-student-id] trước khi inject
            function _renderStudentsPageRowsFallback(pgState) {
                try {
                    const target = document.getElementById('activeList');
                    if (!target) return false;
                    if (!pgState || !Array.isArray(pgState.currentItems)) return false;
                    if (pgState.currentItems.length === 0) return false;
                    if (target.querySelector('tr[data-student-id]')) return false; // island đã render
                    const rows = pgState.currentItems.map(item => {
                        const _rawName = item.id || item.name || '';
                        const _esc     = _rawName.replace(/'/g, "\\'");
                        const p        = item;
                        return `<tr data-student-id="${_esc}"><td class="name-link text-[0.95rem]" onclick="openProfile('${_esc}')">${_rawName}</td><td class="text-[0.7rem] font-bold text-slate-500">${p.memberId || '-'}</td><td>-</td><td>-</td><td>-</td><td class="badge bg-rose-50 text-rose-600 text-[0.7rem]">-</td><td class="font-medium text-slate-600">${p.phone || ''}</td><td class="text-slate-500">-</td><td><button type="button" class="btn-sm bg-slate-100 text-slate-700 border border-slate-200" onclick="openProfile('${_esc}')">👁️ Xem</button></td></tr>`;
                    }).join('');
                    if (!rows) return false;
                    target.innerHTML = rows;
                    console.warn('[students-pagination] 🔧 Fallback render —', pgState.currentItems.length, 'rows → #activeList (island miss)');
                    return true;
                } catch (_fe) {
                    return false;
                }
            }

            // Phase 4K-STUDENT-RENDER-OVERWRITE-FIX: Global row builder dùng chung
            // cho renderActiveIsland() và _renderStudentsPageRowsFallback().
            // renderActiveIsland dùng khi activeRows cache rỗng nhưng pagination có items.
            // Dùng HTML attribute escaping an toàn thay vì replace('/g) đơn giản.
            window.buildStudentsRowsFromPagination = function buildStudentsRowsFromPagination(items, mode) {
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
            async function _doLoad(cursor, direction) {
                if (pgState.isLoading) return;
                pgState.isLoading = true;
                _injectControls(); // hiện spinner ngay

                const search = _getCurrentSearch();

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

                try {
                    // Phase 4.0B-4J-8A: Server-side search khi có search term
                    const _isSearch = search && search.trim().length > 0;
                    if (_isSearch && typeof StudentService.searchProfilesServerSide === 'function') {
                        if (_srEl) _srEl.textContent = 'Đang tìm...';

                        const _sr = await StudentService.searchProfilesServerSide(search, { pageSize: PAGE_SIZE });

                        pgState.currentItems = _sr.items || [];
                        pgState.currentPage  = 1;
                        pgState.totalLoaded  = pgState.currentItems.length;
                        pgState.hasNext      = _sr.hasMore || false;
                        pgState.hasPrevious  = false;
                        pgState.isLoading    = false;
                        pgState.enabled      = true;
                        pgState.searchQuery  = search;
                        pgState.searchActive = true;

                        if (_srEl) {
                            _srEl.textContent = pgState.currentItems.length === 0
                                ? 'Không tìm thấy võ sinh'
                                : ('Tìm thấy ' + pgState.currentItems.length + (_sr.hasMore ? '+' : '') + ' kết quả');
                        }
                    } else {
                        if (_srEl) _srEl.textContent = '';
                        pgState.searchActive = false;

                        const snap = await StudentService.getProfilesPage({
                            pageSize:  PAGE_SIZE,
                            cursor,
                            direction,
                            search,
                        });

                        const items = processPage(snap, pgState);
                        pgState.enabled     = true;
                        pgState.searchQuery = search;
                    }

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

                    // Phase 3.5B: Dùng domain-specific invalidation thay vì full renderApp()
                    // invalidateStudents() chỉ invalidate students islands (activeList, v.v.)
                    // và cross-domain dashboard — không trigger toàn bộ render cycle.
                    // Fallback về _moduleRenderApp / scheduleRender để backward compat.
                    if (typeof window.invalidateStudents === 'function') {
                        window.invalidateStudents('students-pagination');
                    } else if (typeof window._moduleRenderApp === 'function') {
                        window._moduleRenderApp();
                    } else if (typeof window.scheduleRender === 'function') {
                        window.scheduleRender();
                    }

                    // Phase 4K-STUDENT-LIST: invalidate students.activeList cụ thể
                    // để render island biết cần cập nhật list ngay sau pagination load
                    if (typeof window.refreshListComputation === 'function') {
                        window.refreshListComputation('students.activeList', 'students-pagination-loaded');
                    }
                    if (typeof window.invalidateList === 'function') {
                        window.invalidateList('students.activeList', 'students-pagination-loaded');
                        const _curTabId = typeof window.getCurrentActiveTabId === 'function'
                            ? window.getCurrentActiveTabId() : '';
                        if (_curTabId === 'quit') {
                            window.invalidateList('students.quitList', 'students-pagination-loaded');
                        }
                    }
                    // Fallback: nếu island không render sau 300ms, inject rows trực tiếp
                    setTimeout(() => _renderStudentsPageRowsFallback(pgState), 300);
                } catch (err) {
                    console.error('[pagination/students] Lỗi load trang:', err);
                    pgState.isLoading = false;
                }

                _injectControls();
            }

            // ── API: Load trang đầu tiên ────────────────────────────────
            async function loadFirstPage() {
                resetPagination(pgState);
                pgState.currentPage = 1;
                await _doLoad(null, 'first');
            }

            // ── API: Trang tiếp theo ────────────────────────────────────
            window._pgNext_students = async function () {
                const cursor = prepareNextPage(pgState);
                if (!cursor) return;
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

            // ── Bind: Tự động load lại khi search thay đổi ──────────────
            function _bindSearchReset() {
                const el = document.getElementById('searchInput') ||
                           document.getElementById('search') ||
                           document.querySelector('input[placeholder*="tên"]');
                if (!el || el.__pgStudentsbound) return;
                el.__pgStudentsbound = true;
                // Phase 4J-9B: Đánh dấu PRIMARY controller đã mount.
                // students.events.js và app.js oninput sẽ kiểm tra flag này để tránh double-bind.
                window.__studentSearchControllerMounted = true;
                console.info('[students.js] ✅ PRIMARY search controller mounted (_bindSearchReset).');
                let _debounce = null;
                el.addEventListener('input', () => {
                    clearTimeout(_debounce);
                    _debounce = setTimeout(() => {
                        resetPagination(pgState);
                        pgState.currentPage = 1;
                        _doLoad(null, 'first');
                    }, 350);
                });
            }

            // ── Auto-start: Load trang đầu khi module init ──────────────
            // Delay nhỏ để đảm bảo DOM và Firebase refs đã sẵn sàng
            setTimeout(() => {
                _bindSearchReset();
                loadFirstPage();
            }, 600);

            console.info('[students.js] ✅ Phase 3.2A — initStudentPagination() OK, PAGE_SIZE =', PAGE_SIZE);

        }).catch(err => console.error('[initStudentPagination] import students.service:', err));
    }).catch(err => console.error('[initStudentPagination] import pagination.js:', err));
}

/**
 * js/events/students.events.js — Phase 3.1
 * ────────────────────────────────────────────────────────────────
 * Event Layer: Bind tất cả DOM events liên quan đến Võ Sinh.
 *
 * MỤC TIÊU:
 *   Tách event binding ra khỏi initStudents() trong students.js.
 *   initStudents() chỉ còn đăng ký window.X functions.
 *   Event bindings (form submit, button click) nằm ở đây.
 *
 * ĐƯỢC GỌI TỪ: main.js → initStudentsEvents()
 *
 * PATTERN:
 *   - Bind DOM events SAU khi DOM đã sẵn sàng (gọi sau DOMContentLoaded)
 *   - Dùng event delegation cho các phần tử được tạo động (renderStudentList)
 *   - window.X functions phải đã được mount trước (initStudents() chạy trước)
 *
 * /// Phase 3.1 — Event Layer
 * ────────────────────────────────────────────────────────────────
 */

/**
 * initStudentsEvents() — Khởi tạo tất cả DOM event listeners cho Võ Sinh.
 *
 * Được gọi từ main.js sau khi initStudents() đã chạy.
 *
 * Events được bind:
 *   1. Search input — lọc danh sách võ sinh real-time
 *   2. addModal overlay click — đóng modal khi bấm ngoài
 *   3. profileModal overlay click — đóng modal hồ sơ
 *   4. Bulk Zalo modal events
 *   5. Keyboard shortcuts (Escape đóng modal)
 */
export function initStudentsEvents() {

    // ── 1. Search input ──────────────────────────────────────────
    // Phase 4J-9B: Chỉ bind nếu PRIMARY controller (students.js _bindSearchReset) CHƯA mount.
    // PRIMARY set window.__studentSearchControllerMounted = true khi init xong.
    // Tránh double-binding: PRIMARY có debounce 350ms + server-side search.
    // FALLBACK này (students.events.js) không debounce, chỉ dùng khi PRIMARY chưa sẵn sàng.
    const searchInput = document.getElementById('searchInput');
    if (searchInput && !searchInput.dataset.evtBound) {
        searchInput.addEventListener('input', () => {
            // Runtime guard: nếu PRIMARY controller đã mount sau khi fallback được bind,
            // bỏ qua callback này để tránh double render.
            if (window.__studentSearchControllerMounted) return;
            if (typeof window.filterStudents === 'function') {
                window.filterStudents(searchInput.value);
            } else if (typeof window.renderStudents === 'function') {
                window.renderStudents({ search: searchInput.value });
            }
        });
        searchInput.dataset.evtBound = '1';
        console.info('[students.events.js] FALLBACK search binding active (PRIMARY chưa mount).');
    } else if (searchInput && window.__studentSearchControllerMounted) {
        console.info('[students.events.js] Search binding skipped — PRIMARY controller (students.js) đã active.');
    }

    // ── 2. addModal overlay click (đóng khi bấm backdrop) ────────
    const addModal = document.getElementById('addModal');
    if (addModal && !addModal.dataset.evtBound) {
        addModal.addEventListener('click', (e) => {
            if (e.target === addModal) {
                if (typeof window.closeAddModal === 'function') window.closeAddModal();
            }
        });
        addModal.dataset.evtBound = '1';
    }

    // ── 3. profileModal overlay click ────────────────────────────
    const profileModal = document.getElementById('profileModal');
    if (profileModal && !profileModal.dataset.evtBound) {
        profileModal.addEventListener('click', (e) => {
            if (e.target === profileModal) {
                if (typeof window.closeModal === 'function') window.closeModal('profileModal');
            }
        });
        profileModal.dataset.evtBound = '1';
    }

    // ── 4. Bulk Zalo modal close ──────────────────────────────────
    const bulkZaloModal = document.getElementById('bulkZaloModal');
    if (bulkZaloModal && !bulkZaloModal.dataset.evtBound) {
        bulkZaloModal.addEventListener('click', (e) => {
            if (e.target === bulkZaloModal) bulkZaloModal.style.display = 'none';
        });
        bulkZaloModal.dataset.evtBound = '1';
    }

    // ── 5. Keyboard shortcuts ─────────────────────────────────────
    if (!document.body.dataset.studentsEscBound) {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            // Đóng modal thêm võ sinh
            const am = document.getElementById('addModal');
            if (am && am.style.display !== 'none') {
                if (typeof window.closeAddModal === 'function') window.closeAddModal();
                return;
            }
            // Đóng modal hồ sơ
            const pm = document.getElementById('profileModal');
            if (pm && pm.style.display !== 'none') {
                if (typeof window.closeModal === 'function') window.closeModal('profileModal');
                return;
            }
        });
        document.body.dataset.studentsEscBound = '1';
    }

    // ── 6. Student filter dropdowns ───────────────────────────────
    ['filterBranch', 'filterBelt', 'filterStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.evtBound) {
            el.addEventListener('change', () => {
                if (typeof window.renderStudents === 'function') window.renderStudents();
            });
            el.dataset.evtBound = '1';
        }
    });

    // ── 7. Add student form — fee preview ──────────────────────────
    const addFeeDisplay = document.getElementById('add_fee_display');
    if (addFeeDisplay && !addFeeDisplay.dataset.evtBound) {
        addFeeDisplay.addEventListener('input', () => {
            const raw = addFeeDisplay.value.replace(/\D/g, '');
            const el  = document.getElementById('add_fee_actual');
            if (el) el.value = raw;
        });
        addFeeDisplay.dataset.evtBound = '1';
    }

    // ── 8. Add uniform fee preview ────────────────────────────────
    const addUniDisplay = document.getElementById('add_uniform_display');
    if (addUniDisplay && !addUniDisplay.dataset.evtBound) {
        addUniDisplay.addEventListener('input', () => {
            const raw = addUniDisplay.value.replace(/\D/g, '');
            const el  = document.getElementById('add_uniform_actual');
            if (el) el.value = raw;
        });
        addUniDisplay.dataset.evtBound = '1';
    }

    // ── 9. Package count → fee preview ───────────────────────────
    const packageSel = document.getElementById('add_package');
    if (packageSel && !packageSel.dataset.evtBound) {
        packageSel.addEventListener('change', () => {
            const pkg    = parseInt(packageSel.value) || 1;
            const defFee = Number(document.getElementById('add_fee_default_actual')?.value || 0);
            const totalFee = defFee * pkg;
            const feeDisp = document.getElementById('add_fee_display');
            const feeAct  = document.getElementById('add_fee_actual');
            if (feeDisp && defFee > 0) feeDisp.value = totalFee.toLocaleString('vi-VN');
            if (feeAct  && defFee > 0) feeAct.value  = totalFee;
        });
        packageSel.dataset.evtBound = '1';
    }

    // ── 10. Profile modal fee display ─────────────────────────────
    const mFeeDisplay = document.getElementById('m_fee_display');
    if (mFeeDisplay && !mFeeDisplay.dataset.evtBound) {
        mFeeDisplay.addEventListener('input', () => {
            const raw = mFeeDisplay.value.replace(/\D/g, '');
            const el  = document.getElementById('m_fee_actual');
            if (el) el.value = raw;
        });
        mFeeDisplay.dataset.evtBound = '1';
    }

    // ── Phase 3.2A: Pagination button event delegation ────────────
    // Các nút Previous/Next được inject động vào DOM sau khi load dữ liệu.
    // Dùng event delegation trên document để không cần re-bind sau mỗi lần render.
    if (!document.body.dataset.pgStudentsBound) {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#pgPrev_students, #pgNext_students');
            if (!btn) return;
            if (btn.id === 'pgPrev_students' && typeof window._pgPrev_students === 'function') {
                window._pgPrev_students();
            } else if (btn.id === 'pgNext_students' && typeof window._pgNext_students === 'function') {
                window._pgNext_students();
            }
        });
        document.body.dataset.pgStudentsBound = '1';
    }

    console.info('[students.events.js] ✅ Phase 3.1 + 3.2A event bindings mounted');
}

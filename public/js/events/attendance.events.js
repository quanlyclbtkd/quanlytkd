/**
 * js/events/attendance.events.js — Phase 3.1
 * ────────────────────────────────────────────────────────────────
 * Event Layer: Bind tất cả DOM events liên quan đến Điểm Danh.
 *
 * Được tách ra từ initAttendance() trong attendance.js.
 *
 * ĐƯỢC GỌI TỪ: main.js → initAttendanceEvents()
 *
 * Events được bind:
 *   1. att_date change → renderAttendanceList
 *   2. att_branch / att_belt change → renderAttendanceList
 *   3. att_shift change → onShiftChange
 *   4. chk_show_all_att change → renderAttendanceList
 *   5. shiftModal overlay click
 *   6. attHistModal overlay click (inject khi cần)
 *   7. coachNoteForm submit
 *
 * /// Phase 3.1 — Event Layer
 * ────────────────────────────────────────────────────────────────
 */

/**
 * initAttendanceEvents() — Bind tất cả DOM event listeners điểm danh.
 */
export function initAttendanceEvents() {

    // ── 1. att_date change → reload attendance ────────────────────
    const attDate = document.getElementById('att_date');
    if (attDate && !attDate.dataset.evtBound) {
        attDate.addEventListener('change', () => {
            if (typeof window.renderAttendanceList === 'function') window.renderAttendanceList();
        });
        attDate.dataset.evtBound = '1';
    }

    // ── 2. att_branch / att_belt filter changes ───────────────────
    ['att_branch', 'att_belt'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.evtBound) {
            el.addEventListener('change', () => {
                if (typeof window.renderAttendanceList === 'function') window.renderAttendanceList();
            });
            el.dataset.evtBound = '1';
        }
    });

    // ── 3. att_shift change ───────────────────────────────────────
    const attShift = document.getElementById('att_shift');
    if (attShift && !attShift.dataset.evtBound) {
        attShift.addEventListener('change', () => {
            if (typeof window.onShiftChange === 'function') window.onShiftChange();
        });
        attShift.dataset.evtBound = '1';
    }

    // ── 4. chk_show_all_att toggle ────────────────────────────────
    const showAll = document.getElementById('chk_show_all_att');
    if (showAll && !showAll.dataset.evtBound) {
        showAll.addEventListener('change', () => {
            if (typeof window.renderAttendanceList === 'function') window.renderAttendanceList();
        });
        showAll.dataset.evtBound = '1';
    }

    // ── 5. shiftModal overlay click ───────────────────────────────
    const shiftModal = document.getElementById('shiftModal');
    if (shiftModal && !shiftModal.dataset.evtBound) {
        shiftModal.addEventListener('click', (e) => {
            if (e.target === shiftModal) {
                if (typeof window.closeShiftModal === 'function') window.closeShiftModal();
            }
        });
        shiftModal.dataset.evtBound = '1';
    }

    // ── 6. Coach note form submit ─────────────────────────────────
    const coachNoteForm = document.getElementById('coachNoteForm');
    if (coachNoteForm && !coachNoteForm.dataset.evtBound) {
        coachNoteForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (typeof window.saveCoachNote === 'function') window.saveCoachNote();
        });
        coachNoteForm.dataset.evtBound = '1';
    }

    // ── 7. Nút điểm danh hàng loạt ───────────────────────────────
    const bulkCheckInBtn = document.getElementById('btn_bulk_checkin');
    if (bulkCheckInBtn && !bulkCheckInBtn.dataset.evtBound) {
        bulkCheckInBtn.addEventListener('click', () => {
            if (typeof window.bulkCheckIn === 'function') window.bulkCheckIn();
        });
        bulkCheckInBtn.dataset.evtBound = '1';
    }

    // ── 8. Export attendance button ───────────────────────────────
    const exportAttBtn = document.getElementById('btn_export_att');
    if (exportAttBtn && !exportAttBtn.dataset.evtBound) {
        exportAttBtn.addEventListener('click', () => {
            if (typeof window.exportAttendance === 'function') window.exportAttendance();
        });
        exportAttBtn.dataset.evtBound = '1';
    }

    // ── 9. Nút mở modal thống kê chuyên cần tháng ─────────────────
    const monthlyAttBtn = document.getElementById('btn_monthly_attendance');
    if (monthlyAttBtn && !monthlyAttBtn.dataset.evtBound) {
        monthlyAttBtn.addEventListener('click', () => {
            if (typeof window.openMonthlyAttModal === 'function') window.openMonthlyAttModal();
        });
        monthlyAttBtn.dataset.evtBound = '1';
    }

    console.info('[attendance.events.js] ✅ Phase 3.1 event bindings mounted');
}

/**
 * js/events/finance.events.js — Phase 3.1
 * ────────────────────────────────────────────────────────────────
 * Event Layer: Bind tất cả DOM events liên quan đến Tài Chính.
 *
 * Được tách ra từ initFinance() trong finance.js.
 * Các form.onsubmit handlers ĐƯỢC ĐỊNH NGHĨA ở đây, không trong module.
 *
 * ĐƯỢC GỌI TỪ: main.js → initFinanceEvents()
 *
 * Events được bind:
 *   1. transactionForm.onsubmit → window.saveTx (vẫn trong finance.js)
 *   2. comboModal overlay click
 *   3. quickPayModal overlay click
 *   4. Amount display inputs → sync với actual hidden inputs
 *   5. filterMonth change → re-render
 *
 * /// Phase 3.1 — Event Layer
 * ────────────────────────────────────────────────────────────────
 */

/**
 * initFinanceEvents() — Bind tất cả DOM event listeners tài chính.
 */
export function initFinanceEvents() {

    // ── 1. transactionForm — Form thu tiền chính ─────────────────
    const txForm = document.getElementById('transactionForm');
    if (txForm && !txForm.dataset.evtBound) {
        txForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Delegate sang window.saveTx (được mount bởi initFinance())
            if (typeof window.saveTx === 'function') {
                window.saveTx(e);
            }
        });
        txForm.dataset.evtBound = '1';
    }

    // ── 2. comboModal overlay click ───────────────────────────────
    const comboModal = document.getElementById('comboModal');
    if (comboModal && !comboModal.dataset.evtBound) {
        comboModal.addEventListener('click', (e) => {
            if (e.target === comboModal) comboModal.style.display = 'none';
        });
        comboModal.dataset.evtBound = '1';
    }

    // ── 3. quickPayModal overlay click ────────────────────────────
    const qpmModal = document.getElementById('quickPayModal');
    if (qpmModal && !qpmModal.dataset.evtBound) {
        qpmModal.addEventListener('click', (e) => {
            if (e.target === qpmModal) qpmModal.style.display = 'none';
        });
        qpmModal.dataset.evtBound = '1';
    }

    // ── 4. Amount display inputs → sync actual values ─────────────
    // Main transaction form
    _bindDisplayToActual('amountDisplay', 'amountActual');
    // Exam amount trong combo thu học phí + thi
    _bindDisplayToActual('tx_exam_amountDisplay', 'tx_exam_amountActual');
    // Combo family
    _bindDisplayToActual('combo_fee1_display', 'combo_fee1_actual');
    _bindDisplayToActual('combo_fee2_display', 'combo_fee2_actual');

    // ── 5. transactionType change → toggle exam fields ────────────
    const typeSelect = document.getElementById('type');
    if (typeSelect && !typeSelect.dataset.evtBound) {
        typeSelect.addEventListener('change', () => {
            if (typeof window.onTxTypeChange === 'function') window.onTxTypeChange();
        });
        typeSelect.dataset.evtBound = '1';
    }

    // ── 6. filterMonth change → reload transactions ───────────────
    const filterMonth = document.getElementById('filterMonth');
    if (filterMonth && !filterMonth.dataset.evtBound) {
        filterMonth.addEventListener('change', () => {
            if (typeof window.onFilterMonthChange === 'function') window.onFilterMonthChange();
        });
        filterMonth.dataset.evtBound = '1';
    }

    // ── 7. tx_package select → update amount hint ─────────────────
    const txPackage = document.getElementById('tx_package');
    if (txPackage && !txPackage.dataset.evtBound) {
        txPackage.addEventListener('change', () => {
            if (typeof window.onTxPackageChange === 'function') window.onTxPackageChange();
        });
        txPackage.dataset.evtBound = '1';
    }

    // ── 8. description input → autocomplete từ profiles ──────────
    const descInput = document.getElementById('description');
    if (descInput && !descInput.dataset.evtBound) {
        descInput.addEventListener('input', () => {
            if (typeof window.onDescriptionInput === 'function') window.onDescriptionInput(descInput.value);
        });
        descInput.dataset.evtBound = '1';
    }

    // ── Phase 3.2A: Pagination button event delegation ────────────
    // Inject động vào DOM — dùng event delegation để không cần re-bind.
    if (!document.body.dataset.pgTxBound) {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#pgPrev_transactions, #pgNext_transactions');
            if (!btn) return;
            if (btn.id === 'pgPrev_transactions' && typeof window._pgPrev_transactions === 'function') {
                window._pgPrev_transactions();
            } else if (btn.id === 'pgNext_transactions' && typeof window._pgNext_transactions === 'function') {
                window._pgNext_transactions();
            }
        });
        document.body.dataset.pgTxBound = '1';
    }

    console.info('[finance.events.js] ✅ Phase 3.1 + 3.2A event bindings mounted');
}

// ── Private helper ────────────────────────────────────────────────
/**
 * Bind input display (formatted) → sync sang actual (raw number).
 * Idempotent: dùng data-evt-bound để tránh bind đôi.
 */
function _bindDisplayToActual(displayId, actualId) {
    const displayEl = document.getElementById(displayId);
    const actualEl  = document.getElementById(actualId);
    if (!displayEl || !actualEl || displayEl.dataset.evtBound) return;

    displayEl.addEventListener('input', () => {
        const raw = displayEl.value.replace(/[^0-9]/g, '');
        actualEl.value = raw;
        // Format lại display với dấu phẩy ngăn cách nghìn
        if (raw) displayEl.value = Number(raw).toLocaleString('vi-VN');
    });
    displayEl.dataset.evtBound = '1';
}

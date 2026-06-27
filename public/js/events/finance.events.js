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

// ── Phase 4K-3: Tuition Receipt + Student Profile event delegation ─────────
/**
 * initFinanceActionEvents() — Event delegation cho nút In biên lai và click tên võ sinh.
 *
 * Dùng capture phase (true) và document-level delegation nên hoạt động với:
 *   - render đầu tiên, sau search, sau đổi tháng, sau cache hit, sau hard refresh.
 *
 * Idempotent: guard bằng window.__financeActionEventsMounted.
 * Phụ thuộc runtime bridges:
 *   - window.printTuitionReceiptByTxId(txId, opts)
 *   - window.openStudentProfileByName(name)
 */
export function initFinanceActionEvents() {
    if (window.__financeActionEventsMounted) return;
    window.__financeActionEventsMounted = true;

    document.addEventListener('click', function(e) {
        // ── In biên lai học phí ─────────────────────────────────────────
        const printBtn = e.target.closest('[data-action="print-tuition-receipt"], .js-print-tuition-receipt');
        if (printBtn) {
            e.preventDefault();
            e.stopPropagation();

            const txId        = printBtn.getAttribute('data-tx-id');
            const studentName = printBtn.getAttribute('data-student-name');
            // Phase 4K-3B: pass all attrs so hardened bridge can use them if tx not in store
            const amount      = Number(printBtn.getAttribute('data-tx-amount') || 0);
            const type        = printBtn.getAttribute('data-tx-type') || '';
            const date        = printBtn.getAttribute('data-tx-date') || '';
            const txMonths    = printBtn.getAttribute('data-tx-months') || '';
            const branch      = printBtn.getAttribute('data-tx-branch') || '';
            const examTitle   = printBtn.getAttribute('data-exam-title') || '';

            if (typeof window.printTuitionReceiptByTxId === 'function') {
                window.printTuitionReceiptByTxId(txId, {
                    studentName, amount, type, date, txMonths, branch, examTitle,
                });
            } else {
                console.warn('[tuition-receipt] printTuitionReceiptByTxId missing');
            }
            return;
        }

        // ── Mở hồ sơ võ sinh ───────────────────────────────────────────
        const profileBtn = e.target.closest('[data-action="open-student-profile"], .js-open-student-profile');
        if (profileBtn) {
            e.preventDefault();
            e.stopPropagation();

            const studentName = profileBtn.getAttribute('data-student-name')
                || profileBtn.textContent.trim();

            if (typeof window.openStudentProfileByName === 'function') {
                window.openStudentProfileByName(studentName);
            } else {
                console.warn('[student-profile] openStudentProfileByName missing');
            }
            return;
        }

        // ── Phase 4K-3B: Chọn size võ phục — mở size picker ───────────
        const chooseSizeBtn = e.target.closest(
            '[data-action="choose-admission-uniform-size"], .js-choose-admission-uniform-size'
        );
        if (chooseSizeBtn) {
            e.preventDefault();
            e.stopPropagation();

            if (typeof window.ensureInventoryReady === 'function') {
                window.ensureInventoryReady('choose-size-btn').then(function() {
                    if (typeof window.renderAdmissionUniformSizeOptions === 'function') {
                        window.renderAdmissionUniformSizeOptions();
                    }
                });
            } else if (typeof window.renderAdmissionUniformSizeOptions === 'function') {
                window.renderAdmissionUniformSizeOptions();
            }
            return;
        }

        // ── Phase 4K-3B: Chọn size cụ thể — ghi vào add_uniform_size ──
        const sizeOptionBtn = e.target.closest('[data-action="select-admission-uniform-size"]');
        if (sizeOptionBtn) {
            e.preventDefault();
            e.stopPropagation();

            const sizeVal = sizeOptionBtn.getAttribute('data-size-value')
                || sizeOptionBtn.textContent.trim();
            const sizeSelect = document.getElementById('add_uniform_size');
            if (sizeSelect && sizeVal) {
                sizeSelect.value = sizeVal;
                sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
        }
    }, true);

    console.info('[finance.events.js] ✅ Phase 4K-3B tuition action + admission size event delegation mounted');
}

// Expose lên window để check tools và legacy code có thể gọi
window.initFinanceActionEvents = initFinanceActionEvents;

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

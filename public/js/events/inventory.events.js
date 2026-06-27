/**
 * js/events/inventory.events.js — Phase 3.1
 * ────────────────────────────────────────────────────────────────
 * Event Layer: Bind tất cả DOM events liên quan đến Kho Đồng Phục.
 *
 * Được tách ra từ initInventory() trong inventory.js.
 * inventoryForm.onsubmit được xử lý ở đây qua addEventListener.
 *
 * ĐƯỢC GỌI TỪ: main.js → initInventoryEvents()
 *
 * Events được bind:
 *   1. inventoryForm submit → window.handleInventorySubmit
 *   2. inv_type change → toggleInvType
 *   3. inv_category change → toggleInvCategory
 *   4. manageCatModal overlay click
 *   5. editInvModal overlay click
 *   6. Inventory amount display → actual sync
 *   7. inv_qty × inv_price → inv_total calculation
 *
 * /// Phase 3.1 — Event Layer
 * ────────────────────────────────────────────────────────────────
 */

/**
 * initInventoryEvents() — Bind tất cả DOM event listeners kho đồng phục.
 */
export function initInventoryEvents() {

    // ── 1. inventoryForm submit ───────────────────────────────────
    const invForm = document.getElementById('inventoryForm');
    if (invForm && !invForm.dataset.evtBound) {
        invForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Delegate sang window.handleInventorySubmit (mount bởi initInventory())
            if (typeof window.handleInventorySubmit === 'function') {
                window.handleInventorySubmit(e);
            }
        });
        invForm.dataset.evtBound = '1';
    }

    // ── 2. inv_type change → toggleInvType ───────────────────────
    const invType = document.getElementById('inv_type');
    if (invType && !invType.dataset.evtBound) {
        invType.addEventListener('change', () => {
            if (typeof window.toggleInvType === 'function') window.toggleInvType();
        });
        invType.dataset.evtBound = '1';
    }

    // ── 3. inv_category change → toggleInvCategory ───────────────
    const invCat = document.getElementById('inv_category');
    if (invCat && !invCat.dataset.evtBound) {
        invCat.addEventListener('change', () => {
            if (typeof window.toggleInvCategory === 'function') window.toggleInvCategory();
        });
        invCat.dataset.evtBound = '1';
    }

    // ── 4. ei_category change → toggleEditInvSize ─────────────────
    const eiCat = document.getElementById('ei_category');
    if (eiCat && !eiCat.dataset.evtBound) {
        eiCat.addEventListener('change', () => {
            if (typeof window.toggleEditInvSize === 'function') window.toggleEditInvSize();
        });
        eiCat.dataset.evtBound = '1';
    }

    // ── 5. manageCatModal overlay click ──────────────────────────
    const manageCatModal = document.getElementById('manageCatModal');
    if (manageCatModal && !manageCatModal.dataset.evtBound) {
        manageCatModal.addEventListener('click', (e) => {
            if (e.target === manageCatModal) {
                if (typeof window.closeManageCatModal === 'function') window.closeManageCatModal();
            }
        });
        manageCatModal.dataset.evtBound = '1';
    }

    // ── 6. editInvModal overlay click ────────────────────────────
    const editInvModal = document.getElementById('editInvModal');
    if (editInvModal && !editInvModal.dataset.evtBound) {
        editInvModal.addEventListener('click', (e) => {
            if (e.target === editInvModal) {
                if (typeof window.closeEditInvModal === 'function') window.closeEditInvModal();
            }
        });
        editInvModal.dataset.evtBound = '1';
    }

    // ── 7. inv_priceActual + inv_qty → inv_totalActual ────────────
    ['inv_priceActual', 'inv_qty'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.evtBound) {
            el.addEventListener('input', _calcInvTotal);
            el.dataset.evtBound = '1';
        }
    });

    // ── 8. inv_priceDisplay → inv_priceActual sync ────────────────
    const priceDisplay = document.getElementById('inv_priceDisplay');
    if (priceDisplay && !priceDisplay.dataset.evtBound) {
        priceDisplay.addEventListener('input', () => {
            const raw = priceDisplay.value.replace(/[^0-9]/g, '');
            const act = document.getElementById('inv_priceActual');
            if (act) { act.value = raw; _calcInvTotal(); }
        });
        priceDisplay.dataset.evtBound = '1';
    }

    // ── 9. editInvModal amount display sync ──────────────────────
    const eiDisplay = document.getElementById('ei_amountDisplay');
    if (eiDisplay && !eiDisplay.dataset.evtBound) {
        eiDisplay.addEventListener('input', () => {
            const raw = eiDisplay.value.replace(/[^0-9]/g, '');
            const act = document.getElementById('ei_amountActual');
            if (act) act.value = raw;
        });
        eiDisplay.dataset.evtBound = '1';
    }

    // ── 10. mi_inv toggle changes → updateMultiItemTotal ──────────
    const miToggle = document.getElementById('mi_inv_toggle');
    if (miToggle && !miToggle.dataset.evtBound) {
        miToggle.addEventListener('change', () => {
            if (typeof window.toggleMultiItemInv === 'function') window.toggleMultiItemInv();
        });
        miToggle.dataset.evtBound = '1';
    }

    console.info('[inventory.events.js] ✅ Phase 3.1 event bindings mounted');
}

// ── Private helper ─────────────────────────────────────────────────
function _calcInvTotal() {
    const qty   = Number((document.getElementById('inv_qty')        || {}).value) || 0;
    const price = Number((document.getElementById('inv_priceActual') || {}).value) || 0;
    const total = qty * price;
    const totalAct  = document.getElementById('inv_totalActual');
    const totalDisp = document.getElementById('inv_totalDisplay');
    if (totalAct)  totalAct.value  = total;
    if (totalDisp) totalDisp.value = total > 0 ? total.toLocaleString('vi-VN') + ' ₫' : '';
}

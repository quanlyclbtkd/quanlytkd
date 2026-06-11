/**
 * inventoryMultiItemReadOnlyUI.js — Phase 4K-6L
 * Inventory / MultiItem Read-only UI Ownership Gate
 *
 * Scope:
 *   - Own read-only DOM/UI rendering helpers for MultiItem inventory selection.
 *   - Own stock option display, debt panel display and MultiItem total display.
 *
 * Safety:
 *   - READ-ONLY UI ONLY.
 *   - No Firestore imports.
 *   - No addDoc / setDoc / updateDoc / deleteDoc.
 *   - No processMultiItem ownership.
 */

const PHASE = '4K-6L-inventory-multiitem-readonly-ui-ownership-20260608';

const _metrics = {
    initCount: 0,
    categoryOptionRenders: 0,
    debtPanelRenders: 0,
    lineTotalRecalculations: 0,
    debtTotalRecalculations: 0,
    totalDisplayUpdates: 0,
    fallbackMisses: 0,
    lastReason: '',
    lastCategory: '',
    lastStockSource: '',
    lastDebtCount: 0,
    lastTotal: 0,
    lastUpdatedAt: null,
};

function q(id) {
    return document.getElementById(id);
}

function money(n) {
    const value = Number(n || 0);
    return value.toLocaleString('vi-VN') + ' ₫';
}

function moneyCompact(n) {
    const value = Number(n || 0);
    return value.toLocaleString('vi-VN') + '₫';
}

function esc(v) {
    if (window.Formatters && typeof window.Formatters.escapeHtml === 'function') {
        return window.Formatters.escapeHtml(v);
    }
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function attr(v) {
    if (window.Formatters && typeof window.Formatters.escapeForAttr === 'function') {
        return window.Formatters.escapeForAttr(v);
    }
    return esc(v).replace(/`/g, '&#096;');
}

function norm(v) {
    return String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function touch(reason) {
    _metrics.lastReason = reason || '';
    _metrics.lastUpdatedAt = new Date().toISOString();
}

function getStockMap(reason) {
    const existing = window._liveInvMap || {};
    if (Object.keys(existing).length > 0) {
        _metrics.lastStockSource = 'window._liveInvMap';
        return existing;
    }

    const builder = window.MultiItemInventorySafety && window.MultiItemInventorySafety.buildInventoryStockMapForMultiItem;
    if (typeof builder === 'function') {
        try {
            const result = builder.call(window.MultiItemInventorySafety, { reason: reason || 'read-only-ui-stock-map' }) || {};
            _metrics.lastStockSource = result.source || 'MultiItemInventorySafety';
            return result.map || window._liveInvMap || {};
        } catch (e) {
            console.warn('[InventoryMultiItemReadOnlyUI] stock map build failed:', e);
        }
    }

    _metrics.lastStockSource = 'empty';
    return {};
}

function getCustomCategories() {
    return Array.isArray(window.invCustomCategories) ? window.invCustomCategories : [];
}

function getCategorySizePlan(category, stockMap, customCategories) {
    const cat = String(category || 'Võ phục');
    if (cat === 'Võ phục') {
        return {
            freeText: false,
            sizes: ['Size 1m', 'Size 1m1', 'Size 1m2', 'Size 1m3', 'Size 1m4', 'Size 1m5', 'Size 1m6', 'Size 1m7', 'Size 1m8']
        };
    }

    const customCat = (customCategories || []).find(c => c && c.name === cat);
    if (customCat && Array.isArray(customCat.sizes) && customCat.sizes.length > 0) {
        return { freeText: false, sizes: customCat.sizes.slice() };
    }

    return { freeText: true, sizes: [] };
}

function buildMultiItemInventoryStockOptions(category, options = {}) {
    const reason = options.reason || 'build-options';
    const stockMap = options.stockMap || getStockMap(reason);
    const customCategories = options.customCategories || getCustomCategories();
    const cat = String(category || 'Võ phục');
    const plan = getCategorySizePlan(cat, stockMap, customCategories);

    if (plan.freeText) {
        return {
            ok: true,
            category: cat,
            freeText: true,
            options: [],
            hasStock: true,
            stockMapKeyCount: Object.keys(stockMap || {}).length
        };
    }

    let hasStock = false;
    const optionRows = plan.sizes.map(size => {
        const key = cat + '|||' + size;
        const s = stockMap[key] || { in: 0, out: 0 };
        const balance = Number(s.in || 0) - Number(s.out || 0);
        if (balance > 0) hasStock = true;
        return {
            value: size,
            label: balance > 0 ? `${size} (Tồn: ${balance})` : `${size} (Hết hàng)`,
            balance,
            disabled: balance <= 0,
            key
        };
    });

    return {
        ok: true,
        category: cat,
        freeText: false,
        options: optionRows,
        hasStock,
        stockMapKeyCount: Object.keys(stockMap || {}).length
    };
}

function renderMultiItemInventoryCategoryOptions(options = {}) {
    const reason = options.reason || 'render-category-options';
    const catEl = q('mi_inv_category');
    const sel = q('mi_inv_size_select');
    const txt = q('mi_inv_size_text');
    const hint = q('mi_inv_stock_hint');
    if (!catEl || !sel || !txt) {
        _metrics.fallbackMisses++;
        return { ok: false, reason: 'missing-dom' };
    }

    const category = catEl.value || 'Võ phục';
    const plan = buildMultiItemInventoryStockOptions(category, { reason });
    _metrics.categoryOptionRenders++;
    _metrics.lastCategory = category;
    touch(reason);

    if (plan.freeText) {
        sel.style.display = 'none';
        txt.style.display = '';
        if (hint) hint.textContent = '';
        return { ...plan, rendered: true };
    }

    sel.style.display = '';
    txt.style.display = 'none';
    sel.innerHTML = '';

    plan.options.forEach(row => {
        const opt = document.createElement('option');
        opt.value = row.value;
        opt.textContent = row.label;
        if (row.disabled) opt.disabled = true;
        sel.appendChild(opt);
    });

    if (hint) hint.textContent = plan.hasStock ? '' : '— Kho trống';
    return { ...plan, rendered: true };
}

function calculateMultiItemInventoryLineTotal(options = {}) {
    const reason = options.reason || 'calc-line-total';
    const qty = Number((q('mi_inv_qty') || {}).value) || 0;
    const price = Number((q('mi_inv_price_actual') || {}).value) || 0;
    const total = qty * price;
    const actual = q('mi_inv_total_actual');
    const display = q('mi_inv_total_display');
    if (actual) actual.value = String(total);
    if (display) display.value = total > 0 ? money(total) : '';
    _metrics.lineTotalRecalculations++;
    touch(reason);
    const totalResult = updateMultiItemTotalDisplay({ reason: reason + ':total' });
    return { ok: true, qty, price, total, totalResult };
}

function recalculateMultiItemInventoryDebt(options = {}) {
    const reason = options.reason || 'recalc-inventory-debt';
    const checks = document.querySelectorAll('.mi-inv-debt-check:checked');
    let total = 0;
    checks.forEach(c => { total += Number(c.getAttribute('data-amount')) || 0; });
    const actual = q('mi_inv_debt_total_actual');
    const display = q('mi_inv_debt_total_display');
    if (actual) actual.value = String(total);
    if (display) display.textContent = money(total);
    _metrics.debtTotalRecalculations++;
    touch(reason);
    const totalResult = updateMultiItemTotalDisplay({ reason: reason + ':total' });
    return { ok: true, checkedCount: checks.length, total, totalResult };
}

function updateMultiItemTotalDisplay(options = {}) {
    const reason = options.reason || 'update-total';
    const tuition = Number((q('mi_tuition_actual') || {}).value) || 0;
    const examToggle = q('mi_exam_toggle');
    const otherToggle = q('mi_other_toggle');
    const invToggle = q('mi_inv_toggle');
    const exam = examToggle && examToggle.checked ? (Number((q('mi_exam_actual') || {}).value) || 0) : 0;
    const other = otherToggle && otherToggle.checked ? (Number((q('mi_other_actual') || {}).value) || 0) : 0;
    const inv = invToggle && invToggle.checked ? (Number((q('mi_inv_total_actual') || {}).value) || 0) : 0;
    const invDebt = Number((q('mi_inv_debt_total_actual') || {}).value) || 0;
    const total = tuition + exam + other + inv + invDebt;

    const totalEl = q('mi_total');
    const breakdownEl = q('mi_total_breakdown');
    if (!totalEl || !breakdownEl) {
        _metrics.fallbackMisses++;
        return { ok: false, reason: 'missing-total-dom', total };
    }

    totalEl.textContent = money(total);
    const parts = [];
    if (tuition > 0) parts.push('HP: ' + moneyCompact(tuition));
    if (exam > 0) parts.push('Thi: ' + moneyCompact(exam));
    if (inv > 0) parts.push('Kho mới: ' + moneyCompact(inv));
    if (invDebt > 0) parts.push('Nợ KĐ: ' + moneyCompact(invDebt));
    if (other > 0) parts.push('Khác: ' + moneyCompact(other));
    breakdownEl.textContent = parts.join(' + ');

    _metrics.totalDisplayUpdates++;
    _metrics.lastTotal = total;
    touch(reason);
    return { ok: true, tuition, exam, other, inv, invDebt, total, parts };
}

function renderMultiItemInventoryDebtPanel(studentName, items, options = {}) {
    const reason = options.reason || 'render-debt-panel';
    const currentName = ((q('mi_name') || {}).value || '').trim();
    if (currentName && norm(currentName) !== norm(studentName)) {
        return { ok: false, skipped: true, reason: 'student-name-changed' };
    }

    const invDebtPanel = q('mi_inv_debt_panel');
    const invDebtList = q('mi_inv_debt_list');
    const invDebtBadge = q('mi_inv_debt_badge');
    const totalActual = q('mi_inv_debt_total_actual');
    const totalDisplay = q('mi_inv_debt_total_display');
    if (!invDebtPanel || !invDebtList) {
        _metrics.fallbackMisses++;
        return { ok: false, reason: 'missing-debt-panel-dom' };
    }

    const ensureResult = options.ensureResult || null;
    const loading = !!options.loading;
    if (loading) {
        if (invDebtBadge) invDebtBadge.textContent = 'Đang kiểm tra...';
        return { ok: true, loading: true };
    }

    invDebtList.innerHTML = '';
    const rows = Array.isArray(items) ? items : [];
    _metrics.debtPanelRenders++;
    _metrics.lastDebtCount = rows.length;
    touch(reason);

    if (rows.length > 0) {
        invDebtPanel.style.display = 'block';
        if (invDebtBadge) invDebtBadge.textContent = rows.length + ' khoản';
        rows.forEach(item => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #fff7ed;';
            const label = (item.category || '') + (item.size ? ' ' + item.size : '') + (Number(item.qty || 1) > 1 ? ' ×' + Number(item.qty || 1) : '');
            const amt = Number(item.amount || 0);
            div.innerHTML = '<input type="checkbox" class="mi-inv-debt-check w-4 h-4 accent-orange-500 cursor-pointer rounded" data-inv-id="' + attr(item.id || '') + '" data-amount="' + amt + '" data-label="' + attr(label) + '" checked>' +
                '<div style="flex:1;min-width:0;"><div style="font-size:0.8rem;font-weight:700;color:#1e293b;">' + esc(label) + '</div><div style="font-size:0.65rem;color:#94a3b8;">' + esc(item.date || '') + '</div></div>' +
                '<span style="font-size:0.85rem;font-weight:900;color:#f97316;">' + moneyCompact(amt) + '</span>';
            const input = div.querySelector('input');
            if (input) input.addEventListener('change', () => recalculateMultiItemInventoryDebt({ reason: 'debt-checkbox-change' }));
            invDebtList.appendChild(div);
        });
        recalculateMultiItemInventoryDebt({ reason: reason + ':after-render' });
        return { ok: true, rendered: true, count: rows.length };
    }

    if (!ensureResult || ensureResult.ok) {
        invDebtPanel.style.display = 'none';
        if (totalActual) totalActual.value = '0';
        if (totalDisplay) totalDisplay.textContent = '0 ₫';
        updateMultiItemTotalDisplay({ reason: reason + ':empty' });
        return { ok: true, rendered: true, count: 0 };
    }

    return { ok: true, rendered: false, count: 0, timedOut: true };
}

function getInventoryMultiItemReadOnlyUIState() {
    const stockMap = window._liveInvMap || {};
    return {
        phase: PHASE,
        hasModule: true,
        readOnly: true,
        hasStockMap: Object.keys(stockMap).length > 0,
        stockMapKeys: Object.keys(stockMap).length,
        currentCategory: (q('mi_inv_category') || {}).value || '',
        invToggleOn: !!(q('mi_inv_toggle') && q('mi_inv_toggle').checked),
        modalOpen: !!(q('multiItemModal') && q('multiItemModal').style.display !== 'none'),
        debtCheckboxes: document.querySelectorAll('.mi-inv-debt-check').length,
        checkedDebtCheckboxes: document.querySelectorAll('.mi-inv-debt-check:checked').length,
        metrics: { ..._metrics }
    };
}

function debugInventoryMultiItemReadOnlyUI() {
    const state = getInventoryMultiItemReadOnlyUIState();
    console.table({
        phase: state.phase,
        readOnly: state.readOnly,
        hasStockMap: state.hasStockMap,
        stockMapKeys: state.stockMapKeys,
        currentCategory: state.currentCategory,
        modalOpen: state.modalOpen,
        debtCheckboxes: state.debtCheckboxes,
        checkedDebtCheckboxes: state.checkedDebtCheckboxes,
        optionRenders: state.metrics.categoryOptionRenders,
        debtPanelRenders: state.metrics.debtPanelRenders,
        totalUpdates: state.metrics.totalDisplayUpdates,
        lastTotal: state.metrics.lastTotal
    });
    return state;
}

export const InventoryMultiItemReadOnlyUI = {
    phase: PHASE,
    buildMultiItemInventoryStockOptions,
    renderMultiItemInventoryCategoryOptions,
    calculateMultiItemInventoryLineTotal,
    recalculateMultiItemInventoryDebt,
    updateMultiItemTotalDisplay,
    renderMultiItemInventoryDebtPanel,
    getInventoryMultiItemReadOnlyUIState,
    debugInventoryMultiItemReadOnlyUI,
    getMetrics() { return { ..._metrics }; }
};

export function initInventoryMultiItemReadOnlyUI() {
    _metrics.initCount++;
    window.InventoryMultiItemReadOnlyUI = window.InventoryMultiItemReadOnlyUI || InventoryMultiItemReadOnlyUI;
    window.debugInventoryMultiItemReadOnlyUI = debugInventoryMultiItemReadOnlyUI;
    window.debugMultiItemReadOnlyUIOwnership = debugInventoryMultiItemReadOnlyUI;
    return window.InventoryMultiItemReadOnlyUI;
}

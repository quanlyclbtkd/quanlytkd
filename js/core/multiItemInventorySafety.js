/**
 * multiItemInventorySafety.js — Phase 4K-6G Hotfix
 * MultiItem Inventory Hydration Safety Module
 *
 * Ensures Thu Gộp (processMultiItem) can always find inventory debt data
 * even if the Kho đồ tab has never been opened before.
 *
 * READ-ONLY: No Firestore writes, no transaction creation, no data mutation.
 */

// ── Vietnamese normalizer ─────────────────────────────────────────────────────
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

// ── Debounce helper ───────────────────────────────────────────────────────────
function debounce(fn, ms) {
    let t = null;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

export const MultiItemInventorySafety = {

    // ── A.4 ensureMultiItemInventoryReady ─────────────────────────────────────
    async ensureMultiItemInventoryReady(reason = 'multi-item') {
        const _t0 = Date.now();

        // Step 1: call synchronous readiness helpers if available
        try {
            if (typeof window.ensureInventoryForFeature === 'function') {
                window.ensureInventoryForFeature('feeReceipt', reason);
                window.ensureInventoryForFeature('financeDebt', reason);
            }
        } catch (_e) {}

        // Step 2: call async loaders if available
        const asyncLoaders = ['ensureInventoryReady', 'loadInventoryForFeature', 'loadFullInventoryForFeature'];
        for (const fn of asyncLoaders) {
            if (typeof window[fn] === 'function') {
                try { await window[fn](reason); break; } catch (_e) {}
            }
        }

        // Step 3: poll for readiness up to 3000ms
        const POLL_MAX = 3000;
        const POLL_INTERVAL = 100;
        let elapsed = Date.now() - _t0;
        let timedOut = false;

        while (elapsed < POLL_MAX) {
            const st = window.__store || {};
            const invStore = window.__inventoryStore || {};
            const storeReady = st.inventory && st.inventory.length > 0;
            const allInvReady = window.allInventory && window.allInventory.length > 0;
            const debtReady = invStore.inventoryDebtIndexReady || invStore.unpaidDebtQueryLoaded ||
                window.__inventoryDebtCompleteness === 'complete';
            if (storeReady || allInvReady || debtReady) break;
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            elapsed = Date.now() - _t0;
        }

        if (elapsed >= POLL_MAX) {
            timedOut = true;
            console.warn('[ensureMultiItemInventoryReady] timeout after', elapsed, 'ms, reason:', reason);
        }

        const st = window.__store || {};
        const invStore = window.__inventoryStore || {};
        const getAllCompat = invStore.getAllInventoryCompat && typeof invStore.getAllInventoryCompat === 'function'
            ? invStore.getAllInventoryCompat()
            : [];
        const liveMapKeys = Object.keys(window._liveInvMap || {});

        return {
            ok:                     !timedOut,
            timedOut:               timedOut,
            reason:                 reason,
            inventoryCount:         (st.inventory || []).length,
            allInventoryCount:      (window.allInventory || []).length,
            financeDebtCount:       (invStore.financeInventoryDebts || []).length,
            unpaidDebtQueryLoaded:  !!invStore.unpaidDebtQueryLoaded,
            inventoryDebtIndexReady: !!invStore.inventoryDebtIndexReady,
            liveInvMapKeys:         liveMapKeys.length,
            source:                 'MultiItemInventorySafety'
        };
    },

    // ── A.5 buildInventoryStockMapForMultiItem ────────────────────────────────
    buildInventoryStockMapForMultiItem(options = {}) {
        const invStore = window.__inventoryStore || {};
        const st       = window.__store || {};

        // Priority sources
        let items = [];
        let source = 'none';

        // 1. _liveInvMap already has data → skip build but still return map info
        const existingMap = window._liveInvMap || {};
        if (Object.keys(existingMap).length > 0) {
            return {
                map:       existingMap,
                source:    'existing-_liveInvMap',
                itemCount: 0,
                keyCount:  Object.keys(existingMap).length
            };
        }

        // 2. Try various inventory sources
        if (invStore.getAllInventoryCompat && typeof invStore.getAllInventoryCompat === 'function') {
            const compat = invStore.getAllInventoryCompat();
            if (compat && compat.length > 0) { items = compat; source = '__inventoryStore.getAllInventoryCompat'; }
        }
        if (!items.length && invStore.inventoryHistory && invStore.inventoryHistory.length > 0) {
            items = invStore.inventoryHistory; source = '__inventoryStore.inventoryHistory';
        }
        if (!items.length && st.inventory && st.inventory.length > 0) {
            items = st.inventory; source = '__store.inventory';
        }
        if (!items.length && window.allInventory && window.allInventory.length > 0) {
            items = window.allInventory; source = 'allInventory';
        }

        if (!items.length) {
            return { map: {}, source: 'none', itemCount: 0, keyCount: 0 };
        }

        const map = {};

        for (const item of items) {
            const category = item.category || item.itemCategory || item.typeName || '';
            const size     = item.size || item.itemSize || item.uniformSize || item.variant || '';
            if (!category) continue;

            const key = category + '|||' + size;
            if (!map[key]) map[key] = { in: 0, out: 0 };

            const qty = Number(item.qty || item.quantity || 1);
            const type = String(item.type || '').toLowerCase();

            if (type.includes('nhập') || type === 'nhap kho' || type === 'import') {
                map[key].in += qty;
            } else if (
                type.includes('xuất bán') || type.includes('xuat ban') ||
                type.includes('bán nợ') || type.includes('ban no') ||
                type.includes('xuất tặng') || type.includes('xuat tang') ||
                type === 'inventorydebt'
            ) {
                map[key].out += qty;
            }
        }

        // Populate _liveInvMap if empty
        if (Object.keys(map).length > 0 && Object.keys(window._liveInvMap || {}).length === 0) {
            window._liveInvMap = map;
        }

        return {
            map:       map,
            source:    source,
            itemCount: items.length,
            keyCount:  Object.keys(map).length
        };
    },

    // ── A.6 resolveMultiItemInventoryDebts ────────────────────────────────────
    resolveMultiItemInventoryDebts(studentName, options = {}) {
        if (!studentName) return [];
        const reason     = options.reason || 'resolve-debts';
        const normName   = norm(studentName);
        const invStore   = window.__inventoryStore || {};
        const st         = window.__store || {};
        const seen       = new Set();
        let results      = [];

        function dedupeItem(item) {
            const key = item.id ||
                [item.category, item.size, item.amount, item.date, item.description].join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }

        function nameMatches(item) {
            const fields = [
                item.desc, item.description, item.studentName, item.name,
                item.profileName, item.customerName, item.memberName,
                item.student, item.buyerName, item.studentLabel
            ];
            for (const f of fields) {
                if (!f) continue;
                const nf = norm(f);
                if (nf === normName) return true;
                if (nf.length >= 3 && normName.includes(nf)) return true;
                if (normName.length >= 3 && nf.includes(normName)) return true;
            }
            return false;
        }

        function isDebtItem(item) {
            const type = String(item.type || '').toLowerCase();
            return (
                item.unpaid === true ||
                item.inventoryDebtStatus === 'pending' ||
                item.paymentStatus === 'unpaid'
            ) && (
                type.includes('xuất bán') || type.includes('bán nợ') ||
                type === 'inventorydebt' || item.unpaid === true
            );
        }

        function normalizeItem(item) {
            return {
                id:          item.id || '',
                category:    item.category || '',
                size:        item.size || '',
                qty:         Number(item.qty || item.quantity || 1),
                amount:      Number(item.amount || 0),
                date:        item.date || '',
                desc:        item.desc || item.description || '',
                description: item.description || item.desc || '',
                unpaid:      true,
                source:      item._source || 'resolved'
            };
        }

        // Source 1: getInventoryDebtsForStudent
        if (typeof window.getInventoryDebtsForStudent === 'function') {
            try {
                const s1 = window.getInventoryDebtsForStudent(studentName, {
                    allowFallback: true, reason: reason
                }) || [];
                for (const item of s1) {
                    const ni = normalizeItem({ ...item, _source: 'getInventoryDebtsForStudent' });
                    if (dedupeItem(ni)) results.push(ni);
                }
            } catch (_e) {}
        }

        // Source 2: financeInventoryDebts
        if (invStore.financeInventoryDebts && invStore.financeInventoryDebts.length > 0) {
            for (const item of invStore.financeInventoryDebts) {
                if (!nameMatches(item) || !isDebtItem(item)) continue;
                const ni = normalizeItem({ ...item, _source: 'financeInventoryDebts' });
                if (dedupeItem(ni)) results.push(ni);
            }
        }

        // Source 3: standalone/legacy complete-debt mirror (khi ES module store chưa sẵn sàng)
        if (Array.isArray(window.__completeInventoryDebts)) {
            for (const item of window.__completeInventoryDebts) {
                if (!nameMatches(item) || !isDebtItem(item)) continue;
                const ni = normalizeItem({ ...item, _source: '__completeInventoryDebts' });
                if (dedupeItem(ni)) results.push(ni);
            }
        }

        // Source 4–6: các nguồn lịch sử chỉ là fallback tương thích; không đại diện độ đầy đủ.
        const fallbackSources = [
            [st.inventory,              '__store.inventory'],
            [window.allInventory,       'allInventory'],
            [invStore.inventoryHistory, 'inventoryHistory']
        ];
        for (const [src, label] of fallbackSources) {
            if (!src || !src.length) continue;
            for (const item of src) {
                if (!nameMatches(item) || !isDebtItem(item)) continue;
                const ni = normalizeItem({ ...item, _source: label });
                if (dedupeItem(ni)) results.push(ni);
            }
        }

        return results;
    },

    // ── A.7 renderMultiItemInventoryDebtPanel ─────────────────────────────────
    renderMultiItemInventoryDebtPanel(studentName, items, options = {}) {
        // Phase 4K-6L: delegate read-only DOM rendering to InventoryMultiItemReadOnlyUI when available.
        // This keeps MultiItemInventorySafety focused on hydration/debt resolution while preserving legacy fallback.
        if (!options.__fromReadOnlyUI && window.InventoryMultiItemReadOnlyUI && typeof window.InventoryMultiItemReadOnlyUI.renderMultiItemInventoryDebtPanel === 'function') {
            try {
                const result = window.InventoryMultiItemReadOnlyUI.renderMultiItemInventoryDebtPanel(studentName, items, { ...options, __fromReadOnlyUI: true });
                if (result && result.ok) return result;
            } catch (e) {
                console.warn('[MultiItemInventorySafety] read-only UI debt panel fallback:', e);
            }
        }
        const currentName = ((document.getElementById('mi_name') || {}).value || '').trim();
        if (currentName && norm(currentName) !== norm(studentName)) return;

        const invDebtPanel  = document.getElementById('mi_inv_debt_panel');
        const invDebtList   = document.getElementById('mi_inv_debt_list');
        const invDebtBadge  = document.getElementById('mi_inv_debt_badge');
        const totalActual   = document.getElementById('mi_inv_debt_total_actual');
        const totalDisplay  = document.getElementById('mi_inv_debt_total_display');

        if (!invDebtPanel || !invDebtList) return;

        const ensureResult = options.ensureResult || null;
        const loading      = options.loading || false;

        if (loading) {
            invDebtBadge && (invDebtBadge.textContent = 'Đang kiểm tra...');
            return;
        }

        invDebtList.innerHTML = '';

        if (items && items.length > 0) {
            invDebtPanel.style.display = 'block';
            if (invDebtBadge) invDebtBadge.textContent = items.length + ' khoản';

            items.forEach(item => {
                const div = document.createElement('div');
                div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #fff7ed;';
                const label = (item.category || '') + (item.size ? ' ' + item.size : '') + (item.qty > 1 ? ' ×' + item.qty : '');
                const amt   = Number(item.amount || 0);
                div.innerHTML = `<input type="checkbox" class="mi-inv-debt-check w-4 h-4 accent-orange-500 cursor-pointer rounded" data-inv-id="${item.id}" data-amount="${amt}" data-label="${label.replace(/"/g, '&quot;')}" checked>
                    <div style="flex:1;min-width:0;"><div style="font-size:0.8rem;font-weight:700;color:#1e293b;">${label}</div><div style="font-size:0.65rem;color:#94a3b8;">${item.date || ''}</div></div>
                    <span style="font-size:0.85rem;font-weight:900;color:#f97316;">${amt.toLocaleString('vi-VN')}₫</span>`;
                div.querySelector('input').addEventListener('change', window.recalcMiInvDebt);
                invDebtList.appendChild(div);
            });

            if (typeof window.recalcMiInvDebt === 'function') window.recalcMiInvDebt();
            if (typeof window.updateMultiItemTotal === 'function') window.updateMultiItemTotal();

        } else if (!ensureResult || ensureResult.ok) {
            // Inventory ready but no debts → clear
            invDebtPanel.style.display = 'none';
            if (totalActual)  totalActual.value           = '0';
            if (totalDisplay) totalDisplay.textContent    = '0 ₫';
            if (typeof window.updateMultiItemTotal === 'function') window.updateMultiItemTotal();
        }
        // If timedOut: don't conclude empty — leave as-is
    },

    // ── refreshMultiItemInventorySection (debounced) ──────────────────────────
    refreshMultiItemInventorySection: null, // set after construction

    // ── getMultiItemInventoryHydrationState ───────────────────────────────────
    getMultiItemInventoryHydrationState() {
        const st       = window.__store || {};
        const invStore = window.__inventoryStore || {};
        return {
            storeInventoryCount:    (st.inventory || []).length,
            allInventoryCount:      (window.allInventory || []).length,
            financeDebtCount:       (invStore.financeInventoryDebts || []).length,
            unpaidDebtQueryLoaded:  !!invStore.unpaidDebtQueryLoaded,
            inventoryDebtIndexReady: !!invStore.inventoryDebtIndexReady,
            liveInvMapKeys:         Object.keys(window._liveInvMap || {}).length,
            multiItemModalOpen:     !!(
                document.getElementById('multiItemModal') &&
                document.getElementById('multiItemModal').style.display !== 'none'
            )
        };
    }
};

// Set up debounced refreshMultiItemInventorySection
MultiItemInventorySafety.refreshMultiItemInventorySection = debounce(
    async function(studentName, reason) {
        reason = reason || 'refresh';
        if (!studentName) return;
        const modal = document.getElementById('multiItemModal');
        if (!modal || modal.style.display === 'none') return;
        const currentName = ((document.getElementById('mi_name') || {}).value || '').trim();
        if (norm(currentName) !== norm(studentName)) return;

        const ensureResult = await MultiItemInventorySafety.ensureMultiItemInventoryReady(reason);
        const items = MultiItemInventorySafety.resolveMultiItemInventoryDebts(studentName, {
            reason, ensureResult
        });
        MultiItemInventorySafety.renderMultiItemInventoryDebtPanel(studentName, items, {
            ensureResult, reason
        });
    },
    200
);

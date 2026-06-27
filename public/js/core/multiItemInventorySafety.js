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

// ── Phase 4K-6V2B: normalized category/size identity ─────────────────────────
// Firestore summary keys and old inventory rows are not perfectly consistent:
// "Võ phục" / "Vo Phuc", "Size 1m5" / "Size 1m 5", custom category casing, etc.
// These helpers merge display variants WITHOUT issuing any Firestore reads.
function categoryIdentity(v) {
    const n = norm(v).replace(/[^a-z0-9]+/g, '');
    if (!n) return 'vophuc';
    if (n.includes('vophuc') || n.includes('dobok') || n.includes('uniform') || n.includes('dongphuc')) return 'vophuc';
    if (n.includes('aothun') || n.includes('tshirt') || n.includes('shirt')) return 'aothun';
    if (n.includes('baoho') || n.includes('protective') || n.includes('protection')) return 'baoho';
    return n;
}

function sizeIdentity(v) {
    return norm(v).replace(/[^a-z0-9]+/g, '');
}

function stockBalance(entry) {
    if (!entry || typeof entry !== 'object') return 0;
    const direct = Number(entry.balance);
    if (Number.isFinite(direct)) return direct;
    return (Number(entry.in) || 0) - (Number(entry.out) || 0);
}

function naturalSizeCompare(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'vi', {
        numeric: true,
        sensitivity: 'base'
    });
}

function canonicalizeStockMaps(historyMap, statsMap) {
    const buckets = new Map();

    const absorb = (sourceMap, priority) => {
        Object.values(sourceMap || {}).forEach(entry => {
            if (!entry) return;
            const category = String(entry.category || 'Võ phục').trim() || 'Võ phục';
            const size = String(entry.size || '').trim();
            if (!size) return;
            const identity = categoryIdentity(category) + '|||' + sizeIdentity(size);
            if (!identity.endsWith('|||')) {
                const current = buckets.get(identity);
                const normalized = {
                    category,
                    size,
                    in: Number(entry.in) || 0,
                    out: Number(entry.out) || 0,
                    balance: stockBalance(entry),
                    source: entry.source || (priority > 1 ? 'inventory-stats' : 'inventory-history-fallback'),
                    priority
                };
                if (!current) {
                    buckets.set(identity, normalized);
                } else if (priority > current.priority) {
                    // inventory_stats is authoritative for this normalized key.
                    buckets.set(identity, normalized);
                } else if (priority === current.priority) {
                    // Same source layer, different spelling → aggregate once.
                    current.in += normalized.in;
                    current.out += normalized.out;
                    current.balance = current.in - current.out;
                    // Prefer the more descriptive label while keeping stable output.
                    if (normalized.size.length > current.size.length) current.size = normalized.size;
                }
            }
        });
    };

    absorb(historyMap, 1);
    absorb(statsMap, 2);

    const result = {};
    buckets.forEach(entry => {
        const key = entry.category + '|||' + entry.size;
        result[key] = {
            category: entry.category,
            size: entry.size,
            in: entry.in,
            out: entry.out,
            balance: entry.balance,
            source: entry.source
        };
    });
    return result;
}

function findStockEntry(stockMap, category, size) {
    const exact = (stockMap || {})[String(category || '') + '|||' + String(size || '')];
    if (exact) return exact;
    const wantedCategory = categoryIdentity(category);
    const wantedSize = sizeIdentity(size);
    return Object.values(stockMap || {}).find(entry =>
        categoryIdentity(entry && entry.category) === wantedCategory &&
        sizeIdentity(entry && entry.size) === wantedSize
    ) || null;
}

function categoryStockOptions(category, options = {}) {
    const stockMap = options.stockMap || window._liveInvMap || {};
    const configuredSizes = Array.isArray(options.configuredSizes) ? options.configuredSizes : [];
    const defaultSizes = Array.isArray(options.defaultSizes) ? options.defaultSizes : [];
    const wantedCategory = categoryIdentity(category || 'Võ phục');
    const rows = new Map();

    const addSize = (label, source) => {
        const size = String(label || '').trim();
        const id = sizeIdentity(size);
        if (!id) return;
        const current = rows.get(id) || { size, configured: false, default: false, dataBacked: false };
        if (source === 'configured') current.configured = true;
        if (source === 'default') current.default = true;
        if (source === 'stock') current.dataBacked = true;
        if (!current.size || (source === 'stock' && size.length > current.size.length)) current.size = size;
        rows.set(id, current);
    };

    defaultSizes.forEach(size => addSize(size, 'default'));
    configuredSizes.forEach(size => addSize(size, 'configured'));
    Object.values(stockMap || {}).forEach(entry => {
        if (!entry || categoryIdentity(entry.category) !== wantedCategory) return;
        addSize(entry.size, 'stock');
    });

    return Array.from(rows.values())
        .map(row => {
            const entry = findStockEntry(stockMap, category, row.size);
            const balance = stockBalance(entry);
            return {
                value: row.size,
                size: row.size,
                balance,
                qty: balance,
                disabled: balance <= 0,
                dataBacked: row.dataBacked,
                configured: row.configured,
                default: row.default,
                entry: entry || null
            };
        })
        .sort((a, b) => naturalSizeCompare(a.size, b.size));
}


// ── Phase 4K-6V2A: canonical stock-map hydration from inventory_stats ─────────
function buildStockMapFromInventoryStats(stats) {
    const source = stats && typeof stats === 'object' ? stats : null;
    if (!source) return {};

    const bases = new Set();
    Object.keys(source).forEach(key => {
        if (key.endsWith('_balance')) bases.add(key.slice(0, -8));
        else if (key.endsWith('_in')) bases.add(key.slice(0, -3));
        else if (key.endsWith('_out')) bases.add(key.slice(0, -4));
    });

    const map = {};
    bases.forEach(base => {
        if (!base) return;
        const parts = base.includes('|||') ? base.split('|||') : ['Võ phục', base];
        const category = String(parts[0] || 'Võ phục').trim() || 'Võ phục';
        const size = String(parts.slice(1).join('|||') || base).trim();
        if (!size) return;

        const rawIn = Number(source[base + '_in']);
        const rawOut = Number(source[base + '_out']);
        const rawBalance = Number(source[base + '_balance']);
        const hasIn = Number.isFinite(rawIn);
        const hasOut = Number.isFinite(rawOut);
        const hasBalance = Number.isFinite(rawBalance);
        const out = hasOut ? rawOut : 0;
        const input = hasIn ? rawIn : (hasBalance ? rawBalance + out : 0);
        const key = category + '|||' + size;
        map[key] = {
            category,
            size,
            in: input,
            out,
            balance: input - out,
            source: 'inventory-stats'
        };
    });
    return map;
}

function buildStockMapFromTransactions(items) {
    const map = {};
    for (const item of (Array.isArray(items) ? items : [])) {
        const category = String(item.category || item.itemCategory || item.typeName || 'Võ phục').trim() || 'Võ phục';
        const size = String(item.size || item.itemSize || item.uniformSize || item.variant || '').trim();
        if (!size) continue;
        const key = category + '|||' + size;
        if (!map[key]) map[key] = { category, size, in: 0, out: 0, source: 'inventory-history-fallback' };

        const qtyRaw = item.qty !== undefined ? item.qty : item.quantity;
        const qty = Number(qtyRaw === undefined ? 1 : qtyRaw) || 0;
        const type = norm(item.type || item.transactionType || '');
        if (type.includes('nhap') || type === 'import') map[key].in += qty;
        else if (type.includes('xuat') || type.includes('ban no') || type === 'inventorydebt') map[key].out += qty;
        map[key].balance = map[key].in - map[key].out;
    }
    return map;
}

function resolveInventoryStatsSource() {
    const hasCanonicalStore = !!window.__inventoryStore;
    const invStore = window.__inventoryStore || {};
    const st = window.__store || {};
    // Canonical inventoryStore starts at null and becomes {} or a populated object
    // only after the inventory_stats snapshot has completed.
    if (hasCanonicalStore) {
        return invStore.inventoryStats !== null && invStore.inventoryStats !== undefined
            ? invStore.inventoryStats
            : null;
    }
    // Legacy fallback: only accept a non-empty stats object; store.js may initialize
    // inventoryStats as {} before Firestore hydration.
    if (st.inventoryStats && typeof st.inventoryStats === 'object' && Object.keys(st.inventoryStats).length > 0) {
        return st.inventoryStats;
    }
    return null;
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

        try {
            if (typeof window.ensureInventoryForFeature === 'function') {
                window.ensureInventoryForFeature('feeReceipt', reason);
                window.ensureInventoryForFeature('financeDebt', reason);
            }
        } catch (_e) {}

        // Phase 4K-6V2A: stock selectors read inventory_stats directly. They must
        // never require opening Kho or downloading the 100-row history page first.
        let stockResult = this.buildInventoryStockMapForMultiItem({
            reason: reason + ':initial-stock-map',
            force: true
        });

        const asyncLoaders = ['ensureInventoryReady', 'loadInventoryForFeature', 'loadFullInventoryForFeature'];
        for (const fn of asyncLoaders) {
            if (typeof window[fn] === 'function') {
                try { await window[fn](reason); break; } catch (_e) {}
            }
        }

        const POLL_MAX = 3000;
        const POLL_INTERVAL = 100;
        let elapsed = Date.now() - _t0;
        let timedOut = false;

        while (elapsed < POLL_MAX) {
            const invStore = window.__inventoryStore || {};
            const statsLoaded = resolveInventoryStatsSource() !== null;
            const debtReady = !!(
                invStore.inventoryDebtIndexReady ||
                invStore.unpaidDebtQueryLoaded ||
                window.__inventoryDebtCompleteness === 'complete' ||
                window.__inventoryDebtCompleteness === 'partial' ||
                window.__inventoryDebtCompleteness === 'failed'
            );
            stockResult = this.buildInventoryStockMapForMultiItem({
                reason: reason + ':poll-stock-map',
                force: true
            });
            const stockReady = statsLoaded || stockResult.keyCount > 0;
            if (stockReady && debtReady) break;
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            elapsed = Date.now() - _t0;
        }

        const invStore = window.__inventoryStore || {};
        const statsLoaded = resolveInventoryStatsSource() !== null;
        const debtReady = !!(
            invStore.inventoryDebtIndexReady ||
            invStore.unpaidDebtQueryLoaded ||
            window.__inventoryDebtCompleteness === 'complete'
        );
        const stockReady = statsLoaded || stockResult.keyCount > 0;
        if (elapsed >= POLL_MAX && !(stockReady && debtReady)) {
            timedOut = true;
            console.warn('[ensureMultiItemInventoryReady] timeout after', elapsed, 'ms, reason:', reason, {
                stockReady, debtReady, stockSource: stockResult.source
            });
        }

        const st = window.__store || {};
        return {
            ok:                     stockReady && (debtReady || window.__inventoryDebtCompleteness === 'partial'),
            timedOut,
            reason,
            inventoryCount:         (st.inventory || []).length,
            allInventoryCount:      (window.allInventory || []).length,
            financeDebtCount:       (invStore.financeInventoryDebts || []).length,
            unpaidDebtQueryLoaded:  !!invStore.unpaidDebtQueryLoaded,
            inventoryDebtIndexReady: !!invStore.inventoryDebtIndexReady,
            inventoryStatsLoaded:   statsLoaded,
            stockReady,
            stockSource:            stockResult.source,
            liveInvMapKeys:         stockResult.keyCount,
            source:                 'MultiItemInventorySafety'
        };
    },

    // ── A.5 buildInventoryStockMapForMultiItem ────────────────────────────────
    buildInventoryStockMapForMultiItem(options = {}) {
        const invStore = window.__inventoryStore || {};
        const st = window.__store || {};
        const force = options.force === true;
        const stats = resolveInventoryStatsSource();
        const statsMap = buildStockMapFromInventoryStats(stats);

        let items = [];
        let historySource = 'none';
        if (invStore.getAllInventoryCompat && typeof invStore.getAllInventoryCompat === 'function') {
            const compat = invStore.getAllInventoryCompat();
            if (compat && compat.length > 0) { items = compat; historySource = '__inventoryStore.getAllInventoryCompat'; }
        }
        if (!items.length && invStore.inventoryHistory && invStore.inventoryHistory.length > 0) {
            items = invStore.inventoryHistory; historySource = '__inventoryStore.inventoryHistory';
        }
        if (!items.length && st.inventory && st.inventory.length > 0) {
            items = st.inventory; historySource = '__store.inventory';
        }
        if (!items.length && window.allInventory && window.allInventory.length > 0) {
            items = window.allInventory; historySource = 'allInventory';
        }
        const historyMap = buildStockMapFromTransactions(items);

        // inventory_stats is authoritative for totals. History is only a legacy
        // fallback for keys that have not yet been summarized.
        const map = canonicalizeStockMaps(historyMap, statsMap);
        const existingMap = window._liveInvMap || {};
        if (!Object.keys(map).length && !force && Object.keys(existingMap).length) {
            return {
                map: existingMap,
                source: 'existing-_liveInvMap',
                itemCount: 0,
                keyCount: Object.keys(existingMap).length,
                statsLoaded: stats !== null
            };
        }

        window._liveInvMap = map;
        window.__liveInvMapSource = Object.keys(statsMap).length
            ? 'inventory-stats'
            : (Object.keys(historyMap).length ? historySource : 'empty');
        window.__liveInvMapUpdatedAt = Date.now();

        return {
            map,
            source: window.__liveInvMapSource,
            itemCount: items.length,
            keyCount: Object.keys(map).length,
            statsLoaded: stats !== null,
            statsKeyCount: Object.keys(statsMap).length,
            historyKeyCount: Object.keys(historyMap).length
        };
    },

    // ── Phase 4K-6V2B: dynamic category/size discovery ─────────────────────────
    resolveInventoryStockEntry(stockMap, category, size) {
        return findStockEntry(stockMap || window._liveInvMap || {}, category, size);
    },

    buildInventoryCategorySizeOptions(category, options = {}) {
        const stockMap = options.stockMap || window._liveInvMap || {};
        return categoryStockOptions(category, {
            stockMap,
            configuredSizes: options.configuredSizes || [],
            defaultSizes: options.defaultSizes || []
        });
    },

    normalizeInventoryCategoryIdentity(value) {
        return categoryIdentity(value);
    },

    normalizeInventorySizeIdentity(value) {
        return sizeIdentity(value);
    },

    // ── A.6 resolveMultiItemInventoryDebts ────────────────────────────────────
    resolveMultiItemInventoryDebts(studentOrProfile, options = {}) {
        if (!studentOrProfile) return [];
        const reason = options.reason || 'resolve-debts';
        const requested = typeof studentOrProfile === 'object'
            ? studentOrProfile
            : { name: String(studentOrProfile || '').trim() };
        const identity = typeof window.resolveInventoryDebtIdentity === 'function'
            ? window.resolveInventoryDebtIdentity(requested)
            : {
                profileId: String(requested.profileId || requested.docId || requested.id || '').trim(),
                memberId: String(requested.memberId || requested.memberCode || '').trim(),
                studentName: String(requested.name || requested.studentName || requested.profileName || '').trim()
            };
        const displayName = String(identity.studentName || requested.name || requested.studentName || '').trim();
        const normName = norm(displayName);
        const invStore = window.__inventoryStore || {};
        const st = window.__store || {};
        const seen = new Set();
        const results = [];
        const lookupTarget = {
            profileId: identity.profileId || '',
            memberId: identity.memberId || '',
            name: displayName,
            studentName: displayName
        };

        function dedupeItem(item) {
            const key = item.id ||
                [item.profileId, item.memberId, item.category, item.size, item.amount, item.date, item.description].join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }

        function identityMatches(item) {
            if (identity.profileId && String(item.profileId || item.studentProfileId || item._profileId || '').trim() === identity.profileId) return true;
            if (identity.memberId && String(item.memberId || item.memberCode || item._memberId || '').trim() === identity.memberId) return true;
            if (!normName) return false;
            const fields = [
                item.desc, item.description, item.studentName, item.name,
                item.profileName, item.customerName, item.memberName,
                item.student, item.buyerName, item.studentLabel, item._studentName
            ];
            return fields.some(value => {
                if (!value) return false;
                const normalized = norm(value);
                return normalized === normName;
            });
        }

        function isDebtItem(item) {
            const type = norm(item.type || item.transactionType || '');
            const pending = item.unpaid === true ||
                item.inventoryDebtStatus === 'pending' ||
                item.paymentStatus === 'unpaid';
            return pending && (
                !type || type.includes('xuat ban') || type.includes('ban no') ||
                type.includes('ban hang') || type === 'xuat' || item.unpaid === true
            );
        }

        function normalizeItem(item) {
            return {
                ...item,
                id: item.id || '',
                profileId: item.profileId || item.studentProfileId || item._profileId || '',
                memberId: item.memberId || item.memberCode || item._memberId || '',
                studentName: item.studentName || item._studentName || item.desc || item.description || displayName,
                category: item.category || '',
                size: item.size || '',
                qty: Number(item.qty || item.quantity || 1),
                amount: Number(item.amount || 0),
                date: item.date || '',
                desc: item.desc || item.description || '',
                description: item.description || item.desc || '',
                unpaid: true,
                source: item._source || 'resolved'
            };
        }

        // Source 1: canonical indexed lookup (profileId → memberId → exact normalized name).
        if (typeof window.getInventoryDebtsForStudent === 'function') {
            try {
                const s1 = window.getInventoryDebtsForStudent(lookupTarget, {
                    allowFallback: true,
                    reason
                }) || [];
                for (const item of s1) {
                    const normalized = normalizeItem({ ...item, _source: 'getInventoryDebtsForStudent' });
                    if (dedupeItem(normalized)) results.push(normalized);
                }
            } catch (_e) {}
        }

        // Source 2: authoritative complete active-debt store.
        if (Array.isArray(invStore.financeInventoryDebts)) {
            for (const item of invStore.financeInventoryDebts) {
                if (!identityMatches(item) || !isDebtItem(item)) continue;
                const normalized = normalizeItem({ ...item, _source: 'financeInventoryDebts' });
                if (dedupeItem(normalized)) results.push(normalized);
            }
        }

        // Source 3: standalone/legacy complete-debt mirror.
        if (Array.isArray(window.__completeInventoryDebts)) {
            for (const item of window.__completeInventoryDebts) {
                if (!identityMatches(item) || !isDebtItem(item)) continue;
                const normalized = normalizeItem({ ...item, _source: '__completeInventoryDebts' });
                if (dedupeItem(normalized)) results.push(normalized);
            }
        }

        // History is compatibility fallback only; it never owns completeness.
        const fallbackSources = [
            [st.inventory, '__store.inventory'],
            [window.allInventory, 'allInventory'],
            [invStore.inventoryHistory, 'inventoryHistory']
        ];
        for (const [sourceItems, label] of fallbackSources) {
            if (!Array.isArray(sourceItems)) continue;
            for (const item of sourceItems) {
                if (!identityMatches(item) || !isDebtItem(item)) continue;
                const normalized = normalizeItem({ ...item, _source: label });
                if (dedupeItem(normalized)) results.push(normalized);
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

        const nameEl = document.getElementById('mi_name');
        const identityTarget = {
            profileId: String((nameEl && nameEl.dataset && nameEl.dataset.profileId) || '').trim(),
            memberId: String((nameEl && nameEl.dataset && nameEl.dataset.memberId) || '').trim(),
            name: studentName,
            studentName
        };
        const ensureResult = await MultiItemInventorySafety.ensureMultiItemInventoryReady(reason);
        const items = MultiItemInventorySafety.resolveMultiItemInventoryDebts(identityTarget, {
            reason, ensureResult
        });
        MultiItemInventorySafety.renderMultiItemInventoryDebtPanel(studentName, items, {
            ensureResult, reason
        });
    },
    200
);

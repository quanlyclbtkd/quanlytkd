/**
 * computation/inventoryRenderer.js — Phase 3.5A Render Computation Isolation
 *
 * Isolated inventory render computation.
 * Extracted from renderApp() in render.js.
 *
 * Owns:
 *   - Live inventory stock map (buildLiveInvMap — pure function)
 *   - Inventory table row HTML generation
 *   - Uniform transaction list HTML generation
 *   - Module-local render cache (NOT window.__store.tabHtmlCache)
 *   - Explicit cache invalidation API
 *   - Lightweight render metrics
 *
 * KHÔNG:
 *   - Mutate DOM trực tiếp
 *   - Query Firestore
 *   - Gọi renderApp()
 *
 * Row identity:
 *   Every <tr> carries data-inv-key (stock rows) or data-inv-id (tx rows)
 *   for future virtualization keying.
 *
 * Backward compat:
 *   render.js reads getCachedLiveInvMap() and writes it to window._liveInvMap
 *   so app.js (openProfile uniform size selector) continues to work unchanged.
 */

import { formatDate } from '../../../utils/format.js';
import { rankStudentNameSearchResults } from '../../../core/studentSearchIndex.js?v=student-given-name-priority-20260811-v5u3';

// ── Phase 4K-2B: Fallback inv blob builder (used when getInventorySearchBlob unavailable) ──
function _fallbackInvBlob(t) {
    const _nvFn = window.normalizeVNForSearch || (v => String(v || '').toLowerCase().trim());
    const tt = t || {};
    return [
        tt.desc, tt.size, tt.category,
        tt.studentName, tt.note, tt.type,
    ].filter(Boolean).map(v => _nvFn(String(v))).join(' ');
}

// ── Module-local render cache ─────────────────────────────────────────────────
const _cache = {
    invListRows:     null,     // <tr data-inv-key>… string | null
    uniformTxRows:   null,     // <tr data-inv-id>… string | null
    liveInvMap:      null,     // { [key]: { category, size, in, out } } | null
    unpaidInvCount:  0,
    paramsKey:       null,
    dataVersion:     -1,
    _version:        0,
};

// ── Metrics ───────────────────────────────────────────────────────────────────
const _metrics = {
    computations:       0,
    cacheHits:          0,
    duplicatePrevented: 0,
    skippedHiddenTab:   0,
    lastComputeMs:      0,
};

// ── Explicit invalidation ─────────────────────────────────────────────────────

/**
 * @param {'invTable'|'uniformTxList'|'liveMap'|'all'} section
 */
export function invalidateInventoryRender(section) {
    if (section === 'invTable'     || section === 'all') _cache.invListRows   = null;
    if (section === 'uniformTxList'|| section === 'all') _cache.uniformTxRows = null;
    if (section === 'liveMap'      || section === 'all') _cache.liveInvMap    = null;
    if (section === 'all') {
        _cache.paramsKey   = null;
        _cache.dataVersion = -1;
    }
    _cache._version++;
}

// ── Pure function: live stock map ─────────────────────────────────────────────

/**
 * Build a live inventory map from all inventory transaction documents.
 * Pure function — no side effects, no DOM, no Firestore.
 *
 * @param {Object[]} allInventory   — inventory docs from store
 * @returns {{ [key: string]: { category:string, size:string, in:number, out:number } }}
 */
export function buildLiveInvMap(allInventory, inventoryStats = null) {
    const liveInvMap = {};
    (Array.isArray(allInventory) ? allInventory : []).forEach(t => {
        if (!t.size) return;
        const cat = t.category || 'Võ phục';
        const key = cat + '|||' + t.size;
        if (!liveInvMap[key]) liveInvMap[key] = { category: cat, size: t.size, in: 0, out: 0, source: 'history-page' };
        if (t.type === 'Nhập kho') liveInvMap[key].in  += (Number(t.qty) || 0);
        else                       liveInvMap[key].out += (Number(t.qty) || 0);
    });

    // Phase 4K-6V2: lịch sử chỉ tải 100 docs/trang nên không được mặc định coi
    // page hiện tại là toàn bộ tồn kho. Overlay summary settings/inventory_stats
    // cho các key đã được hệ thống duy trì; key chưa có stats vẫn dùng fallback
    // từ các trang lịch sử đang tải để giữ tương thích dữ liệu cũ.
    const stats = inventoryStats && typeof inventoryStats === 'object' ? inventoryStats : {};
    const bases = new Set();
    Object.keys(stats).forEach(k => {
        if (k.endsWith('_balance')) bases.add(k.slice(0, -8));
        else if (k.endsWith('_in')) bases.add(k.slice(0, -3));
        else if (k.endsWith('_out')) bases.add(k.slice(0, -4));
    });
    bases.forEach(base => {
        const parts = base.includes('|||') ? base.split('|||') : ['Võ phục', base];
        const category = parts[0] || 'Võ phục';
        const size = parts.slice(1).join('|||') || base;
        if (!size) return;
        const key = category + '|||' + size;
        const current = liveInvMap[key] || { category, size, in: 0, out: 0 };
        const rawIn = Number(stats[base + '_in']);
        const rawOut = Number(stats[base + '_out']);
        const rawBalance = Number(stats[base + '_balance']);
        const hasIn = Number.isFinite(rawIn);
        const hasOut = Number.isFinite(rawOut);
        const hasBalance = Number.isFinite(rawBalance);
        const out = hasOut ? rawOut : Number(current.out || 0);
        const input = hasIn ? rawIn : (hasBalance ? rawBalance + out : Number(current.in || 0));
        liveInvMap[key] = { category, size, in: input, out, source: 'inventory-stats' };
    });
    return liveInvMap;
}

// ── Row renderers ─────────────────────────────────────────────────────────────

/**
 * Render a single inventory stock row.
 * Stable identity: data-inv-key="${key}"
 *
 * @param {string} key           — "category|||size"
 * @param {Object} stock         — { category, size, in, out }
 * @returns {string}
 */
export function renderInventoryRow(key, stock) {
    const inQty  = stock.in;
    const outQty = stock.out;
    const bal    = inQty - outQty;
    const catColors = {
        'Võ phục': 'bg-blue-50 text-blue-700 border-blue-200',
        'Áo thun': 'bg-purple-50 text-purple-700 border-purple-200',
        'Bảo hộ':  'bg-orange-50 text-orange-700 border-orange-200',
    };
    const catBadge = `<span class="badge ${catColors[stock.category] || 'bg-slate-50 text-slate-700 border-slate-200'} border text-[0.65rem]">${stock.category}</span>`;
    return `<tr data-inv-key="${key}"><td>${catBadge}</td><td class="font-bold text-slate-800">${stock.size}</td><td class="text-emerald-600 font-bold">+${inQty}</td><td class="text-rose-600 font-bold">-${outQty}</td><td class="${bal < 3 ? 'text-rose-600' : 'text-emerald-600'} font-black text-base">${bal}</td></tr>`;
}

/**
 * Render a single uniform transaction row.
 * Stable identity: data-inv-id="${t.id}"
 *
 * @param {Object} t             — inventory transaction doc
 * @param {Object} opts
 * @param {boolean} opts.isAdmin
 * @param {Object|null} opts.relTx  — related finance transaction (for desc/amount)
 * @param {string[]} opts.invCats   — category names for badge color lookup
 * @returns {string}
 */
export function renderUniformTxRow(t, opts = {}) {
    const { isAdmin = false, relTx = null, invCats = [] } = opts;
    const isInc    = t.type === 'Nhập kho';
    const isUnpaid = !isInc && t.unpaid === true;
    const typeBadge  = `<span class="text-[0.65rem] font-bold uppercase ${isInc ? 'text-rose-600' : 'text-emerald-600'} bg-slate-50 px-2 py-1 rounded border ${isInc ? 'border-rose-200' : 'border-emerald-200'}">${isInc ? 'NHẬP' : 'XUẤT'}</span>`;
    const unpaidBadge = isUnpaid
        ? `<span style="display:inline-block;font-size:0.65rem;font-weight:900;background:#f97316;color:#fff;border-radius:5px;padding:2px 7px;margin-left:5px;vertical-align:middle;letter-spacing:0.03em;">NỢ</span>`
        : '';
    let displayDesc = t.desc, displayAmt = t.amount;
    if ((!displayDesc || displayAmt === undefined) && relTx) {
        displayDesc = relTx.description;
        displayAmt  = relTx.amount;
    }
    const amountHtml = displayAmt > 0
        ? `<span class="font-bold ${isInc ? 'text-rose-600' : (isUnpaid ? 'text-orange-500' : 'text-emerald-600')}">${isInc ? '-' : '+'}${displayAmt.toLocaleString()}</span>`
        : `<span class="font-bold text-slate-400">0</span>`;
    const descHtml   = (displayDesc || (isInc ? `Nhập ${t.size}` : `Xuất ${t.size}`)) + unpaidBadge;
    const txIdForDel = relTx ? relTx.id : 'undefined';
    const txCat      = t.category || 'Võ phục';
    const txCatColors = {
        'Võ phục': 'bg-blue-50 text-blue-700 border-blue-200',
        'Áo thun': 'bg-purple-50 text-purple-700 border-purple-200',
        'Bảo hộ':  'bg-orange-50 text-orange-700 border-orange-200',
    };
    const txCatBadge = `<span class="badge ${txCatColors[txCat] || 'bg-slate-50 text-slate-700 border-slate-200'} border text-[0.65rem]">${txCat}</span>`;
    const markPaidBtn = (isUnpaid && isAdmin)
        ? `<button type="button" class="btn-sm bg-emerald-600 text-white shadow-sm" onclick="markInvPaid('${t.id}')">✅ Đã thu</button>`
        : '';
    return `<tr data-inv-id="${t.id || ''}" class="${isUnpaid ? 'inv-unpaid-row' : ''}"><td class="text-slate-500 text-[0.85rem]">${formatDate(t.date)}</td><td class="font-bold text-blue-700 text-[0.9rem]">${descHtml}</td><td>${typeBadge}</td><td>${txCatBadge} <span class="badge bg-slate-50 text-slate-700 border border-slate-200 text-[0.75rem] ml-1">${t.size}</span></td><td>${amountHtml}</td><td class="action-btns">${markPaidBtn}${isAdmin ? `<button type="button" class="btn-sm bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white" onclick="deleteTx('${txIdForDel}', '${t.id}')">🗑</button>` : ''}</td></tr>`;
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute live inventory map + build tab-specific list HTML.
 * Mirrors renderApp() lines 145-233 exactly.
 *
 * @param {Object[]} allInventory   — inventory docs from store
 * @param {Object}   allTransactions — for relatedTxByInvId cross-reference
 * @param {Object}   params
 * @param {string}     params.curTabId
 * @param {string}     params.search
 * @param {boolean}    params.isAdmin
 * @param {string[]}   params.invCats
 * @param {Object}     params.catOrder    — { [catName]: sortPriority }
 */
export function computeAndCacheInventory(allInventory, allTransactions, params) {
    const {
        curTabId  = 'inventory',
        search    = '',
        isAdmin   = false,
        invCats   = [],
        catOrder  = {},
    } = params;

    // ── Cache-hit detection ──
    const paramsKey   = `${curTabId}|${search}`;
    const dataVersion = (window.__store || {})._dataVersion || 0;
    if (
        _cache.liveInvMap !== null &&
        _cache.paramsKey   === paramsKey &&
        _cache.dataVersion === dataVersion
    ) {
        _metrics.cacheHits++;
        return;
    }

    const t0 = performance.now();
    _metrics.computations++;

    // ── Always compute live map (needed for size-select regardless of tab) ──
    const inventoryStats = (window.__store || {}).inventoryStats || null;
    const liveInvMap = buildLiveInvMap(allInventory, inventoryStats);

    const sortedInvKeys = Object.keys(liveInvMap).sort((a, b) => {
        const ca = liveInvMap[a].category, cb = liveInvMap[b].category;
        if (ca !== cb) return (catOrder[ca] ?? 9) - (catOrder[cb] ?? 9);
        return liveInvMap[a].size.localeCompare(liveInvMap[b].size);
    });

    // ── Inventory stock table (only on inventory tab) ──
    let invListRows    = null;
    let uniformTxRows  = null;
    let unpaidInvCount = 0;

    // Phase 4K-6V5U3: rank only the already-matched inventory transaction rows
    // for presentation when global search is active. Stock/ledger calculations
    // remain on the original arrays and original ordering.
    const _uniformSearchCandidates = curTabId === 'inventory' && String(search || '').trim() ? [] : null;

    const buildInvTable   = curTabId === 'inventory';
    const buildUniformTx  = curTabId === 'inventory';

    if (!buildInvTable && !buildUniformTx) {
        _metrics.skippedHiddenTab++;
    }

    if (buildInvTable) {
        invListRows = '';
        sortedInvKeys.forEach(key => {
            const s = liveInvMap[key];
            if (s.in > 0 || s.out > 0) {
                invListRows += renderInventoryRow(key, s);
            }
        });
    }

    if (buildUniformTx) {
        // Build relatedTxByInvId cross-reference (mirrors render.js lines 200-202)
        const relatedTxByInvId = new Map();
        allTransactions.forEach(tx => {
            if (tx.relatedInvId) relatedTxByInvId.set(tx.relatedInvId, tx);
        });

        uniformTxRows = '';
        allInventory.forEach(t => {
            let isSearchMatch = true;
            if (search) {
                // Phase 4K-2B: Dùng getInventorySearchBlob() — pre-normalized cache, không build lại mỗi lần
                const q = window.normalizeVNForSearch
                    ? window.normalizeVNForSearch(search)
                    : String(search || '').toLowerCase().trim();
                const invBlob = typeof window.getInventorySearchBlob === 'function'
                    ? window.getInventorySearchBlob(t)
                    : _fallbackInvBlob(t);
                if (q && !invBlob.includes(q)) isSearchMatch = false;
            }
            if (!isSearchMatch) return;

            const isUnpaid = t.type !== 'Nhập kho' && t.unpaid === true;
            if (isUnpaid) unpaidInvCount++;

            const relTx = relatedTxByInvId.get(t.id) || null;
            const rowHtml = renderUniformTxRow(t, { isAdmin, relTx, invCats });
            if (_uniformSearchCandidates) {
                _uniformSearchCandidates.push({
                    html: rowHtml,
                    studentName: String(t.studentName || t.profileName || t.name || '')
                });
            } else {
                uniformTxRows += rowHtml;
            }
        });

        if (_uniformSearchCandidates) {
            uniformTxRows = rankStudentNameSearchResults(
                _uniformSearchCandidates,
                search,
                row => row.studentName
            ).map(row => row.html).join('');
        }

        const pg = typeof window.getInventoryHistoryPaginationState === 'function'
            ? window.getInventoryHistoryPaginationState()
            : null;
        if (pg) {
            const common = 'text-align:center;padding:14px 10px;background:#f8fafc;';
            if (pg.loading && !pg.loaded) {
                uniformTxRows += `<tr id="inventoryLoadMoreRow"><td colspan="6" style="${common}color:#64748b;font-weight:700;">⏳ Đang tải 100 giao dịch Kho gần nhất...</td></tr>`;
            } else if (pg.error) {
                uniformTxRows += `<tr id="inventoryLoadMoreRow"><td colspan="6" style="${common}color:#b45309;"><div style="font-weight:800;margin-bottom:8px;">⚠️ Không tải được lịch sử Kho</div><button type="button" class="btn-sm bg-amber-500 text-white" onclick="window.refreshInventoryHistory?.('inventory-history-retry')">Thử lại</button></td></tr>`;
            } else if (pg.hasMore) {
                uniformTxRows += `<tr id="inventoryLoadMoreRow"><td colspan="6" style="${common}"><button type="button" class="btn-sm bg-blue-600 text-white" style="min-width:210px;padding:10px 16px;" onclick="window.loadMoreInventoryHistory(event)" ${pg.loading ? 'disabled' : ''}>${pg.loading ? '⏳ Đang tải...' : `⬇ Tải thêm ${pg.pageSize} giao dịch`}</button><div style="font-size:0.68rem;color:#64748b;margin-top:6px;">Đã tải ${pg.loadedCount} giao dịch</div></td></tr>`;
            } else if (pg.loaded) {
                uniformTxRows += `<tr id="inventoryLoadMoreRow"><td colspan="6" style="${common}color:#64748b;font-size:0.72rem;font-weight:700;">✓ Đã tải hết ${pg.loadedCount} giao dịch Kho</td></tr>`;
            }
        }

        const completeDebts = window.__inventoryStore && Array.isArray(window.__inventoryStore.financeInventoryDebts)
            ? window.__inventoryStore.financeInventoryDebts
            : null;
        if (completeDebts && window.__inventoryStore.inventoryDebtCompleteness === 'complete') {
            unpaidInvCount = completeDebts.length;
        }
    }

    // ── Store in cache ──
    _cache.liveInvMap    = liveInvMap;
    _cache.invListRows   = invListRows;
    _cache.uniformTxRows = uniformTxRows;
    _cache.unpaidInvCount = unpaidInvCount;
    _cache.paramsKey     = paramsKey;
    _cache.dataVersion   = dataVersion;

    const ms = performance.now() - t0;
    _metrics.lastComputeMs = ms;
    if (ms > 16) {
        console.warn(`[inventoryRenderer] 🐢 Slow computation: ${ms.toFixed(1)}ms (${allInventory.length} inventory docs)`);
    }

    // ── [Phase 3.8A] Large list safety — track inventory list row counts ──────
    // Virtualization-ready boundaries:
    //   START: inventory.inventoryList  → vị trí bắt đầu render tồn kho theo size
    //   END:   inventory.inventoryList  → cuối invListRows
    //   START: inventory.uniformTxList  → vị trí bắt đầu render lịch sử giao dịch kho
    //   END:   inventory.uniformTxList  → cuối uniformTxRows
    // Row identity: data-inv-id sẽ được thêm trong Phase tương lai nếu cần keying.
    if (typeof window.trackLargeListRender === 'function') {
        if (buildInvTable) {
            window.trackLargeListRender('inventory.inventoryList', sortedInvKeys.length, { reason: 'render-inventory-list' });
        }
        if (buildUniformTx) {
            window.trackLargeListRender('inventory.uniformTxList', allInventory.length, { reason: 'render-uniform-tx-list' });
        }
    }
}

// ── Public read API ───────────────────────────────────────────────────────────

/**
 * @param {'invListRows'|'uniformTxRows'} section
 * @returns {string}
 */
export function getInventoryCachedHtml(section) {
    return _cache[section] || '';
}

/**
 * Return the computed live inventory map.
 * render.js reads this and writes to window._liveInvMap (backward compat).
 *
 * @returns {Object|null}
 */
export function getCachedLiveInvMap() {
    return _cache.liveInvMap;
}

/**
 * Return cached unpaid inventory count for summary numbers.
 * @returns {number}
 */
export function getCachedUnpaidInvCount() {
    return _cache.unpaidInvCount;
}

/**
 * @returns {Object}
 */
export function getInventoryMetrics() {
    return { ..._metrics };
}

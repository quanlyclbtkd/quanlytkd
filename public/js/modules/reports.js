/**
 * modules/reports.js — Phase 4.0A
 * ────────────────────────────────────────────────────────────────
 * Extract các hàm xuất báo cáo / Excel từ app.js sang ES Module.
 * Bao gồm:
 *   - openExcelExportModal / updateExcelPeriodOptions / executeExcelExport
 *   - exportToExcel (alias)
 *   - exportAchievementsExcel
 *   - exportExamPaidList
 *   - updateTaxPeriodOptions / executeTaxExport
 *
 * PATTERN (giống finance.js Phase 2e):
 *   initReports() đăng ký toàn bộ window functions báo cáo.
 *   Mỗi hàm đọc state từ window.__store TẠI THỜI ĐIỂM GỌI,
 *   KHÔNG capture closure → tránh stale data.
 *
 * BRIDGE:
 *   window.__store.colRef / invRef / profRef / db
 *   window.__store.clubData / clubConfig / profiles / transactions
 *
 * FIREBASE SDK:
 *   window._fb_init — CDN loader (như finance.js Phase 2e).
 *
 * XLSX:
 *   window.XLSX — CDN global (SheetJS).
 *
 * ROLLBACK NHANH:
 *   Comment `initReports()` trong main.js → app.js chạy fallback,
 *   không ảnh hưởng bất kỳ chức năng nào.
 *
 * MIGRATION MAP:
 * ┌─────────────────────────────────────┬────────────┐
 * │ Hàm / block                         │ Dòng app.js│
 * ├─────────────────────────────────────┼────────────┤
 * │ window.openExcelExportModal         │ 4818       │
 * │ window.updateExcelPeriodOptions     │ 4825       │
 * │ window.executeExcelExport           │ 4835–5189  │
 * │ window.exportToExcel (alias)        │ 5191       │
 * │ window.exportAchievementsExcel      │ 5193–5401  │
 * │ window.exportExamPaidList           │ 5403–5580  │
 * │ window.updateTaxPeriodOptions       │ 5582       │
 * │ window.executeTaxExport             │ 5592–5795  │
 * └─────────────────────────────────────┴────────────┘
 *
 * /// Phase 4.0A — extracted from app.js
 * ────────────────────────────────────────────────────────────────
 */

import {
    getLocalToday,
    formatDate,
    formatMonth,
    formatMonthCompact,
    normalizeYYYYMM,
    addMonthsToYYYYMM,
} from '../utils/format.js';

// ════════════════════════════════════════════════════════════════
// Phase 4K-6E-B: Belt ordering helpers for exam export sort
// ════════════════════════════════════════════════════════════════

const EXAM_EXPORT_BELT_ORDER = [
    'Đai trắng - Cấp 10',
    'Đai trắng 1 vạch - Cấp 9',
    'Đai trắng 2 vạch - Cấp 8',
    'Đai vàng - Cấp 7',
    'Đai xanh lá - Cấp 6',
    'Đai xanh dương - Cấp 5',
    'Đai đỏ - Cấp 4',
    'Đai đỏ 1 vạch - Cấp 3',
    'Đai đỏ 2 vạch - Cấp 2',
    'Đai đỏ 3 vạch - Cấp 1',
    'Đai Đen - Đỏ',
    'Đai Đen',
];

const normalizeExamExportText = function(v) {
    return String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[–—-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const getExamExportBeltRank = function(belt) {
    const raw = String(belt || '').trim();
    if (!raw) return 999;

    const exactIndex = EXAM_EXPORT_BELT_ORDER.indexOf(raw);
    if (exactIndex >= 0) return exactIndex;

    const norm = normalizeExamExportText(raw);
    const normOrder = EXAM_EXPORT_BELT_ORDER.map(normalizeExamExportText);
    const normIndex = normOrder.indexOf(norm);
    if (normIndex >= 0) return normIndex;

    const aliases = [
        { rank: 0,  keys: ['dai trang cap 10', 'trang cap 10', 'cap 10', 'dai trang'] },
        { rank: 1,  keys: ['dai trang 1 vach cap 9', 'trang 1 vach', 'cap 9'] },
        { rank: 2,  keys: ['dai trang 2 vach cap 8', 'trang 2 vach', 'cap 8'] },
        { rank: 3,  keys: ['dai vang cap 7', 'vang', 'cap 7'] },
        { rank: 4,  keys: ['dai xanh la cap 6', 'xanh la', 'cap 6'] },
        { rank: 5,  keys: ['dai xanh duong cap 5', 'xanh duong', 'xanh bien', 'cap 5'] },
        { rank: 6,  keys: ['dai do cap 4', 'do cap 4', 'cap 4'] },
        { rank: 7,  keys: ['dai do 1 vach cap 3', 'do 1 vach', 'cap 3'] },
        { rank: 8,  keys: ['dai do 2 vach cap 2', 'do 2 vach', 'cap 2'] },
        { rank: 9,  keys: ['dai do 3 vach cap 1', 'do 3 vach', 'cap 1'] },
        { rank: 10, keys: ['dai den do', 'den do'] },
        { rank: 11, keys: ['dai den', 'den'] },
    ];

    for (const item of aliases) {
        if (item.keys.some(k => norm.includes(k))) return item.rank;
    }

    const m = norm.match(/cap\s*(\d+)/i);
    if (m) {
        const cap = Number(m[1]);
        if (cap >= 1 && cap <= 10) return 10 - cap;
    }

    return 999;
};

const getExamExportNameKey = function(name) {
    if (typeof window !== 'undefined' && typeof window.normalizeVNForSearch === 'function') {
        return window.normalizeVNForSearch(name);
    }
    return normalizeExamExportText(name);
};

const getProfileForExportName = function(name) {
    const profiles =
        (typeof window !== 'undefined' && window.__store && window.__store.profiles) ||
        (typeof window !== 'undefined' && window.allProfiles) ||
        {};
    return profiles[name] || {};
};

const sortExamExportEntries = function(entries) {
    return entries.slice().sort((a, b) => {
        const nameA = a.name || a.studentName || '';
        const nameB = b.name || b.studentName || '';

        const pA = a.profile || getProfileForExportName(nameA);
        const pB = b.profile || getProfileForExportName(nameB);

        const currentBeltA = a.currentBelt || a.belt || pA.belt || '';
        const currentBeltB = b.currentBelt || b.belt || pB.belt || '';

        const rankA = getExamExportBeltRank(currentBeltA);
        const rankB = getExamExportBeltRank(currentBeltB);
        if (rankA !== rankB) return rankA - rankB;

        const targetBeltA = a.targetBelt || a.nextBelt || '';
        const targetBeltB = b.targetBelt || b.nextBelt || '';

        const targetRankA = getExamExportBeltRank(targetBeltA);
        const targetRankB = getExamExportBeltRank(targetBeltB);
        if (targetRankA !== targetRankB) return targetRankA - targetRankB;

        const branchA = String(a.branch || pA.branch || 'CS1');
        const branchB = String(b.branch || pB.branch || 'CS1');

        const branchCmp = branchA.localeCompare(branchB, 'vi');
        if (branchCmp !== 0) return branchCmp;

        return getExamExportNameKey(nameA).localeCompare(
            getExamExportNameKey(nameB),
            'vi'
        );
    });
};

// ── Phase 4K-4D: Fallback classify helper (reports — Node/export context safe) ──
function _classifyInvTxForReport(tx, cats) {
    const type   = String(tx && tx.type || '').trim();
    const amount = Number(tx && tx.amount || 0);
    const _cats  = Array.isArray(cats) ? cats : ['Võ phục', 'Áo thun', 'Bảo hộ'];
    for (const cat of _cats) {
        if (type === 'Thu ' + cat)  return { isInventory: true, direction: 'income',  amount };
        if (type === 'Chi ' + cat)  return { isInventory: true, direction: 'expense', amount };
        if (type === 'Tặng ' + cat) return { isInventory: true, direction: 'gift',    amount: 0 };
    }
    if (type === 'Võ phục')         return { isInventory: true, direction: 'income',  amount };
    const hasRelated = !!(tx && tx.relatedInvId);
    if (hasRelated) {
        if (type.startsWith('Thu '))  return { isInventory: true, direction: 'income',  amount };
        if (type.startsWith('Chi '))  return { isInventory: true, direction: 'expense', amount };
        if (type.startsWith('Tặng ')) return { isInventory: true, direction: 'gift',    amount: 0 };
    }
    return { isInventory: false, direction: '', amount: 0 };
}

// ════════════════════════════════════════════════════════════════
// BRIDGE HELPERS — đọc state từ window.__store tại call time
// ════════════════════════════════════════════════════════════════

/** Lấy app context: ưu tiên getAppContext, fallback __store */
function _ctx(reason) {
    return (typeof window.getAppContext === 'function')
        ? window.getAppContext(reason)
        : {};
}

function _colRef()       { const c = _ctx('reports-colRef');       return c.colRef       || (window.__store || {}).colRef; }
function _invRef()       { const c = _ctx('reports-invRef');       return c.invRef       || (window.__store || {}).invRef; }
function _profiles()     { const c = _ctx('reports-profiles');     return c.allProfiles  || (window.__store || {}).profiles || {}; }
function _transactions() { const c = _ctx('reports-transactions'); return c.allTransactions || (window.__store || {}).transactions || []; }
function _config()       { const c = _ctx('reports-config');       return c.clubConfig   || (window.__store || {}).clubConfig || {}; }
function _clubData()     { const c = _ctx('reports-clubData');     return c.clubData     || (window.__store || {}).clubData || {}; }

/** Firebase SDK functions từ CDN loader */
function _sdk()          { return window._fb_init || {}; }

/** SheetJS global từ CDN */
function _XLSX()         { return window.XLSX; }

/** Tên cơ sở theo mã code */
function _branchName(code) {
    if (typeof window.getBranchNameDisplay === 'function') return window.getBranchNameDisplay(code);
    return code || 'CS1';
}

// ════════════════════════════════════════════════════════════════
// EXPORT CHÍNH
// ════════════════════════════════════════════════════════════════

/**
 * initReports() — Đăng ký toàn bộ window functions xuất báo cáo.
 *
 * Gọi từ main.js SAU khi app.js đã chạy xong (window.__appLoaded = true).
 * Tất cả window.X bên dưới OVERRIDE những gì app.js đã set trước.
 */
export function initReports() {

    // ════════════════════════════════════════════════════════════
    // Phase 4.0A-2: Idempotency guard — tánh gọi 2 lần
    // ════════════════════════════════════════════════════════════
    if (window.__reportsModuleInitialized) return;
    window.__reportsModuleInitialized = true;

    // ════════════════════════════════════════════════════════════
    // Phase 4.0A-2: Module metrics
    // ════════════════════════════════════════════════════════════
    window.__reportsModuleMetrics = {
        loaded: true,
        excelExportCalls: 0,
        taxExportCalls: 0,
        achievementExportCalls: 0,
        examPaidExportCalls: 0,
        fallbackCalls: 0,
        lastExportType: '',
        lastExportDurationMs: 0,
        lastError: null,
        // Phase 4.0A-3: examPaid extended metrics
        examPaidPaginatedLoadUsed: 0,
        examPaidFallbackTransactionsUsed: 0,
        // Phase 4.0A-4: dual-source load + dedupe metrics
        examPaidTxMonthDocs: 0,
        examPaidDateDocs: 0,
        examPaidDedupeDocs: 0,
    };
    window.printReportsModuleMetrics = function() {
        console.table(window.__reportsModuleMetrics);
    };

    // ════════════════════════════════════════════════════════════
    // 1. openExcelExportModal / updateExcelPeriodOptions
    // ════════════════════════════════════════════════════════════

    window.openExcelExportModal = () => {
        if (window.userRole === 'viewer') return window.showToast("⛔ Tài khoản khách không thể tải File!");
        document.getElementById('excelExportModal').style.display = 'flex';
        window.updateExcelPeriodOptions();
    };

    window.updateExcelPeriodOptions = () => {
        const type = document.getElementById('excel_periodType').value;
        const sel  = document.getElementById('excel_periodValue');
        sel.innerHTML = '';
        if (type === 'month')   { for (let i = 1; i <= 12; i++) sel.innerHTML += `<option value="${i}">Tháng ${i}</option>`; }
        else if (type === 'quarter') { for (let i = 1; i <= 4; i++)  sel.innerHTML += `<option value="${i}">Quý ${i}</option>`; }
        else if (type === 'half')    { sel.innerHTML += `<option value="1">6 tháng đầu năm</option><option value="2">6 tháng cuối năm</option>`; }
        else                         { sel.innerHTML += `<option value="1">Cả năm</option>`; }
    };

    // alias
    window.exportToExcel = window.openExcelExportModal;

    // ════════════════════════════════════════════════════════════
    // 2. executeExcelExport — Xuất báo cáo tổng hợp Excel
    // ════════════════════════════════════════════════════════════

    window.executeExcelExport = async () => {
        await window.ensureXlsxReady?.('reports-excel-export');
        if (window.userRole === 'viewer') return;

        const year   = parseInt(document.getElementById('excel_year').value);
        const pType  = document.getElementById('excel_periodType').value;
        const pVal   = document.getElementById('excel_periodValue').value;
        const pLabel = document.getElementById('excel_periodValue').options[
            document.getElementById('excel_periodValue').selectedIndex
        ].text;

        let startStr, endStr;
        if (pType === 'month') {
            let m = String(pVal).padStart(2, '0');
            startStr = `${year}-${m}-01`; endStr = `${year}-${m}-31`;
        } else if (pType === 'quarter') {
            let ms = (parseInt(pVal) - 1) * 3 + 1, me = ms + 2;
            startStr = `${year}-${String(ms).padStart(2,'0')}-01`; endStr = `${year}-${String(me).padStart(2,'0')}-31`;
        } else if (pType === 'half') {
            if (pVal === '1') { startStr = `${year}-01-01`; endStr = `${year}-06-30`; }
            else              { startStr = `${year}-07-01`; endStr = `${year}-12-31`; }
        } else { startStr = `${year}-01-01`; endStr = `${year}-12-31`; }

        const periodTitle = `${pLabel} năm ${year}`;

        if (typeof window.ensureAllProfilesForExport === 'function') {
            await window.ensureAllProfilesForExport('excel-export');
        }
        // Phase 4.0A-2: Inventory export guard
        await window.ensureInventoryForFeature?.('export', 'excel-export');
        // Phase 4.0A-2: Metrics tracking
        const _excelStartMs = Date.now();
        window.__reportsModuleMetrics.excelExportCalls++;
        window.__reportsModuleMetrics.lastExportType = 'excel';
        window.showToast("⏳ Đang xuất dữ liệu...", 15000, true);

        const colRef = _colRef();
        const invRef = _invRef();
        const allProfiles = _profiles();
        const clubData    = _clubData();
        const clubConfig  = _config();
        const XLSX        = _XLSX();
        const { getDocs, query, where, limit } = _sdk();

        try {
            let txAll = [], invAll = [];
            const _startM = startStr.substring(0, 7);
            const _endM   = endStr.substring(0, 7);

            const _paginationToastTimer = setTimeout(() => {
                window.showToast("⏳ Đang tải toàn bộ dữ liệu báo cáo...", 30000, true);
            }, 2000);

            try {
                const txByDate = await window.loadTransactionsForDateRange({
                    colRef,
                    startDate: startStr,
                    endDate:   endStr,
                    reason:    'excel-export-date-range',
                });
                const txByMonth = await window.loadTransactionsForTxMonthRange({
                    colRef,
                    startMonth: _startM,
                    endMonth:   _endM,
                    reason:     'excel-export-txMonth-range',
                });
                // Phase 4K-4F: Merge packageMonths query for middle-month coverage
                let txByPackage = [];
                try {
                    const _months = [];
                    let _mCursor = _startM;
                    while (_mCursor <= _endM && _months.length < 36) {
                        _months.push(_mCursor);
                        const [_my, _mm] = _mCursor.split('-').map(Number);
                        const _next = _mm === 12 ? (_my + 1) + '-01' : _my + '-' + String(_mm + 1).padStart(2, '0');
                        _mCursor = _next;
                    }
                    if (window.FinanceService && typeof window.FinanceService.queryTxByPackageMonths === 'function') {
                        txByPackage = await window.FinanceService.queryTxByPackageMonths(_months);
                    } else if (typeof FinanceService !== 'undefined' && typeof FinanceService.queryTxByPackageMonths === 'function') {
                        txByPackage = await FinanceService.queryTxByPackageMonths(_months);
                    }
                } catch (_pkgErr) {
                    console.warn('[ExcelExport] packageMonths query failed (non-blocking):', _pkgErr && _pkgErr.message);
                }
                txAll = window.dedupeDocsById([...txByDate, ...txByMonth, ...txByPackage]);
                txAll.sort((a, b) => a.date > b.date ? 1 : -1);
                invAll = await window.loadInventoryForDateRange({
                    invRef,
                    startDate: startStr,
                    endDate:   endStr,
                    reason:    'excel-export-inventory-range',
                });
                invAll.sort((a, b) => a.date > b.date ? 1 : -1);
            } catch (_paginationErr) {
                console.warn('[ExportPaginationFallback] Paginated helper lỗi, fallback legacy query (limit 2000/1000):', _paginationErr && _paginationErr.message);
                if (typeof window.warnUnsafeLimit === 'function') window.warnUnsafeLimit('excel-export:fallback-legacy', 'paginated-helper-failed');
                const _qs38d = window.__queryScaleMetrics;
                if (_qs38d) _qs38d.exportPaginationFallbackCount = (_qs38d.exportPaginationFallbackCount || 0) + 1;
                const _fbSnap = await getDocs(query(colRef, where("date", ">=", startStr), where("date", "<=", endStr), limit(2000))); // [ExportPaginationFallback]
                txAll = _fbSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const _fbSnapM = await getDocs(query(colRef, where("txMonth", ">=", _startM), where("txMonth", "<=", _endM), limit(2000))); // [ExportPaginationFallback]
                const _fbSeen = new Set(txAll.map(d => d.id));
                _fbSnapM.docs.forEach(d => { if (!_fbSeen.has(d.id)) txAll.push({ id: d.id, ...d.data() }); });
                txAll.sort((a, b) => a.date > b.date ? 1 : -1);
                const _fbInvSnap = await getDocs(query(invRef, where("date", ">=", startStr), where("date", "<=", endStr), limit(1000))); // [ExportPaginationFallback]
                invAll = _fbInvSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                invAll.sort((a, b) => a.date > b.date ? 1 : -1);
            }
            clearTimeout(_paginationToastTimer);

            const wb       = XLSX.utils.book_new();
            const clubName = clubData.clubName || 'CLB';
            const isSingle = clubConfig.branchCount === 1;

            const borderAll  = { top:{style:'thin',color:{rgb:'BBBBBB'}}, bottom:{style:'thin',color:{rgb:'BBBBBB'}}, left:{style:'thin',color:{rgb:'BBBBBB'}}, right:{style:'thin',color:{rgb:'BBBBBB'}} };
            const borderBold = { top:{style:'medium',color:{rgb:'0033A0'}}, bottom:{style:'medium',color:{rgb:'0033A0'}}, left:{style:'medium',color:{rgb:'0033A0'}}, right:{style:'medium',color:{rgb:'0033A0'}} };
            const hdrFill   = { patternType:'solid', fgColor:{rgb:'0033A0'} };
            const subFill   = { patternType:'solid', fgColor:{rgb:'EEF2FF'} };
            const totalFill = { patternType:'solid', fgColor:{rgb:'DCFCE7'} };
            const warnFill  = { patternType:'solid', fgColor:{rgb:'FEF9C3'} };
            const hdrFont   = { bold:true, color:{rgb:'FFFFFF'}, sz:11, name:'Arial' };
            const boldFont  = { bold:true, sz:11, name:'Arial' };
            const normFont  = { sz:11, name:'Arial' };
            const titleFont = { bold:true, sz:14, name:'Arial', color:{rgb:'0033A0'} };
            const centerAlign = { horizontal:'center', vertical:'center', wrapText:true };
            const leftAlign   = { horizontal:'left',   vertical:'center', wrapText:true };
            const rightAlign  = { horizontal:'right',  vertical:'center' };

            const makeCell = (v, font, fill, border, alignment, numFmt) => {
                let c = { v, t: typeof v === 'number' ? 'n' : 's', s: { font: font || normFont, alignment: alignment || leftAlign } };
                if (fill)   c.s.fill   = fill;
                if (border) c.s.border = border;
                if (numFmt) c.s.numFmt = numFmt;
                return c;
            };
            const hc    = (v) => makeCell(v, hdrFont, hdrFill, borderBold, centerAlign);
            const nc    = (v) => makeCell(v, normFont, null, borderAll, leftAlign);
            const bc    = (v) => makeCell(v, boldFont, null, borderAll, leftAlign);
            const rc    = (v) => makeCell(v, normFont, null, borderAll, rightAlign);  // eslint-disable-line no-unused-vars
            const nNum  = (v) => makeCell(Number(v) || 0, normFont, null, borderAll, rightAlign, '#,##0');
            const bNum  = (v) => makeCell(Number(v) || 0, boldFont, null, borderAll, rightAlign, '#,##0');
            const totNum= (v) => makeCell(Number(v) || 0, Object.assign({}, boldFont, {color:{rgb:'166534'}}), totalFill, borderAll, rightAlign, '#,##0');
            const totTxt= (v) => makeCell(v, Object.assign({}, boldFont, {color:{rgb:'166534'}}), totalFill, borderAll, leftAlign);
            const warnTxt=(v) => makeCell(v, Object.assign({}, boldFont, {color:{rgb:'854D0E'}}), warnFill, borderAll, leftAlign);
            const warnNum=(v) => makeCell(Number(v) || 0, Object.assign({}, boldFont, {color:{rgb:'854D0E'}}), warnFill, borderAll, rightAlign, '#,##0');

            const titleRow = (text, cols) => {
                let r = [makeCell(text, titleFont, {patternType:'solid',fgColor:{rgb:'EFF6FF'}}, borderBold, centerAlign)];
                for (let i = 1; i < cols; i++) r.push(makeCell('', normFont, {patternType:'solid',fgColor:{rgb:'EFF6FF'}}, borderBold, centerAlign));
                return r;
            };
            const subRow = (text, cols) => {
                let r = [makeCell(text, boldFont, subFill, borderAll, leftAlign)];
                for (let i = 1; i < cols; i++) r.push(makeCell('', normFont, subFill, borderAll, leftAlign));
                return r;
            };

            // ── SHEET 1: TỔNG QUAN ──────────────────────────────────────────
            let incTuition=0, incExam=0, incOther=0, incUniform=0, expUniform=0, exp=0, expExam=0;
            const _exBCount  = clubConfig.branchCount || 1;
            const _exBIncome = {};
            for (let _ebi = 1; _ebi <= _exBCount; _ebi++) _exBIncome['CS' + _ebi] = 0;
            txAll.forEach(t => {
                const a   = Number(t.amount) || 0;
                const _tb = t.branch || 'CS1';
                // Phase 4K-5E: Bundle — dùng components làm nguồn chính
                if (Array.isArray(t.components) && t.components.length > 0 &&
                    (t.paymentKind === 'bundle' || t.components.length > 1)) {
                    const _acComps = typeof window.expandTransactionComponentsForAccounting === 'function'
                        ? window.expandTransactionComponentsForAccounting(t) : t.components;
                    _acComps.forEach(function(c) {
                        const ca = Number(c.amount || 0);
                        const ck = c.kind || '';
                        if (ck === 'tuition') {
                            let _alloc = ca;
                            if (Array.isArray(c.packageMonths) && c.packageMonths.length > 0) {
                                const _mInPeriod = c.packageMonths.filter(function(pm){ return pm >= _startM && pm <= _endM; });
                                _alloc = _mInPeriod.length > 0 ? Math.round(ca * _mInPeriod.length / c.packageMonths.length) : 0;
                            }
                            incTuition += _alloc;
                            if (_exBIncome[_tb] !== undefined) _exBIncome[_tb] += _alloc;
                        } else if (ck === 'exam') {
                            incExam += ca;
                            if (_exBIncome[_tb] !== undefined) _exBIncome[_tb] += ca;
                        } else if (ck === 'inventory' || ck === 'inventoryDebt') {
                            incUniform += ca;
                            if (_exBIncome[_tb] !== undefined) _exBIncome[_tb] += ca;
                        } else {
                            incOther += ca;
                            if (_exBIncome[_tb] !== undefined) _exBIncome[_tb] += ca;
                        }
                    });
                    return;
                }
                if (t.type === 'Học phí') {
                    // Phase 4K-4G: Phân bổ gói nhiều tháng đúng theo kỳ báo cáo
                    let _allocTuition = a;
                    if (Array.isArray(t.packageMonths) && t.packageMonths.length > 0) {
                        const _mInPeriod = t.packageMonths.filter(pm => pm >= _startM && pm <= _endM);
                        _allocTuition = _mInPeriod.length > 0
                            ? Math.round(a * _mInPeriod.length / t.packageMonths.length)
                            : 0;
                    }
                    incTuition += _allocTuition;
                    if (_exBIncome[_tb] !== undefined) _exBIncome[_tb] += _allocTuition;
                }
                else if (t.type === 'Học phí + Lệ phí thi')  {
                    const _ta = (Number(t.tuitionAmount) || 0) + (Number(t.examAmount) || 0);
                    incTuition += Number(t.tuitionAmount) || 0; incExam += Number(t.examAmount) || 0;
                    if (_exBIncome[_tb] !== undefined) _exBIncome[_tb] += _ta;
                }
                else if (t.type === 'Lệ phí thi')              { incExam    += a; if (_exBIncome[_tb] !== undefined) _exBIncome[_tb] += a; }
                else if (t.type === 'Chi phí')      exp    += a;
                else if (t.type === 'Chi phí kỳ thi') expExam += a;
                else if (t.type === 'Thu khác')     { incOther += a; if (_exBIncome[_tb] !== undefined) _exBIncome[_tb] += a; }
                else {
                    // Phase 4K-4D: Classify inventory (custom categories + backward compat)
                    const _cats = typeof window.getInventoryCategoryNames === 'function'
                        ? window.getInventoryCategoryNames() : ['Võ phục', 'Áo thun', 'Bảo hộ'];
                    const _c = typeof window.classifyInventoryFinanceTx === 'function'
                        ? window.classifyInventoryFinanceTx(t) : _classifyInvTxForReport(t, _cats);
                    if (_c.isInventory) {
                        if      (_c.direction === 'income')  incUniform += a;
                        else if (_c.direction === 'expense') expUniform += a;
                    }
                }
            });
            const totalInc = incTuition + incExam + incOther + incUniform;
            const totalExp = exp + expExam + expUniform;
            const profit   = totalInc - totalExp;

            const ov_rows = [
                titleRow(`BÁO CÁO TỔNG QUAN — ${periodTitle.toUpperCase()} — ${clubName.toUpperCase()}`, 3),
                [makeCell('',normFont,null,null), makeCell('',normFont,null,null), makeCell('',normFont,null,null)],
                [hc('KHOẢN MỤC'), hc('CHI TIẾT'), hc('SỐ TIỀN (VNĐ)')],
                [bc('THU HỌC PHÍ'), nc('Học phí các tháng'), bNum(incTuition)],
                [bc('THU LỆ PHÍ THI'), nc('Kỳ thi thăng đai'), bNum(incExam)],
                [bc('THU VÕ PHỤC'), nc('Bán trang phục'), bNum(incUniform)],
                [bc('THU KHÁC'), nc('Dịch vụ & phát sinh'), bNum(incOther)],
                [totTxt('TỔNG THU'), totTxt(''), totNum(totalInc)],
                [makeCell('',normFont,null,null), makeCell('',normFont,null,null), makeCell('',normFont,null,null)],
                [bc('CHI PHÍ HOẠT ĐỘNG'), nc('Lương, thuê mặt bằng...'), bNum(exp)],
                [bc('CHI PHÍ KỲ THI'), nc('Giám khảo, băng rôn...'), bNum(expExam)],
                [bc('CHI NHẬP VÕ PHỤC'), nc('Mua hàng từ nhà CC'), bNum(expUniform)],
                [warnTxt('TỔNG CHI'), warnTxt(''), warnNum(totalExp)],
                [makeCell('',normFont,null,null), makeCell('',normFont,null,null), makeCell('',normFont,null,null)],
                [makeCell('LỢI NHUẬN RÒNG', Object.assign({},boldFont,{sz:13,color:{rgb:profit>=0?'166534':'991B1B'}}), {patternType:'solid',fgColor:{rgb:profit>=0?'DCFCE7':'FEE2E2'}}, borderBold, centerAlign),
                 makeCell('', normFont, {patternType:'solid',fgColor:{rgb:profit>=0?'DCFCE7':'FEE2E2'}}, borderBold),
                 makeCell(profit, Object.assign({},boldFont,{sz:13,color:{rgb:profit>=0?'166534':'991B1B'}}), {patternType:'solid',fgColor:{rgb:profit>=0?'DCFCE7':'FEE2E2'}}, borderBold, rightAlign, '#,##0')],
            ];
            ov_rows[2][2].s.numFmt = '';
            const _ovMerges = [{s:{r:0,c:0},e:{r:0,c:2}},{s:{r:14,c:0},e:{r:14,c:1}}];
            if (_exBCount > 1) {
                ov_rows.push([makeCell('',normFont,null,null), makeCell('',normFont,null,null), makeCell('',normFont,null,null)]);
                const _brTitleIdx = ov_rows.length;
                ov_rows.push(titleRow('THỐNG KÊ DOANH THU THEO CƠ SỞ', 3));
                ov_rows.push([hc('CƠ SỞ'), hc('DOANH THU (VNĐ)'), hc('VÕ SINH ĐANG TẬP')]);
                for (let _ebi = 1; _ebi <= _exBCount; _ebi++) {
                    const _ebKey  = 'CS' + _ebi;
                    const _ebName = clubConfig['branchName' + _ebi] || ('Cơ sở ' + _ebi);
                    const _ebInc  = _exBIncome[_ebKey] || 0;
                    const _ebAct  = Object.values(allProfiles).filter(p => p.status === 'active' && (p.branch || 'CS1') === _ebKey).length;
                    ov_rows.push([bc(_ebName), bNum(_ebInc), bNum(_ebAct)]);
                }
                _ovMerges.push({s:{r:_brTitleIdx,c:0},e:{r:_brTitleIdx,c:2}});
            }
            const ws_ov = XLSX.utils.aoa_to_sheet(ov_rows);
            ws_ov['!cols']   = [{wch:28},{wch:32},{wch:22}];
            ws_ov['!rows']   = [{hpt:22}];
            ws_ov['!merges'] = _ovMerges;
            XLSX.utils.book_append_sheet(wb, ws_ov, '1. Tong Quan');

            // ── SHEET 2: THU CHI ────────────────────────────────────────────
            const cols2 = isSingle
                ? ['Ngày','Phân loại','Võ sinh / Nội dung','Kỳ T.Thu','Số tiền (VNĐ)']
                : ['Ngày','Cơ sở','Phân loại','Võ sinh / Nội dung','Kỳ T.Thu','Số tiền (VNĐ)'];
            const tx_rows = [
                titleRow(`BẢNG THU CHI — ${periodTitle.toUpperCase()}`, cols2.length),
                cols2.map(hc),
            ];
            let txTotal = 0;
            txAll.filter(t => {
                    // Phase 4K-4D: Exclude ALL inventory transactions (not just Võ phục)
                    const _cats = typeof window.getInventoryCategoryNames === 'function'
                        ? window.getInventoryCategoryNames() : ['Võ phục', 'Áo thun', 'Bảo hộ'];
                    const _c = typeof window.classifyInventoryFinanceTx === 'function'
                        ? window.classifyInventoryFinanceTx(t) : _classifyInvTxForReport(t, _cats);
                    return !_c.isInventory;
                }).forEach(t => {
                const a        = Number(t.amount) || 0;
                const _displayType = typeof window.getFinanceTransactionDisplayType === 'function'
                    ? window.getFinanceTransactionDisplayType(t)
                    : (typeof window.normalizeFinanceTransactionType === 'function' ? window.normalizeFinanceTransactionType(t) : (String(t.type || '').trim() === 'Thu nhập học' ? 'Học phí' : (t.type || '')));
                const isIncome = !String(_displayType || t.type || '').startsWith('Chi');
                const amtCell  = { v:a, t:'n', s:{ font:Object.assign({},normFont,{color:{rgb:isIncome?'166534':'991B1B'},bold:true}), border:borderAll, alignment:rightAlign, numFmt:'#,##0' } };
                const txMonthStr = t.txMonth ? formatMonth(t.txMonth) : (t.date||'').substring(0,7).split('-').reverse().join('/');
                if (isSingle) tx_rows.push([nc(formatDate(t.date)), nc(_displayType||''), nc(t.description||''), nc(txMonthStr), amtCell]);
                else          tx_rows.push([nc(formatDate(t.date)), nc(_branchName(t.branch)), nc(_displayType||''), nc(t.description||''), nc(txMonthStr), amtCell]);
                if (isIncome) txTotal += a; else txTotal -= a;
            });
            const totRow2 = isSingle
                ? [totTxt('TỔNG'), totTxt(''), totTxt(''), totTxt(''), totNum(txTotal)]
                : [totTxt('TỔNG'), totTxt(''), totTxt(''), totTxt(''), totTxt(''), totNum(txTotal)];
            tx_rows.push(totRow2);
            const ws_tx = XLSX.utils.aoa_to_sheet(tx_rows);
            ws_tx['!cols']   = isSingle ? [{wch:12},{wch:22},{wch:32},{wch:12},{wch:18}]
                                        : [{wch:12},{wch:14},{wch:22},{wch:32},{wch:12},{wch:18}];
            ws_tx['!merges'] = [{s:{r:0,c:0},e:{r:0,c:cols2.length-1}}];
            XLSX.utils.book_append_sheet(wb, ws_tx, '2. Thu Chi');

            // ── SHEET 3: DANH SÁCH VÕ SINH ──────────────────────────────────
            const stu_rows = [
                titleRow(`DANH SÁCH VÕ SINH ĐANG TẬP — ${clubName.toUpperCase()}`, isSingle ? 7 : 8),
                (isSingle
                    ? ['STT','Họ và Tên','Mã HV','Cấp đai','Ngày sinh','SĐT','Đã đóng tới','Học phí/Tháng']
                    : ['STT','Họ và Tên','Mã HV','Cơ sở','Cấp đai','Ngày sinh','SĐT','Đã đóng tới','Học phí/Tháng']
                ).map(hc),
            ];
            let stt = 1;
            Object.keys(allProfiles).sort().forEach(name => {
                const p = allProfiles[name];
                if (p.status !== 'active') return;
                const row = isSingle
                    ? [nc(String(stt++)), bc(name), nc(p.memberId||'-'), nc(p.belt||''), nc(p.dob||''), nc(p.phone||''), nc(p.paidUntil ? formatMonth(p.paidUntil) : ''), nNum(p.tuitionFee||0)]
                    : [nc(String(stt++)), bc(name), nc(p.memberId||'-'), nc(_branchName(p.branch)), nc(p.belt||''), nc(p.dob||''), nc(p.phone||''), nc(p.paidUntil ? formatMonth(p.paidUntil) : ''), nNum(p.tuitionFee||0)];
                stu_rows.push(row);
            });
            const ws_stu = XLSX.utils.aoa_to_sheet(stu_rows);
            ws_stu['!cols']   = isSingle ? [{wch:5},{wch:28},{wch:14},{wch:24},{wch:14},{wch:14},{wch:14},{wch:16}]
                                         : [{wch:5},{wch:28},{wch:14},{wch:14},{wch:24},{wch:14},{wch:14},{wch:14},{wch:16}];
            ws_stu['!merges'] = [{s:{r:0,c:0},e:{r:0,c:isSingle?7:8}}];
            XLSX.utils.book_append_sheet(wb, ws_stu, '3. Danh Sach Vo Sinh');

            // ── SHEET 4: KHO VÕ PHỤC ────────────────────────────────────────
            const inv_rows = [
                titleRow(`KHO VÕ PHỤC — ${periodTitle.toUpperCase()}`, 5),
                ['Ngày','Size','Loại','Người giao dịch','SL','Thành tiền (VNĐ)'].map(hc),
            ];
            let invIn = 0, invOut = 0;
            invAll.forEach(t => {
                const isImport = t.type === 'Nhập kho';
                const a = Number(t.amount) || 0;
                if (isImport) invOut += a; else invIn += a;
                const amtCell = { v:a, t:'n', s:{ font:Object.assign({},normFont,{color:{rgb:isImport?'991B1B':'166534'},bold:true}), border:borderAll, alignment:rightAlign, numFmt:'#,##0' } };
                inv_rows.push([nc(formatDate(t.date)), nc(t.size||''), nc(t.type||''), nc(t.desc||''), nc(String(t.qty||1)), amtCell]);
            });
            inv_rows.push([totTxt('TỔNG THU BÁN'), totTxt(''), totTxt(''), totTxt(''), totTxt(''), totNum(invIn)]);
            inv_rows.push([warnTxt('TỔNG CHI NHẬP'), warnTxt(''), warnTxt(''), warnTxt(''), warnTxt(''), warnNum(invOut)]);
            inv_rows.push([
                makeCell('LỢI NHUẬN KHO', Object.assign({},boldFont,{color:{rgb:invIn-invOut>=0?'166534':'991B1B'}}), {patternType:'solid',fgColor:{rgb:invIn-invOut>=0?'DCFCE7':'FEE2E2'}}, borderBold, leftAlign),
                makeCell('', normFont, {patternType:'solid',fgColor:{rgb:invIn-invOut>=0?'DCFCE7':'FEE2E2'}}, borderAll),
                makeCell('', normFont, {patternType:'solid',fgColor:{rgb:invIn-invOut>=0?'DCFCE7':'FEE2E2'}}, borderAll),
                makeCell('', normFont, {patternType:'solid',fgColor:{rgb:invIn-invOut>=0?'DCFCE7':'FEE2E2'}}, borderAll),
                makeCell('', normFont, {patternType:'solid',fgColor:{rgb:invIn-invOut>=0?'DCFCE7':'FEE2E2'}}, borderAll),
                makeCell(invIn - invOut, Object.assign({},boldFont,{color:{rgb:invIn-invOut>=0?'166534':'991B1B'}}), {patternType:'solid',fgColor:{rgb:invIn-invOut>=0?'DCFCE7':'FEE2E2'}}, borderBold, rightAlign, '#,##0'),
            ]);
            const ws_inv = XLSX.utils.aoa_to_sheet(inv_rows);
            ws_inv['!cols']   = [{wch:12},{wch:12},{wch:14},{wch:28},{wch:6},{wch:20}];
            ws_inv['!merges'] = [{s:{r:0,c:0},e:{r:0,c:5}},{s:{r:inv_rows.length-1,c:0},e:{r:inv_rows.length-1,c:4}}];
            XLSX.utils.book_append_sheet(wb, ws_inv, '4. Kho Vo Phuc');

            // ── SHEET 5: DANH SÁCH NỢ ───────────────────────────────────────
            const selMonth = document.getElementById('filterMonth').value;
            const debt_rows = [
                titleRow(`BÁO CÁO NỢ HỌC PHÍ — ${periodTitle.toUpperCase()}`, isSingle ? 4 : 5),
                (isSingle
                    ? ['Họ và Tên','Số tháng nợ','Học phí/Tháng','Ước tính nợ (VNĐ)']
                    : ['Họ và Tên','Cơ sở','Số tháng nợ','Học phí/Tháng','Ước tính nợ (VNĐ)']
                ).map(hc),
            ];
            let totalDebt = 0;
            const _debtSelectedMonth = normalizeYYYYMM(selMonth);
            const _reportChargeableMonths = function(profile) {
                if (typeof window !== 'undefined' && typeof window.getChargeableTuitionMonths === 'function') {
                    return window.getChargeableTuitionMonths(profile, _debtSelectedMonth, { reason: 'excel-report-debt-sheet' });
                }
                const pp = profile || {};
                if (!_debtSelectedMonth || pp.feeExempt === true) return [];
                const skipped = Array.isArray(pp.skippedMonths) ? pp.skippedMonths.map(normalizeYYYYMM).filter(Boolean) : [];
                const paidMonths = Array.isArray(pp.paidMonths) ? pp.paidMonths.map(normalizeYYYYMM).filter(Boolean) : [];
                const paidUntil = normalizeYYYYMM(pp.paidUntil || '');
                let cur = paidUntil ? addMonthsToYYYYMM(paidUntil, 1) : (normalizeYYYYMM(pp.admissionDate || pp.joinDate || pp.joinedAt || pp.createdAt || pp.enrollDate || _debtSelectedMonth) || _debtSelectedMonth);
                const out = [];
                let guard = 0;
                while (cur && cur <= _debtSelectedMonth && guard < 36) {
                    if (!skipped.includes(cur) && !paidMonths.includes(cur)) out.push(cur);
                    cur = addMonthsToYYYYMM(cur, 1);
                    guard++;
                }
                if (pp.isOwed === true && Array.isArray(pp.owedMonths)) {
                    pp.owedMonths.map(normalizeYYYYMM).filter(Boolean).forEach(m => {
                        if (m <= _debtSelectedMonth && !skipped.includes(m) && !paidMonths.includes(m) && !out.includes(m)) out.push(m);
                    });
                    out.sort();
                }
                return out;
            };
            Object.keys(allProfiles).sort().forEach(name => {
                const p = allProfiles[name] || {};
                const kind = typeof window !== 'undefined' && typeof window.classifyProfileStatus === 'function'
                    ? window.classifyProfileStatus(p)
                    : (p.status === 'quit' || p.active === false || p.isActive === false ? 'quit' : 'active');
                if (kind !== 'active') return;
                if (p.feeExempt) return;
                const owedMonths = _reportChargeableMonths(p);
                const months = owedMonths.length;
                if (months <= 0) return;
                const debt = months * (Number(p.tuitionFee) || 0);
                totalDebt += debt;
                const monthsLabel = `${months} tháng` + (owedMonths.length ? ` (${formatMonthCompact(owedMonths.join(','))})` : '');
                const row = isSingle
                    ? [bc(name), nc(monthsLabel), nNum(p.tuitionFee||0), warnNum(debt)]
                    : [bc(name), nc(_branchName(p.branch)), nc(monthsLabel), nNum(p.tuitionFee||0), warnNum(debt)];
                debt_rows.push(row);
            });
            const debtCols  = isSingle ? 4 : 5;
            const totDebtRow = isSingle
                ? [totTxt('TỔNG DỰ THU'), totTxt(''), totTxt(''), totNum(totalDebt)]
                : [totTxt('TỔNG DỰ THU'), totTxt(''), totTxt(''), totTxt(''), totNum(totalDebt)];
            debt_rows.push(totDebtRow);
            const ws_debt = XLSX.utils.aoa_to_sheet(debt_rows);
            ws_debt['!cols']   = isSingle ? [{wch:28},{wch:14},{wch:16},{wch:20}]
                                           : [{wch:28},{wch:14},{wch:14},{wch:16},{wch:20}];
            ws_debt['!merges'] = [{s:{r:0,c:0},e:{r:0,c:debtCols-1}}];
            XLSX.utils.book_append_sheet(wb, ws_debt, '5. Bao Cao No');

            // ── SHEET 6: THI ĐAI ────────────────────────────────────────────
            let paidExamStudents = {};
            txAll.forEach(t => {
                if (t.type === 'Lệ phí thi' || t.type === 'Học phí + Lệ phí thi') {
                    const stuName = typeof window.extractExamStudentName === 'function'
                        ? window.extractExamStudentName(t)
                        : (function(tx) {
                            const desc = String(tx.description || '').trim();
                            const m = desc.match(/^(.*?)\s*\(Thi lên/i);
                            return m ? m[1].trim() : desc.split(' (')[0].trim();
                        })(t);
                    if (!stuName) return;
                    const _ep = allProfiles[stuName] || {};
                    const belt = typeof window.getExamTargetBeltFromTx === 'function'
                        ? window.getExamTargetBeltFromTx(t, _ep)
                        : (t.examTitle || '');
                    paidExamStudents[stuName] = {
                        amount: t.type === 'Học phí + Lệ phí thi' ? t.examAmount : t.amount,
                        belt
                    };
                }
            });
            const exam_rows = [
                titleRow(`DANH SÁCH VÕ SINH KỲ THI — ${periodTitle.toUpperCase()}`, isSingle ? 5 : 6),
                (isSingle
                    ? ['STT','Họ và Tên','Mã HV','Cấp đai','Đăng ký thi lên','Trạng thái phí']
                    : ['STT','Họ và Tên','Mã HV','Cơ sở','Cấp đai','Đăng ký thi lên','Trạng thái phí']
                ).map(hc),
            ];
            let stt2 = 1;
            Object.keys(paidExamStudents).sort().forEach(name => {
                const p    = allProfiles[name] || {};
                const paid = paidExamStudents[name];
                const paidCell = { v:`Đã nộp (${Number(paid.amount||0).toLocaleString()} đ)`, t:'s', s:{ font:Object.assign({},boldFont,{color:{rgb:'166534'}}), fill:{patternType:'solid',fgColor:{rgb:'DCFCE7'}}, border:borderAll, alignment:leftAlign } };
                const row = isSingle
                    ? [nc(String(stt2++)), bc(name), nc(p.memberId||'-'), nc(p.belt||''), nc(paid.belt||''), paidCell]
                    : [nc(String(stt2++)), bc(name), nc(p.memberId||'-'), nc(_branchName(p.branch)), nc(p.belt||''), nc(paid.belt||''), paidCell];
                exam_rows.push(row);
            });
            const ws_exam = XLSX.utils.aoa_to_sheet(exam_rows);
            ws_exam['!cols']   = isSingle ? [{wch:5},{wch:28},{wch:14},{wch:24},{wch:24},{wch:22}]
                                           : [{wch:5},{wch:28},{wch:14},{wch:14},{wch:24},{wch:24},{wch:22}];
            ws_exam['!merges'] = [{s:{r:0,c:0},e:{r:0,c:isSingle?5:6}}];
            XLSX.utils.book_append_sheet(wb, ws_exam, '6. Ket Qua Thi Dai');

            const fileName = `BaoCao_${clubName.replace(/\s/g,'_')}_${pLabel.replace(/\s/g,'_')}_${year}.xlsx`;
            XLSX.writeFile(wb, fileName);
            document.getElementById('toastMessage').classList.remove('show');
            window.showToast(`✅ Đã xuất file: ${fileName}`);
            // Phase 4.0A-2: Record duration
            window.__reportsModuleMetrics.lastExportDurationMs = Date.now() - _excelStartMs;
            window.__reportsModuleMetrics.lastError = null;
            document.getElementById('excelExportModal').style.display = 'none';
        } catch (err) {
            console.error(err);
            // Phase 4.0A-2: Record error
            window.__reportsModuleMetrics.lastError = err ? err.message : 'unknown';
            window.__reportsModuleMetrics.lastExportDurationMs = Date.now() - _excelStartMs;
            document.getElementById('toastMessage').classList.remove('show');
            window.showToast('❌ Lỗi xuất Excel: ' + err.message);
        }
    };

    // ════════════════════════════════════════════════════════════
    // 3. exportAchievementsExcel — Xuất thành tích thi đấu
    // ════════════════════════════════════════════════════════════

    window.exportAchievementsExcel = async () => {
        await window.ensureXlsxReady?.('reports-achievements-export');
        if (typeof window.ensureAllProfilesForExport === 'function') {
            await window.ensureAllProfilesForExport('export-achievements');
        } else if (typeof window.loadQuitProfilesIfNeeded === 'function') {
        // Phase 4.0A-2: Metrics
        const _achStartMs = Date.now();
        window.__reportsModuleMetrics.achievementExportCalls++;
        window.__reportsModuleMetrics.lastExportType = 'achievement';
            await window.loadQuitProfilesIfNeeded('export-achievements-needs-quit');
        }
        const allProfiles = _profiles();
        const clubConfig  = _config();
        const clubName    = clubConfig.clubName || 'CLB Taekwondo';
        const isSingle    = clubConfig.branchCount === 1;
        const XLSX        = _XLSX();

        const allAch = [];
        Object.keys(allProfiles).sort().forEach(name => {
            const p = allProfiles[name];
            if (!p.achievements || p.achievements.length === 0) return;
            p.achievements.forEach(a => {
                allAch.push({ name, branch: p.branch || 'CS1', belt: p.belt || '', year: a.year, tournament: a.tournament, result: a.result });
            });
        });
        if (allAch.length === 0) return alert('Chưa có thành tích nào được ghi nhận trong hệ thống!');

        const byYear = {};
        allAch.forEach(a => { if (!byYear[a.year]) byYear[a.year] = []; byYear[a.year].push(a); });
        const years = Object.keys(byYear).sort((a, b) => b - a);

        const getMedalType = (result) => {
            const s = (result || '').toLowerCase();
            if (/hcv|huy ch.{0,4}ng v.{0,3}ng|gi.{0,3}i nh.{0,3}t|h.{0,3}ng nh.{0,3}t|\bnhất\b|gold|\b1st\b/.test(s)) return 'HCV';
            if (/hcb|huy ch.{0,4}ng b.{0,3}c|gi.{0,3}i nh.{0,3}\b|h.{0,3}ng nh.{0,3}\b|\bnhì\b|silver|\b2nd\b/.test(s)) return 'HCB';
            if (/hcđ|hcd|huy ch.{0,4}ng .{0,3}ng|gi.{0,3}i ba|h.{0,3}ng ba|\bba\b|bronze|\b3rd\b/.test(s)) return 'HCĐ';
            return 'other';
        };

        const wb = XLSX.utils.book_new();

        const bAll  = { top:{style:'thin',color:{rgb:'BBBBBB'}}, bottom:{style:'thin',color:{rgb:'BBBBBB'}}, left:{style:'thin',color:{rgb:'BBBBBB'}}, right:{style:'thin',color:{rgb:'BBBBBB'}} };
        const bBold = { top:{style:'medium',color:{rgb:'0033A0'}}, bottom:{style:'medium',color:{rgb:'0033A0'}}, left:{style:'medium',color:{rgb:'0033A0'}}, right:{style:'medium',color:{rgb:'0033A0'}} };
        const bRed  = { top:{style:'medium',color:{rgb:'C8102E'}}, bottom:{style:'medium',color:{rgb:'C8102E'}}, left:{style:'medium',color:{rgb:'C8102E'}}, right:{style:'medium',color:{rgb:'C8102E'}} };
        const bGold = { top:{style:'medium',color:{rgb:'B45309'}}, bottom:{style:'medium',color:{rgb:'B45309'}}, left:{style:'medium',color:{rgb:'B45309'}}, right:{style:'medium',color:{rgb:'B45309'}} };

        const fTitle = { bold:true, sz:15, name:'Arial', color:{rgb:'0033A0'} };
        const fSub   = { bold:true, sz:11, name:'Arial', color:{rgb:'334155'} };
        const fHdr   = { bold:true, sz:11, name:'Arial', color:{rgb:'FFFFFF'} };
        const fYear  = { bold:true, sz:12, name:'Arial', color:{rgb:'FFFFFF'} };
        const fBold  = { bold:true, sz:11, name:'Arial' };
        const fNorm  = { sz:11, name:'Arial' };
        const fGreen = { bold:true, sz:11, name:'Arial', color:{rgb:'166534'} };
        const fHCV   = { bold:true, sz:11, name:'Arial', color:{rgb:'78350F'} };
        const fHCB   = { bold:true, sz:11, name:'Arial', color:{rgb:'1E3A5F'} };
        const fHCĐ   = { bold:true, sz:11, name:'Arial', color:{rgb:'7C2D12'} };
        const fOther = { bold:true, sz:11, name:'Arial', color:{rgb:'4C1D95'} };

        const aCenter = { horizontal:'center', vertical:'center', wrapText:true };
        const aLeft   = { horizontal:'left',   vertical:'center', wrapText:true };

        const fillTitle  = { patternType:'solid', fgColor:{rgb:'EFF6FF'} };
        const fillBlue   = { patternType:'solid', fgColor:{rgb:'DBEAFE'} };
        const fillHdr    = { patternType:'solid', fgColor:{rgb:'0033A0'} };
        const fillYear   = { patternType:'solid', fgColor:{rgb:'C8102E'} };
        const fillEven   = { patternType:'solid', fgColor:{rgb:'F8FAFC'} };  // eslint-disable-line no-unused-vars
        const fillGreen  = { patternType:'solid', fgColor:{rgb:'DCFCE7'} };
        const fillHCV    = { patternType:'solid', fgColor:{rgb:'FEF08A'} };
        const fillHCB    = { patternType:'solid', fgColor:{rgb:'E2E8F0'} };
        const fillHCĐ    = { patternType:'solid', fgColor:{rgb:'FDBA74'} };
        const fillOther  = { patternType:'solid', fgColor:{rgb:'EDE9FE'} };
        const fillSumHCV = { patternType:'solid', fgColor:{rgb:'FDE047'} };
        const fillSumHCB = { patternType:'solid', fgColor:{rgb:'CBD5E1'} };
        const fillSumHCĐ = { patternType:'solid', fgColor:{rgb:'FB923C'} };

        const medalStyle = (type) => {
            if (type === 'HCV') return { font: fHCV, fill: fillHCV };
            if (type === 'HCB') return { font: fHCB, fill: fillHCB };
            if (type === 'HCĐ') return { font: fHCĐ, fill: fillHCĐ };
            return { font: fOther, fill: fillOther };
        };
        const medalIcon = (type) => type === 'HCV' ? '🥇' : type === 'HCB' ? '🥈' : type === 'HCĐ' ? '🥉' : '🏅';

        const mc = (v, font, fill, border, align) => {
            const c = { v, t: typeof v === 'number' ? 'n' : 's', s: { font: font || fNorm, alignment: align || aLeft } };
            if (fill)   c.s.fill   = fill;
            if (border) c.s.border = border;
            return c;
        };

        const numCols   = isSingle ? 5 : 6;
        const colHeaders = isSingle
            ? ['STT','Họ và Tên','Cấp Đai','Tên Giải Đấu','Kết Quả / Giải Thưởng']
            : ['STT','Họ và Tên','Cơ Sở','Cấp Đai','Tên Giải Đấu','Kết Quả / Giải Thưởng'];
        const colWidths = isSingle
            ? [{wch:6},{wch:28},{wch:24},{wch:38},{wch:26}]
            : [{wch:6},{wch:28},{wch:14},{wch:24},{wch:38},{wch:26}];
        const now     = new Date();
        const dateStr = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;

        const mkTitle   = (txt, cols) => { const r=[mc(txt,fTitle,fillTitle,bBold,aCenter)]; for(let i=1;i<cols;i++) r.push(mc('',fNorm,fillTitle,bBold,aCenter)); return r; };
        const mkSub     = (txt, cols) => { const r=[mc(txt,fSub,fillBlue,bAll,aCenter)];    for(let i=1;i<cols;i++) r.push(mc('',fNorm,fillBlue,bAll,aCenter)); return r; };
        const mkYearHdr = (txt, cols) => { const r=[mc(txt,fYear,fillYear,bRed,aLeft)];     for(let i=1;i<cols;i++) r.push(mc('',fYear,fillYear,bRed,aLeft)); return r; };
        const mkTotRow  = (txt, cols) => { const r=[mc(txt,fGreen,fillGreen,bAll,aLeft)];   for(let i=1;i<cols;i++) r.push(mc('',fGreen,fillGreen,bAll,aLeft)); return r; };  // eslint-disable-line no-unused-vars
        const mkMedRow  = (nHCV, nHCB, nHCĐ, cols) => {
            const cells = [
                mc(`🥇 HCV: ${nHCV}`, fHCV, fillSumHCV, bGold, aCenter),
                mc(`🥈 HCB: ${nHCB}`, fHCB, fillSumHCB, bAll, aCenter),
                mc(`🥉 HCĐ: ${nHCĐ}`, fHCĐ, fillSumHCĐ, bAll, aCenter),
            ];
            while (cells.length < cols) cells.push(mc('', fNorm, fillGreen, bAll, aCenter));
            return cells;
        };

        let totalHCV = 0, totalHCB = 0, totalHCĐ = 0;
        allAch.forEach(a => { const t = getMedalType(a.result); if(t==='HCV') totalHCV++; else if(t==='HCB') totalHCB++; else if(t==='HCĐ') totalHCĐ++; });

        // ── SHEET 1: TỔNG HỢP TẤT CẢ NĂM ──────────────────────────────
        const allRows = [];
        allRows.push(mkTitle(`🏆 BẢNG THÀNH TÍCH THI ĐẤU — ${clubName.toUpperCase()}`, numCols));
        allRows.push(mkSub(`Ngày xuất: ${dateStr}   |   Tổng: ${allAch.length} thành tích  |  ${years.length} năm thi đấu`, numCols));
        allRows.push(mkMedRow(totalHCV, totalHCB, totalHCĐ, numCols));
        allRows.push(new Array(numCols).fill(mc('')));

        const merges = [
            {s:{r:0,c:0},e:{r:0,c:numCols-1}},
            {s:{r:1,c:0},e:{r:1,c:numCols-1}},
        ];
        let rowIdx = 4;
        let globalStt = 1;

        years.forEach(year => {
            let yHCV=0, yHCB=0, yHCĐ=0;
            byYear[year].forEach(a => { const t=getMedalType(a.result); if(t==='HCV') yHCV++; else if(t==='HCB') yHCB++; else if(t==='HCĐ') yHCĐ++; });

            allRows.push(mkYearHdr(`  NĂM ${year}   —   ${byYear[year].length} thành tích   🥇${yHCV}  🥈${yHCB}  🥉${yHCĐ}`, numCols));
            merges.push({s:{r:rowIdx,c:0},e:{r:rowIdx,c:numCols-1}});
            rowIdx++;

            allRows.push(colHeaders.map(h => mc(h, fHdr, fillHdr, bAll, aCenter)));
            rowIdx++;

            byYear[year].forEach((a) => {
                const mType = getMedalType(a.result);
                const { font: mFont, fill: mFill } = medalStyle(mType);
                const resultLabel    = `${medalIcon(mType)} ${a.result}`;
                const branchDisplay  = _branchName(a.branch);
                const row = isSingle
                    ? [mc(String(globalStt++),fNorm,null,bAll,aCenter), mc(a.name,fBold,null,bAll,aLeft), mc(a.belt,fNorm,null,bAll,aLeft), mc(a.tournament,fNorm,null,bAll,aLeft), mc(resultLabel,mFont,mFill,bAll,aCenter)]
                    : [mc(String(globalStt++),fNorm,null,bAll,aCenter), mc(a.name,fBold,null,bAll,aLeft), mc(branchDisplay,fNorm,null,bAll,aCenter), mc(a.belt,fNorm,null,bAll,aLeft), mc(a.tournament,fNorm,null,bAll,aLeft), mc(resultLabel,mFont,mFill,bAll,aCenter)];
                allRows.push(row);
                rowIdx++;
            });

            allRows.push(mkMedRow(yHCV, yHCB, yHCĐ, numCols));
            merges.push({s:{r:rowIdx,c:3},e:{r:rowIdx,c:numCols-1}});
            rowIdx++;

            allRows.push(new Array(numCols).fill(mc('')));
            rowIdx++;
        });

        const ws_all = XLSX.utils.aoa_to_sheet(allRows);
        ws_all['!cols']   = colWidths;
        ws_all['!merges'] = merges;
        ws_all['!rows']   = [{hpt:30},{hpt:20},{hpt:22}];
        XLSX.utils.book_append_sheet(wb, ws_all, 'Tong Hop');

        // ── SHEET MỖI NĂM RIÊNG ─────────────────────────────────────────
        years.forEach(year => {
            let yHCV=0, yHCB=0, yHCĐ=0;
            byYear[year].forEach(a => { const t=getMedalType(a.result); if(t==='HCV') yHCV++; else if(t==='HCB') yHCB++; else if(t==='HCĐ') yHCĐ++; });

            const yrRows = [];
            yrRows.push(mkTitle(`🏆 BẢNG THÀNH TÍCH NĂM ${year} — ${clubName.toUpperCase()}`, numCols));
            yrRows.push(mkSub(`Ngày in: ${dateStr}   |   ${byYear[year].length} thành tích năm ${year}`, numCols));
            yrRows.push(mkMedRow(yHCV, yHCB, yHCĐ, numCols));
            yrRows.push(colHeaders.map(h => mc(h, fHdr, fillHdr, bAll, aCenter)));

            byYear[year].forEach((a, idx) => {
                const mType = getMedalType(a.result);
                const { font: mFont, fill: mFill } = medalStyle(mType);
                const resultLabel   = `${medalIcon(mType)} ${a.result}`;
                const branchDisplay = _branchName(a.branch);
                const row = isSingle
                    ? [mc(String(idx+1),fNorm,null,bAll,aCenter), mc(a.name,fBold,null,bAll,aLeft), mc(a.belt,fNorm,null,bAll,aLeft), mc(a.tournament,fNorm,null,bAll,aLeft), mc(resultLabel,mFont,mFill,bAll,aCenter)]
                    : [mc(String(idx+1),fNorm,null,bAll,aCenter), mc(a.name,fBold,null,bAll,aLeft), mc(branchDisplay,fNorm,null,bAll,aCenter), mc(a.belt,fNorm,null,bAll,aLeft), mc(a.tournament,fNorm,null,bAll,aLeft), mc(resultLabel,mFont,mFill,bAll,aCenter)];
                yrRows.push(row);
            });

            yrRows.push(mkMedRow(yHCV, yHCB, yHCĐ, numCols));

            const ws_yr = XLSX.utils.aoa_to_sheet(yrRows);
            ws_yr['!cols']   = colWidths;
            ws_yr['!merges'] = [
                {s:{r:0,c:0},e:{r:0,c:numCols-1}},
                {s:{r:1,c:0},e:{r:1,c:numCols-1}},
                {s:{r:2,c:3},e:{r:2,c:numCols-1}},
                {s:{r:yrRows.length-1,c:3},e:{r:yrRows.length-1,c:numCols-1}},
            ];
            ws_yr['!rows'] = [{hpt:30},{hpt:18},{hpt:22}];
            XLSX.utils.book_append_sheet(wb, ws_yr, `Nam_${year}`);
        });

        const fileName = `ThanhTich_${clubName.replace(/\s/g,'_')}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        window.showToast(`✅ Đã xuất: ${fileName}  🥇${totalHCV} HCV  🥈${totalHCB} HCB  🥉${totalHCĐ} HCĐ`);
        // Phase 4.0A-2: Record duration
        window.__reportsModuleMetrics.lastExportDurationMs = Date.now() - _achStartMs;
        window.__reportsModuleMetrics.lastError = null;
    };

    // ════════════════════════════════════════════════════════════
    // 4. exportExamPaidList — Xuất danh sách đăng ký thi lên đai
    // ════════════════════════════════════════════════════════════

    window.exportExamPaidList = async () => {
        await window.ensureXlsxReady?.('reports-export-exam-paid-list');
        // Phase 4.0A-2: Metrics
        const _examStartMs = Date.now();
        window.__reportsModuleMetrics.examPaidExportCalls++;
        window.__reportsModuleMetrics.lastExportType = 'exam-paid';
        const selMonth    = document.getElementById('filterMonth').value;
        // Phase 4.0A-4: Dual-source load (txMonth + date range) + dedupe by document id
        // Helper: manual dedupe by document id as fallback
        const _manualDedupeById = (docs) => {
            const _seen = new Set();
            return docs.filter(d => {
                const _id = (d && (d.id || d._id || (d.ref && d.ref.id)));
                if (!_id) return true;
                if (_seen.has(_id)) return false;
                _seen.add(_id);
                return true;
            });
        };

        // Compute startDate / endDate from selMonth (YYYY-MM)
        const [_epY, _epM] = (selMonth || '').split('-').map(Number);
        const _startDate = selMonth ? `${selMonth}-01` : '';
        const _endDate   = (selMonth && _epY && _epM)
            ? `${String(_epY).padStart(4,'0')}-${String(_epM).padStart(2,'0')}-${String(new Date(_epY, _epM, 0).getDate()).padStart(2,'0')}`
            : '';

        let allTransactions = [];
        let _txMonthCount = 0, _dateCount = 0;
        try {
            const _txColRef = _colRef();
            let _txByMonth = [], _txByDate = [];

            // Source 1: query by txMonth field
            if (typeof window.loadTransactionsForTxMonthRange === 'function') {
                _txByMonth = await window.loadTransactionsForTxMonthRange({
                    colRef:     _txColRef,
                    startMonth: selMonth,
                    endMonth:   selMonth,
                    reason:     'exam-paid-export-txMonth',
                });
                _txMonthCount = _txByMonth.length;
            }

            // Source 2: query by date field (catches docs missing txMonth)
            if (typeof window.loadTransactionsForDateRange === 'function' && _startDate && _endDate) {
                _txByDate = await window.loadTransactionsForDateRange({
                    colRef:    _txColRef,
                    startDate: _startDate,
                    endDate:   _endDate,
                    reason:    'exam-paid-export-date',
                });
                _dateCount = _txByDate.length;
            }

            // Merge + dedupe by document id
            const _combined = [..._txByMonth, ..._txByDate];
            allTransactions = typeof window.dedupeDocsById === 'function'
                ? window.dedupeDocsById(_combined)
                : _manualDedupeById(_combined);

            if (window.__reportsModuleMetrics) {
                window.__reportsModuleMetrics.examPaidPaginatedLoadUsed++;
                window.__reportsModuleMetrics.examPaidTxMonthDocs = _txMonthCount;
                window.__reportsModuleMetrics.examPaidDateDocs    = _dateCount;
                window.__reportsModuleMetrics.examPaidDedupeDocs  = allTransactions.length;
            }
            console.debug('[ReportsModule] examPaidList load: txMonth=', _txMonthCount, 'date=', _dateCount, 'deduped=', allTransactions.length);
        } catch (_txErr) {
            console.warn('[ReportsModule] exportExamPaidList paginated load failed, fallback:', _txErr && _txErr.message);
            if (window.__reportsModuleMetrics)
                window.__reportsModuleMetrics.examPaidFallbackTransactionsUsed++;
            allTransactions = [];
        }
        if (!allTransactions || allTransactions.length === 0) {
            allTransactions = _transactions();
            if (window.__reportsModuleMetrics)
                window.__reportsModuleMetrics.examPaidFallbackTransactionsUsed++;
        }
        const allProfiles = _profiles();
        const clubConfig  = _config();
        const clubData    = _clubData();
        const XLSX        = _XLSX();

        // Phase 4K-4H: helper fallbacks (nếu chưa có trên window)
        function _fallbackExtractName(t) {
            const desc = String(t.description || '').trim();
            const m = desc.match(/^(.*?)\s*\(Thi lên\s*.*?\)/i);
            if (m && m[1]) return m[1].trim();
            const m2 = desc.match(/^(.*?)\s*\(Thi\s+.*?\)/i);
            if (m2 && m2[1]) return m2[1].trim();
            const m3 = desc.match(/^(.*?)\s*\([^)]*\)\s*$/);
            if (m3 && m3[1]) return m3[1].trim();
            return desc;
        }
        function _fallbackGetTargetBelt(t, p) {
            const desc = String(t.description || '');
            const m = desc.match(/(Thi lên\s*(.*?))\s*\)?$/i);
            if (m && m[1]) return m[1].trim();
            return t.examTitle || 'Kỳ thi';
        }

        // Phase 4K-5C: Dùng canonical ledger nếu có — đảm bảo dedupe nhất quán với UI
        let paidData = {};
        try {
        if (typeof window.buildCanonicalExamPaymentLedger === 'function') {
            // Inject loaded transactions tạm thời vào __store để ledger đọc được
            const _prevTxs = (window.__store || {}).transactions;
            if (!window.__store) window.__store = {};
            window.__store.transactions = allTransactions;

            const _ledger = window.buildCanonicalExamPaymentLedger({ month: selMonth });

            // Restore transactions
            if (_prevTxs !== undefined) window.__store.transactions = _prevTxs;
            else delete window.__store.transactions;

            _ledger.records.forEach(r => {
                const profile = allProfiles[r.studentName] || {};
                const targetBelt = r.targetBelt
                    || (typeof window.getExamTargetBeltFromTx === 'function' ? window.getExamTargetBeltFromTx(r.sourceTx, profile) : _fallbackGetTargetBelt(r.sourceTx || {}, profile));
                paidData[r.studentName] = {
                    targetBelt,
                    amount: Number(r.amount || 0),
                    branch: r.branch || (r.sourceTx && r.sourceTx.branch) || profile.branch || 'CS1',
                    txId: r.txId || (r.sourceTx && r.sourceTx.id) || '',
                    timestamp: Number(r.timestamp || (r.sourceTx && r.sourceTx.timestamp) || 0),
                    sourceType: r.txType || '',
                    profileFound: !!profile
                };
            });
        } else {
            // Fallback: dùng raw transactions nếu canonical ledger chưa có
            allTransactions.forEach(t => {
                if ((t.type === 'Lệ phí thi' || t.type === 'Học phí + Lệ phí thi') && (t.txMonth === selMonth || (t.date && t.date.startsWith(selMonth)))) {
                    if (t.examPaidCancelled === true) return;
                    const feeAmt = t.type === 'Học phí + Lệ phí thi' ? Number(t.examAmount || 0) : Number(t.amount || 0);
                    if (feeAmt <= 0) return;
                    const rawName = typeof window.extractExamStudentName === 'function' ? window.extractExamStudentName(t) : _fallbackExtractName(t);
                    const stuName = typeof window.getCanonicalStudentName === 'function' ? window.getCanonicalStudentName(rawName, allProfiles) : rawName.replace(/\s*\(\s*$/, '').trim();
                    if (!stuName) return;
                    const profile = allProfiles[stuName] || {};
                    const targetBelt = typeof window.getExamTargetBeltFromTx === 'function' ? window.getExamTargetBeltFromTx(t, profile) : _fallbackGetTargetBelt(t, profile);
                    const old = paidData[stuName];
                    const curTs = Number(t.timestamp || 0);
                    if (!old || curTs >= Number(old.timestamp || 0)) {
                        paidData[stuName] = {
                            targetBelt,
                            amount: feeAmt,
                            branch: t.branch || (profile && profile.branch) || 'CS1',
                            txId: t.id || t.txId || '',
                            timestamp: curTs
                        };
                    }
                }
            });
        }
        } catch (_paidDataErr) {
            console.error('[ReportsModule] exportExamPaidList paidData build error:', _paidDataErr && _paidDataErr.message);
            if (window.__reportsModuleMetrics) window.__reportsModuleMetrics.lastError = String(_paidDataErr && _paidDataErr.message);
        }

        if (Object.keys(paidData).length === 0) return alert(`Không có võ sinh nào ĐÃ NỘP Lệ phí thi trong kỳ ${formatMonth(selMonth)}! Vui lòng thu lệ phí trước khi xuất danh sách.`);

        const NCOLS    = 11;
        const clubName = (clubData && clubData.clubName) || 'CLB';
        const bCount   = clubConfig.branchCount || 1;

        const bAll  = { top:{style:'thin',color:{rgb:'AAAAAA'}}, bottom:{style:'thin',color:{rgb:'AAAAAA'}}, left:{style:'thin',color:{rgb:'AAAAAA'}}, right:{style:'thin',color:{rgb:'AAAAAA'}} };
        const bBold = { top:{style:'medium',color:{rgb:'0033A0'}}, bottom:{style:'medium',color:{rgb:'0033A0'}}, left:{style:'medium',color:{rgb:'0033A0'}}, right:{style:'medium',color:{rgb:'0033A0'}} };
        const bMix  = { top:{style:'medium',color:{rgb:'0033A0'}}, bottom:{style:'thin',color:{rgb:'AAAAAA'}}, left:{style:'medium',color:{rgb:'0033A0'}}, right:{style:'medium',color:{rgb:'0033A0'}} };

        const fHdr  = { bold:true, color:{rgb:'FFFFFF'}, sz:11, name:'Arial' };
        const fBold = { bold:true, sz:11, name:'Arial' };
        const fNorm = { sz:11, name:'Arial' };
        const fTitle= { bold:true, sz:14, name:'Arial', color:{rgb:'FFFFFF'} };
        const fSub  = { bold:true, sz:10, name:'Arial', color:{rgb:'1E3A6E'} };
        const fPaid = { bold:true, sz:10, name:'Arial', color:{rgb:'166534'} };
        const fTot  = { bold:true, sz:11, name:'Arial', color:{rgb:'166534'} };
        const fSign = { sz:10, name:'Arial', italic:true, color:{rgb:'475569'} };

        const fillTitle = { patternType:'solid', fgColor:{rgb:'0033A0'} };
        const fillSub   = { patternType:'solid', fgColor:{rgb:'DBEAFE'} };
        const fillHdr   = { patternType:'solid', fgColor:{rgb:'1E40AF'} };
        const fillAlt   = { patternType:'solid', fgColor:{rgb:'F0F4FF'} };
        const fillPaid  = { patternType:'solid', fgColor:{rgb:'DCFCE7'} };
        const fillTot   = { patternType:'solid', fgColor:{rgb:'D1FAE5'} };

        const cCenter = { horizontal:'center', vertical:'center', wrapText:true };
        const cLeft   = { horizontal:'left',   vertical:'center', wrapText:true };
        const cRight  = { horizontal:'right',  vertical:'center' };   // eslint-disable-line no-unused-vars

        const mc = (v, font, fill, border, align) => {
            const c = { v: v === undefined || v === null ? '' : v, t: typeof v === 'number' ? 'n' : 's', s: { font: font || fNorm, alignment: align || cLeft } };
            if (fill)   c.s.fill   = fill;
            if (border) c.s.border = border;
            return c;
        };

        const hc = v => mc(v, fHdr, fillHdr, bBold, cCenter);
        const nc = (v, alt) => mc(v, fNorm, alt ? fillAlt : null, bAll, cLeft);
        const bc = (v, alt) => mc(v, fBold, alt ? fillAlt : null, bAll, cLeft);
        const cc = (v, alt) => mc(v, fNorm, alt ? fillAlt : null, bAll, cCenter);
        const bMixBorder = {top:{style:'thin',color:{rgb:'AAAAAA'}},bottom:{style:'medium',color:{rgb:'0033A0'}},left:{style:'medium',color:{rgb:'0033A0'}},right:{style:'medium',color:{rgb:'0033A0'}}};

        const buildSheet = (subset, titleLine1, titleLine2, _capturePreview) => {
            // Phase 4K-6E-B: sort by belt order instead of plain name sort
            const _entries = Object.keys(subset).map(name => ({
                name,
                ...(subset[name] || {}),
                profile: allProfiles[name] || {},
            }));
            const sortedEntries = sortExamExportEntries(_entries);

            if (_capturePreview && typeof window !== 'undefined' && window.__store) {
                window.__store._lastExamExportSortedPreview = sortedEntries.slice();
            }

            const totalStudents = sortedEntries.length;
            const totalFee     = sortedEntries.reduce((s, e) => s + (e.amount || 0), 0);

            const ws_data = [
                [mc(titleLine1, fTitle, fillTitle, bBold, cCenter),
                 ...Array.from({length: NCOLS-1}, () => mc('', fTitle, fillTitle, bBold, cCenter))],
                [mc(`Kỳ thi: ${formatMonth(selMonth)}  —  ${clubName.toUpperCase()}`, fSub, fillSub, bMix, cCenter),
                 ...Array.from({length: NCOLS-1}, () => mc('', fSub, fillSub, bMix, cCenter))],
                [mc(titleLine2, fSub, fillSub, bMixBorder, cCenter),
                 ...Array.from({length: NCOLS-1}, () => mc('', fSub, fillSub, bMixBorder, cCenter))],
                [hc('STT'), hc('Họ và tên'), hc('Giới tính'), hc('Ngày sinh'), hc('Mã HV VTF'), hc('Cơ sở'), hc('Đai hiện tại'), hc('Đăng ký thi lên'), hc('CCCD / Mã ĐD'), hc('Trạng thái phí'), hc('Chữ ký xác nhận')],
            ];

            let stt = 1;
            sortedEntries.forEach(entry => {
                const name = entry.name;
                const p   = entry.profile || allProfiles[name] || {};
                const alt = stt % 2 === 0;
                const paidCell = mc('✔ Đã nộp phí', fPaid, fillPaid, bAll, cCenter);
                ws_data.push([
                    cc(stt++, alt),
                    bc(name, alt),
                    cc(p.gender || '', alt),
                    cc(p.dob || '', alt),
                    cc(p.memberId || '', alt),
                    cc(_branchName(p.branch || 'CS1'), alt),
                    nc(p.belt || 'Chưa cập nhật', alt),
                    nc(entry.targetBelt || subset[name].targetBelt, alt),
                    cc(p.cccd || '', alt),
                    paidCell,
                    mc('', fNorm, alt ? fillAlt : null, bAll, cCenter),
                ]);
            });

            const feeStr = totalFee > 0 ? '  —  Tổng phí: ' + totalFee.toLocaleString('vi-VN') + ' ₫' : '';
            ws_data.push([
                mc('TỔNG CỘNG', fTot, fillTot, bBold, cCenter),
                mc(`${totalStudents} võ sinh${feeStr}`, fTot, fillTot, bBold, cLeft),
                ...Array.from({length: NCOLS-2}, () => mc('', fTot, fillTot, bBold, cCenter)),
            ]);

            ws_data.push(Array.from({length: NCOLS}, () => mc('', fNorm, null, null, cCenter)));

            const sigRow = Array.from({length: NCOLS}, () => mc('', fSign, null, null, cCenter));
            sigRow[1]        = mc('Huấn luyện viên xác nhận', fSign, null, null, cCenter);
            sigRow[NCOLS-2]  = mc('Trưởng CLB / Quản lý', fSign, null, null, cCenter);
            ws_data.push(sigRow);
            const sigRow2 = Array.from({length: NCOLS}, () => mc('', fSign, null, null, cCenter));
            sigRow2[1]       = mc('(Ký và ghi rõ họ tên)', fSign, null, null, cCenter);
            sigRow2[NCOLS-2] = mc('(Ký và ghi rõ họ tên)', fSign, null, null, cCenter);
            ws_data.push(sigRow2);

            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            ws['!cols']   = [{wch:5},{wch:26},{wch:10},{wch:14},{wch:16},{wch:12},{wch:22},{wch:22},{wch:16},{wch:16},{wch:18}];
            ws['!rows']   = [{hpt:28},{hpt:20},{hpt:18},{hpt:22}];
            ws['!merges'] = [
                {s:{r:0,c:0},e:{r:0,c:NCOLS-1}},
                {s:{r:1,c:0},e:{r:1,c:NCOLS-1}},
                {s:{r:2,c:0},e:{r:2,c:NCOLS-1}},
                {s:{r:ws_data.length-4,c:0},e:{r:ws_data.length-4,c:NCOLS-1}},
                {s:{r:ws_data.length-2,c:1},e:{r:ws_data.length-2,c:5}},
                {s:{r:ws_data.length-2,c:7},e:{r:ws_data.length-2,c:NCOLS-1}},
                {s:{r:ws_data.length-1,c:1},e:{r:ws_data.length-1,c:5}},
                {s:{r:ws_data.length-1,c:7},e:{r:ws_data.length-1,c:NCOLS-1}},
            ];
            return ws;
        };

        const totalStudents   = Object.keys(paidData).length;
        const overallTotalFee = Object.values(paidData).reduce((s, d) => s + (d.amount || 0), 0);
        const overallFeeStr   = overallTotalFee > 0 ? `  |  Tổng lệ phí: ${overallTotalFee.toLocaleString('vi-VN')} ₫` : '';
        const ws1 = buildSheet(
            paidData,
            'DANH SÁCH ĐĂNG KÝ THI LÊN ĐAI',
            `Tổng số võ sinh đăng ký: ${totalStudents}${overallFeeStr}  |  Ngày xuất: ${formatDate(getLocalToday())}`,
            true  // Phase 4K-6E-B: capture preview for debugExamExportSortPreview
        );

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws1, 'DS_ToanBo');

        if (bCount > 1) {
            for (let _bi = 1; _bi <= bCount; _bi++) {
                const branchCode  = 'CS' + _bi;
                const branchName  = _branchName(branchCode);
                const branchSubset = {};
                Object.keys(paidData).forEach(name => {
                    const entryBranch = paidData[name].branch || (allProfiles[name] || {}).branch || 'CS1';
                    if (entryBranch === branchCode) branchSubset[name] = paidData[name];
                });
                if (Object.keys(branchSubset).length === 0) continue;
                const branchTotal    = Object.values(branchSubset).reduce((s, d) => s + (d.amount || 0), 0);
                const branchStuCount = Object.keys(branchSubset).length;
                const ws_branch = buildSheet(
                    branchSubset,
                    `DANH SÁCH ĐĂNG KÝ THI — ${branchName.toUpperCase()}`,
                    `Võ sinh: ${branchStuCount}  |  Tổng lệ phí: ${branchTotal > 0 ? branchTotal.toLocaleString('vi-VN') + ' ₫' : 'N/A'}  |  Ngày xuất: ${formatDate(getLocalToday())}`
                );
                const safeSheetName = (branchCode + '_' + branchName).replace(/[:\\\/\?\*\[\]]/g, '').substring(0, 31);
                XLSX.utils.book_append_sheet(wb, ws_branch, safeSheetName);
            }
        }

        XLSX.writeFile(wb, `DS_DangKyThi_${selMonth}_${clubName.replace(/\s/g,'_')}.xlsx`);
        // Phase 4.0A-2: Record duration
        window.__reportsModuleMetrics.lastExportDurationMs = Date.now() - _examStartMs;
        window.__reportsModuleMetrics.lastError = null;
    };

    // ════════════════════════════════════════════════════════════
    // 5. updateTaxPeriodOptions / executeTaxExport
    // ════════════════════════════════════════════════════════════

    window.updateTaxPeriodOptions = () => {
        const type = document.getElementById('taxPeriodType').value;
        const sel  = document.getElementById('taxPeriodValue');
        sel.innerHTML = '';
        if (type === 'month')        { for (let i = 1; i <= 12; i++) sel.innerHTML += `<option value="${i}">Tháng ${i}</option>`; }
        else if (type === 'quarter') { for (let i = 1; i <= 4; i++)  sel.innerHTML += `<option value="${i}">Quý ${i}</option>`; }
        else if (type === 'half')    { sel.innerHTML += `<option value="1">6 tháng đầu</option><option value="2">6 tháng cuối</option>`; }
        else                         { sel.innerHTML += `<option value="1">Cả năm</option>`; }
    };

    window.executeTaxExport = async () => {
        await window.ensureXlsxReady?.('reports-tax-export');
        if (window.userRole === 'viewer') return alert("Tài khoản khách không thể thao tác!");

        const year    = document.getElementById('taxYear').value;
        const pType   = document.getElementById('taxPeriodType').value;
        const pVal    = document.getElementById('taxPeriodValue').value;
        const valStr  = document.getElementById('taxPeriodValue').options[
            document.getElementById('taxPeriodValue').selectedIndex
        ].text;

        let startStr = `${year}-01-01`;
        let endStr   = `${year}-12-31`;

        if (pType === 'month') {
            let m  = String(pVal).padStart(2, '0');
            startStr = `${year}-${m}-01`;
            endStr   = `${year}-${m}-31`;
        } else if (pType === 'quarter') {
            let mStart = (parseInt(pVal) - 1) * 3 + 1;
            let mEnd   = mStart + 2;
            startStr = `${year}-${String(mStart).padStart(2,'0')}-01`;
            endStr   = `${year}-${String(mEnd).padStart(2,'0')}-31`;
        } else if (pType === 'half') {
            if (pVal === '1') { startStr = `${year}-01-01`; endStr = `${year}-06-30`; }
            else              { startStr = `${year}-07-01`; endStr = `${year}-12-31`; }
        }

        if (typeof window.ensureAllProfilesForExport === 'function') {
            await window.ensureAllProfilesForExport('tax-export');
        }
        // Phase 4.0A-2: Metrics
        const _taxStartMs = Date.now();
        window.__reportsModuleMetrics.taxExportCalls++;
        window.__reportsModuleMetrics.lastExportType = 'tax';
        window.showToast("⏳ Đang truy xuất dữ liệu từ máy chủ...", 10000, true);

        const colRef  = _colRef();
        const clubConfig = _config();
        const XLSX    = _XLSX();
        const { getDocs, query, where, limit } = _sdk();

        try {
            // === Phase 3.8D: Thay limit(2000) bằng paginated fetch cho tax export ===
            let _taxRawDocs = [];
            try {
                _taxRawDocs = await window.loadTransactionsForDateRange({
                    colRef,
                    startDate: startStr,
                    endDate:   endStr,
                    reason:    'tax-export-date-range',
                });
                const _qs38d = window.__queryScaleMetrics;
                if (_qs38d) {
                    const _mKey   = `export-tx-date:${startStr}~${endStr}`;
                    const _mFetch = _qs38d.paginatedFetches && _qs38d.paginatedFetches[_mKey];
                    _qs38d.taxExportDocs  = _taxRawDocs.length;
                    _qs38d.taxExportPages = _mFetch ? _mFetch.pages : 1;
                }
            } catch (_taxPaginationErr) {
                console.warn('[ExportPaginationFallback] Tax export paginated helper lỗi, fallback legacy query (limit 2000):', _taxPaginationErr && _taxPaginationErr.message);
                if (typeof window.warnUnsafeLimit === 'function') window.warnUnsafeLimit('tax-export:fallback-legacy', 'paginated-helper-failed');
                const _qs38d = window.__queryScaleMetrics;
                if (_qs38d) _qs38d.exportPaginationFallbackCount = (_qs38d.exportPaginationFallbackCount || 0) + 1;
                const _qTxFb  = query(colRef, where("date", ">=", startStr), where("date", "<=", endStr));
                const _fbSnap = await getDocs(query(_qTxFb, limit(2000))); // [ExportPaginationFallback]
                _taxRawDocs = _fbSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            let filteredTx = _taxRawDocs.filter(t => {
                return t.type.includes('Thu') || t.type.includes('Học phí') || t.type.includes('Lệ phí');
            });
            filteredTx.sort((a, b) => (a.date > b.date) ? 1 : -1);

            const tnr = { name: "Times New Roman" };
            const borderThin = {
                top: { style: "thin" }, bottom: { style: "thin" },
                left: { style: "thin" }, right: { style: "thin" }
            };

            const txByDate = {};
            filteredTx.forEach(t => {
                if (!txByDate[t.date]) txByDate[t.date] = [];
                txByDate[t.date].push(t);
            });

            const allDatesInPeriod = [];
            const [_sy, _sm, _sd] = startStr.split('-').map(Number);
            const [_ey, _em, _ed] = endStr.split('-').map(Number);
            let _cY = _sy, _cM = _sm;
            while (_cY < _ey || (_cY === _ey && _cM <= _em)) {
                const daysInMonth = new Date(_cY, _cM, 0).getDate();
                const dayStart    = (_cY === _sy && _cM === _sm) ? _sd : 1;
                const dayEnd      = (_cY === _ey && _cM === _em) ? Math.min(_ed, daysInMonth) : daysInMonth;
                for (let d = dayStart; d <= dayEnd; d++) {
                    allDatesInPeriod.push(`${_cY}-${String(_cM).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
                }
                _cM++;
                if (_cM > 12) { _cM = 1; _cY++; }
            }

            let totalRevenue = 0;
            let dataRows     = [];

            allDatesInPeriod.forEach(dateStr => {
                const txsForDay = txByDate[dateStr] || [];
                if (txsForDay.length > 0) {
                    txsForDay.forEach(t => {
                        dataRows.push([
                            { v: formatDate(t.date), t: 's', s: { font: { ...tnr, sz: 12 }, alignment: { vertical: "top", horizontal: "center" }, border: borderThin } },
                            { v: t.description || 'Thu phí hệ thống', t: 's', s: { font: { ...tnr, sz: 12 }, alignment: { vertical: "top", horizontal: "left", wrapText: true }, border: borderThin } },
                            { v: Number(t.amount) || 0, t: 'n', z: '#,##0', s: { font: { ...tnr, sz: 12 }, alignment: { vertical: "top", horizontal: "right" }, border: borderThin } }
                        ]);
                        totalRevenue += (Number(t.amount) || 0);
                    });
                } else {
                    dataRows.push([
                        { v: formatDate(dateStr), t: 's', s: { font: { ...tnr, sz: 11, color: { rgb: 'BBBBBB' } }, alignment: { vertical: "top", horizontal: "center" }, border: borderThin } },
                        { v: '', t: 's', s: { font: { ...tnr, sz: 11, color: { rgb: 'BBBBBB' } }, alignment: { vertical: "top", horizontal: "left" }, border: borderThin } },
                        { v: '', t: 's', s: { font: { ...tnr, sz: 11 }, alignment: { vertical: "top", horizontal: "right" }, border: borderThin } }
                    ]);
                }
            });

            const ws_data = [
                [
                    { v: "HỘ, CÁ NHÂN KINH DOANH: " + (clubConfig.accountName || "CLB TAEKWONDO TST"), t: 's', s: { font: { ...tnr, sz: 12, bold: true }, alignment: { vertical: "top" } } },
                    null,
                    { v: "Mẫu số S1a-HKD", t: 's', s: { font: { ...tnr, sz: 10, bold: true }, alignment: { vertical: "bottom", horizontal: "center" } } }
                ],
                [
                    { v: "Địa chỉ: " + (clubConfig.location || "Phường Quy Nhơn, Bình Định"), t: 's', s: { font: { ...tnr, sz: 12, bold: true } } },
                    null,
                    { v: "(Kèm theo Thông tư số 152/2025/TT-BTC\nngày 31 tháng 12 năm 2025 của Bộ trưởng\nBộ Tài chính)", t: 's', s: { font: { ...tnr, sz: 10, italic: true }, alignment: { vertical: "top", horizontal: "center", wrapText: true } } }
                ],
                [
                    { v: "Mã số thuế: ..............................", t: 's', s: { font: { ...tnr, sz: 12, bold: true } } }, null, null
                ],
                [ null, null, null ],
                [
                    { v: "SỔ CHI TIẾT DOANH THU BÁN HÀNG HÓA, DỊCH VỤ", t: 's', s: { font: { ...tnr, sz: 14, bold: true }, alignment: { vertical: "center", horizontal: "center" } } },
                    null, null
                ],
                [
                    { v: "Địa điểm kinh doanh: ..............................", t: 's', s: { font: { ...tnr, sz: 12, bold: true } } }, null, null
                ],
                [
                    { v: "Kỳ kê khai: " + valStr + " năm " + year, t: 's', s: { font: { ...tnr, sz: 12, bold: true } } }, null, null
                ],
                [
                    null, null, { v: "Đơn vị tính: VNĐ", t: 's', s: { font: { ...tnr, sz: 12, italic: true }, alignment: { horizontal: "right" } } }
                ],
                [
                    { v: "Ngày tháng", t: 's', s: { font: { ...tnr, sz: 12, bold: true }, alignment: { vertical: "center", horizontal: "center" }, border: borderThin } },
                    { v: "Nội dung giao dịch", t: 's', s: { font: { ...tnr, sz: 12, bold: true }, alignment: { vertical: "center", horizontal: "center" }, border: borderThin } },
                    { v: "Số tiền", t: 's', s: { font: { ...tnr, sz: 12, bold: true }, alignment: { vertical: "center", horizontal: "center" }, border: borderThin } }
                ],
                [
                    { v: "A", t: 's', s: { font: { ...tnr, sz: 12, italic: true }, alignment: { vertical: "center", horizontal: "center" }, border: borderThin } },
                    { v: "B", t: 's', s: { font: { ...tnr, sz: 12, italic: true }, alignment: { vertical: "center", horizontal: "center" }, border: borderThin } },
                    { v: "1", t: 's', s: { font: { ...tnr, sz: 12, italic: true }, alignment: { vertical: "center", horizontal: "center" }, border: borderThin } }
                ]
            ];

            dataRows.forEach(row => ws_data.push(row));

            ws_data.push([
                { v: "", t: 's', s: { border: borderThin } },
                { v: `Tổng cộng ${valStr.toLowerCase()} năm ${year}`, t: 's', s: { font: { ...tnr, sz: 12, bold: true }, alignment: { horizontal: "left" }, border: borderThin } },
                { v: totalRevenue, t: 'n', z: '#,##0', s: { font: { ...tnr, sz: 12, bold: true }, alignment: { horizontal: "right" }, border: borderThin } }
            ]);
            ws_data.push([null, null, null]);
            ws_data.push([null, null, { v: "Ngày      tháng      năm", t: 's', s: { font: { ...tnr, sz: 12, italic: true }, alignment: { horizontal: "center" } } }]);
            ws_data.push([null, null, { v: "NGƯỜI ĐẠI DIỆN HỘ KINH DOANH\nCÁ NHÂN KINH DOANH", t: 's', s: { font: { ...tnr, sz: 12, bold: true }, alignment: { horizontal: "center", wrapText: true } } }]);
            ws_data.push([null, null, { v: "(Ký, ghi rõ họ tên, đóng dấu (nếu có))", t: 's', s: { font: { ...tnr, sz: 12, italic: true }, alignment: { horizontal: "center" } } }]);

            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            ws['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
                { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
                { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } },
                { s: { r: 5, c: 0 }, e: { r: 5, c: 1 } },
                { s: { r: 6, c: 0 }, e: { r: 6, c: 1 } }
            ];
            ws['!cols'] = [{wch: 13}, {wch: 46}, {wch: 33}];
            ws['!rows'] = [];
            ws['!rows'][1] = { hpt: 45 };
            ws['!rows'][ws_data.length - 2] = { hpt: 35 };

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "So_S1a_HKD");
            XLSX.writeFile(wb, `So_Thue_S1a_${valStr.replace(/\s/g, '_')}_${year}.xlsx`);
            document.getElementById('toastMessage').classList.remove('show');
            if (typeof window.closeTaxModal === 'function') window.closeTaxModal();
            // Phase 4.0A-2: Record duration
            window.__reportsModuleMetrics.lastExportDurationMs = Date.now() - _taxStartMs;
            window.__reportsModuleMetrics.lastError = null;
        } catch (error) {
            console.error(error);
            // Phase 4.0A-2: Record error
            window.__reportsModuleMetrics.lastError = error ? error.message : 'unknown';
            window.__reportsModuleMetrics.lastExportDurationMs = Date.now() - _taxStartMs;
            alert("Lỗi khi xuất sổ thuế. Có thể do nghẽn mạng.");
            document.getElementById('toastMessage').classList.remove('show');
        }
    };

    // ════════════════════════════════════════════════════════════
    // 6. Expose window.ReportsModule (debug / rollback toggle)
    // ════════════════════════════════════════════════════════════


    // ════════════════════════════════════════════════════════════
    // Phase 4.0A-3/4.0A-4: Reset state on logout — defined BEFORE ReportsModule
    // so window.ReportsModule.resetReportsModuleState is always a valid ref.
    // ════════════════════════════════════════════════════════════
    window.resetReportsModuleState = function(reason) {
        window.__reportsModuleInitialized = false;
        if (window.__reportsModuleMetrics) {
            window.__reportsModuleMetrics.lastExportType = '';
            window.__reportsModuleMetrics.lastError = null;
        }
        console.debug('[ReportsModule] state reset:', reason || '');
    };

    // Phase 4K-5G: debugExamExportReadiness — kiểm tra sẵn sàng xuất DS thi
    window.debugExamExportReadiness = function debugExamExportReadiness() {
        const metrics = window.__reportsModuleMetrics || {};
        const result = {
            reportsModuleInitialized:       !!window.__reportsModuleInitialized,
            exportExamPaidListDefined:      typeof window.exportExamPaidList === 'function',
            buildCanonicalLedgerDefined:    typeof window.buildCanonicalExamPaymentLedger === 'function',
            getExamTargetBeltDefined:       typeof window.getExamTargetBeltFromTx === 'function',
            extractExamStudentNameDefined:  typeof window.extractExamStudentName === 'function',
            getCanonicalStudentNameDefined: typeof window.getCanonicalStudentName === 'function',
            loadTransactionsForTxMonthRangeDefined: typeof window.loadTransactionsForTxMonthRange === 'function',
            loadTransactionsForDateRangeDefined:    typeof window.loadTransactionsForDateRange === 'function',
            dedupeDocsByIdDefined:          typeof window.dedupeDocsById === 'function',
            examPaidExportCalls:     metrics.examPaidExportCalls || 0,
            lastExportType:          metrics.lastExportType || '',
            lastError:               metrics.lastError || null,
            examPaidPaginatedLoadUsed: metrics.examPaidPaginatedLoadUsed || 0,
            examPaidDedupeDocs:      metrics.examPaidDedupeDocs || 0,
        };
        console.table(result);
        return result;
    };

    // Phase 4K-6E-B: debugExamExportSortPreview — kiểm tra thứ tự sort sau khi export
    window.debugExamExportSortPreview = function() {
        const st = (typeof window !== 'undefined' && window.__store) || {};
        const profiles = st.profiles || (typeof window !== 'undefined' && window.allProfiles) || {};
        const data = st._lastExamExportSortedPreview || [];

        const rows = data.map((r, idx) => ({
            stt:             idx + 1,
            name:            r.name || r.studentName || '',
            currentBelt:     r.currentBelt || r.belt || (profiles[r.name] && profiles[r.name].belt) || '',
            currentBeltRank: getExamExportBeltRank(
                r.currentBelt || r.belt || (profiles[r.name] && profiles[r.name].belt) || ''
            ),
            targetBelt:      r.targetBelt || r.nextBelt || '',
            targetBeltRank:  getExamExportBeltRank(r.targetBelt || r.nextBelt || ''),
            branch:          r.branch || (profiles[r.name] && profiles[r.name].branch) || '',
            amount:          r.amount || r.examFee || 0,
        }));

        console.table(rows);
        return {
            count: rows.length,
            rows,
        };
    };

    window.ReportsModule = {
        openExcelExportModal:      window.openExcelExportModal,
        updateExcelPeriodOptions:  window.updateExcelPeriodOptions,
        executeExcelExport:        window.executeExcelExport,
        exportToExcel:             window.exportToExcel,
        exportAchievementsExcel:   window.exportAchievementsExcel,
        exportExamPaidList:        window.exportExamPaidList,
        updateTaxPeriodOptions:    window.updateTaxPeriodOptions,
        executeTaxExport:          window.executeTaxExport,
        resetReportsModuleState:   window.resetReportsModuleState,
        debugExamExportReadiness:  window.debugExamExportReadiness,
        debugExamExportSortPreview: window.debugExamExportSortPreview,
        _phase: '4K-6E-B',
    };

    console.debug('[reports.js] ✅ initReports() Phase 4K-6E-B — exam export belt-order sort');
}

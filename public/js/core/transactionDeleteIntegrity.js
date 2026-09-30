/**
 * js/core/transactionDeleteIntegrity.js — Phase 4K-6E
 * ─────────────────────────────────────────────────────────────────
 * Transaction Delete Integrity Service
 *
 * Phân tích impact trước khi xóa giao dịch, đảm bảo:
 * - Tuition profile được reconcile sau khi xóa tx học phí
 * - Bundle inventory không bị xóa không an toàn
 * - Debug helpers kiểm tra orphan paidMonths
 * ─────────────────────────────────────────────────────────────────
 */

// ── 1. extractTuitionMonthsFromTransaction ───────────────────────────────────

/**
 * Trích xuất danh sách tháng học phí từ transaction.
 * Hỗ trợ: packageMonths, month, txMonth, components, bundle types.
 * @param {Object} tx
 * @returns {string[]} — mảng YYYY-MM unique, sorted
 */
function extractTuitionMonthsFromTransaction(tx) {
    if (!tx) return [];

    const set = new Set();

    function addIfValid(m) {
        const s = String(m || '').trim().slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(s)) set.add(s);
    }

    const type = String(tx.type || '').trim();
    const isTuitionType = type === 'Học phí' || type === 'Học phí + Lệ phí thi';
    const paymentKind = String(tx.paymentKind || '').trim();

    // packageMonths trực tiếp từ tx
    if (Array.isArray(tx.packageMonths) && tx.packageMonths.length > 0) {
        tx.packageMonths.forEach(addIfValid);
    }

    // month / txMonth trực tiếp
    if (isTuitionType || paymentKind === 'bundle') {
        if (tx.month)   addIfValid(tx.month);
        if (tx.txMonth) addIfValid(tx.txMonth);
    }

    // components array — kind === 'tuition'
    if (Array.isArray(tx.components)) {
        tx.components.forEach(function(c) {
            if (!c || c.kind !== 'tuition') return;
            if (Array.isArray(c.packageMonths)) {
                c.packageMonths.forEach(addIfValid);
            }
            if (c.month)   addIfValid(c.month);
            if (c.txMonth) addIfValid(c.txMonth);
        });
    }

    // Nếu là học phí đơn và chưa lấy được tháng nào, thử lấy từ txMonth / date
    if (isTuitionType && set.size === 0) {
        if (tx.txMonth) addIfValid(tx.txMonth);
        if (tx.date)    addIfValid(String(tx.date).slice(0, 7));
    }

    return Array.from(set).sort();
}

// ── 2. extractExamComponentsFromTransaction ──────────────────────────────────

function extractExamComponentsFromTransaction(tx) {
    if (!tx) return [];
    const type = String(tx.type || '').trim();
    const items = [];

    if (type === 'Lệ phí thi' || type === 'Học phí + Lệ phí thi') {
        items.push({
            kind: 'exam',
            examId: tx.examId || tx.relatedExamId || '',
            amount: Number(tx.examAmount || tx.amount || 0),
        });
    }

    if (Array.isArray(tx.components)) {
        tx.components.forEach(function(c) {
            if (c && c.kind === 'exam') {
                items.push({
                    kind: 'exam',
                    examId: c.examId || c.relatedExamId || '',
                    amount: Number(c.amount || 0),
                });
            }
        });
    }

    return items;
}

// ── 3. extractInventoryComponentsFromTransaction ─────────────────────────────

function extractInventoryComponentsFromTransaction(tx) {
    if (!tx) return [];
    const items = [];
    const linkage = function(obj) {
        obj = obj || {};
        return obj.relatedInvId || obj.inventoryId || obj.invId || obj.paymentBundleId || obj.paidTxId || '';
    };
    const rollbackRef = function(obj) {
        obj = obj || {};
        return obj.relatedInvId || obj.inventoryId || obj.invId || '';
    };

    if (Array.isArray(tx.components)) {
        tx.components.forEach(function(c) {
            if (!c) return;
            const kind = String(c.kind || c.domain || '').trim();
            if (kind === 'inventory' || kind === 'inventoryDebt') {
                items.push(Object.assign({}, c, { relatedInvId: rollbackRef(c), inventoryLinkId: linkage(c) }));
            }
        });
    }

    // Inventory direct/linkage evidence. A bundle may be labelled "Học phí"
    // while its inventory responsibility exists only in a component or linkage.
    const type = String(tx.type || '').trim();
    const paymentKind = String(tx.paymentKind || '').trim();
    const invTypes = ['Kho đồ', 'Đồng phục', 'Dụng cụ', 'Kho', 'Võ phục'];
    const isDirectInv = invTypes.some(function(t) { return type.includes(t); });
    const topLevelRef = linkage(tx);
    if ((isDirectInv || (paymentKind === 'bundle' && topLevelRef)) && items.length === 0) {
        items.push({
            kind: 'inventory',
            relatedInvId: topLevelRef,
            amount: Number(tx.amount || 0),
        });
    }

    return items;
}

// Canonical transaction -> Inventory document identity.  Payment linkage
// fields (paymentBundleId/paidTxId) are evidence only; they are never treated as
// inventory document ids.
function extractInventoryRefsFromTransaction(tx) {
    if (!tx || typeof tx !== 'object') return [];
    var refs = [];
    var fields = ['relatedInvId', 'inventoryId', 'invId'];
    function add(value) {
        var id = String(value || '').trim();
        if (!id || id === 'undefined' || id === 'null' || refs.indexOf(id) >= 0) return;
        refs.push(id);
    }
    fields.forEach(function(k) { add(tx[k]); });
    if (Array.isArray(tx.components)) {
        tx.components.forEach(function(c) {
            if (!c || typeof c !== 'object') return;
            var kind = String(c.kind || c.domain || '').trim();
            if (kind !== 'inventory' && kind !== 'inventoryDebt') return;
            fields.forEach(function(k) { add(c[k]); });
        });
    }
    return refs;
}

// ── 4. analyzeTransactionDeleteImpact ────────────────────────────────────────

/**
 * Phân tích impact trước khi xóa giao dịch.
 * @param {Object} tx
 * @param {Object} options
 * @returns {Object}
 */
function analyzeTransactionDeleteImpact(tx, options) {
    options = options || {};

    var rawTxId = tx && typeof tx === 'object' ? String(tx.id || '').trim() : '';
    var invalidTxId = !rawTxId || rawTxId === 'undefined' || rawTxId === 'null';
    if (!tx || typeof tx !== 'object' || invalidTxId) {
        return {
            valid: false, failClosed: true,
            txId: '', type: '', paymentKind: '', studentName: '', branch: '', amount: 0,
            hasComponents: false, componentKinds: [],
            tuitionMonths: [], hasTuition: false, hasExam: false,
            hasInventory: false, hasInventoryDebt: false, hasInventoryLinkage: false,
            inventoryRefs: [], isMixedBundle: false, isPureInventory: false, isPureTuition: false,
            safeToHardDelete: false, requiresProfileReconcile: false,
            requiresExamRefresh: false, requiresInventoryRollback: false,
            requiresDashboardRefresh: false,
            warnings: ['invalid-or-missing-transaction-identity'], blockers: ['invalid-tx-id'],
        };
    }

    var type = String(tx.type || '').trim();
    var paymentKind = String(tx.paymentKind || '').trim();
    var studentName = String(tx.description || tx.studentName || tx.name || '').trim();
    var branch = String(tx.branch || tx.branchId || '').trim();
    var amount = Number(tx.amount || 0);

    var hasComponents = Array.isArray(tx.components) && tx.components.length > 0;
    var componentKinds = hasComponents
        ? tx.components.map(function(c) { return c && c.kind ? c.kind : 'unknown'; })
        : [];

    var tuitionMonths = extractTuitionMonthsFromTransaction(tx);
    var examItems     = extractExamComponentsFromTransaction(tx);
    var invItems      = extractInventoryComponentsFromTransaction(tx);

    var hasTuition  = tuitionMonths.length > 0;
    var hasExam     = examItems.length > 0;
    var hasInventory = invItems.length > 0;

    var hasInventoryDebt = hasInventory && invItems.some(function(c) {
        return c.kind === 'inventoryDebt' ||
               tx.unpaid === true ||
               tx.inventoryDebtStatus === 'pending';
    });

    var warnings = [];
    var blockers = [];

    // Canonical inventory linkage detection must inspect nested components as
    // well as the transaction shell. Top-level relatedInvId is not sufficient.
    var inventoryLinkFields = ['relatedInvId', 'inventoryId', 'invId', 'paymentBundleId', 'paidTxId'];
    var inventoryRefFields = ['relatedInvId', 'inventoryId', 'invId'];
    var hasInventoryLinkage = inventoryLinkFields.some(function(k) { return !!tx[k]; }) || invItems.some(function(c) {
        return inventoryLinkFields.some(function(k) { return !!(c && c[k]); });
    });
    var inventoryRefs = extractInventoryRefsFromTransaction(tx);
    // An explicit Inventory document ref is itself canonical Inventory impact
    // evidence even when the legacy transaction type is labelled "Học phí".
    // Payment-only linkage (paymentBundleId/paidTxId) remains evidence-only.
    if (inventoryRefs.length > 0) hasInventory = true;

    // A paymentBundleId/paidTxId proves linkage but is not an inventory document id.
    // Destructive inventory rollback requires one explicit canonical inventory ref.
    var invUnsafe = false;
    if (hasInventory) {
        invItems.forEach(function(c) {
            var componentRefs = [];
            inventoryRefFields.forEach(function(k) {
                var id = String((c && c[k]) || '').trim();
                if (id && id !== 'undefined' && componentRefs.indexOf(id) < 0) componentRefs.push(id);
            });
            if (!componentRefs.length && !inventoryRefs.length) {
                invUnsafe = true;
                warnings.push('inventory-component-no-ref-id');
            }
        });
        if (!inventoryRefs.length) blockers.push('inventory-no-canonical-ref');
        if (inventoryRefs.length > 1) blockers.push('multiple-inventory-refs-no-proven-owner');
        if (paymentKind === 'bundle' && invUnsafe) blockers.push('bundle-inventory-no-safe-rollback');
    }

    var requiresProfileReconcile  = hasTuition && !!studentName;
    var requiresExamRefresh       = hasExam;
    var requiresInventoryRollback = hasInventory && inventoryRefs.length > 0;
    var isMixedBundle = hasTuition && hasInventory;
    var nonInventoryComponent = componentKinds.some(function(k) { return k !== 'inventory' && k !== 'inventoryDebt'; });
    var isPureInventory = hasInventory && !hasTuition && !hasExam && !nonInventoryComponent;
    var isPureTuition = hasTuition && !hasInventory && !requiresInventoryRollback && !isMixedBundle;

    // F1D: no existing owner proves a full cross-domain Tuition + Inventory
    // rollback (transaction + stock ledger + profile settlement) atomically.
    // Mixed-domain deletion therefore fails closed BEFORE destructive writes.
    if (isMixedBundle) blockers.push('mixed-domain-delete-requires-specialized-owner');

    var safeToHardDelete = blockers.length === 0;
    var requiresDashboardRefresh  = true;

    return {
        valid:            true,
        failClosed:       false,
        txId:             rawTxId,
        type:             type,
        paymentKind:      paymentKind,
        studentName:      studentName,
        branch:           branch,
        amount:           amount,
        hasComponents:    hasComponents,
        componentKinds:   componentKinds,
        tuitionMonths:    tuitionMonths,
        hasTuition:       hasTuition,
        hasExam:          hasExam,
        hasInventory:     hasInventory,
        hasInventoryDebt: hasInventoryDebt,
        hasInventoryLinkage: hasInventoryLinkage,
        inventoryRefs:    inventoryRefs.slice(),
        isMixedBundle:    isMixedBundle,
        isPureInventory:  isPureInventory,
        isPureTuition:    isPureTuition,
        safeToHardDelete:           safeToHardDelete,
        requiresProfileReconcile:   requiresProfileReconcile,
        requiresExamRefresh:        requiresExamRefresh,
        requiresInventoryRollback:  requiresInventoryRollback,
        requiresDashboardRefresh:   requiresDashboardRefresh,
        warnings: warnings,
        blockers: blockers,
    };
}

// ── 5. isTransactionDeleteSafe ───────────────────────────────────────────────

function isTransactionDeleteSafe(tx, options) {
    var impact = analyzeTransactionDeleteImpact(tx, options || {});
    return impact.safeToHardDelete;
}

// ── 6. reconcileAfterTransactionDelete ──────────────────────────────────────

/**
 * Reconcile sau khi xóa transaction (thin wrapper — calls window helpers).
 */
async function reconcileAfterTransactionDelete(tx, options) {
    options = options || {};
    var impact = analyzeTransactionDeleteImpact(tx, options);

    if (!impact.safeToHardDelete) {
        console.warn('[TransactionDeleteIntegrity] reconcile skipped — not safe', impact.blockers);
        return { ok: false, reason: 'not-safe', blockers: impact.blockers };
    }

    var results = { ok: true, tuitionReconciled: false, examRefreshed: false };

    if (impact.requiresProfileReconcile && impact.studentName) {
        if (typeof window !== 'undefined' &&
            typeof window.reconcileStudentTuitionAfterDeletedTransaction === 'function') {
            try {
                await window.reconcileStudentTuitionAfterDeletedTransaction(
                    impact.studentName, tx, Object.assign({ reason: 'reconcileAfterDelete' }, options)
                );
                results.tuitionReconciled = true;
            } catch (e) {
                console.error('[TransactionDeleteIntegrity] reconcile tuition error', e);
                results.tuitionError = e && e.message ? e.message : String(e);
            }
        }
    }

    if (impact.requiresExamRefresh) {
        if (typeof window !== 'undefined' && typeof window.renderExamList === 'function') {
            try { window.renderExamList(); results.examRefreshed = true; } catch (e) { /* noop */ }
        }
    }

    return results;
}

// ── Export ───────────────────────────────────────────────────────────────────

export const TransactionDeleteIntegrity = {
    analyzeTransactionDeleteImpact:        analyzeTransactionDeleteImpact,
    extractTuitionMonthsFromTransaction:   extractTuitionMonthsFromTransaction,
    extractExamComponentsFromTransaction:  extractExamComponentsFromTransaction,
    extractInventoryComponentsFromTransaction: extractInventoryComponentsFromTransaction,
    extractInventoryRefsFromTransaction:       extractInventoryRefsFromTransaction,
    isTransactionDeleteSafe:               isTransactionDeleteSafe,
    reconcileAfterTransactionDelete:       reconcileAfterTransactionDelete,
};

/**
 * Phase 4K-6V3F — Pending inventory reconciliation service.
 *
 * Guarantees:
 * - financial transaction + stock posting/pending issue are committed together;
 * - pending sale never makes stock negative;
 * - reconciliation decrements stock only and never creates revenue again;
 * - pending list is lazy-loaded (no bootstrap listener).
 */

function sdk() { return window._fb_init || {}; }
function ctx() {
  const st = window.__store || {};
  if (!st.db || !st.clubId) throw new Error('[InventoryPendingService] Firestore/clubId chưa sẵn sàng');
  return { st, db: st.db, clubId: st.clubId, transactionsRef: st.colRef };
}
function now() { return Date.now(); }
function today() { return typeof window.getLocalToday === 'function' ? window.getLocalToday() : new Date().toISOString().slice(0, 10); }
function clean(v) { return String(v || '').trim(); }
function qty(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }

function applyWrite(writer, write) {
  if (!write || !write.ref) return;
  if (write.op === 'update') writer.update(write.ref, write.data || {});
  else if (write.op === 'delete') writer.delete(write.ref);
  else if (write.options) writer.set(write.ref, write.data || {}, write.options);
  else writer.set(write.ref, write.data || {});
}

function validateCheck(check, snap) {
  if (!check) return;
  if (typeof check.validate === 'function') return check.validate(snap);
  if (check.type === 'inventory-stock') {
    const data = snap && snap.exists() ? (snap.data() || {}) : {};
    const available = Number(data[check.field] || 0);
    if (available < Number(check.required || 0)) {
      throw new Error(`Kho không đủ ${check.label || 'sản phẩm'}: còn ${available}, cần ${check.required}. Hãy chọn “Bán tạm” nếu CLB cho phép.`);
    }
  }
}

function buildPlan(inventory, postingMode, txRef, source) {
  const { db, clubId } = ctx();
  const { doc, collection, increment } = sdk();
  const mode = postingMode || 'posted';
  const data = inventory || {};
  const category = clean(data.category || 'Võ phục') || 'Võ phục';
  const size = clean(data.size);
  const count = qty(data.qty || 1);
  if (!size || !count) throw new Error('Thông tin sản phẩm/size/số lượng không hợp lệ');

  const identity = typeof window.resolveInventoryDebtIdentity === 'function'
    ? window.resolveInventoryDebtIdentity(data.studentName || data.desc || '')
    : {};
  const common = {
    category, size, qty: count,
    studentName: clean(data.studentName || identity.studentName || data.desc),
    profileId: clean(data.profileId || identity.profileId),
    memberId: clean(data.memberId || identity.memberId),
    branch: clean(data.branch || ((window.__store || {}).coachBranch) || 'Mặc định'),
    desc: clean(data.desc || data.studentName),
    date: clean(data.date || today()),
    timestamp: Number(data.timestamp || now()),
    source: clean(source || data.source || 'inventory-sale'),
    saleAmount: Number(data.amount || 0),
    linkedSaleTransactionId: txRef.id,
  };
  const statsRef = doc(db, 'clubs', clubId, 'settings', 'inventory_stats');

  if (mode === 'not_applicable') {
    return { postingStatus: 'not_applicable', relatedInvId: '', pendingIssueId: '', writes: [], checks: [], runtimeInventory: null };
  }

  if (mode === 'pending') {
    const pendingRef = doc(collection(db, 'clubs', clubId, 'inventoryPendingIssues'));
    const issue = {
      ...common,
      status: 'pending',
      inventoryPostingStatus: 'pending',
      affectsInventory: false,
      affectsRevenue: false,
      pendingReason: clean(data.pendingReason || 'Chưa cập nhật hàng vào Kho'),
      createdAt: now(),
      updatedAt: now(),
      saleTransactionId: txRef.id,
    };
    return {
      postingStatus: 'pending', relatedInvId: '', pendingIssueId: pendingRef.id,
      writes: [
        { op: 'set', ref: pendingRef, data: issue },
        { op: 'set', ref: statsRef, data: {
          pendingIssueCount: increment(1),
          pendingIssueQty: increment(count),
          pendingIssueAmount: increment(Number(data.amount || 0)),
          pendingIssueUpdatedAt: now(),
        }, options: { merge: true } },
      ],
      checks: [], runtimeInventory: null, pendingIssue: { id: pendingRef.id, ...issue },
    };
  }

  const invRef = doc(collection(db, 'clubs', clubId, 'inventory'));
  const base = `${category}|||${size}`;
  const invPayload = {
    ...common,
    type: 'Xuất bán',
    amount: Number(data.amount || 0),
    inventoryPostingStatus: 'posted',
    affectsInventory: true,
    affectsRevenue: false,
    paymentBundleId: txRef.id,
    paidTxId: txRef.id,
  };
  return {
    postingStatus: 'posted', relatedInvId: invRef.id, pendingIssueId: '',
    writes: [
      { op: 'set', ref: invRef, data: invPayload },
      { op: 'set', ref: statsRef, data: {
        [`${base}_balance`]: increment(-count),
        [`${base}_out`]: increment(count),
      }, options: { merge: true } },
    ],
    checks: [{ type: 'inventory-stock', ref: statsRef, field: `${base}_balance`, required: count, label: `${category} ${size}` }],
    runtimeInventory: { id: invRef.id, ...invPayload },
  };
}

function decorateTx(txData, plan) {
  const tx = { ...(txData || {}) };
  tx.inventoryPostingStatus = plan.postingStatus;
  tx.pendingInventoryIssueIds = plan.pendingIssueId ? [plan.pendingIssueId] : [];
  if (plan.relatedInvId) tx.relatedInvId = plan.relatedInvId;
  if (Array.isArray(tx.components)) {
    let decorated = false;
    tx.components = tx.components.map(component => {
      if (!decorated && component && component.kind === 'inventory') {
        decorated = true;
        return {
          ...component,
          inventoryPostingStatus: plan.postingStatus,
          affectsInventory: plan.postingStatus === 'posted',
          affectsRevenue: true,
          relatedInvId: plan.relatedInvId || '',
          pendingIssueId: plan.pendingIssueId || '',
        };
      }
      return component;
    });
  }
  return tx;
}

function resolvePendingComponentState(txData, issueId, patch) {
  const statePatch = patch || {};
  const tx = { ...(txData || {}), ...statePatch };
  if (Array.isArray(tx.components)) {
    const { pendingInventoryIssueIds, inventoryReconciliation, ...componentPatch } = statePatch;
    tx.components = tx.components.map(component => {
      if (!component || component.pendingIssueId !== issueId) return component;
      return {
        ...component,
        ...componentPatch,
        pendingIssueId: Object.prototype.hasOwnProperty.call(componentPatch, 'pendingIssueId')
          ? componentPatch.pendingIssueId
          : issueId,
      };
    });
  }
  return tx;
}

async function commitGeneric(txRef, txData, checks, writes) {
  const { db } = ctx();
  const { runTransaction } = sdk();
  if (typeof runTransaction !== 'function') throw new Error('Firestore transaction chưa sẵn sàng');
  await runTransaction(db, async transaction => {
    const checkSnaps = [];
    for (const check of checks) checkSnaps.push(await transaction.get(check.ref));
    checks.forEach((check, i) => validateCheck(check, checkSnaps[i]));
    transaction.set(txRef, txData);
    writes.forEach(write => applyWrite(transaction, write));
  });
}

export const InventoryPendingService = {
  buildPlan,

  async commitFinancialTransaction({
    txData, studentName, tuitionMonths = [], profile = {}, inventory = null,
    postingMode = 'posted', debtIds = [], reason = 'inventory-aware-payment'
  } = {}) {
    const { db, clubId, transactionsRef } = ctx();
    const { doc, collection } = sdk();
    const txCol = transactionsRef || collection(db, 'clubs', clubId, 'transactions');
    const txRef = doc(txCol);
    const plan = inventory ? buildPlan(inventory, postingMode, txRef, reason) : {
      postingStatus: '', relatedInvId: '', pendingIssueId: '', writes: [], checks: [], runtimeInventory: null
    };
    const debtWrites = (Array.isArray(debtIds) ? debtIds : []).filter(Boolean).map(id => ({
      op: 'update', ref: doc(db, 'clubs', clubId, 'inventory', id),
      data: { unpaid: false, inventoryDebtStatus: 'paid', paidAt: now(), paidTxId: txRef.id }
    }));
    let canonicalTx = decorateTx(txData, plan);
    canonicalTx = typeof window.canonicalizeTransactionForWrite === 'function'
      ? window.canonicalizeTransactionForWrite(canonicalTx, reason)
      : canonicalTx;

    let paidUntil = '';
    if (Array.isArray(tuitionMonths) && tuitionMonths.length > 0) {
      if (typeof window.commitTuitionPaymentAtomic !== 'function') throw new Error('Canonical tuition atomic writer chưa sẵn sàng');
      const result = await window.commitTuitionPaymentAtomic({
        studentName, months: tuitionMonths, profile, txData: canonicalTx, txRef,
        sideChecks: plan.checks,
        sideWrites: [...plan.writes, ...debtWrites],
        reason,
      });
      paidUntil = result.paidUntil || '';
    } else {
      await commitGeneric(txRef, canonicalTx, plan.checks, [...plan.writes, ...debtWrites]);
      window.mergeTransactionIntoRuntimeStore?.({ id: txRef.id, ...canonicalTx }, reason);
    }

    if (plan.runtimeInventory) {
      window.mergeInventoryIntoRuntimeStore?.(plan.runtimeInventory, reason);
      window.notifyInventoryMutation?.(reason, { writeThrough: true });
    }
    if (plan.pendingIssue) window.dispatchEvent(new CustomEvent('inventory:pending-changed', { detail: { reason, issue: plan.pendingIssue } }));
    return { id: txRef.id, txData: canonicalTx, paidUntil, ...plan };
  },

  async loadPendingIssues(limitCount = 50) {
    const { db, clubId } = ctx();
    const { collection, query, where, limit, getDocs } = sdk();
    const snap = await getDocs(query(
      collection(db, 'clubs', clubId, 'inventoryPendingIssues'),
      where('status', '==', 'pending'),
      limit(Math.max(1, Math.min(100, Number(limitCount) || 50)))
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  },

  async reconcile(issueId) {
    const { db, clubId } = ctx();
    const { doc, collection, runTransaction, increment } = sdk();
    const issueRef = doc(db, 'clubs', clubId, 'inventoryPendingIssues', issueId);
    let runtimeInventory = null;
    await runTransaction(db, async transaction => {
      const issueSnap = await transaction.get(issueRef);
      if (!issueSnap.exists()) throw new Error('Không tìm thấy giao dịch chờ bổ sung');
      const issue = issueSnap.data() || {};
      if (issue.status !== 'pending') throw new Error('Giao dịch này đã được xử lý trên thiết bị khác');
      const category = clean(issue.category || 'Võ phục');
      const size = clean(issue.size);
      const count = qty(issue.qty);
      const statsRef = doc(db, 'clubs', clubId, 'settings', 'inventory_stats');
      const saleTxRef = issue.saleTransactionId ? doc(db, 'clubs', clubId, 'transactions', issue.saleTransactionId) : null;
      const statsSnap = await transaction.get(statsRef);
      const saleTxSnap = saleTxRef ? await transaction.get(saleTxRef) : null;
      if (saleTxRef && (!saleTxSnap || !saleTxSnap.exists())) throw new Error('Giao dịch tài chính gốc không còn tồn tại; không thể đối soát tự động');
      const base = `${category}|||${size}`;
      const available = Number((statsSnap.exists() ? statsSnap.data() : {})[`${base}_balance`] || 0);
      if (available < count) throw new Error(`Kho không đủ ${category} ${size}: còn ${available}, cần ${count}`);

      const invRef = doc(collection(db, 'clubs', clubId, 'inventory'));
      const invPayload = {
        category, size, qty: count, type: 'Xuất bán', amount: Number(issue.saleAmount || 0),
        desc: issue.desc || issue.studentName || '', studentName: issue.studentName || '',
        profileId: issue.profileId || '', memberId: issue.memberId || '', date: issue.date || today(),
        timestamp: now(), inventoryPostingStatus: 'posted', affectsInventory: true,
        affectsRevenue: false, pendingIssueId: issueId,
        linkedSaleTransactionId: issue.saleTransactionId || '',
        reconciliationOnly: true,
      };
      transaction.set(invRef, invPayload);
      transaction.set(statsRef, {
        [`${base}_balance`]: increment(-count),
        [`${base}_out`]: increment(count),
        pendingIssueCount: increment(-1),
        pendingIssueQty: increment(-count),
        pendingIssueAmount: increment(-Number(issue.saleAmount || 0)),
        pendingIssueUpdatedAt: now(),
      }, { merge: true });
      transaction.update(issueRef, {
        status: 'reconciled', inventoryPostingStatus: 'posted', relatedInvId: invRef.id,
        reconciledAt: now(), updatedAt: now(),
      });
      if (saleTxRef && saleTxSnap) {
        const salePatch = {
          inventoryPostingStatus: 'posted', affectsInventory: true, relatedInvId: invRef.id,
          pendingInventoryIssueIds: [], pendingIssueId: '',
          inventoryReconciliation: { pendingIssueId: issueId, relatedInvId: invRef.id, reconciledAt: now() }
        };
        transaction.set(saleTxRef, resolvePendingComponentState(saleTxSnap.data(), issueId, salePatch), { merge: true });
      }
      runtimeInventory = { id: invRef.id, ...invPayload };
    });
    if (runtimeInventory) window.mergeInventoryIntoRuntimeStore?.(runtimeInventory, 'pending-inventory-reconciled');
    window.notifyInventoryMutation?.('pending-inventory-reconciled', { writeThrough: true });
    window.dispatchEvent(new CustomEvent('inventory:pending-changed', { detail: { reason: 'reconciled', issueId } }));
    return runtimeInventory;
  },

  async markNotApplicable(issueId) {
    const { db, clubId } = ctx();
    const { doc, runTransaction, increment } = sdk();
    const issueRef = doc(db, 'clubs', clubId, 'inventoryPendingIssues', issueId);
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(issueRef);
      if (!snap.exists()) throw new Error('Không tìm thấy giao dịch chờ bổ sung');
      const issue = snap.data() || {};
      if (issue.status !== 'pending') throw new Error('Giao dịch này đã được xử lý');
      const saleTxRef = issue.saleTransactionId ? doc(db, 'clubs', clubId, 'transactions', issue.saleTransactionId) : null;
      const saleTxSnap = saleTxRef ? await transaction.get(saleTxRef) : null;
      if (saleTxRef && (!saleTxSnap || !saleTxSnap.exists())) throw new Error('Giao dịch tài chính gốc không còn tồn tại; không thể xử lý tự động');
      transaction.update(issueRef, { status: 'not_applicable', inventoryPostingStatus: 'not_applicable', updatedAt: now(), resolvedAt: now() });
      transaction.set(doc(db, 'clubs', clubId, 'settings', 'inventory_stats'), {
        pendingIssueCount: increment(-1), pendingIssueQty: increment(-qty(issue.qty)),
        pendingIssueAmount: increment(-Number(issue.saleAmount || 0)), pendingIssueUpdatedAt: now(),
      }, { merge: true });
      if (saleTxRef && saleTxSnap) {
        const salePatch = {
          inventoryPostingStatus: 'not_applicable', affectsInventory: false,
          pendingInventoryIssueIds: [], pendingIssueId: '', relatedInvId: '',
          inventoryReconciliation: { pendingIssueId: issueId, resolvedAt: now(), mode: 'not_applicable' }
        };
        transaction.set(saleTxRef, resolvePendingComponentState(saleTxSnap.data(), issueId, salePatch), { merge: true });
      }
    });
    window.dispatchEvent(new CustomEvent('inventory:pending-changed', { detail: { reason: 'not-applicable', issueId } }));
  },
};

export function initInventoryPendingService() {
  window.InventoryPendingService = InventoryPendingService;
  return InventoryPendingService;
}

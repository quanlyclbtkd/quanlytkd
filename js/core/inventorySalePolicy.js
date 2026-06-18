/**
 * Phase 4K-6V3F — Per-club inventory sale policy.
 *
 * Financial payment state and inventory posting state are independent:
 *   strict        -> stock must exist and is decremented atomically.
 *   allow_pending -> operator may choose posted or pending reconciliation.
 *   disabled      -> sale is financial-only; inventory is not tracked.
 */

export const INVENTORY_SALE_POLICIES = Object.freeze({
  STRICT: 'strict',
  ALLOW_PENDING: 'allow_pending',
  DISABLED: 'disabled',
});

const VALID = new Set(Object.values(INVENTORY_SALE_POLICIES));

export function normalizeInventorySalePolicy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID.has(normalized) ? normalized : INVENTORY_SALE_POLICIES.STRICT;
}

export function getInventorySalePolicy(config) {
  const cfg = config || (window.__store || {}).clubConfig || window.clubConfig || {};
  return normalizeInventorySalePolicy(cfg.inventorySalePolicy);
}

export function resolveInventoryPostingMode({ policy, requestPending = false } = {}) {
  const normalizedPolicy = normalizeInventorySalePolicy(policy || getInventorySalePolicy());
  if (normalizedPolicy === INVENTORY_SALE_POLICIES.DISABLED) return 'not_applicable';
  if (normalizedPolicy === INVENTORY_SALE_POLICIES.ALLOW_PENDING && requestPending) return 'pending';
  return 'posted';
}

function el(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }
function setVisible(node, visible) { if (node) node.style.display = visible ? '' : 'none'; }

export function applyAdmissionInventoryPolicyUI() {
  const policy = getInventorySalePolicy();
  const pendingWrap = el('add_uniform_pending_wrap');
  const pendingCheck = el('add_uniform_pending');
  const manualWrap = el('add_uniform_manual_wrap');
  const manualInput = el('add_uniform_size_manual');
  const stockSelect = el('add_uniform_size');
  const hint = el('add_uniform_policy_hint');

  const allowPending = policy === INVENTORY_SALE_POLICIES.ALLOW_PENDING;
  const disabled = policy === INVENTORY_SALE_POLICIES.DISABLED;
  if (pendingCheck && !allowPending) pendingCheck.checked = false;
  setVisible(pendingWrap, allowPending);

  const useManual = disabled || !!(pendingCheck && pendingCheck.checked);
  setVisible(stockSelect, !useManual);
  setVisible(manualWrap, useManual);
  if (manualInput) manualInput.required = useManual;

  if (hint) {
    hint.textContent = disabled
      ? 'CLB không quản lý tồn kho: giao dịch vẫn ghi nhận doanh thu/công nợ nhưng không trừ tồn.'
      : allowPending
        ? 'Có thể chọn hàng trong Kho hoặc bật “Bán tạm” để bổ sung tồn sau.'
        : 'Bắt buộc chọn hàng đang còn tồn trong Kho.';
  }
  return { policy, postingMode: resolveInventoryPostingMode({ policy, requestPending: !!(pendingCheck && pendingCheck.checked) }) };
}

export function getAdmissionInventorySelection() {
  const policy = getInventorySalePolicy();
  const requestPending = !!(el('add_uniform_pending') && el('add_uniform_pending').checked);
  const postingMode = resolveInventoryPostingMode({ policy, requestPending });
  const manual = String((el('add_uniform_size_manual') || {}).value || '').trim();
  const selected = String((el('add_uniform_size') || {}).value || '').trim();
  return {
    policy,
    postingMode,
    requestPending,
    size: postingMode === 'posted' ? selected : manual,
    reason: String((el('add_uniform_pending_reason') || {}).value || '').trim(),
  };
}

export function applyMultiItemInventoryPolicyUI() {
  const policy = getInventorySalePolicy();
  const pendingWrap = el('mi_inv_pending_wrap');
  const pendingCheck = el('mi_inv_pending');
  const select = el('mi_inv_size_select');
  const text = el('mi_inv_size_text');
  const hint = el('mi_inv_policy_hint');

  const allowPending = policy === INVENTORY_SALE_POLICIES.ALLOW_PENDING;
  const disabled = policy === INVENTORY_SALE_POLICIES.DISABLED;
  if (pendingCheck && !allowPending) pendingCheck.checked = false;
  setVisible(pendingWrap, allowPending);

  const useManual = disabled || !!(pendingCheck && pendingCheck.checked);
  if (useManual) {
    setVisible(select, false);
    setVisible(text, true);
  }
  if (hint) {
    hint.textContent = disabled
      ? 'Không quản lý tồn kho'
      : allowPending
        ? 'Có thể bán tạm và đối soát sau'
        : 'Bắt buộc còn tồn';
  }
  return { policy, postingMode: resolveInventoryPostingMode({ policy, requestPending: !!(pendingCheck && pendingCheck.checked) }), useManual };
}

export function getMultiItemInventorySelection(category) {
  const policy = getInventorySalePolicy();
  const requestPending = !!(el('mi_inv_pending') && el('mi_inv_pending').checked);
  const postingMode = resolveInventoryPostingMode({ policy, requestPending });
  const useManual = postingMode !== 'posted';
  const selected = String((el('mi_inv_size_select') || {}).value || '').trim();
  const manual = String((el('mi_inv_size_text') || {}).value || '').trim();
  return {
    policy,
    postingMode,
    requestPending,
    category: String(category || (el('mi_inv_category') || {}).value || 'Võ phục').trim(),
    size: useManual ? manual : selected,
    reason: String((el('mi_inv_pending_reason') || {}).value || '').trim(),
  };
}

export function decorateInventoryComponent(component, posting) {
  const c = { ...(component || {}) };
  const p = posting || {};
  c.inventoryPostingStatus = p.postingStatus || 'posted';
  c.affectsInventory = c.inventoryPostingStatus === 'posted';
  c.affectsRevenue = true;
  c.relatedInvId = p.relatedInvId || c.relatedInvId || '';
  c.pendingIssueId = p.pendingIssueId || '';
  return c;
}

export function initInventorySalePolicy() {
  window.InventorySalePolicy = {
    policies: INVENTORY_SALE_POLICIES,
    normalize: normalizeInventorySalePolicy,
    getPolicy: getInventorySalePolicy,
    resolvePostingMode: resolveInventoryPostingMode,
    applyAdmissionUI: applyAdmissionInventoryPolicyUI,
    getAdmissionSelection: getAdmissionInventorySelection,
    applyMultiItemUI: applyMultiItemInventoryPolicyUI,
    getMultiItemSelection: getMultiItemInventorySelection,
    decorateComponent: decorateInventoryComponent,
  };
  window.applyAdmissionInventoryPolicyUI = applyAdmissionInventoryPolicyUI;
  window.applyMultiItemInventoryPolicyUI = applyMultiItemInventoryPolicyUI;
  window.getAdmissionInventorySelection = getAdmissionInventorySelection;
  window.getMultiItemInventorySelection = getMultiItemInventorySelection;
  return window.InventorySalePolicy;
}

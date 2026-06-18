/**
 * Phase 4K-6V3F1 — Canonical Revenue Routing
 *
 * Một nguồn phân loại duy nhất cho doanh thu Học phí / Thi đai / Kho đồ / Khác.
 * Không đọc Firestore. Chỉ chuẩn hóa dữ liệu giao dịch đã có trong bộ nhớ.
 */

const SCHEMA_VERSION = 1;

function amount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function monthOf(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4})-(\d{1,2})/);
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2, '0')}` : '';
}

function normalizeCategory(kind, type) {
  const k = String(kind || '').trim();
  const t = String(type || '').trim().toLowerCase();
  if (k === 'tuition' || t.includes('học phí') || t.includes('hoc phi')) return 'tuition';
  if (k === 'exam' || t.includes('lệ phí thi') || t.includes('le phi thi') || t.includes('thi đai')) return 'exam';
  if (k === 'inventory' || k === 'inventoryDebt' || t.includes('võ phục') || t.includes('kho') || t.includes('bảo hộ') || t.includes('áo thun')) return 'inventory';
  return 'other';
}

function fallbackComponents(tx) {
  const type = String(tx?.type || '').trim();
  if (type === 'Học phí + Lệ phí thi') {
    const result = [];
    if (amount(tx.tuitionAmount) > 0) result.push({
      kind: 'tuition', type: 'Học phí', amount: amount(tx.tuitionAmount),
      packageMonths: Array.isArray(tx.packageMonths) ? tx.packageMonths : [],
      month: tx.paymentMonth || tx.txMonth || '', date: tx.date, branch: tx.branch,
    });
    if (amount(tx.examAmount) > 0) result.push({
      kind: 'exam', type: 'Lệ phí thi', amount: amount(tx.examAmount),
      month: tx.txMonth || '', date: tx.date, branch: tx.branch,
    });
    return result;
  }
  return [{
    kind: normalizeCategory('', type), type, amount: amount(tx?.amount),
    packageMonths: Array.isArray(tx?.packageMonths) ? tx.packageMonths : [],
    month: tx?.paymentMonth || tx?.txMonth || '', date: tx?.date, branch: tx?.branch,
    affectsRevenue: tx?.affectsRevenue !== false,
  }];
}

function getComponents(tx) {
  if (Array.isArray(tx?.components) && tx.components.length) return tx.components;
  if (typeof window !== 'undefined' && typeof window.getAccountingComponents === 'function') {
    try {
      const parts = window.getAccountingComponents(tx);
      if (Array.isArray(parts) && parts.length) return parts;
    } catch (_) {}
  }
  return fallbackComponents(tx || {});
}

function componentAmountForMonth(component, tx, selectedMonth) {
  const value = amount(component?.amount);
  if (!selectedMonth) return value;
  const selected = monthOf(selectedMonth);
  if (!selected) return value;

  const category = normalizeCategory(component?.kind, component?.type);
  if (category === 'tuition') {
    const months = Array.isArray(component?.packageMonths)
      ? component.packageMonths.map(monthOf).filter(Boolean)
      : [];
    if (months.length) return months.includes(selected) ? value / months.length : 0;
    const cm = monthOf(component?.month || component?.txMonth || tx?.paymentMonth || tx?.txMonth || component?.date || tx?.date);
    return !cm || cm === selected ? value : 0;
  }

  const cm = monthOf(component?.month || component?.txMonth || component?.date || tx?.date || tx?.txMonth);
  return !cm || cm === selected ? value : 0;
}

export function routeRevenueTransaction(tx, selectedMonth = '') {
  const buckets = { tuition: 0, inventory: 0, exam: 0, other: 0, total: 0 };
  const components = getComponents(tx || {});
  const routed = [];

  components.forEach((component, index) => {
    if (!component || component.affectsRevenue === false || tx?.affectsRevenue === false) return;
    const category = normalizeCategory(component.kind, component.type || component.label || tx?.type);
    const value = componentAmountForMonth(component, tx, selectedMonth);
    if (!Number.isFinite(value) || value === 0) return;
    buckets[category] += value;
    buckets.total += value;
    routed.push({
      index,
      category,
      amount: value,
      fullAmount: amount(component.amount),
      kind: component.kind || '',
      label: component.label || component.type || category,
      relatedInvId: component.relatedInvId || '',
      pendingIssueId: component.pendingIssueId || '',
    });
  });

  // Dữ liệu legacy không có component hợp lệ: vẫn không được làm mất doanh thu.
  if (!routed.length && tx && tx.affectsRevenue !== false && amount(tx.amount) !== 0) {
    const category = normalizeCategory('', tx.type);
    const value = componentAmountForMonth({
      kind: category,
      type: tx.type,
      amount: tx.amount,
      packageMonths: tx.packageMonths,
      month: tx.paymentMonth || tx.txMonth,
      date: tx.date,
    }, tx, selectedMonth);
    if (value !== 0) {
      buckets[category] += value;
      buckets.total += value;
      routed.push({ index: -1, category, amount: value, fullAmount: amount(tx.amount), kind: category, label: tx.type || category });
    }
  }

  return { buckets, components: routed };
}

export function buildCanonicalRevenueMetadata(tx) {
  const routed = routeRevenueTransaction(tx || {}, '');
  const categories = ['tuition', 'inventory', 'exam', 'other'].filter(key => Math.abs(routed.buckets[key]) > 0);
  return {
    revenueSchemaVersion: SCHEMA_VERSION,
    revenueCategories: categories,
    revenueBreakdown: {
      tuition: amount(routed.buckets.tuition),
      inventory: amount(routed.buckets.inventory),
      exam: amount(routed.buckets.exam),
      other: amount(routed.buckets.other),
      total: amount(routed.buckets.total),
    },
  };
}

export function revenueCategoryLabel(category) {
  return ({ tuition: 'Học phí', inventory: 'Kho đồ', exam: 'Thi đai', other: 'Khoản khác' })[category] || 'Khoản khác';
}

export function initRevenueRouting() {
  if (typeof window === 'undefined') return;
  window.routeRevenueTransaction = routeRevenueTransaction;
  window.buildCanonicalRevenueMetadata = buildCanonicalRevenueMetadata;
  window.getRevenueCategoryLabel = revenueCategoryLabel;
  window.REVENUE_ROUTING_SCHEMA_VERSION = SCHEMA_VERSION;
}

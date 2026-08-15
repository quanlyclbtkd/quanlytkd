// js/core/productionStabilityGate.js
// Phase 4K-6J — Production Stability Gate
// Purpose:
// - Read-only production diagnostics after the 4K-6I series.
// - Verify Admin CLB data health, SuperAdmin stats/cache readiness, Excel VTF import readiness,
//   financial data safety, render/runtime health, and key debug availability.
// - This module MUST NOT write Firestore or mutate business data.

const PHASE = '4K-6J-production-stability-gate-20260608';
const MAX_SAMPLE = 30;

function _nowIso() { return new Date().toISOString(); }
function _safeArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}
function _profilesArray() {
  const st = window.__store || {};
  const raw = st.profiles || window.allProfiles || {};
  return _safeArray(raw).filter(Boolean);
}
function _transactionsArray() {
  const st = window.__store || {};
  return Array.isArray(st.transactions) ? st.transactions :
         Array.isArray(st.allTransactions) ? st.allTransactions :
         Array.isArray(window.allTransactions) ? window.allTransactions : [];
}
function _inventoryArray() {
  const st = window.__store || {};
  return Array.isArray(st.inventory) ? st.inventory :
         Array.isArray(st.allInventory) ? st.allInventory :
         Array.isArray(window.allInventory) ? window.allInventory : [];
}
function _role() {
  const st = window.__store || {};
  return String(window.userRole || st.userRole || st.role || '').toLowerCase();
}
function _isSuperAdmin() {
  try {
    if (typeof window.isSuperAdminRole === 'function' && window.isSuperAdminRole()) return true;
  } catch (_) {}
  const st = window.__store || {};
  const role = _role();
  return role === 'superadmin' || role === 'super_admin' || role === 'root' || !!st.currentUser?.isSuperAdmin;
}
function _clubId() {
  const st = window.__store || {};
  return st.clubId || st.currentClubId || window.currentClubId || '';
}
function _normalizeStatus(p) {
  if (!p || typeof p !== 'object') return 'unknown';
  if (typeof window.classifyProfileStatus === 'function') {
    try { return window.classifyProfileStatus(p); } catch (_) {}
  }
  const s = String(p.status || p.studentStatus || '').toLowerCase().trim();
  if (s === 'quit' || s === 'nghi' || s === 'nghỉ' || s === 'inactive' || p.active === false || p.isActive === false) return 'quit';
  if (s === 'trial') return 'trial';
  return 'active';
}
function _money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function _txAmount(tx) {
  if (!tx || typeof tx !== 'object') return null;
  return _money(tx.amount ?? tx.total ?? tx.value ?? tx.money ?? tx.fee);
}
function _studentNameOf(tx) {
  return String(tx?.studentName || tx?.name || tx?.profileName || tx?.desc || tx?.description || '').trim();
}
function _txId(tx, idx) { return String(tx?.id || tx?.docId || tx?.transactionId || idx); }
function _runtimeErrors() {
  return Array.isArray(window.__runtimeErrors) ? window.__runtimeErrors.slice(-MAX_SAMPLE) : [];
}
function _safeCallSync(name, fn, args = []) {
  try {
    if (typeof fn !== 'function') return { ok: false, missing: true };
    const value = fn.apply(window, args);
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
function _isFunction(name) { return typeof window[name] === 'function'; }
function _firstFiniteNumber(...values) {
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function _extractNumberFromText(text) {
  const s = String(text || '').replace(/\./g, '').replace(/,/g, '').replace(/[^0-9\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function _readSuperAdminStatsFromDom() {
  const root = document.getElementById('superAdminStats');
  if (!root) return { exists: false, text: '', hasPlaceholder: false };
  const text = root.textContent || '';
  return {
    exists: true,
    text: text.slice(0, 1000),
    hasPlaceholder: text.includes('--'),
    hasTotalStudentsLabel: /Tổng\s*Võ\s*S/i.test(text),
    hasRevenueLabel: /Doanh\s*Thu/i.test(text),
    numberLikeValues: (text.match(/[0-9][0-9.,]*/g) || []).slice(0, 20)
  };
}

function getDataHealthSnapshot() {
  const profiles = _profilesArray();
  const txs = _transactionsArray();
  const inv = _inventoryArray();
  let active = 0, quit = 0, trial = 0, unknown = 0;
  for (const p of profiles) {
    const st = _normalizeStatus(p);
    if (st === 'quit') quit++;
    else if (st === 'trial') { trial++; active++; }
    else if (st === 'active') active++;
    else unknown++;
  }
  return {
    ok: true,
    role: _role(),
    isSuperAdmin: _isSuperAdmin(),
    clubId: _clubId(),
    profileCount: profiles.length,
    activeCount: active,
    trialCount: trial,
    quitCount: quit,
    unknownStatusCount: unknown,
    transactionCount: txs.length,
    inventoryCount: inv.length,
    hasStore: !!window.__store,
    hasDb: !!((window.__store || {}).db || window.db),
    hasAuth: !!((window.__store || {}).auth || window.auth)
  };
}

function getFinancialSafetySnapshot() {
  const txs = _transactionsArray();
  const profiles = _profilesArray();
  const anomalies = [];
  const deletedLike = [];
  const byStudentPaidMonth = new Map();
  txs.forEach((tx, idx) => {
    const id = _txId(tx, idx);
    const amount = _txAmount(tx);
    if (!tx || typeof tx !== 'object') {
      anomalies.push({ type: 'invalid-transaction-row', id, idx });
      return;
    }
    if (amount === null || amount < 0) {
      anomalies.push({ type: 'invalid-amount', id, amount: tx.amount ?? tx.total ?? tx.value });
    }
    const name = _studentNameOf(tx);
    const type = String(tx.type || tx.kind || tx.category || '').toLowerCase();
    const isTuition = type.includes('học phí') || type.includes('hoc phi') || type.includes('tuition') || tx.tuition === true;
    if (isTuition && !name) anomalies.push({ type: 'tuition-missing-student-name', id });
    if (tx.deleted === true || tx.isDeleted === true || tx.status === 'deleted') deletedLike.push({ id, name, type: tx.type || tx.kind || '', amount });
    const paidMonth = tx.paymentMonth || tx.txMonth || tx.month;
    if (isTuition && name && paidMonth) {
      const key = String(name).toLowerCase().trim() + '|' + String(paidMonth);
      byStudentPaidMonth.set(key, (byStudentPaidMonth.get(key) || 0) + 1);
    }
  });
  const duplicateTuitionMonths = Array.from(byStudentPaidMonth.entries())
    .filter(([, count]) => count > 1)
    .slice(0, MAX_SAMPLE)
    .map(([key, count]) => ({ key, count }));
  const profilePaidAnomalies = [];
  profiles.forEach((p, idx) => {
    if (!p || typeof p !== 'object') return;
    if (Array.isArray(p.paidMonths) && p.paidMonths.some(m => !/^20\d{2}-\d{2}$/.test(String(m)))) {
      profilePaidAnomalies.push({ idx, name: p.name || p.studentName || '', issue: 'paidMonths-format', sample: p.paidMonths.slice(0, 6) });
    }
    if (p.paidUntil && !/^20\d{2}-\d{2}$/.test(String(p.paidUntil))) {
      profilePaidAnomalies.push({ idx, name: p.name || p.studentName || '', issue: 'paidUntil-format', paidUntil: p.paidUntil });
    }
  });
  const result = {
    ok: anomalies.length === 0,
    transactionCount: txs.length,
    checkedProfiles: profiles.length,
    invalidTransactionCount: anomalies.length,
    duplicateTuitionMonthCount: duplicateTuitionMonths.length,
    deletedLikeTransactionCount: deletedLike.length,
    profilePaidAnomalyCount: profilePaidAnomalies.length,
    anomalies: anomalies.slice(0, MAX_SAMPLE),
    duplicateTuitionMonths,
    deletedLike: deletedLike.slice(0, MAX_SAMPLE),
    profilePaidAnomalies: profilePaidAnomalies.slice(0, MAX_SAMPLE),
    note: 'Read-only snapshot. Không tự sửa dữ liệu.'
  };
  console.log('[debugFinancialSafetySnapshot]', result);
  if (result.anomalies.length) console.table(result.anomalies);
  return result;
}

function getSuperAdminStatsReadiness() {
  const isSA = _isSuperAdmin();
  const dom = _readSuperAdminStatsFromDom();
  const quota = _safeCallSync('debugSuperAdminQuotaGuard', window.debugSuperAdminQuotaGuard);
  const loadState = _safeCallSync('debugSuperAdminLoadState', window.debugSuperAdminLoadState);
  const hardStop = _safeCallSync('debugSuperAdminAggregationHardStop', window.debugSuperAdminAggregationHardStop);
  const serverRefresh = _safeCallSync('debugSuperAdminServerRefresh', window.debugSuperAdminServerRefresh);
  const noClientAggregation = window.__saDisableBackgroundCountRefresh === true || window.__saAggregationHardStop === true;
  const authorityPolicy = window.ProductionAuthorityPolicy || null;
  const functionsReady = !!(window._fb_init && window._fb_init.getFunctions && window._fb_init.httpsCallable);
  const callableReady = _isFunction('refreshSuperAdminCountsForClub') || !!(window.SuperAdminServerRefresh && typeof window.SuperAdminServerRefresh.refreshClub === 'function');
  const result = {
    ok: !isSA || (noClientAggregation && !!window.SuperAdminModule),
    isSuperAdmin: isSA,
    superAdminModuleReady: !!window.SuperAdminModule,
    noClientAggregation,
    authorityPolicy,
    functionsSdkReady: functionsReady,
    callableRefreshReady: callableReady,
    superAdminStatsDom: dom,
    quotaGuard: quota.ok ? quota.value : quota,
    loadState: loadState.ok ? loadState.value : loadState,
    aggregationHardStop: hardStop.ok ? hardStop.value : hardStop,
    serverRefresh: serverRefresh.ok ? serverRefresh.value : serverRefresh,
    recommendations: []
  };
  if (isSA && authorityPolicy?.superAdminServerRefresh === false && dom.hasPlaceholder) result.recommendations.push('Một số CLB có finance cache UNKNOWN; giữ hiển thị -- cho đến khi Admin writer có coverage complete.');
  if (!noClientAggregation) result.recommendations.push('Không được bật lại client aggregation trong SuperAdmin.');
  console.log('[debugSuperAdminStatsReadiness]', result);
  return result;
}

function getExcelImportVtfReadiness() {
  const result = {
    ok: true,
    hasHandleImportExcel: _isFunction('handleImportExcel'),
    hasDebugExcelImportVtfUpsert: _isFunction('debugExcelImportVtfUpsert'),
    hasXlsx: typeof window.XLSX !== 'undefined',
    hasFileInput: !!document.getElementById('excelFileInput'),
    hasImportButtonCandidate: !!document.querySelector('[onclick*="handleImportExcel"], input[type="file"]'),
    protections: {
      paidUntilProtectedByCheck: true,
      vtfDuplicateSystemCheck: true,
      vtfDuplicateFileCheck: true,
      batchChunkingExpected: true
    },
    debug: _safeCallSync('debugExcelImportVtfUpsert', window.debugExcelImportVtfUpsert)
  };
  result.ok = result.hasHandleImportExcel && result.hasDebugExcelImportVtfUpsert;
  console.log('[debugExcelImportVtfReadiness]', result);
  return result;
}

function getRuntimeStabilitySnapshot() {
  const runtimeErrors = _runtimeErrors();
  const legacyRender = _safeCallSync('debugLegacyRenderEntrypoints', window.debugLegacyRenderEntrypoints);
  const inlineBridge = _safeCallSync('debugEventActionBridge', window.debugEventActionBridge);
  const pendingDomain = _safeCallSync('debugPendingDomainInvalidations', window.debugPendingDomainInvalidations);
  const studentsFallback = _safeCallSync('debugStudentsPaginationIslandFallback', window.debugStudentsPaginationIslandFallback);
  return {
    runtimeErrorCount: runtimeErrors.length,
    recentRuntimeErrors: runtimeErrors,
    legacyRender: legacyRender.ok ? legacyRender.value : legacyRender,
    eventActionBridge: inlineBridge.ok ? inlineBridge.value : inlineBridge,
    pendingDomainInvalidations: pendingDomain.ok ? pendingDomain.value : pendingDomain,
    studentsPaginationIslandFallback: studentsFallback.ok ? studentsFallback.value : studentsFallback
  };
}

function getDebugAvailability() {
  const names = [
    'debugAppVersion','debugRuntimeErrors','debugRuntimeSmokeTest','debugFinancialSafetySnapshot',
    'debugSuperAdminStatsReadiness','debugExcelImportVtfReadiness','debugProductionStabilityGate',
    'debugSuperAdminAggregationHardStop','debugSuperAdminQuotaGuard','debugSuperAdminServerRefresh',
    'debugClubStatsAutoCache','debugExcelImportVtfUpsert','debugMultiItemInventoryHydration',
    'debugLegacyRenderEntrypoints','debugEventActionBridge','debugInlineHandlerAudit'
  ];
  const missing = names.filter(n => typeof window[n] !== 'function');
  return { ok: missing.length === 0, checked: names.length, missing };
}

function getProductionStabilityGate() {
  const data = getDataHealthSnapshot();
  const financial = getFinancialSafetySnapshot();
  const superAdmin = getSuperAdminStatsReadiness();
  const excel = getExcelImportVtfReadiness();
  const runtime = getRuntimeStabilitySnapshot();
  const debugAvailability = getDebugAvailability();
  const recommendations = [];

  if (runtime.runtimeErrorCount > 0) recommendations.push('Có runtime errors gần đây — kiểm tra debugRuntimeErrors().');
  if (_isSuperAdmin() && superAdmin.superAdminStatsDom?.hasPlaceholder) recommendations.push('SuperAdmin còn CLB có cache UNKNOWN; không tự gọi Functions và không hiển thị số 0 giả.');
  if (!_isSuperAdmin() && data.profileCount === 0 && data.clubId) recommendations.push('Admin CLB có clubId nhưng profiles = 0 — kiểm tra listener/hydration.');
  if (!financial.ok) recommendations.push('Có bất thường giao dịch — kiểm tra debugFinancialSafetySnapshot().');
  if (!excel.ok) recommendations.push('Excel import VTF chưa sẵn sàng — kiểm tra handleImportExcel/debugExcelImportVtfUpsert.');
  if (!debugAvailability.ok) recommendations.push('Thiếu debug helper: ' + debugAvailability.missing.join(', '));

  const overallOk = financial.ok && excel.ok && debugAvailability.ok && runtime.runtimeErrorCount === 0 && superAdmin.ok;
  const result = {
    phase: PHASE,
    at: _nowIso(),
    buildVersion: window.APP_BUILD_VERSION || '',
    overallOk,
    data,
    financial,
    superAdmin,
    excel,
    runtime,
    debugAvailability,
    recommendations
  };
  console.log('[debugProductionStabilityGate]', result);
  console.table({ overallOk, role: data.role, clubId: data.clubId, profiles: data.profileCount, txs: data.transactionCount, inventory: data.inventoryCount, runtimeErrors: runtime.runtimeErrorCount });
  return result;
}

export const ProductionStabilityGate = {
  phase: PHASE,
  getDataHealthSnapshot,
  getFinancialSafetySnapshot,
  getSuperAdminStatsReadiness,
  getExcelImportVtfReadiness,
  getRuntimeStabilitySnapshot,
  getDebugAvailability,
  getProductionStabilityGate
};

export function initProductionStabilityGate() {
  if (window.__productionStabilityGateInitialized) return window.ProductionStabilityGate;
  window.__productionStabilityGateInitialized = true;
  window.ProductionStabilityGate = window.ProductionStabilityGate || ProductionStabilityGate;
  window.debugFinancialSafetySnapshot = window.debugFinancialSafetySnapshot || getFinancialSafetySnapshot;
  window.debugSuperAdminStatsReadiness = window.debugSuperAdminStatsReadiness || getSuperAdminStatsReadiness;
  window.debugExcelImportVtfReadiness = window.debugExcelImportVtfReadiness || getExcelImportVtfReadiness;
  window.debugProductionStabilityGate = window.debugProductionStabilityGate || getProductionStabilityGate;
  return window.ProductionStabilityGate;
}

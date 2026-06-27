// js/core/superAdminServerRefresh.js
// Phase 4K-6I-H — SuperAdmin Safe Server Summary Refresh
// Purpose:
// - SuperAdmin must not run client aggregation/counts for every club.
// - If root cache/stats is missing, safely call Cloud Function refreshSuperAdminSummaryForClub
//   one club at a time, with local throttle, circuit breaker, and graceful not-deployed handling.
// - This makes SuperAdmin stats auto-catch-up after Functions are deployed without reintroducing 429 storms.

const REGION = 'asia-southeast1';
const AUTO_MAX_PER_SESSION = 12;
const AUTO_DELAY_MS = 1600;
const CLUB_THROTTLE_MS = 6 * 60 * 60 * 1000; // once per club per 6h in this browser
const GLOBAL_DISABLE_KEY = 'tkd_sa_server_refresh_disabled_until_v1';
const CLUB_REFRESH_KEY_PREFIX = 'tkd_sa_server_refresh_at_v1:';

let _queue = [];
let _running = false;
let _inFlight = null;
let _lastResult = null;
let _attempts = 0;
let _successes = 0;
let _failures = 0;
let _notDeployed = false;
let _disabledReason = '';
let _lastRunAt = 0;
const _recent = [];

function _now() { return Date.now(); }
function _monthVN() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7); }
function _statsDocId(month) { return String(month || _monthVN()).replace('-', '_'); }
function _pushRecent(row) { _recent.push({ ts: Date.now(), ...row }); while (_recent.length > 40) _recent.shift(); }
function _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function _isSuperAdminRuntime() {
  try {
    if (typeof window.isSuperAdminRole === 'function' && window.isSuperAdminRole()) return true;
    const st = window.__store || {};
    const role = String(window.userRole || st.userRole || st.role || '').toLowerCase();
    return role === 'super_admin' || role === 'superadmin' || role === 'root' || !!st.currentUser?.isSuperAdmin;
  } catch (_) { return false; }
}
function _storageGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function _storageSet(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) {} }
function _disabledUntil() { return Number(_storageGet(GLOBAL_DISABLE_KEY) || 0); }
function _isGloballyDisabled() { return _disabledUntil() > Date.now(); }
function _disableFor(ms, reason) {
  _disabledReason = reason || 'disabled';
  _storageSet(GLOBAL_DISABLE_KEY, Date.now() + ms);
}
function _clubThrottleKey(cid) { return CLUB_REFRESH_KEY_PREFIX + String(cid || ''); }
function _clubLastRefreshAt(cid) { return Number(_storageGet(_clubThrottleKey(cid)) || 0); }
function _markClubRefresh(cid) { _storageSet(_clubThrottleKey(cid), Date.now()); }

function _firstFiniteNumber(...values) {
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function _readStatsIncomeTotal(stats) {
  if (!stats || typeof stats !== 'object') return null;
  return _firstFiniteNumber(
    stats['income.total'],
    stats.income && stats.income.total,
    stats.totalIncome,
    stats.totalRevenue,
    stats.revenue,
    stats.incomeTotal,
    stats.monthlyRevenue,
    stats.grossRevenue
  );
}

function _readMonthlyCachedValue(source, monthKey, statsDocId) {
  if (!source || typeof source !== 'object') return null;
  const direct = source[monthKey] !== undefined ? source[monthKey] : source[statsDocId];
  if (typeof direct === 'number' || typeof direct === 'string') return _firstFiniteNumber(direct);
  if (direct && typeof direct === 'object') {
    return _firstFiniteNumber(
      direct['income.total'],
      direct.income && direct.income.total,
      direct.totalIncome,
      direct.totalRevenue,
      direct.revenue,
      direct.incomeTotal,
      direct.total
    );
  }
  return null;
}

function hasClubSummaryCache(clubItem, options = {}) {
  const item = clubItem || {};
  const data = item.data || item || {};
  const monthKey = options.month || item.curMonth || _monthVN();
  const docId = _statsDocId(monthKey);
  const sa = data.superAdminStats || data.clubSummary || data.summary || {};
  const student = _firstFiniteNumber(
    item.studentCountForSummary,
    item.activeCount,
    item.profileCount,
    sa.activeCount,
    sa.activeStudents,
    sa.activeStudentCount,
    sa.profileCount,
    sa.totalStudents,
    data.cachedActiveCount,
    data.cachedStudentCount,
    data.activeStudentCount,
    data.activeCount,
    data.totalStudents,
    data.cachedProfileCount,
    data.profileCount,
    data.studentCount
  );
  const revenue = _firstFiniteNumber(
    item.revenueTotal,
    sa.revenueTotal,
    sa.monthlyIncome,
    sa.currentMonthRevenue,
    sa.incomeTotal,
    sa.income && sa.income.total,
    _readMonthlyCachedValue(data.cachedMonthlyRevenue, monthKey, docId),
    _readMonthlyCachedValue(data.monthlyRevenue, monthKey, docId),
    _readMonthlyCachedValue(data.revenueByMonth, monthKey, docId),
    data.cachedCurrentMonthRevenue,
    data.currentMonthRevenue,
    data.monthlyIncome,
    data.totalRevenue
  );
  return {
    hasStudent: Number.isFinite(Number(student)),
    hasRevenue: Number.isFinite(Number(revenue)),
    student,
    revenue,
    missing: !(Number.isFinite(Number(student)) && Number.isFinite(Number(revenue)))
  };
}

function _getFunctionsCallable() {
  const fb = window._fb_init || {};
  if (!fb.getFunctions || !fb.httpsCallable) {
    return { ok: false, reason: 'firebase-functions-sdk-not-loaded' };
  }
  try {
    const app = window._firebaseApp || undefined;
    const functions = app ? fb.getFunctions(app, REGION) : fb.getFunctions(undefined, REGION);
    const callable = fb.httpsCallable(functions, 'refreshSuperAdminSummaryForClub');
    return { ok: true, callable };
  } catch (e) {
    return { ok: false, reason: e?.message || 'functions-init-failed', error: e };
  }
}

function _isCallableMissingError(error) {
  const msg = String(error?.message || error?.code || error || '').toLowerCase();
  return msg.includes('not-found') || msg.includes('not found') || msg.includes('function') && msg.includes('not') || msg.includes('internal') && msg.includes('fetch');
}
function _isPermissionError(error) {
  const msg = String(error?.message || error?.code || error || '').toLowerCase();
  return msg.includes('permission-denied') || msg.includes('unauthenticated') || msg.includes('permission') || msg.includes('auth');
}

function _renderStatus(message, tone = 'info') {
  try {
    const statsEl = document.getElementById('superAdminStats');
    if (!statsEl) return;
    let el = document.getElementById('saServerSummaryRefreshStatus');
    if (!el) {
      el = document.createElement('div');
      el.id = 'saServerSummaryRefreshStatus';
      el.style.cssText = 'grid-column:1/-1;margin-top:8px;font-size:0.72rem;border-radius:10px;padding:8px 10px;font-weight:700;';
      statsEl.appendChild(el);
    }
    const styles = {
      info: 'background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;',
      ok: 'background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;',
      warn: 'background:#fffbeb;border:1px solid #fde68a;color:#92400e;',
      error: 'background:#fff1f2;border:1px solid #fecdd3;color:#be123c;'
    };
    el.style.cssText = 'grid-column:1/-1;margin-top:8px;font-size:0.72rem;border-radius:10px;padding:8px 10px;font-weight:700;' + (styles[tone] || styles.info);
    el.innerHTML = message;
  } catch (_) {}
}

function _applySummaryToClubData(cid, summary) {
  if (!cid || !summary) return false;
  const list = window._saClubData?.clubDataList || [];
  const item = list.find(x => String(x.cid) === String(cid));
  if (!item) return false;
  const data = item.data || (item.data = {});
  const month = summary.month || _monthVN();
  const docId = _statsDocId(month);
  const active = _firstFiniteNumber(summary.activeCount, summary.cachedActiveCount);
  const profile = _firstFiniteNumber(summary.profileCount, summary.totalStudents, active);
  const revenue = _firstFiniteNumber(summary.revenueTotal, summary.currentMonthRevenue, summary.monthlyIncome);
  if (active !== null) {
    item.activeCount = active;
    item.studentCountForSummary = active;
    data.cachedActiveCount = active;
    data.cachedStudentCount = active;
    data.activeStudentCount = active;
    data.activeCount = active;
  }
  if (profile !== null) {
    item.profileCount = profile;
    data.cachedProfileCount = profile;
    data.profileCount = profile;
    data.totalStudents = profile;
  }
  if (revenue !== null) {
    item.revenueTotal = revenue;
    item.hasRevenueSource = true;
    data.cachedCurrentMonthRevenue = revenue;
    data.currentMonthRevenue = revenue;
    data.cachedMonthlyRevenue = Object.assign({}, data.cachedMonthlyRevenue || {}, { [month]: revenue, [docId]: revenue });
    data.revenueByMonth = Object.assign({}, data.revenueByMonth || {}, { [month]: revenue, [docId]: revenue });
  }
  data.superAdminStats = Object.assign({}, data.superAdminStats || {}, {
    month,
    activeCount: active,
    profileCount: profile,
    revenueTotal: revenue,
    updatedAt: Date.now(),
    source: 'callable-refreshSuperAdminSummaryForClub'
  });
  return true;
}

async function refreshSuperAdminSummaryForClubViaServer(clubId, options = {}) {
  if (!clubId) return { ok: false, reason: 'missing-club-id' };
  if (!_isSuperAdminRuntime()) return { ok: false, reason: 'not-superadmin-runtime' };
  if (_isGloballyDisabled()) return { ok: false, reason: 'global-disabled', disabledUntil: _disabledUntil(), disabledReason: _disabledReason };

  const fn = _getFunctionsCallable();
  if (!fn.ok) {
    _notDeployed = true;
    _disableFor(10 * 60 * 1000, fn.reason);
    _lastResult = { ok: false, clubId, reason: fn.reason };
    _renderStatus('⚠️ Chưa tải được Firebase Functions SDK hoặc Functions chưa sẵn sàng. SuperAdmin sẽ dùng cache hiện có.', 'warn');
    return _lastResult;
  }

  _attempts++;
  _pushRecent({ type: 'attempt', clubId, reason: options.reason || 'manual' });
  try {
    const res = await fn.callable({ clubId, month: options.month || _monthVN() });
    const data = res && res.data ? res.data : {};
    _successes++;
    _markClubRefresh(clubId);
    _applySummaryToClubData(clubId, data);
    _lastResult = { ok: true, clubId, data, at: Date.now() };
    _pushRecent({ type: 'success', clubId, activeCount: data.activeCount, revenueTotal: data.revenueTotal });
    return _lastResult;
  } catch (e) {
    _failures++;
    const msg = e?.message || String(e);
    const code = e?.code || '';
    if (_isCallableMissingError(e)) {
      _notDeployed = true;
      _disableFor(30 * 60 * 1000, 'functions-not-deployed');
    } else if (_isPermissionError(e)) {
      _disableFor(30 * 60 * 1000, 'permission-denied');
    } else {
      _disableFor(3 * 60 * 1000, 'callable-failed');
    }
    _lastResult = { ok: false, clubId, code, reason: msg, at: Date.now() };
    _pushRecent({ type: 'failure', clubId, code, reason: msg });
    return _lastResult;
  }
}

function _missingClubItems(clubDataList, options = {}) {
  const list = Array.isArray(clubDataList) ? clubDataList : [];
  const now = Date.now();
  const out = [];
  list.forEach(item => {
    const cid = item.cid;
    const state = hasClubSummaryCache(item, options);
    if (!state.missing) return;
    const last = _clubLastRefreshAt(cid);
    if (!options.force && last && now - last < CLUB_THROTTLE_MS) return;
    out.push({ cid, item, state });
  });
  return out;
}

async function maybeAutoRefreshSuperAdminSummaries(clubDataList, options = {}) {
  if (!_isSuperAdminRuntime()) return { ok: false, reason: 'not-superadmin-runtime' };
  if (_running || _inFlight) return { ok: true, skipped: true, reason: 'already-running' };
  if (_isGloballyDisabled()) return { ok: false, reason: 'global-disabled', disabledUntil: _disabledUntil(), disabledReason: _disabledReason };
  if (window.__saDisableServerSummaryAutoRefresh === true) return { ok: false, reason: 'auto-refresh-disabled' };

  const fn = _getFunctionsCallable();
  if (!fn.ok) {
    _notDeployed = true;
    _disableFor(10 * 60 * 1000, fn.reason);
    _renderStatus('⚠️ Chưa cấu hình Firebase Functions SDK / chưa deploy Functions. SuperAdmin đang dùng cache hiện có.', 'warn');
    return { ok: false, reason: fn.reason };
  }

  const missing = _missingClubItems(clubDataList, options);
  const max = Math.max(0, Math.min(Number(options.maxPerSession || AUTO_MAX_PER_SESSION), missing.length));
  if (max <= 0) {
    _renderStatus('✅ SuperAdmin đang dùng dữ liệu cache/stats. Không cần cập nhật nền lúc này.', 'ok');
    return { ok: true, queued: 0, missing: missing.length };
  }

  _queue = missing.slice(0, max).map(x => x.cid);
  _running = true;
  _lastRunAt = Date.now();
  _renderStatus(`🔄 Đang tự cập nhật thống kê SuperAdmin nền: 0/${_queue.length} CLB. Hệ thống gọi Cloud Function tuần tự, không dùng client aggregation ở trình duyệt.`, 'info');

  _inFlight = (async () => {
    let done = 0;
    let ok = 0;
    const total = _queue.length;
    while (_queue.length > 0) {
      const cid = _queue.shift();
      const res = await refreshSuperAdminSummaryForClubViaServer(cid, { reason: options.reason || 'auto-missing-cache', month: options.month });
      done++;
      if (res && res.ok) ok++;
      if (!res || !res.ok) {
        _renderStatus(`⚠️ Tạm dừng cập nhật thống kê nền tại CLB ${cid}: ${res?.reason || 'không rõ lỗi'}. Các số liệu còn thiếu sẽ tiếp tục dùng cache/--.`, 'warn');
        break;
      }
      _renderStatus(`🔄 Đang tự cập nhật thống kê SuperAdmin nền: ${done}/${total} CLB.`, 'info');
      await _sleep(Number(options.delayMs || AUTO_DELAY_MS));
    }
    _running = false;
    _inFlight = null;
    if (ok > 0 && window._saClubData && typeof window._renderSAClubRows === 'function') {
      try {
        window._renderSAClubRows(window._saClubData.clubDataList, window._saClubData.today, window._saClubData.in30Days);
      } catch (e) { console.warn('[SuperAdminServerRefresh] row rerender failed:', e?.message || e); }
      setTimeout(() => { try { window.loadSuperAdminData?.(); } catch (_) {} }, 600);
    }
    _renderStatus(ok > 0 ? `✅ Đã cập nhật thống kê nền ${ok}/${total} CLB. Nếu còn CLB hiển thị --, hệ thống sẽ tiếp tục ở lần mở sau hoặc khi Functions chạy lịch.` : '⚠️ Chưa cập nhật được thống kê nền. Kiểm tra deploy Cloud Functions/quyền SuperAdmin.', ok > 0 ? 'ok' : 'warn');
    return { ok: ok > 0, refreshed: ok, attempted: done, total };
  })();
  return _inFlight;
}

function getSuperAdminServerRefreshState() {
  return {
    running: _running,
    inFlight: !!_inFlight,
    queueLength: _queue.length,
    attempts: _attempts,
    successes: _successes,
    failures: _failures,
    notDeployed: _notDeployed,
    disabledUntil: _disabledUntil(),
    disabled: _isGloballyDisabled(),
    disabledReason: _disabledReason,
    lastRunAt: _lastRunAt,
    lastResult: _lastResult,
    recent: _recent.slice(),
    hasFunctionsSdk: !!(window._fb_init && window._fb_init.getFunctions && window._fb_init.httpsCallable),
    isSuperAdminRuntime: _isSuperAdminRuntime(),
  };
}

function initSuperAdminServerRefresh() {
  window.SuperAdminServerRefresh = {
    refreshSuperAdminSummaryForClubViaServer,
    maybeAutoRefreshSuperAdminSummaries,
    hasClubSummaryCache,
    getSuperAdminServerRefreshState,
  };
  window.refreshSuperAdminSummaryForClubViaServer = refreshSuperAdminSummaryForClubViaServer;
  window.maybeAutoRefreshSuperAdminSummaries = maybeAutoRefreshSuperAdminSummaries;
  window.debugSuperAdminServerRefresh = function() {
    const result = getSuperAdminServerRefreshState();
    console.log('[debugSuperAdminServerRefresh]', result);
    console.table({
      running: result.running,
      queueLength: result.queueLength,
      attempts: result.attempts,
      successes: result.successes,
      failures: result.failures,
      disabled: result.disabled,
      disabledReason: result.disabledReason,
      hasFunctionsSdk: result.hasFunctionsSdk,
    });
    return result;
  };
}

export {
  initSuperAdminServerRefresh,
  refreshSuperAdminSummaryForClubViaServer,
  maybeAutoRefreshSuperAdminSummaries,
  hasClubSummaryCache,
  getSuperAdminServerRefreshState,
};

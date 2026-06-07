// js/core/clubStatsAutoCache.js
// Phase 4K-6I-F — Admin-side automatic SuperAdmin stats cache sync
// Purpose:
// - SuperAdmin must NOT aggregate/count all club subcollections on login.
// - Each Admin client already has profiles/transactions for its own club in memory.
// - This module computes lightweight cached summary fields and writes them to clubs/{clubId}.
// - SuperAdmin then reads O(1) club root cache fields without runAggregationQuery storms.

const CACHE_TTL_MS = 5 * 60 * 1000;
const BOOTSTRAP_ATTEMPTS = 8;
const BOOTSTRAP_DELAY_MS = 3500;

let _started = false;
let _timer = null;
let _lastSyncAt = 0;
let _lastFingerprint = '';
let _lastResult = null;
let _syncInFlight = null;

function _nowVNDate() {
  return new Date(Date.now() + 7 * 3600 * 1000);
}

function getCurrentMonthVN() {
  return _nowVNDate().toISOString().slice(0, 7);
}

function _statsDocId(monthKey) {
  return String(monthKey || getCurrentMonthVN()).replace('-', '_');
}

function _ctx(reason = 'club-stats-auto-cache') {
  return typeof window.getAppContext === 'function' ? (window.getAppContext(reason) || {}) : {};
}

function _isSuperAdminRuntime() {
  try {
    if (typeof window.isSuperAdminRole === 'function' && window.isSuperAdminRole()) return true;
    const st = window.__store || {};
    if (st.currentUser && st.currentUser.isSuperAdmin) return true;
    const role = String(window.userRole || st.userRole || st.role || '').toLowerCase();
    return role === 'super_admin' || role === 'superadmin' || role === 'root';
  } catch (_) {
    return false;
  }
}

function _clubId() {
  const c = _ctx('club-stats-club-id');
  return c.clubId || c.currentClubId || (window.__store && (window.__store.clubId || window.__store.currentClubId)) || window.currentClubId || '';
}

function _profilesMap() {
  const st = window.__store || {};
  return st.profiles || window.allProfiles || {};
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

function _txMonth(tx) {
  if (!tx || typeof tx !== 'object') return '';
  const candidates = [tx.txMonth, tx.month, tx.revenueMonth, tx.periodMonth, tx.billingMonth, tx.date, tx.createdAt];
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c);
    const m = s.match(/(20\d{2})[-_/](0[1-9]|1[0-2])/);
    if (m) return `${m[1]}-${m[2]}`;
  }
  if (tx.timestamp) {
    const d = new Date(Number(tx.timestamp));
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return '';
}

function _isExpenseTx(tx) {
  const type = String(tx?.type || tx?.kind || tx?.category || '').toLowerCase();
  return type.includes('chi') || type.includes('expense') || tx?.isExpense === true || tx?.direction === 'expense';
}

function _isIncomeTx(tx) {
  if (!tx || typeof tx !== 'object') return false;
  const amount = Number(tx.amount || tx.total || tx.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (_isExpenseTx(tx)) return false;
  const type = String(tx.type || '').toLowerCase();
  // Known income types in this app are usually tuition, exam fee, inventory/uniform, admission, other income.
  if (!type) return true;
  if (type.includes('thu') || type.includes('học phí') || type.includes('hoc phi') || type.includes('thi') || type.includes('võ') || type.includes('vo') || type.includes('admission') || type.includes('income')) return true;
  // Fallback: positive non-expense transaction counts as income for SuperAdmin current month summary.
  return true;
}

function computeClubStatsCache(monthKey = getCurrentMonthVN()) {
  const profiles = _profilesMap();
  const txs = _transactionsArray();
  const inv = _inventoryArray();
  const profileEntries = Object.entries(profiles || {});
  let activeCount = 0;
  let trialCount = 0;
  let quitCount = 0;
  for (const [, p] of profileEntries) {
    const st = _normalizeStatus(p);
    if (st === 'quit') quitCount++;
    else if (st === 'trial') { trialCount++; activeCount++; }
    else activeCount++;
  }

  let monthlyIncome = 0;
  let monthlyExpense = 0;
  let monthlyTxCount = 0;
  const monthTxs = [];
  for (const tx of txs) {
    if (_txMonth(tx) !== monthKey) continue;
    monthTxs.push(tx);
    monthlyTxCount++;
    const amt = Number(tx.amount || tx.total || tx.value || 0);
    if (!Number.isFinite(amt)) continue;
    if (_isExpenseTx(tx)) monthlyExpense += Math.abs(amt);
    else if (_isIncomeTx(tx)) monthlyIncome += amt;
  }

  return {
    month: monthKey,
    statsDocId: _statsDocId(monthKey),
    activeCount,
    trialCount,
    quitCount,
    profileCount: profileEntries.length,
    txCount: txs.length,
    inventoryCount: inv.length,
    monthlyIncome,
    monthlyExpense,
    monthlyProfit: monthlyIncome - monthlyExpense,
    monthlyTxCount,
    source: 'admin-client-auto-cache',
    computedAt: Date.now(),
    ready: profileEntries.length > 0 || txs.length > 0 || inv.length > 0,
  };
}

function _fingerprint(stats) {
  return [stats.month, stats.activeCount, stats.profileCount, stats.txCount, stats.inventoryCount, stats.monthlyIncome, stats.monthlyExpense, stats.monthlyTxCount].join('|');
}

async function syncClubStatsCache(reason = 'manual') {
  if (_syncInFlight) return _syncInFlight;
  _syncInFlight = (async () => {
    const cid = _clubId();
    const fb = window._fb_init || {};
    const c = _ctx('club-stats-sync');
    const db = c.db || (window.__store && window.__store.db);
    const setDoc = fb.setDoc;
    const doc = fb.doc;

    const blockedReason = !cid ? 'missing-club-id' :
      !db ? 'missing-db' :
      !setDoc || !doc ? 'missing-firestore-helpers' :
      _isSuperAdminRuntime() ? 'skip-superadmin-runtime' : '';

    if (blockedReason) {
      _lastResult = { ok: false, reason: blockedReason, at: Date.now() };
      return _lastResult;
    }

    const monthKey = getCurrentMonthVN();
    const stats = computeClubStatsCache(monthKey);
    if (!stats.ready) {
      _lastResult = { ok: false, reason: 'data-not-ready', clubId: cid, stats, at: Date.now() };
      return _lastResult;
    }

    const fp = _fingerprint(stats);
    const now = Date.now();
    if (fp === _lastFingerprint && now - _lastSyncAt < CACHE_TTL_MS) {
      _lastResult = { ok: true, skipped: true, reason: 'unchanged-ttl', clubId: cid, stats, at: now };
      return _lastResult;
    }

    const statsDocId = stats.statsDocId;
    const payload = {
      cachedActiveCount: stats.activeCount,
      cachedStudentCount: stats.activeCount,
      activeStudentCount: stats.activeCount,
      totalStudents: stats.profileCount,
      cachedProfileCount: stats.profileCount,
      cachedTxCount: stats.txCount,
      cachedInvCount: stats.inventoryCount,
      cachedCurrentMonthRevenue: stats.monthlyIncome,
      currentMonthRevenue: stats.monthlyIncome,
      cachedMonthlyRevenue: {
        [monthKey]: stats.monthlyIncome,
        [statsDocId]: stats.monthlyIncome,
      },
      revenueByMonth: {
        [monthKey]: stats.monthlyIncome,
        [statsDocId]: stats.monthlyIncome,
      },
      superAdminStats: {
        month: monthKey,
        activeCount: stats.activeCount,
        profileCount: stats.profileCount,
        txCount: stats.txCount,
        inventoryCount: stats.inventoryCount,
        revenueTotal: stats.monthlyIncome,
        expenseTotal: stats.monthlyExpense,
        profit: stats.monthlyProfit,
        monthlyTxCount: stats.monthlyTxCount,
        updatedAt: now,
        source: stats.source,
      },
      cachedCountUpdatedAt: now,
      statsUpdatedAt: now,
      statsSource: stats.source,
    };

    let rootWriteOk = false;
    let statsWriteOk = false;
    try {
      await setDoc(doc(db, 'clubs', cid), payload, { merge: true });
      rootWriteOk = true;
    } catch (e) {
      console.warn('[ClubStatsAutoCache] root cache write failed:', e?.message || e);
    }

    // Optional stats doc mirror. Some rules may block client writes to stats; root cache above is enough for SuperAdmin.
    try {
      await setDoc(doc(db, 'clubs', cid, 'stats', statsDocId), {
        month: monthKey,
        income: { total: stats.monthlyIncome },
        expense: { total: stats.monthlyExpense },
        profit: stats.monthlyProfit,
        txCount: stats.monthlyTxCount,
        activeCount: stats.activeCount,
        profileCount: stats.profileCount,
        totalStudents: stats.profileCount,
        source: stats.source,
        updatedAt: now,
      }, { merge: true });
      statsWriteOk = true;
    } catch (_) {
      // Stats collection may be Cloud Functions-only. Do not warn loudly.
    }

    if (rootWriteOk) {
      _lastFingerprint = fp;
      _lastSyncAt = now;
    }
    _lastResult = { ok: rootWriteOk, rootWriteOk, statsWriteOk, clubId: cid, reason, stats, at: now };
    if (rootWriteOk) console.info('[ClubStatsAutoCache] synced SuperAdmin cache', { cid, active: stats.activeCount, revenue: stats.monthlyIncome, reason });
    return _lastResult;
  })().finally(() => { _syncInFlight = null; });
  return _syncInFlight;
}

function scheduleClubStatsAutoCacheSync(reason = 'schedule') {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    syncClubStatsCache(reason).catch(e => console.warn('[ClubStatsAutoCache] sync failed:', e?.message || e));
  }, 800);
}

function initClubStatsAutoCache() {
  if (_started) return;
  _started = true;

  let attempts = 0;
  const tick = () => {
    attempts++;
    scheduleClubStatsAutoCacheSync('bootstrap-attempt-' + attempts);
    if (attempts < BOOTSTRAP_ATTEMPTS) setTimeout(tick, BOOTSTRAP_DELAY_MS);
  };
  setTimeout(tick, 1200);

  window.addEventListener('app-context-ready', () => scheduleClubStatsAutoCacheSync('app-context-ready'));
  window.addEventListener('focus', () => scheduleClubStatsAutoCacheSync('window-focus'));

  window.computeClubStatsCache = computeClubStatsCache;
  window.syncClubStatsCache = syncClubStatsCache;
  window.debugClubStatsAutoCache = function() {
    const stats = computeClubStatsCache();
    const result = {
      started: _started,
      lastSyncAt: _lastSyncAt,
      lastFingerprint: _lastFingerprint,
      lastResult: _lastResult,
      isSuperAdminRuntime: _isSuperAdminRuntime(),
      clubId: _clubId(),
      currentStatsPreview: stats,
      recommendations: [
        'Admin/HLV đăng nhập sẽ tự cập nhật cached counts/revenue lên clubs/{clubId}.',
        'SuperAdmin đọc root cache O(1), không chạy runAggregationQuery hàng loạt.',
        'Nếu CLB cũ chưa có cache, chỉ cần Admin CLB đó đăng nhập/mở app một lần để tự đồng bộ.',
      ],
    };
    console.log('[debugClubStatsAutoCache]', result);
    return result;
  };
}

export { initClubStatsAutoCache, syncClubStatsCache, computeClubStatsCache };

/**
 * listenerOwnershipBoundary.js — Phase 4K-6M
 * ────────────────────────────────────────────────────────────────────
 * Listener Ownership Boundary + Render Event Cleanup.
 *
 * Mục tiêu:
 * - Tạo registry nhẹ cho DOM/window/document event listeners có owner rõ ràng.
 * - Bổ sung debug hợp nhất giữa DOM events + Firestore listener registry cũ.
 * - Theo dõi scheduleRender/render-event call mà KHÔNG thay đổi business logic.
 * - Hỗ trợ cleanup theo owner/scope/tabId cho các listener mới migrate.
 *
 * Safety:
 * - Không ghi Firestore.
 * - Không thay đổi processMultiItem/quickPay/deleteTx/paidUntil.
 * - Không tự remove anonymous legacy listeners đã tồn tại.
 * - scheduleRender wrapper chỉ ghi metrics rồi gọi nguyên hàm gốc.
 */

const PHASE = '4K-6M-listener-ownership-boundary-render-event-cleanup-20260608';
const MAX_RECENT = 80;

function _now() { return Date.now(); }

const _state = {
  started: false,
  phase: PHASE,
  events: new Map(),
  metrics: {
    totalBound: 0,
    totalRemoved: 0,
    duplicateRebound: 0,
    bindErrors: 0,
    removeErrors: 0,
    tabEnterCount: 0,
    tabLeaveCount: 0,
  },
  render: {
    wrapped: false,
    totalScheduleCalls: 0,
    forceLegacyCalls: 0,
    unknownReasonCalls: 0,
    duplicateBurstCalls: 0,
    lastReason: '',
    lastAt: 0,
    byReason: {},
    byDomain: {},
    recent: [],
  },
  tabHistory: [],
};

function _pushRecent(list, item, limit = MAX_RECENT) {
  list.push(item);
  if (list.length > limit) list.shift();
}

function _targetLabel(target) {
  if (!target) return 'null';
  if (target === window) return 'window';
  if (target === document) return 'document';
  if (target.id) return '#' + target.id;
  if (target.className && typeof target.className === 'string') return target.tagName + '.' + target.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.');
  return target.tagName || Object.prototype.toString.call(target);
}

function _classifyReason(reason) {
  const s = String(reason || '').toLowerCase();
  if (s.includes('profile') || s.includes('student') || s.includes('active') || s.includes('quit')) return 'students';
  if (s.includes('transaction') || s.includes('finance') || s.includes('tuition') || s.includes('fee') || s.includes('tx')) return 'finance';
  if (s.includes('debt') || s.includes('bao-no') || s.includes('báo nợ')) return 'debt';
  if (s.includes('dashboard') || s.includes('overview') || s.includes('summary')) return 'dashboard';
  if (s.includes('inventory') || s.includes('kho') || s.includes('uniform')) return 'inventory';
  if (s.includes('exam') || s.includes('thi')) return 'exam';
  if (s.includes('attendance') || s.includes('diem-danh') || s.includes('điểm danh')) return 'attendance';
  if (s.includes('settings') || s.includes('config')) return 'settings';
  if (s.includes('superadmin') || s.includes('club')) return 'superadmin';
  return 'unknown';
}

function _recordRenderSchedule(reason, opts) {
  const r = String(reason || 'unknown');
  const domain = _classifyReason(r);
  const now = _now();
  _state.render.totalScheduleCalls++;
  _state.render.byReason[r] = (_state.render.byReason[r] || 0) + 1;
  _state.render.byDomain[domain] = (_state.render.byDomain[domain] || 0) + 1;
  if (!reason) _state.render.unknownReasonCalls++;
  if (opts && opts.forceLegacyRender) _state.render.forceLegacyCalls++;
  if (_state.render.lastReason === r && now - _state.render.lastAt < 120) {
    _state.render.duplicateBurstCalls++;
  }
  _state.render.lastReason = r;
  _state.render.lastAt = now;
  _pushRecent(_state.render.recent, {
    at: new Date(now).toISOString(),
    reason: r,
    domain,
    forceLegacy: !!(opts && opts.forceLegacyRender),
    activeTab: typeof window.getCurrentActiveTabId === 'function' ? window.getCurrentActiveTabId() : '',
  });
}

function _wrapScheduleRender() {
  if (_state.render.wrapped) return true;
  if (typeof window.scheduleRender !== 'function') return false;
  if (window.scheduleRender.__listenerOwnershipWrapped) {
    _state.render.wrapped = true;
    return true;
  }
  const original = window.scheduleRender;
  function scheduleRenderWithOwnershipMetrics(reason, opts) {
    try { _recordRenderSchedule(reason, opts); } catch (_) {}
    return original.apply(this, arguments);
  }
  scheduleRenderWithOwnershipMetrics.__listenerOwnershipWrapped = true;
  scheduleRenderWithOwnershipMetrics.__originalScheduleRender = original;
  window.scheduleRender = scheduleRenderWithOwnershipMetrics;
  _state.render.wrapped = true;
  return true;
}

/**
 * Bind DOM event có owner/key. Nếu key đã tồn tại thì remove listener cũ trước.
 * @param {EventTarget} target
 * @param {string} type
 * @param {Function} handler
 * @param {string} key
 * @param {AddEventListenerOptions|boolean} [options]
 * @param {{owner?:string, scope?:string, tabId?:string, reason?:string}} [meta]
 * @returns {Function} unsubscribe
 */
function addOwnedEventListener(target, type, handler, key, options, meta) {
  meta = meta || {};
  if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function' || !type || !key) {
    _state.metrics.bindErrors++;
    return function noopOwnedEventUnsub() {};
  }

  if (_state.events.has(key)) {
    _state.metrics.duplicateRebound++;
    removeOwnedEventListener(key, 'duplicate-rebind');
  }

  try {
    target.addEventListener(type, handler, options);
    const entry = {
      key,
      type,
      targetLabel: _targetLabel(target),
      target,
      handler,
      options,
      owner: meta.owner || 'legacy-dom',
      scope: meta.scope || 'global',
      tabId: meta.tabId || '',
      reason: meta.reason || '',
      createdAt: _now(),
      removed: false,
    };
    _state.events.set(key, entry);
    _state.metrics.totalBound++;
    return () => removeOwnedEventListener(key, 'unsubscribe-callback');
  } catch (err) {
    _state.metrics.bindErrors++;
    console.warn('[ListenerOwnershipBoundary] addOwnedEventListener failed:', key, err);
    return function noopOwnedEventUnsub() {};
  }
}

function removeOwnedEventListener(key, reason) {
  const entry = _state.events.get(key);
  if (!entry) return false;
  if (entry.removed) {
    _state.events.delete(key);
    return false;
  }
  entry.removed = true;
  try {
    entry.target.removeEventListener(entry.type, entry.handler, entry.options);
  } catch (err) {
    _state.metrics.removeErrors++;
    console.warn('[ListenerOwnershipBoundary] removeOwnedEventListener failed:', key, err);
  }
  _state.events.delete(key);
  _state.metrics.totalRemoved++;
  return true;
}

function cleanupOwnedEventsByOwner(owner, reason = 'cleanup-owner') {
  const keys = [];
  _state.events.forEach((entry, key) => { if (entry.owner === owner) keys.push(key); });
  keys.forEach(key => removeOwnedEventListener(key, reason));
  return keys.length;
}

function cleanupOwnedEventsByScope(scope, reason = 'cleanup-scope') {
  const keys = [];
  _state.events.forEach((entry, key) => { if (entry.scope === scope) keys.push(key); });
  keys.forEach(key => removeOwnedEventListener(key, reason));
  return keys.length;
}

function cleanupOwnedEventsByTabId(tabId, reason = 'cleanup-tab') {
  const keys = [];
  _state.events.forEach((entry, key) => { if (entry.tabId === tabId) keys.push(key); });
  keys.forEach(key => removeOwnedEventListener(key, reason));
  return keys.length;
}

function onTabEnter(tabId, reason = 'tab-enter') {
  _state.metrics.tabEnterCount++;
  _pushRecent(_state.tabHistory, { at: new Date().toISOString(), action: 'enter', tabId, reason }, 40);
}

function onTabLeave(tabId, reason = 'tab-leave') {
  _state.metrics.tabLeaveCount++;
  const cleaned = cleanupOwnedEventsByTabId(tabId, reason);
  _pushRecent(_state.tabHistory, { at: new Date().toISOString(), action: 'leave', tabId, reason, cleaned }, 40);
  return cleaned;
}

function getOwnedEventMetrics() {
  const activeEntries = [];
  const byOwner = {};
  const byScope = {};
  _state.events.forEach((entry) => {
    byOwner[entry.owner] = (byOwner[entry.owner] || 0) + 1;
    byScope[entry.scope] = (byScope[entry.scope] || 0) + 1;
    activeEntries.push({
      key: entry.key,
      owner: entry.owner,
      scope: entry.scope,
      tabId: entry.tabId,
      type: entry.type,
      target: entry.targetLabel,
      ageMs: _now() - entry.createdAt,
      reason: entry.reason,
    });
  });
  return {
    phase: PHASE,
    started: _state.started,
    totalBound: _state.metrics.totalBound,
    totalRemoved: _state.metrics.totalRemoved,
    duplicateRebound: _state.metrics.duplicateRebound,
    bindErrors: _state.metrics.bindErrors,
    removeErrors: _state.metrics.removeErrors,
    activeCount: _state.events.size,
    byOwner,
    byScope,
    activeEntries,
    tabEnterCount: _state.metrics.tabEnterCount,
    tabLeaveCount: _state.metrics.tabLeaveCount,
    tabHistory: _state.tabHistory.slice(-12),
  };
}

function getRenderEventCleanupMetrics() {
  return {
    phase: PHASE,
    wrapped: _state.render.wrapped,
    totalScheduleCalls: _state.render.totalScheduleCalls,
    forceLegacyCalls: _state.render.forceLegacyCalls,
    unknownReasonCalls: _state.render.unknownReasonCalls,
    duplicateBurstCalls: _state.render.duplicateBurstCalls,
    byReason: { ..._state.render.byReason },
    byDomain: { ..._state.render.byDomain },
    recent: _state.render.recent.slice(-20),
    pendingDomainInvalidations: Array.isArray(window.__pendingDomainInvalidations) ? window.__pendingDomainInvalidations.length : 0,
  };
}

function debugEventBindingOwnership() {
  const result = getOwnedEventMetrics();
  console.table(result.activeEntries || []);
  console.log('[debugEventBindingOwnership]', result);
  return result;
}

function debugRenderEventCleanup() {
  const result = getRenderEventCleanupMetrics();
  console.table({
    wrapped: result.wrapped,
    totalScheduleCalls: result.totalScheduleCalls,
    forceLegacyCalls: result.forceLegacyCalls,
    unknownReasonCalls: result.unknownReasonCalls,
    duplicateBurstCalls: result.duplicateBurstCalls,
    pendingDomainInvalidations: result.pendingDomainInvalidations,
  });
  console.log('[debugRenderEventCleanup]', result);
  return result;
}

function debugListenerOwnershipBoundary() {
  const eventMetrics = getOwnedEventMetrics();
  const renderMetrics = getRenderEventCleanupMetrics();
  const firestoreMetrics = typeof window.getListenerMetrics === 'function'
    ? window.getListenerMetrics()
    : null;
  const legacyRender = typeof window.debugLegacyRenderEntrypoints === 'function'
    ? window.debugLegacyRenderEntrypoints()
    : null;

  const result = {
    phase: PHASE,
    started: _state.started,
    hasAddOwnedEventListener: typeof window.addOwnedEventListener === 'function',
    eventMetrics,
    firestoreMetrics: firestoreMetrics ? {
      activeCount: firestoreMetrics.activeCount,
      duplicateAttempted: firestoreMetrics.duplicateAttempted,
      duplicatePreventedBeforeCreate: firestoreMetrics.duplicatePreventedBeforeCreate,
      legacyActiveListeners: firestoreMetrics.legacyActiveListeners,
      byOwner: firestoreMetrics.byOwner,
      byScope: firestoreMetrics.byScope,
    } : null,
    renderMetrics,
    legacyRenderSummary: legacyRender && legacyRender.summary ? legacyRender.summary : null,
    recommendations: [],
  };

  if (renderMetrics.unknownReasonCalls > 0) {
    result.recommendations.push('Một số scheduleRender thiếu reason rõ ràng; khi refactor tiếp nên thay bằng invalidate domain cụ thể.');
  }
  if (firestoreMetrics && firestoreMetrics.duplicateAttempted > 0) {
    result.recommendations.push('Có duplicate Firestore listener; cần migrate listener đó sang safeRegisterSnapshot trước khi tạo onSnapshot.');
  }
  if (eventMetrics.duplicateRebound > 0) {
    result.recommendations.push('Có DOM event key được re-bind; kiểm tra module init có gọi lặp không.');
  }

  console.table({
    eventActive: eventMetrics.activeCount,
    firestoreActive: firestoreMetrics ? firestoreMetrics.activeCount : -1,
    legacyActiveListeners: firestoreMetrics ? firestoreMetrics.legacyActiveListeners : -1,
    scheduleCalls: renderMetrics.totalScheduleCalls,
    unknownReasonCalls: renderMetrics.unknownReasonCalls,
    duplicateBurstCalls: renderMetrics.duplicateBurstCalls,
  });
  console.log('[debugListenerOwnershipBoundary]', result);
  return result;
}

function initListenerOwnershipBoundary() {
  if (_state.started) return ListenerOwnershipBoundary;
  _state.started = true;

  window.ListenerOwnershipBoundary = ListenerOwnershipBoundary;
  window.addOwnedEventListener = addOwnedEventListener;
  window.removeOwnedEventListener = removeOwnedEventListener;
  window.cleanupOwnedEventsByOwner = cleanupOwnedEventsByOwner;
  window.cleanupOwnedEventsByScope = cleanupOwnedEventsByScope;
  window.cleanupOwnedEventsByTabId = cleanupOwnedEventsByTabId;
  window.debugListenerOwnershipBoundary = debugListenerOwnershipBoundary;
  window.debugEventBindingOwnership = debugEventBindingOwnership;
  window.debugRenderEventCleanup = debugRenderEventCleanup;

  // scheduleRender có thể được app.js tạo trước main.js; nếu chưa có, thử lại sau.
  _wrapScheduleRender();
  setTimeout(_wrapScheduleRender, 0);
  setTimeout(_wrapScheduleRender, 500);

  return ListenerOwnershipBoundary;
}

const ListenerOwnershipBoundary = {
  phase: PHASE,
  init: initListenerOwnershipBoundary,
  addOwnedEventListener,
  removeOwnedEventListener,
  cleanupOwnedEventsByOwner,
  cleanupOwnedEventsByScope,
  cleanupOwnedEventsByTabId,
  onTabEnter,
  onTabLeave,
  getOwnedEventMetrics,
  getRenderEventCleanupMetrics,
  debugListenerOwnershipBoundary,
  debugEventBindingOwnership,
  debugRenderEventCleanup,
};

export { ListenerOwnershipBoundary, initListenerOwnershipBoundary };

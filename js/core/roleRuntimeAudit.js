/**
 * roleRuntimeAudit.js — Phase 4K-6V5O
 * Role-Based Runtime Audit + Read/Render Profiler
 *
 * Debug-only diagnostics. Does not mount Firestore listeners, does not write data,
 * and does not change business logic. It only snapshots already-existing runtime
 * metrics: role/club/tab, listener registry, large-list metrics, render scheduler,
 * search helper state, and basic profile data consistency.
 */

const VERSION = '4K-6V5O-role-runtime-audit-profiler-20260704';
const ENABLE_FLAG = 'runtimeAudit';
const DEFAULT_PANEL_ID = 'runtime-audit-panel';

const TAB_DOMAIN = {
  dashboard: 'dashboard',
  active: 'students.activeList',
  debt: 'students.debtList',
  quit: 'students.quitList',
  tx: 'tx.txList',
  expense: 'tx.txList',
  inventory: 'inventory.inventoryList',
  attendance: 'attendance.list',
  exam: 'exam.list',
  superadmin: 'superadmin',
};

const ROLE_EXPECTATIONS = {
  super_admin: {
    allowedPrefixes: ['superadmin', 'global:', 'sa:', 'admin:', 'auth:', 'settings'],
    notes: 'SuperAdmin may read cross-club metadata; should not mount club student listeners unless drilling into a club.'
  },
  admin: {
    allowedPrefixes: ['global:', 'students', 'settings', 'finance', 'inventory', 'attendance', 'exam', 'dashboard', 'tx'],
    notes: 'Club admin can mount club-wide operational tabs, but should avoid duplicate listeners.'
  },
  coach: {
    allowedPrefixes: ['coach', 'attendance', 'profiles:coach', 'global:profiles:coach', 'settings'],
    forbiddenHints: ['finance', 'inventoryActiveDebts', 'transactions', 'tx.', 'stats', 'debt'],
    notes: 'Coach should stay attendance-only and branch-scoped.'
  },
  viewer: {
    allowedPrefixes: ['dashboard', 'public', 'settings'],
    notes: 'Viewer should be read-only/minimal.'
  },
};

function _now() { return Date.now(); }

function _safe(fn, fallback) {
  try { return fn(); } catch (_) { return fallback; }
}

function _readFlag() {
  return _safe(() => (
    window.__RUNTIME_AUDIT === true ||
    window.__ROLE_RUNTIME_AUDIT === true ||
    localStorage.getItem(ENABLE_FLAG) === '1' ||
    localStorage.getItem('roleRuntimeAudit') === '1'
  ), false);
}

function _normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (r === 'superadmin' || r === 'root' || r === 'root_admin' || r === 'admin_root') return 'super_admin';
  if (r === 'club_admin') return 'admin';
  return r || 'unknown';
}

function _getRole() {
  return _normalizeRole(
    window.userRole ||
    (window.__store && (window.__store.userRole || window.__store.role)) ||
    (window.currentUserRole) ||
    ''
  );
}

function _getClubId() {
  const st = window.__store || {};
  return String(st.clubId || st.currentClubId || window.currentClubId || '').trim();
}

function _getBranch() {
  const st = window.__store || {};
  return String(st.coachBranch || st.branch || window.coachBranch || window.currentBranch || '').trim();
}

function _getActiveTab() {
  if (typeof window.getCurrentActiveTabId === 'function') return window.getCurrentActiveTabId() || '';
  const el = document.querySelector('.tab-content.active, .tab-pane.active, [data-tab].active');
  return el ? (el.id || el.getAttribute('data-tab') || '') : '';
}

function _cloneShallow(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.slice();
  return Object.assign({}, obj);
}

function _getProfiles() {
  const st = window.__store || {};
  if (st.profiles && typeof st.profiles === 'object') return st.profiles;
  if (window.studentProfileStore && typeof window.studentProfileStore.getAllProfilesCompat === 'function') {
    const p = window.studentProfileStore.getAllProfilesCompat();
    if (p && typeof p === 'object') return p;
  }
  if (window.allProfiles && typeof window.allProfiles === 'object') return window.allProfiles;
  return {};
}

function _profileStatusKind(profile) {
  if (typeof window.classifyProfileStatus === 'function') {
    try { return window.classifyProfileStatus(profile); } catch (_) {}
  }
  const raw = String((profile && (profile.status || profile.studentStatus || profile.trainingStatus)) || '').toLowerCase();
  if (/quit|nghỉ|nghi|stop|left/.test(raw)) return 'quit';
  if (/pause|paused|báo nghỉ|bao nghi|skip/.test(raw)) return 'paused';
  return 'active';
}

function _auditProfiles() {
  const profiles = _getProfiles();
  const rows = Object.entries(profiles || {});
  const result = {
    total: rows.length,
    active: 0,
    quit: 0,
    paused: 0,
    unknown: 0,
    missingBranch: 0,
    legacyBranch: 0,
    skippedMonthsProfiles: 0,
    skippedMonthsLegacyShape: 0,
    contradictoryStatus: 0,
    sampleIssues: [],
  };
  rows.forEach(([name, p]) => {
    p = p || {};
    const kind = _profileStatusKind(p);
    if (kind === 'quit') result.quit++;
    else if (kind === 'paused') result.paused++;
    else if (kind === 'active') result.active++;
    else result.unknown++;

    const branch = p.branch || p.branchCode || p.branchId || p.coSo || '';
    if (!branch) result.missingBranch++;
    if (p.branchCode || p.branchId || p.coSo) result.legacyBranch++;

    const skipped = p.skippedMonths || p.skipMonths || p.pausedMonths || p.baoNghiMonths;
    if (skipped) {
      result.skippedMonthsProfiles++;
      if (!Array.isArray(skipped) || skipped.some(v => !/^\d{4}-\d{2}$/.test(String(v)))) {
        result.skippedMonthsLegacyShape++;
        if (result.sampleIssues.length < 5) result.sampleIssues.push({ name, issue: 'skippedMonths legacy shape', value: skipped });
      }
    }

    const rawStatus = String(p.status || '').toLowerCase();
    const hasQuitDate = !!(p.quitDate || p.leftAt || p.stoppedAt || p.ngayNghi || p.ngayNghiTap || p.ngayNghiHoc);
    if ((kind === 'active' && hasQuitDate) || (kind === 'quit' && /active|đang|dang/.test(rawStatus))) {
      result.contradictoryStatus++;
      if (result.sampleIssues.length < 5) result.sampleIssues.push({ name, issue: 'contradictory status/date', status: p.status, quitDate: p.quitDate || p.leftAt || p.stoppedAt || p.ngayNghi });
    }
  });
  return result;
}

function _listenerMetrics() {
  return typeof window.getListenerMetrics === 'function' ? window.getListenerMetrics() : null;
}

function _renderMetrics() {
  return {
    scheduler: typeof window.getRenderStats === 'function' ? window.getRenderStats() : null,
    schedulerSlow: _cloneShallow(window.__renderSchedulerMetrics || {}),
    largeLists: _cloneShallow(window.__largeListMetrics || {}),
    legacy: _cloneShallow(window.__renderLegacyMetrics || {}),
  };
}

function _searchMetrics() {
  return {
    helper: window.StudentSearchIndex ? 'StudentSearchIndex' : (window.SearchRuntime ? 'SearchRuntime' : 'legacy'),
    globalSearchTerm: (window.__store && window.__store._globalSearchTerm) || '',
    lastStudentIndexResult: window.__searchRuntimeState ? _cloneShallow(window.__searchRuntimeState.lastStudentIndexResult || {}) : null,
  };
}

function _roleViolations(role, listenerMetrics) {
  const rules = ROLE_EXPECTATIONS[role] || null;
  const active = listenerMetrics && Array.isArray(listenerMetrics.activeEntries) ? listenerMetrics.activeEntries : [];
  if (!rules) return [];
  const violations = [];
  if (role === 'coach') {
    active.forEach(entry => {
      const hay = `${entry.key || ''} ${entry.owner || ''} ${entry.scope || ''} ${entry.reason || ''}`.toLowerCase();
      (rules.forbiddenHints || []).forEach(hint => {
        if (hay.includes(String(hint).toLowerCase())) {
          violations.push({ severity: 'warning', role, listener: entry.key, reason: `coach listener contains forbidden hint: ${hint}` });
        }
      });
    });
  }
  return violations;
}

function _createState() {
  return {
    version: VERSION,
    enabled: false,
    bootedAt: _now(),
    updatedAt: null,
    events: [],
    eventCounts: {},
    lastEvent: null,
    snapshots: [],
    readOps: {},
    renderOps: {},
    tabSwitches: [],
    lastSnapshot: null,
  };
}

function _state() {
  if (!window.__runtimeAuditMetrics) window.__runtimeAuditMetrics = _createState();
  return window.__runtimeAuditMetrics;
}

function _recordEvent(type, detail = {}) {
  const st = _state();
  const event = { type: String(type || 'event'), detail, at: _now(), tab: _getActiveTab(), role: _getRole(), clubId: _getClubId() };
  st.lastEvent = event;
  st.eventCounts[event.type] = (st.eventCounts[event.type] || 0) + 1;
  st.events.push(event);
  if (st.events.length > 100) st.events.shift();
  st.updatedAt = event.at;
  return event;
}

function _snapshot(reason = 'manual') {
  const role = _getRole();
  const listeners = _listenerMetrics();
  const snap = {
    version: VERSION,
    reason,
    at: _now(),
    role,
    clubId: _getClubId(),
    branch: _getBranch(),
    tab: _getActiveTab(),
    tabDomain: TAB_DOMAIN[_getActiveTab()] || '',
    listeners,
    renders: _renderMetrics(),
    search: _searchMetrics(),
    dataAudit: _auditProfiles(),
  };
  snap.roleViolations = _roleViolations(role, listeners);

  const st = _state();
  st.lastSnapshot = snap;
  st.snapshots.push(snap);
  if (st.snapshots.length > 20) st.snapshots.shift();
  st.updatedAt = snap.at;
  return snap;
}

function _renderPanel(snapshot) {
  if (!_readFlag()) return;
  const snap = snapshot || _snapshot('panel-refresh');
  let panel = document.getElementById(DEFAULT_PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = DEFAULT_PANEL_ID;
    panel.style.cssText = [
      'position:fixed','right:12px','bottom:12px','z-index:99999','max-width:360px',
      'font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif','background:#0f172a','color:#e2e8f0',
      'border:1px solid rgba(148,163,184,.35)','border-radius:12px','padding:10px 12px',
      'box-shadow:0 16px 40px rgba(15,23,42,.35)','pointer-events:auto'
    ].join(';');
    document.body.appendChild(panel);
  }
  const lm = snap.listeners || {};
  const large = (snap.renders && snap.renders.largeLists) || {};
  const lastRows = large.lastRowCountPerList || {};
  const rows = Object.keys(lastRows).slice(0, 6).map(k => `${k}: ${lastRows[k]}`).join('<br>') || '—';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:6px;">
      <strong>Runtime Audit V5O</strong>
      <button type="button" onclick="window.disableRuntimeAuditPanel && window.disableRuntimeAuditPanel()" style="font-size:11px;border:1px solid #64748b;border-radius:6px;background:#1e293b;color:#e2e8f0;padding:2px 6px;">Ẩn</button>
    </div>
    <div>Role: <b>${snap.role}</b> · Tab: <b>${snap.tab || '—'}</b></div>
    <div>Club: ${snap.clubId || '—'} · Branch: ${snap.branch || '—'}</div>
    <div>Listeners: ${lm.activeCount || 0} active · dup ${lm.duplicateAttempted || 0}/${lm.duplicatePreventedBeforeCreate || 0}</div>
    <div>Profiles: ${snap.dataAudit.total} · active ${snap.dataAudit.active} · quit ${snap.dataAudit.quit} · paused ${snap.dataAudit.paused}</div>
    <div style="margin-top:6px;color:#cbd5e1;">Rows:<br>${rows}</div>
    ${snap.roleViolations.length ? `<div style="margin-top:6px;color:#fbbf24;">⚠ ${snap.roleViolations.length} role warning(s)</div>` : ''}
  `;
}

export function initRoleRuntimeAudit() {
  const st = _state();
  st.version = VERSION;
  st.enabled = _readFlag();

  window.trackRuntimeAuditEvent = _recordEvent;
  window.trackRuntimeAuditRead = function(key, detail = {}) {
    const state = _state();
    const k = String(key || detail.key || detail.path || 'unknown');
    state.readOps[k] = state.readOps[k] || { count: 0, lastAt: null, lastDetail: null };
    state.readOps[k].count++;
    state.readOps[k].lastAt = _now();
    state.readOps[k].lastDetail = detail;
    return _recordEvent('read', Object.assign({ key: k }, detail));
  };
  window.trackRuntimeAuditRender = function(key, detail = {}) {
    const state = _state();
    const k = String(key || detail.key || 'unknown');
    state.renderOps[k] = state.renderOps[k] || { count: 0, lastAt: null, lastDetail: null };
    state.renderOps[k].count++;
    state.renderOps[k].lastAt = _now();
    state.renderOps[k].lastDetail = detail;
    return _recordEvent('render', Object.assign({ key: k }, detail));
  };
  window.trackRuntimeAuditTabSwitch = function(tabId, detail = {}) {
    const state = _state();
    const item = { tabId, role: _getRole(), clubId: _getClubId(), at: _now(), detail };
    state.tabSwitches.push(item);
    if (state.tabSwitches.length > 50) state.tabSwitches.shift();
    return _recordEvent('tab-switch', item);
  };

  window.getRoleRuntimeAudit = function(reason = 'manual') { return _snapshot(reason); };
  window.printRoleRuntimeAudit = function(reason = 'manual') {
    const snap = _snapshot(reason);
    console.group(`[RoleRuntimeAudit] ${VERSION}`);
    console.table({ role: snap.role, clubId: snap.clubId, branch: snap.branch, tab: snap.tab, activeListeners: snap.listeners && snap.listeners.activeCount, totalProfiles: snap.dataAudit.total });
    if (snap.listeners && Array.isArray(snap.listeners.activeEntries)) console.table(snap.listeners.activeEntries);
    console.table(snap.dataAudit);
    if (snap.roleViolations && snap.roleViolations.length) console.table(snap.roleViolations);
    console.groupEnd();
    return snap;
  };
  window.enableRuntimeAuditPanel = function() {
    try { localStorage.setItem(ENABLE_FLAG, '1'); } catch (_) {}
    window.__RUNTIME_AUDIT = true;
    _state().enabled = true;
    _renderPanel(_snapshot('panel-enabled'));
  };
  window.disableRuntimeAuditPanel = function() {
    try { localStorage.removeItem(ENABLE_FLAG); } catch (_) {}
    window.__RUNTIME_AUDIT = false;
    _state().enabled = false;
    const panel = document.getElementById(DEFAULT_PANEL_ID);
    if (panel) panel.remove();
  };

  window.addEventListener('app:context-ready', () => {
    _recordEvent('app-context-ready', { role: _getRole(), clubId: _getClubId() });
    if (_readFlag()) setTimeout(() => _renderPanel(_snapshot('app-context-ready')), 0);
  });

  window.addEventListener('role-runtime-audit:refresh', () => {
    _renderPanel(_snapshot('manual-refresh-event'));
  });

  _recordEvent('audit-init', { version: VERSION, enabled: st.enabled });
  if (st.enabled) setTimeout(() => _renderPanel(_snapshot('init')), 0);
  return st;
}

export const RoleRuntimeAudit = {
  version: VERSION,
  init: initRoleRuntimeAudit,
  snapshot: _snapshot,
};

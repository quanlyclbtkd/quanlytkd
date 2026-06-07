/**
 * js/ui/eventActionBridge.js — Phase 4K-6I
 * Event Action Bridge: event delegation an toàn thay thế inline handlers.
 *
 * NGUYÊN TẮC:
 * - Chỉ xử lý element có [data-action].
 * - Không xử lý nếu element còn inline handler cùng event type.
 * - Không bind listener nhiều lần (idempotent).
 * - Mỗi action có risk metadata; phase 6I chỉ cho phép risk ui-only/read-only.
 * - Không migrate financial/write/auth/superadmin actions.
 */

// ── Internal state ────────────────────────────────────────────────
const _registry = {};
const _stats = {
  bound: false,
  dispatchedCount: 0,
  skippedBecauseInlineHandler: 0,
  unknownActionCount: 0,
  recentDispatches: []
};

// ── Guard: check if element has an inline handler for a given event type ──
function hasInlineHandler(el, eventType) {
  return !!(
    el &&
    (
      el.getAttribute('on' + eventType) ||
      el['on' + eventType]
    )
  );
}

// ── Record a dispatched action for debug stats ────────────────────
function _recordDispatch(actionName, el) {
  _stats.dispatchedCount++;
  _stats.recentDispatches.unshift({
    action: actionName,
    tag: el.tagName,
    id: el.id || null,
    t: Date.now()
  });
  if (_stats.recentDispatches.length > 20) _stats.recentDispatches.pop();
}

// ── Dispatch helper: look up registry and call handler ────────────
function _dispatch(actionName, el, event) {
  const meta = _registry[actionName];
  if (!meta) {
    _stats.unknownActionCount++;
    console.warn('[EventActionBridge] unknown action:', actionName);
    return;
  }
  if (!meta.allowInPhase6I) {
    console.warn('[EventActionBridge] action not allowed in phase 6I:', actionName);
    return;
  }
  _recordDispatch(actionName, el);
  try {
    meta.handler(el, event);
  } catch (e) {
    console.error('[EventActionBridge] action error:', actionName, e);
  }
}

// ── Phase 6I forbidden action list ───────────────────────────────
const PHASE6I_FORBIDDEN_ACTIONS = [
  'processMultiItem','processCombo','addNewStudent','saveClubSettings','saveEditInv',
  'saveEditExpense','createNewClubSystem','saDeleteTransactions','quickPay','deleteTx',
  'markInvPaid','cancelExamPayment','selectPaidStudents','processBatchUpgrade',
  'handleImportExcel','downloadExcelTemplate','exportAchievementsExcel','executeTaxExport',
  'executeExcelExport','handleLogin','submitChangePassword','bulkCheckIn','saveSessionNote',
  'exportAttendanceExcel','loadSuperAdminData','loadLoginHistory','loadSARevenue',
  'openNewClubModal','handleLogout'
];

// ── Main module export ────────────────────────────────────────────
export const EventActionBridge = {
  /**
   * initEventActionBridge() — idempotent, bind document-level delegation.
   * Guard: window.__eventActionBridgeBound
   */
  initEventActionBridge() {
    if (window.__eventActionBridgeBound) return;
    window.__eventActionBridgeBound = true;
    _stats.bound = true;

    // ── Click delegation ─────────────────────────────────────────
    document.addEventListener('click', function(event) {
      const el = event.target.closest('[data-action]');
      if (!el) return;
      if (hasInlineHandler(el, 'click')) {
        _stats.skippedBecauseInlineHandler++;
        return;
      }
      _dispatch(el.dataset.action, el, event);
    });

    // ── Change delegation ────────────────────────────────────────
    document.addEventListener('change', function(event) {
      const el = event.target.closest('[data-action]');
      if (!el) return;
      if (hasInlineHandler(el, 'change')) {
        _stats.skippedBecauseInlineHandler++;
        return;
      }
      _dispatch(el.dataset.action, el, event);
    });

    // ── Input delegation ─────────────────────────────────────────
    document.addEventListener('input', function(event) {
      const el = event.target.closest('[data-action]');
      if (!el) return;
      if (hasInlineHandler(el, 'input')) {
        _stats.skippedBecauseInlineHandler++;
        return;
      }
      _dispatch(el.dataset.action, el, event);
    });

    // ── Submit delegation ─────────────────────────────────────────
    document.addEventListener('submit', function(event) {
      const el = event.target.closest('[data-action]');
      if (!el) return;
      if (hasInlineHandler(el, 'submit')) {
        _stats.skippedBecauseInlineHandler++;
        return;
      }
      _dispatch(el.dataset.action, el, event);
    });

    // ── Focusin/focusout delegation ───────────────────────────────
    document.addEventListener('focusin', function(event) {
      const target = event.target;
      if (!target) return;

      // data-focus-border pattern (pure CSS-only visual)
      if (target.dataset && target.dataset.focusBorder && !target.getAttribute('onfocus')) {
        target.style.borderColor = target.dataset.focusBorder;
      }

      // data-action focusin (if action declares events includes focusin)
      const actionEl = target.closest('[data-action]');
      if (actionEl && !hasInlineHandler(actionEl, 'focus') && !hasInlineHandler(actionEl, 'focusin')) {
        const meta = _registry[actionEl.dataset.action];
        if (meta && meta.allowInPhase6I && Array.isArray(meta.events) && meta.events.includes('focusin')) {
          _recordDispatch(actionEl.dataset.action, actionEl);
          try { meta.handler(actionEl, event); } catch (e) {}
        }
      }
    });

    document.addEventListener('focusout', function(event) {
      const target = event.target;
      if (!target) return;

      // data-blur-border pattern (pure CSS-only visual)
      if (target.dataset && target.dataset.blurBorder && !target.getAttribute('onblur')) {
        target.style.borderColor = target.dataset.blurBorder;
      }
    });
  },

  /**
   * registerAction(name, handler, options)
   * options: { risk, allowInPhase6I, migrated, override, events }
   * Không override action đã đăng ký trừ khi options.override === true.
   */
  registerAction(name, handler, options = {}) {
    if (_registry[name] && !options.override) {
      console.warn('[EventActionBridge] duplicate action ignored:', name);
      return;
    }
    if (PHASE6I_FORBIDDEN_ACTIONS.includes(name)) {
      console.warn('[EventActionBridge] forbidden action in phase 6I, not registering:', name);
      return;
    }
    _registry[name] = { handler, ...options };
  },

  /**
   * getRegisteredActions() — trả về metadata của tất cả actions đã đăng ký.
   */
  getRegisteredActions() {
    return Object.fromEntries(
      Object.entries(_registry).map(([k, v]) => [
        k,
        {
          risk: v.risk || 'unknown',
          allowInPhase6I: !!v.allowInPhase6I,
          migrated: !!v.migrated
        }
      ])
    );
  },

  /**
   * getEventActionStats() — trả về stats dispatch, skip, unknown.
   */
  getEventActionStats() {
    return {
      bound: _stats.bound,
      registeredActionCount: Object.keys(_registry).length,
      dispatchedCount: _stats.dispatchedCount,
      skippedBecauseInlineHandler: _stats.skippedBecauseInlineHandler,
      unknownActionCount: _stats.unknownActionCount,
      recentDispatches: _stats.recentDispatches.slice(0, 5)
    };
  },

  /**
   * dispatchAction(actionName, el, event) — gọi action theo tên (từ code khác nếu cần).
   */
  dispatchAction(actionName, el, event) {
    _dispatch(actionName, el, event);
  }
};

/**
 * initEventActionBridge() — exported function để gọi từ main.js.
 * Khởi tạo bridge + đăng ký tất cả Phase 6I allowed actions.
 */
export function initEventActionBridge() {
  EventActionBridge.initEventActionBridge();
  _registerPhase6IActions();
}

// ── Phase 6I allowed actions ──────────────────────────────────────
function _registerPhase6IActions() {
  // 1. close-modal-by-id: đóng modal bằng ID trong data-target
  EventActionBridge.registerAction('close-modal-by-id', function(el) {
    const id = el.dataset.target;
    if (!id) return;
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  }, { risk: 'ui-only', allowInPhase6I: true, migrated: true });

  // 2. close-self-on-backdrop: đóng chính modal khi click backdrop
  EventActionBridge.registerAction('close-self-on-backdrop', function(el, event) {
    if (event.target === el) {
      el.style.display = 'none';
    }
  }, { risk: 'ui-only', allowInPhase6I: true, migrated: true });

  // 3. open-mobile-menu / close-mobile-menu: UI-only mobile nav
  EventActionBridge.registerAction('open-mobile-menu', function() {
    window.openMobileMenu?.();
  }, { risk: 'ui-only', allowInPhase6I: true, migrated: true });

  EventActionBridge.registerAction('close-mobile-menu', function() {
    window.closeMobileMenu?.();
  }, { risk: 'ui-only', allowInPhase6I: true, migrated: true });

  // 4. select-branch-card: chọn số cơ sở trong modal nâng cấp
  EventActionBridge.registerAction('select-branch-card', function(el) {
    const idx = Number(el.dataset.branchIndex || 0);
    if (idx && typeof window.selectBranchCard === 'function') {
      window.selectBranchCard(idx);
    }
  }, { risk: 'ui-only', allowInPhase6I: true, migrated: true });
}

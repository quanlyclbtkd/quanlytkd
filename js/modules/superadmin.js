// js/modules/superadmin.js
// Phase 4K-6I-F — SuperAdmin auto club stats cache sync reader
  // Phase 4.0B: SuperAdmin Module — Production-Safe Extraction
  // Extracted from app.js. All window.* APIs remain backward compatible.
  // Do NOT import app.js — use window.getAppContext() for shared state.

  // ── Context bridge ───────────────────────────────────────────────
  function _ctx(reason = 'superadmin') {
      return window.getAppContext ? window.getAppContext(reason) : {};
  }

  // ── Module-level idempotency ─────────────────────────────────────
  let __saInitialized = false;

  // Phase 4K-6I-B: Single-flight + cooldown state (module-level, survives rebind)
  let _saLoadPromise   = null;
  let _saLastLoadAt    = 0;
  const SA_LOAD_COOLDOWN_MS = 30 * 1000;

  // Phase 4K-6I-B: Background count refresh queue (concurrency = 1)
  const _saCountRefreshQueue = [];
  let _saCountRefreshRunning = false;
  // Phase 4K-6V5U5: module-owned explicit maintenance action; no new window global.
  let _cleanupLegacyAdminCredentials = null;

  // Phase 4K-6I-C: HARD STOP — không tự động chạy aggregation khi mở SuperAdmin.
  // SuperAdmin dashboard phải cached-first; count thiếu sẽ hiển thị "--" để tránh vượt quota Firestore.
  window.__saDisableBackgroundCountRefresh = true;
  window.__saAggregationHardStop = true;


  // Phase 4K-6I-E: SuperAdmin render-scope safe formatters.
  // These helpers are module-level because _renderSAClubRows can be called later by
  // filter/re-render flows, outside the lexical scope of loadSuperAdminData().
  function _saFirstFiniteNumber(...values) {
      for (const value of values) {
          if (value === null || value === undefined || value === '') continue;
          const n = Number(value);
          if (Number.isFinite(n)) return n;
      }
      return null;
  }


  function _saNested(obj, path) {
      try {
          return String(path || '').split('.').reduce((cur, key) => cur && cur[key], obj);
      } catch (_) { return undefined; }
  }

  function _saFmtOptionalCount(value) {
      if (value === null || value === undefined || value === '') return '--';
      const n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '--';
  }

  function _saFmtRevenueShort(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '--';
      if (Math.abs(n) >= 1000000) return Math.round(n / 1000000).toLocaleString('vi-VN') + 'tr';
      return n.toLocaleString('vi-VN') + 'đ';
  }

  function _saFmtRevenueFull(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString('vi-VN') + '₫' : '--';
  }


  // Phase 4K-6V5U6A — pure presentation recompute from already-loaded SuperAdmin data.
  // No Firestore access. Used after initial load and after server summary responses are
  // merged into window._saClubData so auto refresh never needs a full client reload.
  function _renderSuperAdminSummaryFromLoadedData(clubDataList, today, in30Days, curMonth) {
      const list = Array.isArray(clubDataList) ? clubDataList : [];
      const month = String(curMonth || list[0]?.curMonth || '').slice(0, 7);
      const totalKB = list.reduce((sum, item) => sum + (Number(item?.estimatedKB) || 0), 0);
      const FREE_QUOTA_KB = 1024 * 1024;
      const usagePct = Math.min(100, (totalKB / FREE_QUOTA_KB) * 100).toFixed(2);
      const totalDisplay = totalKB >= 1024 ? (totalKB / 1024).toFixed(2) + ' MB' : totalKB + ' KB';
      const usageBarEl = document.getElementById('firebaseUsageBar');
      if (usageBarEl) {
          usageBarEl.style.display = 'block';
          const totalUsage = document.getElementById('firebaseTotalUsage');
          if (totalUsage) totalUsage.innerText = `${totalDisplay} / 1 GB (${usagePct}%)`;
          const barColor = usagePct > 80 ? '#ef4444' : usagePct > 50 ? '#f59e0b' : '#6366f1';
          const fill = document.getElementById('firebaseUsageBarFill');
          if (fill) { fill.style.width = Math.max(0.5, usagePct) + '%'; fill.style.background = `linear-gradient(90deg,${barColor},${barColor}cc)`; }
      }

      let totalActive = 0, totalExpiring = 0, totalExpired = 0, totalLocked = 0;
      let totalStudents = 0, studentKnownClubCount = 0;
      let totalRevenue = 0, revenueClubCount = 0;
      list.forEach(({ data = {}, studentCountForSummary, revenueTotal, hasRevenueSource }) => {
          if (hasRevenueSource && Number.isFinite(Number(revenueTotal))) {
              totalRevenue += Number(revenueTotal || 0);
              revenueClubCount++;
          }
          const expiryDate = data.expiryDate || '2027-04-30';
          const acctStatus = data.accountStatus || 'active';
          const isExpired = expiryDate < today;
          const isExpiring = !isExpired && expiryDate <= in30Days;
          const isLocked = acctStatus === 'locked';
          if (isLocked) totalLocked++;
          else if (isExpired) totalExpired++;
          else if (isExpiring) totalExpiring++;
          else totalActive++;
          if (studentCountForSummary !== null && studentCountForSummary !== undefined && studentCountForSummary !== '' && Number.isFinite(Number(studentCountForSummary))) {
              totalStudents += Number(studentCountForSummary);
              studentKnownClubCount++;
          }
      });

      const totalStudentsDisplay = studentKnownClubCount > 0 ? totalStudents.toLocaleString('vi-VN') : '--';
      const totalStudentsNote = studentKnownClubCount > 0
          ? (studentKnownClubCount + '/' + list.length + ' CLB có cache')
          : 'chưa có cache thống kê';
      const revenueDisplay = revenueClubCount > 0 ? _saFmtRevenueShort(totalRevenue) : '--';
      const revenueNote = revenueClubCount + '/' + list.length + ' CLB có stats/cache';
      const statsEl = document.getElementById('superAdminStats');
      if (statsEl) {
          statsEl.innerHTML = `
              <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;padding:14px 12px;border-radius:14px;text-align:center;position:relative;overflow:hidden;">
                  <div style="font-size:0.65rem;font-weight:900;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">Tổng CLB</div>
                  <div style="font-size:2rem;font-weight:900;color:#15803d;line-height:1.1;margin-top:4px;">${list.length}</div>
                  <div style="font-size:0.65rem;color:#86efac;font-weight:700;margin-top:2px;">${totalActive} đang hoạt động</div>
              </div>
              <div style="background:linear-gradient(135deg,#fefce8,#fef9c3);border:1.5px solid #fde047;padding:14px 12px;border-radius:14px;text-align:center;">
                  <div style="font-size:0.65rem;font-weight:900;color:#a16207;text-transform:uppercase;letter-spacing:0.05em;">Sắp Hết Hạn</div>
                  <div style="font-size:2rem;font-weight:900;color:#ca8a04;line-height:1.1;margin-top:4px;">${totalExpiring}</div>
                  <div style="font-size:0.65rem;color:#fbbf24;font-weight:700;margin-top:2px;">${totalExpired} đã hết hạn</div>
              </div>
              <div style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);border:1.5px solid #a5b4fc;padding:14px 12px;border-radius:14px;text-align:center;">
                  <div style="font-size:0.65rem;font-weight:900;color:#4338ca;text-transform:uppercase;letter-spacing:0.05em;">Tổng Võ Sinh</div>
                  <div style="font-size:2rem;font-weight:900;color:#4338ca;line-height:1.1;margin-top:4px;">${totalStudentsDisplay}</div>
                  <div style="font-size:0.65rem;color:#a5b4fc;font-weight:700;margin-top:2px;">${totalStudentsNote}</div>
              </div>
              <div style="background:linear-gradient(135deg,#f0fdf4,#d1fae5);border:1.5px solid #6ee7b7;padding:14px 12px;border-radius:14px;text-align:center;">
                  <div style="font-size:0.65rem;font-weight:900;color:#065f46;text-transform:uppercase;letter-spacing:0.05em;">Doanh Thu T.${(month.split('-')[1] || '?')}</div>
                  <div style="font-size:1.1rem;font-weight:900;color:#065f46;line-height:1.1;margin-top:4px;">${revenueDisplay}</div>
                  <div style="font-size:0.65rem;color:#34d399;font-weight:700;margin-top:2px;">${revenueNote}</div>
              </div>
              <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1.5px solid #cbd5e1;padding:14px 12px;border-radius:14px;text-align:center;">
                  <div style="font-size:0.65rem;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">Dung Lượng</div>
                  <div style="font-size:1.5rem;font-weight:900;color:#334155;line-height:1.1;margin-top:4px;">${totalDisplay}</div>
                  <div style="font-size:0.65rem;color:#94a3b8;font-weight:700;margin-top:2px;">${totalLocked} bị khóa</div>
              </div>`;
          if (studentKnownClubCount < list.length || revenueClubCount < list.length) {
              statsEl.innerHTML += '<div style="grid-column:1/-1;margin-top:6px;font-size:0.72rem;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;">ℹ️ SuperAdmin đang dùng dữ liệu cache/stats tự động từ tài khoản Admin CLB để tránh vượt quota Firestore. CLB nào chưa có cache sẽ hiển thị <b>--</b> cho tới khi Admin CLB đó đăng nhập hoặc Cloud Functions cập nhật stats.</div>';
          }
      }
      return { totalKB, totalActive, totalExpiring, totalExpired, totalLocked, totalStudents, studentKnownClubCount, totalRevenue, revenueClubCount };
  }

  window.__saRenderScopeFix = true;

  // ════════════════════════════════════════════════════════════════
  // resetSuperAdminModuleState — Phase 4.0B-2
  // Phải reset local __saInitialized mới cho phép initSuperAdmin chạy lại
  // sau logout/login không reload trang.
  // ════════════════════════════════════════════════════════════════
  export function resetSuperAdminModuleState(reason = '') {
      __saInitialized = false;
      window.__superAdminModuleInitialized = false;
      window.__superAdminModuleLoading = false;
      // KHÔNG xóa window.SuperAdminModule: các wrapper vẫn có thể gọi được
      // trong khoảng trống giữa logout và lần init lại.
      // ensureSuperAdminModule() sẽ kiểm tra window.SuperAdminModule lại.
      if (window.__superAdminModuleMetrics) {
          window.__superAdminModuleMetrics.resetCalls = (window.__superAdminModuleMetrics.resetCalls || 0) + 1;
      }
      console.debug('[SuperAdminModule] state reset:', reason || '(no reason given)');
  }
  window.resetSuperAdminModuleState = resetSuperAdminModuleState;

  // ════════════════════════════════════════════════════════════════
  // _registerSuperAdminPublicAPI — Phase 4.0B-2
  // Tách riêng việc gán window.SuperAdminModule để có thể gọi lại
  // trong rebind fast-path mà không chạy lại toàn bộ init.
  // Chỉ tham chiếu window.xxx — hàm này an toàn khi gọi bất cứ lúc nào
  // sau khi các window functions đã được đăng ký trong full init.
  // ════════════════════════════════════════════════════════════════
  function _registerSuperAdminPublicAPI() {
      window.SuperAdminModule = {
          // ── init / reset ────────────────────────────────────────
          initSuperAdminModule:         initSuperAdmin,
          initSuperAdmin,
          resetSuperAdminModuleState,

          // ── Dashboard ───────────────────────────────────────────
          loadSuperAdminDashboard:      window.loadSuperAdminData,
          loadSuperAdminData:           window.loadSuperAdminData,
          renderSuperAdminDashboard:    window.loadSuperAdminData,
          refreshSuperAdminData:        window.loadSuperAdminData,

          // ── Club list ───────────────────────────────────────────
          renderClubList:               window._renderSAClubRows,
          renderSummaryFromLoadedData:  _renderSuperAdminSummaryFromLoadedData,
          filterClubs:                  window.filterSAClubs,
          filterSAClubs:                window.filterSAClubs,

          // ── Club actions ────────────────────────────────────────
          lockClub:                     window.lockClubAccount,
          lockClubAccount:              window.lockClubAccount,
          unlockClub:                   window.unlockClubAccount,
          unlockClubAccount:            window.unlockClubAccount,
          updateClubStatus:             window.lockClubAccount,

          toggleExamFeature:            window.toggleExamFeature,
          toggleClubStatus:             window.toggleExamFeature,

          // ── Modals ──────────────────────────────────────────────
          openExpiryModal:              window.openExpiryModal,
          openBranchUpgradeModal:       window.openBranchUpgradeModal,
          saveBranchUpgrade:            window.saveBranchUpgrade,
          selectBranchCard:             window.selectBranchCard,

          forceReplaceAdmin:            window.forceReplaceAdmin,
          editClubName:                 window.editClubName,
          saOpenDeleteTxModal:          window.saOpenDeleteTxModal,
          saResetAdminPassword:         window.saResetAdminPassword,
          cleanupLegacyAdminCredentials: _cleanupLegacyAdminCredentials,

          // ── Metrics ─────────────────────────────────────────────
          printMetrics:                 window.printSuperAdminModuleMetrics,
          _phase: '4.0B-2',
      };
  }

  // ════════════════════════════════════════════════════════════════
  // initSuperAdmin — called by main.js bootstrap (eager) and
  //                  ensureSuperAdminModule() on re-login without reload.
  // ════════════════════════════════════════════════════════════════
  export function initSuperAdmin() {
      // [Phase 4.0B-2] Guard hardened:
      // Chỉ skip nếu đã init VÀ window.SuperAdminModule vẫn còn.
      // Nếu SuperAdminModule bị mất (do resetStore cũ hoặc lý do khác),
      // cho phép re-register public API mà không duplicate event listeners.
      if (__saInitialized && window.__superAdminModuleInitialized && window.SuperAdminModule) return;

      const _isRebind = __saInitialized; // true = đây là lần re-register API, không phải init lần đầu
      __saInitialized = true;
      window.__superAdminModuleInitialized = true;

      // Cập nhật metrics trước khi đặt _m()
      if (window.__superAdminModuleMetrics) {
          if (_isRebind) {
              window.__superAdminModuleMetrics.apiRebindCalls = (window.__superAdminModuleMetrics.apiRebindCalls || 0) + 1;
          } else {
              window.__superAdminModuleMetrics.reinitCalls = (window.__superAdminModuleMetrics.reinitCalls || 0) + 1;
          }
      }

      // ── Firebase SDK refs (from window._fb_init — same as app.js) ──
      const _fb = window._fb_init || {};
      const {
          getDocs, query, collection, limit, updateDoc, doc, where,
          setDoc, getDoc, writeBatch, deleteField, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,
      } = _fb;

      // ── App context: db, auth ────────────────────────────────────
      const _appCtx      = _ctx('init-superadmin');
      const db           = _appCtx.db;
      const auth         = _appCtx.auth;
      // secondaryAuth: exposed from app.js via window._secondaryAuth
      const secondaryAuth = window._secondaryAuth || null;

      // ── [Phase 4.0B-2] Re-bind fast path ─────────────────────────
      // Nếu đây là lần re-init sau logout (window functions vẫn còn trên window
      // nhưng window.SuperAdminModule bị mất hoặc bị reset), chỉ cần
      // re-register public API object và return — không chạy lại toàn bộ init,
      // không duplicate event listeners, không reset metrics về 0.
      if (_isRebind) {
          // Fast path: chỉ re-register public API object, không chạy lại init
          _registerSuperAdminPublicAPI();
          if (window.__superAdminModuleMetrics) {
              window.__superAdminModuleMetrics.apiRebindCalls = (window.__superAdminModuleMetrics.apiRebindCalls || 0) + 1;
          }
          console.debug('[superadmin.js] ✅ SuperAdminModule API re-bound (fast path) after logout/login.');
          return;
      }

      // ── Metrics ──────────────────────────────────────────────────
      // [Phase 4.0B-2] Preserve existing counts on re-init (merge _prev)
      const _prev = window.__superAdminModuleMetrics || {};
      window.__superAdminModuleMetrics = {
          loaded: true,
          dashboardLoadCalls:    _prev.dashboardLoadCalls    || 0,
          clubListRenderCalls:   _prev.clubListRenderCalls   || 0,
          lockClubCalls:         _prev.lockClubCalls         || 0,
          unlockClubCalls:       _prev.unlockClubCalls       || 0,
          toggleExamCalls:       _prev.toggleExamCalls       || 0,
          forceReplaceAdminCalls:_prev.forceReplaceAdminCalls|| 0,
          editClubNameCalls:     _prev.editClubNameCalls     || 0,
          saveBranchUpgradeCalls:_prev.saveBranchUpgradeCalls|| 0,
          saResetPasswordCalls:  _prev.saResetPasswordCalls  || 0,
          ensureModuleCalls:     _prev.ensureModuleCalls     || 0,
          ensureModuleFailures:  _prev.ensureModuleFailures  || 0,
          legacyFallbackCalls:   _prev.legacyFallbackCalls   || 0,
          fallbackCalls:         _prev.fallbackCalls         || 0,
          reinitCalls:           (_prev.reinitCalls  || 0) + 1,
          resetCalls:            _prev.resetCalls            || 0,
          apiRebindCalls:        _prev.apiRebindCalls        || 0,
          lastAction:            '',
          lastDurationMs:        0,
          lastError:             null,
      };
      window.printSuperAdminModuleMetrics = function() {
          console.table(window.__superAdminModuleMetrics);
      };
      const _m = () => window.__superAdminModuleMetrics;

      // ── Phase 4K-6V5U5: explicit legacy credential purge ──────────
      // Detection reuses the already-loaded SuperAdmin clubDataList; it never performs
      // a second clubs query and never runs automatically on dashboard load.
      const _legacyCredentialItems = (clubDataList) => (Array.isArray(clubDataList) ? clubDataList : [])
          .filter(item => {
              const data = item?.data || {};
              return String(data.adminPassword || '').length > 0 || Object.prototype.hasOwnProperty.call(data, 'passwordChangedAt');
          });

      const _renderLegacyCredentialWarning = (clubDataList) => {
          const listEl = document.getElementById('sysClubListMain');
          if (!listEl || !listEl.parentElement) return;
          const affected = _legacyCredentialItems(clubDataList);
          let warning = document.getElementById('saLegacyCredentialWarning');
          if (!warning) {
              warning = document.createElement('div');
              warning.id = 'saLegacyCredentialWarning';
              listEl.parentElement.insertBefore(warning, listEl);
          }
          if (!affected.length) {
              warning.style.display = 'none';
              warning.innerHTML = '';
              return;
          }
          warning.style.display = 'block';
          warning.style.cssText = 'margin:10px 12px;padding:12px 14px;border:1px solid #fdba74;background:#fff7ed;border-radius:12px;color:#9a3412;font-size:.78rem;line-height:1.45;';
          warning.innerHTML = `<div style="font-weight:900;margin-bottom:7px;">⚠️ Phát hiện ${affected.length} CLB còn dữ liệu mật khẩu legacy.</div>
              <div style="margin-bottom:9px;">Dữ liệu này không còn được hệ thống sử dụng. Firebase Authentication là nguồn duy nhất quản lý mật khẩu.</div>
              <button type="button" onclick="window.SuperAdminModule?.cleanupLegacyAdminCredentials?.()" style="border:0;background:#c2410c;color:#fff;font-weight:900;padding:8px 11px;border-radius:9px;cursor:pointer;font-size:.72rem;">🧹 XÓA DỮ LIỆU MẬT KHẨU LEGACY</button>`;
      };

      _cleanupLegacyAdminCredentials = async () => {
          const verified = window.__verifiedAuthContextState;
          if (!verified || verified.ready !== true || verified.role !== 'super_admin') {
              alert('Chỉ SuperAdmin đã được xác minh canonical mới có thể thực hiện bảo trì này.');
              return false;
          }
          const clubDataList = window._saClubData?.clubDataList;
          if (!Array.isArray(clubDataList)) {
              alert('Danh sách CLB chưa sẵn sàng. Hãy tải trang SuperAdmin trước khi chạy cleanup.');
              return false;
          }
          const affected = _legacyCredentialItems(clubDataList);
          if (!affected.length) {
              window.showToast?.('✅ Không còn dữ liệu mật khẩu legacy cần xóa.');
              _renderLegacyCredentialWarning(clubDataList);
              return true;
          }
          if (typeof writeBatch !== 'function' || typeof deleteField !== 'function') {
              alert('Firebase SDK chưa có writeBatch/deleteField. Không thực hiện cleanup để tránh ghi schema không an toàn.');
              return false;
          }
          const ok = confirm(`⚠️ XÓA DỮ LIỆU MẬT KHẨU LEGACY\n\nPhát hiện ${affected.length} CLB còn adminPassword/passwordChangedAt.\n\nThao tác này chỉ xóa các field legacy khỏi Firestore; KHÔNG đổi mật khẩu Firebase Authentication.\n\nTiếp tục?`);
          if (!ok) return false;

          const batch = writeBatch(db);
          affected.forEach(({ cid, data }) => {
              const patch = { adminPassword: deleteField() };
              if (Object.prototype.hasOwnProperty.call(data || {}, 'passwordChangedAt')) patch.passwordChangedAt = deleteField();
              batch.update(doc(db, 'clubs', cid), patch);
          });
          try {
              await batch.commit();
              // Reuse loaded cache; no getDocs/loadSuperAdminData round-trip after cleanup.
              affected.forEach(({ data }) => {
                  if (data && typeof data === 'object') {
                      delete data.adminPassword;
                      delete data.passwordChangedAt;
                  }
              });
              _renderLegacyCredentialWarning(clubDataList);
              if (typeof window.filterSAClubs === 'function') window.filterSAClubs();
              window.showToast?.(`✅ Đã xóa dữ liệu mật khẩu legacy khỏi ${affected.length} CLB.`);
              return true;
          } catch (error) {
              _m().lastError = error?.message || String(error);
              console.error('[SuperAdminCredentialCleanup] failed:', error);
              alert('Không thể xóa dữ liệu mật khẩu legacy: ' + (error?.message || error));
              return false;
          }
      };

      // ── Phase 4.0B: branch upgrade modal state ───────────────────
      let _buSelectedCount = 1;

      // ════════════════════════════════════════════════════════════
      // 1. loadSuperAdminData — Main SuperAdmin Dashboard loader
      //    TODO Phase 4.0B-2: SuperAdmin aggregation/pagination needed for large SaaS.
      // ════════════════════════════════════════════════════════════
          window.loadSuperAdminData = async () => {
        _m().dashboardLoadCalls++;
        _m().lastAction = 'loadSuperAdminData';
        const _t0 = Date.now();
        const listEl = document.getElementById('sysClubListMain');
        listEl.innerHTML = '<div class="text-center py-10 text-slate-400"><div class="text-2xl mb-2">⏳</div><p class="font-bold text-sm">Đang tải dữ liệu toàn hệ thống...</p></div>';
        try {
            const clubsSnap = await getDocs(query(collection(db, "clubs"), limit(200))); // [3.3E] SuperAdmin clubs list — bounded at 200
            const today = getLocalToday();
            const in30Days = (() => { const d = new Date(); d.setDate(d.getDate() + 30); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().split('T')[0]; })();

            // Lấy dữ liệu tất cả CLB song song
            const clubDocs = [];
            clubsSnap.forEach(docSnap => clubDocs.push(docSnap));
            // Phase 4K-6I-C: countDocs — structured result + hard-stop quota errors.
            // KHÔNG nuốt lỗi quota. Quota/resource-exhausted/429 phải throw để SuperAdminQuotaGuard mở circuit.
            const _gcfs = _fb.getCountFromServer || null;
            function isQuotaCountError(error) {
                const msg = String(error?.message || error?.code || error || '').toLowerCase();
                return msg.includes('resource-exhausted') || msg.includes('quota') || msg.includes('429') || msg.includes('too many');
            }
            const countDocs = async (q, meta = {}) => {
                if (!_gcfs) {
                    return { ok: false, count: null, reason: 'getCountFromServer-unavailable', meta };
                }
                try {
                    const snap = await _gcfs(q);
                    const count = Number(snap.data().count || 0);
                    return { ok: true, count, meta };
                } catch (_e) {
                    console.warn('[SuperAdmin] getCountFromServer failed:', _e && _e.message, meta);
                    if (isQuotaCountError(_e)) {
                        _e.__superAdminQuotaError = true;
                        throw _e;
                    }
                    return { ok: false, count: null, reason: _e?.message || 'count-failed', meta };
                }
            };

            // Phase 4K-6I-D: SuperAdmin cache/readiness helpers — cached-only, no aggregation.
            function _firstFiniteNumber(...values) {
                for (const value of values) {
                    if (value === null || value === undefined || value === '') continue;
                    const n = Number(value);
                    if (Number.isFinite(n)) return n;
                }
                return null;
            }

            function _readStatsIncomeTotal(stats) {
                if (!stats || typeof stats !== 'object') return null;
                const statsCoverage = stats.cacheCoverage;
                if (statsCoverage && statsCoverage.financeComplete !== true) return null;
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

            function _normalizeStatsMonth(value) {
                const raw = String(value || '').trim().replace('_', '-');
                const match = raw.match(/^(\d{4})-(\d{2})/);
                return match ? `${match[1]}-${match[2]}` : '';
            }

            function _isFinanceCoverageRejected(source, monthKey) {
                const coverage = source && source.cacheCoverage;
                if (!coverage || typeof coverage !== 'object') return false;
                return _normalizeStatsMonth(coverage.month) === monthKey && coverage.financeComplete !== true;
            }

            // V5U6A: revenue is a root-cache hit only when its current-month provenance
            // is provable. Keyed maps are self-describing; generic "current month"
            // fields require superAdminStats.month to match the requested month.
            function _readClubCachedRevenue(clubData, monthKey, statsDocId) {
                if (!clubData || typeof clubData !== 'object') return null;
                if (_isFinanceCoverageRejected(clubData, monthKey)) return null;
                const keyedRevenue = _firstFiniteNumber(
                    _readMonthlyCachedValue(clubData.cachedMonthlyRevenue, monthKey, statsDocId),
                    _readMonthlyCachedValue(clubData.monthlyRevenue, monthKey, statsDocId),
                    _readMonthlyCachedValue(clubData.revenueByMonth, monthKey, statsDocId),
                    _readMonthlyCachedValue(clubData.statsByMonth, monthKey, statsDocId)
                );
                if (Number.isFinite(Number(keyedRevenue))) return keyedRevenue;

                const saStats = clubData.superAdminStats || clubData.clubSummary || clubData.summary || {};
                const marker = _normalizeStatsMonth(saStats.month || saStats.currentMonth || saStats.monthKey);
                if (marker !== monthKey) return null;
                return _firstFiniteNumber(
                    saStats.revenueTotal,
                    saStats.monthlyIncome,
                    saStats.currentMonthRevenue,
                    saStats.incomeTotal,
                    saStats.income && saStats.income.total,
                    clubData.cachedCurrentMonthRevenue,
                    clubData.currentMonthRevenue,
                    clubData.monthRevenue,
                    clubData.monthlyIncome
                );
            }

            function _readProvableCurrentMonthRootCache(clubData, monthKey, statsDocId) {
                const student = _readStudentCountFromClub(clubData);
                const financeRejected = _isFinanceCoverageRejected(clubData, monthKey);
                const revenue = _readClubCachedRevenue(clubData, monthKey, statsDocId);
                // _firstFiniteNumber-style helpers return null for unknown. Do not coerce
                // null through Number(null) because that fabricates a valid zero cache hit.
                const hasStudent = student !== null && Number.isFinite(student);
                const hasRevenue = revenue !== null && Number.isFinite(revenue);
                return { student, revenue, hasStudent, hasRevenue, financeRejected, complete: hasStudent && hasRevenue };
            }

            function _readStudentCountFromStats(stats) {
                if (!stats || typeof stats !== 'object') return null;
                return _firstFiniteNumber(
                    stats.activeCount,
                    stats.activeStudents,
                    stats.studentCount,
                    stats.totalStudents,
                    stats.profileCount,
                    stats.profilesCount,
                    stats.students && stats.students.active,
                    stats.students && stats.students.total,
                    stats.profiles && stats.profiles.active,
                    stats.profiles && stats.profiles.total
                );
            }

            function _readStudentCountFromClub(clubData) {
                if (!clubData || typeof clubData !== 'object') return null;
                const saStats = clubData.superAdminStats || clubData.clubSummary || clubData.summary || {};
                return _firstFiniteNumber(
                    saStats.activeCount,
                    saStats.activeStudents,
                    saStats.activeStudentCount,
                    saStats.profileCount,
                    saStats.totalStudents,
                    clubData.cachedActiveCount,
                    clubData.cachedStudentCount,
                    clubData.activeStudentCount,
                    clubData.activeStudents,
                    clubData.activeCount,
                    clubData.totalActiveStudents,
                    clubData.studentCount,
                    clubData.totalStudents,
                    clubData.cachedProfileCount,
                    clubData.profileCount,
                    clubData.profilesCount,
                    clubData.membersCount,
                    clubData.memberCount,
                    clubData.stats && clubData.stats.activeCount,
                    clubData.stats && clubData.stats.activeStudents,
                    clubData.stats && clubData.stats.studentCount,
                    clubData.stats && clubData.stats.totalStudents
                );
            }

            function _fmtOptionalCount(value) {
                const n = Number(value);
                return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '--';
            }

            function _fmtRevenueShort(value) {
                const n = Number(value);
                if (!Number.isFinite(n)) return '--';
                if (Math.abs(n) >= 1000000) return Math.round(n / 1000000).toLocaleString('vi-VN') + 'tr';
                return n.toLocaleString('vi-VN') + 'đ';
            }

            function _fmtRevenueFull(value) {
                const n = Number(value);
                return Number.isFinite(n) ? n.toLocaleString('vi-VN') + '₫' : '--';
            }

            // Phase 4K-6I-D: getCachedClubCounts — đọc cache từ nhiều schema cũ/mới, không aggregation.
            function getCachedClubCounts(clubData) {
                const active = _readStudentCountFromClub(clubData);
                return {
                    activeCount:  active,
                    profileCount: _firstFiniteNumber(
                        clubData.cachedProfileCount,
                        clubData.profileCount,
                        clubData.profilesCount,
                        clubData.totalStudents,
                        clubData.studentCount,
                        clubData.cachedStudentCount,
                        active
                    ),
                    txCount:      _firstFiniteNumber(clubData.cachedTxCount, clubData.txCount, clubData.transactionCount, clubData.transactionsCount),
                    invCount:     _firstFiniteNumber(clubData.cachedInvCount, clubData.invCount, clubData.inventoryCount, clubData.uniformCount),
                    updatedAt:    clubData.cachedCountUpdatedAt || clubData.statsUpdatedAt || clubData.updatedAt || 0,
                };
            }
            // Phase 4K-6I-C: runSuperAdminCountRefreshQueue — manual-only, concurrency=1, hard-stop on quota.
            async function runSuperAdminCountRefreshQueue() {
                if (_saCountRefreshRunning) return;
                if (window.SuperAdminQuotaGuard?.isCircuitOpen?.()) {
                    _saCountRefreshQueue.length = 0;
                    console.warn('[SuperAdmin] countRefreshQueue skipped — quota circuit open.');
                    return;
                }
                _saCountRefreshRunning = true;
                try {
                    while (_saCountRefreshQueue.length > 0) {
                        if (window.SuperAdminQuotaGuard?.isCircuitOpen?.()) {
                            console.warn('[SuperAdmin] countRefreshQueue stopped — quota circuit open.');
                            _saCountRefreshQueue.length = 0;
                            break;
                        }
                        const { cid } = _saCountRefreshQueue.shift();
                        let activeCount = null, profileCount = null, txCount = null, invCount = null;
                        try {
                            const activeRes = await window.SuperAdminQuotaGuard?.runThrottledCount?.(
                                () => countDocs(query(collection(db, 'clubs', cid, 'profiles'), where('status', '==', 'active')), { cid, collection: 'profiles-active' }),
                                { cid, collection: 'profiles-active' }
                            );
                            if (window.SuperAdminQuotaGuard?.isCircuitOpen?.()) { _saCountRefreshQueue.length = 0; break; }
                            activeCount = activeRes?.ok ? Number(activeRes.count) : null;

                            const profileRes = await window.SuperAdminQuotaGuard?.runThrottledCount?.(
                                () => countDocs(collection(db, 'clubs', cid, 'profiles'), { cid, collection: 'profiles' }),
                                { cid, collection: 'profiles' }
                            );
                            if (window.SuperAdminQuotaGuard?.isCircuitOpen?.()) { _saCountRefreshQueue.length = 0; break; }
                            profileCount = profileRes?.ok ? Number(profileRes.count) : null;

                            const txRes = await window.SuperAdminQuotaGuard?.runThrottledCount?.(
                                () => countDocs(collection(db, 'clubs', cid, 'transactions'), { cid, collection: 'transactions' }),
                                { cid, collection: 'transactions' }
                            );
                            if (window.SuperAdminQuotaGuard?.isCircuitOpen?.()) { _saCountRefreshQueue.length = 0; break; }
                            txCount = txRes?.ok ? Number(txRes.count) : null;

                            const invRes = await window.SuperAdminQuotaGuard?.runThrottledCount?.(
                                () => countDocs(collection(db, 'clubs', cid, 'inventory'), { cid, collection: 'inventory' }),
                                { cid, collection: 'inventory' }
                            );
                            if (window.SuperAdminQuotaGuard?.isCircuitOpen?.()) { _saCountRefreshQueue.length = 0; break; }
                            invCount = invRes?.ok ? Number(invRes.count) : null;
                        } catch (qErr) {
                            console.warn('[SuperAdmin] countRefreshQueue error for', cid, qErr?.message);
                            if (window.SuperAdminQuotaGuard?.isCircuitOpen?.()) {
                                _saCountRefreshQueue.length = 0;
                                break;
                            }
                        }
                        // Chỉ ghi nếu count hợp lệ — không ghi null/undefined/NaN/object
                        const payload = {};
                        if (Number.isFinite(activeCount))  payload.cachedActiveCount  = activeCount;
                        if (Number.isFinite(profileCount)) payload.cachedProfileCount = profileCount;
                        if (Number.isFinite(txCount))      payload.cachedTxCount      = txCount;
                        if (Number.isFinite(invCount))     payload.cachedInvCount     = invCount;
                        if (Object.keys(payload).length > 0) {
                            payload.cachedCountUpdatedAt = Date.now();
                            updateDoc(doc(db, 'clubs', cid), payload).catch(() => {});
                        }
                        await new Promise(r => setTimeout(r, 500));
                    }
                } finally {
                    _saCountRefreshRunning = false;
                }
            }

            // Phase 4K-6I-B: queueSuperAdminCountRefresh — add to queue, start runner
            function queueSuperAdminCountRefresh(cid, clubData, options = {}) {
                if (window.__saDisableBackgroundCountRefresh === true && options.manual !== true) {
                    console.info('[SuperAdmin] auto count refresh disabled — cached-only mode', { cid });
                    return false;
                }
                if (window.SuperAdminQuotaGuard?.isCircuitOpen?.()) {
                    console.warn('[SuperAdmin] count refresh blocked — quota circuit open', { cid });
                    return false;
                }
                const alreadyQueued = _saCountRefreshQueue.some(item => item.cid === cid);
                if (!alreadyQueued) {
                    _saCountRefreshQueue.push({ cid, clubData, manual: options.manual === true });
                }
                if (!_saCountRefreshRunning) {
                    setTimeout(() => runSuperAdminCountRefreshQueue(), 500);
                }
                return true;
            }

            // [Phase 4K] Current month for stats doc reads — VN timezone offset
            const _now4K  = new Date(Date.now() + 7 * 3600 * 1000);
            const _curMonth4K = _now4K.toISOString().substring(0, 7); // YYYY-MM
            const _statsDocId4K = _curMonth4K.replace('-', '_');      // YYYY_MM (underscore — Firestore doc ID)

            const clubDataList = await Promise.all(clubDocs.map(async (docSnap) => {
                const cid = docSnap.id;
                const data = docSnap.data();

                // Phase 4K-6I-B: Cached-first — không block dashboard render để count
                const _cached = getCachedClubCounts(data);
                let activeCount  = _cached.activeCount;
                let profileCount = _cached.profileCount;
                let txCount      = _cached.txCount;
                let invCount     = _cached.invCount;

                const _cacheAge   = _cached.updatedAt ? Date.now() - _cached.updatedAt : Infinity;
                const _cacheStale = _cacheAge > 2 * 60 * 60 * 1000;

                // Phase 4K-6I-C: mặc định KHÔNG tự động aggregation khi mở SuperAdmin.
                // Nếu cache stale/missing vẫn hiển thị "--"; refresh count chỉ chạy thủ công từng CLB.
                if (
                    (_cacheStale || activeCount === null) &&
                    !window.SuperAdminQuotaGuard?.isCircuitOpen?.() &&
                    !window.__saDisableBackgroundCountRefresh
                ) {
                    queueSuperAdminCountRefresh(cid, data, { manual: false });
                }

                // Ước tính dung lượng (KB): profile ~1KB, tx ~0.5KB, inv ~0.4KB (null → 0)
                let estimatedKB = Math.round((profileCount || 0) * 1 + (txCount || 0) * 0.5 + (invCount || 0) * 0.4);

                // Phase 4K-6V5U6A: root club cache first. Only a club whose current-month
                // root cache is incomplete pays the stats/{YYYY_MM} point read.
                const _rootMonthCache = _readProvableCurrentMonthRootCache(data, _curMonth4K, _statsDocId4K);
                let monthStats = null;
                if (!_rootMonthCache.complete && !_rootMonthCache.financeRejected) {
                    try {
                        const _sSnap = await getDoc(doc(db, 'clubs', cid, 'stats', _statsDocId4K));
                        if (window.__txListenerMetrics) {
                            window.__txListenerMetrics.superAdminStatsRead = (window.__txListenerMetrics.superAdminStatsRead || 0) + 1;
                        }
                        if (_sSnap.exists()) monthStats = _sSnap.data();
                    } catch (_se) { /* optional targeted fallback; keep unknown as -- */ }
                }

                const statsStudentCount = _readStudentCountFromStats(monthStats);
                activeCount = _firstFiniteNumber(activeCount, statsStudentCount, _rootMonthCache.student, _readStudentCountFromClub(data));
                profileCount = _firstFiniteNumber(profileCount, data.cachedProfileCount, data.profileCount, data.totalStudents, activeCount);
                const studentCountForSummary = _firstFiniteNumber(activeCount, profileCount);
                const revenueTotal = _rootMonthCache.financeRejected
                    ? null
                    : _rootMonthCache.complete
                    ? _rootMonthCache.revenue
                    : _firstFiniteNumber(_readStatsIncomeTotal(monthStats), _rootMonthCache.revenue);
                const hasRevenueSource = revenueTotal !== null && Number.isFinite(revenueTotal);
                estimatedKB = Math.round((profileCount || studentCountForSummary || 0) * 1 + (txCount || 0) * 0.5 + (invCount || 0) * 0.4);

                return {
                    cid, data,
                    activeCount, profileCount, txCount, invCount,
                    studentCountForSummary,
                    estimatedKB,
                    monthStats,
                    revenueTotal,
                    hasRevenueSource,
                    curMonth: _curMonth4K
                };
            }));

            // Phase 4K-6V5U6A: all top-level SuperAdmin presentation is derived from
            // the already-loaded clubDataList. This helper performs zero Firestore reads.
            _renderSuperAdminSummaryFromLoadedData(clubDataList, today, in30Days, _curMonth4K);

            // Render từng CLB
            if (clubDataList.length === 0) {
                listEl.innerHTML = '<div class="text-center py-10 text-slate-400 italic text-sm">Chưa có CLB nào trong hệ thống</div>';
                return;
            }

            // Store globally for client-side filtering
            window._saClubData = { clubDataList, today, in30Days };
            _renderLegacyCredentialWarning(clubDataList);
            // Render using shared function (also used by filterSAClubs)
            window._renderSAClubRows(clubDataList, today, in30Days);

            // Phase 4K-6V5U6E client-only authority: missing or explicitly
            // incomplete finance cache remains "--". SuperAdmin never auto-calls
            // Functions and never aggregates tenant transactions in the browser.

        } catch (e) {
            console.error(e);
            _m().lastError = e.message;
            // [HOTFIX] Hiển thị lỗi rõ — đặc biệt phân biệt permission-denied vs lỗi khác
            const _isPermissionDenied = e.code === 'permission-denied' ||
                (e.message && (e.message.includes('permission-denied') || e.message.includes('PERMISSION_DENIED')));
            if (_isPermissionDenied) {
                listEl.innerHTML =
                    '<div class="text-center py-10 px-4 text-rose-500">' +
                    '<div class="text-3xl mb-3">🔒</div>' +
                    '<p class="font-bold text-sm mb-2">UI đã nhận diện ROOT nhưng Firestore chưa xác nhận canonical SuperAdmin principal.</p>' +
                    '<p class="text-xs text-slate-600 mb-3">Không mở Rules public. Hãy deploy <b>firestore.rules V5U4</b> rồi đăng xuất/đăng nhập lại.</p>' +
                    '<div class="text-left text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 inline-block">' +
                    '<p class="mb-1">① V5U4 chỉ cho ROOT email định danh tự tạo <code class="bg-slate-200 px-1 rounded">super_admins/{uid}</code> của chính mình.</p>' +
                    '<p>② Sau bootstrap, Rules và Cloud Functions đều dùng canonical principal này; không cấp quyền CLB trực tiếp bằng email.</p>' +
                    '</div>' +
                    '<p class="text-xs text-slate-400 mt-3">UID: <span id="_sa_perm_uid" class="font-mono">đang tải...</span><br>Email: <span id="_sa_perm_email" class="font-mono">đang tải...</span></p>' +
                    '</div>';
                // Hiển thị UID để dễ dàng tạo super_admins/{uid}
                try {
                    const _authCtx = window.getAppContext ? window.getAppContext('sa-perm-uid') : {};
                    const _uid = _authCtx?.auth?.currentUser?.uid || '(chưa có auth)';
                    const _email = _authCtx?.auth?.currentUser?.email || '(chưa có email)';
                    const _uidEl = document.getElementById('_sa_perm_uid');
                    const _emailEl = document.getElementById('_sa_perm_email');
                    if (_uidEl) _uidEl.innerText = _uid;
                    if (_emailEl) _emailEl.innerText = _email;
                } catch (_ue) {}
            } else {
                // [HOTFIX] Phân biệt lỗi runtime (ReferenceError/TypeError) vs lỗi khác
                const _isRuntime = e instanceof ReferenceError || e instanceof TypeError;
                const _isModuleMissing = e.message && e.message.includes('module');
                let _errMsg;
                if (_isRuntime) {
                    _errMsg = 'Lỗi runtime SuperAdmin: ' + e.message;
                } else if (_isModuleMissing) {
                    _errMsg = 'Không tải được module SuperAdmin.';
                } else {
                    _errMsg = 'Lỗi tải dữ liệu SuperAdmin: ' + e.message;
                }
                listEl.innerHTML = `<div class="text-center py-10 text-rose-500"><div class="text-2xl mb-2">❌</div><p class="font-bold text-sm">${_errMsg}</p><p class="text-xs text-slate-400 mt-1">${e.message}</p></div>`;
            }
        } finally {
            _m().lastDurationMs = Date.now() - _t0;
        }
    };

      // Phase 4K-6I-B: Single-flight + cooldown wrapper for loadSuperAdminData
      {
          const _coreLoad = window.loadSuperAdminData;
          window.loadSuperAdminData = async function _saLoadWrapped() {
              const now = Date.now();
              if (_saLoadPromise) {
                  console.info('[SuperAdmin] loadSuperAdminData single-flight reuse');
                  return _saLoadPromise;
              }
              if (now - _saLastLoadAt < SA_LOAD_COOLDOWN_MS && window.__lastSuperAdminDataRendered) {
                  console.info('[SuperAdmin] loadSuperAdminData cooldown skip');
                  return window.__lastSuperAdminDataRendered;
              }
              _saLoadPromise = (async () => {
                  try {
                      _saLastLoadAt = Date.now();
                      const result = await _coreLoad();
                      window.__lastSuperAdminDataRendered = result;
                      window.__saDashboardLoadedAt = Date.now();
                      return result;
                  } finally {
                      _saLoadPromise = null;
                  }
              })();
              return _saLoadPromise;
          };
      }

      // Phase 4K-6I-B: debugSuperAdminLoadState
      window.debugSuperAdminLoadState = function() {
          const result = {
              loadInFlight:           !!_saLoadPromise,
              lastLoadAt:             _saLastLoadAt,
              cooldownMs:             SA_LOAD_COOLDOWN_MS,
              renderedClubCount:      window._saClubData?.clubDataList?.length || 0,
              countRefreshQueueLength: _saCountRefreshQueue.length,
              countRefreshRunning:    _saCountRefreshRunning,
              quotaCircuit:           window.SuperAdminQuotaGuard?.getCircuitState?.() || null,
              metrics:                window.SuperAdminQuotaGuard?.getMetrics?.() || null,
              serverRefresh:          window.SuperAdminServerRefresh?.getSuperAdminServerRefreshState?.() || null,
          };
          console.log('[debugSuperAdminLoadState]', result);
          console.table(result);
          return result;
      };

      // Phase 4K-6I-C: hard-stop diagnostics + manual single-club refresh only.
      
          window.debugSuperAdminRenderScopeFix = function() {
              const result = {
                  renderScopeFix: window.__saRenderScopeFix === true,
                  hasShortFormatter: typeof _saFmtRevenueShort === 'function',
                  hasFullFormatter: typeof _saFmtRevenueFull === 'function',
                  canRenderRows: typeof window._renderSAClubRows === 'function',
                  lastError: window.__superAdminModuleMetrics?.lastError || null
              };
              console.log('[debugSuperAdminRenderScopeFix]', result);
              return result;
          };

window.debugSuperAdminAggregationHardStop = function() {
          const result = {
              autoBackgroundRefreshDisabled: window.__saDisableBackgroundCountRefresh === true,
              hardStop: window.__saAggregationHardStop === true,
              circuit: window.SuperAdminQuotaGuard?.getCircuitState?.() || null,
              metrics: window.SuperAdminQuotaGuard?.getMetrics?.() || null,
              queueLength: _saCountRefreshQueue.length,
              queueRunning: _saCountRefreshRunning,
              note: 'SuperAdmin dashboard is cached-only by default; missing counts render as --.'
          };
          console.log('[debugSuperAdminAggregationHardStop]', result);
          console.table(result);
          return result;
      };

      window.refreshSuperAdminCountsForClub = async function(cid) {
          if (!cid) return { ok: false, reason: 'missing-cid' };
          // Phase 4K-6I-H: manual refresh also uses Cloud Function, NOT client aggregation.
          if (typeof window.refreshSuperAdminSummaryForClubViaServer === 'function') {
              const result = await window.refreshSuperAdminSummaryForClubViaServer(cid, { reason: 'manual-superadmin-refresh' });
              if (result && result.ok) {
                  try { await window.loadSuperAdminData?.(); } catch (_) {}
              }
              return result;
          }
          return { ok: false, reason: 'server-refresh-helper-not-loaded', cid };
      };

      // ════════════════════════════════════════════════════════════
      // 2. openExpiryModal — Open expiry date modal
      // ════════════════════════════════════════════════════════════
          window.openExpiryModal = (clubId, clubName, currentExpiry) => {
        document.getElementById('em_clubId').value = clubId;
        document.getElementById('em_clubName').innerText = clubName;
        document.getElementById('em_expiryDate').value = currentExpiry || '2027-04-30';
        document.getElementById('expiryModal').style.display = 'flex';
    };

      // ════════════════════════════════════════════════════════════
      // 3. lockClubAccount / unlockClubAccount
      // ════════════════════════════════════════════════════════════
          window.lockClubAccount = async (clubId, clubName) => {
        _m().lockClubCalls++; _m().lastAction = 'lockClubAccount';
        if (!confirm(`⚠️ KHÓA TÀI KHOẢN\n\nBạn có chắc muốn KHÓA tài khoản CLB:\n"${clubName}" (${clubId})?\n\nSau khi khóa, HLV của CLB này sẽ không thể đăng nhập và sử dụng phần mềm cho đến khi được mở khóa lại.`)) return;
        const _t0 = Date.now();
        try {
            await updateDoc(doc(db, "clubs", clubId), { accountStatus: 'locked' });
            _m().lastDurationMs = Date.now() - _t0;
            window.showToast("🔒 Đã khóa tài khoản CLB thành công!");
            window.loadSuperAdminData();
        } catch (e) { _m().lastError = e.message; console.error(e); alert("Lỗi: " + e.message); }
    };

          window.unlockClubAccount = async (clubId) => {
        _m().unlockClubCalls++; _m().lastAction = 'unlockClubAccount';
        const _t0 = Date.now();
        try {
            await updateDoc(doc(db, "clubs", clubId), { accountStatus: 'active' });
            _m().lastDurationMs = Date.now() - _t0;
            window.showToast("🔓 Đã mở khóa tài khoản CLB thành công!");
            window.loadSuperAdminData();
        } catch (e) { _m().lastError = e.message; console.error(e); alert("Lỗi: " + e.message); }
    };

      // ════════════════════════════════════════════════════════════
      // 4. toggleExamFeature — Enable/disable exam tab per club
      // ════════════════════════════════════════════════════════════
          window.toggleExamFeature = async (clubId, clubName, currentEnabled) => {
        _m().toggleExamCalls++; _m().lastAction = 'toggleExamFeature';
        const action = currentEnabled ? 'TẮT' : 'BẬT';
        const actionVi = currentEnabled ? 'tắt' : 'bật';
        if (!confirm(`${action} tính năng Thi Đai cho CLB:\n"${clubName}"?\n\nKhi ${actionVi}, admin CLB ${currentEnabled ? 'sẽ KHÔNG' : 'sẽ'} thấy tab Thi Đai khi đăng nhập.`)) return;
        const _t0 = Date.now();
        try {
            await updateDoc(doc(db, "clubs", clubId), { examEnabled: !currentEnabled });
            _m().lastDurationMs = Date.now() - _t0;
            window.showToast(`✅ Đã ${actionVi} tính năng Thi Đai cho CLB "${clubName}"!`);
            window.loadSuperAdminData();
        } catch (e) { _m().lastError = e.message; console.error(e); alert("Lỗi: " + e.message); }
    };

      // ════════════════════════════════════════════════════════════
      // 5. saOpenDeleteTxModal — Open delete transaction modal
      // ════════════════════════════════════════════════════════════
          window.saOpenDeleteTxModal = (clubId, clubName) => {
        document.getElementById('deleteTxModal_clubId').value = clubId;
        document.getElementById('deleteTxModal_clubName').innerText = clubName;
        document.getElementById('deleteTxModal_before').value = '';
        document.getElementById('deleteTxModal_result').innerHTML = '';
        document.getElementById('deleteTxModal').style.display = 'flex';
    };

      // ════════════════════════════════════════════════════════════
      // 6. filterSAClubs — Client-side search/filter on cached data
      // ════════════════════════════════════════════════════════════
          window.filterSAClubs = () => {
        _m().lastAction = 'filterSAClubs';
        if (!window._saClubData) return;
        const { clubDataList, today, in30Days } = window._saClubData;
        const search = (document.getElementById('sa_search')?.value || '').toLowerCase().trim();
        const statusFilter = document.getElementById('sa_filter_status')?.value || 'all';

        const filtered = clubDataList.filter(({ cid, data }) => {
            const cname = (data.clubName || '').toLowerCase();
            const email = (data.adminEmail || '').toLowerCase();
            const expiryDate = data.expiryDate || '2027-04-30';
            const acctStatus = data.accountStatus || 'active';
            const isExpired = expiryDate < today;
            const isExpiring = !isExpired && expiryDate <= in30Days;
            const isLocked = acctStatus === 'locked';

            // Text search
            if (search && !cid.includes(search) && !cname.includes(search) && !email.includes(search)) return false;

            // Status filter
            if (statusFilter === 'active' && (isLocked || isExpired || isExpiring)) return false;
            if (statusFilter === 'expiring' && !isExpiring) return false;
            if (statusFilter === 'expired' && !isExpired) return false;
            if (statusFilter === 'locked' && !isLocked) return false;

            return true;
        });

        // Show filter info
        const infoEl = document.getElementById('sa_filter_info');
        if (infoEl) {
            const hasFilter = search || statusFilter !== 'all';
            if (hasFilter) {
                infoEl.style.display = 'block';
                infoEl.innerText = `Hiển thị ${filtered.length} / ${clubDataList.length} CLB`;
            } else {
                infoEl.style.display = 'none';
            }
        }

        window._renderSAClubRows(filtered, today, in30Days);
    };

      // ════════════════════════════════════════════════════════════
      // 7. _renderSAClubRows — Render club list (desktop + mobile)
      // ════════════════════════════════════════════════════════════
          window._renderSAClubRows = (clubDataList, today, in30Days) => {
        _m().clubListRenderCalls++; _m().lastAction = '_renderSAClubRows';
        const listEl = document.getElementById('sysClubListMain');
        if (!listEl) return;

        if (clubDataList.length === 0) {
            listEl.innerHTML = '<div class="text-center py-10 text-slate-400 italic text-sm">Không tìm thấy CLB nào phù hợp</div>';
            return;
        }

        const maxSizeKB = Math.max(...clubDataList.map(c => c.estimatedKB), 1);

        listEl.innerHTML = clubDataList.map(({ cid, data, activeCount, profileCount, txCount, invCount, estimatedKB, monthStats, revenueTotal, hasRevenueSource, curMonth }) => {
            // [HOTFIX] monthStats và curMonth được destructure đúng từ clubDataList item
            const cname = data.clubName || 'Chưa đặt tên';
            const email = data.adminEmail || 'Không rõ';
            const created = data.createdAt ? formatDate(data.createdAt.split('T')[0]) : '-';
            const expiryDate = data.expiryDate || '2027-04-30';
            const acctStatus = data.accountStatus || 'active';
            const isExpired = expiryDate < today;
            const isExpiring = !isExpired && expiryDate <= in30Days;
            const isLocked = acctStatus === 'locked';

            let statusBadge, rowBg;
            if (isLocked) {
                statusBadge = '<span style="font-size:0.7rem;font-weight:900;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:2px 8px;border-radius:99px;white-space:nowrap;">🔒 Đã Khóa</span>';
                rowBg = 'background:#fff5f5;border-left:3px solid #fca5a5;';
            } else if (isExpired) {
                statusBadge = '<span style="font-size:0.7rem;font-weight:900;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:2px 8px;border-radius:99px;white-space:nowrap;">❌ Hết Hạn</span>';
                rowBg = 'background:#fff5f5;border-left:3px solid #fca5a5;';
            } else if (isExpiring) {
                statusBadge = '<span style="font-size:0.7rem;font-weight:900;background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:2px 8px;border-radius:99px;white-space:nowrap;">⚠️ Sắp HH</span>';
                rowBg = 'background:#fffdf0;border-left:3px solid #fcd34d;';
            } else {
                statusBadge = '<span style="font-size:0.7rem;font-weight:900;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:2px 8px;border-radius:99px;white-space:nowrap;">✅ Hoạt Động</span>';
                rowBg = '';
            }

            const expColor = (isExpired || isLocked) ? '#991b1b' : isExpiring ? '#92400e' : '#059669';
            const sizeDisplay = estimatedKB >= 1024 ? (estimatedKB / 1024).toFixed(1) + ' MB' : estimatedKB + ' KB';
            const sizeColor = estimatedKB > 5000 ? '#dc2626' : estimatedKB > 2000 ? '#d97706' : '#4f46e5';
            const sizePct = Math.round((estimatedKB / maxSizeKB) * 100);

            const examEnabled = data.examEnabled !== false;
            const _cfgBtnStyle = 'font-size:0.72rem;font-weight:800;padding:7px 13px;border-radius:8px;cursor:pointer;border:1.5px solid #4f46e5;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;white-space:nowrap;box-shadow:0 2px 8px rgba(79,70,229,0.25);';
            const _cfgItemStyle = 'display:block;width:100%;text-align:left;padding:8px 13px;border-radius:8px;border:none;cursor:pointer;font-size:0.78rem;font-weight:700;background:transparent;transition:background 0.1s;';
            const _cfgSep = '<div style="height:1px;background:#f1f5f9;margin:3px 8px;"></div>';
            const _safeEmail = email.replace(/'/g, "&#x27;");
            const _safeCname = cname.replace(/'/g, "&#x27;");

            const activeDisplay = _saFmtOptionalCount(activeCount);
            const profileDisplay = _saFmtOptionalCount(profileCount);
            const revenueShortDisplay = _saFmtRevenueShort(revenueTotal);
            const revenueFullDisplay = _saFmtRevenueFull(revenueTotal);

            // ── Desktop row ──
            const desktopRow = `<div class="hidden md:grid items-center gap-2 px-4 py-3 border-b border-slate-100 hover:bg-slate-50/80 transition-colors" style="grid-template-columns:148px 1fr 185px 80px 115px 115px 1fr;${rowBg}">
                <div>
                    <div style="font-size:0.78rem;font-weight:900;color:#4338ca;font-family:monospace;letter-spacing:-0.3px;">${cid}</div>
                    <div style="font-size:0.6rem;color:#94a3b8;margin-top:2px;">Tạo: ${created}</div>
                </div>
                <div>
                    <div style="font-size:0.9rem;font-weight:800;color:#0f172a;">${cname}</div>
                    <div style="font-size:0.62rem;color:#94a3b8;margin-top:2px;">${activeDisplay}/${profileDisplay} võ sinh · ${sizeDisplay}</div>
                    ${hasRevenueSource ? '<div style="font-size:0.6rem;color:#059669;margin-top:2px;font-weight:700;">💰 T' + (curMonth||'').split('-')[1] + ': ' + revenueFullDisplay + '</div>' : '<div style="font-size:0.6rem;color:#94a3b8;margin-top:2px;font-weight:700;">💰 T' + ((curMonth||'').split('-')[1]||'?') + ': --</div>'}
                </div>
                <div style="overflow:hidden;">
                    <div style="font-size:0.72rem;font-weight:600;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${email}">${email}</div>
                    <div style="font-size:0.6rem;color:#94a3b8;margin-top:3px;">🔐 Mật khẩu được quản lý bởi Firebase Authentication</div></div>
                <div style="text-align:center;">
                    <div style="font-size:1.2rem;font-weight:900;color:#4338ca;">${activeDisplay}</div>
                    <div style="font-size:0.6rem;color:#94a3b8;">/ ${profileDisplay}</div>
                </div>
                <div>
                    <div style="font-size:0.82rem;font-weight:800;color:${expColor};">${formatDate(expiryDate)}</div>
                </div>
                <div>${statusBadge}</div>
                <div style="position:relative;display:flex;align-items:flex-start;">
                    <button class="sa-cfg-btn" onclick="_toggleSAConfig('${cid}',event)" style="${_cfgBtnStyle}">⚙️ Cấu hình ▾</button>
                    <div id="sa_cfg_${cid}" class="sa-cfg-dd" style="display:none;position:absolute;right:0;top:calc(100% + 6px);z-index:9999;background:#fff;border:1.5px solid #e2e8f0;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,0.18);padding:6px;min-width:195px;">
                        <div style="padding:6px 12px 4px;font-size:0.6rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Quản lý tài khoản</div>
                        <button onclick="_toggleSAConfig('${cid}');openExpiryModal('${cid}','${_safeCname}','${expiryDate}')" style="${_cfgItemStyle}color:#5b21b6;" onmouseover="this.style.background='#ede9fe'" onmouseout="this.style.background='transparent'">📅 Gia Hạn Sử Dụng</button>
                        <button onclick="_toggleSAConfig('${cid}');${isLocked ? `unlockClubAccount('${cid}')` : `lockClubAccount('${cid}','${_safeCname}')`}" style="${_cfgItemStyle}color:${isLocked ? '#065f46' : '#be123c'};" onmouseover="this.style.background='${isLocked ? '#d1fae5' : '#fff1f2'}'" onmouseout="this.style.background='transparent'">${isLocked ? '🔓 Mở Khóa TK' : '🔒 Khóa Tài Khoản'}</button>
                        ${_cfgSep}
                        <div style="padding:6px 12px 4px;font-size:0.6rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Cấu hình CLB</div>
                        <button onclick="_toggleSAConfig('${cid}');editClubName('${cid}','${_safeCname}')" style="${_cfgItemStyle}color:#1d4ed8;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='transparent'">✏️ Sửa Tên CLB</button>
                        <button onclick="_toggleSAConfig('${cid}');openBranchUpgradeModal('${cid}','${_safeCname}')" style="${_cfgItemStyle}color:#166534;" onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='transparent'">🏢 Cấu hình Cơ Sở</button>
                        <button onclick="_toggleSAConfig('${cid}');toggleExamFeature('${cid}','${_safeCname}',${examEnabled})" style="${_cfgItemStyle}color:${examEnabled ? '#854d0e' : '#166534'};" onmouseover="this.style.background='${examEnabled ? '#fef9c3' : '#f0fdf4'}'" onmouseout="this.style.background='transparent'">${examEnabled ? '🏆 Tắt Tính Năng Thi' : '🏆 Bật Tính Năng Thi'}</button>
                        ${_cfgSep}
                        <div style="padding:6px 12px 4px;font-size:0.6rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Tài khoản đăng nhập</div>
                        <button onclick="_toggleSAConfig('${cid}');forceReplaceAdmin('${cid}')" style="${_cfgItemStyle}color:#6d28d9;" onmouseover="this.style.background='#f5f3ff'" onmouseout="this.style.background='transparent'">🔄 Cấp Lại Tài Khoản</button>
                        <button onclick="_toggleSAConfig('${cid}');saResetAdminPassword('${_safeEmail}','${_safeCname}')" style="${_cfgItemStyle}color:#0369a1;" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background='transparent'">🔑 Đổi Mật Khẩu</button>
                        ${_cfgSep}
                        <button onclick="_toggleSAConfig('${cid}');saOpenDeleteTxModal('${cid}','${_safeCname}')" style="${_cfgItemStyle}color:#9f1239;" onmouseover="this.style.background='#fff1f2'" onmouseout="this.style.background='transparent'">🗑️ Xóa Biên Lai</button>
                    </div>
                </div>
            </div>`;

            // ── Mobile card ──
            const mobileCard = `<div class="md:hidden border-b border-slate-100 px-4 py-4" style="${rowBg}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:8px;">
                    <div style="flex:1;min-width:0;">
                        <span style="font-size:0.7rem;font-weight:900;color:#4338ca;font-family:monospace;background:#eef2ff;padding:2px 7px;border-radius:5px;">${cid}</span>
                        <div style="font-size:1rem;font-weight:800;color:#0f172a;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cname}</div>
                        <div style="font-size:0.68rem;color:#64748b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${email}">📧 ${email}</div>
                        <div style="font-size:0.63rem;color:#94a3b8;margin-top:3px;">🔐 Mật khẩu: Firebase Authentication</div>
                    </div>
                    <div style="flex-shrink:0;">${statusBadge}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
                    <div style="background:#eef2ff;border-radius:10px;padding:8px;text-align:center;">
                        <div style="font-size:0.58rem;color:#6366f1;font-weight:900;text-transform:uppercase;">Võ Sinh</div>
                        <div style="font-size:1.1rem;font-weight:900;color:#4338ca;margin-top:2px;">${activeDisplay}</div>
                        <div style="font-size:0.58rem;color:#a5b4fc;">/ ${profileDisplay} hs</div>
                    </div>
                    <div style="background:#f0fdf4;border-radius:10px;padding:8px;text-align:center;">
                        <div style="font-size:0.58rem;color:#16a34a;font-weight:900;text-transform:uppercase;">Thu T.${(curMonth||'').split('-')[1]||'?'}</div>
                        <div style="font-size:0.82rem;font-weight:900;color:#065f46;margin-top:2px;">${revenueShortDisplay}</div>
                        <div style="font-size:0.58rem;color:#86efac;">${sizeDisplay}</div>
                    </div>
                    <div style="background:#fff7ed;border-radius:10px;padding:8px;text-align:center;">
                        <div style="font-size:0.58rem;color:#ea580c;font-weight:900;text-transform:uppercase;">Hết Hạn</div>
                        <div style="font-size:0.75rem;font-weight:900;color:${expColor};margin-top:2px;">${formatDate(expiryDate)}</div>
                        <div style="font-size:0.58rem;color:#fdba74;">ngày hết hạn</div>
                    </div>
                </div>
                <div style="position:relative;">
                    <button class="sa-cfg-btn" onclick="_toggleSAConfig('${cid}_m',event)" style="width:100%;font-size:0.85rem;font-weight:800;padding:12px 16px;border-radius:10px;cursor:pointer;border:1.5px solid #4f46e5;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;text-align:center;box-shadow:0 2px 8px rgba(79,70,229,0.25);">⚙️ Cấu hình CLB ▾</button>
                    <div id="sa_cfg_${cid}_m" class="sa-cfg-dd" style="display:none;position:fixed;left:12px;right:12px;bottom:0;z-index:10001;background:#fff;border-radius:20px 20px 0 0;box-shadow:0 -8px 40px rgba(0,0,0,0.22);padding:8px 6px 24px;">
                        <div style="text-align:center;padding:8px 0 12px;"><div style="width:36px;height:4px;background:#e2e8f0;border-radius:99px;margin:0 auto;"></div></div>
                        <div style="padding:2px 8px 6px;font-size:0.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Quản lý tài khoản</div>
                        <button onclick="_toggleSAConfig('${cid}_m');openExpiryModal('${cid}','${_safeCname}','${expiryDate}')" style="${_cfgItemStyle}color:#5b21b6;font-size:0.88rem;padding:12px 14px;" onmouseover="this.style.background='#ede9fe'" onmouseout="this.style.background='transparent'">📅 Gia Hạn Sử Dụng</button>
                        <button onclick="_toggleSAConfig('${cid}_m');${isLocked ? `unlockClubAccount('${cid}')` : `lockClubAccount('${cid}','${_safeCname}')`}" style="${_cfgItemStyle}color:${isLocked ? '#065f46' : '#be123c'};font-size:0.88rem;padding:12px 14px;" onmouseover="this.style.background='${isLocked ? '#d1fae5' : '#fff1f2'}'" onmouseout="this.style.background='transparent'">${isLocked ? '🔓 Mở Khóa Tài Khoản' : '🔒 Khóa Tài Khoản'}</button>
                        ${_cfgSep}
                        <div style="padding:6px 8px 4px;font-size:0.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Cấu hình CLB</div>
                        <button onclick="_toggleSAConfig('${cid}_m');editClubName('${cid}','${_safeCname}')" style="${_cfgItemStyle}color:#1d4ed8;font-size:0.88rem;padding:12px 14px;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='transparent'">✏️ Sửa Tên CLB</button>
                        <button onclick="_toggleSAConfig('${cid}_m');openBranchUpgradeModal('${cid}','${_safeCname}')" style="${_cfgItemStyle}color:#166534;font-size:0.88rem;padding:12px 14px;" onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='transparent'">🏢 Cấu hình Cơ Sở</button>
                        <button onclick="_toggleSAConfig('${cid}_m');toggleExamFeature('${cid}','${_safeCname}',${examEnabled})" style="${_cfgItemStyle}color:${examEnabled ? '#854d0e' : '#166534'};font-size:0.88rem;padding:12px 14px;" onmouseover="this.style.background='${examEnabled ? '#fef9c3' : '#f0fdf4'}'" onmouseout="this.style.background='transparent'">${examEnabled ? '🏆 Tắt Tính Năng Thi' : '🏆 Bật Tính Năng Thi'}</button>
                        ${_cfgSep}
                        <div style="padding:6px 8px 4px;font-size:0.62rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Tài khoản đăng nhập</div>
                        <button onclick="_toggleSAConfig('${cid}_m');forceReplaceAdmin('${cid}')" style="${_cfgItemStyle}color:#6d28d9;font-size:0.88rem;padding:12px 14px;" onmouseover="this.style.background='#f5f3ff'" onmouseout="this.style.background='transparent'">🔄 Cấp Lại Tài Khoản</button>
                        <button onclick="_toggleSAConfig('${cid}_m');saResetAdminPassword('${_safeEmail}','${_safeCname}')" style="${_cfgItemStyle}color:#0369a1;font-size:0.88rem;padding:12px 14px;" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background='transparent'">🔑 Đổi Mật Khẩu</button>
                        ${_cfgSep}
                        <button onclick="_toggleSAConfig('${cid}_m');saOpenDeleteTxModal('${cid}','${_safeCname}')" style="${_cfgItemStyle}color:#9f1239;font-size:0.88rem;padding:12px 14px;" onmouseover="this.style.background='#fff1f2'" onmouseout="this.style.background='transparent'">🗑️ Xóa Biên Lai</button>
                        <button onclick="_toggleSAConfig('${cid}_m')" style="width:100%;margin-top:8px;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;background:#f8fafc;color:#64748b;font-size:0.82rem;font-weight:700;cursor:pointer;">✕ Đóng</button>
                    </div>
                </div>
            </div>`;

            return desktopRow + mobileCard;
        }).join('');
    };

      // ════════════════════════════════════════════════════════════
      // 8. _toggleSAConfig — Toggle per-club config dropdown
      // ════════════════════════════════════════════════════════════
          window._toggleSAConfig = (cid, ev) => {
        if (ev) ev.stopPropagation();
        const all = document.querySelectorAll('.sa-cfg-dd');
        const cur = document.getElementById('sa_cfg_' + cid);
        const isOpen = cur && cur.style.display !== 'none';
        all.forEach(el => { el.style.display = 'none'; });
        if (cur && !isOpen) cur.style.display = 'block';
    };
      // Close all SA config dropdowns on outside click (re-bind each load)
      document.addEventListener('click', function _saOutsideClick(e) {
          if (!e.target.closest('.sa-cfg-btn')) {
              document.querySelectorAll('.sa-cfg-dd').forEach(el => el.style.display = 'none');
          }
      });

      // ════════════════════════════════════════════════════════════
      // 9. forceReplaceAdmin — Create new admin account for club
      // ════════════════════════════════════════════════════════════
          window.forceReplaceAdmin = async (clubId) => {
        _m().forceReplaceAdminCalls++; _m().lastAction = 'forceReplaceAdmin';
        const _t0 = Date.now();
        const newEmail = prompt(`CẤP LẠI TÀI KHOẢN CHO MÃ HỆ THỐNG: ${clubId}\n\nNhập EMAIL MỚI (Lưu ý: Phải là email chưa từng đăng ký trên hệ thống này):`);
        if(!newEmail || !newEmail.includes('@')) return alert("Email không hợp lệ hoặc đã bị hủy!");
        
        const newPass = prompt(`Nhập MẬT KHẨU MỚI cho tài khoản ${newEmail} (Yêu cầu ít nhất 6 ký tự):`);
        if(!newPass || newPass.length < 6) return alert("Mật khẩu quá ngắn, phải từ 6 ký tự trở lên!");
        
        if(!confirm(`⚠️ XÁC NHẬN CẤP LẠI:\n- Tài khoản mới: ${newEmail}\n- Mật khẩu mới: đã nhập (không hiển thị lại)\n- Sẽ được cấp quyền quản lý toàn bộ dữ liệu của CLB: ${clubId}\n\n(Yên tâm: Dữ liệu cũ của CLB vẫn được giữ nguyên 100%)`)) return;

        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPass);
            const newUid = userCredential.user.uid;

            await setDoc(doc(db, "users", newUid), { email: newEmail, role: "admin", clubId: clubId });
            await updateDoc(doc(db, "clubs", clubId), { adminEmail: newEmail });

            _m().lastDurationMs = Date.now() - _t0;
            alert(`✅ ĐÃ TẠO TÀI KHOẢN THÀNH CÔNG!\n\nTài khoản Firebase Authentication đã được tạo. Mật khẩu không được lưu hoặc hiển thị lại trong hệ thống. Toàn bộ dữ liệu cũ của CLB vẫn được giữ nguyên.`);
            window.loadSuperAdminData(); 
        } catch (error) {
            _m().lastError = error.message;
            console.error(error);
            if(error.code === 'auth/email-already-in-use') alert("❌ Lỗi: Email mới này đã được sử dụng ở một CLB khác rồi. Vui lòng chọn một email khác!");
            else alert("❌ Lỗi hệ thống: " + error.message);
        } finally {
            await signOut(secondaryAuth);
        }
    };

      // ════════════════════════════════════════════════════════════
      // 10. editClubName
      // ════════════════════════════════════════════════════════════
          window.editClubName = async (clubId, currentName) => {
        _m().editClubNameCalls++; _m().lastAction = 'editClubName';
        const newName = prompt(`Nhập TÊN HIỂN THỊ mới cho CLB [${clubId}]:`, currentName);
        if (!newName || newName.trim() === currentName) return;
        const _t0 = Date.now();
        try {
            await updateDoc(doc(db, "clubs", clubId), { clubName: newName.trim() });
            _m().lastDurationMs = Date.now() - _t0;
            window.showToast("✅ Đã cập nhật thành công tên CLB trên hệ thống!");
            window.loadSuperAdminData();
        } catch (error) {
            _m().lastError = error.message;
            console.error(error); alert("Lỗi khi cập nhật tên!");
        }
    };

      // ════════════════════════════════════════════════════════════
      // 11. selectBranchCard + openBranchUpgradeModal + saveBranchUpgrade
      // ════════════════════════════════════════════════════════════
          window.selectBranchCard = (n) => {
        _buSelectedCount = n;
        for(let _i = 1; _i <= 10; _i++) {
            const card = document.getElementById('bu_card' + _i);
            if(!card) continue;
            if(_i === n) {
                card.style.border = '2px solid #16a34a';
                card.style.background = '#f0fdf4';
            } else {
                card.style.border = '2px solid #e2e8f0';
                card.style.background = '#fff';
            }
        }
        const namesBlock = document.getElementById('bu_namesBlock');
        const infoEl = document.getElementById('bu_info');
        if(n === 1) {
            namesBlock.style.display = 'none';
            infoEl.style.display = 'block';
            infoEl.innerHTML = '⚠️ Khi chọn 1 cơ sở, tính năng phân cơ sở sẽ bị <strong>ẩn</strong> trên giao diện CLB. Dữ liệu hiện có vẫn được giữ nguyên.';
        } else {
            namesBlock.style.display = 'block';
            infoEl.style.display = 'none';
            for(let _i = 2; _i <= 10; _i++) {
                const blk = document.getElementById('bu_nameBlock' + _i);
                if(blk) blk.style.display = _i <= n ? 'block' : 'none';
            }
        }
    };

    // [Phase 4.0B-1] FIX: Removed nested re-definition bug.
    // Original code had an outer shell that set 2 DOM fields then immediately
    // redefined window.openBranchUpgradeModal — so the first call never opened
    // the modal. Now: one flat async function with the full implementation.
    window.openBranchUpgradeModal = async (clubId, clubName) => {
        _m().lastAction = 'openBranchUpgradeModal';
        document.getElementById('bu_clubId').value = clubId;
        document.getElementById('bu_clubName').innerText = clubName + ' (' + clubId + ')';
        document.getElementById('bu_info').style.display = 'none';
        document.getElementById('bu_submitBtn').innerHTML = '✅ Lưu Cấu Hình Cơ Sở';
        document.getElementById('bu_submitBtn').disabled = false;

        // Default values for all 10 branch name inputs
        for(let _i = 1; _i <= 10; _i++) {
            const el = document.getElementById('bu_name' + _i);
            if(el) el.value = 'Cơ sở ' + _i;
        }

        // Fetch current settings
        try {
            const settingsSnap = await getDoc(doc(db, "clubs", clubId, "settings", "main_config"));
            if(settingsSnap.exists()) {
                const cfg = settingsSnap.data();
                const currentCount = cfg.branchCount || 2;
                for(let _i = 1; _i <= 10; _i++) {
                    const el = document.getElementById('bu_name' + _i);
                    if(el && cfg['branchName' + _i]) el.value = cfg['branchName' + _i];
                }
                window.selectBranchCard(currentCount);
            } else {
                window.selectBranchCard(2);
            }
        } catch(e) {
            window.selectBranchCard(2);
        }

        document.getElementById('branchUpgradeModal').style.display = 'flex';
    };

          window.saveBranchUpgrade = async () => {
        _m().saveBranchUpgradeCalls++; _m().lastAction = 'saveBranchUpgrade';
        const clubId = document.getElementById('bu_clubId').value;
        const btnEl = document.getElementById('bu_submitBtn');
        const n = _buSelectedCount;

        const confirmMsg = n === 1
            ? 'Xác nhận đặt CLB này về 1 cơ sở (ẩn tính năng phân cơ sở)?'
            : 'Xác nhận cập nhật CLB này thành ' + n + ' cơ sở hoạt động?';
        if(!confirm(confirmMsg)) return;

        btnEl.innerHTML = '⏳ Đang lưu...'; btnEl.disabled = true;
        const _t0 = Date.now();

        const updateData = { branchCount: n };
        for(let _i = 1; _i <= n; _i++) {
            const el = document.getElementById('bu_name' + _i);
            updateData['branchName' + _i] = (el ? el.value.trim() : '') || ('Cơ sở ' + _i);
        }

        try {
            await setDoc(doc(db, "clubs", clubId, "settings", "main_config"), updateData, { merge: true });
            _m().lastDurationMs = Date.now() - _t0;
            document.getElementById('branchUpgradeModal').style.display = 'none';
            window.showToast('✅ Đã cập nhật cấu hình cơ sở cho CLB thành công!');
        } catch(e) {
            _m().lastError = e.message;
            alert('❌ Lỗi khi lưu cấu hình: ' + e.message);
        } finally {
            btnEl.innerHTML = '✅ Lưu Cấu Hình Cơ Sở'; btnEl.disabled = false;
        }
    };

      // ════════════════════════════════════════════════════════════
      // 12. saResetAdminPassword
      // ════════════════════════════════════════════════════════════
          window.saResetAdminPassword = async (adminEmail, clubName) => {
        _m().saResetPasswordCalls++; _m().lastAction = 'saResetAdminPassword';
        if (!adminEmail || !adminEmail.includes('@')) return alert('Email admin không hợp lệ!');
        const choice = confirm('🔑 ĐỔI MẬT KHẨU ADMIN CLB\n\nCLB: ' + clubName + '\nEmail: ' + adminEmail + '\n\nNhấn OK để gửi email đặt lại mật khẩu đến địa chỉ trên.\nAdmin CLB sẽ nhận được link để tự đặt mật khẩu mới.\n\n(Nhấn Hủy để không gửi)');
        if (!choice) return;
        try {
            await sendPasswordResetEmail(auth, adminEmail);
            window.showToast('✅ Đã gửi email đặt lại mật khẩu đến: ' + adminEmail);
        } catch(e) {
            _m().lastError = e.message;
            if(e.code === 'auth/user-not-found') alert('❌ Không tìm thấy tài khoản với email này trên Firebase!');
            else alert('❌ Lỗi: ' + e.message);
        }
    };

      // ════════════════════════════════════════════════════════════
      // window.SuperAdminModule — public API surface
      // [Phase 4.0B-2] Delegated to _registerSuperAdminPublicAPI()
      // để rebind fast-path cũng dùng cùng object definition.
      // ════════════════════════════════════════════════════════════
      _registerSuperAdminPublicAPI();

      console.debug('[superadmin.js] ✅ initSuperAdmin() Phase 4.0B-2 — 22 aliases registered');
  }
  

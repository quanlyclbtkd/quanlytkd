// js/modules/superadmin.js
  // Phase 4.0B: SuperAdmin Module — Production-Safe Extraction
  // Extracted from app.js. All window.* APIs remain backward compatible.
  // Do NOT import app.js — use window.getAppContext() for shared state.

  // ── Context bridge ───────────────────────────────────────────────
  function _ctx(reason = 'superadmin') {
      return window.getAppContext ? window.getAppContext(reason) : {};
  }

  // ── Module-level idempotency ─────────────────────────────────────
  let __saInitialized = false;

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
          setDoc, getDoc, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,
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

            // Helper: đếm docs bằng getDocs().size — không dùng Aggregation API
            // để tránh lỗi 429 (rate limit) khi có nhiều CLB
            const countDocs = async (q) => { // [3.3E] Caller must pass bounded query
                try {
                    const snap = await getDocs(q);
                    return snap.size;
                } catch (_e) {
                    return 0;
                }
            };

            const clubDataList = await Promise.all(clubDocs.map(async (docSnap) => {
                const cid = docSnap.id;
                const data = docSnap.data();

                // Ưu tiên dùng cached counts trong clubs doc (cập nhật realtime) nếu có
                // Fallback: tự đếm qua getDocs (đáng tin cậy, không bị rate limit)
                let activeCount, profileCount, txCount, invCount;
                if (typeof data.cachedActiveCount === 'number' && data.cachedCountUpdatedAt) {
                    // [SỬA ĐỒNG BỘ] Giảm cache từ 24h xuống 2h để SuperAdmin thấy số liệu mới hơn
                    const cacheAge = Date.now() - (data.cachedCountUpdatedAt || 0);
                    if (cacheAge < 2 * 60 * 60 * 1000) {
                        activeCount  = data.cachedActiveCount  || 0;
                        profileCount = data.cachedProfileCount || 0;
                        txCount      = data.cachedTxCount      || 0;
                        invCount     = data.cachedInvCount     || 0;
                    }
                }
                if (activeCount === undefined) {
                    // Đếm thực từ Firestore — song song 4 collection
                    [activeCount, profileCount, txCount, invCount] = await Promise.all([
                        countDocs(query(collection(db, "clubs", cid, "profiles"), where("status", "==", "active"))),
                        countDocs(collection(db, "clubs", cid, "profiles")),
                        countDocs(collection(db, "clubs", cid, "transactions")),
                        countDocs(collection(db, "clubs", cid, "inventory")),
                    ]);
                    // Ghi cache lại vào clubs doc để lần sau dùng được
                    updateDoc(doc(db, "clubs", cid), {
                        cachedActiveCount:  activeCount,
                        cachedProfileCount: profileCount,
                        cachedTxCount:      txCount,
                        cachedInvCount:     invCount,
                        cachedCountUpdatedAt: Date.now(),
                    }).catch(() => {});
                }

                // Ước tính dung lượng (KB): profile ~1KB, tx ~0.5KB, inv ~0.4KB
                const estimatedKB = Math.round(profileCount * 1 + txCount * 0.5 + invCount * 0.4);
                return { cid, data, activeCount, profileCount, txCount, invCount, estimatedKB };
            }));

            // Tính tổng dung lượng hệ thống
            const totalKB = clubDataList.reduce((s, c) => s + c.estimatedKB, 0);
            const FREE_QUOTA_KB = 1024 * 1024; // 1GB free Firestore quota (ước tính)
            const usagePct = Math.min(100, (totalKB / FREE_QUOTA_KB) * 100).toFixed(2);
            const totalDisplay = totalKB >= 1024 ? (totalKB / 1024).toFixed(2) + ' MB' : totalKB + ' KB';

            const usageBarEl = document.getElementById('firebaseUsageBar');
            if (usageBarEl) {
                usageBarEl.style.display = 'block';
                document.getElementById('firebaseTotalUsage').innerText = `${totalDisplay} / 1 GB (${usagePct}%)`;
                const barColor = usagePct > 80 ? '#ef4444' : usagePct > 50 ? '#f59e0b' : '#6366f1';
                const fill = document.getElementById('firebaseUsageBarFill');
                if (fill) { fill.style.width = Math.max(0.5, usagePct) + '%'; fill.style.background = `linear-gradient(90deg,${barColor},${barColor}cc)`; }
            }

            // Thống kê
            let totalActive = 0, totalExpiring = 0, totalExpired = 0, totalLocked = 0;
            let totalStudents = 0;
            clubDataList.forEach(({ data, activeCount }) => {
                const expiryDate = data.expiryDate || '2027-04-30';
                const acctStatus = data.accountStatus || 'active';
                const isExpired = expiryDate < today;
                const isExpiring = !isExpired && expiryDate <= in30Days;
                const isLocked = acctStatus === 'locked';
                if (isLocked) totalLocked++;
                else if (isExpired) totalExpired++;
                else if (isExpiring) totalExpiring++;
                else totalActive++;
                totalStudents += activeCount;
            });

            const statsEl = document.getElementById('superAdminStats');
            if (statsEl) {
                const totalClubs = clubDataList.length;
                statsEl.innerHTML = `
                    <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;padding:14px 12px;border-radius:14px;text-align:center;position:relative;overflow:hidden;">
                        <div style="font-size:0.65rem;font-weight:900;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">Tổng CLB</div>
                        <div style="font-size:2rem;font-weight:900;color:#15803d;line-height:1.1;margin-top:4px;">${totalClubs}</div>
                        <div style="font-size:0.65rem;color:#86efac;font-weight:700;margin-top:2px;">${totalActive} đang hoạt động</div>
                    </div>
                    <div style="background:linear-gradient(135deg,#fefce8,#fef9c3);border:1.5px solid #fde047;padding:14px 12px;border-radius:14px;text-align:center;">
                        <div style="font-size:0.65rem;font-weight:900;color:#a16207;text-transform:uppercase;letter-spacing:0.05em;">Sắp Hết Hạn</div>
                        <div style="font-size:2rem;font-weight:900;color:#ca8a04;line-height:1.1;margin-top:4px;">${totalExpiring}</div>
                        <div style="font-size:0.65rem;color:#fbbf24;font-weight:700;margin-top:2px;">${totalExpired} đã hết hạn</div>
                    </div>
                    <div style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);border:1.5px solid #a5b4fc;padding:14px 12px;border-radius:14px;text-align:center;">
                        <div style="font-size:0.65rem;font-weight:900;color:#4338ca;text-transform:uppercase;letter-spacing:0.05em;">Tổng Võ Sinh</div>
                        <div style="font-size:2rem;font-weight:900;color:#4338ca;line-height:1.1;margin-top:4px;">${totalStudents}</div>
                        <div style="font-size:0.65rem;color:#a5b4fc;font-weight:700;margin-top:2px;">toàn hệ thống</div>
                    </div>
                    <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1.5px solid #cbd5e1;padding:14px 12px;border-radius:14px;text-align:center;">
                        <div style="font-size:0.65rem;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">Dung Lượng</div>
                        <div style="font-size:1.5rem;font-weight:900;color:#334155;line-height:1.1;margin-top:4px;">${totalDisplay}</div>
                        <div style="font-size:0.65rem;color:#94a3b8;font-weight:700;margin-top:2px;">${totalLocked} bị khóa</div>
                    </div>
                `;
            }

            // Render từng CLB
            if (clubDataList.length === 0) {
                listEl.innerHTML = '<div class="text-center py-10 text-slate-400 italic text-sm">Chưa có CLB nào trong hệ thống</div>';
                return;
            }

            // Store globally for client-side filtering
            window._saClubData = { clubDataList, today, in30Days };
            // Render using shared function (also used by filterSAClubs)
            window._renderSAClubRows(clubDataList, today, in30Days);

        } catch (e) {
            console.error(e);
            _m().lastError = e.message;
            listEl.innerHTML = `<div class="text-center py-10 text-rose-500"><div class="text-2xl mb-2">❌</div><p class="font-bold text-sm">Lỗi tải dữ liệu. Bạn cần quyền Super Admin!</p><p class="text-xs text-slate-400 mt-1">${e.message}</p></div>`;
        } finally {
            _m().lastDurationMs = Date.now() - _t0;
        }
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

        listEl.innerHTML = clubDataList.map(({ cid, data, activeCount, profileCount, txCount, invCount, estimatedKB }) => {
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

            const _safePass = (data.adminPassword || '').replace(/"/g, '&quot;');
            const _pwDeskId = 'pw_d_' + cid;
            const _pwMobId = 'pw_m_' + cid;

            // ── Desktop row ──
            const desktopRow = `<div class="hidden md:grid items-center gap-2 px-4 py-3 border-b border-slate-100 hover:bg-slate-50/80 transition-colors" style="grid-template-columns:148px 1fr 185px 80px 115px 115px 1fr;${rowBg}">
                <div>
                    <div style="font-size:0.78rem;font-weight:900;color:#4338ca;font-family:monospace;letter-spacing:-0.3px;">${cid}</div>
                    <div style="font-size:0.6rem;color:#94a3b8;margin-top:2px;">Tạo: ${created}</div>
                </div>
                <div>
                    <div style="font-size:0.9rem;font-weight:800;color:#0f172a;">${cname}</div>
                    <div style="font-size:0.62rem;color:#94a3b8;margin-top:2px;">${activeCount}/${profileCount} võ sinh · ${sizeDisplay}</div>
                </div>
                <div style="overflow:hidden;">
                    <div style="font-size:0.72rem;font-weight:600;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${email}">${email}</div>
                    ${_safePass ? `<div style="margin-top:3px;display:flex;align-items:center;gap:3px;"><span style="font-size:0.6rem;color:#94a3b8;">MK:</span><span id="${_pwDeskId}" data-pw="${_safePass}" style="font-size:0.65rem;font-family:monospace;color:#475569;letter-spacing:0.06em;">••••••</span><button type="button" onclick="const e=document.getElementById('${_pwDeskId}');e.textContent=e.textContent.includes('•')?e.dataset.pw:'••••••'" style="background:none;border:none;cursor:pointer;font-size:0.7rem;color:#94a3b8;padding:0 2px;line-height:1;">👁</button></div>` : ''}</div>
                <div style="text-align:center;">
                    <div style="font-size:1.2rem;font-weight:900;color:#4338ca;">${activeCount}</div>
                    <div style="font-size:0.6rem;color:#94a3b8;">/ ${profileCount}</div>
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
                        ${_safePass ? `<div style="font-size:0.65rem;color:#94a3b8;margin-top:3px;display:flex;align-items:center;gap:3px;"><span>🔑</span><span id="${_pwMobId}" data-pw="${_safePass}" style="font-family:monospace;letter-spacing:0.06em;">••••••</span><button type="button" onclick="const e=document.getElementById('${_pwMobId}');e.textContent=e.textContent.includes('•')?e.dataset.pw:'••••••'" style="background:none;border:none;cursor:pointer;font-size:0.72rem;color:#94a3b8;padding:0 2px;line-height:1;">👁</button></div>` : ''}
                    </div>
                    <div style="flex-shrink:0;">${statusBadge}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
                    <div style="background:#eef2ff;border-radius:10px;padding:8px;text-align:center;">
                        <div style="font-size:0.58rem;color:#6366f1;font-weight:900;text-transform:uppercase;">Võ Sinh</div>
                        <div style="font-size:1.1rem;font-weight:900;color:#4338ca;margin-top:2px;">${activeCount}</div>
                        <div style="font-size:0.58rem;color:#a5b4fc;">/ ${profileCount} hs</div>
                    </div>
                    <div style="background:#f0fdf4;border-radius:10px;padding:8px;text-align:center;">
                        <div style="font-size:0.58rem;color:#16a34a;font-weight:900;text-transform:uppercase;">Dung Lượng</div>
                        <div style="font-size:0.88rem;font-weight:900;color:${sizeColor};margin-top:2px;">${sizeDisplay}</div>
                        <div style="font-size:0.58rem;color:#86efac;">${txCount} giao dịch</div>
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
        
        if(!confirm(`⚠️ XÁC NHẬN CẤP LẠI:\n- Tài khoản mới: ${newEmail}\n- Mật khẩu: ${newPass}\n- Sẽ được cấp quyền quản lý toàn bộ dữ liệu của CLB: ${clubId}\n\n(Yên tâm: Dữ liệu cũ của CLB vẫn được giữ nguyên 100%)`)) return;

        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPass);
            const newUid = userCredential.user.uid;

            await setDoc(doc(db, "users", newUid), { email: newEmail, role: "admin", clubId: clubId });
            await updateDoc(doc(db, "clubs", clubId), { adminEmail: newEmail, adminPassword: newPass });

            _m().lastDurationMs = Date.now() - _t0;
            alert(`✅ ĐÃ TẠO TÀI KHOẢN THÀNH CÔNG!\n\nBạn có thể gửi ngay Email và Mật khẩu này cho quản lý cơ sở để họ đăng nhập. Toàn bộ dữ liệu cũ vẫn ở đó.`);
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
  
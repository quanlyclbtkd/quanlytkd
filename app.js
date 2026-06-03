    /* ══════════════════════════════════════════════════════════════════════════
       FIRESTORE SECURITY RULES — Sao chép toàn bộ đoạn dưới vào
       Firebase Console → Firestore Database → Rules → Publish
       ══════════════════════════════════════════════════════════════════════════

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {

        // ── Hàm tiện ích ──────────────────────────────────────────────────
        function isAuth() {
          return request.auth != null;
        }
        // Super Admin: nhận diện qua email (không cần Firestore doc)
        function isSuperAdmin() {
          return isAuth() && request.auth.token.email == 'admin@tstquynhon.com';
        }
        // Lấy dữ liệu users/{uid} của người đang request (dùng get() cache)
        function myUserData() {
          return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
        }
        function isAdminOfClub(clubId) {
          return isAuth() && myUserData().role == 'admin' && myUserData().clubId == clubId;
        }
        function isCoachOfClub(clubId) {
          return isAuth() && myUserData().role == 'coach' && myUserData().clubId == clubId;
        }
        function isMemberOfClub(clubId) {
          return isAdminOfClub(clubId) || isCoachOfClub(clubId);
        }

        // ── users/{uid} ───────────────────────────────────────────────────
        // Người dùng chỉ đọc được doc của chính họ
        // Super Admin được đọc/ghi bất kỳ doc (tạo tài khoản CLB, HLV)
        // Tài khoản đã xác thực được tự ghi doc của mình (auto-create khi fallback login)
        match /users/{uid} {
          allow read: if isAuth() && (request.auth.uid == uid || isSuperAdmin());
          allow write: if isAuth() && (request.auth.uid == uid || isSuperAdmin());
        }

        // ── login_history ─────────────────────────────────────────────────
        match /login_history/{docId} {
          allow write: if isAuth();
          allow read:  if isSuperAdmin();
        }

        // ── clubs ─────────────────────────────────────────────────────────
        // Cho phép mọi user đã xác thực LIST clubs (cần cho fallback login scan HLV cũ)
        // Chỉ Super Admin mới được tạo/sửa clubs
        match /clubs/{clubId} {
          allow read:  if isAuth();
          allow write: if isSuperAdmin();

          // Settings: admin CLB đọc/ghi; HLV chỉ đọc
          match /settings/{doc} {
            allow read:  if isMemberOfClub(clubId) || isSuperAdmin();
            allow write: if isAdminOfClub(clubId) || isSuperAdmin();
          }

          // Hồ sơ võ sinh
          match /profiles/{profileId} {
            allow read, write: if isMemberOfClub(clubId) || isSuperAdmin();
          }

          // Giao dịch tài chính
          match /transactions/{txId} {
            allow read, write: if isMemberOfClub(clubId) || isSuperAdmin();
          }

          // Kho đồng phục
          match /inventory/{invId} {
            allow read, write: if isMemberOfClub(clubId) || isSuperAdmin();
          }

          // Tài khoản HLV
          // HLV đọc được doc của chính mình; Admin đọc/ghi tất cả
          match /coaches/{coachId} {
            allow read: if isAuth() && (
              request.auth.uid == coachId ||
              isAdminOfClub(clubId) ||
              isSuperAdmin()
            );
            allow write: if isAdminOfClub(clubId) || isSuperAdmin();
          }

          // Điểm danh
          match /attendance/{docId} {
            allow read, write: if isMemberOfClub(clubId) || isSuperAdmin();
          }

          // Ghi chú buổi tập của HLV
          match /attendanceNotes/{docId} {
            allow read, write: if isMemberOfClub(clubId) || isSuperAdmin();
          }

          // Thi đai
          match /exam/{docId} {
            allow read, write: if isMemberOfClub(clubId) || isSuperAdmin();
          }

          // Catch-all: các subcollection khác trong club
          match /{subcollection}/{docId} {
            allow read, write: if isMemberOfClub(clubId) || isSuperAdmin();
          }
        }
      }
    }

       ══════════════════════════════════════════════════════════════════════════ */

    const { initializeApp } = window._fb_init;
    const { getFirestore, collection, doc, getDoc, onSnapshot, addDoc, updateDoc, deleteDoc, query, orderBy, where, writeBatch, setDoc, arrayUnion, arrayRemove, getDocs, limit, increment, getCountFromServer, startAfter, startAt, endAt } = window._fb_init;
    const { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, signInAnonymously } = window._fb_init;

    const firebaseConfig = {
      apiKey: "AIzaSyBfxbFrMabJHbARXpAqStIrSFlSAcCxgGY", 
      authDomain: "quanly-tst.firebaseapp.com",
      projectId: "quanly-tst",
      storageBucket: "quanly-tst.firebasestorage.app",
      messagingSenderId: "981970279440",
      appId: "1:981970279440:web:8ac137ec4f72a39faa7e95",
      measurementId: "G-Z1M9YYDZL1"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
    const secondaryAuth = getAuth(secondaryApp);
    window._secondaryAuth = secondaryAuth; // Phase 4.0B: expose for superadmin.js module

    window.userRole = 'viewer';
    window.coachBranch = '';   // Chi nhánh được phân công của HLV (rỗng = tất cả)
    let currentClubId = "";
    let clubData = {};
    let allProfiles = {};
    let allTransactions = [];
    let allInventory = [];
    let inventoryStats = {}; 
    let clubConfig = { bankId: "AGRIBANK", accountNo: "4300205305756", accountName: "TRUONG SANH TINH - CLB TAEKWONDO TST", branchCount: 2, location: "Quy Nhơn" };
    
    let colRef = null;
    let profRef = null;
    let invRef = null;
    let currentTxUnsub = null;

    let financeChartInstance = null; 
    let memberChartInstance = null; 
    let logoCanvasData = null;
    let logoLoaded = false;
    let activeListeners = [];

    let renderTimeout = null;
// Danh mục kho tùy chỉnh — được load từ Firestore khi đăng nhập thành công
window.invCustomCategories = [];
    window.__appLoaded = true; // [Phase 2a] main.js kiểm tra để bỏ qua loadLegacyApp()
    window.__store = window.__store || {}; // [Phase 2b] Bridge object cho module system

    // ── Phase 4.0B-4C: App Context Ready state + helper ──────────────────────
    // Idempotent — nếu đã khởi tạo (ví dụ: HMR) thì giữ nguyên generation.
    window.__appContextReadyState = window.__appContextReadyState || {
        ready: false,
        clubId: null,
        dispatchedAt: null,
        generation: 0,
        reason: ''
    };

    function dispatchAppContextReady(reason) {
        reason = reason || 'unknown';
        const st = window.__store || {};
        const ready =
            !!db &&
            !!st.db &&
            !!(st.clubId || st.currentClubId || window.currentClubId);

        if (!ready) {
            console.warn('[AppContextReady] skipped — context not ready', {
                reason,
                hasDb:      !!db,
                hasStoreDb: !!st.db,
                clubId:     st.clubId || st.currentClubId || window.currentClubId || ''
            });
            return false;
        }

        const clubId = st.clubId || st.currentClubId || window.currentClubId;

        // Guard: không dispatch lại nếu cùng clubId + reason đã ready
        if (
            window.__appContextReadyState.ready &&
            window.__appContextReadyState.clubId === clubId &&
            window.__appContextReadyState.reason === reason
        ) {
            return true;
        }

        window.__appContextReadyState.ready       = true;
        window.__appContextReadyState.clubId      = clubId;
        window.__appContextReadyState.dispatchedAt = Date.now();
        window.__appContextReadyState.reason      = reason;
        window.__appContextReadyState.generation  =
            (window.__appContextReadyState.generation || 0) + 1;

        // Phase 4.0B-4D: Cập nhật hydration metrics khi context ready
        _updateHydrationMetrics({ appContextReady: true, clubId, lastReason: reason });

        window.dispatchEvent(new CustomEvent('app:context-ready', {
            detail: {
                clubId,
                currentClubId: clubId,
                reason,
                generation: window.__appContextReadyState.generation
            }
        }));
        // Phase 4.0B-4J-8A: Mark contextReady milestone
        if (typeof markLoginPerf === 'function') markLoginPerf('contextReady');

        console.info('[AppContextReady] dispatched', {
            clubId,
            reason,
            generation: window.__appContextReadyState.generation
        });

        return true;
    }

    window.dispatchAppContextReady = dispatchAppContextReady;
    // ── End Phase 4.0B-4C helper ─────────────────────────────────────────────

    // ── Phase 4.0B-4D: Data Hydration Metrics ────────────────────────────────
    // Đọc-only diagnostics — KHÔNG ghi Firestore, KHÔNG log PII.
    window.__dataHydrationMetrics = window.__dataHydrationMetrics || {
        clubId:                   '',
        appContextReady:          false,
        profilesSnapshotCount:    0,
        profilesDocCount:         0,
        transactionsSnapshotCount: 0,
        transactionsDocCount:     0,
        inventorySnapshotCount:   0,
        inventoryDocCount:        0,
        settingsLoaded:           false,
        clubLoaded:               false,
        lastUpdatedAt:            0,
        lastReason:               ''
    };

    function _updateHydrationMetrics(patch) {
        const m = window.__dataHydrationMetrics;
        Object.assign(m, patch);
        m.lastUpdatedAt = Date.now();
    }
    // ── End Phase 4.0B-4D metrics init ───────────────────────────────────────

    // ── Phase 4.0B-4J-8A: Login Performance Metrics ──────────────────────────
    // Đo thời gian từng bước login để tối ưu mobile. Không ghi Firestore.
    window.__loginPerfMetrics = window.__loginPerfMetrics || {
        loginStartAt:          0,
        authReadyAt:           0,
        shellShownAt:          0,
        contextReadyAt:        0,
        firstTabRenderedAt:    0,
        dataHydratedAt:        0,
        heavyWorkDeferredAt:   0,
        totalToShellMs:        0,
        totalToFirstTabMs:     0,
        totalToDataHydratedMs: 0,
        warnings:              [],
    };
    function markLoginPerf(name) {
        const m   = window.__loginPerfMetrics || (window.__loginPerfMetrics = {});
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        m[name + 'At'] = now;
        if (m.loginStartAt && m.shellShownAt)        m.totalToShellMs        = Math.round(m.shellShownAt        - m.loginStartAt);
        if (m.loginStartAt && m.firstTabRenderedAt)  m.totalToFirstTabMs     = Math.round(m.firstTabRenderedAt  - m.loginStartAt);
        if (m.loginStartAt && m.dataHydratedAt)      m.totalToDataHydratedMs = Math.round(m.dataHydratedAt      - m.loginStartAt);
    }
    window.markLoginPerf = window.markLoginPerf || markLoginPerf;
    window.printLoginPerfMetrics = function printLoginPerfMetrics() {
        const m = window.__loginPerfMetrics || {};
        console.group('[LoginPerfMetrics] Phase 4.0B-4J-8A');
        console.log('loginStart     →  0ms (reference)');
        if (m.loginStartAt) {
            const _t = n => m[n + 'At'] ? Math.round(m[n + 'At'] - m.loginStartAt) + 'ms' : '—';
            console.log('authReady      → ', _t('authReady'));
            console.log('shellShown     → ', _t('shellShown'), '  (totalToShell:', m.totalToShellMs, 'ms)');
            console.log('contextReady   → ', _t('contextReady'));
            console.log('firstTabRender → ', _t('firstTabRendered'), '  (totalToFirstTab:', m.totalToFirstTabMs, 'ms)');
            console.log('dataHydrated   → ', _t('dataHydrated'), '  (totalToData:', m.totalToDataHydratedMs, 'ms)');
            console.log('heavyDeferred  → ', _t('heavyWorkDeferred'));
        }
        console.groupEnd();
        return m;
    };
    // runIdle: defer non-critical work — requestIdleCallback khi có, fallback 800ms
    const runIdle = (typeof requestIdleCallback === 'function')
        ? (fn) => requestIdleCallback(fn, { timeout: 1500 })
        : (fn) => setTimeout(fn, 800);
    window.runIdle = window.runIdle || runIdle;
    // ── End Phase 4.0B-4J-8A: Login Performance Metrics ─────────────────────

    // ── Phase 4J-8: Firestore Read Scale — Global Config + Metrics ──────────
    // Scale config: tập trung tất cả hard limits tại một chỗ để dễ điều chỉnh.
    // Các giá trị này kiểm soát limit() calls và page size ở khắp app.
    window.__scaleConfig = window.__scaleConfig || {
        profilesPageSize:        50,    // cursor page size cho tab Võ sinh
        transactionsPageSize:    100,   // cursor page size cho tab Tài chính
        inventoryPageSize:       100,   // cursor page size cho tab Kho
        attendanceDailyLimit:    1200,  // max records/ngày (1000 võ sinh × 2 ca + buffer)
        attendanceMonthlyLimit:  10000, // safety cap cho monthly attendance aggregation
        txListenerLimit:         1200,  // real-time tx listener hard cap (up from 500)
        invListenerLimit:        500,   // inventory display listener (OK — display only)
        legacyFallbackLimit:     1200,  // legacy-root read limit per collection
        exportBatchSize:         200,   // fetchAllPagesForExport() page size per iteration
        warnThresholdProfiles:   1200,  // log warning khi snapshot size vượt ngưỡng này
    };

    // Read scale metrics: ghi lại mỗi Firestore read quan trọng để diagnostics.
    window.__readScaleMetrics = window.__readScaleMetrics || { reads: [] };

    // [Phase 4K] Transaction Listener Metrics — track attach/detach/duplicate for read cost control.
    // Xem: window.printTxListenerMetrics() trong DevTools để diagnostics.
    window.__txListenerMetrics = window.__txListenerMetrics || {
        txListenerAttached:              0, // tổng số lần listener được attach
        txListenerDetached:              0, // tổng số lần listener được cleanup
        txListenerDuplicatePrevented:    0, // số lần duplicate bị ngăn (same key, same month)
        txStatsRead:                     0, // số lần đọc stats doc thành công (dashboard historical)
        txStatsFallbackScan:             0, // số lần fallback sang scan transactions (stats doc missing)
        txStatsFallbackDocsReadEstimate: 0, // ước lượng docs đã đọc khi fallback
        superAdminStatsRead:             0, // SuperAdmin đọc stats docs thành công
        dashboardStatsRead:              0, // Dashboard đọc stats docs thành công
        lastAttachedMonth:               '',
        lastAttachedAt:                  0,
        lastDetachedAt:                  0,
        txListenerSkippedUntilFinanceTab:0, // số lần listener CHƯA attach vì Finance tab chưa mở (lazy-mount)
        dashboardCurrentMonthStatsRead:  0, // Dashboard đọc stats doc tháng hiện tại thành công
    };
    window.printTxListenerMetrics = function() {
        console.table(window.__txListenerMetrics);
        return window.__txListenerMetrics;
    };

    /**
     * Ghi một read event vào __readScaleMetrics.
     * @param {string} collection — tên collection
     * @param {number} docCount   — số docs đã đọc
     * @param {string} reason     — ngữ cảnh (listener name, export, v.v.)
     */
    window.recordReadMetric = function(collection, docCount, reason) {
        const _m = window.__readScaleMetrics;
        if (!_m) return;
        _m.reads.push({ collection: String(collection), docCount: docCount | 0, reason: String(reason || ''), at: Date.now() });
        if (_m.reads.length > 200) _m.reads = _m.reads.slice(-200); // keep last 200
        const _cfg = window.__scaleConfig || {};
        if (collection === 'profiles' && docCount > (_cfg.warnThresholdProfiles || 1200)) {
            console.warn('[Scale] ⚠️ profiles snapshot lớn: ' + docCount + ' docs (ngưỡng cảnh báo ' + (_cfg.warnThresholdProfiles || 1200) + '). Kiểm tra club size hoặc pagination config.');
        }
    };

    /**
     * In tóm tắt read metrics theo collection.
     * Gọi từ DevTools console: window.printReadScaleMetrics()
     */
    window.printReadScaleMetrics = function() {
        const _reads = (window.__readScaleMetrics || {}).reads || [];
        const _byCol = {};
        _reads.forEach(function(r) {
            if (!_byCol[r.collection]) _byCol[r.collection] = { count: 0, total: 0, max: 0 };
            _byCol[r.collection].count++;
            _byCol[r.collection].total += (r.docCount || 0);
            _byCol[r.collection].max    = Math.max(_byCol[r.collection].max, r.docCount || 0);
        });
        console.group('[ReadScaleMetrics] Phase 4J-8');
        Object.keys(_byCol).forEach(function(col) {
            const s = _byCol[col];
            console.log('  ' + col + ': reads=' + s.count + ', totalDocs=' + s.total + ', maxDocs=' + s.max);
        });
        console.groupEnd();
        return _byCol;
    };

    /**
     * In scale readiness summary — config + live state.
     * Gọi từ DevTools console: window.printScaleReadiness()
     */
    window.printScaleReadiness = function() {
        const _cfg = window.__scaleConfig || {};
        console.group('[ScaleReadiness] Phase 4J-8');
        console.log('profilesPageSize      :', _cfg.profilesPageSize);
        console.log('transactionsPageSize  :', _cfg.transactionsPageSize);
        console.log('inventoryPageSize     :', _cfg.inventoryPageSize);
        console.log('attendanceDailyLimit  :', _cfg.attendanceDailyLimit);
        console.log('attendanceMonthlyLimit:', _cfg.attendanceMonthlyLimit);
        console.log('txListenerLimit       :', _cfg.txListenerLimit);
        console.log('invListenerLimit      :', _cfg.invListenerLimit);
        console.log('legacyFallbackLimit   :', _cfg.legacyFallbackLimit);
        console.log('exportBatchSize       :', _cfg.exportBatchSize);
        console.log('warnThresholdProfiles :', _cfg.warnThresholdProfiles);
        const _latest = ((window.__readScaleMetrics || {}).reads || []).slice(-5);
        if (_latest.length) {
            console.log('Recent reads (last ' + _latest.length + '):');
            _latest.forEach(function(r) { console.log('  [' + r.collection + '] ' + r.docCount + ' docs — ' + r.reason); });
        }
        console.groupEnd();
        return { config: _cfg, recentReads: _latest };
    };

    /**
     * Đọc toàn bộ một collection lớn qua cursor pagination (dùng cho export/báo cáo).
     * Tránh limit(500) hard cap — lấy TẤT CẢ docs qua nhiều trang nhỏ.
     *
     * @param {Function} fetchPage — async (opts) => QuerySnapshot
     *   opts: { pageSize, cursor, direction: 'first'|'next' }
     * @param {Object}   options
     *   options.pageSize    — docs per page (default exportBatchSize)
     *   options.maxPages    — giới hạn vòng lặp an toàn (default 50)
     *   options.collection  — tên collection (cho metrics)
     * @returns {Array<{id, ...data}>}
     */
    window.fetchAllPagesForExport = async function(fetchPage, options) {
        const _opts       = options || {};
        const _batchSize  = _opts.pageSize || ((window.__scaleConfig || {}).exportBatchSize) || 200;
        const _maxPages   = _opts.maxPages || 50;
        const _collection = _opts.collection || 'unknown';
        const _results    = [];
        let _cursor = null;
        let _page   = 0;
        while (_page < _maxPages) {
            let _snap;
            try {
                _snap = await fetchPage({ pageSize: _batchSize, cursor: _cursor, direction: _cursor ? 'next' : 'first' });
            } catch (_e) {
                console.warn('[fetchAllPagesForExport] page ' + _page + ' error:', _e && _e.message ? _e.message.slice(0, 80) : _e);
                break;
            }
            if (!_snap || !_snap.docs || _snap.docs.length === 0) break;
            const _docs    = _snap.docs;
            const _hasNext = _docs.length > _batchSize;
            const _pageDocs = _hasNext ? _docs.slice(0, _batchSize) : _docs;
            _pageDocs.forEach(function(d) { _results.push(Object.assign({ id: d.id }, d.data())); });
            if (typeof window.recordReadMetric === 'function') {
                window.recordReadMetric(_collection, _pageDocs.length, 'fetchAllPagesForExport:page' + _page);
            }
            if (!_hasNext || _pageDocs.length < _batchSize) break;
            _cursor = _pageDocs[_pageDocs.length - 1];
            _page++;
        }
        if (_page >= _maxPages) {
            console.warn('[fetchAllPagesForExport] Hit maxPages (' + _maxPages + ') for ' + _collection + '. Total docs: ' + _results.length);
        }
        return _results;
    };
    // ── End Phase 4J-8 Scale Config ──────────────────────────────────────────

  
    // ── Phase 4.0B-4F — Phase 1: Runtime Recovery State ──────────────────────
    // Diagnostics-only. Không log PII. Không ghi Firestore.
    window.__runtimeRecoveryState = window.__runtimeRecoveryState || {
        checked:          false,
        running:          false,
        completed:        false,
        activeDataSource: '',
        recoveryUsed:     false,
        reason:           '',
        error:            '',
        checkedAt:        0,
        completedAt:      0
    };
    // ── End Phase 4.0B-4F Phase 1 ────────────────────────────────────────────

    // ═══════════════════════════════════════════════════════════════
      // Phase 4.0A-2: window.getAppContext — Cung cấp app context cho modules
      // Không log dữ liệu cá nhân. Không crash nếu biến chưa sẵn sàng.
      // Không phá window.__store (backward compatible).
      // ═══════════════════════════════════════════════════════════════
      window.getAppContext = function(reason) {
          // reason dùng để debug — không log giá trị cá nhân
          try {
              return {
                  db,
                  auth,
                  currentClubId,
                  currentUser: auth ? auth.currentUser : null,
                  clubData:       clubData        || {},
                  clubConfig:     clubConfig      || {},
                  userRole:       window.userRole || 'viewer',
                  coachBranch:    window.coachBranch || '',
                  colRef:         colRef,
                  profRef:        profRef,
                  invRef:         invRef,
                  allProfiles:    allProfiles     || {},
                  allTransactions: allTransactions || [],
                  allInventory:   allInventory    || [],
                  inventoryStats: inventoryStats  || {},
                  helpers: {
                      showToast:                      window.showToast,
                      ensureAllProfilesForExport:     window.ensureAllProfilesForExport,
                      ensureInventoryForFeature:      window.ensureInventoryForFeature,
                      loadTransactionsForDateRange:   window.loadTransactionsForDateRange,
                      loadTransactionsForTxMonthRange: window.loadTransactionsForTxMonthRange,
                      loadInventoryForDateRange:      window.loadInventoryForDateRange,
                      dedupeDocsById:                 window.dedupeDocsById,
                  },
              };
          } catch (_e) {
              // Không crash — trả về rỗng để fallback __store
              return {};
          }
      };
    let _lastSizeSelectHtml = '';
    let _tabHtmlCache = {};

    const _TAB_LISTS = {
        tx:        ['txList'],
        debt:      ['debtList'],
        active:    ['activeList'],
        quit:      ['quitList'],
        inventory: ['uniformTxList', 'inventoryList'],
        expense:   ['expenseList'],
        exam:      ['examExpenseList'],
        dashboard: ['reportList']
    };
    let _dataVersion = 0, _lastRenderedVersion = -1;
    window.scheduleRender = () => {
        _dataVersion++;
        if (window.__store) window.__store._dataVersion = _dataVersion;
        if(renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(renderApp, 250);
    };

    // [PERF] Tải thêm dữ liệu — tăng page của tab tương ứng rồi re-render.
    // Được gọi bởi nút "⬇ Tải thêm" trong mỗi list. Khi lọc/tìm kiếm thay đổi,
    // switchTab và window.filterStudents sẽ reset page về 1 tự động.
    // Phase 3.5D: list-level invalidation replaces direct renderApp for loadMore
    window._loadMore = (tab) => {
        // Giữ nguyên logic tăng page — không đổi behavior
        if(tab === 'active') window._activePage = (window._activePage || 1) + 1;
        else if(tab === 'debt') window._debtPage = (window._debtPage || 1) + 1;
        else if(tab === 'quit') window._quitPage = (window._quitPage || 1) + 1;
        _dataVersion++; if (window.__store) window.__store._dataVersion = _dataVersion;

        // [3.5D] Metrics
        if (window.__renderLegacyMetrics) window.__renderLegacyMetrics.loadMoreCalls = (window.__renderLegacyMetrics.loadMoreCalls || 0) + 1;

        // [3.5D] Prefer list-level invalidation → tab-level → legacy renderApp fallback
        if (window.invalidateLoadMoreTab) {
            window.invalidateLoadMoreTab(tab, 'load-more-' + tab);
        } else if (window.invalidateTab) {
            window.invalidateTab(tab, 'load-more-fallback-' + tab);
        } else {
            // Fallback cuối: renderApp() legacy (chỉ khi invalidation layer chưa load)
            if (window.__renderLegacyMetrics) window.__renderLegacyMetrics.loadMoreFallbackRenderAppCalls = (window.__renderLegacyMetrics.loadMoreFallbackRenderAppCalls || 0) + 1;
            renderApp();
        }
    };

    // Reset page khi search/filter thay đổi (kết quả mới nên quay về trang 1)
    window._resetListPages = () => {
        window._activePage = 1;
        window._debtPage   = 1;
        window._quitPage   = 1;
    };

    function getLocalToday() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().split('T')[0]; }
    function formatDate(dateStr) { if (!dateStr) return ""; if (dateStr.includes('/')) return dateStr; return dateStr.split('-').reverse().join('/'); }
    function formatMonth(monthStr) { return monthStr ? monthStr.split('-').reverse().join('/') : ""; }
    
    function addMonthsToYYYYMM(yymm, count) {
        if(!yymm) return getLocalToday().substring(0, 7);
        let [y, m] = yymm.split('-').map(Number);
        m += count;
        while(m > 12) { m -= 12; y++; }
        while(m < 1) { m += 12; y--; }
        return `${y}-${String(m).padStart(2, '0')}`;
    }

    // [THÊM BƯỚC 2] Chuẩn hóa tháng về dạng YYYY-MM có zero-pad
    // Phòng trường hợp Firestore trả về "2025-1" thay vì "2025-01"
    // → đảm bảo so sánh string YYYY-MM luôn chính xác 100%
    function normalizeYYYYMM(s) {
        if (!s) return '';
        const parts = s.split('-');
        if (parts.length !== 2) return s;
        return `${parts[0]}-${parts[1].padStart(2, '0')}`;
    }

    // [Phase 2a] Guard: nếu main.js đã đăng ký showToast từ ui/toast.js, không ghi đè
    if (!window.showToast) {
        window.showToast = (msg, duration = 3000, isLoading = false) => {
            const toast = document.getElementById("toastMessage"); toast.innerText = msg;
            if(isLoading) toast.classList.add("loading"); else toast.classList.remove("loading");
            toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), duration);
        };
    }

    // ── Hệ thống nhắc nhở tải file tổng kết cuối tháng ──────────────────────
    // Chỉ hiện ngày 1, 2, 3 hàng tháng; tự tắt khi bỏ qua (lưu localStorage theo tháng)
    window._checkMonthlyReminder = () => {
        const today = new Date();
        const day = today.getDate();
        if (day < 1 || day > 3) return; // chỉ hiện ngày 1–3

        const thisMonthKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
        if (localStorage.getItem('mrDismissed_' + thisMonthKey)) return; // đã bỏ qua tháng này

        // Tính tháng trước
        const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const prevMonth = prevDate.getMonth() + 1;
        const prevYear = prevDate.getFullYear();

        const el = document.getElementById('monthlyReminder');
        const lbl = document.getElementById('mrPrevMonth');
        if (!el || !lbl) return;
        lbl.textContent = 'Tháng ' + prevMonth + '/' + prevYear;
        el.style.display = 'flex';
    };

    window._dismissMonthlyReminder = () => {
        const today = new Date();
        const key = 'mrDismissed_' + today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
        localStorage.setItem(key, '1');
        const el = document.getElementById('monthlyReminder');
        if (el) el.style.display = 'none';
    };

    window._openMonthlyExport = () => {
        window._dismissMonthlyReminder();
        // Mở modal xuất Excel và tự chọn tháng trước
        const today = new Date();
        const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const prevMonth = prevDate.getMonth() + 1;
        const prevYear = prevDate.getFullYear();
        window.openExcelExportModal();
        setTimeout(() => {
            const yearEl = document.getElementById('excel_year');
            if (yearEl) yearEl.value = prevYear;
            const typeEl = document.getElementById('excel_periodType');
            if (typeEl) { typeEl.value = 'month'; window.updateExcelPeriodOptions(); }
            const valEl = document.getElementById('excel_periodValue');
            if (valEl) valEl.value = String(prevMonth);
        }, 120);
    };
    // ─────────────────────────────────────────────────────────────────────────

    window.openAddModal = () => {
        document.getElementById('addModal').style.display = 'flex';
        const d = document.getElementById('add_date'); if(d) d.value = getLocalToday();
        document.getElementById('add_name').value = '';
        document.getElementById('add_memberId').value = '';
        document.getElementById('add_belt').value = 'Trắng';
        document.getElementById('add_dob').value = '';
        document.getElementById('add_gender').value = 'Nam';
        document.getElementById('add_phone').value = '';
        document.getElementById('add_cccd').value = '';
        document.getElementById('add_notes').value = '';
        // [THÊM] Reset trường biệt danh khi mở form thêm mới
        const _addNick = document.getElementById('add_nickname'); if (_addNick) _addNick.value = '';
        document.getElementById('add_package').value = '1';
        document.getElementById('add_discount').checked = false;
        document.getElementById('add_fee_default_display').value = '';
        document.getElementById('add_fee_default_actual').value = '';
        document.getElementById('add_fee_display').value = '';
        document.getElementById('add_fee_actual').value = '';
        document.getElementById('add_uniform_size').value = '';
        document.getElementById('add_uniform_display').value = '';
        document.getElementById('add_uniform_actual').value = '';
        document.getElementById('add_uniform_gift').checked = false;
        document.getElementById('add_uniform_display').disabled = false;
        // Reset lịch học khi mở form thêm mới
        document.querySelectorAll('.add_trainingDay').forEach(cb => cb.checked = false);
        // [SỬA ĐỒNG BỘ] Đảm bảo shifts đã load kể cả khi chưa mở tab Điểm Danh
        const _addShiftSel = document.getElementById('add_shift');
        if (_addShiftSel) {
            (window._ensureClubShiftsLoaded ? window._ensureClubShiftsLoaded() : Promise.resolve()).then(function() {
                let _asHtml = '<option value="">-- Chọn ca tập --</option>';
                (window._getClubShifts ? window._getClubShifts() : []).forEach(function(s) {
                    const _t = (s.timeStart && s.timeEnd) ? ' (' + s.timeStart + '–' + s.timeEnd + ')' : '';
                    _asHtml += '<option value="' + s.id + '">' + s.name + _t + '</option>';
                });
                _addShiftSel.innerHTML = _asHtml;
                _addShiftSel.value = '';
            });
        }
    };
    window.closeAddModal = () => document.getElementById('addModal').style.display = 'none';
    window.openComboModal = () => document.getElementById('comboModal').style.display = 'flex';
    window.closeModal = () => document.getElementById('profileModal').style.display = 'none';
    
    window.openTaxModal = () => {
        document.getElementById('taxExportModal').style.display = 'flex';
        window.updateTaxPeriodOptions();
    };
    window.closeTaxModal = () => document.getElementById('taxExportModal').style.display = 'none';

    // [Phase 2a] Bridge: expose _legacySwitchTab để ui/tabs.js có thể delegate về đây
    window._legacySwitchTab = window.switchTab = (tabId) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById('tab_' + tabId).classList.add('active'); document.getElementById('btn_' + tabId).classList.add('active');
        // [PERF] Reset pagination về trang 1 khi đổi tab — tránh hiện "Tải thêm"
        // sai khi người dùng từ tab đang trang 3 chuyển sang tab khác rồi quay lại.
        if(tabId === 'active') window._activePage = 1;
        else if(tabId === 'debt') window._debtPage = 1;
        // [Phase 3.8A] Inventory feature gate when entering inventory tab
        if (tabId === 'inventory') {
            window.ensureInventoryForFeature?.('inventoryTab', 'enter-inventory-tab');
        }
        // [Phase 3.8A] Dashboard feature gate
        if (tabId === 'dashboard') {
            window.ensureInventoryForFeature?.('dashboard', 'enter-dashboard-tab');
        }
        else if(tabId === 'quit') window._quitPage = 1;

        (_TAB_LISTS[tabId] || []).forEach(listId => {
            const el = document.getElementById(listId);
            if(el && _tabHtmlCache[listId] !== undefined) el.innerHTML = _tabHtmlCache[listId];
        });

        if(tabId === 'dashboard') {
            const cd = _tabHtmlCache._chartData;
            if(cd) {
                if(financeChartInstance) { financeChartInstance.data.labels = cd.labels; financeChartInstance.data.datasets[0].data = cd.income; financeChartInstance.data.datasets[1].data = cd.expense; financeChartInstance.update('none'); }
                else { financeChartInstance = new Chart(document.getElementById('financeChart'), { type: 'bar', data: { labels: cd.labels, datasets: [{ label: 'Tổng Thu', data: cd.income, backgroundColor: 'rgba(16, 185, 129, 0.9)', borderRadius: 6 }, { label: 'Tổng Chi', data: cd.expense, backgroundColor: 'rgba(244, 63, 94, 0.9)', borderRadius: 6 }]}, options: { animation: false, maintainAspectRatio: false, responsive: true, scales: { y: { beginAtZero: true, grid: { color: '#f8fafc' } }, x: { grid: { display: false } } }, plugins: { legend: { labels: { font: { family: "'Inter', sans-serif", weight: 'bold' } } } } } }); }
                if(memberChartInstance) { memberChartInstance.data.labels = cd.labels; memberChartInstance.data.datasets[0].data = cd.active; memberChartInstance.update('none'); }
                else { memberChartInstance = new Chart(document.getElementById('memberChart'), { type: 'line', data: { labels: cd.labels, datasets: [{ label: 'Võ sinh Đang tập', data: cd.active, borderColor: '#0033A0', backgroundColor: 'rgba(0, 51, 160, 0.08)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderWidth: 2 }]}, options: { animation: false, maintainAspectRatio: false, responsive: true, scales: { y: { beginAtZero: true, grid: { color: '#f8fafc' } }, x: { grid: { display: false } } }, plugins: { legend: { labels: { font: { family: "'Inter', sans-serif", weight: 'bold' } } } } } }); }
            }
        }
        if (window.__store) { window.__store.financeChartInstance = financeChartInstance; window.__store.memberChartInstance = memberChartInstance; } // [Phase 2c] sync chart instances

        if(tabId === 'exam' && typeof window.renderExamList === 'function') { window.renderExamList(); if(typeof window.updateNextBeltPreview === 'function') window.updateNextBeltPreview(); }
        if(tabId === 'attendance') { const _attD = document.getElementById('att_date'); if(_attD && !_attD.value) _attD.value = getLocalToday(); if(typeof window.renderAttendanceList === 'function') window.renderAttendanceList(); }
        window.scrollTo({top: 0, behavior: 'smooth'});
        // [Phase 4K-STUDENT-LIST] Dùng domain invalidation thay vì scheduleRender() toàn app.
        // Fallback về scheduleRender() nếu invalidateCurrentTab chưa load (backward compat).
        if (typeof window.invalidateCurrentTab === 'function') {
            window.invalidateCurrentTab('tab-switch-' + tabId);
        } else {
            scheduleRender();
        }
    };

    window.getBranchNameDisplay = (code) => {
        for(let _bi = 1; _bi <= 10; _bi++) {
            if(code === 'CS' + _bi) return clubConfig['branchName' + _bi] || ('Cơ sở ' + _bi);
        }
        return code;
    };

    window.applyClubConfigUI = () => {
        let style = document.getElementById('dynamicStyles');
        if (!style) { style = document.createElement('style'); style.id = 'dynamicStyles'; document.head.appendChild(style); }

        let branchCountVal = clubConfig.branchCount !== undefined ? clubConfig.branchCount : 2;
        if (branchCountVal === 1) {
            style.innerHTML = `.col-branch, .input-branch { display: none !important; }`;
        } else {
            style.innerHTML = ``;
        }

        if(clubConfig.logoBase64) {
            document.querySelectorAll('.club-logo-img').forEach(img => { img.src = clubConfig.logoBase64; img.style.display = ''; });
            logoCanvasData = clubConfig.logoBase64;
            // Cache logo for login screen on next visit
            try { localStorage.setItem('clb_logo_cache', clubConfig.logoBase64); } catch(e) {}
        } else {
            document.querySelectorAll('.club-logo-img').forEach(img => { img.src = ''; img.style.display = 'none'; });
            logoCanvasData = '';
            try { localStorage.removeItem('clb_logo_cache'); } catch(e) {}
        }

        // Build branch names array for all active branches
        const _branchNames = [];
        for(let _i = 1; _i <= branchCountVal; _i++) {
            _branchNames.push(clubConfig['branchName' + _i] || ('Cơ sở ' + _i));
        }

        // Update filterBranch dropdown
        const fb = document.getElementById('filterBranch');
        if(fb) {
            let fbHtml = `<option value="all">🏢 Tất cả cơ sở</option>`;
            for(let _i = 1; _i <= branchCountVal; _i++) {
                fbHtml += `<option value="CS${_i}">📍 ${_branchNames[_i-1]}</option>`;
            }
            fb.innerHTML = fbHtml;
        }
        // Đồng bộ cơ sở cho tab Điểm danh (att_branch + att_month_branch)
        ['att_branch', 'att_month_branch'].forEach(function(selId) {
            const selEl = document.getElementById(selId);
            if (!selEl) return;

            // [SỬA LỖI - KHÓA CƠ SỞ HLV] Nếu HLV được giao cơ sở cụ thể,
            // CHỈ tạo duy nhất 1 option cho cơ sở đó — không hiển thị cơ sở khác.
            // Điều này ngăn HLV thấy danh sách điểm danh của cơ sở khác,
            // dù Firestore snapshot có chạy lại để reset select hay không.
            if (window.userRole === 'coach' && window.coachBranch) {
                const _brIdx  = parseInt(window.coachBranch.replace('CS', ''), 10) - 1;
                const _brName = _branchNames[_brIdx] || window.coachBranch;
                selEl.innerHTML = '<option value="' + window.coachBranch + '">📍 ' + _brName + '</option>';
                selEl.value    = window.coachBranch;
                selEl.disabled = true;
            } else {
                // Admin / HLV không giới hạn cơ sở → hiển thị toàn bộ danh sách
                let html = '<option value="all">🏢 Tất cả cơ sở</option>';
                for (let _i = 1; _i <= branchCountVal; _i++) {
                    html += '<option value="CS' + _i + '">📍 ' + _branchNames[_i-1] + '</option>';
                }
                selEl.innerHTML = html;
            }
        });

        // Rebuild each branch select dynamically for up to 10 branches
        const selectsToUpdate = ['branch', 'm_branch', 'add_branch', 'exp_branch', 'eexp_branch'];
        selectsToUpdate.forEach(id => {
            const el = document.getElementById(id);
            if(!el) return;
            const hasChung = Array.from(el.options).some(o => o.value === 'Chung');
            let html = '';
            for(let _i = 1; _i <= branchCountVal; _i++) {
                html += `<option value="CS${_i}">${_branchNames[_i-1]}</option>`;
            }
            if(hasChung) html += `<option value="Chung">Chung / Khác</option>`;
            el.innerHTML = html;
        });

        // Populate select cơ sở cho modal "Tài khoản HLV Phụ trách Cơ sở"
        // Luôn cập nhật đầy đủ tất cả cơ sở CLB đang có, kèm option "Tất cả"
        const coachBranchEl = document.getElementById('coach_branch');
        if (coachBranchEl) {
            let cbHtml = '<option value="">📍 Tất cả cơ sở (không giới hạn)</option>';
            for (let _i = 1; _i <= branchCountVal; _i++) {
                cbHtml += `<option value="CS${_i}">📍 ${_branchNames[_i-1]}</option>`;
            }
            coachBranchEl.innerHTML = cbHtml;
        }
    };

    // [THÊM] Hiển thị lỗi đăng nhập inline — không dùng alert(), tự ẩn sau 6 giây
    function _setLoginError(msg) {
        const el = document.getElementById('loginErrorMsg');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('visible');
        // Tự ẩn sau 6 giây
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => {
            el.classList.remove('visible');
        }, 6000);
    }

    // [THÊM] Xóa thông báo lỗi đăng nhập — gọi khi người dùng bắt đầu gõ lại
    window._clearLoginError = function() {
        const el = document.getElementById('loginErrorMsg');
        if (!el) return;
        clearTimeout(el._hideTimer);
        el.classList.remove('visible');
    };

    window.handleLogin = async () => {
        // [SỬA] Chống double-submit: nếu đang xử lý thì bỏ qua
        const btn = document.getElementById('btnLogin');
        if (btn && btn.disabled) return;

        const email = document.getElementById('emailInput').value.trim();
        const pass = document.getElementById('passInput').value;

        // [SỬA] Dùng inline error thay alert()
        if (!email && !pass) return _setLoginError("Vui lòng nhập Email và Mật khẩu!");
        // [SỬA] Dùng inline error thay alert()
        if (!email) return _setLoginError("Vui lòng nhập Email quản trị!");
        // [SỬA] Dùng inline error thay alert()
        if (!pass) return _setLoginError("Vui lòng nhập Mật khẩu truy cập!");

        const loading = document.getElementById('loginLoading');
        const text = document.getElementById('loginText');

        // [SỬA] Xóa lỗi cũ và hiện loading ngay lập tức — phản hồi tức thì cho người dùng
        window._clearLoginError && window._clearLoginError();
        // Phase 4.0B-4J-8A: Mark login start milestone
        if (typeof markLoginPerf === 'function') markLoginPerf('loginStart');
        btn.disabled = true; text.innerText = "Đang đăng nhập..."; loading.classList.remove('hidden');

        try {
            // Chỉ đăng nhập Firebase — onAuthStateChanged sẽ đọc Firestore
            // và gọi initSaaSDatabase với đúng role. Không gọi initSaaSDatabase ở đây
            // để tránh race condition gây nhầm role giữa super_admin và CLB.
            await signInWithEmailAndPassword(auth, email, pass);
            // Thành công → onAuthStateChanged tự xử lý, không cần làm gì thêm
        } catch (error) {
            console.error(error);
            btn.disabled = false; text.innerText = "ĐĂNG NHẬP"; loading.classList.add('hidden');
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                // [SỬA] Dùng inline error thay alert()
                _setLoginError("Sai Email hoặc Mật khẩu truy cập!");
            } else if (error.code === 'auth/invalid-email') {
                // [SỬA] Dùng inline error thay alert()
                _setLoginError("Định dạng Email không hợp lệ!");
            } else {
                // [SỬA] Dùng inline error thay alert()
                _setLoginError("Lỗi kết nối máy chủ! Vui lòng kiểm tra mạng.");
            }
        }
    };

    window.handleLogout = () => signOut(auth).then(() => location.reload());

    window.openNewClubModal = () => {
        tempLogoBase64 = "";
        document.getElementById('nc_logoPreview').classList.add('hidden');
        document.getElementById('newClubModal').style.display = 'flex';
    };

    window.createNewClubSystem = async () => {
        const clubName = document.getElementById('nc_clubName').value.trim();
        let clubId = document.getElementById('nc_clubId').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        const email = document.getElementById('nc_adminEmail').value.trim();
        const pass = document.getElementById('nc_adminPass').value.trim();
        const branchCount = parseInt(document.getElementById('nc_branchCount').value) || 1;

        if(!clubName || !clubId || !email || !pass) return alert("Vui lòng điền đầy đủ thông tin!");
        if(pass.length < 6) return alert("Mật khẩu phải từ 6 ký tự trở lên!");

        const btn = document.getElementById('btnCreateClubAction');
        btn.innerHTML = `<div class="loading-spinner"></div> Đang xử lý...`; btn.disabled = true;

        try {
            const clubDoc = await getDoc(doc(db, "clubs", clubId));
            if(clubDoc.exists()) throw new Error("Club ID exists");

            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
            const newUid = userCredential.user.uid;

            await setDoc(doc(db, "users", newUid), { email: email, role: "admin", clubId: clubId });

            const batch = writeBatch(db);
            batch.set(doc(db, "clubs", clubId), { 
                clubName: clubName, 
                adminEmail: email,
                adminPassword: pass,
                createdAt: new Date().toISOString(),
                expiryDate: "2027-04-30",
                accountStatus: "active"
            });
            
            let configData = { bankId: "", accountNo: "", accountName: "", branchCount: branchCount, location: "Quy Nhơn" };
            if(tempLogoBase64) configData.logoBase64 = tempLogoBase64; 

            batch.set(doc(db, "clubs", clubId, "settings", "main_config"), configData);
            batch.set(doc(db, "clubs", clubId, "settings", "inventory_stats"), {});
            await batch.commit();

            alert(`TẠO CLB THÀNH CÔNG!\n\nClub Name: ${clubName}\nID: ${clubId}\nEmail: ${email}\nMật khẩu: ${pass}`);
            
            document.getElementById('newClubModal').style.display = 'none';
            ['nc_clubName', 'nc_clubId', 'nc_adminEmail', 'nc_adminPass', 'nc_logoFile'].forEach(id => document.getElementById(id).value = '');
            tempLogoBase64 = "";
            window.loadSuperAdminData(); 

        } catch (error) {
            if(error.code === 'auth/email-already-in-use') alert("Email này đã được đăng ký cho CLB khác. Vui lòng đổi email!");
            else if(error.message === "Club ID exists") alert("Mã Hệ Thống này đã tồn tại, vui lòng chọn mã khác!");
            else alert("Đã xảy ra lỗi: " + error.message);
        } finally {
            btn.innerHTML = `<span>⚡ KHỞI TẠO DỮ LIỆU</span>`; btn.disabled = false; await signOut(secondaryAuth);
        }
    };

    window.switchSATab = (tab) => {
        const tabs = ['list', 'revenue', 'loginlog'];
        tabs.forEach(t => {
            const btn = document.getElementById('saTab_' + t);
            const panel = document.getElementById('saTabContent_' + t);
            const isActive = t === tab;
            if (btn) {
                btn.style.background = isActive ? '#fff' : 'transparent';
                btn.style.color = isActive ? '#4338ca' : '#94a3b8';
                btn.style.boxShadow = isActive ? '0 1px 6px rgba(0,0,0,0.1)' : 'none';
            }
            if (panel) panel.style.display = isActive ? 'block' : 'none';
        });
        // [SỬA ĐỒNG BỘ] Tải lại dữ liệu mỗi khi chuyển tab để đảm bảo đồng bộ mới nhất
        if (tab === 'loginlog') window.loadLoginHistory();
        // [SỬA ĐỒNG BỘ] Tải lại danh sách CLB khi chuyển sang tab list
        if (tab === 'list') window.loadSuperAdminData();
        // [SỬA ĐỒNG BỘ] Tự động tải doanh thu nếu đã chọn tháng trước đó
        if (tab === 'revenue') {
            const _mEl = document.getElementById('sa_revenue_month');
            if (_mEl && _mEl.value) window.loadSARevenue();
        }
    };

    // ── Helper: reset trạng thái DOM (xóa inline styles do JS ghi khi đã login) ──
    function _resetHtmlStateForExport(rawHtml) {
        // ── Bước 1: Sửa inline styles bằng regex (nhanh, chạy trước) ──────
        // loginOverlay: display:none → display:flex
        rawHtml = rawHtml.replace(
            /(<div\s[^>]*id="loginOverlay"[^>]*style=")([^"]*)"/,
            (m, prefix, style) => prefix + style.replace(/display\s*:\s*none\s*;?\s*/g, 'display:flex;') + '"'
        );
        // mainApp: display:block → xóa (CSS tự đặt display:none qua .app-container)
        rawHtml = rawHtml.replace(
            /(<div\s[^>]*id="mainApp"[^>]*style=")([^"]*)"/,
            (m, prefix, style) => prefix + style.replace(/display\s*:\s*block\s*;?\s*/g, '') + '"'
        );

        // ── Bước 2: Inject script cleanup đồng bộ ngay trước </body> ───────
        // Script này chạy SAU khi DOM đã được parse đầy đủ nhưng TRƯỚC khi
        // module Firebase khởi động (vì <script type="module"> luôn bị defer).
        // Mục tiêu: reset mọi trạng thái runtime mà regex không thể bắt được:
        //   - btnLogin đang disabled + text "Đang xử lý..."
        //   - loginLoading spinner đang hiện
        //   - emailInput còn lưu email cũ
        //   - superAdminView đang display:block
        //   - btnDownloadObfuscated đang disabled
        const _cleanup = `<script id="_sa_export_reset">(function(){
    var g=function(id){return document.getElementById(id);};
    var lo=g('loginOverlay');
    if(lo){lo.style.display='flex';}
    var ma=g('mainApp');
    if(ma){ma.style.display='none';}
    var bl=g('btnLogin');
    if(bl){bl.disabled=false;bl.style.opacity='';}
    var lt=g('loginText');
    if(lt){lt.textContent='ĐĂNG NHẬP';}
    var ll=g('loginLoading');
    if(ll&&!/\\bhidden\\b/.test(ll.className)){ll.className+=' hidden';}
    var ei=g('emailInput');
    if(ei){ei.value='';}
    var sv=g('superAdminView');
    if(sv){sv.style.display='none';}
    // [SỬA] Dọn sạch thông báo lỗi đăng nhập khi export file
    var em=g('loginErrorMsg');if(em){em.classList.remove('visible');em.textContent='';clearTimeout(em._hideTimer);}
    var ob=g('btnDownloadObfuscated');
    if(ob){ob.disabled=false;ob.style.opacity='';}
    var mw=g('mainTabsWrapper');
    if(mw&&mw.style.display==='none'){mw.style.display='';}
})();<\/script>`;
        rawHtml = rawHtml.replace('</body>', _cleanup + '\n</body>');
        return rawHtml;
    }

    // ── Tải bản gốc: đọc DOM hiện tại, không cần server ─────────────────
    window.saDownloadOriginal = () => {
        let html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
        html = _resetHtmlStateForExport(html);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'smartpay-edu-integrated.html';
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
        window.showToast('✅ Đã tải bản gốc thành công!');
    };

    // ── Tải bản làm rối: dùng javascript-obfuscator browser build (CDN) ──
    window.saDownloadObfuscated = async () => {
        const btn = document.getElementById('btnDownloadObfuscated');
        const origHtml = btn.innerHTML;
        const setBtn = (label, disabled) => {
            btn.innerHTML = label; btn.disabled = disabled; btn.style.opacity = disabled ? '0.75' : '1';
        };

        setBtn('<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div> Đang tải thư viện...', true);

        try {
            // Tải browser build của javascript-obfuscator từ CDN nếu chưa có
            if (!window.JavascriptObfuscator) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/javascript-obfuscator@4.1.1/dist/index.browser.js';
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('Không tải được thư viện từ CDN. Kiểm tra kết nối internet.'));
                    document.head.appendChild(s);
                });
            }

            setBtn('<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div> Đang làm rối mã...', true);

            // Nhường luồng cho trình duyệt render spinner trước khi chạy tác vụ nặng
            await new Promise(r => setTimeout(r, 50));

            let rawHtml = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
            // Reset trạng thái DOM: loginOverlay phải hiển thị, mainApp phải ẩn
            rawHtml = _resetHtmlStateForExport(rawHtml);

            // Chỉ obfuscate khối <script> thông thường (KHÔNG phải type="module" và KHÔNG phải src=...)
            // Lý do: script type="module" dùng ES import statements — nếu obfuscator chèn bootstrap
            // string-array trước import → sai cú pháp module → lỗi Firebase / đăng nhập bị hỏng.
            const scriptRegex = /<script(?![^>]*\bsrc\s*=)(?![^>]*\btype\s*=\s*['"]module['"])[^>]*>([\s\S]*?)<\/script>/gi;
            const obfuscated = rawHtml.replace(scriptRegex, (fullMatch, jsCode) => {
                const trimmed = jsCode.trim();
                if (!trimmed) return fullMatch;
                const openTagMatch = fullMatch.match(/^(<script[^>]*>)/i);
                const openTag = openTagMatch ? openTagMatch[1] : '<script>';
                try {
                    const result = window.JavascriptObfuscator.obfuscate(trimmed, {
                        compact: true,
                        controlFlowFlattening: false,
                        deadCodeInjection: false,
                        debugProtection: false,
                        disableConsoleOutput: false,
                        identifierNamesGenerator: 'hexadecimal',
                        renameGlobals: false,
                        selfDefending: false,
                        stringArray: true,
                        stringArrayThreshold: 0.75,
                        stringArrayEncoding: ['base64'],
                        stringArrayRotate: true,
                        stringArrayShuffle: true,
                        splitStrings: false,
                        transformObjectKeys: false,
                        unicodeEscapeSequence: false,
                    });
                    return `${openTag}\n${result.getObfuscatedCode()}\n<\/script>`;
                } catch { return fullMatch; }
            });

            const blob = new Blob([obfuscated], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'smartpay-edu-integrated-obfuscated.html';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
            window.showToast('✅ Đã tạo và tải bản làm rối thành công!');
        } catch (e) {
            alert('❌ Lỗi khi tạo bản làm rối:\n' + e.message);
        } finally {
            setBtn(origHtml, false);
        }
    };

    window.loadSuperAdminData = async function() {
        // [HOTFIX] Phase 4.0B-1: fallback wrapper — hardened retry + clear error display.
        // Gọi từ nhiều nơi (initSaaSDatabase, tab switch, toolbar) → phải robust.
        if (window.SuperAdminModule?.loadSuperAdminDashboard) {
            if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.fallbackCalls++;
            return window.SuperAdminModule.loadSuperAdminDashboard();
        }
        // ensureSuperAdminModule chưa sẵn sàng (main.js chưa bootstrap xong) → retry 15× × 150ms
        for (let _r = 0; _r < 15; _r++) {
            if (typeof window.ensureSuperAdminModule === 'function') break;
            await new Promise(res => setTimeout(res, 150));
        }
        if (typeof window.ensureSuperAdminModule === 'function') {
            const loaded = await window.ensureSuperAdminModule('loadSuperAdminData-fallback');
            if (loaded && window.SuperAdminModule?.loadSuperAdminDashboard) {
                if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.fallbackCalls++;
                return window.SuperAdminModule.loadSuperAdminDashboard();
            }
        }
        // Sau retry vẫn fail → hiển thị lỗi rõ trong #sysClubListMain thay vì silent
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] loadSuperAdminData: module not loaded after retry');
        const _errEl = document.getElementById('sysClubListMain');
        if (_errEl) {
            _errEl.innerHTML = '<div class="text-center py-10 text-rose-500 px-4"><div class="text-3xl mb-3">⚠️</div>' +
                '<p class="font-bold text-sm mb-2">Không tải được module SuperAdmin.</p>' +
                '<p class="text-xs text-slate-500">Hãy refresh trang (F5) hoặc kiểm tra main.js đã load chưa.</p>' +
                '<button onclick="location.reload()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">🔄 Refresh trang</button></div>';
        }
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    // ── Tải & hiển thị lịch sử đăng nhập (Super Admin) ──────────────────
    // ── Hàm hiển thị hướng dẫn sửa Firestore Rules ──────────────────────
    function _showLoginHistoryRulesGuide(contentEl, errorMsg, writeFailed) {
        const rulesText = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // === THÊM ĐOẠN NÀY VÀO RULES ===
    match /login_history/{docId} {
      allow write: if request.auth != null;
      allow read: if request.auth != null
        && request.auth.token.email == "admin@tstquynhon.com";
    }
    // ================================

    // ... (giữ nguyên các rules hiện có bên dưới)
  }
}`;
        const writeStatus = writeFailed
            ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:0.75rem;color:#92400e;">
                <strong>⚠️ Ghi dữ liệu cũng đang bị chặn!</strong><br>
                Lịch sử đăng nhập KHÔNG được lưu vào Firestore. Sau khi sửa rules, bạn cần đăng nhập lại để ghi bản ghi đầu tiên.
               </div>`
            : `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:0.75rem;color:#166534;">
                <strong>✅ Ghi dữ liệu hoạt động bình thường.</strong><br>
                Lịch sử đăng nhập đã được lưu. Chỉ cần sửa quyền ĐỌC là xong.
               </div>`;
        contentEl.innerHTML = `
            <div style="padding:16px;">
                <div style="text-align:center;margin-bottom:14px;color:#dc2626;font-size:0.85rem;font-weight:800;">❌ Lỗi: ${errorMsg}</div>
                ${writeStatus}
                <div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:16px;">
                    <div style="font-weight:900;font-size:0.82rem;color:#991b1b;margin-bottom:12px;">📋 Cách sửa — Cập nhật Firestore Security Rules</div>

                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;font-size:0.78rem;color:#334155;">
                        <div style="display:flex;gap:8px;align-items:flex-start;">
                            <span style="background:#0033A0;color:#fff;font-weight:900;font-size:0.65rem;padding:2px 7px;border-radius:99px;flex-shrink:0;margin-top:1px;">1</span>
                            <span>Truy cập <strong>console.firebase.google.com</strong> → chọn project <strong>quanly-tst</strong></span>
                        </div>
                        <div style="display:flex;gap:8px;align-items:flex-start;">
                            <span style="background:#0033A0;color:#fff;font-weight:900;font-size:0.65rem;padding:2px 7px;border-radius:99px;flex-shrink:0;margin-top:1px;">2</span>
                            <span>Vào <strong>Firestore Database → Rules</strong> (tab trên cùng)</span>
                        </div>
                        <div style="display:flex;gap:8px;align-items:flex-start;">
                            <span style="background:#0033A0;color:#fff;font-weight:900;font-size:0.65rem;padding:2px 7px;border-radius:99px;flex-shrink:0;margin-top:1px;">3</span>
                            <span>Thêm đoạn <code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;">match /login_history/{docId} { ... }</code> vào bên trong block <code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;">match /databases/{database}/documents</code></span>
                        </div>
                        <div style="display:flex;gap:8px;align-items:flex-start;">
                            <span style="background:#0033A0;color:#fff;font-weight:900;font-size:0.65rem;padding:2px 7px;border-radius:99px;flex-shrink:0;margin-top:1px;">4</span>
                            <span>Nhấn <strong>Publish</strong> để lưu</span>
                        </div>
                    </div>

                    <div style="position:relative;">
                        <pre id="_lh_rules_pre" style="background:#0f172a;color:#e2e8f0;border-radius:8px;padding:12px;font-size:0.68rem;overflow-x:auto;white-space:pre;line-height:1.6;margin:0;">${rulesText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
                        <button onclick="(function(){const t=document.getElementById('_lh_rules_pre').innerText;navigator.clipboard.writeText(t).then(()=>window.showToast('✅ Đã copy rules!')).catch(()=>window.showToast('⚠️ Copy thủ công nhé!'));})()"
                            style="position:absolute;top:8px;right:8px;background:#334155;color:#e2e8f0;border:none;border-radius:6px;padding:4px 10px;font-size:0.68rem;font-weight:700;cursor:pointer;">
                            📋 Copy
                        </button>
                    </div>

                    <div style="margin-top:10px;font-size:0.7rem;color:#64748b;text-align:center;">
                        Sau khi Publish xong → nhấn <strong>🔄 Làm mới</strong> ở trên để tải lại
                    </div>
                </div>
            </div>`;
    }

    window.loadLoginHistory = async () => {
        const contentEl = document.getElementById('loginlog_content');
        const filterClub = (document.getElementById('loginlog_filter_club') || {}).value || '';
        if (!contentEl) return;
        contentEl.innerHTML = '<p style="text-align:center;color:#94a3b8;font-size:0.82rem;padding:20px 0;">⏳ Đang tải lịch sử đăng nhập...</p>';

        const writeFailed = false;
        try {
            const q = query(collection(db, "login_history"), orderBy("timestamp", "desc"), limit(500)); // OK_UI_DISPLAY_LIMIT [3.8D-Phase6]
            const snap = await getDocs(q);

            // Populate club filter dropdown (first load only)
            const filterEl = document.getElementById('loginlog_filter_club');
            if (filterEl && filterEl.options.length <= 1) {
                const allClubIds = new Set();
                snap.forEach(d => { if(d.data().clubId && !d.data()._test) allClubIds.add(d.data().clubId); });
                allClubIds.forEach(cid => {
                    const opt = document.createElement('option');
                    opt.value = cid; opt.textContent = '🏢 ' + cid;
                    filterEl.appendChild(opt);
                });
            }

            // Lọc phía client nếu có filterClub (tránh cần composite index)
            let docs = [];
            snap.forEach(d => { if (!d.data()._test) docs.push(d.data()); });
            if (filterClub) docs = docs.filter(item => item.clubId === filterClub);

            if (docs.length === 0) {
                if (writeFailed) {
                    _showLoginHistoryRulesGuide(contentEl,
                        'Chưa có dữ liệu — quyền ghi bị chặn nên không có bản ghi nào', true);
                } else {
                    contentEl.innerHTML = '<p style="text-align:center;color:#94a3b8;font-size:0.82rem;font-style:italic;padding:24px 0;">Chưa có lịch sử đăng nhập nào.<br><span style="font-size:0.72rem;">Đăng xuất rồi đăng nhập lại để tạo bản ghi đầu tiên.</span></p>';
                }
                return;
            }

            const rows = docs.map(item => {
                const dt = item.loginAt ? new Date(item.loginAt) : null;
                const dateStr = dt ? dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
                const timeStr = dt ? dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
                const roleLabel = item.role === 'super_admin'
                    ? '<span style="background:#ede9fe;color:#6d28d9;padding:2px 7px;border-radius:5px;font-size:0.65rem;font-weight:800;white-space:nowrap;">SUPER</span>'
                    : item.role === 'admin'
                    ? '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:5px;font-size:0.65rem;font-weight:800;white-space:nowrap;">ADMIN</span>'
                    : '<span style="background:#f1f5f9;color:#64748b;padding:2px 7px;border-radius:5px;font-size:0.65rem;font-weight:700;white-space:nowrap;">VIEWER</span>';
                const deviceIcon = item.deviceType === 'Mobile' ? '📱' : '🖥️';
                const browserIcon = { 'Chrome': '🟡', 'Firefox': '🟠', 'Safari': '🔵', 'Edge': '💙' }[item.browser] || '🌐';
                const deviceLabel = item.deviceName
                    ? `<span style="font-weight:800;color:#0f172a;">${item.deviceName}</span>`
                    : `<span style="color:#475569;">${item.os || '—'}</span>`;
                return `
                    <div style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:5px;">
                            <div style="min-width:0;flex:1;">
                                <div style="font-weight:700;color:#0033A0;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.email || '—'}</div>
                                <div style="font-size:0.65rem;color:#64748b;margin-top:1px;">${item.clubId || 'System'}</div>
                            </div>
                            <div style="flex-shrink:0;">${roleLabel}</div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
                            <div>
                                <span style="font-size:0.78rem;font-weight:800;color:#1e293b;">${timeStr}</span>
                                <span style="font-size:0.65rem;color:#94a3b8;margin-left:6px;">${dateStr}</span>
                            </div>
                            <div style="font-size:0.72rem;color:#475569;display:flex;align-items:center;gap:4px;">
                                <span>${deviceIcon}</span>
                                <span style="background:${item.deviceName ? '#eef2ff' : '#f1f5f9'};padding:2px 8px;border-radius:6px;font-size:0.68rem;">${deviceLabel}</span>
                                <span>${browserIcon} ${item.browser || '—'}</span>
                            </div>
                        </div>
                    </div>`;
            });

            contentEl.innerHTML = `
                <div style="padding:7px 14px;background:#f8fafc;border-bottom:2px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-size:0.65rem;font-weight:900;color:#475569;text-transform:uppercase;">Lịch Sử Đăng Nhập</div>
                    <div style="font-size:0.65rem;color:#94a3b8;">${rows.length} bản ghi${filterClub ? ' — CLB: ' + filterClub : ''}</div>
                </div>
                ${rows.join('')}
                <div style="padding:10px 14px;text-align:center;font-size:0.7rem;color:#94a3b8;">Hiển thị ${rows.length} bản ghi${filterClub ? ' cho CLB: ' + filterClub : ' gần nhất'}</div>`;

        } catch(e) {
            console.error('[login_history] Lỗi đọc:', e);
            const isPermission = e.message && (e.message.includes('permission') || e.message.includes('Missing'));
            const isIndex = e.message && e.message.includes('index');
            let errMsg = e.message;
            if (isIndex) errMsg = 'Thiếu Composite Index (cần tạo index trong Firebase Console)';
            _showLoginHistoryRulesGuide(contentEl, errMsg, writeFailed);
        }
    };

    window.openExpiryModal = async function(clubId, clubName, currentExpiry) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.openExpiryModal) return window.SuperAdminModule.openExpiryModal(clubId, clubName, currentExpiry);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('openExpiryModal');
            if (loaded && window.SuperAdminModule?.openExpiryModal) return window.SuperAdminModule.openExpiryModal(clubId, clubName, currentExpiry);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] openExpiryModal: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    window.saveClubExpiry = async () => {
        const clubId = document.getElementById('em_clubId').value;
        const newExpiry = document.getElementById('em_expiryDate').value;
        if (!newExpiry) return alert("Vui lòng chọn ngày hết hạn!");
        try {
            await updateDoc(doc(db, "clubs", clubId), { expiryDate: newExpiry, accountStatus: 'active' });
            window.showToast("✅ Đã cập nhật hạn sử dụng thành công!");
            document.getElementById('expiryModal').style.display = 'none';
            window.loadSuperAdminData();
        } catch (e) { console.error(e); alert("Lỗi cập nhật: " + e.message); }
    };

    window.lockClubAccount = async function(clubId, clubName) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.lockClub) return window.SuperAdminModule.lockClub(clubId, clubName);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('lockClubAccount');
            if (loaded && window.SuperAdminModule?.lockClub) return window.SuperAdminModule.lockClub(clubId, clubName);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] lockClubAccount: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    window.unlockClubAccount = async function(clubId) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.unlockClub) return window.SuperAdminModule.unlockClub(clubId);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('unlockClubAccount');
            if (loaded && window.SuperAdminModule?.unlockClub) return window.SuperAdminModule.unlockClub(clubId);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] unlockClubAccount: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    window.toggleExamFeature = async function(clubId, clubName, currentEnabled) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.toggleClubStatus) return window.SuperAdminModule.toggleClubStatus(clubId, clubName, currentEnabled);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('toggleExamFeature');
            if (loaded && window.SuperAdminModule?.toggleClubStatus) return window.SuperAdminModule.toggleClubStatus(clubId, clubName, currentEnabled);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] toggleExamFeature: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    window.saOpenDeleteTxModal = async function(clubId, clubName) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.saOpenDeleteTxModal) return window.SuperAdminModule.saOpenDeleteTxModal(clubId, clubName);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('saOpenDeleteTxModal');
            if (loaded && window.SuperAdminModule?.saOpenDeleteTxModal) return window.SuperAdminModule.saOpenDeleteTxModal(clubId, clubName);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] saOpenDeleteTxModal: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    window.saDeleteTransactions = async () => {
        const clubId = document.getElementById('deleteTxModal_clubId').value;
        const beforeDate = document.getElementById('deleteTxModal_before').value;
        if (!beforeDate) return alert('Vui lòng chọn ngày!');
        const clubName = document.getElementById('deleteTxModal_clubName').innerText;
        const resultEl = document.getElementById('deleteTxModal_result');
        if (!confirm(`⚠️ XÁC NHẬN XÓA BIÊN LAI\n\nCLB: ${clubName}\nXóa tất cả giao dịch TRƯỚC ngày: ${beforeDate}\n\nDữ liệu bị xóa KHÔNG THỂ PHỤC HỒI!\nBấm OK để tiếp tục.`)) return;
        const btn = document.getElementById('deleteTxModal_btn');
        btn.disabled = true; btn.innerText = '⏳ Đang xóa...';
        resultEl.innerHTML = '';
        try {
            const txRef = collection(db, 'clubs', clubId, 'transactions');
            // [4.0B-4J-8A] Fixed: thay limit(500) đơn bằng vòng lặp paginated — xóa đầy đủ mọi tx trước ngày dù CLB có hàng nghìn giao dịch.
            // Pattern: getDocs(limit(400)) → batch.delete() → lặp lại cho đến khi snap.empty.
            // Mỗi iteration xóa 1 batch → snap sau iteration không còn các docs đã xóa → an toàn.
            let _totalDeleted = 0;
            let _delPage      = 0;
            const _DEL_PAGE   = 400;
            while (_delPage < 100) {
                const _ds = await getDocs(query(txRef, where('date', '<', beforeDate), limit(_DEL_PAGE)));
                if (_ds.empty) break;
                const _delBatch = writeBatch(db);
                _ds.docs.forEach(d => _delBatch.delete(d.ref));
                await _delBatch.commit();
                _totalDeleted += _ds.size;
                resultEl.innerHTML = `<div style="color:#0033A0;font-weight:700;font-size:0.82rem;margin-top:10px;">⏳ Đã xóa ${_totalDeleted} giao dịch...</div>`;
                if (_ds.size < _DEL_PAGE) break;
                _delPage++;
            }
            if (_totalDeleted === 0) {
                resultEl.innerHTML = '<div style="color:#16a34a;font-weight:700;font-size:0.82rem;margin-top:10px;">✅ Không có giao dịch nào trước ngày này.</div>';
                btn.disabled = false; btn.innerText = '🗑️ Xóa Giao Dịch';
                return;
            }
            const total = _totalDeleted;
            let deleted = _totalDeleted;
            const batchSize = 400; // kept for success message below
            // SECURITY TODO: XSS risk — clubName và beforeDate đến từ Firestore/input.
            // Dùng window.escapeHtml() khi available. Phase 4.1: patch toàn bộ.
            const _esc = window.escapeHtml || (s => s);
            resultEl.innerHTML = `<div style="color:#16a34a;font-weight:800;font-size:0.85rem;margin-top:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;">✅ Đã xóa thành công <strong>${total} giao dịch</strong> trước ngày ${_esc(beforeDate)} của CLB "${_esc(clubName)}".</div>`;
            window.showToast(`✅ Đã xóa ${total} giao dịch!`);
            window.loadSuperAdminData();
        } catch (e) {
            console.error(e);
            // SECURITY TODO: e.message có thể chứa ký tự đặc biệt từ Firestore error.
            const _esc2 = window.escapeHtml || (s => s);
            resultEl.innerHTML = `<div style="color:#dc2626;font-weight:700;font-size:0.82rem;margin-top:10px;">❌ Lỗi: ${_esc2(e.message)}</div>`;
        } finally {
            btn.disabled = false; btn.innerText = '🗑️ Xóa Giao Dịch';
        }
    };

    window.filterSAClubs = async function() {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.filterClubs) return window.SuperAdminModule.filterClubs();
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('filterSAClubs');
            if (loaded && window.SuperAdminModule?.filterClubs) return window.SuperAdminModule.filterClubs();
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] filterSAClubs: module not loaded');
    };

    window._renderSAClubRows = async function(clubDataList, today, in30Days) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.renderClubList) return window.SuperAdminModule.renderClubList(clubDataList, today, in30Days);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('_renderSAClubRows');
            if (loaded && window.SuperAdminModule?.renderClubList) return window.SuperAdminModule.renderClubList(clubDataList, today, in30Days);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] _renderSAClubRows: module not loaded');
    };

    // ── Toggle dropdown cho nút Cấu hình CLB (SuperAdmin) ────────────
    window._toggleSAConfig = function(cid, ev) {
        // Phase 4.0B: legacy fallback only — see js/modules/superadmin.js
        console.warn('[SuperAdminFallback] _toggleSAConfig: module not loaded');
    };
    if (!window._saCfgOutside) {
        window._saCfgOutside = true;
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sa-cfg-btn') && !e.target.closest('.sa-cfg-dd')) {
                document.querySelectorAll('.sa-cfg-dd').forEach(el => { el.style.display = 'none'; });
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') document.querySelectorAll('.sa-cfg-dd').forEach(el => { el.style.display = 'none'; });
        });
    }
    // ──────────────────────────────────────────────────────────────────

    window.forceReplaceAdmin = async function(clubId) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.forceReplaceAdmin) return window.SuperAdminModule.forceReplaceAdmin(clubId);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('forceReplaceAdmin');
            if (loaded && window.SuperAdminModule?.forceReplaceAdmin) return window.SuperAdminModule.forceReplaceAdmin(clubId);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] forceReplaceAdmin: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    window.editClubName = async function(clubId, currentName) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.editClubName) return window.SuperAdminModule.editClubName(clubId, currentName);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('editClubName');
            if (loaded && window.SuperAdminModule?.editClubName) return window.SuperAdminModule.editClubName(clubId, currentName);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] editClubName: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    function loadLogoForReceipt() {
        // Logo được quản lý bởi applyClubConfigUI() — hàm này giữ lại để tương thích
    }

    async function initSaaSDatabase(clubId) {
        document.getElementById('loginOverlay').style.display = 'none'; document.getElementById('mainApp').style.display = 'block'; document.getElementById('passInput').value = '';

        // Role đã được xác định chính xác bởi onAuthStateChanged trước khi gọi hàm này.
        // Không ghi đè window.userRole ở đây để tránh race condition.

        if(window.userRole === 'super_admin') {
            document.getElementById('superAdminView').style.display = 'block';
            document.getElementById('mainTabsWrapper').style.display = 'none';
            document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
            document.getElementById('filterArea').style.display = 'none';
            document.getElementById('btnSettings').style.display = 'none';
            document.getElementById('exportTaxBtn').style.display = 'none';
            document.getElementById('exportBtn').style.display = 'none';
            document.getElementById('displaySubtitle').innerText = "HỆ THỐNG QUẢN TRỊ TRUNG TÂM (ROOT)";
            const _now = new Date(); const _ym = _now.getFullYear() + '-' + String(_now.getMonth()+1).padStart(2,'0');
            const _rmEl = document.getElementById('sa_revenue_month'); if(_rmEl) _rmEl.value = _ym;
            // [HOTFIX] Race condition: ensureSuperAdminModule và main.js có thể chưa xong khi
            // initSaaSDatabase chạy ngay sau login. Dùng safe async retry thay vì gọi thẳng.
            (async () => {
                const _listEl = document.getElementById('sysClubListMain');
                // Thử ngay nếu module đã có
                if (window.SuperAdminModule?.loadSuperAdminDashboard) {
                    return window.SuperAdminModule.loadSuperAdminDashboard();
                }
                // ensureSuperAdminModule chưa sẵn sàng → retry tối đa 20 lần × 150ms = 3s
                // Đây là tình huống main.js ES module chưa finish bootstrapping
                for (let _i = 0; _i < 20; _i++) {
                    await new Promise(r => setTimeout(r, 150));
                    if (typeof window.ensureSuperAdminModule === 'function') break;
                }
                if (typeof window.ensureSuperAdminModule === 'function') {
                    const _ok = await window.ensureSuperAdminModule('initSaaSDatabase');
                    if (_ok && window.SuperAdminModule?.loadSuperAdminDashboard) {
                        return window.SuperAdminModule.loadSuperAdminDashboard();
                    }
                }
                // Fallback: thử window.loadSuperAdminData (chính nó có retry bên trong)
                if (typeof window.loadSuperAdminData === 'function') {
                    return window.loadSuperAdminData();
                }
                // Vẫn thất bại — hiện lỗi rõ thay vì đứng ở "Đang tải..."
                if (_listEl) {
                    _listEl.innerHTML = '<div class="text-center py-10 text-rose-500"><div class="text-2xl mb-2">⚠️</div><p class="font-bold text-sm">Module SuperAdmin chưa tải được.</p><p class="text-xs text-slate-400 mt-2">Vui lòng refresh trang (F5). Nếu lỗi vẫn xảy ra, kiểm tra main.js đã load chưa.</p></div>';
                }
            })();
            return; 
        }
        // Show change password button for CLB admin/viewer (not super_admin)
        const _cpBtn = document.getElementById('btnChangePassword'); if(_cpBtn) _cpBtn.style.display = 'flex';
        const _mmsCpBtn = document.getElementById('mmsChangePasswordBtn'); if(_mmsCpBtn) _mmsCpBtn.style.display = 'block';

        // ── Kiểm tra hạn sử dụng và trạng thái tài khoản CLB ──
        if (window.userRole !== 'super_admin') {
            try {
                const clubDocForExpiry = await getDoc(doc(db, "clubs", clubId));
                if (clubDocForExpiry.exists()) {
                    const clubInfo = clubDocForExpiry.data();
                    const acctStatus = clubInfo.accountStatus || 'active';
                    const expiryDate = clubInfo.expiryDate || '2027-04-30';
                    const today = getLocalToday();
                    const in30Days = (() => { const d = new Date(); d.setDate(d.getDate() + 30); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().split('T')[0]; })();

                    // Helper: ẩn toàn bộ giao diện CLB khi bị chặn
                    const hideClubUI = () => {
                        ['mainTabsWrapper','filterArea','btnSettings','exportTaxBtn','exportBtn'].forEach(id => {
                            const el = document.getElementById(id); if(el) el.style.display = 'none';
                        });
                        document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
                        // Ẩn nút header navbar
                        document.querySelectorAll('.desktop-action-btns .btn-sm, .desktop-action-btns button:not([onclick*="Logout"]):not([onclick*="logout"])').forEach(el => el.style.display='none');
                    };

                    if (acctStatus === 'locked') {
                        hideClubUI();
                        const banner = document.createElement('div');
                        banner.style.cssText = 'padding:20px 16px;';
                        banner.innerHTML = `<div style="margin:0 auto;max-width:520px;background:#fff1f2;border:2px solid #fecaca;border-radius:20px;padding:32px 24px;text-align:center;box-shadow:0 8px 32px rgba(200,16,46,0.10);">
                            <div style="font-size:3rem;margin-bottom:12px;">🔒</div>
                            <h2 style="color:#991b1b;font-size:1.15rem;font-weight:900;margin-bottom:8px;text-transform:uppercase;">Tài khoản đã bị khóa</h2>
                            <p style="color:#7f1d1d;font-size:0.92rem;line-height:1.6;margin-bottom:16px;">Tài khoản phần mềm quản lý CLB của bạn đã bị khóa bởi Super Admin.<br>Vui lòng liên hệ <strong>0905.109.344 (Tình)</strong> để được hỗ trợ mở khóa và tiếp tục sử dụng.</p>
                            <button onclick="window.handleLogout()" style="background:#991b1b;color:#fff;border:none;padding:10px 28px;border-radius:10px;font-weight:700;cursor:pointer;font-size:0.9rem;">🚪 Đăng xuất</button>
                        </div>`;
                        document.getElementById('mainApp').prepend(banner);
                        return;
                    }

                    if (expiryDate < today) {
                        hideClubUI();
                        const banner = document.createElement('div');
                        banner.style.cssText = 'padding:20px 16px;';
                        banner.innerHTML = `<div style="margin:0 auto;max-width:520px;background:#fff1f2;border:2px solid #fecaca;border-radius:20px;padding:32px 24px;text-align:center;box-shadow:0 8px 32px rgba(200,16,46,0.10);">
                            <div style="font-size:3rem;margin-bottom:12px;">⛔</div>
                            <h2 style="color:#991b1b;font-size:1.15rem;font-weight:900;margin-bottom:8px;text-transform:uppercase;">Tài khoản đã hết hạn sử dụng</h2>
                            <p style="color:#7f1d1d;font-size:0.92rem;line-height:1.6;margin-bottom:16px;">Phần mềm quản lý CLB của bạn đã hết hạn vào ngày <strong>${formatDate(expiryDate)}</strong>.<br>Vui lòng liên hệ <strong>0905.109.344 (Tình)</strong> để gia hạn tài khoản và tiếp tục sử dụng.</p>
                            <button onclick="window.handleLogout()" style="background:#991b1b;color:#fff;border:none;padding:10px 28px;border-radius:10px;font-weight:700;cursor:pointer;font-size:0.9rem;">🚪 Đăng xuất</button>
                        </div>`;
                        document.getElementById('mainApp').prepend(banner);
                        return;
                    }

                    // Sắp hết hạn (trong vòng 30 ngày)
                    if (expiryDate <= in30Days) {
                        const banner = document.getElementById('expiryWarningBanner');
                        const textEl = document.getElementById('expiryWarningText');
                        if (banner && textEl) {
                            textEl.innerText = `Phần mềm quản lý của CLB sẽ hết hạn vào ngày ${formatDate(expiryDate)}.`;
                            banner.style.display = 'block';
                        }
                    }
                }
            } catch(expiryErr) { console.warn("Không kiểm tra được hạn TK:", expiryErr); }
        }

        // ── Coach role: chỉ hiện tab Điểm danh, ẩn toàn bộ admin UI ─────────────
        if (window.userRole === 'coach') {
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.style.display = (btn.id === 'btn_attendance') ? '' : 'none';
            });
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            const _attEl = document.getElementById('tab_attendance');
            if (_attEl) _attEl.classList.add('active');
            // Ẩn các nút admin, nhưng GIỮ LẠI btnAddStudent để HLV có thể thêm võ sinh
            ['filterArea','btnSettings','exportTaxBtn','exportBtn'].forEach(id => {
                const el = document.getElementById(id); if (el) el.style.display = 'none';
            });
            // Ẩn tab Thi Đai cho tài khoản HLV (cũng được xử lý trong onSnapshot)
            const _btnExamCoach = document.getElementById('btn_exam');
            if (_btnExamCoach) _btnExamCoach.style.display = 'none';
            // Ẩn các mục thống kê trên mobile header: Đang tập, Nợ HP, Doanh thu, Tháng
            ['mhbActiveCount','mhbDebtCount','mhbIncome','mhbMonth'].forEach(function(pillId) {
                const _pillEl = document.getElementById(pillId);
                if (_pillEl) {
                    const _pill = _pillEl.closest ? _pillEl.closest('.mhb-pill') : null;
                    if (_pill) _pill.style.display = 'none';
                }
            });
            // Hiện nút Thêm Võ Sinh trong tab điểm danh cho HLV
            const _coachAddWrap = document.getElementById('coach_add_btn_wrap');
            if (_coachAddWrap) _coachAddWrap.style.display = 'block';
            const _attD = document.getElementById('att_date');
            if (_attD && !_attD.value) _attD.value = getLocalToday();
            // Khoá bộ lọc chi nhánh theo chi nhánh được phân công
            if (window.coachBranch) {
                const _branchEl = document.getElementById('att_branch');
                if (_branchEl) { _branchEl.value = window.coachBranch; _branchEl.disabled = true; }
                const _mBranchEl = document.getElementById('att_month_branch');
                if (_mBranchEl) { _mBranchEl.value = window.coachBranch; _mBranchEl.disabled = true; }
            }
            // Hiển thị thông tin HLV trên header điểm danh
            const _attHeader = document.getElementById('coach_att_info');
            if (_attHeader) {
                _attHeader.style.display = 'flex';
                const _branchName = window.coachBranch
                    ? (window.getBranchNameDisplay ? window.getBranchNameDisplay(window.coachBranch) : window.coachBranch)
                    : 'Tất cả';
                // SECURITY TODO: _branchName đến từ Firestore — cần escapeHtml. Phase 4.1.
                const _escBranch = window.escapeHtml || (s => s);
                _attHeader.innerHTML = `<span style="font-size:0.78rem;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:6px 14px;border-radius:99px;font-weight:700;">👨‍🏫 HLV đang điểm danh — Cơ sở: ${_escBranch(_branchName)}</span>`;
            }
            // [SỬA] Tự động load danh sách điểm danh khi HLV đăng nhập —
            // không cần click thêm, hệ thống hiển thị ngay danh sách cơ sở được giao.
            if (typeof window.renderAttendanceList === 'function') {
                window.renderAttendanceList();
            }
        }

        if(window.userRole === 'viewer') {
            document.getElementById('transactionForm').style.display = 'none'; document.getElementById('inventoryForm').style.display = 'none';
            document.getElementById('expenseForm').style.display = 'none'; document.getElementById('examExpenseForm').style.display = 'none';
            document.getElementById('btnAddStudent').style.display = 'none';
            const btnBatch = document.querySelector('#tab_exam button.bg-gradient-to-r'); if(btnBatch) btnBatch.style.display = 'none';
        }

        const clubRef = doc(db, "clubs", clubId);
        profRef = collection(db, "clubs", clubId, "profiles");
        colRef = collection(db, "clubs", clubId, "transactions");
        invRef = collection(db, "clubs", clubId, "inventory");
        const settingsRef = doc(db, "clubs", clubId, "settings", "main_config");
        const invStatsRef = doc(db, "clubs", clubId, "settings", "inventory_stats");

        // [Phase 2d] Sync Firebase refs và clubId vào bridge ngay sau khi login
        // → modules/students.js (và các module khác) đọc từ window.__store tại call time
        if (window.__store) {
            window.__store.db      = db;
            window.__store.colRef  = colRef;
            window.__store.profRef = profRef;
            window.__store.invRef  = invRef;
            window.__store.clubId  = clubId;
            // Phase 4.0B-4C: alias thống nhất để main.js/modules đọc context
            window.__store.currentClubId = clubId;
            window.__store.currentUser   = auth.currentUser || null;
        }
        // Phase 4.0B-4C: alias global — đọc bởi dispatchAppContextReady + modules
        window.currentClubId = clubId;

        // Phase 4.0B-4C: Dispatch app:context-ready — db + clubId + refs đã sẵn sàng.
        // Chỉ có nghĩa là context cơ bản ready, KHÔNG có nghĩa data snapshot đã load xong.
        dispatchAppContextReady('initSaaSDatabase-store-synced');
        // Phase 4K-RUNTIME-INIT-FIX: Dispatch app:db-ready — db đã gắn vào store.
        // Modules pagination listen event này để init an toàn sau khi db sẵn sàng.
        // Guard __dbReadyEventDispatched ngăn dispatch lặp trong cùng session.
        if (!window.__dbReadyEventDispatched) {
            window.__dbReadyEventDispatched = true;
            window.dispatchEvent(new CustomEvent('app:db-ready', {
                detail: {
                    db:       window.__store && window.__store.db ? window.__store.db : db,
                    clubId:   clubId || '',
                    userRole: window.userRole || '',
                }
            }));
        }
        // Phase 4.0B-4J-8A: Dispatch app:shell-ready — shell đã hiện, dữ liệu đang tải.
        window.dispatchEvent(new CustomEvent('app:shell-ready'));
        if (typeof markLoginPerf === 'function') markLoginPerf('shellShown');

        // [Phase 3.6C] club listener — migrated to safeRegisterSnapshot()
        // No activeListeners.push needed — registry is source of cleanup.
        const _clubKey = 'global:club:' + clubId;
        const _clubCb = (snap) => {
            if (window.markListenerSnapshot) window.markListenerSnapshot(_clubKey);
            if(snap.exists()) {
                clubData = snap.data();
                if (window.__store) window.__store.clubData = clubData; // [Phase 2e] sync cho finance.js
                // Phase 4.0B-4D: mark club doc loaded
                _updateHydrationMetrics({ clubLoaded: true, lastReason: 'club-snapshot' });
                const cName = clubData.clubName || "HỆ THỐNG QUẢN LÝ CLB";
                document.getElementById('displayClubName').innerText = cName.toUpperCase(); document.getElementById('r_club_name').innerText = cName.toUpperCase();
                const _mhbCN = document.getElementById('mhbClubName'); if(_mhbCN) _mhbCN.innerText = cName.toUpperCase();
                // Ẩn/hiện tab Thi Đai theo cấu hình từ SuperAdmin
                // Coach luôn ẩn tab Thi Đai bất kể cấu hình
                const _examEnabled = clubData.examEnabled !== false;
                const _btnExam = document.getElementById('btn_exam');
                const _tabExam = document.getElementById('tab_exam');
                if (_btnExam) _btnExam.style.display = (_examEnabled && window.userRole !== 'coach') ? '' : 'none';
                if (_tabExam && (!_examEnabled || window.userRole === 'coach') && _tabExam.classList.contains('active')) {
                    window.switchTab('attendance');
                }
            }
        };
        if (window.safeRegisterSnapshot) {
            window.safeRegisterSnapshot(_clubKey, () => onSnapshot(clubRef, _clubCb),
                { owner: 'club', scope: 'global', clubId: clubId, reason: 'init-club-config' });
        } else {
            const _u_club = onSnapshot(clubRef, _clubCb);
            activeListeners.push(_u_club);
            if (window.registerListener) window.registerListener(_clubKey, _u_club, { owner: 'club', scope: 'global', reason: 'init-club-config' });
        }

        // [Phase 3.6C] settings listener — migrated to safeRegisterSnapshot()
        // No activeListeners.push needed — registry is source of cleanup.
        const _settingsKey = 'global:settings:' + clubId;
        const _settingsCb = (docSnap) => {
            if (window.markListenerSnapshot) window.markListenerSnapshot(_settingsKey);
            if(docSnap.exists()) {
                clubConfig = { ...clubConfig, ...docSnap.data() };
                // [Phase 2d] Sync clubConfig → bridge để modules/students.js đọc được
                if (window.__store) window.__store.clubConfig = clubConfig;
                // Phase 4.0B-4D: mark settings loaded
                _updateHydrationMetrics({ settingsLoaded: true, lastReason: 'settings-snapshot' });
                applyClubConfigUI();
                // [Phase 3.5C] settings thay đổi ảnh hưởng toàn bộ UI → invalidateByDomain('all')
                // Dùng domain invalidation thay vì scheduleRender() toàn app.
                // Fallback về scheduleRender() nếu Phase 3.5C chưa load.
                if (window.invalidateByDomain) {
                    window.invalidateByDomain('all', 'settings-change');
                } else {
                    scheduleRender();
                }
                // Tải danh mục kho tùy chỉnh (chạy song song, không blocking)
                window.loadInvCategories().catch(e => console.warn('loadInvCategories error:', e));
            }
        };
        if (window.safeRegisterSnapshot) {
            window.safeRegisterSnapshot(_settingsKey, () => onSnapshot(settingsRef, _settingsCb),
                { owner: 'settings', scope: 'global', clubId: clubId, reason: 'init-settings' });
        } else {
            const _u_settings = onSnapshot(settingsRef, _settingsCb);
            activeListeners.push(_u_settings);
            if (window.registerListener) window.registerListener(_settingsKey, _u_settings, { owner: 'settings', scope: 'global', reason: 'init-settings' });
        }
        
        // [Phase 3.6C] invStats listener — migrated to safeRegisterSnapshot()
        // No activeListeners.push needed — registry is source of cleanup.
        const _invStatsKey = 'global:invStats:' + clubId;
        const _invStatsCb = (snap) => {
            if (window.markListenerSnapshot) window.markListenerSnapshot(_invStatsKey);
            if(snap.exists()) inventoryStats = snap.data();
            else inventoryStats = {};
            // [Phase 3.8A] Sync inventoryStats vào window.__store + inventoryStore
            if (window.__store) window.__store.inventoryStats = inventoryStats;
            if (window.__inventoryStore && typeof window.__inventoryStore.setInventoryStats === 'function') {
                window.__inventoryStore.setInventoryStats(inventoryStats, 'invstats-snapshot');
            }
            // [Phase 3.5C] invStats ảnh hưởng inventory + dashboard summary.
            // Fallback về scheduleRender() nếu Phase 3.5C chưa load.
            if (window.invalidateInventory) {
                window.invalidateInventory('invstats-snapshot');
                window.invalidateDashboard('invstats-snapshot');
            } else {
                scheduleRender();
            }
        };
        if (window.safeRegisterSnapshot) {
            window.safeRegisterSnapshot(_invStatsKey, () => onSnapshot(invStatsRef, _invStatsCb),
                { owner: 'inventory', scope: 'global', clubId: clubId, reason: 'init-invstats' });
        } else {
            const _u_invStats = onSnapshot(invStatsRef, _invStatsCb);
            activeListeners.push(_u_invStats);
            if (window.registerListener) window.registerListener(_invStatsKey, _u_invStats, { owner: 'inventory', scope: 'global', reason: 'init-invstats' });
        }

        // [Phase 3.7B] Active profiles listener replaces full profiles listener by default.
        // Bridge: cung cấp window._syncAllProfilesLegacy để profiles.listeners.js có thể
        // cập nhật allProfiles closure sau mỗi store update.
        // allProfiles[id] và Object.values(allProfiles) tiếp tục hoạt động ở mọi nơi trong app.js.
        window._syncAllProfilesLegacy = () => {
            const compat = window.studentProfileStore && window.studentProfileStore.getAllProfilesCompat
                ? window.studentProfileStore.getAllProfilesCompat()
                : null;
            if (compat) {
                // Phase 4.0B-4E: Guard — không overwrite legacy-root data bằng primary rỗng
                const _compatEmpty  = Object.keys(compat).length === 0;
                const _storeHasProf = window.__store && Object.keys(window.__store.profiles || {}).length > 0;
                if (window.__store && window.__store.activeDataSource === 'legacy-root' && _compatEmpty && _storeHasProf) {
                    console.warn('[DataSourceLock] Skip primary empty overwrite (profiles/active) — legacy-root active');
                } else {
                    allProfiles = compat;
                    if (window.__store) window.__store.profiles = allProfiles;
                    // Phase 4.0B-4D: update hydration metrics (active-profiles path)
                    _updateHydrationMetrics({
                        profilesSnapshotCount: (window.__dataHydrationMetrics.profilesSnapshotCount || 0) + 1,
                        profilesDocCount:      Object.keys(compat).length,
                        lastReason:            'profiles-sync-active'
                    });
                }
            }
        };

        // [Phase 3.7B] Mount active-only realtime listener nếu module đã sẵn.
        // main.js load TRƯỚC initSaaSDatabase (initSaaSDatabase chỉ gọi khi user login)
        // nên window.mountActiveProfilesListener đã có sẵn khi init club chạy.
        // Fallback an toàn: giữ full profiles listener nếu module chưa sẵn.
        if (typeof window.mountActiveProfilesListener === 'function') {
            window.mountActiveProfilesListener({ db, clubId, profRef, currentClubId, reason: 'init-active-profiles' });
        } else {
            // Fallback: full profiles listener (Phase 3.6D pattern — khi module chưa load)
            const _u_profiles = onSnapshot(profRef, (snap) => {
                // Phase 4.0B-4E: Guard — không overwrite legacy-root data bằng primary rỗng
                const _snapEmpty    = snap.size === 0;
                const _storeHasProf = window.__store && Object.keys(window.__store.profiles || {}).length > 0;
                if (window.__store && window.__store.activeDataSource === 'legacy-root' && _snapEmpty && _storeHasProf) {
                    console.warn('[DataSourceLock] Skip primary empty overwrite (profiles/fallback) — legacy-root active');
                    return;
                }
                allProfiles = {};
                snap.forEach(d => { allProfiles[d.id.trim()] = d.data(); });
                if (window.__store) window.__store.profiles = allProfiles;
                // Phase 4.0B-4D: update hydration metrics (fallback path)
                _updateHydrationMetrics({
                    profilesSnapshotCount: (window.__dataHydrationMetrics.profilesSnapshotCount || 0) + 1,
                    profilesDocCount:      snap.size,
                    lastReason:            'profiles-snapshot-legacy-fallback'
                });
                if (typeof window.recordReadMetric === 'function') window.recordReadMetric('profiles', snap.size, 'profiles-fallback-listener'); // [4J-8]
                // Phase 4.0B-4J-8A: Mark dataHydrated khi profiles snapshot đầu tiên load xong
                if (!(window.__loginPerfMetrics || {}).dataHydratedAt && typeof markLoginPerf === 'function') markLoginPerf('dataHydrated');
                if (window.syncProfilesToStudentStore) { window.syncProfilesToStudentStore(allProfiles, 'profiles-snapshot-legacy-fallback'); }
                if (window.invalidateStudents) { window.invalidateStudents('profiles-snapshot'); window.invalidateDashboard('profiles-snapshot'); } else { scheduleRender(); }
            });
            activeListeners.push(_u_profiles);
            if (window.registerListener) window.registerListener('global:profiles:' + clubId, _u_profiles, { owner: 'students', scope: 'global', reason: 'init-profiles-fallback' });
        }
        
        // [PERF] Giảm limit kho từ 1000 → 500 để giảm RAM mobile.
        // CLB hiếm khi có trên 500 bản ghi nhập/xuất kho trong 1 lần load.
        // Nếu cần xem lịch sử cũ hơn, dùng tính năng lọc ngày trong tab Kho.
        // [Phase 3.5C] inventory snapshot: invalidate inventory + finance (debt cross-ref) + dashboard.
        // Fallback về scheduleRender() nếu Phase 3.5C chưa load.
        // [Phase 3.6C] inventory listener — migrated to safeRegisterSnapshot()
        // No activeListeners.push needed — registry is source of cleanup.
        // NOTE: Vẫn global vì finance/debt tab cũng cần allInventory. Lazy mount: Phase 3.7.
        const _invKey = 'global:inventory:' + clubId;
        // OK_UI_DISPLAY_LIMIT — inventory listener hiển thị lịch sử gần đây (500 bản ghi đủ cho UI).
        // Công nợ kho dùng _loadAllUnpaidInvDebts() riêng — lấy TẤT CẢ unpaid, không bị limit.
        // Phase 4J-9B: Đã reclassify marker cũ → OK_UI_DISPLAY_LIMIT (không phải business calc).
        const _invQuery = query(invRef, orderBy("timestamp", "desc"), limit(500)); // OK_UI_DISPLAY_LIMIT [3.8D-Phase6] — chỉ hiển thị lịch sử kho gần đây. Công nợ kho dùng _loadAllUnpaidInvDebts() riêng.

        // [Phase 3.8C] State + function: load tất cả unpaid inventory debts một lần sau snapshot.
        let _unpaidDebtQueryDone    = false;
        let _unpaidDebtQueryLoading = false;

        const _loadAllUnpaidInvDebts = async function(reason) {
            if (_unpaidDebtQueryLoading) return;
            _unpaidDebtQueryLoading = true;
            const _qsm = window.__queryScaleMetrics;
            const _t0  = Date.now();
            try {
                // where('unpaid', '==', true): single equality filter, không cần composite index.
                // Không dùng limit() — lấy TOÀN BỘ unpaid docs, dù invRef có bao nhiêu records.
                // Filter type === 'Xuất bán' trong JS — đúng logic nợ kho gốc.
                const _snap  = await getDocs(query(invRef, where('unpaid', '==', true)));
                const _allMs = Date.now() - _t0;
                const _all   = _snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const _debts = _all.filter(t => t.type === 'Xuất bán');

                if (window.__inventoryStore) {
                    if (typeof window.__inventoryStore.setFinanceInventoryDebts === 'function')
                        window.__inventoryStore.setFinanceInventoryDebts(_debts, 'unpaid-inventory-query');
                    if (typeof window.__inventoryStore.rebuildInventoryDebtIndex === 'function')
                        window.__inventoryStore.rebuildInventoryDebtIndex('unpaid-inventory-query');
                    if (typeof window.__inventoryStore.markUnpaidDebtQueryLoaded === 'function')
                        window.__inventoryStore.markUnpaidDebtQueryLoaded(_debts.length, reason);
                }

                if (window.invalidateFinance)   window.invalidateFinance('inventory-unpaid-debts-loaded');
                if (window.invalidateStudents)  window.invalidateStudents('inventory-affect-debt');
                if (window.invalidateDashboard) window.invalidateDashboard('inventory-unpaid-debts-loaded');

                if (_qsm) {
                    _qsm.unpaidInventoryDebtDocs  = _debts.length;
                    _qsm.unpaidInventoryDebtPages = 1;
                    _qsm.lastQueryScaleReason     = reason || 'unpaid-inventory-query';
                    _qsm.lastUpdatedAt            = Date.now();
                }
                _unpaidDebtQueryDone    = true;
                _unpaidDebtQueryLoading = false;
                console.info(`[Phase 3.8C] Unpaid inv query: ${_debts.length} debts (${_all.length} unpaid total) in ${_allMs}ms`);
            } catch (err) {
                _unpaidDebtQueryLoading = false;
                if (window.__queryScaleMetrics) window.__queryScaleMetrics.fallbackToRecentInventoryCount++;
                const _msg = (err && err.message) || String(err);
                if (_msg.includes('index') || _msg.includes('FAILED_PRECONDITION')) {
                    console.warn(
                        '[Phase 3.8C][FirestoreIndexRequired] Unpaid inventory query cần index.\n' +
                        '  Index gợi ý: collection=inventory, field=unpaid (ASC)\n' +
                        '  Fallback → derive từ allInventory recent (có thể thiếu nợ cũ > 500 records).'
                    );
                } else {
                    console.warn('[Phase 3.8C] _loadAllUnpaidInvDebts error:', _msg);
                }
                if (window.__inventoryStore) {
                    if (typeof window.__inventoryStore.markUnpaidDebtQueryFailed === 'function')
                        window.__inventoryStore.markUnpaidDebtQueryFailed(reason);
                    const _fb = (window.__store && window.__store.inventory) || window.allInventory || [];
                    if (typeof window.__inventoryStore.deriveAndSetFinanceInventoryDebts === 'function')
                        window.__inventoryStore.deriveAndSetFinanceInventoryDebts(_fb, 'unpaid-query-fallback');
                    if (typeof window.__inventoryStore.rebuildInventoryDebtIndex === 'function')
                        window.__inventoryStore.rebuildInventoryDebtIndex('unpaid-query-fallback');
                }
            }
        };

        const _invCb = (snap) => {
            if (window.markListenerSnapshot) window.markListenerSnapshot(_invKey);
            const _invSnap = snap.docs.map(d => ({id: d.id, ...d.data()}));
            // Phase 4.0B-4E: Guard — không overwrite legacy-root data bằng primary rỗng
            const _invEmpty    = _invSnap.length === 0;
            const _storeHasInv = window.__store && Array.isArray(window.__store.inventory) && window.__store.inventory.length > 0;
            if (window.__store && window.__store.activeDataSource === 'legacy-root' && _invEmpty && _storeHasInv) {
                console.warn('[DataSourceLock] Skip primary empty overwrite (inventory) — legacy-root active');
                return;
            }
            allInventory = _invSnap;
            // Phase 4.0B-4D: update inventory hydration metrics
            _updateHydrationMetrics({
                inventorySnapshotCount: (window.__dataHydrationMetrics.inventorySnapshotCount || 0) + 1,
                inventoryDocCount:      allInventory.length,
                lastReason:             'inventory-snapshot'
            });
            if (typeof window.recordReadMetric === 'function') window.recordReadMetric('inventory', allInventory.length, 'inventory-listener'); // [4J-8]
            // Phase 4.0B-4J-8A: Mark dataHydrated nếu chưa mark từ profiles listener
            if (!(window.__loginPerfMetrics || {}).dataHydratedAt && typeof markLoginPerf === 'function') markLoginPerf('dataHydrated');
            // [Phase 3.8A] Sync allInventory vào window.__store.inventory + inventoryStore
            // render.js _inventory() sẽ đọc window.__store.inventory trước window.allInventory.
            if (window.__store) window.__store.inventory = allInventory;
            if (window.__inventoryStore && typeof window.__inventoryStore.setAllInventory === 'function') {
                window.__inventoryStore.setAllInventory(allInventory, 'inventory-snapshot');
            }
            // [Phase 3.8B] Derive công nợ kho đồ + rebuild index một lần sau snapshot.
            // KHÔNG gọi trong vòng render — chỉ gọi ở đây (sau snapshot).
            // Pattern đúng: snapshot → derive → index → render dùng getInventoryDebtsForStudent()
            if (window.__inventoryStore) {
                if (typeof window.__inventoryStore.deriveAndSetFinanceInventoryDebts === 'function') {
                    window.__inventoryStore.deriveAndSetFinanceInventoryDebts(allInventory, 'inventory-snapshot');
                }
                if (typeof window.__inventoryStore.rebuildInventoryDebtIndex === 'function') {
                    window.__inventoryStore.rebuildInventoryDebtIndex('inventory-snapshot');
                }
            }
            if (window.invalidateInventory) {
                window.invalidateInventory('inventory-snapshot');
                window.invalidateFinance('inventory-affect-finance');
                window.invalidateDashboard('inventory-snapshot');
            } else {
                scheduleRender();
            }
            // [Phase 3.8C] Sau snapshot đầu: query riêng lấy TẤT CẢ unpaid inventory debts.
            // Không phụ thuộc limit(500) — nợ kho cũ ngoài 500 records vẫn được load.
            if (!_unpaidDebtQueryDone && !_unpaidDebtQueryLoading) {
                setTimeout(() => _loadAllUnpaidInvDebts('first-inventory-snapshot'), 50);
            }
        };
        if (window.safeRegisterSnapshot) {
            window.safeRegisterSnapshot(_invKey, () => onSnapshot(_invQuery, _invCb),
                { owner: 'inventory', scope: 'global', clubId: clubId, reason: 'init-inventory' });
        } else {
            const _u_inv = onSnapshot(_invQuery, _invCb);
            activeListeners.push(_u_inv);
            if (window.registerListener) window.registerListener(_invKey, _u_inv, { owner: 'inventory', scope: 'global', reason: 'init-inventory' });
        }

        const lMonth = document.getElementById('filterMonth').value;
        window.listenToData(lMonth); loadLogoForReceipt();

        // ── Khởi động hệ thống thông báo báo cáo HLV (Admin only) ──────────
        // setupNotifListener dùng onSnapshot nên cập nhật real-time khi HLV gửi báo cáo
        // checkAdminNotifications dùng getDocs — fallback kiểm tra 1 lần khi vừa login
        if (window.userRole === 'admin' || window.userRole === 'super_admin') {
            setTimeout(() => {
                if (typeof window.setupNotifListener === 'function')   window.setupNotifListener();
                if (typeof window.checkAdminNotifications === 'function') window.checkAdminNotifications();
            }, 1200);
        }
    }



    // ═══════════════════════════════════════════════════════════════
    //  SUPER ADMIN: NÂNG CẤP SỐ CƠ SỞ HOẠT ĐỘNG CỦA CLB
    // ═══════════════════════════════════════════════════════════════
    let _buSelectedCount = 1;

    window.selectBranchCard = async function(n) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.selectBranchCard) return window.SuperAdminModule.selectBranchCard(n);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('selectBranchCard');
            if (loaded && window.SuperAdminModule?.selectBranchCard) return window.SuperAdminModule.selectBranchCard(n);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] selectBranchCard: module not loaded');
    };

    window.openBranchUpgradeModal = async function(clubId, clubName) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.openBranchUpgradeModal) return window.SuperAdminModule.openBranchUpgradeModal(clubId, clubName);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('openBranchUpgradeModal');
            if (loaded && window.SuperAdminModule?.openBranchUpgradeModal) return window.SuperAdminModule.openBranchUpgradeModal(clubId, clubName);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] openBranchUpgradeModal: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    window.saveBranchUpgrade = async function() {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.saveBranchUpgrade) return window.SuperAdminModule.saveBranchUpgrade();
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('saveBranchUpgrade');
            if (loaded && window.SuperAdminModule?.saveBranchUpgrade) return window.SuperAdminModule.saveBranchUpgrade();
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] saveBranchUpgrade: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    // ═══════════════════════════════════════════════════════════════
    //  ĐỔI MẬT KHẨU (CLB Admin tự đổi mật khẩu của mình)
    // ═══════════════════════════════════════════════════════════════
    window.openChangePasswordModal = () => {
        ['cp_current','cp_new','cp_confirm'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
        const errEl = document.getElementById('cp_error'); if(errEl) errEl.style.display = 'none';
        document.getElementById('changePasswordModal').style.display = 'flex';
        setTimeout(() => { const el = document.getElementById('cp_current'); if(el) el.focus(); }, 100);
    };

    window.submitChangePassword = async () => {
        const currentPw = (document.getElementById('cp_current')?.value || '').trim();
        const newPw = (document.getElementById('cp_new')?.value || '').trim();
        const confirmPw = (document.getElementById('cp_confirm')?.value || '').trim();
        const errEl = document.getElementById('cp_error');
        const btnEl = document.getElementById('cp_submitBtn');
        const showErr = (msg) => { errEl.innerText = msg; errEl.style.display = 'block'; };
        if (!currentPw) return showErr('Vui lòng nhập mật khẩu hiện tại!');
        if (newPw.length < 6) return showErr('Mật khẩu mới phải có ít nhất 6 ký tự!');
        if (newPw !== confirmPw) return showErr('Mật khẩu mới và xác nhận không khớp!');
        if (newPw === currentPw) return showErr('Mật khẩu mới phải khác mật khẩu hiện tại!');
        errEl.style.display = 'none';
        btnEl.innerHTML = '⏳ Đang xử lý...'; btnEl.disabled = true;
        try {
            const user = auth.currentUser;
            if (!user) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!');
            const credential = EmailAuthProvider.credential(user.email, currentPw);
            await reauthenticateWithCredential(user, credential);
            // Bước 1: Đổi mật khẩu trên Firebase Auth
            await updatePassword(user, newPw);
            // Bước 2: Đồng bộ mật khẩu mới vào Firestore clubs/{clubId}
            // để SuperAdmin luôn thấy mật khẩu mới nhất
            // [SỬA ĐỒNG BỘ] Đồng bộ mật khẩu mới lên Firestore để SuperAdmin thấy mật khẩu mới nhất
            if (currentClubId) {
                try {
                    await updateDoc(doc(db, 'clubs', currentClubId), {
                        adminPassword: newPw,
                        passwordChangedAt: new Date().toISOString(),
                    });
                } catch (_syncErr) {
                    // Không chặn flow đổi mật khẩu, nhưng thông báo nếu đồng bộ thất bại
                    console.warn('[Sync] Không thể đồng bộ mật khẩu lên hệ thống:', _syncErr.message);
                    window.showToast('⚠️ Mật khẩu đã đổi thành công, nhưng chưa đồng bộ được lên SuperAdmin. Vui lòng liên hệ quản trị viên nếu cần.', 5000);
                }
            }
            document.getElementById('changePasswordModal').style.display = 'none';
            window.showToast('✅ Đổi mật khẩu thành công! Vui lòng dùng mật khẩu mới cho lần đăng nhập tiếp theo.');
        } catch(e) {
            let msg = 'Lỗi: ' + e.message;
            if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = '❌ Mật khẩu hiện tại không đúng! Vui lòng kiểm tra lại.';
            else if(e.code === 'auth/too-many-requests') msg = '❌ Quá nhiều lần thử. Vui lòng đợi vài phút rồi thử lại.';
            showErr(msg);
        } finally {
            btnEl.innerHTML = '✅ Xác Nhận Đổi Mật Khẩu'; btnEl.disabled = false;
        }
    };

    // ═══════════════════════════════════════════════════════════════
    //  SUPER ADMIN: GỬI EMAIL ĐẶT LẠI MẬT KHẨU CHO ADMIN CLB
    // ═══════════════════════════════════════════════════════════════
    window.saResetAdminPassword = async function(adminEmail, clubName) {
        // Phase 4.0B-1: fallback wrapper — see js/modules/superadmin.js
        if (window.SuperAdminModule?.saResetAdminPassword) return window.SuperAdminModule.saResetAdminPassword(adminEmail, clubName);
        if (window.ensureSuperAdminModule) {
            const loaded = await window.ensureSuperAdminModule('saResetAdminPassword');
            if (loaded && window.SuperAdminModule?.saResetAdminPassword) return window.SuperAdminModule.saResetAdminPassword(adminEmail, clubName);
        }
        if (window.__superAdminModuleMetrics) window.__superAdminModuleMetrics.legacyFallbackCalls++;
        console.warn('[SuperAdminFallback] saResetAdminPassword: module not loaded');
        if (window.showToast) window.showToast('Module SuperAdmin chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };

    // ═══════════════════════════════════════════════════════════════
    //  SUPER ADMIN: DOANH THU THỰC TẾ THEO THÁNG CỦA TỪNG CLB
    // ═══════════════════════════════════════════════════════════════
    window.loadSARevenue = async () => {
        const monthEl = document.getElementById('sa_revenue_month');
        const selMonth = monthEl ? monthEl.value : '';
        if (!selMonth) return alert('Vui lòng chọn tháng để xem doanh thu!');
        const contentEl = document.getElementById('saRevenueContent');
        contentEl.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;"><div style="font-size:1.5rem;margin-bottom:6px;">⏳</div><div style="font-size:0.82rem;font-weight:700;">Đang tải dữ liệu doanh thu...</div></div>';
        try {
            const clubsSnap = await getDocs(query(collection(db, "clubs"), limit(200))); // [3.3E] SuperAdmin clubs list — bounded at 200
            const clubDocs = []; clubsSnap.forEach(d => clubDocs.push(d));
            const [y, m] = selMonth.split('-').map(Number);
            const startDate = selMonth + '-01';
            const lastDay = new Date(y, m, 0).getDate();
            const endDate = selMonth + '-' + String(lastDay).padStart(2,'0');
            const EXPENSE_TYPES = ['Chi phí','Chi phí kỳ thi','Chi Võ phục','Tặng Võ phục'];
            // Phase 4J-9: Thay Promise.all toàn bộ + hard-cap cứng bằng:
            // - Sequential batches 3 CLBs/lần để tránh spike reads (20+ CLBs song song).
            // - Ưu tiên A: đọc stats doc (O(1)) nếu đã có aggregate.
            // - Fallback B: fetchQueryPages paginated (không giới hạn cứng).
            const revenueList = [];
            const _SA_CONCURRENCY = 3;
            for (let _si = 0; _si < clubDocs.length; _si += _SA_CONCURRENCY) {
                const _batchClubs = clubDocs.slice(_si, _si + _SA_CONCURRENCY);
                const _batchResults = await Promise.all(_batchClubs.map(async (docSnap) => {
                    const cid   = docSnap.id;
                    const cdata = docSnap.data();
                    const cname = cdata.clubName || cid;
                    try {
                        // Ưu tiên A: stats doc (O(1)) — tránh scan tx hoàn toàn
                        const _statsDocRef = doc(db, "clubs", cid, "stats", selMonth.replace('-', '_'));
                        let _statsSnap = null;
                        try { _statsSnap = await getDoc(_statsDocRef); } catch(_) { /* fallback */ }
                        if (_statsSnap && _statsSnap.exists()) {
                            const _sd = _statsSnap.data();
                            // [Phase 4K-FIX Lỗi 1] _readStatsIncomeTotal — đọc tương thích nhiều format stats:
                            //   income.total nested (ghi bởi Cloud Functions FieldValue.increment),
                            //   'income.total' flat key, totalIncome, totalRevenue, revenue
                            const _tot = (
                                Number(_sd?.income?.total)     ||
                                Number(_sd?.['income.total'])  ||
                                Number(_sd?.totalIncome)       ||
                                Number(_sd?.totalRevenue)      ||
                                Number(_sd?.revenue)           ||
                                0
                            );
                            const _hasTxCount = (_sd.txCount || 0) > 0;
                            if (_tot > 0 || _hasTxCount) {
                                // stats doc có dữ liệu hợp lệ — không fallback sang scan tx
                                if (_tot === 0 && _hasTxCount) {
                                    // CLB có GD nhưng toàn chi phí (totalRevenue = 0 là đúng)
                                    console.warn('[Phase 4K-FIX] CLB ' + cid + ': stats doc có txCount=' + _sd.txCount + ' nhưng income = 0 — có thể toàn chi phí');
                                }
                                return { cid, cname, total: _tot, txCount: _sd.txCount || 0, source: 'stats' };
                            }
                            // stats doc tồn tại nhưng không đọc được doanh thu và txCount = 0
                            console.warn('[Phase 4K-FIX] Stats doc tồn tại cho CLB ' + cid + ' nhưng không đọc được income — fallback sang tx scan');
                        }
                        // Fallback B: paginated tx scan (không giới hạn cứng — fetchQueryPages)
                        const _txColRef = collection(db, "clubs", cid, "transactions");
                        const _allTxDocs = await fetchQueryPages(
                            ({ cursor, pageSize }) => {
                                const _c = [where("date", ">=", startDate), where("date", "<=", endDate), orderBy("date"), limit(pageSize)];
                                if (cursor) _c.splice(-1, 0, startAfter(cursor));
                                return query(_txColRef, ..._c);
                            },
                            { pageSize: 400, reason: 'sa-revenue-' + cid, domain: 'transactions' }
                        );
                        let total = 0;
                        _allTxDocs.forEach(tx => {
                            const t = tx.data();
                            if (!EXPENSE_TYPES.includes(t.type)) {
                                // [SỬA ĐỒNG BỘ] Phân tích số tiền linh hoạt
                                const _rawAmt = t.amount;
                                let _amt = 0;
                                if (typeof _rawAmt === 'number') { _amt = _rawAmt; }
                                else if (_rawAmt) { _amt = parseInt(String(_rawAmt).replace(/[^\d]/g, ''), 10) || 0; }
                                total += _amt;
                            }
                        });
                        return { cid, cname, total, txCount: _allTxDocs.length, source: 'tx-scan' };
                    } catch(e) { return { cid, cname, total: 0, txCount: 0, source: 'error' }; }
                }));
                revenueList.push(..._batchResults);
            }
            revenueList.sort((a, b) => b.total - a.total);
            const grandTotal = revenueList.reduce((s, r) => s + r.total, 0);
            const maxRev = Math.max(...revenueList.map(r => r.total), 1);
            const monthLabel = 'Tháng ' + m + '/' + y;
            let rowsHtml = revenueList.map((r, i) => {
                const pct = Math.round((r.total / maxRev) * 100);
                const color = r.total > 0 ? (pct === 100 ? '#16a34a' : pct > 50 ? '#059669' : '#34d399') : '#cbd5e1';
                const rank = i === 0 && r.total > 0 ? '🥇' : i === 1 && r.total > 0 ? '🥈' : i === 2 && r.total > 0 ? '🥉' : (i+1) + '.';
                return '<div style="display:grid;grid-template-columns:32px 1fr 140px;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">'
                    + '<div style="font-size:0.78rem;font-weight:800;color:#94a3b8;text-align:center;">' + rank + '</div>'
                    + '<div>'
                    + '<div style="font-size:0.85rem;font-weight:800;color:#1e293b;">' + r.cname + '</div>'
                    + '<div style="background:#e2e8f0;border-radius:99px;height:5px;margin-top:4px;overflow:hidden;"><div style="background:' + color + ';height:100%;width:' + pct + '%;border-radius:99px;"></div></div>'
                    + '<div style="font-size:0.6rem;color:#94a3b8;margin-top:2px;font-family:monospace;">' + r.cid + ' · ' + r.txCount + ' giao dịch</div>'
                    + '</div>'
                    + '<div style="text-align:right;">'
                    // [SỬA ĐỒNG BỘ] Hiển thị "0" (màu vàng) thay vì "—" khi có giao dịch nhưng doanh thu = 0
                    // Giúp SuperAdmin phân biệt "không có dữ liệu" (—) với "có GD nhưng đều là chi phí" (0)
                    + '<div style="font-size:0.9rem;font-weight:900;color:' + (r.total > 0 ? '#16a34a' : r.txCount > 0 ? '#f59e0b' : '#94a3b8') + ';">' + (r.total > 0 ? '+' + r.total.toLocaleString() : r.txCount > 0 ? '0' : '—') + '</div>'
                    + '<div style="font-size:0.65rem;color:#94a3b8;">₫</div>'
                    + '</div></div>';
            }).join('');
            contentEl.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:6px;">'
                + '<div style="font-size:0.78rem;font-weight:700;color:#475569;">' + monthLabel + ' — ' + revenueList.length + ' CLB</div>'
                + '<div style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:10px;padding:5px 14px;font-size:0.88rem;font-weight:900;color:#166534;">Tổng: ' + grandTotal.toLocaleString() + ' ₫</div>'
                + '</div>'
                + '<div>' + rowsHtml + '</div>'
                + '<p style="font-size:0.65rem;color:#cbd5e1;text-align:center;margin-top:10px;font-style:italic;">* Chỉ tính các giao dịch THU trong ' + monthLabel + '</p>';
        } catch(e) {
            contentEl.innerHTML = '<div style="color:#ef4444;font-size:0.82rem;font-weight:700;padding:12px;text-align:center;">❌ Lỗi tải dữ liệu: ' + e.message + '</div>';
        }
    };

    // ═══ PARENT PORTAL — Login Tab Logic ════════════════════════════════
    window.switchLoginTab = (tab) => {
        const isAdmin = tab === 'admin';
        // [THÊM] Xóa lỗi đăng nhập cũ khi đổi tab
        window._clearLoginError && window._clearLoginError();
        const ap = document.getElementById('loginPane_admin');
        const pp = document.getElementById('loginPane_parent');
        const ta = document.getElementById('loginTab_admin');
        const tp = document.getElementById('loginTab_parent');
        const card = document.querySelector('#loginOverlay .login-card');
        if (ap) ap.style.display = isAdmin ? 'block' : 'none';
        if (pp) pp.style.display = isAdmin ? 'none' : 'flex';
        if (pp) pp.style.flexDirection = 'column';
        // Expand card when parent tab active
        if (card) { isAdmin ? card.classList.remove('pp-wide') : card.classList.add('pp-wide'); }
        if (ta) ta.className = `flex-1 py-3 text-[0.78rem] font-bold transition-all border-b-2 ${isAdmin ? 'text-primary border-primary bg-white' : 'text-slate-400 border-transparent hover:text-slate-600'}`;
        if (tp) tp.className = `flex-1 py-3 text-[0.78rem] font-bold transition-all border-b-2 ${!isAdmin ? 'text-orange-600 border-orange-500 bg-white' : 'text-slate-400 border-transparent hover:text-slate-600'}`;
        // [THÊM] Auto-focus ô email khi chuyển về tab admin
        if (isAdmin) setTimeout(() => { const _ei = document.getElementById('emailInput'); if(_ei) _ei.focus(); }, 80);
    };

    window.copyParentCode = () => {
        const code = (document.getElementById('cfg_parentCode').value || '').trim().toUpperCase();
        if (!code) return window.showToast('⚠️ Chưa có mã. Hãy nhập và lưu trước.');
        navigator.clipboard.writeText(code).then(() => window.showToast(`✅ Đã copy mã CLB: ${code}`));
    };

    function _ppAddM(ym, n) {
        let [y,m] = ym.split('-').map(Number); m += n;
        while(m > 12){m -= 12; y++;} while(m < 1){m += 12; y--;}
        return `${y}-${String(m).padStart(2,'0')}`;
    }
    function _ppClean(s) { return s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D') : ''; }

    // ═══ PAYMENT TRANSFER SHEET ══════════════════════════════════════════
    window._ppTransferData = null;

    window.ppOpenTransferSheet = function() {
        const d = window._ppTransferData;
        if (!d) return;
        const existing = document.getElementById('ppPaySheet');
        if (existing) existing.remove();

        const _isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

        // Bank list with VietQR BINs + deep links + store links
        const _banks = [
            { n:'Vietcombank', s:'VCB',  bin:'970436', c:'#006c35', sc:'vietcombank', pkg:'com.VCB',                        ios:'895961699',  dl:true  },
            { n:'BIDV',        s:'BIDV', bin:'970418', c:'#002060', sc:'bidv',         pkg:'com.bidv.smartbanking',          ios:'839817922',  dl:true  },
            { n:'Techcombank', s:'TCB',  bin:'970407', c:'#e31837', sc:'techcombank',  pkg:'vn.techcombank.mobile',          ios:'1090449508', dl:true  },
            { n:'MB Bank',     s:'MB',   c:'#003087',  bin:'970422', sc:'mbmobile',    pkg:'com.mbmobile',                   ios:'671882567',  dl:true  },
            { n:'VietinBank',  s:'CTG',  bin:'970415', c:'#001c6c', sc:'vietinbank',   pkg:'com.vietinbank.imobilev2',       ios:'938057985',  dl:false },
            { n:'Agribank',    s:'AGB',  bin:'970405', c:'#007a33', sc:'agribank',     pkg:'vn.agribank.mobilebanking',      ios:'1028248820', dl:false },
            { n:'VPBank',      s:'VPB',  bin:'970432', c:'#00a651', sc:'vpbank',       pkg:'com.vpbank.vpbankmobile',        ios:'940344289',  dl:true  },
            { n:'TPBank',      s:'TPB',  bin:'970423', c:'#5a2281', sc:'tpbank',       pkg:'vn.tpb.mobilebanking',           ios:'1281082726', dl:true  },
            { n:'ACB',         s:'ACB',  bin:'970416', c:'#0066b3', sc:'acb',          pkg:'com.acb.mobile',                 ios:'906774980',  dl:true  },
            { n:'VIB',         s:'VIB',  bin:'970441', c:'#d0021b', sc:'vib',          pkg:'com.vib.mobile',                 ios:'1198940963', dl:true  },
            { n:'HDBank',      s:'HDB',  bin:'970437', c:'#003da5', sc:'hdbank',       pkg:'vn.hdbank.mobilebanking',        ios:'884122768',  dl:true  },
            { n:'Sacombank',   s:'STB',  bin:'970403', c:'#0050a0', sc:'sacombank',    pkg:'vn.com.sacombank.mobilebanking', ios:'1085226588', dl:false },
        ];

        // Default selected = CLB's bank (match BIN if possible, else first)
        let _selIdx = _banks.findIndex(b => b.bin === d.bankId || b.s.toUpperCase() === (d.bankId||'').toUpperCase());
        if (_selIdx < 0) _selIdx = 0;
        window._ppBankList = _banks;
        window._ppIsIOS = _isIOS;
        window._ppSelIdx = _selIdx;

        const _buildQrUrl = (idx) => {
            const b = _banks[idx];
            return `https://img.vietqr.io/image/${b.bin}-${d.accountNo}-qr_only.png?amount=${d.amount}&addInfo=${encodeURIComponent(d.addInfo)}`;
        };

        const _buildGrid = (selIdx) => _banks.map((b, i) => `
            <button id="ppBankBtn${i}" onclick="window.ppSelectBank(${i})"
                style="display:flex;flex-direction:column;align-items:center;gap:4px;border-radius:12px;padding:8px 4px;cursor:pointer;transition:all 0.15s;border:1.5px solid ${i===selIdx?'rgba(99,102,241,0.7)':'rgba(255,255,255,0.08)'};background:${i===selIdx?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.04)'};min-width:0;flex:1 1 0;">
                <div style="width:36px;height:36px;background:${b.c};border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;font-weight:900;letter-spacing:-0.3px;${i===selIdx?'box-shadow:0 0 0 2px rgba(99,102,241,0.6),0 0 0 4px rgba(0,0,0,0.5);':''}">${b.s}</div>
                <span style="font-size:0.55rem;font-weight:700;color:${i===selIdx?'#a5b4fc':'#94a3b8'};text-align:center;line-height:1.2;word-break:break-word;">${b.n}</span>
            </button>`
        ).join('');

        const overlay = document.createElement('div');
        overlay.id = 'ppPaySheet';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(5,7,10,0.85);z-index:20000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(10px);';

        const amountFmt = Number(d.amount).toLocaleString('vi-VN');
        const initQrUrl = _buildQrUrl(_selIdx);

        overlay.innerHTML = `
        <style>
            @keyframes ppSlideUp { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
            @keyframes ppFadeIn  { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
            #ppPaySheetInner { animation: ppSlideUp 0.35s cubic-bezier(0.16,1,0.3,1); }
            .pp-bank-btn:hover { opacity:0.85; }
            .pp-copy-btn:active { transform:scale(0.96); }
            @media (min-width:640px) {
                #ppPaySheetInner { border-radius:24px !important; max-height:88vh !important; max-width:640px; }
            }
        </style>
        <div id="ppPaySheetInner" style="background:linear-gradient(180deg,#0d1117 0%,#0a0f1a 100%);width:100%;max-width:640px;border-radius:24px 24px 0 0;padding:0;max-height:92vh;overflow-y:auto;position:relative;border:1px solid rgba(255,255,255,0.07);box-shadow:0 -20px 60px rgba(0,0,0,0.6);">

            <!-- Atmospheric glow -->
            <div style="pointer-events:none;position:absolute;top:-60px;left:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(99,102,241,0.2),transparent 70%);border-radius:50%;"></div>
            <div style="pointer-events:none;position:absolute;bottom:-40px;right:-40px;width:180px;height:180px;background:radial-gradient(circle,rgba(16,185,129,0.1),transparent 70%);border-radius:50%;"></div>

            <!-- Handle bar -->
            <div style="display:flex;justify-content:center;padding:14px 0 0;">
                <div style="width:38px;height:5px;background:rgba(255,255,255,0.12);border-radius:99px;"></div>
            </div>

            <!-- Header -->
            <div style="padding:12px 18px 0;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(99,102,241,0.35);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2"/><path d="M3 11h3c.8 0 1.6.3 2.1.9l1.1 1.2c.4.4 1 .6 1.6.6h4.6c.6 0 1.1-.2 1.6-.6l1.1-1.2c.5-.6 1.3-.9 2.1-.9h3"/></svg>
                    </div>
                    <div>
                        <div style="font-size:0.9rem;font-weight:900;color:white;line-height:1.1;">SmartPay Edu</div>
                        <div style="font-size:0.6rem;color:#6366f1;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Thanh Toán Học Phí</div>
                    </div>
                </div>
                <button onclick="document.getElementById('ppPaySheet').remove()"
                    style="width:32px;height:32px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:1rem;line-height:1;transition:all 0.15s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.07)'">✕</button>
            </div>

            <!-- Student + Amount card -->
            <div style="margin:14px 18px 0;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
                <div style="min-width:0;">
                    <div style="font-size:0.6rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Học sinh</div>
                    <div style="font-size:0.98rem;font-weight:900;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.studentName || '—'}</div>
                    <div style="font-size:0.72rem;color:#64748b;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.clubName || ''}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.6rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Số tiền</div>
                    <div style="font-size:1.2rem;font-weight:900;color:#818cf8;">${amountFmt}<span style="font-size:0.7rem;color:#64748b;font-weight:600;"> ₫</span></div>
                    ${d.owedCount > 0 ? `<div style="font-size:0.6rem;color:#f87171;margin-top:2px;font-weight:700;">${d.owedCount} tháng chưa đóng</div>` : ''}
                </div>
            </div>

            <!-- QR Code section -->
            <div style="margin:14px 18px 0;background:white;border-radius:20px;padding:18px;display:flex;flex-direction:column;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,0.4);position:relative;overflow:hidden;">
                <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(238,242,255,0.5),transparent);pointer-events:none;"></div>
                <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;">
                    <div id="ppQrWrap" style="position:relative;width:190px;height:190px;margin-bottom:10px;">
                        <div id="ppQrLoader" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;border-radius:12px;border:3px solid #e2e8f0;">
                            <div style="width:28px;height:28px;border:3px solid #dbeafe;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
                            <div style="font-size:0.65rem;color:#94a3b8;font-weight:600;margin-top:6px;">Đang tải QR…</div>
                        </div>
                        <img id="ppSheetQR" src="${initQrUrl}" crossorigin="anonymous"
                            style="width:190px;height:190px;border-radius:12px;border:3px solid #e2e8f0;object-fit:cover;display:block;opacity:0;transition:opacity 0.3s;"
                            onload="this.style.opacity='1';document.getElementById('ppQrLoader').style.display='none';"
                            onerror="document.getElementById('ppQrLoader').innerHTML='<div style=\'font-size:0.75rem;color:#dc2626;font-weight:700;text-align:center;padding:8px;\'>❌ Không tải được QR</div>';" />
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;background:#f1f5f9;border-radius:99px;padding:5px 12px;margin-bottom:5px;">
                        <div style="width:7px;height:7px;background:#10b981;border-radius:50%;animation:pulse 1.5s ease-in-out infinite;box-shadow:0 0 0 0 rgba(16,185,129,0.4);"></div>
                        <span id="ppQrBankLabel" style="font-size:0.65rem;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.1em;">Chuyển vào ${_banks[_selIdx].s}</span>
                    </div>
                    <p style="font-size:0.6rem;color:#94a3b8;font-style:italic;margin:0;">Mở app → thông tin CK tự điền, hoặc quét QR thủ công</p>
                </div>
            </div>

            <!-- Bank selection grid -->
            <div style="margin:14px 18px 0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:12px 14px;">
                <div style="font-size:0.6rem;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Chọn ngân hàng để cập nhật QR & mở app nhanh</div>
                <div id="ppBankGrid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;">
                    ${_buildGrid(_selIdx)}
                </div>
            </div>

            <!-- Open App button -->
            <div style="margin:12px 18px 0;">
                <button id="ppOpenAppBtn" onclick="window.ppTryBank(window._ppSelIdx)"
                    style="width:100%;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;font-weight:900;font-size:0.88rem;padding:14px 10px;border-radius:14px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 20px rgba(99,102,241,0.4);letter-spacing:0.02em;transition:all 0.2s;"
                    onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                    <span id="ppOpenAppLabel">MỞ APP ${_banks[_selIdx].s.toUpperCase()}</span>
                </button>
                <div id="ppBankOpenMsg" style="display:none;margin-top:8px;border-radius:10px;padding:9px 12px;font-size:0.72rem;font-weight:700;text-align:center;"></div>
            </div>

            <!-- E-wallets -->
            <div style="margin:12px 18px 0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:12px 14px;">
                <div style="font-size:0.6rem;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Ví điện tử</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                    <button onclick="window.ppOpenWallet('MOMO','MoMo')" class="pp-bank-btn"
                        style="background:#a50064;color:white;border:none;border-radius:12px;padding:10px 5px;font-size:0.68rem;font-weight:800;cursor:pointer;text-align:center;transition:all 0.2s;letter-spacing:0.02em;">
                        MỜ MOMO
                    </button>
                    <button onclick="window.ppOpenWallet('ZALOPAY','ZaloPay')" class="pp-bank-btn"
                        style="background:#0068ff;color:white;border:none;border-radius:12px;padding:10px 5px;font-size:0.68rem;font-weight:800;cursor:pointer;text-align:center;transition:all 0.2s;letter-spacing:0.02em;">
                        ZALOPAY
                    </button>
                    <button onclick="window.ppOpenWallet('VIETTELMONEY','Viettel Money')" class="pp-bank-btn"
                        style="background:#e30613;color:white;border:none;border-radius:12px;padding:10px 5px;font-size:0.68rem;font-weight:800;cursor:pointer;text-align:center;transition:all 0.2s;letter-spacing:0.02em;">
                        VIETTEL PAY
                    </button>
                </div>
            </div>

            <!-- Copy buttons -->
            <div style="margin:12px 18px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <button id="ppCopyStk" class="pp-copy-btn"
                    onclick="navigator.clipboard.writeText('${d.accountNo}').then(()=>{const e=document.getElementById('ppCopyStk');e.textContent='✅ Đã copy STK!';e.style.background='rgba(16,185,129,0.15)';e.style.borderColor='rgba(16,185,129,0.4)';e.style.color='#10b981';setTimeout(()=>{e.textContent='📋 Sao chép STK';e.style.background='rgba(255,255,255,0.04)';e.style.borderColor='rgba(255,255,255,0.1)';e.style.color='#94a3b8';},2000);})"
                    style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;font-size:0.72rem;font-weight:700;color:#94a3b8;cursor:pointer;transition:all 0.2s;">
                    📋 Sao chép STK
                </button>
                <button id="ppCopyNd" class="pp-copy-btn"
                    onclick="navigator.clipboard.writeText('${d.addInfo}').then(()=>{const e=document.getElementById('ppCopyNd');e.textContent='✅ Đã copy!';e.style.background='rgba(16,185,129,0.15)';e.style.borderColor='rgba(16,185,129,0.4)';e.style.color='#10b981';setTimeout(()=>{e.textContent='📋 Nội dung CK';e.style.background='rgba(255,255,255,0.04)';e.style.borderColor='rgba(255,255,255,0.1)';e.style.color='#94a3b8';},2000);})"
                    style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;font-size:0.72rem;font-weight:700;color:#94a3b8;cursor:pointer;transition:all 0.2s;">
                    📋 Nội dung CK
                </button>
            </div>

            <!-- Footer info -->
            <div style="margin:12px 18px 0;padding:10px 14px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.2);border-radius:12px;display:flex;align-items:flex-start;gap:8px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                <p style="font-size:0.65rem;color:#818cf8;line-height:1.5;margin:0;">
                    Hệ thống tích hợp <strong>VietQR 2.0</strong>. Nhấn <strong>Mở App</strong> để chuyển khoản — thông tin số tiền và nội dung được điền sẵn vào app ngân hàng, không cần quét QR.
                </p>
            </div>

            <!-- Security footer -->
            <div style="margin:12px 18px calc(18px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:center;gap:6px;opacity:0.5;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style="font-size:0.6rem;color:#64748b;font-weight:600;">An toàn theo tiêu chuẩn PCI DSS · SmartPay Edu</span>
            </div>
        </div>`;

        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    };

    window.ppSelectBank = function(idx) {
        const _banks = window._ppBankList;
        const d = window._ppTransferData;
        if (!_banks || !d) return;
        window._ppSelIdx = idx;

        // Update QR image
        const b = _banks[idx];
        const newQrUrl = `https://img.vietqr.io/image/${b.bin}-${d.accountNo}-qr_only.png?amount=${d.amount}&addInfo=${encodeURIComponent(d.addInfo)}`;
        const qrEl = document.getElementById('ppSheetQR');
        const loaderEl = document.getElementById('ppQrLoader');
        if (qrEl && loaderEl) {
            qrEl.style.opacity = '0';
            loaderEl.style.display = 'flex';
            loaderEl.innerHTML = '<div style="width:24px;height:24px;border:2.5px solid #dbeafe;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div>';
            qrEl.onload = () => { qrEl.style.opacity = '1'; loaderEl.style.display = 'none'; };
            qrEl.src = newQrUrl;
        }

        // Update label
        const lbl = document.getElementById('ppQrBankLabel');
        if (lbl) lbl.textContent = `Chuyển vào ${b.s}`;

        // Update open app button
        const btn = document.getElementById('ppOpenAppLabel');
        if (btn) btn.textContent = `MỞ APP ${b.s.toUpperCase()}`;

        // Update grid highlight
        const grid = document.getElementById('ppBankGrid');
        if (grid) {
            _banks.forEach((bk, i) => {
                const el = document.getElementById(`ppBankBtn${i}`);
                if (!el) return;
                const isSelected = (i === idx);
                el.style.border = `1.5px solid ${isSelected ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.08)'}`;
                el.style.background = isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)';
                const dot = el.querySelector('div');
                if (dot) dot.style.boxShadow = isSelected ? '0 0 0 2px rgba(99,102,241,0.6),0 0 0 4px rgba(0,0,0,0.5)' : '';
                const span = el.querySelector('span');
                if (span) span.style.color = isSelected ? '#a5b4fc' : '#94a3b8';
            });
        }

        // Clear any previous open message
        const msgEl = document.getElementById('ppBankOpenMsg');
        if (msgEl) msgEl.style.display = 'none';
    };

    window.ppOpenWallet = function(walletId, name) {
        const d = window._ppTransferData;
        if (!d) return;
        const msgEl = document.getElementById('ppBankOpenMsg');

        // Use VietQR deep link for wallets that support it (MoMo, ZaloPay are on VietQR network)
        const vietQrParams = new URLSearchParams({
            app: walletId,
            ba:  d.accountNo,
            am:  String(d.amount),
            tn:  d.addInfo,
        });
        const deepLinkUrl = 'https://dl.vietqr.io/pay?' + vietQrParams.toString();

        if (msgEl) {
            msgEl.style.display = 'block';
            msgEl.style.background = 'rgba(99,102,241,0.15)';
            msgEl.style.border = '1px solid rgba(99,102,241,0.3)';
            msgEl.style.color = '#a5b4fc';
            // SECURITY TODO: name (tên ngân hàng) đến từ config Firestore — cần escapeHtml. Phase 4.1.
            const _escName = window.escapeHtml || (s => s);
            msgEl.innerHTML = '&#128242; Đang mở <strong>' + _escName(name) + '</strong>… Thông tin chuyển khoản đã được điền sẵn.';
        }

        // Dùng location.href thay vì window.open để iOS Safari kích hoạt Universal Link đúng cách
        window.location.href = deepLinkUrl;
    };

    window.ppTryBank = function(idx) {
        const d = window._ppTransferData;
        const b = (window._ppBankList || [])[idx];
        if (!d || !b) return;
        const msgEl = document.getElementById('ppBankOpenMsg');
        const qrEl  = document.getElementById('ppSheetQR');

        // Flash QR to draw attention
        if (qrEl) {
            qrEl.style.outline = '3px solid rgba(99,102,241,0.8)';
            qrEl.style.outlineOffset = '2px';
            setTimeout(() => { qrEl.style.outline = 'none'; }, 2200);
        }

        if (qrEl) qrEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Check if this bank supports VietQR Universal Deep Link
        if (b.dl === false) {
            // Bank does NOT support deep link (Agribank, VietinBank, Sacombank)
            // Show QR scan instruction instead
            if (msgEl) {
                msgEl.style.display = 'block';
                msgEl.style.background = 'rgba(217,119,6,0.12)';
                msgEl.style.border = '1px solid rgba(217,119,6,0.35)';
                msgEl.style.color = '#fcd34d';
                msgEl.innerHTML =
                    '&#128247; <strong>' + b.n + '</strong> chưa hỗ trợ mở app tự động.<br>' +
                    '<span style="font-size:0.75rem;opacity:0.85;">Vui lòng mở app <strong>' + b.n + '</strong> thủ công → chọn <strong>Quét mã QR</strong> → quét mã phía trên để điền tự động.</span>';
            }
            return; // Do NOT open deep link for unsupported banks
        }

        // Build the VietQR Universal Deep Link — opens bank app with payment pre-filled
        // Format: https://dl.vietqr.io/pay?app=VCB&ba=xxx&am=xxx&tn=xxx
        const vietQrParams = new URLSearchParams({
            app: b.s,
            ba:  d.accountNo,
            am:  String(d.amount),
            tn:  d.addInfo,
        });
        const deepLinkUrl = 'https://dl.vietqr.io/pay?' + vietQrParams.toString();

        if (msgEl) {
            msgEl.style.display = 'block';
            msgEl.style.background = 'rgba(99,102,241,0.15)';
            msgEl.style.border = '1px solid rgba(99,102,241,0.3)';
            msgEl.style.color = '#a5b4fc';
            msgEl.innerHTML = '&#128242; Đang mở <strong>' + b.n + '</strong>… Nếu chưa thấy màn hình chuyển tiền, chọn <strong>Quét QR</strong> trong app rồi quét mã phía trên.';
        }

        // Open VietQR deep link — iOS/Android Universal Link, opens bank app directly
        // Dùng location.href để iOS Safari kích hoạt Universal Link → mở app với màn hình chuyển tiền
        window.location.href = deepLinkUrl;
    };
    // ════════════════════════════════════════════════════════════════════

    window.ppLookupLogin = async () => {
        const _code = (document.getElementById('pp_codeInput').value || '').trim().toUpperCase();
        const _name = (document.getElementById('pp_nameInputLogin').value || '').trim();
        const _resEl = document.getElementById('pp_loginResults');
        if (!_code || !_name) {
            _resEl.innerHTML = `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px;text-align:center;font-size:0.82rem;font-weight:700;color:#c2410c;">⚠️ Vui lòng nhập đầy đủ Mã CLB và tên võ sinh.</div>`;
            return;
        }
        _resEl.innerHTML = `<div style="text-align:center;padding:20px;color:#64748b;font-size:0.85rem;font-weight:600;">⏳ Đang tra cứu...</div>`;
        try {
            // FIX: Nếu HLV/admin đang đăng nhập, dùng db chính (đã có quyền truy cập đầy đủ).
            // Nếu không, dùng đăng nhập ẩn danh trên secondaryAuth.
            let _dbForParent;
            if (auth.currentUser && !auth.currentUser.isAnonymous) {
                // Admin đang đăng nhập — dùng luôn db chính, không cần anonymous auth
                _dbForParent = db;
            } else {
                // Chế độ phụ huynh — cần anonymous auth
                if (!secondaryAuth.currentUser || secondaryAuth.currentUser.isAnonymous === false) {
                    try {
                        await signInAnonymously(secondaryAuth);
                    } catch(_authErr) {
                        const _ec = _authErr && _authErr.code ? _authErr.code : '';
                        if (_ec === 'auth/operation-not-allowed') {
                            _resEl.innerHTML = `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:14px;padding:18px;">
                                <div style="font-size:1.1rem;margin-bottom:6px;">⚙️</div>
                                <div style="font-weight:900;color:#854d0e;font-size:0.92rem;margin-bottom:8px;">Cần bật "Đăng nhập ẩn danh" trong Firebase</div>
                                <div style="font-size:0.78rem;color:#713f12;line-height:1.7;text-align:left;">
                                    <b>Hướng dẫn (1 lần duy nhất):</b><br>
                                    1. Vào <a href="https://console.firebase.google.com/project/quanly-tst/authentication/providers" target="_blank" style="color:#0033A0;font-weight:700;text-decoration:underline;">Firebase Console → Authentication</a><br>
                                    2. Chọn <b>Sign-in method</b> → <b>Anonymous</b><br>
                                    3. Bật <b>Enable</b> → Lưu<br>
                                    4. Thử lại tại đây
                                </div>
                                <button onclick="window.ppLookupLogin()" style="margin-top:12px;background:#0033A0;color:white;border:none;border-radius:8px;padding:8px 20px;font-weight:700;font-size:0.82rem;cursor:pointer;width:100%;">🔄 Thử lại sau khi bật</button>
                            </div>`;
                            return;
                        }
                        // FIX: Với mọi lỗi auth khác, ném lỗi thay vì tiếp tục không có auth
                        throw _authErr;
                    }
                }
                _dbForParent = getFirestore(secondaryApp);
            }
            const _q = query(collection(_dbForParent, 'clubs'), where('parentCode', '==', _code));
            const _qSnap = await getDocs(query(_q, limit(50))); // [3.3E] parent code lookup — bounded
            if (_qSnap.empty) {
                _resEl.innerHTML = `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:16px;text-align:center;">
                    <div style="font-size:1.4rem;margin-bottom:6px;">❌</div>
                    <div style="font-weight:800;color:#dc2626;font-size:0.9rem;">Không tìm thấy mã "<strong>${_code}</strong>"</div>
                    <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">Vui lòng kiểm tra lại mã CLB.</div>
                </div>`;
                return;
            }
            // ── Phát hiện nhiều CLB dùng cùng mã — báo lỗi ngay ───────────
            if (_qSnap.docs.length > 1) {
                _resEl.innerHTML = `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:18px;text-align:center;">
                    <div style="font-size:1.4rem;margin-bottom:6px;">⚠️</div>
                    <div style="font-weight:900;color:#b45309;font-size:0.92rem;margin-bottom:6px;">Mã CLB bị trùng — không thể xác định CLB chính xác</div>
                    <div style="font-size:0.78rem;color:#78350f;line-height:1.7;">Có <strong>${_qSnap.docs.length} CLB</strong> đang dùng cùng mã <strong>"${_code}"</strong>.<br>Vui lòng liên hệ HLV để được cấp lại mã CLB duy nhất.</div>
                </div>`;
                return;
            }
            // ────────────────────────────────────────────────────────────────
            const _clubDoc = _qSnap.docs[0];
            const _clubId = _clubDoc.id;
            const _clubName = _clubDoc.data().clubName || 'CLB Taekwondo';

            const _cfgSnap = await getDoc(doc(_dbForParent, 'clubs', _clubId, 'settings', 'main_config'));
            const _cfg = _cfgSnap.exists() ? _cfgSnap.data() : {};

            // Hàm chuẩn hoá tiếng Việt: bỏ dấu + chuyển thường để so sánh
            const _normalizeVN = s => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/\s+/g,' ').trim() : '';
            const _normInput = _normalizeVN(_name);

            // Thử exact match trước (nhanh nhất)
            let _profSnap = await getDoc(doc(_dbForParent, 'clubs', _clubId, 'profiles', _name));
            let _actualName = _name;

            if (!_profSnap.exists()) {
                // Phase 4J-9B: Thay limit(500) scan bằng 3-tier server-side search.
                // Ưu tiên A: searchName prefix index (hồ sơ mới đã có field — không scan toàn bộ).
                // Fallback B: __name__ prefix (doc ID = tên võ sinh, hỗ trợ legacy).
                // Fallback C: fetchQueryPages paginated scan (không hard-cap 500, với guard anti-loop).
                let _foundDoc = null;
                const _profColRef = collection(_dbForParent, 'clubs', _clubId, 'profiles');

                // A: searchName index
                if (!_foundDoc && _normInput) {
                    try {
                        const _srSnap = await getDocs(query(_profColRef, orderBy('searchName'), startAt(_normInput), endAt(_normInput + '\uf8ff'), limit(5)));
                        _srSnap.forEach(d => { if (!_foundDoc) _foundDoc = d; });
                    } catch(_e) { /* index chưa build → fallback B */ }
                }
                // B: __name__ prefix (doc ID normalized match)
                if (!_foundDoc && _normInput) {
                    try {
                        const _idSnap = await getDocs(query(_profColRef, orderBy('__name__'), startAt(_normInput), endAt(_normInput + '\uf8ff'), limit(5)));
                        _idSnap.forEach(d => { if (!_foundDoc && _normalizeVN(d.id) === _normInput) _foundDoc = d; });
                    } catch(_e) {}
                }
                // C: paginated scan — không còn hard-cap 500
                if (!_foundDoc) {
                    if (typeof window.warnUnsafeLimit === 'function') window.warnUnsafeLimit('parentClub:profileScan:paginatedFallback', 'parent-club-profile-scan-paginated');
                    const _scanDocs = typeof fetchQueryPages === 'function'
                        ? await fetchQueryPages(
                            ({ cursor, pageSize }) => {
                                if (cursor) return query(_profColRef, startAfter(cursor), limit(pageSize));
                                return query(_profColRef, limit(pageSize));
                            },
                            { pageSize: 300, reason: 'parent-profile-scan', domain: 'profiles' })
                        : await getDocs(query(_profColRef, limit(500))).then(s => { const a = []; s.forEach(d => a.push(d)); return a; });
                    for (const _d of _scanDocs) {
                        if (_normalizeVN(_d.id) === _normInput) { _foundDoc = _d; break; }
                    }
                }
                if (_foundDoc) { _profSnap = _foundDoc; _actualName = _foundDoc.id; }
            }

            if (!_profSnap.exists()) {
                _resEl.innerHTML = `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:16px;text-align:center;">
                    <div style="font-size:1.4rem;margin-bottom:6px;">🔍</div>
                    <div style="font-weight:800;color:#dc2626;font-size:0.9rem;">Không tìm thấy "<strong>${_name}</strong>"</div>
                    <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">Tại ${_clubName}. Vui lòng kiểm tra lại chính tả hoặc nhập đầy đủ họ tên.</div>
                </div>`;
                return;
            }
            const _prof = _profSnap.data();
            const _name_display = _actualName;
            if (_prof.status === 'quit') {
                _resEl.innerHTML = `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center;color:#94a3b8;font-weight:700;font-size:0.88rem;">ℹ️ Võ sinh đã nghỉ tập.</div>`;
                return;
            }

            const _today = new Date();
            const _curM = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}`;
            const _skipped = _prof.skippedMonths || [];
            const _feeExempt = _prof.feeExempt || false;
            let _owedMonths = [];
            if (!_feeExempt) {
                let _from = _prof.paidUntil ? _ppAddM(_prof.paidUntil, 1)
                                            : (_prof.createdAt ? _prof.createdAt.substring(0,7) : _curM);
                let _c = _from;
                while (_c <= _curM) { if (!_skipped.includes(_c)) _owedMonths.push(_c); _c = _ppAddM(_c, 1); }
            }
            const _fee = Number(_prof.tuitionFee) || 0;
            const _total = _owedMonths.length * _fee;
            const _paidLabel = _prof.paidUntil ? _prof.paidUntil.split('-').reverse().join('/') : '—';

            // Phase 4.0B-4J-4: resolve effective bank account for student's branch (fixed)
            const _debtBranch = _prof.branch || _prof.branchName || _prof.location || _prof.facility || '';
            const _pa4j3r = (typeof getPaymentAccountForBranch === 'function')
                ? getPaymentAccountForBranch(_debtBranch, _cfg)
                : null;
            const _effBankId   = (_pa4j3r && _pa4j3r.bankId)      || _cfg.bankId      || '';
            const _effAccNo    = (_pa4j3r && _pa4j3r.accountNo)    || _cfg.accountNo   || '';
            const _effAccName  = (_pa4j3r && _pa4j3r.accountName)  || _cfg.accountName || '';

            let _qrHtml = '';
            if (_total > 0 && _effBankId && _effAccNo) {
                const _ms = _owedMonths.map(m => { const p = m.split('-'); return `T${parseInt(p[1])}-${p[0]}`; }).join(' ');
                const _addInfo = `${_ppClean(_actualName)} hoc phi ${_ms}`.substring(0, 48);
                const _qrUrl = `https://img.vietqr.io/image/${_effBankId}-${_effAccNo}-compact2.png?amount=${_total}&addInfo=${encodeURIComponent(_addInfo)}&accountName=${encodeURIComponent(_ppClean(_effAccName||''))}`;
                // Store data globally to avoid escaping issues in onclick
                window._ppTransferData = { bankId: _effBankId, accountNo: _effAccNo, amount: _total, addInfo: _addInfo, accountName: _effAccName || '', studentName: _name_display, clubName: _clubName, fee: _fee, owedCount: _owedMonths.length };
                _qrHtml = `<div style="margin-top:8px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;padding:12px 14px;">
                    <div style="font-size:0.6rem;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;text-align:center;">📱 Thanh toán chuyển khoản</div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
                        <img src="${_qrUrl}" crossorigin="anonymous"
                            style="width:min(220px,100%);height:auto;aspect-ratio:1/1;border-radius:10px;border:1px solid #cbd5e1;padding:4px;background:white;"
                            onerror="this.style.display='none'" />
                        <div style="font-size:0.78rem;color:#334155;line-height:1.9;text-align:center;width:100%;background:white;border-radius:8px;border:1px solid #e2e8f0;padding:8px 12px;">
                            <div><span style="color:#94a3b8;font-size:0.62rem;font-weight:700;text-transform:uppercase;">Ngân hàng: </span><strong>${_effBankId}</strong></div>
                            <div><span style="color:#94a3b8;font-size:0.62rem;font-weight:700;text-transform:uppercase;">Số TK: </span><strong>${_effAccNo}</strong></div>
                            ${_effAccName ? `<div><span style="color:#94a3b8;font-size:0.62rem;font-weight:700;text-transform:uppercase;">Tên TK: </span><strong style="word-break:break-word;">${_effAccName}</strong></div>` : ''}
                        </div>
                        <button onclick="window.ppOpenTransferSheet()"
                            style="width:100%;background:linear-gradient(135deg,#0033A0,#1e40af);color:white;font-weight:900;font-size:0.85rem;padding:12px 10px;border-radius:11px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(0,51,160,0.28);letter-spacing:0.02em;">
                            💳 Chuyển khoản ngay — không cần quét QR
                        </button>
                        <div style="font-size:0.6rem;color:#94a3b8;text-align:center;margin-top:-4px;">Hoặc quét mã QR bên trên nếu ứng dụng không tự điền</div>
                    </div>
                </div>`;
            }

            const _owedBadges = _owedMonths.map(m => { const p = m.split('-'); return `<span style="background:#fda4af;color:#881337;padding:2px 7px;border-radius:20px;font-size:0.68rem;font-weight:700;">T${parseInt(p[1])}/${p[0]}</span>`; }).join('');
            const _body = _feeExempt
                ? `<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:8px 12px;text-align:center;font-weight:800;color:#a16207;font-size:0.82rem;">🎟️ Được miễn học phí</div>`
                : _owedMonths.length === 0
                ? `<div style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;text-align:center;">
                       <div style="font-weight:800;color:#166534;font-size:0.88rem;">✅ Đã đóng học phí đầy đủ!</div>
                   </div>`
                : `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:8px 10px;">
                       <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                           <div style="font-size:0.6rem;font-weight:800;color:#be123c;text-transform:uppercase;letter-spacing:0.04em;">📋 Tháng còn nợ</div>
                           <div style="font-size:0.78rem;font-weight:900;color:#C8102E;">${_total.toLocaleString('vi-VN')} ₫ <span style="font-size:0.6rem;color:#9a3412;font-weight:600;">(${_owedMonths.length}T)</span></div>
                       </div>
                       <div style="display:flex;flex-wrap:wrap;gap:4px;">${_owedBadges}</div>
                   </div>
                   ${_qrHtml}`;

            const _logoHtml = _cfg.logoBase64
                ? `<img src="${_cfg.logoBase64}" style="width:36px;height:36px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.25);padding:2px;flex-shrink:0;" />`
                : `<div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">🥋</div>`;
            const _dobRaw = _prof.dob || _prof.birthDate || _prof.birthday || '';
            const _dobLabel = _dobRaw ? (() => {
                // accepts DD/MM/YYYY or YYYY-MM-DD
                if (_dobRaw.includes('/')) return _dobRaw;
                const p = _dobRaw.split('-');
                return p.length === 3 ? p[2]+'/'+p[1]+'/'+p[0] : _dobRaw;
            })() : '';
            const _branchCode = _prof.branch || '';
            const _branchNum = _branchCode.startsWith('CS') ? parseInt(_branchCode.replace('CS',''),10) : 0;
            const _branchLabel = _branchNum ? (_cfg['branchName' + _branchNum] || ('Cơ sở ' + _branchNum)) : '';
            _resEl.innerHTML = `<div style="background:white;border-radius:14px;overflow:hidden;box-shadow:0 3px 14px rgba(0,51,160,0.1);border:1px solid #e2e8f0;">

                <!-- Header: CLB + Võ sinh -->
                <div style="background:linear-gradient(135deg,#0033A0,#1e40af);padding:10px 14px;">
                    <!-- CLB row -->
                    <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.13);">
                        ${_logoHtml}
                        <div style="min-width:0;">
                            <div style="font-size:0.55rem;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;">Câu lạc bộ</div>
                            <div style="font-size:0.88rem;font-weight:900;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_clubName}</div>
                        </div>
                    </div>
                    <!-- Võ sinh row -->
                    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;">
                        <div>
                            <div style="font-size:0.55rem;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Võ sinh</div>
                            <div style="font-size:1rem;font-weight:900;color:white;line-height:1.2;">${_name_display}</div>
                            <div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap;">
                                <span style="font-size:0.68rem;color:rgba(255,255,255,0.72);">🥋 ${_prof.belt || 'Đai trắng'}</span>
                                ${_dobLabel ? `<span style="font-size:0.68rem;color:rgba(255,255,255,0.65);">🎂 ${_dobLabel}</span>` : ''}
                                ${_branchLabel ? `<span style="font-size:0.68rem;color:rgba(255,255,255,0.65);">📍 ${_branchLabel}</span>` : ''}
                            </div>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-size:0.55rem;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:2px;">Học phí/tháng</div>
                            <div style="font-size:1rem;font-weight:900;color:#fde68a;">${_fee.toLocaleString('vi-VN')} ₫</div>
                        </div>
                    </div>
                </div>

                <!-- Trạng thái học phí -->
                <div style="padding:10px 14px 12px;">
                    <!-- Đã đóng đến -->
                    <div style="display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border-radius:8px;padding:7px 10px;margin-bottom:8px;">
                        <span style="font-size:0.62rem;color:#64748b;font-weight:700;text-transform:uppercase;">Đã đóng đến</span>
                        <span style="font-size:0.9rem;font-weight:900;color:#334155;">${_paidLabel}</span>
                    </div>
                    ${_body}
                </div>
            </div>`;
        } catch(e) {
            console.error('PP lookup error', e);
            const _errCode = e && e.code ? e.code : '';
            let _errMsg = '⚠️ Lỗi kết nối. Vui lòng thử lại.';
            let _errHint = 'Kiểm tra kết nối internet và thử lại.';
            if (_errCode === 'permission-denied' || _errCode === 'PERMISSION_DENIED') {
                _errMsg = '🔒 Firestore chưa cấp quyền đọc ẩn danh.';
                _errHint = 'HLV vui lòng vào Firebase Console → Firestore → Rules và thêm quyền đọc cho bộ sưu tập "clubs", "profiles", "settings" (allow read: if true hoặc if request.auth != null).';
            } else if (_errCode === 'unavailable' || _errCode === 'network-request-failed') {
                _errMsg = '📡 Mất kết nối mạng.';
                _errHint = 'Vui lòng kiểm tra Wi-Fi / 4G và thử lại.';
            }
            const _isPermDenied = (_errCode === 'permission-denied' || _errCode === 'PERMISSION_DENIED');
            _resEl.innerHTML = `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:16px;text-align:center;">
                <div style="font-size:1.3rem;margin-bottom:6px;">⚠️</div>
                <div style="font-weight:800;color:#dc2626;font-size:0.9rem;">${_errMsg}</div>
                <div style="font-size:0.75rem;color:#64748b;margin-top:6px;text-align:left;line-height:1.6;">${_errHint}</div>
                ${_isPermDenied ? `<a href="https://console.firebase.google.com/project/quanly-tst/firestore/rules" target="_blank" style="display:inline-block;margin-top:10px;background:#f59e0b;color:white;text-decoration:none;border-radius:8px;padding:7px 16px;font-weight:700;font-size:0.8rem;">⚙️ Mở Firebase Rules</a><br>` : ''}
                <button onclick="window.ppLookupLogin()" style="margin-top:10px;background:#0033A0;color:white;border:none;border-radius:8px;padding:8px 20px;font-weight:700;font-size:0.82rem;cursor:pointer;">🔄 Thử lại</button>
            </div>`;
        }
    };
    // ════════════════════════════════════════════════════════════════════

    // ── Ghi nhận lịch sử đăng nhập (chỉ 1 lần mỗi session) ──────────────
    async function _recordLoginEvent(user, role, clubId) {
        try {
            // Key có ngày hôm nay: cờ cũ của hôm qua (hoặc trước đó) không bao giờ khớp
            // → tự hết hạn sau 1 ngày, không cần xóa thủ công, hoạt động ngay cả với file cũ đang cached
            const today = new Date().toISOString().split('T')[0]; // '2025-01-15'
            const sessionKey = 'lh_' + user.uid + '_' + today;
            if (sessionStorage.getItem(sessionKey)) return;
            // KHÔNG đặt sessionStorage trước — chỉ đặt SAU KHI ghi Firestore thành công.
            const ua = navigator.userAgent;
            let browser = 'Khác';
            if (/Edg\//.test(ua)) browser = 'Edge';
            else if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) browser = 'Chrome';
            else if (/Firefox\//.test(ua)) browser = 'Firefox';
            else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
            let os = 'Khác';
            if (/Windows NT/.test(ua)) os = 'Windows';
            else if (/Macintosh/.test(ua)) os = 'macOS';
            else if (/Android/.test(ua)) os = 'Android';
            else if (/iPhone|iPad/.test(ua)) os = 'iOS';
            else if (/Linux/.test(ua)) os = 'Linux';
            const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);

            // Nhận dạng tên thiết bị / model điện thoại
            let deviceName = '';
            // Thử Chromium's UA Client Hints API (hoạt động trên Chrome/Edge Android)
            if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
                try {
                    const hints = await navigator.userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
                    if (hints.model) deviceName = hints.model;
                } catch(e) {}
            }
            // Fallback: phân tích chuỗi User-Agent
            if (!deviceName) {
                if (/iPhone/.test(ua)) {
                    const m = ua.match(/CPU iPhone OS ([\d_]+)/);
                    const v = m ? m[1].replace(/_/g, '.') : '';
                    deviceName = 'iPhone' + (v ? ' (iOS ' + v + ')' : '');
                } else if (/iPad/.test(ua)) {
                    const m = ua.match(/CPU OS ([\d_]+)/);
                    const v = m ? m[1].replace(/_/g, '.') : '';
                    deviceName = 'iPad' + (v ? ' (iPadOS ' + v + ')' : '');
                } else if (/Android/.test(ua)) {
                    // Android UA: (Linux; Android X.X; MODEL Build/...)
                    const m = ua.match(/Android\s[\d.]+;\s([^)]+?)\s*(?:Build\/|\))/);
                    if (m) deviceName = m[1].trim();
                    else deviceName = 'Android';
                } else if (/Macintosh/.test(ua)) {
                    deviceName = 'Mac';
                } else if (/Windows NT ([\d.]+)/.test(ua)) {
                    const mv = ua.match(/Windows NT ([\d.]+)/);
                    const vmap = {'10.0':'Windows 10/11','6.3':'Windows 8.1','6.2':'Windows 8','6.1':'Windows 7'};
                    deviceName = vmap[mv ? mv[1] : ''] || 'Windows';
                }
            }

            const now = new Date();
            await addDoc(collection(db, "login_history"), {
                email: user.email || '',
                clubId: clubId || '',
                role: role || 'viewer',
                loginAt: now.toISOString(),
                timestamp: now.getTime(),
                browser,
                os,
                deviceType: isMobile ? 'Mobile' : 'Desktop',
                deviceName: deviceName || '',
            });
            // Chỉ đánh dấu "đã ghi" SAU KHI addDoc thành công
            sessionStorage.setItem(sessionKey, '1');
        } catch(e) {
            // Không set sessionStorage → lần load tiếp theo sẽ tự thử lại
            console.warn('[login_history] Không thể ghi lịch sử đăng nhập:', e.message);
        }
    }

    // ── LocalStorage cache để tăng tốc khởi động ──────────────────────────
    const _AUTH_CACHE_KEY = '_qlclb_auth_v2';
    const _saveAuthCache = (uid, role, clubId, coachBranch = '') => {
        try { localStorage.setItem(_AUTH_CACHE_KEY, JSON.stringify({ uid, role, clubId, coachBranch, ts: Date.now() })); } catch(e) {}
    };
    const _getAuthCache = (uid) => {
        try {
            const d = JSON.parse(localStorage.getItem(_AUTH_CACHE_KEY) || 'null');
            if (d && d.uid === uid && (Date.now() - d.ts) < 7 * 24 * 3600 * 1000) return d;
        } catch(e) {}
        return null;
    };
    const _clearAuthCache = () => { try { localStorage.removeItem(_AUTH_CACHE_KEY); } catch(e) {} };

    // Helper: reset UI đăng nhập + sign out + thông báo lỗi rõ ràng
    // [SỬA] _showLoginError — hiển thị lỗi inline, không dùng alert() chặn UI
    const _showLoginError = async (msg) => {
        document.getElementById('loginOverlay').style.display = 'flex';
        const _btn  = document.getElementById('btnLogin');
        const _text = document.getElementById('loginText');
        const _load = document.getElementById('loginLoading');
        if (_btn)  _btn.disabled = false;
        if (_text) _text.innerText = 'ĐĂNG NHẬP';
        if (_load) _load.classList.add('hidden');
        try { await signOut(auth); } catch(_) {}
        // [SỬA] Dùng inline error thay alert() — lỗi hiện ngay trong màn hình, không chặn UI
        _setLoginError(msg);
        // [THÊM] Auto-focus lại ô email sau khi hiện lỗi
        setTimeout(() => { const _ei = document.getElementById('emailInput'); if(_ei) _ei.focus(); }, 80);
    };

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                // ── BUG FIX: Super Admin fast path — bypass Firestore entirely ──
                // Trước đây, super_admin vẫn phải đọc Firestore users/{uid}.
                // Nếu document đó chưa tồn tại hoặc Rules chặn → đăng nhập thất bại.
                // Fix: kiểm tra email trước, không cần Firestore document.
                if (user.email && user.email.toLowerCase() === "admin@tstquynhon.com") {
                    window.userRole = 'super_admin';
                    currentClubId = '';
                    _saveAuthCache(user.uid, 'super_admin', '', '');
                    try { initSaaSDatabase(''); } catch(_ie) { console.error("initSaaSDatabase(super_admin):", _ie); }
                    _recordLoginEvent(user, 'super_admin', '').catch(() => {});
                    // Phase 4.0A-2/4.0A-3: Sync currentUser to __store
                    if (window.__store) window.__store.currentUser = user;
                    return;
                }

                // ── FAST PATH: dùng cache để bỏ qua Firestore read, tải ngay lập tức ──
                const _cached = _getAuthCache(user.uid);
                if (_cached) {
                    currentClubId = _cached.clubId;
                    window.userRole = _cached.role;
                    if (_cached.role === 'coach') window.coachBranch = _cached.coachBranch || '';
                    try { initSaaSDatabase(currentClubId); } catch(_ie) { console.error("initSaaSDatabase(cache):", _ie); }
                    // Phase 4.0A-3: Sync currentUser to __store (cache path)
                    if (window.__store) window.__store.currentUser = user;
                    // [SỬA] Giảm delay monthly reminder — UI đã hiện, nhắc nhở sau khi render xong
        setTimeout(() => { if(typeof window._checkMonthlyReminder === 'function') window._checkMonthlyReminder(); }, 300);
                    // Xác minh cache và cập nhật trong nền (áp dụng cho TẤT CẢ role kể cả coach)
                    getDoc(doc(db, "users", user.uid)).then(userDoc => {
                        if (userDoc.exists()) {
                            const _ud = userDoc.data();
                            const _fr = _ud.role || 'admin';
                            const _freshRole = (user.email && user.email.toLowerCase() === "admin@tstquynhon.com") ? 'super_admin' : _fr;
                            const _freshClubId = _ud.clubId;
                            const _freshBranch = _ud.branch || '';
                            _saveAuthCache(user.uid, _freshRole, _freshClubId, _freshBranch);
                            _recordLoginEvent(user, _freshRole, _freshClubId);
                        }
                    }).catch(() => {});
                    return;
                }
                // ── SLOW PATH: lần đầu đăng nhập hoặc cache hết hạn — đọc Firestore ──
                let userDocSnap = null;
                try {
                    userDocSnap = await getDoc(doc(db, "users", user.uid));
                } catch(_readErr) {
                    // permission-denied → tiếp tục xuống fallback; lỗi mạng → dừng
                    console.warn("users/{uid} read failed:", _readErr.code, "— thử tìm qua clubs collection");
                    if (_readErr.code !== 'permission-denied') {
                        _showLoginError('Không thể kết nối Firestore (' + (_readErr.code || _readErr.message) + '). Vui lòng kiểm tra mạng và thử lại.');
                        return;
                    }
                }

                if (userDocSnap && userDocSnap.exists()) {
                    const _ud = userDocSnap.data();
                    currentClubId = _ud.clubId;
                    const _firestoreRole = _ud.role || 'admin';
                    window.userRole = (user.email && user.email.toLowerCase() === "admin@tstquynhon.com") ? 'super_admin' : _firestoreRole;
                    if (window.userRole === 'coach') window.coachBranch = _ud.branch || '';
                    _saveAuthCache(user.uid, window.userRole, currentClubId, _ud.branch || '');
                    _recordLoginEvent(user, window.userRole, currentClubId);
                    try { initSaaSDatabase(currentClubId); } catch(_ie) { console.error("initSaaSDatabase(slowPath):", _ie); }
                    // Phase 4.0A-3: Sync currentUser to __store (slow path)
                    if (window.__store) window.__store.currentUser = user;
                    // [SỬA] Giảm delay monthly reminder — UI đã hiện, nhắc nhở sau khi render xong
        setTimeout(() => { if(typeof window._checkMonthlyReminder === 'function') window._checkMonthlyReminder(); }, 300);
                } else {
                    // ── FALLBACK: users/{uid} không tồn tại hoặc bị chặn ──────────────────
                    // Quét qua tất cả clubs để tìm tài khoản (không cần collectionGroup index)
                    let _found = false;
                    try {
                        const _allClubs = await getDocs(query(collection(db, 'clubs'), limit(200))); // [3.3E] auth fallback clubs scan

                        // Bước 1: Tìm admin CLB bằng cách so sánh adminEmail trong clubs collection
                        for (const _cDoc of _allClubs.docs) {
                            const _cd = _cDoc.data();
                            if (_cd.adminEmail && user.email && _cd.adminEmail.toLowerCase() === user.email.toLowerCase()) {
                                currentClubId = _cDoc.id;
                                window.userRole = 'admin';
                                try { await setDoc(doc(db, 'users', user.uid), { role: 'admin', clubId: _cDoc.id, email: user.email }); } catch(_) {}
                                _saveAuthCache(user.uid, 'admin', currentClubId, '');
                                _recordLoginEvent(user, 'admin', currentClubId);
                                try { initSaaSDatabase(currentClubId); } catch(_ie) { console.error("initSaaSDatabase(fallback-admin):", _ie); }
                                // Phase 4.0A-3: Sync currentUser to __store (fallback-admin)
                                if (window.__store) window.__store.currentUser = user;
                                // [SỬA] Giảm delay monthly reminder — UI đã hiện, nhắc nhở sau khi render xong
        setTimeout(() => { if(typeof window._checkMonthlyReminder === 'function') window._checkMonthlyReminder(); }, 300);
                                _found = true;
                                break;
                            }
                        }

                        // Bước 2: Nếu không tìm thấy admin, tìm trong coaches subcollection của từng CLB
                        if (!_found) {
                            for (const _cDoc of _allClubs.docs) {
                                try {
                                    const _coachDoc = await getDoc(doc(db, 'clubs', _cDoc.id, 'coaches', user.uid));
                                    if (_coachDoc.exists()) {
                                        const _coachData = _coachDoc.data();
                                        currentClubId = _cDoc.id;
                                        window.userRole = 'coach';
                                        window.coachBranch = _coachData.branch || '';
                                        try { await setDoc(doc(db, 'users', user.uid), { role: 'coach', clubId: _cDoc.id, branch: _coachData.branch || '', email: user.email || _coachData.email || '' }); } catch(_) {}
                                        _saveAuthCache(user.uid, 'coach', currentClubId, window.coachBranch);
                                        _recordLoginEvent(user, 'coach', currentClubId);
                                        try { initSaaSDatabase(currentClubId); } catch(_ie) { console.error("initSaaSDatabase(fallback-coach):", _ie); }
                                        // Phase 4.0A-3: Sync currentUser to __store (fallback-coach)
                                        if (window.__store) window.__store.currentUser = user;
                                        _found = true;
                                        break;
                                    }
                                } catch(_) {}
                            }
                        }
                    } catch(_scanErr) {
                        console.warn('Club scan fallback failed:', _scanErr.code, _scanErr.message);
                        if (_scanErr.code === 'permission-denied') {
                            _showLoginError(
                                'Lỗi phân quyền Firestore (permission-denied)!\n\n'
                                + 'Hệ thống không thể xác minh tài khoản vì Firestore Security Rules\n'
                                + 'chưa được cấu hình đúng.\n\n'
                                + 'Vui lòng mở Firebase Console → Firestore Database → Rules\n'
                                + 'và sao chép Rules từ phần đầu file app.js rồi nhấn Publish.\n\n'
                                + 'Sau đó đăng nhập lại.'
                            );
                            return;
                        }
                    }

                    if (!_found) {
                        _showLoginError(
                            'Tài khoản này chưa được cấp quyền truy cập hệ thống.\n\n'
                            + 'Nếu bạn là HLV, vui lòng yêu cầu Admin:\n'
                            + '1. Vào "Quản lý tài khoản HLV"\n'
                            + '2. Bấm "🔄 Đồng bộ tài khoản HLV cũ"\n'
                            + '3. HLV đăng nhập lại\n\n'
                            + 'Nếu bạn là Admin CLB, liên hệ Super Admin để kiểm tra.'
                        );
                    }
                }
            } catch(e) {
                // Outer catch chỉ xử lý lỗi xảy ra TRƯỚC khi initSaaSDatabase được gọi
                // (vì mỗi initSaaSDatabase() đã được bọc trong try/catch riêng ở trên).
                // → Luôn báo lỗi để người dùng không bị kẹt màn hình đăng nhập im lặng.
                console.error("Auth flow error:", e);
                _showLoginError(
                    e.code === 'permission-denied'
                        ? 'Lỗi phân quyền Firestore (permission-denied).\n\nVui lòng mở Firebase Console → Firestore Database → Rules\nvà sao chép Rules từ phần đầu file app.js rồi nhấn Publish.\n\nSau đó đăng nhập lại.'
                        : 'Lỗi xác thực hệ thống (' + (e.code || e.message) + ').\nVui lòng kiểm tra kết nối mạng và thử lại.'
                );
            }
        } else {
            _clearAuthCache();
            // Xóa toàn bộ cờ lịch sử đăng nhập (cả format cũ lẫn mới) khi logout
            Object.keys(sessionStorage)
                .filter(k => k.startsWith('lh_'))
                .forEach(k => sessionStorage.removeItem(k));

            // [Phase 3.6] Cleanup listener registry trước khi cleanup legacy arrays
            // Gọi cleanupAllListeners để hủy cả registry lẫn legacy list trong 1 lần
            if (window.cleanupAllListeners) window.cleanupAllListeners('logout');
            // [Phase 3.6D] Reset student profile store khi logout
            // main.js cũng gọi reset trong _patchResetStore() — double-reset an toàn (idempotent).
            // [Phase 3.7B] Reset profiles listeners trước khi reset store
            if (window.resetProfilesListeners) window.resetProfilesListeners('logout');
            if (window.resetStudentProfileStore) window.resetStudentProfileStore('logout');
            // Phase 4.0A-3: Reset reports module idempotency state on logout
            window.resetReportsModuleState?.('logout');
            // Phase 4.0A-3: Clear currentUser from __store on logout
            if (window.__store) window.__store.currentUser = null;
            // Phase 4.0B-4C: Reset app context ready state khi logout (idempotent)
            window.__appContextReadyState = {
                ready:       false,
                clubId:      null,
                dispatchedAt: null,
                generation:  0,
                reason:      'logout'
            };
            // Phase 4.0B-4F — Phase 7: Reset runtime recovery state khi logout
            window.__runtimeRecoveryState = {
                checked:          false,
                running:          false,
                completed:        false,
                activeDataSource: '',
                recoveryUsed:     false,
                reason:           'logout',
                error:            '',
                checkedAt:        0,
                completedAt:      0
            };
            window.currentClubId = null;
            if (window.__store) {
                window.__store.currentClubId = null;
                window.__store.clubId        = null;
            }
            activeListeners.forEach(fn => { try { fn(); } catch(e) {} });
            activeListeners = [];
            if(currentTxUnsub) { currentTxUnsub(); currentTxUnsub = null; if (window.__txListenerMetrics) { window.__txListenerMetrics.txListenerDetached = (window.__txListenerMetrics.txListenerDetached || 0) + 1; window.__txListenerMetrics.lastDetachedAt = Date.now(); } }
            // [PERF FIX] Dọn notification listener — không nằm trong activeListeners
            // nên phải cleanup riêng khi logout để tránh memory leak giữa các session.
            if(window._notifUnsubscribe) { try { window._notifUnsubscribe(); } catch(_) {} window._notifUnsubscribe = null; }
            if (typeof window._destroyDashboardCharts === 'function') { window._destroyDashboardCharts(); } else { if(financeChartInstance){financeChartInstance.destroy();financeChartInstance=null;} }
            if (typeof window._destroyDashboardCharts !== 'function') { if(memberChartInstance){memberChartInstance.destroy();memberChartInstance=null;} }
            if (window.__store) { window.__store.financeChartInstance = null; window.__store.memberChartInstance = null; } // [Phase 2c]
            logoLoaded = false;
            document.getElementById('loginOverlay').style.display = 'flex'; document.getElementById('mainApp').style.display = 'none';
            // [THÊM] Auto-focus ô email khi màn hình đăng nhập hiện ra — người dùng gõ luôn không cần click
            // [SỬA] Auto-focus nhanh hơn
            setTimeout(() => { const _ei = document.getElementById('emailInput'); if(_ei) _ei.focus(); }, 80);
        }
    });

    window.listenToData = (monthStr) => {
        if (!monthStr || !colRef) return;
        const _cid = (window.__store && window.__store.clubId) || '';
        const _txKey = 'finance:tx:' + _cid + ':' + monthStr;

        // [Phase 3.6C] Cleanup old finance tx listener trước khi re-subscribe.
        // cleanupListenersByOwner xử lý trường hợp đổi tháng (old key ≠ new key):
        // nếu đang ở tháng 5 rồi đổi sang tháng 6, key cũ 'finance:tx:...:2024-05' sẽ bị remove đúng.
        if (window.cleanupListenersByOwner) {
            window.cleanupListenersByOwner('finance', 'tx-month-change');
        }
        // Legacy bridge: currentTxUnsub — entry.removed guard trong registry ngăn double-unsub an toàn
        if (currentTxUnsub) { try { currentTxUnsub(); } catch(_) {} currentTxUnsub = null; }

        // [Phase 4K] Emit txListenerAttached metric — track each listenToData attach for read cost diagnostics
        if (window.__txListenerMetrics) {
            // Duplicate-detection: warn if same key still in registry despite cleanup above
            if (window.hasListener && window.hasListener('finance:tx:' + ((window.__store && window.__store.clubId) || '') + ':' + monthStr)) {
                window.__txListenerMetrics.txListenerDuplicatePrevented = (window.__txListenerMetrics.txListenerDuplicatePrevented || 0) + 1;
                console.warn('[Phase 4K] txListenerDuplicatePrevented — key already in registry after cleanup:', monthStr, '(safeRegisterSnapshot will handle)');
            }
            window.__txListenerMetrics.txListenerAttached = (window.__txListenerMetrics.txListenerAttached || 0) + 1;
            window.__txListenerMetrics.lastAttachedMonth  = monthStr;
            window.__txListenerMetrics.lastAttachedAt     = Date.now();
        }

        let start = monthStr + "-01"; let end = monthStr + "-31";

        // [FIX MẤT GIAO DỊCH] Dùng 2 query song song:
        // 1. Theo date (giao dịch được nhập đúng tháng)
        // 2. Theo txMonth (giao dịch thu bù tháng cũ — date có thể khác tháng)
        // Sau đó merge + dedup theo id để không hiện trùng.
        let _byDate = [], _byTxMonth = [];
        const _mergeAndRender = () => {
            const seen = new Set();
            allTransactions = [..._byDate, ..._byTxMonth].filter(t => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
            allTransactions.sort((a,b) => { const ts = (b.timestamp||0) - (a.timestamp||0); if(ts !== 0) return ts; return (b.date||'') > (a.date||'') ? 1 : -1; });
            // Phase 4.0B-4E: Guard — không overwrite legacy-root data bằng primary rỗng
            const _txEmpty    = allTransactions.length === 0;
            const _storeHasTx = window.__store && Array.isArray(window.__store.transactions) && window.__store.transactions.length > 0;
            if (window.__store && window.__store.activeDataSource === 'legacy-root' && _txEmpty && _storeHasTx) {
                console.warn('[DataSourceLock] Skip primary empty overwrite (transactions) — legacy-root active');
                return;
            }
            if (window.__store) window.__store.transactions = allTransactions; // [Phase 2e] sync cho finance.js
            // Phase 4.0B-4D: update transactions hydration metrics
            _updateHydrationMetrics({
                transactionsSnapshotCount: (window.__dataHydrationMetrics.transactionsSnapshotCount || 0) + 1,
                transactionsDocCount:      allTransactions.length,
                lastReason:               'transactions-merge-render'
            });
            if (typeof window.recordReadMetric === 'function') window.recordReadMetric('transactions', allTransactions.length, 'tx-merge-render'); // [4J-8]
            // [Phase 3.5C] transactions thay đổi → finance + students (debt) + dashboard.
            // Fallback về scheduleRender() nếu Phase 3.5C chưa load.
            if (window.invalidateFinance) {
                if (window.markListenerSnapshot) window.markListenerSnapshot(_txKey);
                window.invalidateFinance('transactions-snapshot');
                window.invalidateStudents('transactions-affect-debt');
                window.invalidateDashboard('transactions-snapshot');
            } else {
                scheduleRender();
            }
        };

        // [PERF] Giữ 2 query song song (byDate + byTxMonth) để không mất giao dịch bù tháng cũ.
        // Giảm limit từ 1000 → 500 mỗi query: tổng tối đa 500 giao dịch/tháng sau dedup,
        // đủ cho CLB trên 300 võ sinh. Tháng có trên 500 giao dịch thực tế cực kỳ hiếm.
        // OK_UI_DISPLAY_LIMIT — TX listener giới hạn hiển thị tháng hiện tại (scale config txListenerLimit 1200).
        // CLB 1.000+ võ sinh: CLB có > 1200 giao dịch/tháng rất hiếm trong thực tế.
        // Export/báo cáo dùng loadTransactionsForDateRange/loadTransactionsForTxMonthRange (không bị limit này).
        // Phase 4J-9B: Đã reclassify marker cũ → OK_UI_DISPLAY_LIMIT (chỉ phục vụ hiển thị tab Thu Chi).
        // TODO Phase 3.9: tăng limit hoặc chuyển sang aggregation server-side cho dashboard.
        if (typeof window.warnUnsafeLimit === 'function') {
            // uiOnly: true — listener này chỉ phục vụ hiển thị tab Thu Chi,
            // KHÔNG dùng cho tính toán dashboard/doanh thu (Phase 4K stats docs đảm nhận).
            window.warnUnsafeLimit('transactions:byDate+byTxMonth:' + monthStr, 'listenToData:init', { uiOnly: true });
        }
        // OK_UI_DISPLAY_LIMIT [3.8D-Phase6] — finance realtime listener chỉ hiển thị giao dịch tháng hiện tại.
        // Export/report dùng loadTransactionsForDateRange / loadTransactionsForTxMonthRange (không bị limit này).
        // [4J-8] Bumped from 500 → txListenerLimit (1200) để hỗ trợ CLB 1000 võ sinh.
        const _txListLim  = ((window.__scaleConfig || {}).txListenerLimit) || 1200;
        const qByDate    = query(colRef, where("date", ">=", start), where("date", "<=", end), orderBy("date", "desc"), limit(_txListLim));
        const qByTxMonth = query(colRef, where("txMonth", "==", monthStr), limit(_txListLim));

        // [Phase 3.6C] safeRegisterSnapshot: wrap cả 2 query trong 1 factory
        // Old key đã removed qua cleanupListenersByOwner → safeRegisterSnapshot sẽ proceed
        if (window.safeRegisterSnapshot) {
            window.safeRegisterSnapshot(_txKey, () => {
                const u1 = onSnapshot(qByDate,    (snap) => { _byDate    = snap.docs.map(d => ({id: d.id, ...d.data()})); _mergeAndRender(); });
                const u2 = onSnapshot(qByTxMonth, (snap) => { _byTxMonth = snap.docs.map(d => ({id: d.id, ...d.data()})); _mergeAndRender(); });
                const _combinedUnsub = () => { try { u1(); } catch(_) {} try { u2(); } catch(_) {} };
                currentTxUnsub = _combinedUnsub; // bridge: legacy logout cleanup
                return _combinedUnsub;
            }, { owner: 'finance', scope: 'global', clubId: _cid, reason: 'listenToData' });
        } else {
            // Fallback Phase 3.6
            const u1 = onSnapshot(qByDate,    (snap) => { _byDate    = snap.docs.map(d => ({id: d.id, ...d.data()})); _mergeAndRender(); });
            const u2 = onSnapshot(qByTxMonth, (snap) => { _byTxMonth = snap.docs.map(d => ({id: d.id, ...d.data()})); _mergeAndRender(); });
            currentTxUnsub = () => { u1(); u2(); };
            if (window.registerListener) {
                window.registerListener(_txKey, currentTxUnsub, { owner: 'finance', scope: 'global', reason: 'listenToData' });
            }
        }
    };

    const docTienVND = (so) => {
        if (!so || so === 0) return "Không đồng"; const mangso = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
        const dochangchuc = (so, daydu) => { let chuoi = ""; let chuc = Math.floor(so / 10); let donvi = so % 10; if (chuc > 1) { chuoi = " " + mangso[chuc] + " mươi"; if (donvi == 1) chuoi += " mốt"; } else if (chuc == 1) { chuoi = " mười"; if (donvi == 1) chuoi += " một"; } else if (daydu && donvi > 0) chuoi = " lẻ"; if (donvi == 5 && chuc > 0) chuoi += " lăm"; else if (donvi > 0 && (donvi != 1 || chuc == 0)) chuoi += " " + mangso[donvi]; return chuoi; };
        const docblock = (so, daydu) => { let chuoi = ""; let tram = Math.floor(so / 100); so = so % 100; if (daydu || tram > 0) { chuoi = " " + mangso[tram] + " trăm"; chuoi += dochangchuc(so, true); } else chuoi = dochangchuc(so, false); return chuoi; };
        const hang = ["", "nghìn", "triệu", "tỷ"]; let arr = []; let kq = ""; while (so > 0) { arr.push(so % 1000); so = Math.floor(so / 1000); }
        for (let i = arr.length - 1; i >= 0; i--) if (arr[i] > 0) kq += docblock(arr[i], i < arr.length - 1 && arr.slice(i+1).some(val => val > 0)) + " " + hang[i];
        kq = kq.trim().replace(/\s+/g, ' '); return `(${kq.charAt(0).toUpperCase() + kq.slice(1)} đồng chẵn)`;
    };

    const formatCurrencyInput = (dispId, actId, callback) => {
        const d = document.getElementById(dispId); const a = document.getElementById(actId); if(!d || !a) return;
        if(a.value && !d.value) d.value = parseInt(a.value, 10).toLocaleString('vi-VN');
        d.addEventListener('input', (e) => { let v = e.target.value.replace(/\D/g, ''); a.value = v; e.target.value = v ? parseInt(v, 10).toLocaleString('vi-VN') : ''; if(callback) callback(); });
    };

    window.calcInv = () => { let qty = Number(document.getElementById('inv_qty').value) || 0; let price = Number(document.getElementById('inv_priceActual').value) || 0; let total = qty * price; document.getElementById('inv_totalActual').value = total; document.getElementById('inv_totalDisplay').value = total > 0 ? total.toLocaleString('vi-VN') + " ₫" : ""; };
    
    formatCurrencyInput('amountDisplay', 'amountActual'); formatCurrencyInput('tx_exam_amountDisplay', 'tx_exam_amountActual'); formatCurrencyInput('exp_amountDisplay', 'exp_amountActual'); formatCurrencyInput('ee_amountDisplay', 'ee_amountActual'); formatCurrencyInput('inv_priceDisplay', 'inv_priceActual', window.calcInv); formatCurrencyInput('add_fee_display', 'add_fee_actual'); formatCurrencyInput('add_uniform_display', 'add_uniform_actual'); formatCurrencyInput('ei_amountDisplay', 'ei_amountActual'); formatCurrencyInput('exam_fee_all_display', 'exam_fee_all_actual'); formatCurrencyInput('add_fee_default_display', 'add_fee_default_actual', () => window.updateAddPackageAmount()); formatCurrencyInput('m_fee_display', 'm_fee_actual'); formatCurrencyInput('eexp_amountDisplay', 'eexp_amountActual');
    
    window.updateComboTotal = () => {
        let f1 = Number(document.getElementById('combo_fee1_actual').value) || 0; let f2 = Number(document.getElementById('combo_fee2_actual').value) || 0;
        document.getElementById('combo_total').innerText = (f1 + f2).toLocaleString('vi-VN') + " ₫";
    };
    formatCurrencyInput('combo_fee1_display', 'combo_fee1_actual', window.updateComboTotal); formatCurrencyInput('combo_fee2_display', 'combo_fee2_actual', window.updateComboTotal);

    window.toggleTxFormType = () => {
        const type = document.getElementById('type').value;
        const examWrap = document.getElementById('exam_fee_container');
        const pkgWrap = document.getElementById('tx_package_wrapper');
        if (type === 'Học phí + Lệ phí thi') {
            examWrap.style.display = 'grid'; pkgWrap.style.display = 'flex';
            window.updateExamComboQuarter();
        } else if (type === 'Học phí') {
            examWrap.style.display = 'none'; pkgWrap.style.display = 'flex';
        } else {
            examWrap.style.display = 'none'; pkgWrap.style.display = 'none';
        }
    };
    
    window.updateExamComboQuarter = () => {
        const dateStr = document.getElementById('date').value;
        if(!dateStr) return;
        const m = parseInt(dateStr.split('-')[1]);
        let q = Math.ceil(m/3);
        document.getElementById('tx_exam_title').value = `Thi Quý ${q}/${dateStr.split('-')[0]}`;
    };
    
    window.updateAmountByPackage = () => {
        const isDiscount = document.getElementById('tx_discount').checked;
        const savedEl = document.getElementById('tx_discount_saved');
        if(!isDiscount && savedEl) savedEl.style.display = 'none';
        const name = document.getElementById('description').value.trim();
        if(!name || !allProfiles[name]) return;
        const baseFee = Number(allProfiles[name].tuitionFee) || 0;
        const pkg = parseInt(document.getElementById('tx_package').value) || 1;
        let rawTotal = baseFee * pkg;
        let total = rawTotal;
        let saved = 0;
        if(isDiscount) {
            const pct = Number(document.getElementById('tx_discount_pct')?.value) || 10;
            saved = Math.round(rawTotal * pct / 100);
            total = rawTotal - saved;
        }
        if(savedEl) {
            savedEl.style.display = isDiscount && saved > 0 ? 'inline' : 'none';
            if(isDiscount && saved > 0) savedEl.textContent = '↓ -' + saved.toLocaleString('vi-VN') + '₫';
        }
        document.getElementById('amountActual').value = total;
        document.getElementById('amountDisplay').value = total.toLocaleString('vi-VN');
    };

    window.toggleInvType = () => {
        const t = document.getElementById('inv_type').value;
        const desc = document.getElementById('inv_desc');
        const unpaidWrap = document.getElementById('inv_unpaid_wrap');
        const unpaidChk = document.getElementById('inv_unpaid');
        if(t === 'Nhập kho') {
            desc.placeholder = "Tên nhà cung cấp";
            if(unpaidWrap) unpaidWrap.style.setProperty('display', 'none', 'important');
            if(unpaidChk) unpaidChk.checked = false;
        } else {
            desc.placeholder = "Tên người mua / Đại lý";
            if(unpaidWrap) unpaidWrap.style.removeProperty('display');
        }
    };

    // ═══════════════════════════════════════════════════════════
    // QUẢN LÝ DANH MỤC KHO TÙY CHỈNH
    // ═══════════════════════════════════════════════════════════

    /**
     * Trả về danh sách TẤT CẢ danh mục kho (mặc định + tùy chỉnh của admin).
     * Danh mục mặc định luôn đứng đầu: Võ phục, Áo thun, Bảo hộ.
     */
    window.getInvCategories = () => {
        const defaults = ['Võ phục', 'Áo thun', 'Bảo hộ'];
        const customNames = (window.invCustomCategories || []).map(c => c.name);
        // Lọc để tránh trùng với mặc định
        return [...defaults, ...customNames.filter(n => !defaults.includes(n))];
    };

    /**
     * Tạo HTML option cho tất cả danh mục (dùng populate select dropdown).
     */
    window.getCategoryOptionHtml = () => {
        const cats = window.getInvCategories();
        // Icon mặc định cho từng loại, tùy chỉnh dùng 📦
        const icons = { 'Võ phục': '🥋', 'Áo thun': '👕', 'Bảo hộ': '🛡️' };
        return cats.map(c => `<option value="${c}">${icons[c] || '📦'} ${c}</option>`).join('');
    };

    /**
     * Cập nhật nội dung tất cả dropdown danh mục kho trên trang.
     * Gọi sau khi load hoặc thay đổi danh mục tùy chỉnh.
     */
    window.populateInvCategorySelects = () => {
        const html = window.getCategoryOptionHtml();
        // Cập nhật tất cả dropdown danh mục trong app
        ['inv_category', 'ei_category', 'mi_inv_category'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const cur = el.value; // Giữ lại giá trị đang chọn
                el.innerHTML = html;
                // Khôi phục giá trị cũ nếu còn tồn tại
                if ([...el.options].some(o => o.value === cur)) el.value = cur;
            }
        });
    };

    /**
     * Tải danh mục tùy chỉnh từ Firestore: clubs/{clubId}/settings/inv_categories
     * Gọi sau khi user đăng nhập thành công và currentClubId đã được set.
     */
    window.loadInvCategories = async () => {
        if (!currentClubId) return;
        try {
            const snap = await getDoc(doc(db, 'clubs', currentClubId, 'settings', 'inv_categories'));
            // Lưu vào biến toàn cục để dùng ở nhiều nơi
            window.invCustomCategories = snap.exists() ? (snap.data().categories || []) : [];
        } catch(e) {
            // Lỗi đọc Firestore → dùng mảng rỗng, không ảnh hưởng chức năng cũ
            window.invCustomCategories = [];
        }
        // Cập nhật tất cả dropdown ngay sau khi load
        window.populateInvCategorySelects();
        // Hiện nút quản lý danh mục nếu là admin
        const manageBtnWrap = document.getElementById('admin_manage_cat_wrap');
        if (manageBtnWrap) {
            manageBtnWrap.style.display = (window.userRole === 'admin' || window.userRole === 'super_admin') ? 'block' : 'none';
        }
    };

    /**
     * Mở modal quản lý danh mục kho (chỉ admin).
     */
    window.openManageCatModal = () => {
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') {
            return alert('Chỉ Admin mới có quyền quản lý danh mục kho!');
        }
        window.renderManageCatList();
        document.getElementById('manageCatModal').style.display = 'flex';
    };

    /**
     * Đóng modal quản lý danh mục kho.
     */
    window.closeManageCatModal = () => {
        const el = document.getElementById('manageCatModal');
        if (el) el.style.display = 'none';
    };

    /**
     * Render danh sách danh mục (mặc định + tùy chỉnh) trong modal quản lý.
     */
    window.renderManageCatList = () => {
        const defaults = ['Võ phục', 'Áo thun', 'Bảo hộ'];
        // Mô tả mặc định cho từng loại
        const defaultDesc = {
            'Võ phục': 'Size dropdown: Size 1m → Size 1m8',
            'Áo thun': 'Nhập size tự do',
            'Bảo hộ': 'Nhập size tự do'
        };
        const el = document.getElementById('manageCatList');
        if (!el) return;

        let html = '';
        // Hiển thị danh mục mặc định (không xóa được)
        defaults.forEach(name => {
            html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f0f9ff;border-radius:10px;margin-bottom:6px;border:1px solid #bae6fd;">
                <div>
                    <span style="font-weight:700;font-size:0.85rem;">${name}</span>
                    <span style="margin-left:8px;font-size:0.68rem;background:#bae6fd;color:#0369a1;padding:2px 7px;border-radius:5px;font-weight:700;">Mặc định</span>
                    <div style="font-size:0.68rem;color:#64748b;margin-top:2px;">${defaultDesc[name] || ''}</div>
                </div>
                <span style="font-size:0.68rem;color:#94a3b8;font-style:italic;">Không xóa</span>
            </div>`;
        });

        // Hiển thị danh mục tùy chỉnh (xóa được)
        if (!window.invCustomCategories || window.invCustomCategories.length === 0) {
            html += `<div style="text-align:center;padding:20px;color:#94a3b8;font-size:0.82rem;font-style:italic;background:#f8fafc;border-radius:10px;border:1px dashed #e2e8f0;margin-top:8px;">
                Chưa có danh mục tùy chỉnh nào.<br>Sử dụng form bên trên để thêm danh mục mới.
            </div>`;
        } else {
            (window.invCustomCategories || []).forEach((cat, idx) => {
                // Hiển thị kiểu size: có dropdown hay nhập tự do
                const sizesText = (cat.sizes && cat.sizes.length > 0)
                    ? 'Size: ' + cat.sizes.join(', ')
                    : 'Nhập size tự do';
                html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fff;border-radius:10px;margin-bottom:6px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                    <div style="flex:1;min-width:0;">
                        <span style="font-weight:700;font-size:0.85rem;">📦 ${cat.name}</span>
                        <div style="font-size:0.68rem;color:#64748b;margin-top:2px;">${sizesText}</div>
                    </div>
                    <button type="button" onclick="window.deleteInvCategory(${idx})" style="background:#fee2e2;border:none;color:#dc2626;border-radius:8px;padding:5px 10px;font-size:0.75rem;font-weight:700;cursor:pointer;flex-shrink:0;margin-left:8px;">🗑 Xóa</button>
                </div>`;
            });
        }

        el.innerHTML = html;
    };

    /**
     * Thêm danh mục kho mới vào Firestore và cập nhật UI.
     * Đọc từ input: newCatName (tên), newCatSizes (sizes, phân cách bằng dấu phẩy).
     */
    window.addInvCategory = async () => {
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') return;
        const nameEl = document.getElementById('newCatName');
        const sizesEl = document.getElementById('newCatSizes');
        const name = (nameEl ? nameEl.value : '').trim();

        // Kiểm tra dữ liệu đầu vào
        if (!name) return alert('Vui lòng nhập tên danh mục!');
        if (name.length > 30) return alert('Tên danh mục tối đa 30 ký tự!');

        const defaults = ['Võ phục', 'Áo thun', 'Bảo hộ'];
        const existing = (window.invCustomCategories || []).map(c => c.name);
        if ([...defaults, ...existing].includes(name)) {
            return alert(`Danh mục "${name}" đã tồn tại! Vui lòng đặt tên khác.`);
        }

        // Parse sizes: tách bằng dấu phẩy, trim từng phần, loại bỏ rỗng
        const sizesRaw = sizesEl ? sizesEl.value.trim() : '';
        const sizes = sizesRaw
            ? sizesRaw.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        const newCat = { name, sizes };
        const updatedList = [...(window.invCustomCategories || []), newCat];

        try {
            // Lưu vào Firestore: document inv_categories trong collection settings của club
            await setDoc(
                doc(db, 'clubs', currentClubId, 'settings', 'inv_categories'),
                { categories: updatedList },
                { merge: true }
            );
            window.invCustomCategories = updatedList;
            // Xóa input sau khi thêm thành công
            if (nameEl) nameEl.value = '';
            if (sizesEl) sizesEl.value = '';
            // Cập nhật tất cả dropdown và danh sách trong modal
            window.populateInvCategorySelects();
            window.renderManageCatList();
            window.showToast(`✅ Đã thêm danh mục "${name}" thành công!`);
        } catch(e) {
            console.error('Lỗi thêm danh mục kho:', e);
            alert('Lỗi khi lưu danh mục! Vui lòng thử lại.');
        }
    };

    /**
     * Xóa danh mục tùy chỉnh theo vị trí index trong mảng invCustomCategories.
     * Danh mục mặc định (Võ phục, Áo thun, Bảo hộ) không thể xóa.
     */
    window.deleteInvCategory = async (idx) => {
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') return;
        const cat = (window.invCustomCategories || [])[idx];
        if (!cat) return;
        if (!confirm(`Xóa danh mục "${cat.name}"?

Các giao dịch đã nhập với danh mục này vẫn giữ nguyên, chỉ xóa khỏi danh sách lựa chọn.`)) return;

        const updatedList = [...(window.invCustomCategories || [])];
        updatedList.splice(idx, 1); // Xóa phần tử theo index

        try {
            await setDoc(
                doc(db, 'clubs', currentClubId, 'settings', 'inv_categories'),
                { categories: updatedList },
                { merge: true }
            );
            window.invCustomCategories = updatedList;
            window.populateInvCategorySelects();
            window.renderManageCatList();
            window.showToast(`✅ Đã xóa danh mục "${cat.name}"!`);
        } catch(e) {
            console.error('Lỗi xóa danh mục kho:', e);
            alert('Lỗi khi xóa danh mục! Vui lòng thử lại.');
        }
    };

    window.toggleInvCategory = () => {
        const cat = document.getElementById('inv_category').value;
        const sizeSelect = document.getElementById('inv_size');
        const sizeText = document.getElementById('inv_size_text');
        if (cat === 'Võ phục') {
            // Võ phục: dùng dropdown size cố định (Size 1m → Size 1m8)
            sizeSelect.style.display = ''; sizeSelect.required = true;
            sizeText.style.display = 'none'; sizeText.required = false; sizeText.value = '';
        } else {
            // Kiểm tra danh mục tùy chỉnh có sizes được định sẵn không
            const customCat = (window.invCustomCategories || []).find(c => c.name === cat);
            if (customCat && customCat.sizes && customCat.sizes.length > 0) {
                // Danh mục tùy chỉnh có sizes → populate dropdown từ sizes đã lưu
                sizeSelect.innerHTML = '<option value="" disabled selected>-- Chọn Size --</option>'
                    + customCat.sizes.map(s => `<option value="${s}">${s}</option>`).join('');
                sizeSelect.style.display = ''; sizeSelect.required = true;
                sizeText.style.display = 'none'; sizeText.required = false; sizeText.value = '';
            } else {
                // Áo thun, Bảo hộ, danh mục không có sizes → nhập tự do
                sizeSelect.style.display = 'none'; sizeSelect.required = false;
                sizeText.style.display = ''; sizeText.required = true;
            }
        }
    };

    window.toggleEditInvSize = () => {
        const cat = document.getElementById('ei_category').value;
        const sizeSelect = document.getElementById('ei_size');
        const sizeText = document.getElementById('ei_size_text');
        if (cat === 'Võ phục') {
            // Võ phục: dropdown size cố định
            sizeSelect.style.display = ''; sizeText.style.display = 'none';
        } else {
            // Kiểm tra danh mục tùy chỉnh có sizes không
            const customCat = (window.invCustomCategories || []).find(c => c.name === cat);
            if (customCat && customCat.sizes && customCat.sizes.length > 0) {
                // Có sizes tùy chỉnh → dùng dropdown
                sizeSelect.innerHTML = '<option value="" disabled selected>-- Chọn Size --</option>'
                    + customCat.sizes.map(s => `<option value="${s}">${s}</option>`).join('');
                sizeSelect.style.display = ''; sizeText.style.display = 'none';
            } else {
                // Nhập tự do
                sizeSelect.style.display = 'none'; sizeText.style.display = '';
            }
        }
    };

    window.toggleAddUniformGift = () => {
        const isGift = document.getElementById('add_uniform_gift').checked;
        const dispEl = document.getElementById('add_uniform_display');
        const actEl = document.getElementById('add_uniform_actual');
        if(isGift) {
            dispEl.value = "0"; actEl.value = 0; dispEl.disabled = true;
        } else {
            dispEl.disabled = false; dispEl.value = ""; actEl.value = "";
        }
    };
    
    window.updateAddPackageAmount = () => {
        const baseFee = Number(document.getElementById('add_fee_default_actual').value) || 0;
        const pkg = parseInt(document.getElementById('add_package').value) || 1;
        const isDiscount = document.getElementById('add_discount').checked;
        const pct = isDiscount ? (Number(document.getElementById('add_discount_pct').value) || 10) : 0;
        let total = baseFee * pkg;
        if(isDiscount && pct > 0) total = Math.round(total * (1 - pct / 100));
        document.getElementById('add_fee_actual').value = total;
        document.getElementById('add_fee_display').value = total.toLocaleString('vi-VN');
    };

    window.openSettingsModal = () => {
        if(window.userRole !== 'admin' && window.userRole !== 'super_admin') return alert("Chỉ Admin mới có quyền cấu hình hệ thống!");
        document.getElementById('cfg_bankId').value = clubConfig.bankId || "";
        document.getElementById('cfg_accountNo').value = clubConfig.accountNo || "";
        document.getElementById('cfg_accountName').value = clubConfig.accountName || "";
        document.getElementById('cfg_location').value = clubConfig.location || "Quy Nhơn";

        // Phase 4.0B-4J-3: populate bank2 fields
        const _pa = clubConfig.paymentAccounts || {};
        const _b2 = _pa.bank2 || {};
        const _b2Enabled = !!_b2.enabled;
        const _bank2Chk = document.getElementById('cfg_bank2Enabled');
        if (_bank2Chk) { _bank2Chk.checked = _b2Enabled; }
        if (typeof window.toggleBank2Fields === 'function') window.toggleBank2Fields(_b2Enabled);
        const _setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        _setV('cfg_bank2Id', _b2.bankId);
        _setV('cfg_bank2AccountNo', _b2.accountNo);
        _setV('cfg_bank2AccountName', _b2.accountName);
        _setV('cfg_bank2Note', _b2.note);

        const _cfgBCount = clubConfig.branchCount || 1;
        if(_cfgBCount > 1) {
            document.getElementById('cfg_branchNamesBlock').style.display = 'block';
            // Phase 4.0B-4J-3: show branch-to-bank mapping section
            const _mapBlock = document.getElementById('cfg_branchBankMapBlock');
            if (_mapBlock) { _mapBlock.style.display = 'block'; }
            const _mapContainer = document.getElementById('cfg_branchBankMapContainer');
            if (_mapContainer) {
                const _bMap = clubConfig.branchPaymentAccountMap || {};
                const _b2IsEnabled = !!(clubConfig.paymentAccounts?.bank2?.enabled);
                let _mapHtml = '';
                for (let _bi = 1; _bi <= _cfgBCount; _bi++) {
                    const _bKey = 'CS' + _bi;
                    const _bName = clubConfig['branchName' + _bi] || ('Cơ sở ' + _bi);
                    const _bSel = _bMap[_bKey] || 'bank1';
                    _mapHtml += `<div class="flex items-center gap-2"><span class="text-[0.72rem] font-bold text-slate-600 flex-1 min-w-0 truncate">${_bName}</span>`
                        + `<select id="cfg_bankMap_${_bKey}" class="bg-white border-slate-200 text-xs font-bold" style="width:auto;padding:6px 8px;">`
                        + `<option value="bank1">Tài khoản 1</option>`
                        + `<option value="bank2"${!_b2IsEnabled ? ' disabled' : ''}${_bSel==='bank2'&&_b2IsEnabled ? '' : ''}>Tài khoản 2${!_b2IsEnabled?' (chưa bật)':''}</option>`
                        + `</select></div>`;
                }
                _mapContainer.innerHTML = _mapHtml;
                // Set selected values
                for (let _bi = 1; _bi <= _cfgBCount; _bi++) {
                    const _bKey = 'CS' + _bi;
                    const _sel = document.getElementById('cfg_bankMap_' + _bKey);
                    if (_sel) _sel.value = (_bMap[_bKey] || 'bank1');
                }
            }

            document.getElementById('cfg_branch1').value = clubConfig.branchName1 || "Cơ sở 1";
            for(let _ci = 2; _ci <= 10; _ci++) {
                const blk = document.getElementById('cfg_branchBlock' + _ci);
                const inp = document.getElementById('cfg_branch' + _ci);
                if(blk) blk.style.display = _ci <= _cfgBCount ? 'block' : 'none';
                if(inp) inp.value = clubConfig['branchName' + _ci] || ('Cơ sở ' + _ci);
            }
        } else {
            document.getElementById('cfg_branchNamesBlock').style.display = 'none';
        }
        
        tempLogoBase64 = ""; document.getElementById('cfg_logoFile').value = '';
        if(clubConfig.logoBase64) { const pv = document.getElementById('cfg_logoPreview'); pv.src = clubConfig.logoBase64; pv.classList.remove('hidden'); } 
        else { document.getElementById('cfg_logoPreview').classList.add('hidden'); }

        tempSignatureBase64 = ""; document.getElementById('cfg_signatureFile').value = '';
        document.getElementById('cfg_trainerName').value = clubConfig.trainerName || '';
        if(clubConfig.signatureBase64) { const sp = document.getElementById('cfg_signaturePreview'); sp.src = clubConfig.signatureBase64; sp.classList.remove('hidden'); }
        else { document.getElementById('cfg_signaturePreview').classList.add('hidden'); }

        const _existingCode = (clubConfig.parentCode || '').toUpperCase();
        const _pcInput = document.getElementById('cfg_parentCode');
        _pcInput.value = _existingCode;
        // Gợi ý mã dựa trên club ID nếu chưa đặt mã
        if (!_existingCode && currentClubId) {
            const _suggested = currentClubId.replace(/[^a-z0-9]/gi, '').toUpperCase().substring(0, 8);
            _pcInput.placeholder = `Gợi ý: ${_suggested}`;
        } else {
            _pcInput.placeholder = 'VD: TST001';
        }

        document.getElementById('settingsModal').style.display = 'flex';
    };

    window.saveClubSettings = async () => {
        if(window.userRole !== 'admin' && window.userRole !== 'super_admin') return;
        const bankId = document.getElementById('cfg_bankId').value.trim().toUpperCase();
        const accountNo = document.getElementById('cfg_accountNo').value.trim();
        const accountName = document.getElementById('cfg_accountName').value.trim().toUpperCase();
        const location = document.getElementById('cfg_location').value.trim();
        
        if(!bankId || !accountNo || !accountName) return alert("Vui lòng điền đầy đủ thông tin!");
        
        const trainerName = document.getElementById('cfg_trainerName').value.trim();
        const parentCode = document.getElementById('cfg_parentCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        document.getElementById('cfg_parentCode').value = parentCode;

        // ── Kiểm tra mã CLB trùng với CLB khác trước khi lưu ──────────────
        if (parentCode) {
            try {
                const _dupQ = query(collection(db, 'clubs'), where('parentCode', '==', parentCode));
                const _dupSnap = await getDocs(query(_dupQ, limit(10))); // [3.3E] dup-check: only need 1 result
                const _conflicting = _dupSnap.docs.filter(d => d.id !== currentClubId);
                if (_conflicting.length > 0) {
                    const _conflictName = _conflicting[0].data().clubName || _conflicting[0].id;
                    alert(`❌ Mã CLB "${parentCode}" đã được sử dụng bởi CLB khác: "${_conflictName}"!\n\nPhụ huynh nhập mã này sẽ bị dẫn nhầm sang CLB đó.\nVui lòng chọn mã khác để tránh xung đột hệ thống.`);
                    document.getElementById('cfg_parentCode').focus();
                    return;
                }
            } catch (_dupErr) {
                console.error('Lỗi kiểm tra trùng mã:', _dupErr);
            }
        }
        // ───────────────────────────────────────────────────────────────────

        let updateData = { bankId, accountNo, accountName, location, trainerName };
        if(parentCode) updateData.parentCode = parentCode;
        if(tempLogoBase64) updateData.logoBase64 = tempLogoBase64;
        if(tempSignatureBase64) updateData.signatureBase64 = tempSignatureBase64;
        if(clubConfig.branchCount > 1) {
            for(let _si = 1; _si <= (clubConfig.branchCount || 1); _si++) {
                const el = document.getElementById('cfg_branch' + _si);
                updateData['branchName' + _si] = (el ? el.value.trim() : '') || ('Cơ sở ' + _si);
            }
        }

        // Phase 4.0B-4J-3: save paymentAccounts + branchPaymentAccountMap
        const _ckB2 = document.getElementById('cfg_bank2Enabled');
        const _b2IsOn = _ckB2 ? _ckB2.checked : false;
        const _gv = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        // Keep legacy bank1 fields in sync (backward compat)
        const _pa4j3 = {
            bank1: {
                enabled: true,
                bankId: bankId,
                accountNo: accountNo,
                accountName: accountName,
                note: ''
            },
            bank2: {
                enabled: _b2IsOn,
                bankId: _gv('cfg_bank2Id').toUpperCase(),
                accountNo: _gv('cfg_bank2AccountNo'),
                accountName: _gv('cfg_bank2AccountName').toUpperCase(),
                note: _gv('cfg_bank2Note')
            }
        };
        updateData.paymentAccounts = _pa4j3;
        // Save branch-to-bank mapping
        const _bmap = {};
        for (let _si = 1; _si <= (clubConfig.branchCount || 1); _si++) {
            const _bKey = 'CS' + _si;
            const _selEl = document.getElementById('cfg_bankMap_' + _bKey);
            const _selectedBank4j4 = (_selEl ? _selEl.value : 'bank1') || 'bank1';
            _bmap[_bKey] = _selectedBank4j4;
            // Phase 4.0B-4J-4: also store alias by branch name and normalized name
            const _bName4j4 = updateData['branchName' + _si] || ('Cơ sở ' + _si);
            const _bNorm4j4 = (typeof removeVietnameseTonesForQR === 'function')
                ? removeVietnameseTonesForQR(_bName4j4).toLowerCase().trim() : _bName4j4.toLowerCase();
            _bmap[_bName4j4] = _selectedBank4j4;
            _bmap[_bNorm4j4] = _selectedBank4j4;
        }
        updateData.branchPaymentAccountMap = _bmap;

        try {
            await setDoc(doc(db, "clubs", currentClubId, "settings", "main_config"), updateData, { merge: true });
            if(parentCode) await setDoc(doc(db, "clubs", currentClubId), { parentCode }, { merge: true });
            tempLogoBase64 = ""; tempSignatureBase64 = "";
            window.showToast("✅ Đã lưu cấu hình thành công! Mã CLB đã được xác nhận là duy nhất.");
            document.getElementById('settingsModal').style.display = 'none';
        } catch (error) {
            console.error(error);
            alert("Đã có lỗi kết nối khi lưu cấu hình!");
        }
    };

    function removeVietnameseTonesForQR(str) { return str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D') : ""; }

    // ── Phase 4.0B-4J-8A: Search Normalization + Index Helpers ───────────────
    /**
     * Bỏ dấu tiếng Việt + lowercase + trim để tạo search key nhất quán.
     * Đồng bộ với normalize helper trong students.service.js (searchProfilesServerSide).
     * @param {string} value — raw text
     * @returns {string} normalized text (no diacritics, lowercase, single-space)
     */
    function normalizeSearchText(value) {
        const raw = String(value || '').trim();
        const noTone = raw
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
        return noTone.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    /**
     * Giữ lại chỉ các ký tự số để so sánh số điện thoại.
     * @param {string} value — raw phone
     * @returns {string} digits only
     */
    function normalizePhoneForSearch(value) {
        return String(value || '').replace(/\D/g, '');
    }

    /**
     * Xây dựng search index fields cho hồ sơ võ sinh.
     * Ghi cùng lúc với setDoc/update để search luôn nhất quán.
     *
     * @param {Object} profile — {phone, memberId, nickname, …}
     * @param {string} name    — tên võ sinh (doc ID)
     * @returns {{searchName, searchNameTokens, searchPhone, searchCode, searchNickname}}
     */
    function buildStudentSearchIndex(profile, name) {
        const fullName   = String(name || (profile || {}).name || '').trim();
        const phone      = String((profile || {}).phone || (profile || {}).parentPhone || (profile || {}).contactPhone || (profile || {}).guardianPhone || '');
        const studentCode = String((profile || {}).memberId || (profile || {}).studentCode || (profile || {}).code || (profile || {}).idCode || '');
        const nickname   = String((profile || {}).nickname || (profile || {}).shortName || (profile || {}).alias || '');
        const searchName = normalizeSearchText(fullName);
        return {
            searchName,
            searchNameTokens: searchName.split(' ').filter(Boolean).slice(0, 10),
            searchPhone:     normalizePhoneForSearch(phone),
            searchCode:      normalizeSearchText(studentCode),
            searchNickname:  normalizeSearchText(nickname),
        };
    }
    window.buildStudentSearchIndex = window.buildStudentSearchIndex || buildStudentSearchIndex;

    /**
     * Lấy tất cả trang của một query Firestore theo cursor pagination.
     * Dùng để thay thế getDocs với limit(500) hard-cap.
     *
     * @param {Function} makeQuery — (opts: {cursor, pageSize}) => Firestore Query
     * @param {Object}   options
     * @param {number}   options.pageSize — số docs mỗi trang (default 200)
     * @param {string}   options.reason   — ghi vào readMetric (optional)
     * @param {string}   options.domain   — collection name cho metric (optional)
     * @param {number}   options.maxPages — số trang tối đa (default 50 → 10.000 docs)
     * @returns {Promise<Array>} — mảng tất cả docs (DocumentSnapshot)
     */
    async function fetchQueryPages(makeQuery, options) {
        const _opts     = options || {};
        const pageSize  = _opts.pageSize || 200;
        const reason    = _opts.reason   || 'fetchQueryPages';
        const domain    = _opts.domain   || 'unknown';
        const maxPages  = _opts.maxPages || 50;
        const allDocs   = [];
        let   cursor    = null;
        let   page      = 0;
        while (page < maxPages) {
            const q    = makeQuery({ cursor, pageSize });
            const snap = await getDocs(q);
            const docs = snap.docs;
            if (typeof window.recordReadMetric === 'function') {
                window.recordReadMetric(domain, docs.length, reason + ':page' + (page + 1));
            }
            allDocs.push(...docs);
            if (docs.length < pageSize) break;
            cursor = docs[docs.length - 1];
            page++;
        }
        if (page >= maxPages) {
            console.warn('[fetchQueryPages] ⚠️ maxPages (' + maxPages + ') reached for', reason, '— total docs:', allDocs.length);
        }
        return allDocs;
    }
    window.fetchQueryPages = window.fetchQueryPages || fetchQueryPages;
    // ── End Phase 4.0B-4J-8A helpers ─────────────────────────────────────────

    // ── Phase 4.0B-4J-3: Multi Bank Account helpers ───────────────────────────
    // ── Phase 4.0B-4J-4: normalizeBranchKeyForPayment ────────────────────────
    function normalizeBranchKeyForPayment(branchInput, settings) {
        const cfg = settings || window.__store?.settings || clubConfig || {};
        const raw = String(branchInput || '').trim();
        if (!raw) return 'CS1';
        const upper = raw.toUpperCase();
        // CS1 / CS2 / CS 2 …
        const csMatch = upper.match(/^CS\s*(\d+)$/);
        if (csMatch) return 'CS' + csMatch[1];
        // Cơ sở 2, Co so 2, Cơ sở: 2
        const noTone = removeVietnameseTonesForQR(raw).toLowerCase();
        const coSoMatch = noTone.match(/co\s*so\s*:?\s*(\d+)/);
        if (coSoMatch) return 'CS' + coSoMatch[1];
        // Match against branchName1..branchName10 in settings
        const branchCount = Number(cfg.branchCount || 10);
        for (let i = 1; i <= branchCount; i++) {
            const name = String(cfg['branchName' + i] || '').trim();
            if (!name) continue;
            const nameNorm = removeVietnameseTonesForQR(name).toLowerCase().trim();
            const rawNorm  = removeVietnameseTonesForQR(raw).toLowerCase().trim();
            if (raw === name || rawNorm === nameNorm) return 'CS' + i;
        }
        return raw; // return as-is so old map keys still work
    }

    function getPaymentAccountForBranch(branchCode, settings) {
        const cfg = settings || window.__store?.settings || clubConfig || {};
        const accounts = cfg.paymentAccounts || {};
        const map = cfg.branchPaymentAccountMap || {};
        const normalizedKey = normalizeBranchKeyForPayment(branchCode, cfg);
        const selected =
            map[normalizedKey] ||
            map[String(branchCode || '')] ||
            map[removeVietnameseTonesForQR(String(branchCode || '')).toLowerCase()] ||
            'bank1';
        let account = accounts[selected];
        if (!account || account.enabled === false) account = accounts['bank1'];
        if (!account || (!account.bankId && !account.accountNo)) {
            return {
                bankKey: 'bank1',
                bankId: cfg.bankId || '',
                accountNo: cfg.accountNo || '',
                accountName: cfg.accountName || '',
                note: cfg.bankNote || ''
            };
        }
        return {
            bankKey: selected,
            bankId: account.bankId || cfg.bankId || '',
            accountNo: account.accountNo || cfg.accountNo || '',
            accountName: account.accountName || cfg.accountName || '',
            note: account.note || ''
        };
    }

    function maskAccountNumber(num) {
        const s = String(num || '');
        if (s.length <= 4) return '****';
        return '****' + s.slice(-4);
    }

    // ── Phase 4.0B-4J-4: testPaymentAccountForBranch debug helper ──────────
    window.testPaymentAccountForBranch = function testPaymentAccountForBranch(branchInput) {
        const acc = getPaymentAccountForBranch(branchInput, clubConfig);
        const result = {
            branchInput: branchInput,
            normalizedKey: normalizeBranchKeyForPayment(branchInput, clubConfig),
            bankKey: acc.bankKey || 'bank1',
            bankId: acc.bankId,
            accountNoMasked: maskAccountNumber(acc.accountNo),
            accountName: acc.accountName
        };
        console.table(result);
        return result;
    };

        window.printPaymentAccountMapping = function printPaymentAccountMapping() {
        const settings = window.__store?.settings || {};
        const result = {
            bank1Enabled: !!(settings.paymentAccounts?.bank1?.enabled ?? true),
            bank2Enabled: !!settings.paymentAccounts?.bank2?.enabled,
            bank1Id: maskAccountNumber(settings.paymentAccounts?.bank1?.accountNo || settings.accountNo),
            bank2Id: settings.paymentAccounts?.bank2?.enabled
                ? maskAccountNumber(settings.paymentAccounts?.bank2?.accountNo)
                : '(disabled)',
            branchPaymentAccountMap: settings.branchPaymentAccountMap || {}
        };
        console.table(result);
        return result;
    };

    window.toggleBank2Fields = function(enabled) {
        const el = document.getElementById('cfg_bank2Fields');
        if (el) el.style.display = enabled ? 'block' : 'none';
    };
    // ─────────────────────────────────────────────────────────────────────────


    
    // ── Phase 4.0B-4J-4: generateVietQR accepts optional branchOrAccount ─────
    function generateVietQR(amount, studentName, detailDesc, branchOrAccount) {
        const cName = removeVietnameseTonesForQR(studentName);
        const cDesc = removeVietnameseTonesForQR(detailDesc).replace(/\//g, '-');
        const addInfoText = `${cName} ${cDesc}`.trim().substring(0, 48);
        let _qrAcct = null;
        if (branchOrAccount && typeof branchOrAccount === 'object' && branchOrAccount.accountNo) {
            _qrAcct = branchOrAccount;
        } else if (branchOrAccount) {
            _qrAcct = getPaymentAccountForBranch(branchOrAccount, clubConfig);
        }
        const _bankId   = (_qrAcct && _qrAcct.bankId)    || clubConfig.bankId    || '';
        const _acctNo   = (_qrAcct && _qrAcct.accountNo) || clubConfig.accountNo || '';
        const _acctName = removeVietnameseTonesForQR((_qrAcct && _qrAcct.accountName) || clubConfig.accountName || '');
        return `https://img.vietqr.io/image/${_bankId}-${_acctNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(addInfoText)}&accountName=${encodeURIComponent(_acctName)}`;
    }

    document.getElementById('transactionForm').onsubmit = async (e) => {
        e.preventDefault(); if(window.userRole === 'viewer') return;
        const type = document.getElementById('type').value; const name = document.getElementById('description').value.trim(); const amount = Number(document.getElementById('amountActual').value); const date = document.getElementById('date').value; 
        
        const isSingleBranch = (clubConfig.branchCount === 1);
        const branch = isSingleBranch ? 'Mặc định' : document.getElementById('branch').value;
        const txMonth = date.substring(0, 7); const packageCount = parseInt(document.getElementById('tx_package').value) || 1;

        if(!name) return; let txData = { branch, type, description: name, date, timestamp: Date.now() }; 

        let monthsToRecord = [];
        let newPaidUntil = "";
        let profile = allProfiles[name] || {};

        if (type === 'Học phí' || type === 'Học phí + Lệ phí thi') {
            let [y, m] = txMonth.split('-').map(Number);
            for(let i=0; i<packageCount; i++) {
                let curM = m + i; let curY = y;
                while(curM > 12) { curM -= 12; curY += 1; }
                monthsToRecord.push(`${curY}-${curM.toString().padStart(2, '0')}`);
            }
            // [FIX BÁO NỢ] newPaidUntil = tháng cuối được ghi nhận, nhưng KHÔNG bao giờ thụt lùi về trước paidUntil hiện tại
            const _lastRecorded = monthsToRecord[monthsToRecord.length - 1] || txMonth;
            // [BƯỚC 2] Normalize paidUntil trước khi so sánh để tránh lỗi "2025-1" < "2025-01"
            const _normSavePaid = normalizeYYYYMM(profile.paidUntil);
            newPaidUntil = _lastRecorded > (_normSavePaid || '') ? _lastRecorded : (_normSavePaid || _lastRecorded);
        }

        if (type === 'Học phí + Lệ phí thi') { 
            const examAmount = Number(document.getElementById('tx_exam_amountActual').value); const examTitle = document.getElementById('tx_exam_title').value.trim(); 
            txData.tuitionAmount = amount; txData.examAmount = examAmount; txData.examTitle = examTitle; 
            txData.amount = amount + examAmount; txData.txMonth = txMonth; txData.packageMonths = monthsToRecord; 
        } else { 
            txData.amount = amount; 
            if(type === 'Học phí') { txData.txMonth = txMonth; txData.packageMonths = monthsToRecord; } 
        }
        
        await addDoc(colRef, txData);
        
        // [BƯỚC 1] Chỉ ghi các field thanh toán — KHÔNG ghi đè belt/branch/status/createdAt
        // từ snapshot cũ trong bộ nhớ (race condition khi 2 admin cùng thao tác)
        if(monthsToRecord.length > 0) {
            await updateDoc(doc(db, "clubs", currentClubId, "profiles", name), {
                paidUntil: newPaidUntil,
                paidMonths: arrayUnion(...monthsToRecord)
            });
            // [BƯỚC 3] Ghi audit log riêng — không bị xóa khi admin xóa giao dịch
            try {
                const _auditRef = collection(db, "clubs", currentClubId, "fee_audit");
                await addDoc(_auditRef, {
                    studentId: name,
                    amount: txData.amount,
                    date: getLocalToday(),
                    type: 'tuition',
                    month: newPaidUntil,
                    months: monthsToRecord,
                    by: window.currentUserEmail || 'admin',
                    timestamp: Date.now()
                });
            } catch(_) { /* audit log không chặn luồng chính */ }
        }
        
        e.target.reset(); document.getElementById('date').value = getLocalToday(); document.getElementById('tx_package').value = "1"; document.getElementById('tx_discount').checked = false; document.getElementById('tx_discount_pct').value = '10'; const _svdEl = document.getElementById('tx_discount_saved'); if(_svdEl) _svdEl.style.display = 'none'; document.getElementById('tx_exam_amountActual').value = ""; window.toggleTxFormType(); window.showToast("✅ Đã lưu khoản thu!");
    };

    window.openProfile = (name) => {
        const p = allProfiles[name];
        if(!p) return;
        document.getElementById('m_old_name').value = name;
        document.getElementById('m_name_input').value = name;
        document.getElementById('m_memberId').value = p.memberId || '';
        document.getElementById('m_status').value = p.status || 'active';
        document.getElementById('m_branch').value = p.branch || 'CS1';
        document.getElementById('m_belt').value = p.belt || 'Đai trắng - Cấp 10';
        document.getElementById('m_dob').value = p.dob || '';
        document.getElementById('m_gender').value = p.gender || '';
        document.getElementById('m_phone').value = p.phone || '';
        document.getElementById('m_cccd').value = p.cccd || '';
        document.getElementById('m_fee_actual').value = p.tuitionFee || '';
        document.getElementById('m_fee_display').value = p.tuitionFee ? parseInt(p.tuitionFee, 10).toLocaleString('vi-VN') : '';
        document.getElementById('m_paidUntil').value = p.paidUntil || '';
        document.getElementById('m_notes').value = p.notes || '';
        // [THÊM] Nạp biệt danh vào form chỉnh sửa hồ sơ
        const _mNickEl = document.getElementById('m_nickname'); if (_mNickEl) _mNickEl.value = p.nickname || '';
        document.getElementById('m_feeExempt').checked = p.feeExempt === true;
        renderAchievements(p.achievements || []);
        // Load lịch học vào các checkbox của form sửa hồ sơ
        document.querySelectorAll('.m_trainingDay').forEach(cb => {
            cb.checked = Array.isArray(p.trainingDays) && p.trainingDays.includes(parseInt(cb.value));
        });
        
        let skippedHtml = '';
        if(p.skippedMonths && p.skippedMonths.length > 0) {
            p.skippedMonths.forEach(m => {
                skippedHtml += `<span class="bg-amber-200 text-amber-800 text-[0.7rem] px-2 py-1 rounded font-bold cursor-pointer hover:bg-rose-200 shadow-sm" onclick="removeSkip('${name}', '${m}')" title="Bấm để xóa">Tháng ${formatMonth(m)} ✖</span>`;
            });
        } else {
            skippedHtml = '<span class="text-[0.7rem] text-amber-600/70 italic">Chưa có tháng báo nghỉ</span>';
        }
        document.getElementById('m_skipped').innerHTML = skippedHtml;
        // [SỬA ĐỒNG BỘ] Đảm bảo shifts đã load kể cả khi chưa mở tab Điểm Danh
        const _mShiftSel = document.getElementById('m_shift');
        if (_mShiftSel) {
            const _savedShiftId = p.trainingShiftId || '';
            (window._ensureClubShiftsLoaded ? window._ensureClubShiftsLoaded() : Promise.resolve()).then(function() {
                let _msHtml = '<option value="">-- Chọn ca tập --</option>';
                (window._getClubShifts ? window._getClubShifts() : []).forEach(function(s) {
                    const _t = (s.timeStart && s.timeEnd) ? ' (' + s.timeStart + '–' + s.timeEnd + ')' : '';
                    _msHtml += '<option value="' + s.id + '">' + s.name + _t + '</option>';
                });
                _mShiftSel.innerHTML = _msHtml;
                _mShiftSel.value = _savedShiftId;
            });
        }
        document.getElementById('profileModal').style.display = 'flex';
    };

    window.updateProfile = async () => {
        if(window.userRole === 'viewer') return; 
        const oldName = document.getElementById('m_old_name').value.trim(); const newName = document.getElementById('m_name_input').value.trim(); const newStatus = document.getElementById('m_status').value;
        const isSingleBranch = (clubConfig.branchCount === 1);
        if (!newName) return alert("Tên võ sinh không được để trống!");
        
        let updateData = { 
            status: newStatus, 
            memberId: document.getElementById('m_memberId').value.trim().toUpperCase(),
            branch: isSingleBranch ? 'Mặc định' : document.getElementById('m_branch').value, 
            belt: document.getElementById('m_belt').value, 
            phone: document.getElementById('m_phone').value, 
            tuitionFee: document.getElementById('m_fee_actual').value, 
            dob: document.getElementById('m_dob').value,
            gender: document.getElementById('m_gender').value,
            cccd: document.getElementById('m_cccd').value.trim(),
            notes: document.getElementById('m_notes').value,
            // [THÊM] Lưu biệt danh từ form sửa hồ sơ vào Firestore
            nickname: (document.getElementById('m_nickname') ? document.getElementById('m_nickname').value.trim() : ''),
            feeExempt: document.getElementById('m_feeExempt').checked,
            achievements: window._currentAchievements || [],
            // Lưu lịch học: mảng các thứ trong tuần (theo Date.getDay())
            trainingDays: Array.from(document.querySelectorAll('.m_trainingDay:checked')).map(cb => parseInt(cb.value)),
            // [THÊM] Lưu Ca tập đã chọn vào hồ sơ võ sinh (đồng bộ với Điểm Danh Ngày)
            trainingShiftId: document.getElementById('m_shift') ? document.getElementById('m_shift').value : ''
        };
        // Phase 4.0B-4J-8A: Ghi search index khi sửa hồ sơ võ sinh
        if (typeof buildStudentSearchIndex === 'function') {
            Object.assign(updateData, buildStudentSearchIndex(updateData, newName));
        }
        const updatedPaidUntil = document.getElementById('m_paidUntil').value;
        if(updatedPaidUntil) updateData.paidUntil = updatedPaidUntil;

        if (newStatus === 'quit' && (allProfiles[oldName] || {}).status !== 'quit') updateData.quitDate = getLocalToday(); 
        else if (newStatus === 'active') {
            updateData.quitDate = null;
            if ((allProfiles[oldName] || {}).status === 'quit') {
                const todayYYYYMM = getLocalToday().substring(0, 7);
                let [ry, rm] = todayYYYYMM.split('-').map(Number);
                rm -= 1; if (rm === 0) { rm = 12; ry -= 1; }
                updateData.paidUntil = `${ry}-${String(rm).padStart(2, '0')}`;
            }
        }

        try {
            if (oldName !== newName) {
                if (allProfiles[newName]) return alert("Tên võ sinh đã tồn tại!");
                if (!confirm(`Bạn có chắc muốn đổi tên từ "${oldName}" thành "${newName}"?\nHệ thống sẽ tự động cập nhật tên mới trên tất cả hóa đơn.`)) return;
                updateData.createdAt = (allProfiles[oldName] || {}).createdAt || getLocalToday();
                if (allProfiles[oldName].skippedMonths) updateData.skippedMonths = allProfiles[oldName].skippedMonths;
                if (allProfiles[oldName].paidUntil) updateData.paidUntil = allProfiles[oldName].paidUntil;

                // [4.0B-4J-8A] Fixed: tách rename thành 2 giai đoạn — profile rename trước, tx updates sau (paginated).
                // Trước đây: profile + tx updates trong 1 batch → giới hạn 500 writes, bỏ sót tx nếu CLB lớn.
                // Bây giờ: profile rename trong 1 batch nhỏ → tx updates theo fetchQueryPages → batches 400.
                const _profileRenameBatch = writeBatch(db);
                _profileRenameBatch.set(doc(db, "clubs", currentClubId, "profiles", newName), updateData);
                _profileRenameBatch.delete(doc(db, "clubs", currentClubId, "profiles", oldName));
                await _profileRenameBatch.commit();

                // Paginated tx scan — dùng fetchQueryPages để xử lý võ sinh có nhiều tx lịch sử
                const _allOldTxDocs = await fetchQueryPages(
                    ({ cursor, pageSize }) => {
                        const _c = [
                            where("description", ">=", oldName),
                            where("description", "<=", oldName + '\uf8ff'),
                            orderBy("description"),
                            limit(pageSize)
                        ];
                        if (cursor) _c.splice(_c.length - 1, 0, startAfter(cursor));
                        return query(colRef, ..._c);
                    },
                    { pageSize: 200, reason: 'rename-tx-scan', domain: 'transactions' }
                );
                const _txUpdates = [];
                _allOldTxDocs.forEach(tDoc => {
                    let t = tDoc.data(); let needsUpdate = false; let updatedDesc = t.description;
                    if (t.description === oldName) { updatedDesc = newName; needsUpdate = true; }
                    else if (t.description && t.description.startsWith(oldName + " (Thi lên")) { updatedDesc = t.description.replace(oldName, newName); needsUpdate = true; }
                    else if (t.description && t.description.includes(oldName)) { updatedDesc = t.description.replace(oldName, newName); needsUpdate = true; }
                    if (needsUpdate) _txUpdates.push({ id: tDoc.id, desc: updatedDesc });
                });
                for (let _ti = 0; _ti < _txUpdates.length; _ti += 400) {
                    const _txB = writeBatch(db);
                    _txUpdates.slice(_ti, _ti + 400).forEach(({ id, desc }) => {
                        _txB.update(doc(db, "clubs", currentClubId, "transactions", id), { description: desc });
                    });
                    await _txB.commit();
                }
                window.showToast("✅ Đã cập nhật và đồng bộ tên mới thành công!");
            } else {
                await setDoc(doc(db, "clubs", currentClubId, "profiles", oldName), updateData, { merge: true });
                window.showToast("✅ Đã cập nhật hồ sơ!");
            }
            closeModal();
        } catch (error) { console.error("Lỗi cập nhật:", error); alert("Đã xảy ra lỗi hệ thống khi lưu thay đổi!"); }
    };

    window.deleteProfile = async () => { 
        const targetName = document.getElementById('m_old_name').value.trim();
        if(window.userRole !== 'viewer' && confirm(`⚠️ Xóa vĩnh viễn hồ sơ "${targetName}"? Lịch sử đóng tiền sẽ vẫn còn lưu nhưng sẽ bị mồ côi.`)) { 
            await deleteDoc(doc(db, "clubs", currentClubId, "profiles", targetName)); closeModal(); window.showToast("✅ Đã xóa hồ sơ!"); 
        } 
    };

    window.skipMonth = async (name, month) => { await setDoc(doc(db, "clubs", currentClubId, "profiles", name.trim()), { skippedMonths: arrayUnion(month) }, { merge: true }); window.showToast("✅ Đã miễn phí tháng!"); };
    window.removeSkip = async (name, month) => { if(window.userRole !== 'viewer' && confirm(`Hủy báo nghỉ tháng ${formatMonth(month)} cho ${name}?`)) { await setDoc(doc(db, "clubs", currentClubId, "profiles", name.trim()), { skippedMonths: arrayRemove(month) }, { merge: true }); closeModal(); window.showToast("✅ Đã khôi phục nợ!"); } };

    window._currentAchievements = [];

    function renderAchievements(list) {
        window._currentAchievements = list ? [...list] : [];
        const el = document.getElementById('m_achievements');
        if (!el) return;
        if (!list || list.length === 0) {
            el.innerHTML = '<span style="font-size:0.72rem;color:#a16207;font-style:italic;">Chưa có thành tích nào được ghi nhận.</span>';
            return;
        }
        const byYear = {};
        list.forEach((a, i) => { const y = a.year || '?'; if (!byYear[y]) byYear[y] = []; byYear[y].push({ ...a, _idx: i }); });
        const years = Object.keys(byYear).sort((a, b) => b - a);
        el.innerHTML = years.map(y => `
            <div style="margin-bottom:4px;">
                <div style="font-size:0.65rem;font-weight:900;color:#854d0e;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Năm ${y}</div>
                ${byYear[y].map(a => `
                    <div style="display:flex;align-items:center;gap:8px;background:white;border:1px solid #fde68a;border-radius:8px;padding:7px 10px;margin-bottom:3px;">
                        <span style="font-size:1rem;">🏅</span>
                        <div style="flex:1;min-width:0;">
                            <span style="font-weight:700;font-size:0.82rem;color:#1e293b;">${a.tournament}</span>
                            <span style="margin-left:8px;font-size:0.72rem;font-weight:700;color:#15803d;background:#dcfce7;border:1px solid #bbf7d0;padding:2px 7px;border-radius:5px;">${a.result}</span>
                        </div>
                        <button type="button" onclick="removeAchievement(${a._idx})" style="color:#f87171;background:none;border:none;font-weight:900;font-size:0.9rem;cursor:pointer;padding:0 2px;" title="Xóa">✖</button>
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    window.addAchievementRow = () => {
        const year = document.getElementById('m_ach_year').value.trim();
        const tournament = document.getElementById('m_ach_tournament').value.trim();
        const result = document.getElementById('m_ach_result').value.trim();
        if (!year || !tournament || !result) return alert('Vui lòng nhập đủ: Năm, Tên giải đấu và Kết quả!');
        if (isNaN(year) || year < 2000 || year > 2099) return alert('Năm không hợp lệ!');
        window._currentAchievements.push({ year, tournament, result });
        renderAchievements(window._currentAchievements);
        document.getElementById('m_ach_year').value = '';
        document.getElementById('m_ach_tournament').value = '';
        document.getElementById('m_ach_result').value = '';
    };

    window.removeAchievement = (idx) => {
        window._currentAchievements.splice(idx, 1);
        renderAchievements(window._currentAchievements);
    };

    window.handleQuitOption = (name, month) => {
        if(confirm(`Võ sinh ${name} có tiếp tục tập không?\n- Bấm OK để báo NGHỈ TẬP luôn.\n- Bấm Cancel để chỉ BÁO NGHỈ THÁNG NÀY (miễn học phí tháng ${formatMonth(month)}).`)) {
            let updateData = { status: 'quit', quitDate: getLocalToday() };
            setDoc(doc(db, "clubs", currentClubId, "profiles", name), updateData, { merge: true }).then(() => {
                window.showToast("✅ Đã chuyển trạng thái Nghỉ tập!");
            });
        } else {
            if(confirm(`Xác nhận miễn nợ học phí tháng ${formatMonth(month)} cho ${name}?`)) window.skipMonth(name, month);
        }
    };

    window.formatMonthCompact = (monthsStr) => {
        if(!monthsStr || !monthsStr.includes(',')) return formatMonth(monthsStr);
        const months = monthsStr.split(',').map(s => s.trim());
        const byYear = {};
        months.forEach(m => { const [y, mo] = m.split('-'); if(!byYear[y]) byYear[y] = []; byYear[y].push(mo); });
        return Object.keys(byYear).sort().map(y => byYear[y].join('-') + '/' + y).join(', ');
    };

    window.generateMultiMonthPaymentRequest = (name, monthsStr, branch, amount) => {
        window.exportReceipt(name, Number(amount), 'Học phí', getLocalToday(), monthsStr, branch, '', 'PHIẾU BÁO HỌC PHÍ');
    };

    window.copyAndOpenZalo = (name, monthsStr, phone) => {
        const p = allProfiles[name];
        let fee = p ? (p.tuitionFee || 0) : 0;
        let monthsLabel = window.formatMonthCompact(monthsStr);
        let monthCount = monthsStr.includes(',') ? monthsStr.split(',').length : 1;
        let totalFee = monthCount * parseInt(fee);
        const _clubNameForMsg = clubConfig.clubName || 'CLB Taekwondo';
        let msg = `${_clubNameForMsg} thông báo:\nVõ sinh ${name} còn nợ học phí kỳ ${monthsLabel}.\nTổng số tiền: ${totalFee.toLocaleString('vi-VN')}đ.\nPhụ huynh vui lòng đóng học phí nhé!`;
        let zphone = phone ? phone.replace(/^0/, '84') : '';
        let zaloUrl = zphone ? `https://zalo.me/${zphone}` : 'https://zalo.me/';

        const _zm = document.getElementById('_zaloMsgModal');
        if (_zm) {
            document.getElementById('_zaloMsgText').value = msg;
            document.getElementById('_zaloMsgPhone').textContent = phone || '(chưa có SĐT)';
            document.getElementById('_zaloMsgName').textContent = name;
            document.getElementById('_zaloOpenBtn').onclick = () => { window.open(zaloUrl, '_blank'); };
            document.getElementById('_zaloOpenBtn').style.display = phone ? '' : 'none';
            _zm.style.display = 'flex';
            document.getElementById('_zaloMsgText').select();
            return;
        }

        const _copyFallback = () => {
            const ta = document.createElement('textarea');
            ta.value = msg; ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta);
            window.showToast("✅ Đã copy tin nhắn!");
            if (phone) window.open(zaloUrl, '_blank');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(msg).then(() => {
                window.showToast("✅ Đã copy tin nhắn!");
                if (phone) window.open(zaloUrl, '_blank');
            }).catch(_copyFallback);
        } else {
            _copyFallback();
        }
    };

    (function _injectZaloModal() {
        if (document.getElementById('_zaloMsgModal')) return;
        const el = document.createElement('div');
        el.id = '_zaloMsgModal';
        el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:20000;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);';
        el.innerHTML = `
        <div style="background:#fff;width:100%;max-width:520px;border-radius:20px 20px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -10px 40px rgba(0,0,0,0.2);animation:slideUpSheet 0.3s cubic-bezier(0.16,1,0.3,1);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <div>
                    <div style="font-size:1rem;font-weight:900;color:#0068FF;display:flex;align-items:center;gap:7px;">💬 Gửi nhắc nợ qua Zalo</div>
                    <div style="font-size:0.72rem;color:#64748b;margin-top:2px;">Võ sinh: <strong id="_zaloMsgName"></strong> · SĐT: <strong id="_zaloMsgPhone"></strong></div>
                </div>
                <button onclick="document.getElementById('_zaloMsgModal').style.display='none'" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;">&times;</button>
            </div>
            <label style="font-size:0.68rem;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px;">📝 Nội dung tin nhắn (chỉnh sửa tự do)</label>
            <textarea id="_zaloMsgText" rows="5" style="width:100%;border:1.5px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:0.92rem;line-height:1.6;color:#1e293b;background:#f8fafc;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;"></textarea>
            <div style="display:flex;gap:10px;margin-top:12px;">
                <button onclick="(function(){const t=document.getElementById('_zaloMsgText');const v=t.value;const fb=()=>{const ta=document.createElement('textarea');ta.value=v;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);window.showToast('✅ Đã copy!');};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v).then(()=>window.showToast('✅ Đã copy!')).catch(fb);}else{fb();}})()" style="flex:1;background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px;font-weight:700;font-size:0.85rem;cursor:pointer;color:#334155;">📋 Copy</button>
                <button id="_zaloOpenBtn" style="flex:2;background:#0068FF;color:white;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:0.88rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">💬 Mở Zalo &amp; Gửi</button>
            </div>
            <p style="font-size:0.63rem;color:#94a3b8;text-align:center;margin-top:10px;line-height:1.5;">Bấm "Copy" → mở Zalo → dán tin nhắn → gửi.<br>Hoặc bấm "Mở Zalo" để vào chat trực tiếp.</p>
        </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', e => { if (e.target === el) el.style.display = 'none'; });
    })();

    let _bulkZaloDebtors = [];
    let _bulkZaloIdx = 0;

    window.openBulkZaloModal = () => {
        const selMonth = document.getElementById('filterMonth').value;
        const selBranch = document.getElementById('filterBranch').value;
        const isSingleBranch = clubConfig.branchCount === 1;

        _bulkZaloDebtors = [];
        Object.keys(allProfiles).sort().forEach(name => {
            const p = allProfiles[name];
            if (p.status !== 'active') return;
            if (p.feeExempt) return;
            if (!isSingleBranch && selBranch !== 'all' && p.branch !== selBranch) return;

            let owedMonths = [];
            if (!p.skippedMonths || !p.skippedMonths.includes(selMonth)) {
                let firstUnpaid = p.paidUntil ? addMonthsToYYYYMM(p.paidUntil, 1) : (p.createdAt ? p.createdAt.substring(0, 7) : selMonth);
                let cur = firstUnpaid;
                // [SỬA BÁO NỢ] Thêm giới hạn 24 tháng giống renderApp — tránh vòng lặp vô hạn
                while(cur <= selMonth && owedMonths.length < 24) { if(!p.skippedMonths || !p.skippedMonths.includes(cur)) owedMonths.push(cur); cur = addMonthsToYYYYMM(cur, 1); }
            }
            if (owedMonths.length === 0) return;

            const owedMonthsStr = owedMonths.join(',');
            const monthsLabel = window.formatMonthCompact(owedMonthsStr);
            const totalFee = owedMonths.length * (Number(p.tuitionFee) || 0);
            _bulkZaloDebtors.push({ name, phone: p.phone || '', owedMonthsStr, monthsLabel, totalFee });
        });

        _bulkZaloIdx = 0;
        document.getElementById('bulkZaloSubtitle').textContent = `${_bulkZaloDebtors.length} võ sinh chưa đóng học phí tháng ${formatMonth(selMonth)}`;
        document.getElementById('bulkZaloProgressWrap').style.display = 'none';
        document.getElementById('bulkZaloProgressBar').style.width = '0%';
        document.getElementById('bulkZaloProgressText').textContent = '0 / 0 đã gửi';
        _renderBulkZaloList();
        document.getElementById('bulkZaloModal').style.display = 'flex';
    };

    window.closeBulkZaloModal = () => { document.getElementById('bulkZaloModal').style.display = 'none'; };

    function _renderBulkZaloList() {
        const el = document.getElementById('bulkZaloList');
        if (_bulkZaloDebtors.length === 0) {
            el.innerHTML = '<div style="text-align:center;padding:36px;color:#94a3b8;font-weight:700;">✅ Không có võ sinh nào đang nợ học phí!</div>';
            return;
        }
        el.innerHTML = _bulkZaloDebtors.map((d, i) => {
            const hasPhone = !!d.phone;
            return `<div id="bzRow_${i}" style="display:flex;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px solid #f1f5f9;border-radius:8px;background:#fff;margin-bottom:2px;">
                <div style="width:26px;height:26px;min-width:26px;background:#e0edff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.72rem;color:#0044CC;">${i+1}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:800;font-size:0.88rem;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.name}</div>
                    <div style="font-size:0.72rem;color:#64748b;margin-top:1px;">Kỳ: <span style="font-weight:700;color:#0033A0;">${d.monthsLabel}</span>${d.totalFee > 0 ? ' · <b>' + d.totalFee.toLocaleString('vi-VN') + ' ₫</b>' : ''} ${hasPhone ? '' : '<span style="color:#ef4444;font-weight:700;">· Chưa có SĐT</span>'}</div>
                </div>
                <button onclick="sendBulkZaloOne(${i})" style="background:${hasPhone ? '#0068FF' : '#cbd5e1'};color:#fff;border:none;padding:6px 11px;border-radius:8px;font-weight:700;font-size:0.78rem;cursor:${hasPhone ? 'pointer' : 'not-allowed'};" ${hasPhone ? '' : 'disabled'}>💬</button>
            </div>`;
        }).join('');
    }

    window.sendBulkZaloOne = (idx) => {
        const d = _bulkZaloDebtors[idx];
        if (!d || !d.phone) { window.showToast('⚠️ Võ sinh này chưa có số điện thoại!'); return; }
        const clubName = clubConfig.clubName || 'CLB Taekwondo';
        const msg = `${clubName} thông báo:\nVõ sinh ${d.name} chưa đóng học phí kỳ ${d.monthsLabel}.${d.totalFee > 0 ? '\nSố tiền: ' + d.totalFee.toLocaleString('vi-VN') + ' ₫.' : ''}\nPhụ huynh vui lòng liên hệ HLV để đóng học phí. Xin cảm ơn!`;
        const row = document.getElementById(`bzRow_${idx}`);
        navigator.clipboard.writeText(msg).then(() => {
            window.showToast('✅ Đã copy tin nhắn — mở Zalo...');
            if (row) { row.style.background = '#f0fff4'; row.style.border = '1px solid #86efac'; }
        }).catch(() => {});
        const zphone = d.phone.replace(/^0/, '84');
        window.open(`https://zalo.me/${zphone}`, '_blank');
    };

    window.startSequentialBulkZalo = async () => {
        if (_bulkZaloDebtors.length === 0) { window.showToast('Không có võ sinh nào trong danh sách!'); return; }
        document.getElementById('bulkZaloProgressWrap').style.display = 'block';
        _bulkZaloIdx = 0;
        for (let i = 0; i < _bulkZaloDebtors.length; i++) {
            _bulkZaloIdx = i + 1;
            const total = _bulkZaloDebtors.length;
            document.getElementById('bulkZaloProgressText').textContent = `${_bulkZaloIdx} / ${total} đã gửi`;
            document.getElementById('bulkZaloProgressBar').style.width = (_bulkZaloIdx / total * 100) + '%';
            const d = _bulkZaloDebtors[i];
            if (d.phone) {
                window.sendBulkZaloOne(i);
                if (i < total - 1) {
                    const next = _bulkZaloDebtors[i + 1];
                    const goOn = confirm(`✅ Đã gửi cho ${d.name} (${i+1}/${total})\n\nTiếp theo: ${next.name}\n\nBấm OK để gửi tiếp, Huỷ để dừng lại.`);
                    if (!goOn) break;
                }
            }
        }
        window.showToast(`✅ Hoàn thành! Đã gửi thông báo cho ${_bulkZaloIdx} võ sinh.`);
    };

    let _addStudentInProgress = false;
    window.addNewStudent = async () => {
        if(window.userRole === 'viewer') return;
        if(_addStudentInProgress) return;
        const name = document.getElementById('add_name').value.trim(); const joinDate = document.getElementById('add_date').value;
        const fee = Number(document.getElementById('add_fee_actual').value) || Number((document.getElementById('add_fee_display').value || '').replace(/[^0-9]/g, '')) || 0;
        const uniformSize = document.getElementById('add_uniform_size').value.trim();
        const uniformFee = Number(document.getElementById('add_uniform_actual').value) || Number((document.getElementById('add_uniform_display').value || '').replace(/[^0-9]/g, '')) || 0;
        const packageCount = parseInt(document.getElementById('add_package').value) || 1; const isGift = document.getElementById('add_uniform_gift').checked;
        const isSingleBranch = (clubConfig.branchCount === 1); const branch = isSingleBranch ? 'Mặc định' : document.getElementById('add_branch').value;
        const memberId = document.getElementById('add_memberId').value.trim().toUpperCase();

        if(!name) { window.showToast('⚠️ Vui lòng nhập họ tên võ sinh!', 3000); const el = document.getElementById('add_name'); if(el){ el.focus(); el.style.borderColor='#ef4444'; setTimeout(()=>{ el.style.borderColor=''; },3000); } return; }
        if(!isGift && uniformFee > 0 && !uniformSize) { window.showToast('⚠️ Vui lòng chọn Size Võ phục!', 3000); const el = document.getElementById('add_uniform_size'); if(el){ el.focus(); el.style.borderColor='#ef4444'; setTimeout(()=>{ el.style.borderColor=''; },3000); } return; }
        _addStudentInProgress = true;
        // [SỬA] Xử lý trùng tên — luôn tạo key riêng để KHÔNG overwrite dữ liệu võ sinh cũ.
        // _saveKey = key lưu Firestore; name = tên hiển thị trong biên lai/giao dịch.
        let _saveKey = name;
        if (allProfiles[name]) {
            const _newDobRaw  = document.getElementById('add_dob').value;
            const _newDobYear = _newDobRaw
                ? (_newDobRaw.includes('-') ? _newDobRaw.split('-')[0] : (_newDobRaw.split('/')[2] || ''))
                : '';
            const _exDobRaw  = allProfiles[name].dob || '';
            const _exDobYear = _exDobRaw
                ? (_exDobRaw.includes('-') ? _exDobRaw.split('-')[0] : (_exDobRaw.split('/')[2] || ''))
                : '';
            const _newNick = (document.getElementById('add_nickname') ? document.getElementById('add_nickname').value.trim() : '');
            if (_newDobYear && _exDobYear && _newDobYear === _exDobYear) {
                // Trùng tên VÀ trùng năm sinh → bắt buộc nhập biệt danh
                if (!_newNick) {
                    alert('⚠️ Đã có võ sinh tên "' + name + '" sinh năm ' + _newDobYear + '!\n\nVui lòng nhập Biệt danh (ví dụ: A, B, Lớn, Nhỏ...) để phân biệt hai võ sinh này trước khi lưu.');
                    const _nickEl = document.getElementById('add_nickname');
                    if (_nickEl) _nickEl.focus();
                    return;
                }
                // Có biệt danh: dùng "Tên (năm-Biệt danh)" để phân biệt, badge tím trong profile là đủ
                _saveKey = name + ' (' + _newDobYear + '-' + _newNick + ')';
            } else {
                // Cùng tên nhưng khác năm sinh: dùng "Tên (năm sinh)" làm key riêng
                const _useYr = _newDobYear || (_exDobYear ? String(parseInt(_exDobYear, 10) + 1) : '');
                _saveKey = name + (_useYr ? ' (' + _useYr + ')' : ' (' + Date.now() + ')');
            }
        }

        let startMonth = joinDate.substring(0, 7); let monthsToRecord = []; let [y, m] = startMonth.split('-').map(Number);
        for(let i=0; i<packageCount; i++) { let curM = m + i; let curY = y; while(curM > 12) { curM -= 12; curY += 1; } monthsToRecord.push(`${curY}-${curM.toString().padStart(2, '0')}`); }
        
        let newPaidUntil = addMonthsToYYYYMM(startMonth, packageCount - 1);

        // Lấy các ngày học đã chọn trong tuần (mảng số nguyên theo Date.getDay())
        const trainingDays = Array.from(document.querySelectorAll('.add_trainingDay:checked')).map(cb => parseInt(cb.value));
        // [THÊM] Đọc biệt danh từ form — lưu vào hồ sơ để hiển thị trên thẻ điểm danh
        const _addNickEl = document.getElementById('add_nickname');
        const _addNickVal = _addNickEl ? _addNickEl.value.trim() : '';
        // [SỬA] Dùng _saveKey (không phải name) làm Firestore doc ID để tránh overwrite
        const _newProfileData = { status: 'active', memberId: memberId, branch, belt: document.getElementById('add_belt').value, dob: document.getElementById('add_dob').value, gender: document.getElementById('add_gender').value, cccd: document.getElementById('add_cccd').value.trim(), phone: document.getElementById('add_phone').value, tuitionFee: document.getElementById('add_fee_default_actual').value, notes: document.getElementById('add_notes').value.trim(), nickname: _addNickVal, trainingDays: trainingDays,
        trainingShiftId: (document.getElementById('add_shift') ? document.getElementById('add_shift').value : ''), createdAt: joinDate, paidUntil: newPaidUntil, paidMonths: monthsToRecord };
        // Phase 4.0B-4J-8A: Ghi search index khi thêm võ sinh mới
        if (typeof buildStudentSearchIndex === 'function') {
            Object.assign(_newProfileData, buildStudentSearchIndex(_newProfileData, _saveKey));
        }
        await setDoc(doc(db, "clubs", currentClubId, "profiles", _saveKey), _newProfileData);
        
        if(fee > 0) { await addDoc(colRef, { branch, type: 'Học phí', description: _saveKey, amount: fee, date: joinDate, txMonth: startMonth, packageMonths: monthsToRecord, timestamp: Date.now() }); }
        
        if(uniformSize) { 
            const invDoc = await addDoc(invRef, { size: uniformSize, type: 'Xuất bán', qty: 1, desc: _saveKey, amount: uniformFee, date: joinDate, timestamp: Date.now() + 2 }); 
            if(isGift) { await addDoc(colRef, { branch: 'Chung', type: 'Tặng Võ phục', description: `Tặng ${uniformSize} cho ${_saveKey}`, amount: 0, date: joinDate, timestamp: Date.now() + 1, relatedInvId: invDoc.id }); } 
            else if (uniformFee > 0) { await addDoc(colRef, { branch: 'Chung', type: 'Thu Võ phục', description: _saveKey, uniformSize, amount: uniformFee, date: joinDate, timestamp: Date.now() + 1, relatedInvId: invDoc.id }); } 
            
            await setDoc(doc(db, "clubs", currentClubId, "settings", "inventory_stats"), { 
                [uniformSize + '_balance']: increment(-1),
                [uniformSize + '_out']: increment(1)
            }, { merge: true });
        }
        closeAddModal();
        window.showToast("🎉 Đã thêm võ sinh " + _saveKey + " thành công!", 3000);

        // Generate combined receipt for tuition + uniform
        const totalPayment = fee + (isGift ? 0 : uniformFee);
        if (totalPayment > 0 && window.exportReceipt) {
            const breakdown = [];
            if (fee > 0) breakdown.push({ label: 'Học phí tháng ' + startMonth.replace('-', '/'), amount: fee });
            if (!isGift && uniformFee > 0) breakdown.push({ label: 'Võ phục ' + (uniformSize || ''), amount: uniformFee });
            const receiptType = fee > 0 && !isGift && uniformFee > 0 ? 'Học phí + Võ phục' : (fee > 0 ? 'Học phí' : 'Võ phục');
            if (!allProfiles[_saveKey]) {
                allProfiles[_saveKey] = { belt: document.getElementById('add_belt').value, branch, tuitionFee: document.getElementById('add_fee_default_actual').value };
            }
            await window.exportReceipt(_saveKey, totalPayment, receiptType, joinDate, startMonth, branch, '', 'BIÊN LAI THU TIỀN', breakdown.length > 1 ? breakdown : null);
        }
        _addStudentInProgress = false;
    };

    document.getElementById('inventoryForm').onsubmit = async (e) => {
        e.preventDefault(); if(window.userRole === 'viewer') return alert("Tài khoản khách không thể nhập xuất kho!");
        const category = document.getElementById('inv_category').value || 'Võ phục';
        // Đọc size từ element đang hiển thị (dropdown khi Võ phục hoặc danh mục có sizes, text khi nhập tự do)
        const _invSizeEl = document.getElementById('inv_size');
        const _invSizeTxtEl = document.getElementById('inv_size_text');
        const size = (_invSizeEl && _invSizeEl.style.display !== 'none'
            ? _invSizeEl.value
            : (_invSizeTxtEl ? _invSizeTxtEl.value : '')).trim();
        if(!size) return alert("Vui lòng nhập kích cỡ hàng hóa!");
        const type = document.getElementById('inv_type').value; const qty = Number(document.getElementById('inv_qty').value); const desc = document.getElementById('inv_desc').value.trim(); const amount = Number(document.getElementById('inv_totalActual').value); const date = document.getElementById('inv_date').value; const branch = 'Chung';
        
        const isUnpaid = type === 'Xuất bán' && document.getElementById('inv_unpaid') && document.getElementById('inv_unpaid').checked;
        const invData = { category, size, type, qty, desc, amount, date, timestamp: Date.now() };
        if(isUnpaid) invData.unpaid = true;
        const invDoc = await addDoc(invRef, invData);
        
        if (amount > 0) {
             await addDoc(colRef, { branch, type: type === 'Nhập kho' ? `Chi ${category}` : `Thu ${category}`, description: type === 'Nhập kho' ? `Nhập ${category} ${size} từ ${desc}` : `Bán ${category} ${size} cho ${desc}`, amount, date, timestamp: Date.now(), relatedInvId: invDoc.id });
        } else if (type === 'Xuất bán') {
             await addDoc(colRef, { branch, type: `Tặng ${category}`, description: `Tặng ${category} ${size} cho ${desc}`, amount: 0, date, timestamp: Date.now(), relatedInvId: invDoc.id });
        }

        e.target.reset();
        // Khôi phục trạng thái mặc định sau khi submit (về Võ phục)
        document.getElementById('inv_size').style.display = '';
        document.getElementById('inv_size_text').style.display = 'none';
        document.getElementById('inv_priceActual').value = "";
        document.getElementById('inv_totalActual').value = "";
        document.getElementById('inv_date').value = getLocalToday();
        // Cập nhật lại dropdown danh mục (bao gồm tùy chỉnh)
        window.populateInvCategorySelects && window.populateInvCategorySelects();
        window.toggleInvType();
        window.showToast("✅ Đã cập nhật Kho!");
    };

    window.openEditInv = async (txId, invId) => {
        if(!invId || invId === 'undefined') return alert("Sản phẩm này ghi trước bản nâng cấp, không hỗ trợ sửa tự động. Hãy dùng nút Xóa để ghi lại!");
        try {
            const docSnap = await getDoc(doc(db, "clubs", currentClubId, "inventory", invId));
            if(docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('ei_txId').value = txId;
                document.getElementById('ei_invId').value = invId;
                const eiCat = data.category || 'Võ phục';
                document.getElementById('ei_category').value = eiCat;
                window.toggleEditInvSize();
                if(eiCat === 'Võ phục') { document.getElementById('ei_size').value = data.size || ''; }
                else { document.getElementById('ei_size_text').value = data.size || ''; }
                document.getElementById('ei_type').value = data.type || 'Xuất bán';
                document.getElementById('ei_qty').value = data.qty || 1;
                document.getElementById('ei_date').value = data.date || '';
                
                const txSnap = await getDoc(doc(db, "clubs", currentClubId, "transactions", txId));
                if(txSnap.exists()) {
                    document.getElementById('ei_desc').value = txSnap.data().description || '';
                    document.getElementById('ei_amountActual').value = txSnap.data().amount || 0;
                    document.getElementById('ei_amountDisplay').value = (txSnap.data().amount || 0).toLocaleString('vi-VN');
                }
                document.getElementById('editInvModal').style.display = 'flex';
            }
        } catch (e) { console.error(e); alert("Lỗi khi tải dữ liệu sửa kho!"); }
    };
    
    window.closeEditInvModal = () => document.getElementById('editInvModal').style.display = 'none';

    window.markInvPaid = async (invId) => {
        if(window.userRole !== 'admin') return;
        if(!confirm("Xác nhận đã thu tiền cho đơn hàng nợ này?")) return;
        try {
            await updateDoc(doc(db, "clubs", currentClubId, "inventory", invId), { unpaid: false });
            window.showToast("✅ Đã đánh dấu thu tiền xong!");
        } catch(err) { console.error(err); alert("Lỗi khi cập nhật!"); }
    };

    window.saveEditInv = async () => {
        if(window.userRole === 'viewer') return;
        let txId = document.getElementById('ei_txId').value; let invId = document.getElementById('ei_invId').value; let eiCat = document.getElementById('ei_category').value || 'Võ phục'; let size = (eiCat === 'Võ phục' ? document.getElementById('ei_size').value : document.getElementById('ei_size_text').value).trim(); let type = document.getElementById('ei_type').value; let qty = Number(document.getElementById('ei_qty').value); let date = document.getElementById('ei_date').value; let desc = document.getElementById('ei_desc').value.trim(); let amount = Number(document.getElementById('ei_amountActual').value);
        if(!txId || !invId) return alert("Lỗi ID giao dịch. Vui lòng tải lại trang!");
        await updateDoc(doc(db, "clubs", currentClubId, "inventory", invId), { category: eiCat, size, type, qty, date });
        let txType = type === 'Nhập kho' ? `Chi ${eiCat}` : `Thu ${eiCat}`; await updateDoc(doc(db, "clubs", currentClubId, "transactions", txId), { type: txType, description: desc, amount, date });
        document.getElementById('editInvModal').style.display = 'none'; window.showToast("✅ Đã sửa thành công dữ liệu kho!");
    };

    window.openEditExpense = async (txId) => {
        try {
            const txSnap = await getDoc(doc(db, "clubs", currentClubId, "transactions", txId));
            if(txSnap.exists()) {
                const data = txSnap.data();
                document.getElementById('eexp_txId').value = txId;
                document.getElementById('eexp_branch').value = data.branch || 'CS1';
                document.getElementById('eexp_desc').value = data.description || '';
                document.getElementById('eexp_amountActual').value = data.amount || 0;
                document.getElementById('eexp_amountDisplay').value = (data.amount || 0).toLocaleString('vi-VN');
                document.getElementById('eexp_date').value = data.date || getLocalToday();
                document.getElementById('editExpModal').style.display = 'flex';
            }
        } catch(e) { console.error(e); alert("Lỗi khi mở giao dịch!"); }
    };

    window.saveEditExpense = async () => {
        const txId = document.getElementById('eexp_txId').value;
        const branch = document.getElementById('eexp_branch').value;
        const desc = document.getElementById('eexp_desc').value;
        const amt = Number(document.getElementById('eexp_amountActual').value);
        const date = document.getElementById('eexp_date').value;
        
        await updateDoc(doc(db, "clubs", currentClubId, "transactions", txId), { branch: branch, description: desc, amount: amt, date: date });
        document.getElementById('editExpModal').style.display = 'none';
        window.showToast("✅ Đã sửa chi phí thành công!");
    };

    window.deleteTx = async (id, relatedInvId) => { 
        if(window.userRole !== 'viewer' && confirm("⚠️ Bạn có chắc muốn xóa giao dịch này? (Nếu là giao dịch kho sẽ không tự hoàn trả số dư, hãy chủ động cập nhật lại kho sau khi xóa)")) { 
            const txToDelete = allTransactions.find(t => t.id === id);
            await deleteDoc(doc(db, "clubs", currentClubId, "transactions", id)); 
            if (relatedInvId && relatedInvId !== 'undefined') await deleteDoc(doc(db, "clubs", currentClubId, "inventory", relatedInvId)); 
            if (txToDelete && (txToDelete.type === 'Học phí' || txToDelete.type === 'Học phí + Lệ phí thi')) {
                const studentName = (txToDelete.description || '').trim();
                if (studentName) {
                    // [SỬA BÁO NỢ] Truy vấn Firestore lấy TẤT CẢ giao dịch học phí của võ sinh
                // allTransactions chỉ chứa tháng đang xem → dùng sẽ tính sai paidUntil khi xóa tháng cũ
                // [4.0B-4J-8A] Fixed: thay limit(500) bằng fetchQueryPages — tính đúng paidUntil kể cả võ sinh nhiều năm
                const _stuTxDocs = await fetchQueryPages(
                    ({ cursor, pageSize }) => {
                        const _pC = [where("description", "==", studentName), orderBy("timestamp"), limit(pageSize)];
                        if (cursor) _pC.splice(-1, 0, startAfter(cursor));
                        return query(colRef, ..._pC);
                    },
                    { pageSize: 200, reason: 'paidUntil-recalc', domain: 'transactions' }
                );
                    const remainingMonths = [];
                    _stuTxDocs.forEach(tDoc => {
                        if (tDoc.id === id) return;
                        const _td = tDoc.data();
                        if (_td.type !== 'Học phí' && _td.type !== 'Học phí + Lệ phí thi') return;
                        if (_td.packageMonths) remainingMonths.push(..._td.packageMonths);
                        else if (_td.txMonth) remainingMonths.push(_td.txMonth);
                    });
                    const sortedRemaining = [...new Set(remainingMonths)].sort();
                    const newPaidUntil = sortedRemaining.length > 0 ? sortedRemaining[sortedRemaining.length - 1] : '';
                    const deletedMonths = txToDelete.packageMonths || (txToDelete.txMonth ? [txToDelete.txMonth] : []);
                    const profileRef = doc(db, "clubs", currentClubId, "profiles", studentName);
                    const profileUpdate = { paidUntil: newPaidUntil };
                    if (deletedMonths.length > 0) profileUpdate.paidMonths = arrayRemove(...deletedMonths);
                    await updateDoc(profileRef, profileUpdate);
                }
            }
            window.showToast("✅ Đã xóa!"); 
        } 
    };

    document.getElementById('expenseForm').onsubmit = async (e) => { 
        e.preventDefault(); 
        if(window.userRole !== 'viewer') { 
            const isSingleBranch = (clubConfig.branchCount === 1);
            const branch = isSingleBranch ? 'Mặc định' : document.getElementById('exp_branch').value;
            await addDoc(colRef, { branch: branch, type: 'Chi phí', description: document.getElementById('exp_desc').value.trim(), amount: Number(document.getElementById('exp_amountActual').value), date: document.getElementById('exp_date').value, timestamp: Date.now() }); 
            e.target.reset(); document.getElementById('exp_date').value = getLocalToday(); window.showToast("✅ Đã lưu khoản chi!"); 
        } 
    };
    
    document.getElementById('examExpenseForm').onsubmit = async (e) => {
        e.preventDefault();
        if(window.userRole !== 'viewer') {
            const _eeMonth = document.getElementById('filterMonth').value || getLocalToday().substring(0, 7);
            const _eeDate = _eeMonth === getLocalToday().substring(0, 7) ? getLocalToday() : (_eeMonth < getLocalToday().substring(0, 7) ? _eeMonth + '-28' : _eeMonth + '-01');
            await addDoc(colRef, { branch: 'Chung', type: 'Chi phí kỳ thi', description: document.getElementById('ee_desc').value.trim(), amount: Number(document.getElementById('ee_amountActual').value), date: _eeDate, txMonth: _eeMonth, timestamp: Date.now() });
            e.target.reset();
            window.showToast("✅ Đã lưu chi phí kỳ thi!");
        }
    };

    window.quickPay = async (name, monthsStr, branch, defaultFee, skipPrompt) => {
        // [SỬA THU HỌC PHÍ] Thay alert() bằng showToast() — alert() bị block trong webview/PWA
        if(window.userRole === 'viewer') { window.showToast('⚠️ Tài khoản khách không thể thu tiền!', 3000); return; }
        let cleanName = name.replace(/\\'/g, "'");
        let monthsList = monthsStr ? monthsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
        let lastMonth = monthsList.length > 0 ? monthsList[monthsList.length - 1] : monthsStr;
        let monthLabel = window.formatMonthCompact(monthsStr);
        let amount;
        if (skipPrompt && defaultFee && Number(String(defaultFee).replace(/\D/g,'')) > 0) {
            amount = Number(String(defaultFee).replace(/\D/g,''));
        } else {
            // [SỬA THU HỌC PHÍ] Fallback nếu gọi không có skipPrompt và không có modal
            // Trường hợp này không nên xảy ra sau khi openQuickPayModal đã được cập nhật
            let defaultAmountStr = defaultFee ? parseInt(defaultFee, 10).toLocaleString('vi-VN') : '0';
            let inputAmount = prompt(`XÁC NHẬN THU HỌC PHÍ\nVõ sinh: ${cleanName}\nKỳ học phí: ${monthLabel}\n\nNhập số tiền thu (VNĐ):`, defaultAmountStr);
            if (inputAmount === null) return;
            amount = Number(inputAmount.replace(/\D/g, ''));
            // [SỬA THU HỌC PHÍ] Thay alert() bằng showToast() cho validate số tiền
            if (amount <= 0) { window.showToast('⚠️ Số tiền không hợp lệ!', 2500); return; }
        }

        // Tính số tháng thực tế được đóng dựa vào số tiền nhập — tránh đánh dấu dư tháng chưa đóng
        let profile = allProfiles[cleanName] || {};
        const feePerMonth = Number(profile.tuitionFee) || 0;
        let paidMonthsList = monthsList.slice();
        if (feePerMonth > 0 && monthsList.length > 1) {
            const monthsPaid = Math.min(Math.floor(amount / feePerMonth), monthsList.length);
            paidMonthsList = monthsList.slice(0, monthsPaid > 0 ? monthsPaid : 1);
        }
        const actualLastMonth = paidMonthsList[paidMonthsList.length - 1] || lastMonth;
        const actualMonthLabel = window.formatMonthCompact(paidMonthsList.join(','));

        try {
            // [FIX MẤT GIAO DỊCH] Khi thu bù tháng cũ, lưu date trong tháng đó (không dùng hôm nay)
            // → giao dịch sẽ xuất hiện đúng khi lọc tháng đó.
            const _today = getLocalToday();
            const _txDate = actualLastMonth < _today.substring(0, 7) ? actualLastMonth + '-01' : _today;
            await addDoc(colRef, { branch: branch || 'CS1', type: 'Học phí', description: cleanName, amount: amount, date: _txDate, txMonth: actualLastMonth, packageMonths: paidMonthsList, timestamp: Date.now() });
            
            // [FIX BÁO NỢ] Không cho paidUntil thụt lùi: chỉ cập nhật nếu actualLastMonth tiến xa hơn hiện tại
            // [BƯỚC 2] Normalize paidUntil cũ để so sánh chuẩn YYYY-MM
            const _normQPaid = normalizeYYYYMM(profile.paidUntil);
            const _safeQPaidUntil = actualLastMonth > (_normQPaid || '') ? actualLastMonth : (_normQPaid || actualLastMonth);
            // [BƯỚC 1] Chỉ updateDoc các field thanh toán — KHÔNG ghi đè belt/branch/status/createdAt
            // setDoc(merge:true) với snapshot cũ là nguyên nhân gốc của race condition ghi đè dữ liệu
            await updateDoc(doc(db, "clubs", currentClubId, "profiles", cleanName), {
                paidUntil: _safeQPaidUntil,
                paidMonths: arrayUnion(...paidMonthsList)
            });
            // [BƯỚC 3] Ghi audit log riêng vào fee_audit — bản ghi này không bị xóa khi deleteTx
            try {
                const _qpAuditRef = collection(db, "clubs", currentClubId, "fee_audit");
                await addDoc(_qpAuditRef, {
                    studentId: cleanName,
                    amount: amount,
                    date: getLocalToday(),
                    type: 'tuition',
                    month: _safeQPaidUntil,
                    months: paidMonthsList,
                    by: window.currentUserEmail || 'admin',
                    timestamp: Date.now()
                });
            } catch(_) { /* audit log không chặn luồng chính */ }
            const _monthsCount = paidMonthsList.length;
            const _monthsLabel = paidMonthsList.map(m => { const [y, mo] = m.split('-'); return `tháng ${parseInt(mo)}/${y}`; }).join(', ');
            const _toastMsg = _monthsCount > 1
                ? `✅ ${cleanName} đóng học phí ${_monthsLabel} (${_monthsCount} tháng)!`
                : `✅ ${cleanName} đóng học phí ${_monthsLabel}!`;
            window.showToast(_toastMsg);
            if(window.exportReceipt) {
                const breakdown = [{ label: 'Học phí ' + actualMonthLabel, amount: amount }];
                await window.exportReceipt(cleanName, amount, 'Học phí', getLocalToday(), paidMonthsList.join(','), branch || 'CS1', '', 'BIÊN LAI THU TIỀN', breakdown);
            }
        } catch (error) { console.error("Lỗi:", error); window.showToast('⚠️ Lỗi hệ thống, vui lòng thử lại!', 4000); }
    };

    window.openQuickPayModal = (name, owedMonthsStr, branch) => {
        if(window.userRole === 'viewer') { window.showToast('⚠️ Tài khoản khách không thể thu tiền!', 3000); return; }
        const cleanName = name.replace(/\\'/g, "'");
        const monthsList = owedMonthsStr ? owedMonthsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
        const profile = allProfiles[cleanName] || {};
        const feePerMonth = Number(profile.tuitionFee) || 0;
        const totalMonths = monthsList.length;
        const modal = document.getElementById('quickPayModal');
        // [SỬA THU HỌC PHÍ] Truyền skipPrompt=true khi không có modal — dùng tổng phí tính sẵn, không prompt()
        if (!modal) { window.quickPay(name, owedMonthsStr, branch, (feePerMonth * totalMonths).toString(), true); return; }
        document.getElementById('qpm_name').textContent = cleanName + ' — ' + totalMonths + ' tháng chưa nộp';
        const optionsEl = document.getElementById('qpm_options');
        optionsEl.innerHTML = '';
        for (let i = 1; i <= totalMonths; i++) {
            const months = monthsList.slice(0, i);
            const amount = feePerMonth > 0 ? feePerMonth * i : 0;
            const monthsStr = months.join(',');
            const label = months.map(m => { const p = m.split('-'); return 'T' + parseInt(p[1]) + '/' + p[0]; }).join(', ');
            const btn = document.createElement('button');
            const isAll = (i === totalMonths);
            btn.setAttribute('type', 'button');
            btn.style.cssText = 'width:100%;padding:11px 14px;border-radius:11px;border:2px solid ' + (isAll ? '#059669' : '#e2e8f0') + ';background:' + (isAll ? '#ecfdf5' : '#f8fafc') + ';cursor:pointer;display:flex;justify-content:space-between;align-items:center;';
            const amtText = amount > 0 ? amount.toLocaleString('vi-VN') + ' ₫' : '(Tự nhập)';
            btn.innerHTML = '<span style="font-weight:700;color:#1e293b;font-size:0.88rem;">' + i + ' tháng <span style="font-weight:500;color:#64748b;font-size:0.78rem;">(' + label + ')</span></span><span style="font-weight:900;color:' + (isAll ? '#059669' : '#0033A0') + ';font-size:0.95rem;">' + amtText + '</span>';
            btn.onclick = () => {
                modal.style.display = 'none';
                window.quickPay(name, monthsStr, branch, amount > 0 ? String(amount) : String(feePerMonth * i), true);
            };
            optionsEl.appendChild(btn);
        }
        const customBtn = document.createElement('button');
        customBtn.setAttribute('type', 'button');
        customBtn.style.cssText = 'width:100%;padding:9px 14px;border-radius:11px;border:1px dashed #cbd5e1;background:#fff;cursor:pointer;color:#64748b;font-weight:600;font-size:0.82rem;margin-top:4px;';
        customBtn.textContent = '✏️ Nhập số tiền tùy chỉnh';
        // [SỬA THU HỌC PHÍ] Thay prompt() bằng input inline trong modal — prompt() bị block trong webview/PWA
        customBtn.onclick = () => {
            customBtn.style.display = 'none';
            const _row = document.createElement('div');
            _row.style.cssText = 'margin-top:8px;display:flex;gap:8px;align-items:center;';
            const _defaultVal = feePerMonth > 0 ? (feePerMonth * totalMonths).toLocaleString('vi-VN') : '';
            _row.innerHTML = '<input type="tel" id="qpm_custom_input" placeholder="Nhập số tiền (₫)..." style="flex:1;padding:9px 12px;border:1.5px solid #0033A0;border-radius:9px;font-size:0.88rem;font-weight:700;outline:none;box-sizing:border-box;" value="' + _defaultVal + '" />'
                + '<button type="button" id="qpm_custom_ok" style="padding:9px 14px;background:#059669;color:#fff;border:none;border-radius:9px;font-weight:800;font-size:0.85rem;cursor:pointer;white-space:nowrap;">✓ Thu</button>';
            optionsEl.appendChild(_row);
            const _inp = document.getElementById('qpm_custom_input');
            if (_inp) { _inp.focus(); _inp.select(); }
            const _doConfirm = () => {
                const _raw = (_inp ? _inp.value : '').replace(/\D/g, '');
                const _v = Number(_raw);
                if (!_v || _v <= 0) { window.showToast('⚠️ Số tiền không hợp lệ!', 2500); return; }
                modal.style.display = 'none';
                window.quickPay(name, owedMonthsStr, branch, String(_v), true);
            };
            const _okBtn = document.getElementById('qpm_custom_ok');
            if (_okBtn) _okBtn.onclick = _doConfirm;
            if (_inp) _inp.addEventListener('keypress', (ev) => { if (ev.key === 'Enter') _doConfirm(); });
        };
        optionsEl.appendChild(customBtn);
        modal.style.display = 'flex';
    };

    window.quickCollectExam = async (name, branch) => {
        // [SỬA] Thay alert() + prompt() bằng showToast() + openQuickPayModal có skipPrompt
        if(window.userRole === 'viewer') return window.showToast("⛔ Tài khoản khách không thể thu tiền!");
        let defaultFee = document.getElementById('exam_fee_all_actual').value || 250000;
        let inputAmount = prompt(`Nhập lệ phí thi của ${name}:`, defaultFee); if (!inputAmount) return; 
        let amount = Number(inputAmount.replace(/\D/g, '')); if (amount <= 0) return;
        const _curBelt = (allProfiles[name] && allProfiles[name].belt) || 'Đai trắng - Cấp 10';
        const _nextBelt = window.BELT_NEXT[_curBelt] || _curBelt;
        const _examMonth = document.getElementById('filterMonth').value || getLocalToday().substring(0, 7);
        const _examDate = _examMonth === getLocalToday().substring(0, 7) ? getLocalToday() : (_examMonth < getLocalToday().substring(0, 7) ? _examMonth + '-28' : _examMonth + '-01');
        await addDoc(colRef, { branch: branch || (allProfiles[name] && allProfiles[name].branch) || 'CS1', type: 'Lệ phí thi', description: `${name} (Thi lên ${_nextBelt})`, amount, date: _examDate, txMonth: _examMonth, timestamp: Date.now() });
        window.showToast(`✅ Đã thu lệ phí thi cho ${name}!`);
        window.renderExamList();
    };

    window.processCombo = async (action) => {
        let n1 = document.getElementById('combo_name1').value.trim(); let f1 = Number(document.getElementById('combo_fee1_actual').value) || 0; let m1 = document.getElementById('combo_month1').value;
        let n2 = document.getElementById('combo_name2').value.trim(); let f2 = Number(document.getElementById('combo_fee2_actual').value) || 0; let m2 = document.getElementById('combo_month2').value;

        // [SỬA] Thay alert() bằng showToast() trong processCombo
        if(!n1 && !n2) return window.showToast("⚠️ Vui lòng chọn ít nhất 1 võ sinh!");
        if(f1 + f2 <= 0) return window.showToast("⚠️ Tổng tiền phải lớn hơn 0!");

        let comboNames = []; let comboMonths = new Set();
        let b1 = allProfiles[n1] ? allProfiles[n1].branch : 'CS1'; let b2 = allProfiles[n2] ? allProfiles[n2].branch : 'CS1'; let branch = b1 || b2 || 'CS1';
        // Phase 4.0B-4J-4: warn if students are from different branches
        if (n1 && n2 && b1 && b2 && normalizeBranchKeyForPayment && normalizeBranchKeyForPayment(b1, clubConfig) !== normalizeBranchKeyForPayment(b2, clubConfig)) {
            console.warn('[PaymentAccount] Combo contains multiple branches; using first student\'s branch for receipt QR.');
        }

        if(n1) { comboNames.push(n1); comboMonths.add(m1); }
        if(n2) { comboNames.push(n2); comboMonths.add(m2); }

        let combinedNameStr = comboNames.join(" & "); let combinedMonthStr = Array.from(comboMonths).join(", "); let totalAmt = f1 + f2;

        try {
            if(action === 'pay') {
                // [FIX MẤT GIAO DỊCH] Date phải nằm trong tháng học phí, không dùng hôm nay cho tháng cũ
                const _todayCombo = getLocalToday(); const _todayMCombo = _todayCombo.substring(0, 7);
                if(n1 && f1 > 0) {
                    const _d1 = m1 < _todayMCombo ? m1 + '-01' : _todayCombo;
                    await addDoc(colRef, { branch: b1, type: 'Học phí', description: n1, amount: f1, date: _d1, txMonth: m1, packageMonths: [m1], timestamp: Date.now() });
                    // [BƯỚC 1] Đổi setDoc → updateDoc: chỉ ghi paidUntil, không ghi đè profile khác
                    // [BƯỚC 2] Normalize paidUntil trước khi so sánh
                    const _cu1 = normalizeYYYYMM((allProfiles[n1] && allProfiles[n1].paidUntil) || '');
                    const _np1 = m1 > _cu1 ? m1 : _cu1;
                    await updateDoc(doc(db, "clubs", currentClubId, "profiles", n1), { paidUntil: _np1 });
                    // [BƯỚC 3] Audit log cho thu gộp
                    try { await addDoc(collection(db, "clubs", currentClubId, "fee_audit"), { studentId: n1, amount: f1, date: getLocalToday(), type: 'tuition', month: _np1, months: [m1], by: window.currentUserEmail || 'admin', timestamp: Date.now() }); } catch(_) {}
                }
                if(n2 && f2 > 0) {
                    const _d2 = m2 < _todayMCombo ? m2 + '-01' : _todayCombo;
                    await addDoc(colRef, { branch: b2, type: 'Học phí', description: n2, amount: f2, date: _d2, txMonth: m2, packageMonths: [m2], timestamp: Date.now() + 1 });
                    // [BƯỚC 1] Đổi setDoc → updateDoc: chỉ ghi paidUntil, không ghi đè profile khác
                    // [BƯỚC 2] Normalize paidUntil trước khi so sánh
                    const _cu2 = normalizeYYYYMM((allProfiles[n2] && allProfiles[n2].paidUntil) || '');
                    const _np2 = m2 > _cu2 ? m2 : _cu2;
                    await updateDoc(doc(db, "clubs", currentClubId, "profiles", n2), { paidUntil: _np2 });
                    // [BƯỚC 3] Audit log cho thu gộp
                    try { await addDoc(collection(db, "clubs", currentClubId, "fee_audit"), { studentId: n2, amount: f2, date: getLocalToday(), type: 'tuition', month: _np2, months: [m2], by: window.currentUserEmail || 'admin', timestamp: Date.now() + 1 }); } catch(_) {}
                }
                window.showToast("✅ Đã ghi sổ gộp thành công!");
                exportReceipt(combinedNameStr, totalAmt, 'Học phí', getLocalToday(), combinedMonthStr, branch, 'Gộp Gia Đình', 'BIÊN LAI THU TIỀN');
                document.getElementById('comboModal').style.display = 'none';
            } else if (action === 'report') {
                exportReceipt(combinedNameStr, totalAmt, 'Học phí', getLocalToday(), combinedMonthStr, branch, 'Gộp Gia Đình', 'PHIẾU BÁO HỌC PHÍ');
                document.getElementById('comboModal').style.display = 'none';
            }
        } catch (error) { console.error(error); window.showToast("❌ Lỗi khi xử lý thu gộp!"); }
    };

    window.processBatchUpgrade = async () => {
        if(window.userRole === 'viewer') return alert("Tài khoản khách không thể thăng đai!");
        const selected = Array.from(document.querySelectorAll('.exam-check:checked')).map(cb => cb.value); if(selected.length === 0) return alert("Chọn ít nhất 1 võ sinh!");
        const currentBelt = document.getElementById('exam_filter_belt').value;
        const newBelt = window.BELT_NEXT[currentBelt];
        if(!newBelt) return alert("Đai này đã là cấp cao nhất, không thể thăng thêm!");
        const fee = Number(document.getElementById('exam_fee_all_actual').value) || 0; const currentMonth = document.getElementById('filterMonth').value || getLocalToday().substring(0, 7);
        let paidStudents = {};
        allTransactions.forEach(t => { if ((t.type === 'Lệ phí thi' || t.type === 'Học phí + Lệ phí thi') && (t.txMonth === currentMonth || (t.date && t.date.startsWith(currentMonth)))) { let stuName = t.type === 'Học phí + Lệ phí thi' ? (t.description ? t.description.trim() : "") : ((t.description || "").match(/^(.*?)\s*\(Thi lên/) ? (t.description || "").match(/^(.*?)\s*\(Thi lên/)[1].trim() : (t.description || "").trim()); if(stuName) paidStudents[stuName] = true; } });
        let studentsToCharge = selected.filter(n => !paidStudents[n]); let chargeAmount = studentsToCharge.length * fee;
        let confirmMsg = `Xác nhận thăng đai lên [${newBelt}] cho ${selected.length} võ sinh?\n(Các bạn vừa thăng sẽ được đánh dấu riêng để HLV phân biệt với võ sinh cũ)` + (fee > 0 && studentsToCharge.length > 0 ? `\n\nHệ thống sẽ thu phí ${studentsToCharge.length} bạn (Tổng: ${chargeAmount.toLocaleString()} ₫).` : "");
        if(!confirm(confirmMsg)) return;
        
        const batch = writeBatch(db);
        const _batchExamDate = currentMonth === getLocalToday().substring(0,7) ? getLocalToday() : (currentMonth < getLocalToday().substring(0,7) ? currentMonth + '-28' : currentMonth + '-01');
        for (let name of selected) {
            if(!allProfiles[name]) continue;
            batch.set(doc(db, "clubs", currentClubId, "profiles", name), { 
                belt: newBelt, 
                upgradedAt: currentMonth, 
                upgradedFrom: currentBelt 
            }, { merge: true });
            if(fee > 0 && !paidStudents[name]) { const newTxRef = doc(collection(db, "clubs", currentClubId, "transactions")); batch.set(newTxRef, { branch: allProfiles[name].branch || 'CS1', type: 'Lệ phí thi', description: `${name} (Thi lên ${newBelt})`, amount: fee, date: _batchExamDate, txMonth: currentMonth, timestamp: Date.now() + Math.random() }); }
        }
        await batch.commit(); window.showToast(`✅ Đã thăng đai thành công cho ${selected.length} võ sinh!`); document.getElementById('checkAllExam').checked = false; renderExamList(); 
    };

    window.downloadExcelTemplate = () => {
        // ── Xây dựng tiêu đề cột cơ sở động theo cấu hình admin ──────────
        const _bCount = clubConfig.branchCount || 1;
        let _branchHint = 'CS1';
        if (_bCount > 1) {
            const _parts = [];
            for (let _i = 1; _i <= Math.min(_bCount, 4); _i++) {
                _parts.push(clubConfig['branchName' + _i] || ('Cơ sở ' + _i));
            }
            _branchHint = _parts.join('/');
        }
        const _branchColHeader = 'Cơ sở (' + _branchHint + ')';

        // Dữ liệu mẫu dùng tên cơ sở thực tế đã cấu hình
        const _sampleBranch1 = _bCount === 1 ? (clubConfig.branchName1 || 'Cơ sở 1') : (clubConfig.branchName1 || 'Cơ sở 1');
        const _sampleBranch2 = _bCount >= 2 ? (clubConfig.branchName2 || 'Cơ sở 2') : _sampleBranch1;

        const headers = ['Họ và tên', 'Giới tính (Nam/Nữ)', 'Mã hội viên VTF', _branchColHeader, 'Cấp đai', 'SĐT', 'Ngày sinh (DD/MM/YYYY)', 'Học phí (VNĐ)', 'Ngày nhập học (YYYY-MM-DD)', 'Đã đóng tới tháng (MM-YYYY)'];
        const sampleData = [
            ['Nguyễn Văn A', 'Nam', 'VTF123456', _sampleBranch1, 'Đai trắng - Cấp 10', '0909123456', '01/01/2015', 300000, '2024-01-01', '01-2024'],
            ['Trần Thị B', 'Nữ', '', _sampleBranch2, 'Đai vàng - Cấp 7', '0988765432', '15/05/2014', 300000, '2024-01-01', '05-2024']
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

        const headerStyle = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Arial' },
            fill: { fgColor: { rgb: '0033A0' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: {
                top:    { style: 'thin', color: { rgb: '000000' } },
                bottom: { style: 'thin', color: { rgb: '000000' } },
                left:   { style: 'thin', color: { rgb: '000000' } },
                right:  { style: 'thin', color: { rgb: '000000' } }
            }
        };
        const dataStyle = {
            font: { sz: 10, name: 'Arial' },
            alignment: { vertical: 'center', wrapText: false },
            border: {
                top:    { style: 'thin', color: { rgb: 'CCCCCC' } },
                bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
                left:   { style: 'thin', color: { rgb: 'CCCCCC' } },
                right:  { style: 'thin', color: { rgb: 'CCCCCC' } }
            }
        };
        const dataStyleAlt = { ...dataStyle, fill: { fgColor: { rgb: 'F0F4FF' } } };

        const colLetters = ['A','B','C','D','E','F','G','H','I','J'];
        colLetters.forEach((col, i) => {
            const hCell = col + '1';
            if (!ws[hCell]) ws[hCell] = { v: headers[i], t: 's' };
            ws[hCell].s = headerStyle;
        });
        sampleData.forEach((row, ri) => {
            const style = ri % 2 === 0 ? dataStyle : dataStyleAlt;
            colLetters.forEach((col, ci) => {
                const addr = col + (ri + 2);
                if (!ws[addr]) ws[addr] = { v: row[ci] !== undefined ? row[ci] : '', t: typeof row[ci] === 'number' ? 'n' : 's' };
                ws[addr].s = style;
            });
        });

        ws['!cols'] = [
            { wch: 22 },
            { wch: 18 },
            { wch: 16 },
            { wch: 16 },
            { wch: 24 },
            { wch: 14 },
            { wch: 22 },
            { wch: 14 },
            { wch: 22 },
            { wch: 22 }
        ];
        ws['!rows'] = [{ hpt: 36 }, { hpt: 20 }, { hpt: 20 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DS_Nhap_Lieu");  // [SỬA] Tên sheet khớp file mẫu mới
        XLSX.writeFile(wb, "Mau_Nhap_Vo_Sinh.xlsx");
    };

    // ═══════════════════════════════════════════════════════════════
    //  HELPER: Chuẩn hóa tên cơ sở từ Excel → mã CS1, CS2, ...
    //  Hỗ trợ: "CS1", "cs2", "Cơ sở 1", "cơ sở 2", số "1"/"2",
    //          tên tùy chỉnh đã cấu hình admin (vd: "Nguyễn Huệ")
    // ═══════════════════════════════════════════════════════════════
    function _normalizeBranchForImport(rawBranch) {
        const bCount = clubConfig.branchCount || 1;
        if (bCount === 1) return 'CS1'; // CLB 1 cơ sở → luôn CS1

        if (!rawBranch) return 'CS1';
        const raw = String(rawBranch).trim();
        if (!raw) return 'CS1';

        // 1. Khớp chính xác mã CS1…CS10 (không phân biệt hoa thường)
        const upperRaw = raw.toUpperCase();
        for (let i = 1; i <= 10; i++) {
            if (upperRaw === 'CS' + i) return 'CS' + i <= 'CS' + bCount ? 'CS' + i : 'CS1';
        }

        // 2. Khớp theo tên cơ sở đã cấu hình trong admin (không phân biệt hoa thường, bỏ dấu)
        const stripDiacritics = (s) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';
        const rawNorm = stripDiacritics(raw);
        for (let i = 1; i <= bCount; i++) {
            const cfgName = clubConfig['branchName' + i] || ('Cơ sở ' + i);
            if (rawNorm === stripDiacritics(cfgName)) return 'CS' + i;
        }

        // 3. Khớp mẫu "cơ sở N" / "co so N" mặc định
        const matchDefault = raw.match(/[Cc][oơ]\s*s[ởo]\s*(\d+)/);
        if (matchDefault) {
            const n = parseInt(matchDefault[1]);
            if (n >= 1 && n <= bCount) return 'CS' + n;
        }

        // 4. Chỉ là số thuần ("1", "2", ...)
        const matchNum = raw.match(/^(\d+)$/);
        if (matchNum) {
            const n = parseInt(matchNum[1]);
            if (n >= 1 && n <= bCount) return 'CS' + n;
        }

        // 5. Fallback: CS1
        return 'CS1';
    }

    // ═══════════════════════════════════════════════════════════════
    // NHẬP TỪ EXCEL — Báo cáo chi tiết võ sinh thiếu/trùng
    // [SỬA] Ghi lại lý do bỏ qua từng dòng, hiển thị modal cảnh báo đầy đủ
    // ═══════════════════════════════════════════════════════════════
    window.handleImportExcel = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) return alert('File Excel không có dữ liệu!');
                if (!confirm('Tìm thấy ' + jsonData.length + ' dòng trong file. Bạn có muốn bắt đầu nhập vào hệ thống?')) return;

                window.showToast('⏳ Đang xử lý nhập dữ liệu...', 10000, true);
                const batch = writeBatch(db);
                let count = 0;
                const branchSyncLog = {}; // Ghi lại các cơ sở đã được đồng bộ tự động

                // [THÊM] Danh sách dòng bị bỏ qua kèm lý do chi tiết
                const skippedList = []; // { row, name, reason, detail }
                // [THÊM] Theo dõi tên trùng ngay trong chính file Excel đang nhập
                const seenInFile  = {};

                jsonData.forEach((row, _rowIdx) => {
                    const _rowNum = _rowIdx + 2; // +2 vì dòng 1 là header
                    let name = row['Họ và tên'] || row['Tên'] || row['Name'];

                    // ── Lý do 1: Dòng trống / thiếu họ tên ──────────────────
                    if (!name || !String(name).trim()) {
                        skippedList.push({ row: _rowNum, name: '(trống)', reason: 'Thiếu họ tên', detail: 'Ô "Họ và tên" bỏ trống' });
                        return;
                    }
                    name = String(name).trim();

                    // ── Lý do 2: Trùng tên trong chính file Excel đang nhập ──
                    if (seenInFile[name]) {
                        skippedList.push({ row: _rowNum, name, reason: 'Trùng trong file', detail: 'Tên này xuất hiện nhiều lần trong file Excel' });
                        return;
                    }
                    seenInFile[name] = true;

                    // ── Lý do 3: Đã tồn tại trong hệ thống ──────────────────
                    if (allProfiles[name]) {
                        const _ex = allProfiles[name];
                        const _stStr = _ex.status === 'active' ? 'đang tập' : _ex.status === 'quit' ? 'đã nghỉ' : (_ex.status || '');
                        const _brStr = _ex.branch ? (', ' + (window.getBranchNameDisplay ? window.getBranchNameDisplay(_ex.branch) : _ex.branch)) : '';
                        skippedList.push({ row: _rowNum, name, reason: 'Trùng tên hệ thống', detail: 'Đã có trong hệ thống (' + _stStr + _brStr + ')' });
                        return;
                    }

                    let gender   = row['Giới tính (Nam/Nữ)'] || row['Giới tính'] || '';
                    let memberId = row['Mã hội viên VTF'] || row['Mã hội viên'] || '';

                    // ── Đồng bộ cơ sở: nhận diện tự động, map về mã CS1/CS2/... ──
                    // [SỬA] Nhận diện cột Cơ sở với tên động bất kỳ (CS1/CS2 hoặc CS1/CS2/CS3...)
                    let rawBranch = row['Cơ sở'] || row['Cơ sở (CS1/CS2)'] || '';
                    if (!rawBranch) {
                        const _brKey = Object.keys(row).find(k => k.startsWith('Cơ sở ('));
                        if (_brKey) rawBranch = row[_brKey] || '';
                    }
                    const branch = _normalizeBranchForImport(rawBranch);
                    if (rawBranch && String(rawBranch).trim().toUpperCase() !== branch) {
                        const key = String(rawBranch).trim() + ' → ' + branch + ' (' + window.getBranchNameDisplay(branch) + ')';
                        branchSyncLog[key] = (branchSyncLog[key] || 0) + 1;
                    }
                    // ─────────────────────────────────────────────────────────

                    let belt     = row['Cấp đai'] || 'Đai trắng - Cấp 10';
                    let phone    = row['SĐT'] || row['Số điện thoại'] || '';
                    let dob      = row['Ngày sinh'] || row['Ngày sinh (DD/MM/YYYY)'] || '';
                    let fee      = Number(row['Học phí (VNĐ)'] || row['Học phí'] || 0);
                    let joinDate = row['Ngày nhập học (YYYY-MM-DD)'] || row['Ngày nhập học'] || getLocalToday();

                    // [SỬA] Hỗ trợ cả 2 định dạng: MM-YYYY (mới) và YYYY-MM (cũ)
                    let paidUntilInput = row['Đã đóng tới tháng (MM-YYYY)'] || row['Đã đóng tới tháng (YYYY-MM)'] || row['Đã đóng tới tháng'] || '';
                    let paidUntil = '';
                    if (paidUntilInput) {
                        const _pStr   = String(paidUntilInput).trim();
                        const _mmYYYY = _pStr.match(/^(\d{1,2})-(\d{4})$/);
                        // Nếu định dạng MM-YYYY (vd: "05-2024") → chuyển về YYYY-MM nội bộ
                        paidUntil = _mmYYYY ? (_mmYYYY[2] + '-' + _mmYYYY[1].padStart(2, '0')) : _pStr;
                    } else {
                        paidUntil = String(joinDate).substring(0, 7);
                    }

                    const docRef = doc(db, 'clubs', currentClubId, 'profiles', name);
                    batch.set(docRef, {
                        status: 'active',
                        gender: String(gender).trim(),
                        memberId: String(memberId).trim().toUpperCase(),
                        branch,
                        belt: String(belt).trim(),
                        phone: String(phone).trim(),
                        dob: String(dob).trim(),
                        tuitionFee: fee,
                        createdAt: String(joinDate).trim(),
                        paidUntil,
                        notes: 'Nhập từ Excel'
                    });
                    count++;
                });

                if (count > 0) await batch.commit();

                // [THÊM] Hiển thị modal báo cáo kết quả nhập chi tiết
                _showImportReport({ total: jsonData.length, imported: count, skipped: skippedList, branchSync: branchSyncLog });

            } catch (err) {
                console.error(err);
                alert('Lỗi đọc file Excel. Vui lòng dùng mẫu chuẩn.');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // ── [THÊM] Modal báo cáo kết quả nhập Excel — hiển thị chi tiết từng võ sinh bị bỏ qua ──
    function _showImportReport({ total, imported, skipped, branchSync }) {
        // Nhóm theo lý do để hiển thị gọn
        const groups = {};
        skipped.forEach(s => {
            if (!groups[s.reason]) groups[s.reason] = [];
            groups[s.reason].push(s);
        });

        // Màu sắc & icon theo từng loại lý do bỏ qua
        const _styleMap = {
            'Thiếu họ tên':       { icon: '📭', color: '#d97706', bg: '#fefce8', border: '#fde68a' },
            'Trùng trong file':   { icon: '🔁', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
            'Trùng tên hệ thống': { icon: '⚠️', color: '#dc2626', bg: '#fff1f2', border: '#fecaca' },
        };

        // HTML từng nhóm lý do
        let skipHtml = '';
        Object.entries(groups).forEach(([reason, list]) => {
            const st = _styleMap[reason] || { icon: '❓', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
            const rows = list.map(s =>
                '<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid ' + st.border + ';align-items:flex-start;">' +
                    '<span style="font-size:0.68rem;color:#94a3b8;white-space:nowrap;min-width:42px;margin-top:2px;">Dòng ' + s.row + '</span>' +
                    '<span style="font-weight:700;font-size:0.83rem;color:' + st.color + ';flex:1;word-break:break-all;">' + s.name + '</span>' +
                    '<span style="font-size:0.68rem;color:#64748b;text-align:right;flex-shrink:0;max-width:170px;line-height:1.4;">' + s.detail + '</span>' +
                '</div>'
            ).join('');
            skipHtml +=
                '<div style="margin-bottom:12px;border:1.5px solid ' + st.border + ';border-radius:12px;overflow:hidden;">' +
                    '<div style="background:' + st.bg + ';padding:8px 14px;display:flex;align-items:center;gap:7px;border-bottom:1px solid ' + st.border + ';">' +
                        '<span style="font-size:0.9rem;">' + st.icon + '</span>' +
                        '<span style="font-weight:900;font-size:0.82rem;color:' + st.color + ';">' + reason + '</span>' +
                        '<span style="margin-left:auto;background:' + st.color + ';color:#fff;font-size:0.68rem;font-weight:800;padding:2px 8px;border-radius:99px;">' + list.length + ' VS</span>' +
                    '</div>' +
                    '<div style="padding:4px 14px 4px;background:#fff;">' + rows + '</div>' +
                '</div>';
        });

        // HTML đồng bộ cơ sở (nếu có)
        const syncKeys = Object.keys(branchSync);
        const syncHtml = syncKeys.length > 0
            ? '<div style="margin-top:10px;padding:10px 14px;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:12px;">' +
                '<div style="font-weight:900;font-size:0.78rem;color:#0369a1;margin-bottom:6px;">🔄 Đã tự động đồng bộ cơ sở</div>' +
                syncKeys.map(k => '<div style="font-size:0.75rem;color:#0369a1;padding:3px 0;border-bottom:1px solid #bae6fd;">🔄 ' + k + ' — <b>' + branchSync[k] + '</b> võ sinh</div>').join('') +
              '</div>'
            : '';

        // Màu header modal theo tổng kết quả
        const _hGrad  = skipped.length === 0 ? 'linear-gradient(135deg,#059669,#047857)' : imported === 0 ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#0033A0,#0052cc)';
        const _hTitle = skipped.length === 0 ? 'Nhập thành công toàn bộ!' : imported === 0 ? 'Không nhập được võ sinh nào' : 'Kết quả nhập từ Excel';
        const _hIcon  = skipped.length === 0 ? '✅' : imported === 0 ? '❌' : '📥';

        const html =
            '<div id="_importReportOverlay" onclick="if(event.target===this)this.remove()" style="position:fixed;inset:0;background:rgba(15,23,42,0.78);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);">' +
              '<div style="background:#fff;width:100%;max-width:520px;border-radius:20px;box-shadow:0 24px 64px rgba(0,0,0,0.32);overflow:hidden;max-height:90vh;display:flex;flex-direction:column;">' +

                // Header
                '<div style="background:' + _hGrad + ';padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
                  '<div>' +
                    '<div style="font-size:1rem;font-weight:900;color:#fff;">' + _hIcon + ' ' + _hTitle + '</div>' +
                    '<div style="font-size:0.72rem;color:rgba(255,255,255,0.85);margin-top:3px;">' + total + ' dòng trong file &nbsp;·&nbsp; ' + imported + ' nhập thành công &nbsp;·&nbsp; ' + skipped.length + ' bỏ qua</div>' +
                  '</div>' +
                  '<button onclick="document.getElementById(\'_importReportOverlay\').remove()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:1.1rem;cursor:pointer;font-weight:700;">✕</button>' +
                '</div>' +

                // 3 ô tổng kết
                '<div style="padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:10px;flex-shrink:0;">' +
                  '<div style="flex:1;text-align:center;padding:10px;background:#f0fdf4;border-radius:10px;border:1.5px solid #bbf7d0;">' +
                    '<div style="font-size:1.6rem;font-weight:900;color:#16a34a;">' + imported + '</div>' +
                    '<div style="font-size:0.63rem;font-weight:800;color:#15803d;margin-top:2px;">✅ NHẬP ĐƯỢC</div>' +
                  '</div>' +
                  '<div style="flex:1;text-align:center;padding:10px;background:#fff1f2;border-radius:10px;border:1.5px solid #fecaca;">' +
                    '<div style="font-size:1.6rem;font-weight:900;color:#dc2626;">' + skipped.length + '</div>' +
                    '<div style="font-size:0.63rem;font-weight:800;color:#b91c1c;margin-top:2px;">⚠️ BỎ QUA</div>' +
                  '</div>' +
                  '<div style="flex:1;text-align:center;padding:10px;background:#f0f9ff;border-radius:10px;border:1.5px solid #bae6fd;">' +
                    '<div style="font-size:1.6rem;font-weight:900;color:#0369a1;">' + total + '</div>' +
                    '<div style="font-size:0.63rem;font-weight:800;color:#0369a1;margin-top:2px;">📋 TỔNG DÒNG</div>' +
                  '</div>' +
                '</div>' +

                // Nội dung cuộn
                '<div style="overflow-y:auto;padding:14px 18px;flex:1;">' +
                  (skipped.length > 0
                    ? '<div style="font-size:0.75rem;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">⚠️ Chi tiết võ sinh bị bỏ qua</div>' + skipHtml
                    : '<div style="text-align:center;padding:28px 16px;color:#16a34a;font-size:0.92rem;font-weight:700;">🎉 Tất cả võ sinh đã được nhập thành công!</div>') +
                  syncHtml +
                '</div>' +

                // Footer nút
                '<div style="padding:12px 18px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;flex-shrink:0;">' +
                  '<button onclick="document.getElementById(\'_importReportOverlay\').remove()" style="padding:10px 28px;background:linear-gradient(135deg,#0033A0,#0052cc);color:#fff;border:none;border-radius:10px;font-size:0.85rem;font-weight:800;cursor:pointer;box-shadow:0 3px 10px rgba(0,51,160,0.25);">Đã hiểu</button>' +
                '</div>' +

              '</div>' +
            '</div>';

        // Xóa modal cũ nếu đang mở, rồi chèn vào body
        const _old = document.getElementById('_importReportOverlay');
        if (_old) _old.remove();
        document.body.insertAdjacentHTML('beforeend', html);
    }

    window.openExcelExportModal = () => {
        // [SỬA BUG 5] Thay alert() bằng showToast() cho tài khoản viewer
        if(window.userRole === 'viewer') return window.showToast("⛔ Tài khoản khách không thể tải File!");
        document.getElementById('excelExportModal').style.display = 'flex';
        window.updateExcelPeriodOptions();
    };

    window.updateExcelPeriodOptions = () => {
        const type = document.getElementById('excel_periodType').value;
        const sel = document.getElementById('excel_periodValue');
        sel.innerHTML = '';
        if(type === 'month') { for(let i=1; i<=12; i++) sel.innerHTML += `<option value="${i}">Tháng ${i}</option>`; }
        else if(type === 'quarter') { for(let i=1; i<=4; i++) sel.innerHTML += `<option value="${i}">Quý ${i}</option>`; }
        else if(type === 'half') { sel.innerHTML += `<option value="1">6 tháng đầu năm</option><option value="2">6 tháng cuối năm</option>`; }
        else { sel.innerHTML += `<option value="1">Cả năm</option>`; }
    };

    // Phase 4.0A-2: legacy export fallback only
      window.legacyExecuteExcelExport = async function() {
        // Phase 4.0A-4: legacy fallback only. Do not edit unless ReportsModule fails.
        console.warn('[ReportsFallback] legacyExecuteExcelExport — ReportsModule should handle this.');
        if (window.showToast) window.showToast('Module xuất báo cáo chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
      };

    // Phase 4.0A-2: window.executeExcelExport — ưu tiên ReportsModule, fallback legacy
      window.executeExcelExport = async () => {
          if (window.ReportsModule && typeof window.ReportsModule.executeExcelExport === 'function') {
              return window.ReportsModule.executeExcelExport();
          }
          // Phase 4.0A-2: legacy export fallback only
          if (window.__reportsModuleMetrics) window.__reportsModuleMetrics.fallbackCalls++;
          return window.legacyExecuteExcelExport();
      };
      window.exportToExcel = window.openExcelExportModal;

    // Phase 4.0A-2: legacy export fallback only
      window.legacyExportAchievementsExcel = async function() {
        // Phase 4.0A-4: legacy fallback only. Do not edit unless ReportsModule fails.
        console.warn('[ReportsFallback] legacyExportAchievementsExcel — ReportsModule should handle this.');
        if (window.showToast) window.showToast('Module xuất thành tích chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
      };

    // Phase 4.0A-2: window.exportAchievementsExcel — ưu tiên ReportsModule, fallback legacy
      window.exportAchievementsExcel = async () => {
          if (window.ReportsModule && typeof window.ReportsModule.exportAchievementsExcel === 'function') {
              return window.ReportsModule.exportAchievementsExcel();
          }
          // Phase 4.0A-2: legacy export fallback only
          if (window.__reportsModuleMetrics) window.__reportsModuleMetrics.fallbackCalls++;
          return window.legacyExportAchievementsExcel();
      };
    // Phase 4.0A-3: legacy export fallback only
    window.legacyExportExamPaidList = function() {
        // Phase 4.0A-4: legacy fallback only. Do not edit unless ReportsModule fails.
        console.warn('[ReportsFallback] legacyExportExamPaidList — ReportsModule.exportExamPaidList should handle this.');
        if (window.showToast) window.showToast('Module xuất lệ phí thi chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
    };


    // Phase 4.0A-3: window.exportExamPaidList — ưu tiên ReportsModule, fallback legacy
    window.exportExamPaidList = async (...args) => {
        if (window.ReportsModule && typeof window.ReportsModule.exportExamPaidList === 'function') {
            return window.ReportsModule.exportExamPaidList(...args);
        }
        // Phase 4.0A-3: legacy export fallback only
        if (window.__reportsModuleMetrics) window.__reportsModuleMetrics.fallbackCalls++;
        console.warn('[ReportsFallback] exportExamPaidList fallback to legacy');
        return window.legacyExportExamPaidList?.(...args);
    };

    window.updateTaxPeriodOptions = () => {
        const type = document.getElementById('taxPeriodType').value;
        const sel = document.getElementById('taxPeriodValue');
        sel.innerHTML = '';
        if(type === 'month') { for(let i=1; i<=12; i++) sel.innerHTML += `<option value="${i}">Tháng ${i}</option>`; } 
        else if(type === 'quarter') { for(let i=1; i<=4; i++) sel.innerHTML += `<option value="${i}">Quý ${i}</option>`; } 
        else if(type === 'half') { sel.innerHTML += `<option value="1">6 tháng đầu</option><option value="2">6 tháng cuối</option>`; } 
        else { sel.innerHTML += `<option value="1">Cả năm</option>`; }
    };

    // Phase 4.0A-2: legacy export fallback only
      window.legacyExecuteTaxExport = async function() {
        // Phase 4.0A-4: legacy fallback only. Do not edit unless ReportsModule fails.
        console.warn('[ReportsFallback] legacyExecuteTaxExport — ReportsModule should handle this.');
        if (window.showToast) window.showToast('Module xuất thuế chưa sẵn sàng. Vui lòng tải lại trang.', 'warning');
      };

    // Phase 4.0A-2: window.executeTaxExport — ưu tiên ReportsModule, fallback legacy
      window.executeTaxExport = async () => {
          if (window.ReportsModule && typeof window.ReportsModule.executeTaxExport === 'function') {
              return window.ReportsModule.executeTaxExport();
          }
          // Phase 4.0A-2: legacy export fallback only
          if (window.__reportsModuleMetrics) window.__reportsModuleMetrics.fallbackCalls++;
          return window.legacyExecuteTaxExport();
      };
      const setupAutocomplete = (inputId, listId, mode) => {
        const inp = document.getElementById(inputId); const list = document.getElementById(listId);
        inp.onfocus = function() { if(this.value) this.oninput(); };
        inp.oninput = function() {
            let val = this.value.toLowerCase().trim(); list.innerHTML = '';
            if(!val || (mode === 'inv' && document.getElementById('inv_type').value !== 'Xuất bán')) { list.style.display = 'none'; return; }
            let matches = Object.keys(allProfiles).filter(n => { 
                if(allProfiles[n].status === 'quit') return false; 
                let p = allProfiles[n]; 
                return n.toLowerCase().includes(val) || (p.phone || "").includes(val) || (p.belt || "").toLowerCase().includes(val) || (p.notes || "").toLowerCase().includes(val); 
            });
            matches.forEach(name => {
                let div = document.createElement('div'); 
                let branchHtml = (!clubConfig.branchCount || clubConfig.branchCount > 1) 
                    ? `<span class="badge bg-slate-100 text-slate-600 border border-slate-200">${window.getBranchNameDisplay(allProfiles[name].branch || 'CS1')}</span>` 
                    : ``;
                
                div.innerHTML = `<strong class="text-primary">${name}</strong> ${branchHtml}`;
                div.onclick = () => {
                    inp.value = name; 
                    if(mode === 'tx') {
                        document.getElementById('branch').value = allProfiles[name].branch || 'CS1';
                        if((document.getElementById('type').value === 'Học phí' || document.getElementById('type').value === 'Học phí + Lệ phí thi') && allProfiles[name].tuitionFee) {
                            window.updateAmountByPackage();
                        }
                    } else if (mode === 'combo1' || mode === 'combo2') {
                        let feeId = mode === 'combo1' ? 'combo_fee1_actual' : 'combo_fee2_actual';
                        let dispId = mode === 'combo1' ? 'combo_fee1_display' : 'combo_fee2_display';
                        if(allProfiles[name].tuitionFee) {
                            document.getElementById(feeId).value = allProfiles[name].tuitionFee;
                            document.getElementById(dispId).value = parseInt(allProfiles[name].tuitionFee, 10).toLocaleString('vi-VN');
                            window.updateComboTotal();
                        }
                    }
                    list.style.display = 'none';
                }; 
                list.appendChild(div);
            });
            list.style.display = matches.length ? 'block' : 'none';
        }; 
    };

    const _acInputIds = new Set(['description', 'inv_desc', 'combo_name1', 'combo_name2']);
    const _acListIds = ['autocomplete-list', 'inv-autocomplete-list', 'combo-autocomplete-1', 'combo-autocomplete-2'];
    document.addEventListener('click', (e) => {
        if (!_acInputIds.has(e.target.id)) {
            _acListIds.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
        }
    });

    document.addEventListener("DOMContentLoaded", () => {
        setupAutocomplete('description', 'autocomplete-list', 'tx'); 
        setupAutocomplete('inv_desc', 'inv-autocomplete-list', 'inv');
        setupAutocomplete('combo_name1', 'combo-autocomplete-1', 'combo1');
        setupAutocomplete('combo_name2', 'combo-autocomplete-2', 'combo2');
        
        const lToday = getLocalToday(); const lMonth = lToday.substring(0, 7);
        document.getElementById('filterMonth').value = lMonth; 
        document.getElementById('filterMonth').onchange = (e) => { window.listenToData(e.target.value); }; 
        // [PERF] Reset pagination về trang 1 khi đổi lọc/tìm kiếm —
        // kết quả mới không liên quan đến page cũ người dùng đang xem.
        // [Phase 3.5C] Filter/search chỉ ảnh hưởng tab đang mở → invalidateCurrentTab().
        // Không trigger full renderApp() toàn app — chỉ invalidate domain của tab hiện tại.
        // Fallback về scheduleRender() nếu Phase 3.5C chưa load.
        document.getElementById('filterBranch').onchange = () => { window._resetListPages && window._resetListPages(); if (window.invalidateCurrentTab) { window.invalidateCurrentTab('filter-branch-change'); } else { scheduleRender(); } }; 
        // Phase 4J-9B: LEGACY search handler — chỉ chạy nếu PRIMARY controller chưa mount.
        // PRIMARY (students.js _bindSearchReset) có debounce 350ms + server-side search.
        // Nếu PRIMARY đã active, oninput này không làm gì để tránh double render.
        document.getElementById('searchInput').oninput = () => {
            // [PART 4 FIX] Tab-aware guard: chỉ chặn legacy ở ĐANG TẬP/ĐÃ NGHỈ nếu PRIMARY đã mount và không fail
            const _curTab = typeof window.getCurrentActiveTabId === 'function'
                ? window.getCurrentActiveTabId()
                : (document.querySelector('.tab-content.active')?.id || '').replace(/^tab_/, '');
            const _studentTabs = _curTab === 'active' || _curTab === 'quit';
            if (
                _studentTabs &&
                window.__studentSearchControllerMounted &&
                !window.__studentSearchControllerFailed
            ) {
                return;
            }
            window._resetListPages && window._resetListPages();
            if (typeof window.refreshListsComputation === 'function') {
                window.refreshListsComputation([
                    'students.activeList',
                    'students.debtList',
                    'students.quitList',
                    'tx.txList',
                    'inventory.inventoryList',
                    'inventory.uniformTxList',
                    'dashboard.summary',
                ], 'global-search-change');
            }
            if (window.invalidateCurrentTab) { window.invalidateCurrentTab('search-change'); } else { scheduleRender(); }
        };
        document.getElementById('date').value = lToday; 
        document.getElementById('inv_date').value = lToday; document.getElementById('exp_date').value = lToday;
        
        const emailInp = document.getElementById('emailInput');
        const passInp = document.getElementById('passInput'); 
        
        if(emailInp) emailInp.addEventListener("keypress", (e) => { 
            if(e.key === "Enter") passInp.focus(); 
        });
        if(passInp) passInp.addEventListener("keypress", (e) => { 
            if(e.key === "Enter") window.handleLogin(); 
        });
    });

    window.exportReceipt = async (name, amount, type, date, txMonth, branch, extraDesc = '', receiptTitle = 'BIÊN LAI THU TIỀN', breakdown = null) => {
        window.showToast("⏳ Đang tạo hóa đơn, vui lòng đợi...", 10000, true);
        try {
            const node = document.getElementById('receiptTemplate'); const cleanName = name.trim();
            document.getElementById('r_name').innerText = cleanName.toUpperCase(); document.getElementById('receiptTitle').innerText = receiptTitle;
            const dParts = date ? date.split('-') : []; 
            let locText = clubConfig.location || "Quy Nhơn";
            document.getElementById('r_date_top').innerText = dParts.length === 3 ? `${locText}, ngày ${dParts[2]} tháng ${dParts[1]} năm ${dParts[0]}` : `${locText}, ${formatDate(date)}`;
            const p = allProfiles[cleanName] || {}; document.getElementById('r_belt').innerText = p.belt || (cleanName.includes('&') ? 'Theo danh sách' : 'Chưa cập nhật'); 
            if (p.dob && !cleanName.includes('&')) { document.getElementById('r_dob').innerText = formatDate(p.dob); document.getElementById('r_dob_wrap').style.display = 'block'; } else document.getElementById('r_dob_wrap').style.display = 'none';
            document.getElementById('r_amount').innerText = amount.toLocaleString('vi-VN') + " ₫"; document.getElementById('r_amount_words').innerText = docTienVND(amount); 
            
            let displayBranch = window.getBranchNameDisplay(branch);
            document.getElementById('r_branch').innerText = displayBranch;
            
            let qrDesc = type;
            {
                const _monthLabel = txMonth ? ('Tháng ' + window.formatMonthCompact(txMonth)) : '';
                let typeDisplay = type.replace('Học phí', 'Học phí' + (_monthLabel ? ' ' + _monthLabel : ''));
                document.getElementById('r_type').innerText = typeDisplay;
                if(type === 'Học phí + Lệ phí thi') qrDesc = 'Hoc phi va Le phi thi';
            }
            
            const qrImgEl = document.getElementById('qrCodeImg');
            if (amount > 0 && receiptTitle !== 'BIÊN LAI THU TIỀN') {
                let paymentContent = type === 'Học phí' && txMonth ? (extraDesc ? removeVietnameseTonesForQR(extraDesc) : `Hoc Phi Thang ${formatMonth(txMonth)}`) : qrDesc;
                let qrName = cleanName.includes('&') ? cleanName.replace(/ & /g, " - ") : cleanName;
                const _qrUrl = generateVietQR(amount, qrName, paymentContent, branch || '');
                document.getElementById('r_qr_wrap').style.display = 'block';
                // Fetch QR → base64 để html2canvas capture không bị lỗi cross-origin / tainted canvas
                let _qrDone = false;
                try {
                    const _qrResp = await Promise.race([
                        fetch(_qrUrl),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('qr-timeout')), 6000))
                    ]);
                    if (_qrResp.ok) {
                        const _qrBlob = await _qrResp.blob();
                        const _qrB64  = await new Promise((res, rej) => {
                            const _fr = new FileReader();
                            _fr.onload  = () => res(_fr.result);
                            _fr.onerror = rej;
                            _fr.readAsDataURL(_qrBlob);
                        });
                        qrImgEl.src = _qrB64;
                        // Chờ img render với base64 mới
                        await new Promise(res => { qrImgEl.onload = res; qrImgEl.onerror = res; setTimeout(res, 500); });
                        _qrDone = true;
                    }
                } catch (_qrErr) { /* fallback bên dưới */ }
                if (!_qrDone) {
                    // Fallback: đặt URL trực tiếp, chấp nhận canvas có thể bị tainted
                    qrImgEl.src = _qrUrl;
                    await Promise.race([
                        new Promise(res => { qrImgEl.onload = res; qrImgEl.onerror = res; }),
                        new Promise(res => setTimeout(res, 4000))
                    ]);
                }
            } else { document.getElementById('r_qr_wrap').style.display = 'none'; }
            
            // Render breakdown table if provided
            const bdWrap = document.getElementById('r_breakdown_wrap');
            const bdTable = document.getElementById('r_breakdown_table');
            if(breakdown && breakdown.length > 1 && bdWrap && bdTable) {
                bdTable.innerHTML = breakdown.map((row, i) => 
                    `<tr style="border-top:${i===0?'none':'1px solid #f1f5f9'}">
                        <td style="padding:5px 10px;font-size:12px;color:#475569;">${row.label}</td>
                        <td style="padding:5px 10px;font-size:12px;font-weight:700;text-align:right;color:#0f172a;">${row.amount.toLocaleString('vi-VN')} ₫</td>
                    </tr>`
                ).join('');
                bdWrap.style.display = 'block';
            } else if(bdWrap) { bdWrap.style.display = 'none'; }

            const sigImg = document.getElementById('r_signature_img');
            const trainerNameEl = document.getElementById('r_trainer_name');
            const sigBlock = document.getElementById('r_signature_block');
            const isBienLai = receiptTitle === 'BIÊN LAI THU TIỀN';
            if(isBienLai && (clubConfig.signatureBase64 || clubConfig.trainerName)) {
                if(sigBlock) sigBlock.style.display = 'flex';
                if(trainerNameEl) trainerNameEl.innerText = clubConfig.trainerName || '';
                if(sigImg) { if(clubConfig.signatureBase64) { sigImg.src = clubConfig.signatureBase64; sigImg.style.display = 'block'; } else { sigImg.style.display = 'none'; } }
            } else {
                if(sigBlock) sigBlock.style.display = 'none';
            }
            const logoEl = document.getElementById('receiptLogo'); if (logoCanvasData) { logoEl.src = logoCanvasData; } 
            node.style.position = 'absolute'; node.style.visibility = 'visible';
            if(!window.html2canvas) await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
            // useCORS: false — tắt CORS fetch để tránh hàng trăm lỗi khi chạy từ file://
            // allowTaint: true — vẫn render được ảnh cross-origin (QR, logo) vào canvas
            const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: false, allowTaint: true, logging: false, imageTimeout: 0 });
            const _receiptJpeg = canvas.toDataURL('image/jpeg', 0.82);
            document.getElementById('receiptPreviewImg').src = _receiptJpeg;
            document.getElementById('btnDownloadReceipt').onclick = () => { const link = document.createElement('a'); link.download = `Hoa_Don_${cleanName.replace(/\s/g, '_').replace(/&/g, 'va')}.jpg`; link.href = _receiptJpeg; link.click(); };
            document.getElementById('toastMessage').classList.remove("show"); document.getElementById('receiptModal').style.display = 'flex';
        } catch (error) { console.error(error); window.showToast("❌ Lỗi tạo hóa đơn!"); } finally { document.getElementById('receiptTemplate').style.cssText = 'position:absolute;left:-9999px;visibility:hidden;'; }
    };

    function renderApp() {
        if (typeof window._moduleRenderApp === 'function') { window._moduleRenderApp(); return; }
        if(window.userRole === 'super_admin') return;
        // [PERF FIX] Skip render nếu data chưa thay đổi kể từ lần render cuối.
        // Ngăn re-render vô ích khi onSnapshot fire liên tiếp mà không có dữ liệu mới.
        if(_dataVersion === _lastRenderedVersion) return;
        _lastRenderedVersion = _dataVersion;
        // [THÊM MỚI] Cập nhật banner sinh nhật tại phần Thông tin chung
        // mỗi khi dữ liệu thay đổi để luôn hiện ngày sinh nhật hôm nay.
        // Gọi qua window.* vì hàm được định nghĩa trong scope initSaaSDatabase.
        if (typeof window._renderHomeBirthdayBanner === 'function') window._renderHomeBirthdayBanner();
        const _curTabEl = document.querySelector('.tab-content.active');
        const _curTabId = _curTabEl ? _curTabEl.id.replace('tab_', '') : 'tx';

        // [SỬA] Tự động load danh sách điểm danh khi dữ liệu cập nhật
        // và tab Điểm danh đang mở (tránh trường hợp list trống sau khi data về).
        if (_curTabId === 'attendance' && typeof window.renderAttendanceList === 'function') {
            window.renderAttendanceList();
        }

        const _fmEl = document.getElementById('filterMonth');
        const _fbEl = document.getElementById('filterBranch');
        const _srEl = document.getElementById('searchInput');
        const selMonth = _fmEl ? _fmEl.value : ''; const selBranch = _fbEl ? _fbEl.value : 'all'; const search = _srEl ? _srEl.value.toLowerCase().trim() : '';
        const _txRows = [], _utxRows = [], _expRows = [], _eexpRows = [], _debtRows = [], _activeRows = [], _quitRows = [], _invRows = [];
        let txHtml = '', uniformTxHtml = '', expHtml = '', examExpHtml = '', debtHtml = '', activeHtml = '', quitHtml = '', invListHtml = '', reportHtml = '';
        let inc_tuition = 0, inc_exam = 0, inc_other = 0, inc_uniform = 0, exp_uniform = 0, exp = 0, exp_exam_total = 0, totalDebtEst = 0; let studentPayments = {};
        // [THÊM BUG 7] Biến đếm giao dịch học phí hiển thị trên badge tab Học Phí
        let txCountRender = 0;
        
        let isSingleBranch = clubConfig.branchCount === 1;
        const _bCount = clubConfig.branchCount || 1;
        const _bStats = {};
        for(let _bi = 1; _bi <= _bCount; _bi++) _bStats['CS' + _bi] = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };
        const _bExamStats = {};
        for(let _bi = 1; _bi <= _bCount; _bi++) _bExamStats['CS' + _bi] = 0;
        
        let sizeSelectHtml = '<option value="">-- Không mua / Trống --</option>';
        const vpSizes = ["Size 1m", "Size 1m1", "Size 1m2", "Size 1m3", "Size 1m4", "Size 1m5", "Size 1m6", "Size 1m7", "Size 1m8"];
        // Danh mục kho động: mặc định + tùy chỉnh của admin
        const INV_CATEGORIES = window.getInvCategories ? window.getInvCategories() : ['Võ phục', 'Áo thun', 'Bảo hộ'];
        
        const liveInvMap = {};
        allInventory.forEach(t => {
            if(!t.size) return;
            const cat = t.category || 'Võ phục';
            const key = cat + '|||' + t.size;
            if(!liveInvMap[key]) liveInvMap[key] = { category: cat, size: t.size, in: 0, out: 0 };
            if(t.type === 'Nhập kho') liveInvMap[key].in += (Number(t.qty) || 0);
            else liveInvMap[key].out += (Number(t.qty) || 0);
        });

        window._liveInvMap = liveInvMap;
        // Thứ tự sắp xếp: mặc định trước, tùy chỉnh theo thứ tự thêm vào
        const catOrder = { 'Võ phục': 0, 'Áo thun': 1, 'Bảo hộ': 2 };
        (window.invCustomCategories || []).forEach((c, i) => { catOrder[c.name] = 3 + i; });
        const sortedInvKeys = Object.keys(liveInvMap).sort((a, b) => {
            const ca = liveInvMap[a].category, cb = liveInvMap[b].category;
            if(ca !== cb) return (catOrder[ca] ?? 9) - (catOrder[cb] ?? 9);
            return liveInvMap[a].size.localeCompare(liveInvMap[b].size);
        });

        if (_curTabId === 'inventory') {
        sortedInvKeys.forEach(key => {
            const s = liveInvMap[key];
            let inQty = s.in, outQty = s.out, bal = inQty - outQty;
            const catColors = { 'Võ phục': 'bg-blue-50 text-blue-700 border-blue-200', 'Áo thun': 'bg-purple-50 text-purple-700 border-purple-200', 'Bảo hộ': 'bg-orange-50 text-orange-700 border-orange-200' };
            const catBadge = `<span class="badge ${catColors[s.category] || 'bg-slate-50 text-slate-700 border-slate-200'} border text-[0.65rem]">${s.category}</span>`;
            if (inQty > 0 || outQty > 0) {
                invListHtml += `<tr>
                    <td>${catBadge}</td>
                    <td class="font-bold text-slate-800">${s.size}</td>
                    <td class="text-emerald-600 font-bold">+${inQty}</td>
                    <td class="text-rose-600 font-bold">-${outQty}</td>
                    <td class="${bal < 3 ? 'text-rose-600' : 'text-emerald-600'} font-black text-base">${bal}</td>
                </tr>`;
            }
        });
        }

        vpSizes.forEach(size => {
            const key = 'Võ phục|||' + size;
            const s = liveInvMap[key] || { in: 0, out: 0 };
            const bal = s.in - s.out;
            if (bal > 0) sizeSelectHtml += `<option value="${size}">${size} (Còn: ${bal} bộ)</option>`; 
            else sizeSelectHtml += `<option value="${size}" disabled>${size} (Hết hàng)</option>`;
        });
        
        if(sizeSelectHtml !== _lastSizeSelectHtml) { _lastSizeSelectHtml = sizeSelectHtml; const addSizeSelect = document.getElementById('add_uniform_size'); if(addSizeSelect) addSizeSelect.innerHTML = sizeSelectHtml; }

        const relatedTxByInvId = new Map();
        allTransactions.forEach(tx => { if(tx.relatedInvId) relatedTxByInvId.set(tx.relatedInvId, tx); });

        let unpaidInvCount = 0;
        allInventory.forEach(t => {
            let isSearchMatch = true;
            if (search && !(t.desc||"").toLowerCase().includes(search) && !(t.size||"").toLowerCase().includes(search)) isSearchMatch = false;
            
            if(isSearchMatch) {
                let isInc = t.type === 'Nhập kho';
                let isUnpaid = !isInc && t.unpaid === true;
                if(isUnpaid) unpaidInvCount++;
                let typeBadge = `<span class="text-[0.65rem] font-bold uppercase ${isInc ? 'text-rose-600' : 'text-emerald-600'} bg-slate-50 px-2 py-1 rounded border ${isInc ? 'border-rose-200' : 'border-emerald-200'}">${isInc ? 'NHẬP' : 'XUẤT'}</span>`;
                const unpaidBadge = isUnpaid ? `<span style="display:inline-block;font-size:0.65rem;font-weight:900;background:#f97316;color:#fff;border-radius:5px;padding:2px 7px;margin-left:5px;vertical-align:middle;letter-spacing:0.03em;">NỢ</span>` : '';
                
                let displayDesc = t.desc; let displayAmt = t.amount;
                let relatedTxForDesc = relatedTxByInvId.get(t.id) || null;
                if ((!displayDesc || displayAmt === undefined) && relatedTxForDesc) {
                    displayDesc = relatedTxForDesc.description; displayAmt = relatedTxForDesc.amount;
                }
                
                let amountHtml = displayAmt > 0 ? `<span class="font-bold ${isInc ? 'text-rose-600' : (isUnpaid ? 'text-orange-500' : 'text-emerald-600')}">${isInc ? '-' : '+'}${displayAmt.toLocaleString()}</span>` : `<span class="font-bold text-slate-400">0</span>`;
                let descHtml = (displayDesc || (isInc ? `Nhập ${t.size}` : `Xuất ${t.size}`)) + unpaidBadge;
                
                let txIdForDelete = relatedTxForDesc ? relatedTxForDesc.id : 'undefined';

                const txCat = t.category || 'Võ phục';
                const txCatColors = { 'Võ phục': 'bg-blue-50 text-blue-700 border-blue-200', 'Áo thun': 'bg-purple-50 text-purple-700 border-purple-200', 'Bảo hộ': 'bg-orange-50 text-orange-700 border-orange-200' };
                const txCatBadge = `<span class="badge ${txCatColors[txCat] || 'bg-slate-50 text-slate-700 border-slate-200'} border text-[0.65rem]">${txCat}</span>`;
                const markPaidBtn = (isUnpaid && window.userRole === 'admin') ? `<button type="button" class="btn-sm bg-emerald-600 text-white shadow-sm" onclick="markInvPaid('${t.id}')">✅ Đã thu</button>` : '';
                uniformTxHtml += `<tr class="${isUnpaid ? 'inv-unpaid-row' : ''}">
                    <td class="text-slate-500 text-[0.85rem]">${formatDate(t.date)}</td>
                    <td class="font-bold text-blue-700 text-[0.9rem]">${descHtml}</td>
                    <td>${typeBadge}</td>
                    <td>${txCatBadge} <span class="badge bg-slate-50 text-slate-700 border border-slate-200 text-[0.75rem] ml-1">${t.size}</span></td>
                    <td>${amountHtml}</td>
                    <td class="action-btns">${markPaidBtn}${window.userRole === 'admin' ? `<button type="button" class="btn-sm bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white" onclick="deleteTx('${txIdForDelete}', '${t.id}')">🗑</button>`:''}</td>
                </tr>`;
            }
        });
        const _unpaidWrapEl = document.getElementById('sum_uniform_unpaid_wrap');
        const _unpaidCountEl = document.getElementById('sum_uniform_unpaid');
        if(_unpaidWrapEl) _unpaidWrapEl.style.display = unpaidInvCount > 0 ? '' : 'none';
        if(_unpaidCountEl) _unpaidCountEl.innerText = unpaidInvCount + ' đơn';

        // ── Smart Name: đếm tên trùng toàn hệ thống (dùng cho TX + danh sách) ──
        // [SỬA] Đếm theo tên gốc — bỏ hậu tố phân biệt như "(2016)" hoặc "(2016-Lớn)"
        const _stripNameSuffix = (k) => k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase();
        // Helper hiển thị tên — bỏ hậu tố nhưng GIỮ hoa/thường gốc
        const _displayName = (k) => k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
        const _nameNCount = {};
        Object.keys(allProfiles || {}).forEach(n => {
            const k = _stripNameSuffix(n);
            _nameNCount[k] = (_nameNCount[k] || 0) + 1;
        });
        // Helper trả về HTML tên — gắn năm sinh dạng superscript màu xám nếu tên trùng
        const _getYearBadge = (n, profileData) => {
            if ((_nameNCount[_stripNameSuffix(n)] || 0) <= 1) return '';
            const _pd = profileData || allProfiles[n] || {};
            const dob = _pd.dob || '';
            let yr = dob.includes('/') ? dob.split('/')[2] : (dob.includes('-') ? dob.split('-')[0] : '');
            // Fallback: trích năm từ hậu tố key như "(2016)" hoặc "(2016-B)"
            if (!yr) { const _ym = (n || '').match(/\((\d{4})/); if (_ym) yr = _ym[1]; }
            return yr ? '<sup style="font-size:0.55rem;color:#94a3b8;font-weight:700;vertical-align:super;line-height:0;margin-left:2px;">' + yr + '</sup>' : '';
        };

        allTransactions.forEach(t => {
            const cleanName = t.description ? t.description.trim() : ""; 
            const _INV_CATS = window.getInvCategories ? window.getInvCategories() : ['Võ phục', 'Áo thun', 'Bảo hộ']; let isUniformTx = _INV_CATS.some(cat => t.type === `Thu ${cat}` || t.type === `Chi ${cat}` || t.type === `Tặng ${cat}`) || t.type === 'Võ phục';
            
            let isBranchMatch = true;
            if (!isSingleBranch && selBranch !== 'all' && t.branch !== selBranch && t.branch !== 'Chung') isBranchMatch = false;
            let isSearchMatch = true;
            if (search && !cleanName.toLowerCase().includes(search) && !(t.examTitle||"").toLowerCase().includes(search)) isSearchMatch = false;

            let safeBranch = t.branch || "CS1"; let safeNameEscaped = cleanName.replace(/'/g, "\\'");
            let branchTdHTML = isSingleBranch ? '' : `<td class="col-branch"><span class="badge bg-slate-100 text-slate-600 border border-slate-200">${window.getBranchNameDisplay(safeBranch)}</span></td>`;
            const btnDel = window.userRole === 'admin' ? `<button type="button" class="btn-sm bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white ml-1" onclick="deleteTx('${t.id}', '${t.relatedInvId || ''}')">🗑</button>` : '';

            if (isUniformTx) {
                let isInc = _INV_CATS.some(cat => t.type === `Thu ${cat}`) || t.type === 'Võ phục'; let isGift = _INV_CATS.some(cat => t.type === `Tặng ${cat}`);
                if (isInc) inc_uniform += Number(t.amount) || 0; else if (!isGift) exp_uniform += Number(t.amount) || 0;
                return;
            }

            if (!isBranchMatch || !isSearchMatch) return;

            const btnEditExp = window.userRole === 'admin' ? `<button type="button" class="btn-sm bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white" onclick="openEditExpense('${t.id}')">✏️</button>` : '';

            if(t.type === 'Chi phí') {
                exp += Number(t.amount) || 0;
                if(_curTabId === 'expense') expHtml += `<tr><td>${formatDate(t.date)}</td>${branchTdHTML}<td class="font-bold text-slate-800">${t.description}</td><td class="text-rose-600 font-bold">-${(Number(t.amount)||0).toLocaleString()}</td><td class="action-btns">${btnEditExp}${btnDel}</td></tr>`;
            } else if (t.type === 'Chi phí kỳ thi') {
                exp_exam_total += Number(t.amount) || 0;
                if(_curTabId === 'exam') examExpHtml += `<tr><td>${formatDate(t.date)}</td><td class="font-bold text-slate-800">${t.description}</td><td class="text-rose-600 font-bold">-${(Number(t.amount)||0).toLocaleString()}</td><td class="action-btns">${btnEditExp}${btnDel}</td></tr>`;
            } else {
                // [THÊM BUG 7] Đếm giao dịch thu học phí qua filter hiện tại để cập nhật badge
                txCountRender++;
                let allocatedAmount = Number(t.amount) || 0;
                if(t.type === 'Học phí') { allocatedAmount = t.packageMonths ? allocatedAmount / t.packageMonths.length : allocatedAmount; inc_tuition += allocatedAmount; } 
                else if(t.type === 'Học phí + Lệ phí thi') { allocatedAmount = t.packageMonths ? (Number(t.tuitionAmount) || 0) / t.packageMonths.length : (Number(t.tuitionAmount) || 0); inc_tuition += allocatedAmount; inc_exam += (Number(t.examAmount) || 0); } 
                else if(t.type === 'Lệ phí thi') { inc_exam += allocatedAmount; } 
                else { inc_other += allocatedAmount; }
                const _txBr = t.branch || 'CS1';
                if(_bStats[_txBr] !== undefined) {
                    const _examPart = (t.type === 'Học phí + Lệ phí thi') ? (Number(t.examAmount)||0) : 0;
                    const _txInc = allocatedAmount + _examPart;
                    _bStats[_txBr].income += _txInc;
                    if(t.type === 'Lệ phí thi') {
                        const _ek = Math.round(allocatedAmount);
                        if(_ek > 0) _bStats[_txBr].examFeeMap[_ek] = (_bStats[_txBr].examFeeMap[_ek] || 0) + 1;
                    } else if(t.type === 'Học phí + Lệ phí thi') {
                        const _tk = Math.round(allocatedAmount);
                        if(_tk > 0) _bStats[_txBr].tuitionMap[_tk] = (_bStats[_txBr].tuitionMap[_tk] || 0) + 1;
                        const _ek = Math.round(_examPart);
                        if(_ek > 0) _bStats[_txBr].examFeeMap[_ek] = (_bStats[_txBr].examFeeMap[_ek] || 0) + 1;
                    } else {
                        const _tk = Math.round(allocatedAmount);
                        if(_tk > 0) _bStats[_txBr].tuitionMap[_tk] = (_bStats[_txBr].tuitionMap[_tk] || 0) + 1;
                    }
                }
                if(_bExamStats[_txBr] !== undefined) {
                    if(t.type === 'Lệ phí thi') _bExamStats[_txBr] += allocatedAmount;
                    else if(t.type === 'Học phí + Lệ phí thi') _bExamStats[_txBr] += (Number(t.examAmount) || 0);
                }

                let studentNameBase = cleanName.split(' (')[0]; let safeStudentNameBase = studentNameBase.replace(/'/g, "\\'");
                let safeExamTitle = t.examTitle ? t.examTitle.replace(/'/g, "\\'") : '';
                let displayTxMonth = t.packageMonths && t.packageMonths.length > 1 ? `${t.packageMonths.length} Tháng` : (t.txMonth ? formatMonth(t.txMonth) : "-");
                // Smart Name: gắn năm sinh vào tên nếu trùng; truyền profile theo key đầy đủ để lấy đúng DOB
                const _txYrBadge = _getYearBadge(cleanName, allProfiles[cleanName] || allProfiles[studentNameBase]);

                // Build display name and type badge based on transaction type
                let displayName, typeBadgeHtml;
                if(t.type === 'Lệ phí thi') {
                    displayName = studentNameBase + _txYrBadge + ' <span style="font-size:0.75rem;font-weight:700;color:#c2410c;background:#fff7ed;border:1px solid #fed7aa;border-radius:5px;padding:1px 6px;vertical-align:middle;">🏆 Thi lên đai</span>';
                    typeBadgeHtml = '';
                } else if(t.type === 'Học phí + Lệ phí thi') {
                    displayName = studentNameBase + _txYrBadge + ' <span style="font-size:0.75rem;font-weight:700;color:#c2410c;background:#fff7ed;border:1px solid #fed7aa;border-radius:5px;padding:1px 6px;vertical-align:middle;">🏆 HP + Thi lên đai</span>';
                    typeBadgeHtml = '';
                } else {
                    displayName = cleanName + _txYrBadge;
                    let badgeTypeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                    let printTypeBadge = t.type;
                    typeBadgeHtml = `<span class="badge ${badgeTypeClass} border">${printTypeBadge}</span>`;
                }

                let amountHTML = '';
                if (t.packageMonths && t.packageMonths.length > 1) {
                    let totalAllo = t.type === 'Học phí + Lệ phí thi' ? (allocatedAmount + (Number(t.examAmount)||0)) : allocatedAmount;
                    amountHTML = `<div class="text-emerald-600 font-black text-base">+${totalAllo.toLocaleString()}</div><div class="text-[0.65rem] text-slate-500 font-bold whitespace-nowrap">Tổng: ${(Number(t.amount)||0).toLocaleString()}</div>`;
                } else {
                    amountHTML = `<span class="text-emerald-600 font-black text-base">+${(Number(t.amount)||0).toLocaleString()}</span>`;
                }

                if(_curTabId === 'tx') txHtml += `<tr><td>${formatDate(t.date)}</td>${branchTdHTML}<td><span class="badge bg-emerald-50 text-emerald-700 border border-emerald-200">${displayTxMonth}</span></td><td class="name-link text-[0.95rem]" onclick="openProfile('${safeStudentNameBase}')">${displayName}</td><td>${typeBadgeHtml}</td><td>${amountHTML}</td><td class="action-btns"><button type="button" class="btn-sm bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white" onclick="exportReceipt('${safeStudentNameBase}', ${Number(t.amount)||0}, '${t.type}', '${t.date}', '${t.packageMonths ? t.packageMonths.join(',') : (t.txMonth||'')}', '${safeBranch}', '${safeExamTitle}', 'BIÊN LAI THU TIỀN')">🧾 In</button>${btnDel}</td></tr>`;
            }
        });

        let activeCount = 0, debtCountRender = 0;
        let m_new = 0, m_quit = 0, m_active_theo = 0, m_skipped = 0;

        // [PERF] Client-side display pagination — giảm DOM nodes trên mobile.
        // Toàn bộ allProfiles vẫn được duyệt đầy đủ để tính badge nợ / active count.
        // Chỉ giới hạn số dòng HTML render ra màn hình (mỗi trang 100 dòng).
        // Người dùng bấm "Tải thêm" → window._loadMore(tab) → render trang tiếp.
        const _PAGE_LIMIT    = 100;
        const _activeLimit   = (window._activePage || 1) * _PAGE_LIMIT;
        const _debtLimit     = (window._debtPage   || 1) * _PAGE_LIMIT;
        const _quitLimit     = (window._quitPage   || 1) * _PAGE_LIMIT;
        let _activeRendered = 0, _debtRendered = 0, _quitRendered = 0;
        let _activeTotalCount = 0, _debtTotalCount = 0, _quitTotalCount = 0;

        Object.keys(allProfiles).forEach(name => {
            const p = allProfiles[name]; let safeBranch = p.branch || "CS1";
            const _joinM = p.createdAt ? p.createdAt.substring(0, 7) : "2000-01";
            const _quitM = p.quitDate ? p.quitDate.substring(0, 7) : null;
            if (_joinM === selMonth) m_new++;
            if (_quitM === selMonth) m_quit++;
            if (_joinM <= selMonth && (!_quitM || _quitM >= selMonth)) { m_active_theo++; if (p.skippedMonths && p.skippedMonths.includes(selMonth)) m_skipped++; }
            if(p.status === 'active' && _bStats[safeBranch] !== undefined) {
                _bStats[safeBranch].active++;
            }
            if(!isSingleBranch && selBranch !== 'all' && safeBranch !== selBranch) return;
            let branchTdHTML = isSingleBranch ? '' : `<td class="col-branch"><span class="badge bg-slate-100 text-slate-600 border border-slate-200">${window.getBranchNameDisplay(safeBranch)}</span></td>`;

            let safePhone = p.phone || ""; let safeBelt = p.belt || ""; let safeNotes = p.notes || ""; let safeNameEscaped = name.replace(/'/g, "\\'");
            let matchesSearch = true; if (search) matchesSearch = name.toLowerCase().includes(search) || safePhone.includes(search) || safeBelt.toLowerCase().includes(search) || safeNotes.toLowerCase().includes(search);
            if (!matchesSearch) return;
            // Smart Name: gắn năm sinh nếu tên trùng
            const _listYrBadge = _getYearBadge(name, p);
            // [THÊM] Badge "Mới" — hiện khi võ sinh đăng ký trong tháng đang xem
            const _newBadge = (_joinM === selMonth)
                ? ' <span style="font-size:0.62rem;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;border-radius:5px;padding:1px 5px;font-weight:900;vertical-align:middle;">MỚI</span>'
                : '';

            let beltHTML = window.getBeltBadge ? window.getBeltBadge(p.belt) : `<span class="badge bg-slate-100 text-slate-700 border border-slate-300">${p.belt}</span>`;
            if(p.status === 'active') {
                activeCount++;
                let lastPaidStr = p.paidUntil ? formatMonth(p.paidUntil) : "Chưa cập nhật";
                // [ĐÃ XÓA] Không còn hiện badge "Miễn phí" bên cạnh tên — chỉ hiển thị ở cột "đã đóng tới tháng"
                const paidBadge = p.feeExempt ? `<span class="badge hidden md:inline-block" style="background:#f3e8ff;color:#6b21a8;border:1px solid #d8b4fe;font-weight:900;">Miễn Học Phí</span><span class="badge md:hidden" style="background:#f3e8ff;color:#6b21a8;border:1px solid #d8b4fe;font-weight:900;">Miễn HP</span>` : `<span class="badge badge-active">${lastPaidStr}</span>`;
                // [THÊM] Badge biệt danh hiển thị ngay trong danh sách (không phải chỉ trong hồ sơ)
                const _activeNickBadge = p.nickname ? ' <span style="font-size:0.65rem;background:#ede9fe;color:#7c3aed;border:1px solid #ddd6fe;border-radius:4px;padding:1px 5px;font-weight:800;vertical-align:middle;">🏷 ' + p.nickname + '</span>' : '';
                // [PERF] Đếm tổng trước — badge count vẫn chính xác dù giới hạn render
                if(_curTabId === 'active') { _activeTotalCount++; if(_activeRendered < _activeLimit) { _activeRendered++; activeHtml += `<tr><td class="name-link text-[0.95rem]" onclick="openProfile('${safeNameEscaped}')">${_displayName(name)}${_listYrBadge}${_newBadge}${p.notes ? ' <span title="'+p.notes+'">📝</span>' : ''}${_activeNickBadge}</td><td class="text-[0.7rem] font-bold text-slate-500">${p.memberId || '-'}</td><td>${beltHTML}</td>${branchTdHTML}<td>${formatDate(p.dob)}</td><td>${paidBadge}</td><td class="font-medium text-slate-600">${safePhone}</td><td class="text-slate-500">${formatDate(p.createdAt)}</td><td><button type="button" class="btn-sm bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200" onclick="openProfile('${safeNameEscaped}')">${window.userRole === 'admin' ? '✏️ Sửa' : '👁️ Xem'}</button></td></tr>`; } }
                
                let isDebt = false;
                let unpaidMonthsCount = 0;
                let owedMonths = [];

                if (!p.feeExempt && (!p.skippedMonths || !p.skippedMonths.includes(selMonth))) {
                    // [BƯỚC 2] Normalize paidUntil để tránh sai so sánh "2025-1" vs "2025-01"
                    const _normPU = normalizeYYYYMM(p.paidUntil);
                    if (!_normPU || _normPU < selMonth) {
                        let firstUnpaid = _normPU ? addMonthsToYYYYMM(_normPU, 1) : (p.createdAt ? p.createdAt.substring(0, 7) : selMonth);
                        let cur = firstUnpaid;
                        while(cur <= selMonth && owedMonths.length < 24) { if(!p.skippedMonths || !p.skippedMonths.includes(cur)) owedMonths.push(cur); cur = addMonthsToYYYYMM(cur, 1); }
                        unpaidMonthsCount = owedMonths.length;
                        if (unpaidMonthsCount > 0) isDebt = true;
                    }
                }

                if(isDebt) {
                    debtCountRender++;
                    if(_bStats[safeBranch] !== undefined) _bStats[safeBranch].debt++;
                    let totalDebtAmount = unpaidMonthsCount * (Number(p.tuitionFee) || 0); totalDebtEst += totalDebtAmount;
                    const isOverdue = unpaidMonthsCount >= 2;
                    const rowBg = isOverdue ? 'style="background:#fff1f2;"' : '';
                    const countBadgeClass = isOverdue ? 'bg-rose-600 text-white border-rose-700' : 'bg-rose-50 text-rose-700 border border-rose-200';

                    const owedMonthsStr = owedMonths.join(',') || selMonth;
                    const safeOwedMonths = owedMonthsStr.replace(/'/g, '');
                    let lastPaidLabel = `<span class="font-bold text-primary text-[0.8rem]">${window.formatMonthCompact(owedMonthsStr)}</span>`;

                    // [PERF] Debt list pagination — đếm tổng nợ vẫn chính xác
                    _debtTotalCount++;
                    if(_curTabId === 'debt' && _debtRendered < _debtLimit) { _debtRendered++; debtHtml += `<tr ${rowBg}><td><span class="badge ${countBadgeClass}">${unpaidMonthsCount} Tháng</span></td><td>${lastPaidLabel}</td>${branchTdHTML}<td class="name-link text-[0.95rem]" onclick="openProfile('${safeNameEscaped}')">${_displayName(name)}${_listYrBadge}${isOverdue ? ' <span title="Nợ từ 2 tháng trở lên" class="text-rose-500">⚠️</span>' : ''}</td><td class="action-btns"><button type="button" class="btn-sm bg-indigo-50 text-indigo-700 border border-indigo-200" onclick="generateMultiMonthPaymentRequest('${safeNameEscaped}', '${safeOwedMonths}', '${safeBranch}', '${totalDebtAmount}')">📱 QR</button>${window.userRole === 'admin' ? `<button type="button" class="btn-sm bg-emerald-600 text-white shadow-sm" onclick="openQuickPayModal('${safeNameEscaped}', '${safeOwedMonths}', '${safeBranch}')">💰 Thu</button>` : ''}<button type="button" class="btn-sm bg-[#0068FF] text-white shadow-sm" onclick="copyAndOpenZalo('${safeNameEscaped}', '${safeOwedMonths}', '${safePhone}')">💬 Zalo</button>${window.userRole === 'admin' ? `<button type="button" class="btn-sm bg-slate-100 text-slate-700 border border-slate-200" onclick="handleQuitOption('${safeNameEscaped}', '${selMonth}')">🚫</button>` : ''}</td></tr>`; }
                }
            } else {
                // [PERF] Quit list pagination
                if(_curTabId === 'quit') { _quitTotalCount++; if(_quitRendered < _quitLimit) { _quitRendered++; quitHtml += `<tr><td class="name-link text-[0.95rem]" onclick="openProfile('${safeNameEscaped}')">${_displayName(name)}${_listYrBadge}</td><td class="text-[0.7rem] font-bold text-slate-500">${p.memberId || '-'}</td><td>${beltHTML}</td>${branchTdHTML}<td>${formatDate(p.dob)}</td><td>${formatDate(p.quitDate)}</td><td>${window.userRole === 'admin' ? `<button type="button" class="btn-sm bg-emerald-50 text-emerald-700 border border-emerald-200" onclick="openProfile('${safeNameEscaped}')">🔄 Khôi phục</button>` : ''}</td></tr>`; } }
            }
        });

        document.getElementById('debtTabCountBadge').innerText = debtCountRender;
        // [THÊM BUG 7] Cập nhật số giao dịch thu lên badge tab Học Phí
        const _txBadgeEl = document.getElementById('txTabCountBadge');
        if(_txBadgeEl) _txBadgeEl.innerText = txCountRender;

        let chartLabels = []; let chartIncome = []; let chartExpense = []; let chartActive = []; let chronologicalMonths = [];
        let [sy, sm] = selMonth.split('-').map(Number);
        for(let i=0; i<6; i++) { let m = sm - i; let y = sy; if(m <= 0) { m += 12; y -= 1; } chronologicalMonths.push(`${y}-${String(m).padStart(2, '0')}`); }
        chronologicalMonths.reverse();

        let m_actual = m_active_theo - m_skipped;
        
        reportHtml = `<tr><td class="font-black text-primary">${formatMonth(selMonth)}</td><td class="text-slate-800 font-bold text-base">${m_actual}</td><td class="text-emerald-600 font-medium">+${m_new}</td><td class="text-rose-600 font-medium">-${m_quit}</td><td class="text-emerald-600 font-bold">${(inc_tuition + inc_exam + inc_other + inc_uniform).toLocaleString()} ₫</td><td class="text-rose-600 font-bold">${(exp + exp_exam_total + exp_uniform).toLocaleString()} ₫</td><td class="${((inc_tuition + inc_exam + inc_other + inc_uniform)-(exp + exp_exam_total + exp_uniform))<0 ? 'text-rose-600' : 'text-emerald-600'} font-black text-base bg-slate-50">${((inc_tuition + inc_exam + inc_other + inc_uniform)-(exp + exp_exam_total + exp_uniform)).toLocaleString()} ₫</td></tr>`;

        chronologicalMonths.forEach((m, index) => { chartLabels[index] = formatMonth(m); if (m === selMonth) { chartIncome[index] = inc_tuition + inc_exam + inc_other + inc_uniform; chartExpense[index] = exp + exp_exam_total + exp_uniform; chartActive[index] = m_actual; } else { chartIncome[index] = 0; chartExpense[index] = 0; chartActive[index] = 0; } });

        // [PERF] Thêm nút "Tải thêm" nếu còn dữ liệu chưa render (> 100 dòng đầu).
        // Nút bấm gọi window._loadMore(tab) → tăng page → re-render trang tiếp.
        const _moreColspan = isSingleBranch ? 8 : 9;
        const _moreStyle = 'style="padding:10px;text-align:center;"';
        const _moreBtnStyle = 'class="btn-sm" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;font-size:0.78rem;cursor:pointer;"';
        if(_activeTotalCount > _activeLimit)  activeHtml += `<tr><td colspan="${_moreColspan}" ${_moreStyle}><button type="button" ${_moreBtnStyle} onclick="window._loadMore('active')">⬇ Tải thêm — còn ${_activeTotalCount - _activeRendered} võ sinh nữa</button></td></tr>`;
        if(_debtTotalCount   > _debtLimit)    debtHtml   += `<tr><td colspan="${_moreColspan}" ${_moreStyle}><button type="button" ${_moreBtnStyle} onclick="window._loadMore('debt')">⬇ Tải thêm — còn ${_debtTotalCount - _debtRendered} võ sinh nữa</button></td></tr>`;
        if(_quitTotalCount   > _quitLimit)    quitHtml   += `<tr><td colspan="${_moreColspan}" ${_moreStyle}><button type="button" ${_moreBtnStyle} onclick="window._loadMore('quit')">⬇ Tải thêm — còn ${_quitTotalCount - _quitRendered} võ sinh nữa</button></td></tr>`;

        _tabHtmlCache = { txList: txHtml, uniformTxList: uniformTxHtml, expenseList: expHtml, examExpenseList: examExpHtml, debtList: debtHtml, activeList: activeHtml, quitList: quitHtml, inventoryList: invListHtml, reportList: reportHtml };
        if (window.__store) window.__store.tabHtmlCache = _tabHtmlCache; // [Phase 2b] sync cache
        (_TAB_LISTS[_curTabId] || []).forEach(listId => { const el = document.getElementById(listId); if(el) el.innerHTML = _tabHtmlCache[listId] || ''; });

        const skippedNames = Object.keys(allProfiles).filter(n => { const pr = allProfiles[n]; return pr.status === 'active' && pr.skippedMonths && pr.skippedMonths.includes(selMonth); });
        const skippedSection = document.getElementById('skippedSection');
        if(skippedSection) {
            if(skippedNames.length > 0) {
                skippedSection.classList.remove('hidden');
                document.getElementById('skippedSectionTitle').innerText = `⏸ Báo nghỉ tháng ${formatMonth(selMonth)} — ${skippedNames.length} võ sinh miễn học phí`;
                document.getElementById('skippedThisMonthList').innerHTML = skippedNames.sort().map(n => `<span class="badge bg-amber-200 text-amber-900 border border-amber-400 shadow-sm cursor-pointer hover:bg-amber-300" onclick="openProfile('${n.replace(/'/g,"\\'")}')" title="Bấm để xem hồ sơ">${n}</span>`).join('');
            } else {
                skippedSection.classList.add('hidden');
            }
        }

        let tIncActive = inc_tuition + inc_other + inc_exam + inc_uniform; let tExpActive = exp + exp_exam_total + exp_uniform; let uniformProfit = inc_uniform - exp_uniform;       

        document.getElementById('sum_tuition').innerText = inc_tuition.toLocaleString() + " ₫"; document.getElementById('sum_other').innerText = inc_other.toLocaleString() + " ₫";
        if(document.getElementById('sum_exam_tab')) document.getElementById('sum_exam_tab').innerText = inc_exam.toLocaleString() + " ₫";
        if(document.getElementById('sum_exam_expense_tab')) document.getElementById('sum_exam_expense_tab').innerText = exp_exam_total.toLocaleString() + " ₫";
        if(document.getElementById('sum_exam_profit_tab')) document.getElementById('sum_exam_profit_tab').innerText = (inc_exam - exp_exam_total).toLocaleString() + " ₫";
        const _examBrFeeEl = document.getElementById('exam_branch_fees');
        if(_examBrFeeEl && _bCount > 1 && inc_exam > 0) {
            let _ebHtml = '<div class="mt-3 pt-3 border-t border-orange-100"><div class="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wide mb-2">💰 Lệ phí thu theo cơ sở</div><div class="flex flex-wrap gap-2">';
            for(let _bi = 1; _bi <= _bCount; _bi++) {
                const _bc = 'CS' + _bi;
                const _bn = clubConfig['branchName' + _bi] || ('Cơ sở ' + _bi);
                const _bf = _bExamStats[_bc] || 0;
                if(_bf > 0) _ebHtml += `<div class="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5"><span class="text-[0.7rem] font-bold text-orange-800 truncate max-w-[100px]">${_bn}</span><span class="font-black text-orange-600 text-sm whitespace-nowrap">${_bf.toLocaleString()} ₫</span></div>`;
            }
            _ebHtml += '</div></div>';
            _examBrFeeEl.innerHTML = _ebHtml;
            _examBrFeeEl.classList.remove('hidden');
        } else if(_examBrFeeEl) {
            _examBrFeeEl.classList.add('hidden');
        }
        
        document.getElementById('totalIncomeDashboard').innerText = tIncActive.toLocaleString() + " ₫"; document.getElementById('totalExpenseDashboard').innerText = tExpActive.toLocaleString() + " ₫"; document.getElementById('totalProfitDashboard').innerText = (tIncActive - tExpActive).toLocaleString() + " ₫"; document.getElementById('totalUniformProfitDashboard').innerText = uniformProfit.toLocaleString() + " ₫";

        document.getElementById('activeStudentCount').innerText = activeCount; document.getElementById('debtCount').innerText = debtCountRender + " Bạn"; document.getElementById('debtEst').innerText = `Dự thu: ${totalDebtEst.toLocaleString()} ₫`;
        const _mhbAC = document.getElementById('mhbActiveCount'); if(_mhbAC) _mhbAC.innerText = activeCount;
        const _mhbDC = document.getElementById('mhbDebtCount'); if(_mhbDC) _mhbDC.innerText = debtCountRender;
        const _mhbInc = document.getElementById('mhbIncome'); if(_mhbInc) { const _v = tIncActive; _mhbInc.innerText = _v >= 1000000 ? (_v/1000000).toFixed(1).replace(/\.0$/,'') + 'tr' : _v >= 1000 ? Math.round(_v/1000) + 'k' : (_v||0).toLocaleString(); }
        const _mhbMon = document.getElementById('mhbMonth'); if(_mhbMon && selMonth) _mhbMon.innerText = 'T' + parseInt(selMonth.split('-')[1]) + '/' + selMonth.split('-')[0].substring(2);

        // Update per-branch stats section on dashboard
        const _bsSec = document.getElementById('branchStatsSection');
        const _bsGrid = document.getElementById('branchStatsGrid');
        if(_bsSec && _bsGrid && _bCount > 1) {
            _bsSec.style.display = '';
            let _bsHtml = '';
            for(let _bi = 1; _bi <= _bCount; _bi++) {
                const _bCode = 'CS' + _bi;
                const _bName = clubConfig['branchName' + _bi] || ('Cơ sở ' + _bi);
                const _bData = _bStats[_bCode] || { income: 0, active: 0 };
                const _tuitionEntries = Object.entries(_bData.tuitionMap || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
                const _examEntries = Object.entries(_bData.examFeeMap || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
                let _feeBreakdownHtml = '';
                const _hasAny = _tuitionEntries.length > 0 || _examEntries.length > 0;
                if(_hasAny) {
                    const _tuitionBadges = _tuitionEntries.map(([fee, count]) => `<span style="font-size:0.72rem;font-weight:700;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:8px;padding:2px 8px;white-space:nowrap;">${Number(fee).toLocaleString()}₫ × ${count} VS</span>`).join('');
                    const _examBadges = _examEntries.map(([fee, count]) => `<span title="Lệ phí thi" style="font-size:0.72rem;font-weight:700;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:8px;padding:2px 8px;white-space:nowrap;">🎖️ ${Number(fee).toLocaleString()}₫ × ${count} VS</span>`).join('');
                    _feeBreakdownHtml = '<div class="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">' + _tuitionBadges + _examBadges + '</div>';
                }
                const _debtHtml = _bData.debt > 0 ? `<div class="text-xs mt-1" style="color:#dc2626;font-weight:700;">⚠️ ${_bData.debt} võ sinh nợ học phí</div>` : '';
                _bsHtml += `<div class="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><div class="flex items-center gap-4"><div class="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl flex-shrink-0">🏢</div><div class="flex-1 min-w-0"><div class="font-black text-slate-800 text-sm truncate">${_bName}</div><div class="text-emerald-600 font-bold text-base">${_bData.income.toLocaleString()} ₫</div><div class="text-slate-500 text-xs mt-0.5">👥 ${_bData.active} võ sinh đang tập</div>${_debtHtml}</div></div>${_feeBreakdownHtml}</div>`;
            }
            _bsGrid.innerHTML = _bsHtml;
        } else if(_bsSec) {
            _bsSec.style.display = 'none';
        }

        if(document.getElementById('sum_expense_tab')) document.getElementById('sum_expense_tab').innerText = exp.toLocaleString() + " ₫";
        if(document.getElementById('sum_debt_count_tab')) document.getElementById('sum_debt_count_tab').innerText = debtCountRender + " Bạn";
        if(document.getElementById('sum_debt_amount_tab')) document.getElementById('sum_debt_amount_tab').innerText = totalDebtEst.toLocaleString() + " ₫";
        
        document.getElementById('sum_uniform_in').innerText = inc_uniform.toLocaleString() + " ₫";
        document.getElementById('sum_uniform_out').innerText = exp_uniform.toLocaleString() + " ₫";
        document.getElementById('sum_uniform_profit').innerText = (inc_uniform - exp_uniform).toLocaleString() + " ₫";

        _tabHtmlCache._chartData = { labels: chartLabels, income: chartIncome, expense: chartExpense, active: chartActive };
        if (window.__store) window.__store.tabHtmlCache = _tabHtmlCache; // [Phase 2b] sync after chartData
        if(_curTabId === 'dashboard') {
            if(financeChartInstance) { financeChartInstance.data.labels = chartLabels; financeChartInstance.data.datasets[0].data = chartIncome; financeChartInstance.data.datasets[1].data = chartExpense; financeChartInstance.update('none'); }
            else { financeChartInstance = new Chart(document.getElementById('financeChart'), { type: 'bar', data: { labels: chartLabels, datasets: [{ label: 'Tổng Thu', data: chartIncome, backgroundColor: 'rgba(16, 185, 129, 0.9)', borderRadius: 6 }, { label: 'Tổng Chi', data: chartExpense, backgroundColor: 'rgba(244, 63, 94, 0.9)', borderRadius: 6 }]}, options: { animation: false, maintainAspectRatio: false, responsive: true, scales: { y: { beginAtZero: true, grid: { color: '#f8fafc' } }, x: { grid: { display: false } } }, plugins: { legend: { labels: { font: { family: "'Inter', sans-serif", weight: 'bold' } } } } } }); }
            if(memberChartInstance) { memberChartInstance.data.labels = chartLabels; memberChartInstance.data.datasets[0].data = chartActive; memberChartInstance.update('none'); }
            else { memberChartInstance = new Chart(document.getElementById('memberChart'), { type: 'line', data: { labels: chartLabels, datasets: [{ label: 'Võ sinh Đang tập', data: chartActive, borderColor: '#0033A0', backgroundColor: 'rgba(0, 51, 160, 0.08)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderWidth: 2 }]}, options: { animation: false, maintainAspectRatio: false, responsive: true, scales: { y: { beginAtZero: true, grid: { color: '#f8fafc' } }, x: { grid: { display: false } } }, plugins: { legend: { labels: { font: { family: "'Inter', sans-serif", weight: 'bold' } } } } } }); }
        }
        if (window.__store) { window.__store.financeChartInstance = financeChartInstance; window.__store.memberChartInstance = memberChartInstance; } // [Phase 2c] sync chart instances

        if(_curTabId === 'exam') window.renderExamList();
    }

    window.getBeltBadge = function(belt) {
        if(!belt) belt = 'Đai trắng - Cấp 10'; let bg = '#fff'; let col = '#334155'; let border = '1px solid #cbd5e1'; let extra = '';
        if(belt.includes('trắng')) { bg = '#fff'; col = '#334155'; }
        else if(belt.includes('vàng')) { bg = 'var(--belt-yellow)'; border = 'none'; }
        else if(belt.includes('xanh lá')) { bg = 'var(--belt-green)'; col = '#fff'; border = 'none'; }
        else if(belt.includes('xanh dương')) { bg = 'var(--belt-blue)'; col = '#fff'; border = 'none'; }
        else if(belt.includes('Đen - Đỏ') || belt.includes('Đỏ - Đen')) { bg = 'linear-gradient(to bottom, #1e293b 50%, #C8102E 50%)'; col = '#fff'; border = 'none'; extra = 'text-shadow:0 1px 3px rgba(0,0,0,0.6);'; }
        else if(belt.includes('đỏ')) { bg = 'var(--belt-red)'; col = '#fff'; border = 'none'; }
        else if(belt.includes('Đen')) { bg = 'var(--belt-black)'; col = '#fff'; border = 'none'; }
        return `<span class="badge shadow-sm" style="background:${bg}; color:${col}; border:${border}; min-width: 90px; text-align:center;${extra}">${belt}</span>`;
    }

    window.renderExamList = () => {
        const filterBelt = document.getElementById('exam_filter_belt').value; const uiExam = document.getElementById('examList'); if(!uiExam) return;
        const selMonth = document.getElementById('filterMonth').value; let paidStudents = {};
        const isSingleBranch = clubConfig.branchCount === 1;

        allTransactions.forEach(t => { if ((t.type === 'Lệ phí thi' || t.type === 'Học phí + Lệ phí thi') && (t.txMonth === selMonth || (t.date && t.date.startsWith(selMonth)))) { let stuName = ""; if (t.type === 'Học phí + Lệ phí thi') { stuName = t.description ? t.description.trim() : ""; paidStudents[stuName] = { id: t.id, amount: t.examAmount }; } else { let match = (t.description || "").match(/^(.*?)\s*\(/); stuName = match ? match[1].trim() : (t.description || "").trim(); if(stuName) paidStudents[stuName] = { id: t.id, amount: t.amount }; } } });
        
        let htmlOriginal = '';
        let htmlNewlyUpgraded = '';
        let newlyUpgradedCount = 0;

        Object.keys(allProfiles).sort().forEach(name => {
            const p = allProfiles[name];
            if(p.status !== 'active' || (p.belt || 'Đai trắng - Cấp 10') !== filterBelt) return;

            let isPaid = paidStudents[name]; let safeName = name.replace(/'/g, "\\'");
            let branchTdHTML = isSingleBranch ? '' : `<td class="col-branch"><span class="badge bg-slate-100 text-slate-600 border border-slate-200">${window.getBranchNameDisplay(p.branch || 'CS1')}</span></td>`;
            let statusBadge = isPaid ? `<span class="badge badge-active">Đã nộp (${Number(isPaid.amount).toLocaleString()} đ)</span>` : `<span class="badge badge-quit">Chưa nộp</span>`;
            let actionBtn = isPaid ? (window.userRole === 'admin' ? `<button type="button" class="btn-sm bg-slate-200 hover:bg-slate-300 text-slate-700" onclick="deleteTx('${isPaid.id}')">Hủy</button>` : '') : (window.userRole === 'admin' ? `<button type="button" class="btn-sm bg-orange-500 hover:bg-orange-600 text-white shadow-sm cursor-pointer" onclick="quickCollectExam('${safeName}')">💰 Thu phí</button>` : '');

            const isNewlyUpgraded = p.upgradedAt && p.upgradedAt >= selMonth.substring(0,7) && p.upgradedFrom;
            const newBadge = isNewlyUpgraded ? `<span class="ml-1 text-[0.65rem] font-black bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded uppercase" title="Vừa thăng từ ${p.upgradedFrom} tháng ${p.upgradedAt}">↑ Mới lên</span>` : '';

            const row = `<tr class="${isNewlyUpgraded ? 'bg-amber-50/60' : ''}"><td><input type="checkbox" class="exam-check w-4 h-4 cursor-pointer accent-orange-500 rounded" value="${name.replace(/"/g, '&quot;')}"></td><td class="name-link text-[0.95rem]" onclick="openProfile('${safeName}')">${name}${newBadge}</td>${branchTdHTML}<td>${getBeltBadge(p.belt)}</td><td>${statusBadge}</td><td>${actionBtn}</td></tr>`;

            if(isNewlyUpgraded) { htmlNewlyUpgraded += row; newlyUpgradedCount++; }
            else { htmlOriginal += row; }
        });

        let htmlExam = htmlOriginal;
        if(newlyUpgradedCount > 0) {
            const colSpan = isSingleBranch ? 5 : 6;
            htmlExam += `<tr><td colspan="${colSpan}" class="bg-amber-100 border-t-2 border-amber-300 px-3 py-2"><span class="text-[0.7rem] font-black text-amber-800 uppercase tracking-wide">↑ Vừa thăng đai lên cấp này (${newlyUpgradedCount} võ sinh) — Chưa thi kỳ này</span></td></tr>`;
            htmlExam += htmlNewlyUpgraded;
        }

        uiExam.innerHTML = htmlExam || `<tr><td colspan="${isSingleBranch ? 5 : 6}" class="text-center text-slate-400 py-8 italic">Không có võ sinh nào ở cấp đai này</td></tr>`;
    };
    
    window.finishExamSession = async () => {
        if(window.userRole === 'viewer') return alert("Tài khoản khách không có quyền này!");
        const selMonth = document.getElementById('filterMonth').value || getLocalToday().substring(0,7);
        const upgradedNames = Object.keys(allProfiles).filter(n => allProfiles[n].upgradedAt && allProfiles[n].upgradedAt >= selMonth.substring(0,7));
        if(upgradedNames.length === 0) return alert("Không có võ sinh nào được đánh dấu thăng đai trong kỳ này.");
        if(!confirm(`Hoàn tất kỳ thi?\n\nThao tác này sẽ:\n✅ Xóa nhãn "Mới lên" của ${upgradedNames.length} võ sinh\n✅ Hệ thống trở lại trạng thái ban đầu cho kỳ thi tiếp theo\n\nDữ liệu thu chi và đai hiện tại KHÔNG bị thay đổi.`)) return;
        try {
            const batch = writeBatch(db);
            for(const name of upgradedNames) {
                batch.set(doc(db, "clubs", currentClubId, "profiles", name), { upgradedAt: null, upgradedFrom: null }, { merge: true });
            }
            await batch.commit();
            window.showToast(`🏁 Đã hoàn tất kỳ thi! Đã reset ${upgradedNames.length} võ sinh về trạng thái bình thường.`);
            renderExamList();
        } catch(err) { console.error(err); alert("Lỗi: " + err.message); }
    };

    window.BELT_NEXT = {
        'Đai trắng - Cấp 10':       'Đai trắng 1 vạch - Cấp 9',
        'Đai trắng 1 vạch - Cấp 9': 'Đai trắng 2 vạch - Cấp 8',
        'Đai trắng 2 vạch - Cấp 8': 'Đai vàng - Cấp 7',
        'Đai vàng - Cấp 7':         'Đai xanh lá - Cấp 6',
        'Đai xanh lá - Cấp 6':      'Đai xanh dương - Cấp 5',
        'Đai xanh dương - Cấp 5':   'Đai đỏ - Cấp 4',
        'Đai đỏ - Cấp 4':           'Đai đỏ 1 vạch - Cấp 3',
        'Đai đỏ 1 vạch - Cấp 3':    'Đai đỏ 2 vạch - Cấp 2',
        'Đai đỏ 2 vạch - Cấp 2':    'Đai đỏ 3 vạch - Cấp 1',
        'Đai đỏ 3 vạch - Cấp 1':    'Đai Đen - Đỏ',
        'Đai Đen - Đỏ':             'Đai Đen',
    };

    window.updateNextBeltPreview = () => {
        const cur = document.getElementById('exam_filter_belt').value;
        const next = window.BELT_NEXT[cur];
        const el = document.getElementById('nextBeltPreview');
        if(el) el.textContent = next ? `→ Thăng lên: ${next}` : '→ Đã là cấp cao nhất';
    };

    window.selectPaidStudents = () => {
        const selMonth = document.getElementById('filterMonth').value || getLocalToday().substring(0,7);
        let paidNames = new Set();
        allTransactions.forEach(t => {
            if((t.type === 'Lệ phí thi' || t.type === 'Học phí + Lệ phí thi') && (t.txMonth === selMonth || (t.date && t.date.startsWith(selMonth)))) {
                let stuName = '';
                if(t.type === 'Học phí + Lệ phí thi') { stuName = (t.description || '').trim(); }
                else { let m = (t.description || '').match(/^(.*?)\s*\(/); stuName = m ? m[1].trim() : (t.description || '').trim(); }
                if(stuName) paidNames.add(stuName);
            }
        });
        let checked = 0;
        document.querySelectorAll('.exam-check').forEach(cb => {
            const _p = allProfiles[cb.value];
            const _isNewlyUp = _p && _p.upgradedAt && _p.upgradedAt >= selMonth.substring(0,7) && _p.upgradedFrom;
            cb.checked = !_isNewlyUp && paidNames.has(cb.value);
            if(cb.checked) checked++;
        });
        if(checked === 0) window.showToast('⚠️ Chưa có võ sinh nào đóng phí thi trong tháng này');
        else window.showToast(`✅ Đã chọn ${checked} võ sinh đã đóng lệ phí thi`);
    };

    window.toggleAllExam = (source) => document.querySelectorAll('.exam-check').forEach(cb => cb.checked = source.checked);

// ═══ THU GỘP NHIỀU KHOẢN (Multi-Item Receipt) ═══════════════

window.openMultiItemModal = () => {
    document.getElementById('multiItemModal').style.display = 'flex';
    const fm = document.getElementById('filterMonth');
    if(fm && fm.value) document.getElementById('mi_tuition_month').value = fm.value;
    document.getElementById('mi_name').value = '';
    document.getElementById('mi_profile_info').style.display = 'none';
    document.getElementById('mi_history_panel').style.display = 'none';
    document.getElementById('mi_history_body').style.display = 'none';
    document.getElementById('mi_history_toggle_icon').textContent = '▼';
    document.getElementById('mi_history_list').innerHTML = '';
    document.getElementById('mi_tuition_discount').checked = false;
    document.getElementById('mi_discount_pct').value = '10';
    document.getElementById('mi_discount_saved').style.display = 'none';
    document.getElementById('mi_tuition_actual').value = '';
    document.getElementById('mi_tuition_display').value = '';
    document.getElementById('mi_exam_toggle').checked = false;
    document.getElementById('mi_other_toggle').checked = false;
    document.getElementById('mi_exam_section').style.display = 'none';
    document.getElementById('mi_other_section').style.display = 'none';
    document.getElementById('mi_inv_toggle').checked = false;
    document.getElementById('mi_inv_section').style.display = 'none';
    document.getElementById('mi_inv_total_actual').value = '0';
    document.getElementById('mi_inv_price_actual').value = '';
    document.getElementById('mi_inv_price_display').value = '';
    document.getElementById('mi_inv_qty').value = '1';
    document.getElementById('mi_inv_size_text').value = '';
    document.getElementById('mi_inv_total_display').value = '';
    document.getElementById('mi_inv_debt_panel').style.display = 'none';
    document.getElementById('mi_inv_debt_list').innerHTML = '';
    document.getElementById('mi_inv_debt_total_actual').value = '0';
    document.getElementById('mi_inv_debt_total_display').textContent = '0 ₫';
    const prevDebtOpt = document.getElementById('mi_tuition_pkg').querySelector('option[data-debt="true"]');
    if(prevDebtOpt) prevDebtOpt.remove();
    document.getElementById('mi_tuition_pkg').value = '1';
    if(window._setupMiAutocomplete) window._setupMiAutocomplete();
    updateMultiItemTotal();
};

window.toggleMultiItemExam = () => {
    const on = document.getElementById('mi_exam_toggle').checked;
    document.getElementById('mi_exam_section').style.display = on ? 'grid' : 'none';
    if(on) {
        const defaultFeeEl = document.getElementById('exam_fee_all_actual');
        if(defaultFeeEl && defaultFeeEl.value) {
            const feeVal = Number(defaultFeeEl.value) || 0;
            document.getElementById('mi_exam_actual').value = feeVal;
            document.getElementById('mi_exam_display').value = feeVal > 0 ? feeVal.toLocaleString('vi-VN') : '';
        }
        const txTitle = document.getElementById('tx_exam_title');
        if(txTitle && txTitle.value) {
            document.getElementById('mi_exam_title').value = txTitle.value;
        } else {
            const now = new Date(); const m = now.getMonth() + 1; const q = Math.ceil(m/3);
            document.getElementById('mi_exam_title').value = `Thi Quý ${q}/${now.getFullYear()}`;
        }
    }
    updateMultiItemTotal();
};

window.toggleMultiItemOther = () => {
    document.getElementById('mi_other_section').style.display =
        document.getElementById('mi_other_toggle').checked ? 'grid' : 'none';
    updateMultiItemTotal();
};

window.toggleMultiItemInv = () => {
    const on = document.getElementById('mi_inv_toggle').checked;
    document.getElementById('mi_inv_section').style.display = on ? 'block' : 'none';
    if(on) {
        window.toggleMiInvCategory();
    } else {
        document.getElementById('mi_inv_total_actual').value = '0';
    }
    updateMultiItemTotal();
};

window.toggleMiInvCategory = () => {
    const cat = document.getElementById('mi_inv_category').value;
    const sel = document.getElementById('mi_inv_size_select');
    const txt = document.getElementById('mi_inv_size_text');
    const hint = document.getElementById('mi_inv_stock_hint');
    if (cat === 'Võ phục') {
        // Võ phục: dropdown size cố định kèm thông tin tồn kho
        sel.style.display = ''; txt.style.display = 'none';
        sel.innerHTML = '';
        const inv = window._liveInvMap || {};
        const vpSizes = ["Size 1m","Size 1m1","Size 1m2","Size 1m3","Size 1m4","Size 1m5","Size 1m6","Size 1m7","Size 1m8"];
        let hasStock = false;
        vpSizes.forEach(sz => {
            const key = 'Võ phục|||' + sz;
            const s = inv[key] || { in: 0, out: 0 };
            const bal = s.in - s.out;
            const opt = document.createElement('option');
            opt.value = sz;
            if(bal > 0) { opt.textContent = sz + ' (Tồn: ' + bal + ')'; hasStock = true; }
            else { opt.textContent = sz + ' (Hết hàng)'; opt.disabled = true; }
            sel.appendChild(opt);
        });
        hint.textContent = hasStock ? '' : '— Kho trống';
    } else {
        // Kiểm tra danh mục tùy chỉnh có sizes định sẵn không
        const customCat = (window.invCustomCategories || []).find(c => c.name === cat);
        if (customCat && customCat.sizes && customCat.sizes.length > 0) {
            // Có sizes định sẵn → dùng dropdown, hiện số lượng tồn kho nếu có
            sel.style.display = ''; txt.style.display = 'none';
            sel.innerHTML = '';
            const inv = window._liveInvMap || {};
            let hasStock = false;
            customCat.sizes.forEach(sz => {
                const key = cat + '|||' + sz;
                const s = inv[key] || { in: 0, out: 0 };
                const bal = s.in - s.out;
                const opt = document.createElement('option');
                opt.value = sz;
                if (bal > 0) { opt.textContent = sz + ' (Tồn: ' + bal + ')'; hasStock = true; }
                else { opt.textContent = sz + ' (Hết hàng)'; opt.disabled = true; }
                sel.appendChild(opt);
            });
            if (hint) hint.textContent = hasStock ? '' : '— Kho trống';
        } else {
            // Áo thun, Bảo hộ, danh mục không có sizes → nhập tự do
            sel.style.display = 'none'; txt.style.display = '';
            hint.textContent = '';
        }
    }
    updateMultiItemTotal();
};

window.calcMiInvTotal = () => {
    const qty = Number(document.getElementById('mi_inv_qty').value) || 0;
    const price = Number(document.getElementById('mi_inv_price_actual').value) || 0;
    const total = qty * price;
    document.getElementById('mi_inv_total_actual').value = total;
    document.getElementById('mi_inv_total_display').value = total > 0 ? total.toLocaleString('vi-VN') + ' ₫' : '';
    updateMultiItemTotal();
};

// ═══ Toggle học phí trong phiếu Thu Gộp ═══
window.toggleMiTuitionSection = () => {
    const enabled = document.getElementById('mi_tuition_enabled');
    const body    = document.getElementById('mi_tuition_body');
    const badge   = document.getElementById('mi_tuition_status_badge');
    const isOn = enabled ? enabled.checked : true;
    if (body)  body.style.display  = isOn ? '' : 'none';
    // Đã bỏ chữ "Bắt buộc" — học phí không còn bắt buộc nữa
    if (badge) badge.textContent   = isOn ? 'Đang thu' : '— Không thu';
    if (!isOn) {
        // Xóa số tiền học phí khi HLV bỏ tích
        const el = document.getElementById('mi_tuition_actual');
        const dl = document.getElementById('mi_tuition_display');
        if (el) el.value = '';
        if (dl) dl.value = '';
        window.updateMultiItemTotal && window.updateMultiItemTotal();
    } else {
        // Bật lại → tính lại học phí
        window.updateMultiItemAutoFee && window.updateMultiItemAutoFee();
    }
};

window.updateMultiItemAutoFee = () => {
    const nameEl = document.getElementById('mi_name');
    const name = nameEl ? nameEl.value.trim() : '';
    let profile = allProfiles[name];
    if (!profile && name) {
        const nameLower = name.toLowerCase();
        const matchKey = Object.keys(allProfiles).find(k => k.toLowerCase() === nameLower);
        if (matchKey) profile = allProfiles[matchKey];
    }
    const baseFee = profile ? (Number(profile.tuitionFee) || 0) : 0;
    const pkg = Number(document.getElementById('mi_tuition_pkg').value) || 1;
    const discountOn = document.getElementById('mi_tuition_discount').checked;
    const savedEl = document.getElementById('mi_discount_saved');
    const pct = discountOn ? (Number(document.getElementById('mi_discount_pct').value) || 10) : 0;
    const actualEl = document.getElementById('mi_tuition_actual');
    let rawFee;
    if (baseFee > 0) {
        rawFee = baseFee * pkg;
        actualEl.setAttribute('data-raw', rawFee);
    } else {
        const storedRaw = Number(actualEl.getAttribute('data-raw')) || 0;
        const currentActual = Number(actualEl.value) || 0;
        rawFee = storedRaw > 0 ? storedRaw : currentActual;
    }
    let fee = discountOn && pct > 0 ? Math.round(rawFee * (1 - pct / 100)) : rawFee;
    let saved = rawFee - fee;
    if (savedEl) {
        if (discountOn && saved > 0) {
            savedEl.style.display = 'block';
            savedEl.textContent = '↓ Giảm ' + saved.toLocaleString('vi-VN') + '₫ (' + pct + '%)';
        } else { savedEl.style.display = 'none'; }
    }
    // Chỉ ghi học phí nếu HLV đã bật "Thu học phí"
    const _tuitionOn = !document.getElementById('mi_tuition_enabled') || document.getElementById('mi_tuition_enabled').checked;
    if (rawFee > 0 && _tuitionOn) {
        actualEl.value = fee;
        document.getElementById('mi_tuition_display').value = fee > 0 ? fee.toLocaleString('vi-VN') : '';
    } else if (!_tuitionOn) {
        actualEl.value = '';
        document.getElementById('mi_tuition_display').value = '';
    }
    const infoCard = document.getElementById('mi_profile_info');
    if (profile && name && infoCard) {
        document.getElementById('mi_profile_belt').textContent = profile.belt || 'Chưa có đai';
        document.getElementById('mi_profile_branch').textContent = window.getBranchNameDisplay ? window.getBranchNameDisplay(profile.branch) : (profile.branch || '');
        document.getElementById('mi_profile_fee').textContent = baseFee > 0 ? baseFee.toLocaleString('vi-VN') + ' ₫/tháng' : 'Chưa cài';
        infoCard.style.display = 'flex';
        window._refreshMiHistoryBadges(name, profile);
    } else if (infoCard && !name) {
        infoCard.style.display = 'none';
        document.getElementById('mi_history_panel').style.display = 'none';
    }
    updateMultiItemTotal();
};

window._refreshMiHistoryBadges = (name, profile) => {
    // Guard: prevent infinite recursion with updateMultiItemAutoFee
    if (window._miRefreshingBadges) return;
    window._miRefreshingBadges = true;
    const panel = document.getElementById('mi_history_panel');
    panel.style.display = 'block';
    const paidUntil = profile ? profile.paidUntil : null;
    const paidUntilBadge = document.getElementById('mi_paid_until_badge');
    const debtBadge = document.getElementById('mi_debt_badge');
    const debtMonths = document.getElementById('mi_debt_months');
    const pkgSelect = document.getElementById('mi_tuition_pkg');
    // Remove any previous auto-debt option
    const prevDebtOpt = pkgSelect.querySelector('option[data-debt="true"]');
    if(prevDebtOpt) prevDebtOpt.remove();

    if (paidUntil) {
        paidUntilBadge.textContent = '✅ Đến ' + formatMonth(paidUntil);
        const today = getLocalToday().substring(0, 7);
        let unpaid = 0;
        const firstUnpaidMonth = addMonthsToYYYYMM(paidUntil, 1);
        let cur = firstUnpaidMonth;
        const debtList = [];
        while (cur <= today) { unpaid++; debtList.push(formatMonth(cur)); cur = addMonthsToYYYYMM(cur, 1); }
        if (unpaid > 0) {
            debtBadge.style.display = 'inline-block';
            debtBadge.textContent = '⚠️ Nợ ' + unpaid + ' tháng';
            debtMonths.style.display = 'inline-block';
            debtMonths.textContent = debtList.join(', ');
            // Auto-fill: set start month to first unpaid month, pkg to exact debt count
            document.getElementById('mi_tuition_month').value = firstUnpaidMonth;
            if(!pkgSelect.querySelector(`option[value="${unpaid}"]`)) {
                const opt = document.createElement('option');
                opt.value = unpaid;
                opt.textContent = unpaid + ' tháng (thu nợ ' + unpaid + ' tháng)';
                opt.setAttribute('data-debt', 'true');
                pkgSelect.insertBefore(opt, pkgSelect.firstChild);
            }
            pkgSelect.value = unpaid;
        } else {
            debtBadge.style.display = 'none';
            debtMonths.style.display = 'none';
            // Paid up — set to current filter month, 1 pkg
            const fm = document.getElementById('filterMonth');
            if(fm && fm.value) document.getElementById('mi_tuition_month').value = fm.value;
            pkgSelect.value = '1';
        }
    } else {
        paidUntilBadge.textContent = '❓ Chưa có dữ liệu';
        debtBadge.style.display = 'none';
        debtMonths.style.display = 'none';
        const fm = document.getElementById('filterMonth');
        if(fm && fm.value) document.getElementById('mi_tuition_month').value = fm.value;
        pkgSelect.value = '1';
    }
    updateMultiItemAutoFee();

    // Load unpaid inventory (kho đồ) items for this student
    const invDebtPanel = document.getElementById('mi_inv_debt_panel');
    const invDebtList = document.getElementById('mi_inv_debt_list');
    const invDebtBadge = document.getElementById('mi_inv_debt_badge');
    invDebtList.innerHTML = '';
    // [Phase 3.8A] Guard: đảm bảo dữ liệu kho đã sẵn sàng trước khi tìm nợ kho đồ.
    window.ensureInventoryForFeature?.('feeReceipt', 'build-fee-receipt');
    // [Phase 3.8B] Dùng getInventoryDebtsForStudent() nếu index đã sẵn sàng (O(1) lookup).
    // allowFallback: true → nếu index chưa ready, tự động filter allInventory theo logic cũ.
    // Kết quả PHẢI giống y chang filter gốc — đây là điều kiện bắt buộc.
    const unpaidInvItems = (typeof window.getInventoryDebtsForStudent === 'function')
        ? window.getInventoryDebtsForStudent(name, { allowFallback: true, reason: 'fee-receipt' })
        : (allInventory || []).filter(t =>
            t.unpaid === true && t.type === 'Xuất bán' &&
            (t.desc === name || t.description === name)
          );
    if(unpaidInvItems.length > 0) {
        invDebtPanel.style.display = 'block';
        invDebtBadge.textContent = unpaidInvItems.length + ' khoản';
        unpaidInvItems.forEach(item => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #fff7ed;';
            const label = (item.category || '') + (item.size ? ' ' + item.size : '') + (item.qty > 1 ? ' ×' + item.qty : '');
            const amt = Number(item.amount || 0);
            div.innerHTML = `<input type="checkbox" class="mi-inv-debt-check w-4 h-4 accent-orange-500 cursor-pointer rounded" data-inv-id="${item.id}" data-amount="${amt}" data-label="${label.replace(/"/g,'&quot;')}" checked>
                <div style="flex:1;min-width:0;"><div style="font-size:0.8rem;font-weight:700;color:#1e293b;">${label}</div><div style="font-size:0.65rem;color:#94a3b8;">${item.date || ''}</div></div>
                <span style="font-size:0.85rem;font-weight:900;color:#f97316;">${amt.toLocaleString('vi-VN')}₫</span>`;
            div.querySelector('input').addEventListener('change', window.recalcMiInvDebt);
            invDebtList.appendChild(div);
        });
        window.recalcMiInvDebt();
    } else {
        invDebtPanel.style.display = 'none';
        document.getElementById('mi_inv_debt_total_actual').value = '0';
        document.getElementById('mi_inv_debt_total_display').textContent = '0 ₫';
        updateMultiItemTotal();
    }
    // Auto-toggle "Thu học phí" dựa vào trạng thái đóng tiền của võ sinh
    const _tuitionCb = document.getElementById('mi_tuition_enabled');
    if (_tuitionCb) {
        if (paidUntil) {
            const _todayM = getLocalToday().substring(0, 7);
            // Đã đóng đến tháng hiện tại trở lên → bỏ tích học phí
            _tuitionCb.checked = paidUntil < _todayM;
        } else {
            _tuitionCb.checked = true; // Chưa đóng → mặc định thu
        }
        window.toggleMiTuitionSection && window.toggleMiTuitionSection();
    }
    window._miRefreshingBadges = false;
};

window.recalcMiInvDebt = () => {
    const checks = document.querySelectorAll('.mi-inv-debt-check:checked');
    let total = 0;
    checks.forEach(c => { total += Number(c.getAttribute('data-amount')) || 0; });
    document.getElementById('mi_inv_debt_total_actual').value = total;
    document.getElementById('mi_inv_debt_total_display').textContent = total.toLocaleString('vi-VN') + ' ₫';
    updateMultiItemTotal();
};

window.toggleMiHistory = async () => {
    const body = document.getElementById('mi_history_body');
    const icon = document.getElementById('mi_history_toggle_icon');
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    icon.textContent = isOpen ? '▼' : '▲';
    if (!isOpen) {
        const name = document.getElementById('mi_name').value.trim();
        let profile = allProfiles[name];
        if (!profile && name) {
            const k = Object.keys(allProfiles).find(k => k.toLowerCase() === name.toLowerCase());
            if (k) profile = allProfiles[k];
        }
        if (name) await window.loadMiPaymentHistory(name);
    }
};

window.loadMiPaymentHistory = async (name) => {
    const list = document.getElementById('mi_history_list');
    const loading = document.getElementById('mi_history_loading');
    const empty = document.getElementById('mi_history_empty');
    list.innerHTML = '';
    loading.style.display = 'block';
    empty.style.display = 'none';
    try {
        const snap = await getDocs(query(colRef,
            where('description', '>=', name),
            where('description', '<=', name + '\uf8ff'),
            orderBy('description'),
            limit(30)
        ));
        loading.style.display = 'none';
        const txs = [];
        snap.forEach(d => {
            const t = d.data();
            const desc = (t.description || '').trim();
            // Exact match OR starts with name + ' (' for exam entries like "Nguyễn A (Thi lên...)"
            if (desc === name || desc.startsWith(name + ' (')) txs.push(t);
        });
        if (txs.length === 0) { empty.style.display = 'block'; return; }
        txs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        txs.slice(0, 8).forEach(t => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:5px 2px;border-bottom:1px solid #f8fafc;';
            const icon = t.type === 'Học phí' ? '🎓' : t.type === 'Lệ phí thi' ? '🏆' : t.type === 'Thu Võ phục' ? '👘' : '💰';
            const monthStr = t.txMonth ? formatMonth(t.txMonth) : (t.date || '').substring(0, 7).replace('-', '/');
            const pkgStr = t.packageMonths && t.packageMonths.length > 1 ? ' ×' + t.packageMonths.length : '';
            const dateStr = t.date ? formatDate(t.date) : '';
            row.innerHTML = `<div style="min-width:0;flex:1;"><div style="font-size:0.68rem;color:#334155;font-weight:700;">${icon} ${t.type}${pkgStr} <span style="color:#94a3b8;font-weight:500;">${monthStr}</span></div><div style="font-size:0.6rem;color:#94a3b8;">${dateStr}</div></div><span style="font-size:0.72rem;font-weight:800;color:#1e40af;flex-shrink:0;margin-left:8px;">${Number(t.amount || 0).toLocaleString('vi-VN')}₫</span>`;
            list.appendChild(row);
        });
    } catch(err) {
        loading.style.display = 'none';
        list.innerHTML = '<div style="font-size:0.68rem;color:#ef4444;padding:4px 0;">Không thể tải dữ liệu</div>';
    }
};

window.updateMultiItemTotal = () => {
    const tuition = Number(document.getElementById('mi_tuition_actual').value) || 0;
    const exam = document.getElementById('mi_exam_toggle').checked ? (Number(document.getElementById('mi_exam_actual').value) || 0) : 0;
    const other = document.getElementById('mi_other_toggle').checked ? (Number(document.getElementById('mi_other_actual').value) || 0) : 0;
    const inv = document.getElementById('mi_inv_toggle').checked ? (Number(document.getElementById('mi_inv_total_actual').value) || 0) : 0;
    const invDebt = Number(document.getElementById('mi_inv_debt_total_actual').value) || 0;
    const total = tuition + exam + other + inv + invDebt;
    document.getElementById('mi_total').textContent = total.toLocaleString('vi-VN') + ' ₫';
    let parts = [];
    if(tuition > 0) parts.push('HP: ' + tuition.toLocaleString('vi-VN') + '₫');
    if(exam > 0) parts.push('Thi: ' + exam.toLocaleString('vi-VN') + '₫');
    if(inv > 0) parts.push('Kho mới: ' + inv.toLocaleString('vi-VN') + '₫');
    if(invDebt > 0) parts.push('Nợ KĐ: ' + invDebt.toLocaleString('vi-VN') + '₫');
    if(other > 0) parts.push('Khác: ' + other.toLocaleString('vi-VN') + '₫');
    document.getElementById('mi_total_breakdown').textContent = parts.join(' + ');
};

window._setupMiAutocomplete = () => {
    const inp = document.getElementById('mi_name');
    const listEl = document.getElementById('mi-autocomplete-list');
    if(!inp || !listEl) return;
    Object.assign(listEl.style, {
        position: 'fixed', zIndex: '99999', borderRadius: '0 0 10px 10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0',
        background: '#fff', maxHeight: '240px', overflowY: 'auto', display: 'none'
    });
    const positionList = () => {
        const rect = inp.getBoundingClientRect();
        listEl.style.left = rect.left + 'px';
        listEl.style.top = rect.bottom + 'px';
        listEl.style.width = rect.width + 'px';
    };
    const pickName = (nm) => { inp.value = nm; listEl.style.display = 'none'; updateMultiItemAutoFee(); };
    const renderMatches = (val) => {
        listEl.innerHTML = '';
        const allActive = Object.keys(allProfiles).filter(n => allProfiles[n].status === 'active');
        const matches = val ? allActive.filter(n => n.toLowerCase().includes(val.toLowerCase())).slice(0, 12) : allActive.slice(0, 12);
        if(matches.length === 0) { listEl.style.display = 'none'; return; }
        positionList();
        listEl.style.display = 'block';
        matches.forEach(nm => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:10px 13px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;font-size:0.92rem;';
            div.onmouseenter = () => div.style.background = '#f0f4ff';
            div.onmouseleave = () => div.style.background = '';
            const p2 = allProfiles[nm];
            const beltStr = p2 ? (p2.belt || '') : '';
            const feeStr = p2 && p2.tuitionFee ? ' · ' + Number(p2.tuitionFee).toLocaleString('vi-VN') + '₫' : '';
            div.innerHTML = '<span style="font-weight:700;color:#1e293b;">' + nm + '</span><span style="color:#94a3b8;font-size:0.72rem;">' + beltStr + feeStr + '</span>';
            div.addEventListener('mousedown', e => { e.preventDefault(); pickName(nm); });
            div.addEventListener('touchend', e => { e.preventDefault(); pickName(nm); });
            listEl.appendChild(div);
        });
    };
    if(!inp._miListenersAdded) {
        inp._miListenersAdded = true;
        inp.addEventListener('input', function() { renderMatches(this.value.trim()); updateMultiItemAutoFee(); });
        inp.addEventListener('focus', function() { renderMatches(this.value.trim()); });
        inp.addEventListener('blur', function() { setTimeout(() => { listEl.style.display = 'none'; }, 200); });
    }
    if(!window._miClickOutsideRegistered) {
        window._miClickOutsideRegistered = true;
        document.addEventListener('mousedown', e => {
            const i = document.getElementById('mi_name'); const l = document.getElementById('mi-autocomplete-list');
            if(i && l && e.target !== i && !l.contains(e.target)) l.style.display = 'none';
        });
        document.addEventListener('touchstart', e => {
            const i = document.getElementById('mi_name'); const l = document.getElementById('mi-autocomplete-list');
            if(i && l && e.target !== i && !l.contains(e.target)) l.style.display = 'none';
        }, { passive: true });
    }
};

document.getElementById('multiItemModal').addEventListener('click', e => {
    if(e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

window.processMultiItem = async (action) => {
    const name = document.getElementById('mi_name').value.trim();
    if(!name) return alert('Vui lòng nhập tên võ sinh!');
    const profile = allProfiles[name] || {};
    const branch = profile.branch || document.getElementById('branch').value || 'CS1';
    const tuitionMonth = document.getElementById('mi_tuition_month').value;
    const pkg = Number(document.getElementById('mi_tuition_pkg').value) || 1;
    const tuition = Number(document.getElementById('mi_tuition_actual').value) || 0;
    const hasExam = document.getElementById('mi_exam_toggle').checked;
    const examTitle = hasExam ? (document.getElementById('mi_exam_title').value.trim() || 'Lệ phí thi') : '';
    const examFee = hasExam ? (Number(document.getElementById('mi_exam_actual').value) || 0) : 0;
    const hasOther = document.getElementById('mi_other_toggle').checked;
    const otherDesc = hasOther ? (document.getElementById('mi_other_desc').value.trim() || 'Thu khác') : '';
    const otherFee = hasOther ? (Number(document.getElementById('mi_other_actual').value) || 0) : 0;
    const hasInv = document.getElementById('mi_inv_toggle').checked;
    const invCat = hasInv ? (document.getElementById('mi_inv_category').value || 'Võ phục') : '';
    const invSizeEl = invCat === 'Võ phục' ? document.getElementById('mi_inv_size_select') : document.getElementById('mi_inv_size_text');
    const invSize = hasInv ? (invSizeEl ? invSizeEl.value.trim() : '') : '';
    const invQty = hasInv ? (Number(document.getElementById('mi_inv_qty').value) || 1) : 0;
    const invPrice = hasInv ? (Number(document.getElementById('mi_inv_price_actual').value) || 0) : 0;
    const invTotal = hasInv ? (Number(document.getElementById('mi_inv_total_actual').value) || 0) : 0;
    if(hasInv && !invSize) return alert('Vui lòng chọn hoặc nhập kích cỡ hàng Kho Đồ!');

    // ── Thu thập các khoản nợ kho được tick ──────────────────────────────────
    const invDebtChecks = [...document.querySelectorAll('.mi-inv-debt-check:checked')];
    const invDebtIds = invDebtChecks.map(c => c.getAttribute('data-inv-id'));
    const invDebtTotal = invDebtChecks.reduce((s, c) => s + (Number(c.getAttribute('data-amount')) || 0), 0);

    // ── Kiểm tra trạng thái checkbox "Thu học phí" ───────────────────────────
    // Nếu HLV bỏ tích "Thu học phí", toàn bộ validation và ghi sổ học phí sẽ bị bỏ qua.
    // Điều này cho phép tạo phiếu chỉ với Lệ phí thi đai, Kho Đồ hoặc Khoản khác.
    const tuitionEnabledEl = document.getElementById('mi_tuition_enabled');
    const isTuitionEnabled = tuitionEnabledEl ? tuitionEnabledEl.checked : true;

    // Chỉ validate học phí khi "Thu học phí" được bật
    if(isTuitionEnabled && tuition <= 0) return alert('Vui lòng nhập số tiền học phí!');
    if(isTuitionEnabled && !tuitionMonth) return alert('Vui lòng chọn tháng học phí!');

    // Đảm bảo tổng tiền > 0 để có ít nhất một khoản thu hợp lệ
    const total = tuition + examFee + otherFee + invTotal + invDebtTotal;
    if(total <= 0) return alert('Vui lòng nhập ít nhất một khoản thu!');

    // Tháng tham chiếu dùng cho các giao dịch không phải học phí (thi đai, kho đồ, khoản khác).
    // Nếu học phí bị tắt và không có tuitionMonth, dùng tháng hiện tại làm fallback.
    const refMonth = tuitionMonth || getLocalToday().substring(0, 7);

    // Tính danh sách các tháng học phí — chỉ thực hiện khi "Thu học phí" được bật
    let packageMonths = [];
    let lastMonth = refMonth;
    if(isTuitionEnabled && tuitionMonth && tuition > 0) {
        for(let i = 0; i < pkg; i++) {
            let m = tuitionMonth.split('-').map(Number);
            let newM = m[1] + i; let newY = m[0];
            while(newM > 12) { newM -= 12; newY++; }
            packageMonths.push(newY + '-' + String(newM).padStart(2, '0'));
        }
        lastMonth = packageMonths[packageMonths.length - 1];
    }

    // ── Xây dựng danh sách chi tiết khoản thu cho phiếu (breakdown) ─────────
    // Chỉ thêm dòng "Học phí" vào breakdown khi học phí được bật và có giá trị
    const breakdown = [];
    if(isTuitionEnabled && tuition > 0) {
        breakdown.push({ label: 'Học phí ' + window.formatMonthCompact(packageMonths.join(',')), amount: tuition });
    }
    if(hasExam && examFee > 0) breakdown.push({ label: examTitle, amount: examFee });
    if(hasInv && invTotal > 0) breakdown.push({ label: invCat + ' ' + invSize + ' x' + invQty, amount: invTotal });
    if(invDebtTotal > 0) {
        invDebtChecks.forEach(c => {
            const itemLabel = c.getAttribute('data-label') || 'Kho Đồ';
            const itemAmt = Number(c.getAttribute('data-amount')) || 0;
            if(itemAmt > 0) breakdown.push({ label: '📦 Nợ kho: ' + itemLabel, amount: itemAmt });
        });
    }
    if(hasOther && otherFee > 0) breakdown.push({ label: otherDesc, amount: otherFee });

    // ── Xây dựng nhãn danh mục kho (hiện tên danh mục thực thay vì chỉ "Kho Đồ") ──
    const hasInvDebt = invDebtTotal > 0;
    const _invLabelParts = [];
    if(hasInv && invTotal > 0) _invLabelParts.push(invCat);
    if(hasInvDebt) {
        invDebtChecks.forEach(c => {
            const raw = (c.getAttribute('data-label') || '').split(' Size ')[0].split(' ×')[0].trim() || 'Kho Đồ';
            if(!_invLabelParts.includes(raw)) _invLabelParts.push(raw);
        });
    }
    const _invLabel = _invLabelParts.join(' + ') || 'Kho Đồ';

    // ── Xây dựng nhãn loại phiếu linh hoạt theo từng khoản được bật ─────────
    // Không còn gắn cứng "Học phí" đứng đầu — nhãn được ghép từ các khoản thực tế.
    const hasTuition = isTuitionEnabled && tuition > 0;
    const _labelParts = [];
    if(hasTuition) _labelParts.push('Học phí');
    if(hasExam && examFee > 0) _labelParts.push(examTitle || 'Lệ phí thi');
    if((hasInv && invTotal > 0) || hasInvDebt) _labelParts.push(_invLabel);
    if(hasOther && otherFee > 0) _labelParts.push(otherDesc || 'Khoản khác');
    const receiptTypeLabel = _labelParts.join(' + ') || 'Khoản thu';

    try {
        if(action === 'pay') {
            if(window.userRole === 'viewer') return alert('Tài khoản khách không thể ghi sổ!');
            const today = getLocalToday();

            // Chỉ ghi giao dịch học phí và cập nhật paidUntil khi "Thu học phí" được bật
            if(hasTuition && packageMonths.length > 0) {
                await addDoc(colRef, { branch, type: 'Học phí', description: name, amount: tuition, date: today, txMonth: lastMonth, packageMonths, timestamp: Date.now() });
                await setDoc(doc(db, 'clubs', currentClubId, 'profiles', name), { paidUntil: lastMonth, paidMonths: arrayUnion(...packageMonths) }, { merge: true });
            }

            // Các khoản còn lại luôn dùng refMonth làm txMonth (fallback khi học phí bị tắt)
            if(hasExam && examFee > 0) await addDoc(colRef, { branch, type: 'Lệ phí thi', description: name + ' (' + examTitle + ')', amount: examFee, date: today, txMonth: refMonth, examTitle, timestamp: Date.now() + 1 });
            if(hasInv && invTotal > 0) {
                await addDoc(invRef, { category: invCat, size: invSize, type: 'Xuất bán', qty: invQty, desc: name, amount: invTotal, date: today, timestamp: Date.now() + 2 });
                await addDoc(colRef, { branch, type: 'Thu ' + invCat, description: 'Bán ' + invCat + ' ' + invSize + ' cho ' + name, amount: invTotal, date: today, txMonth: refMonth, timestamp: Date.now() + 3 });
            }
            // Đánh dấu các khoản nợ kho được chọn là đã thanh toán
            if(invDebtIds.length > 0) {
                await Promise.all(invDebtIds.map(id => updateDoc(doc(db, 'clubs', currentClubId, 'inventory', id), { unpaid: false })));
            }
            if(hasOther && otherFee > 0) await addDoc(colRef, { branch, type: 'Thu khác', description: name + (otherDesc ? ' — ' + otherDesc : ''), amount: otherFee, date: today, txMonth: refMonth, timestamp: Date.now() + 4 });
            window.showToast('✅ Đã ghi sổ thành công!');
        }
        const receiptTitle = action === 'report' ? 'PHIẾU BÁO HỌC PHÍ' : 'BIÊN LAI THU TIỀN';
        document.getElementById('multiItemModal').style.display = 'none';
        // Truyền refMonth thay vì tuitionMonth để tránh lỗi khi học phí bị tắt
        await window.exportReceipt(name, total, receiptTypeLabel, getLocalToday(), refMonth, branch, examTitle, receiptTitle, breakdown);
    } catch(err) { console.error(err); alert('Lỗi: ' + err.message); }
};

// ─── Setup currency inputs for multi-item modal ───
(function setupMiCurrencyAll() {
    function setupMiCurrency(dispId, actId, callback, storeRaw) {
        const d = document.getElementById(dispId); const a = document.getElementById(actId);
        if(!d || !a) return;
        d.addEventListener('input', e => {
            let v = e.target.value.replace(/\D/g, '');
            a.value = v;
            if(storeRaw) a.setAttribute('data-raw', v);
            e.target.value = v ? parseInt(v,10).toLocaleString('vi-VN') : '';
            if(callback) callback();
        });
    }
    setupMiCurrency('mi_tuition_display', 'mi_tuition_actual', updateMultiItemTotal, true);
    setupMiCurrency('mi_exam_display', 'mi_exam_actual', updateMultiItemTotal, false);
    setupMiCurrency('mi_other_display', 'mi_other_actual', updateMultiItemTotal, false);
    setupMiCurrency('mi_inv_price_display', 'mi_inv_price_actual', window.calcMiInvTotal, false);


    // ═══════════════════════════════════════════════════════
    // ĐIỂM DANH (ATTENDANCE) MODULE
    // (Copied from club_fixed version)
    // ═══════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════
    // ĐIỂM DANH (ATTENDANCE)
    // ═══════════════════════════════════════════════════════
    let _attCurrentProfiles = [];
    let _attCurrentDate = '';
    let _attendanceCache = {};
    // [THÊM] Ca tập — HLV có thể tạo nhiều suất học trong ngày
    let _clubShifts = [];
    let _clubShiftsLoaded = false;
    // [SỬA LỖI] Expose getter ra window để openAddModal/openProfile (khác scope) truy cập được
    window._getClubShifts = function() { return _clubShifts; };
    // [SỬA ĐỒNG BỘ] Đảm bảo shifts được load trước khi openProfile/openAddModal dùng
    // — gọi được từ mọi scope vì mount lên window
    window._ensureClubShiftsLoaded = async function() {
        if (!_clubShiftsLoaded) await _loadClubShifts();
    };
    let _currentShiftId = '';
    // Biến global lưu trạng thái điểm danh hiện tại — key: tên võ sinh, value: 0/1/2
    window.currentAttendanceData = {};

    // ── 4 TRẠNG THÁI ĐIỂM DANH ──────────────────────────────────────────────
    // Thứ tự bấm: 0=Chưa ĐD(xám) → 1=Có mặt(xanh) → 2=Vắng(đỏ) → 3=Có phép(vàng) → 0
    const _ATT_STATUS = [
        { label: 'Chưa điểm danh', bg: '#f8fafc', text: '#64748b', border: '#cbd5e1', icon: '—'  },
        { label: 'Có mặt',         bg: '#f0fdf4', text: '#16a34a', border: '#22c55e', icon: '✅' },
        { label: 'Vắng mặt',       bg: '#fef2f2', text: '#dc2626', border: '#ef4444', icon: '❌' },
        { label: 'Có phép',        bg: '#fefce8', text: '#ca8a04', border: '#eab308', icon: '📝' },
    ];
    // ── Schema hiện tại (lưu trực tiếp lên Firebase bởi toggleAttendance) ──
    // 0 = Chưa điểm danh, 1 = Có mặt, 2 = Vắng (không phép), 3 = Có phép
    // Hàm _mapLegacyStatus trước đây hoán đổi 2↔3 để chuyển đổi dữ liệu CŨ.
    // Tuy nhiên toggleAttendance đã lưu đúng schema mới (2=Vắng, 3=Có phép),
    // nên KHÔNG được hoán đổi nữa — trả nguyên giá trị để tránh hiển thị sai.
    function _mapLegacyStatus(s) {
        // Trả nguyên giá trị: 0=Chưa, 1=Có mặt, 2=Vắng, 3=Có phép
        return (s >= 0 && s <= 3) ? s : 0;
    }

    function _getFilteredAttProfiles() {
        const branchEl = document.getElementById('att_branch');
        const beltEl   = document.getElementById('att_belt');
        // [SỬA LỖI] Luôn ép chi nhánh HLV ở tầng dữ liệu — bảo vệ ngay cả khi
        // UI select bị reset bởi snapshot Firestore trước khi lock được áp lại.
        let selBranch = branchEl ? branchEl.value : 'all';
        if (window.userRole === 'coach' && window.coachBranch) selBranch = window.coachBranch;
        const selBelt   = beltEl   ? beltEl.value   : 'all';

        // Lấy ngày được chọn trên UI và tính thứ trong tuần (0=CN, 1=T2...6=T7)
        const selDateVal = document.getElementById('att_date') ? document.getElementById('att_date').value : '';
        // Dùng 'T00:00:00' để tránh sai múi giờ khi parse date
        const dayOfWeek  = selDateVal ? new Date(selDateVal + 'T00:00:00').getDay() : -1;

        // Kiểm tra trạng thái công tắc học bù
        const showAllEl  = document.getElementById('chk_show_all_att');
        const isShowAll  = showAllEl ? showAllEl.checked : false;

        return Object.entries(allProfiles)
            .filter(([, p]) => p.status === 'active')
            .filter(([, p]) => selBranch === 'all' || p.branch === selBranch)
            .filter(([, p]) => {
                if (selBelt === 'all') return true;
                return (p.belt || '').toLowerCase().includes(selBelt.toLowerCase());
            })
            .filter(([, p]) => {
                // Nếu đang bật chế độ Học Bù → hiện tất cả, bỏ qua lọc lịch học
                if (isShowAll) return true;
                // Nếu võ sinh KHÔNG có trường trainingDays → tương thích data cũ, cho hiện
                if (!Array.isArray(p.trainingDays) || p.trainingDays.length === 0) return true;
                // Chỉ hiện nếu ngày đang chọn nằm trong lịch học của võ sinh
                return p.trainingDays.includes(dayOfWeek);
            })
            // [THÊM] Filter theo ca tập: nếu đang chọn ca VÀ võ sinh có đăng ký ca, lọc theo ca
            .filter(([, p]) => {
                if (isShowAll) return true;
                // Nếu không có ca đang chọn → hiện tất cả (tương thích ngược)
                if (!_currentShiftId) return true;
                // Nếu võ sinh không có ca đăng ký → hiện (tương thích data cũ)
                if (!p.trainingShiftId) return true;
                // Chỉ hiện nếu ca đăng ký của võ sinh khớp ca đang chọn
                return p.trainingShiftId === _currentShiftId;
            })
            // [THÊM] Filter báo nghỉ: loại võ sinh đã báo nghỉ tháng của ngày điểm danh
            .filter(([, p]) => {
                // Học bù → hiện tất cả, bỏ qua lọc báo nghỉ
                if (isShowAll) return true;
                if (!selDateVal) return true;
                const selMon = selDateVal.substring(0, 7); // "YYYY-MM"
                // Loại khỏi danh sách nếu võ sinh đã báo nghỉ tháng này
                return !(Array.isArray(p.skippedMonths) && p.skippedMonths.includes(selMon));
            })
            .sort((a, b) => a[0].localeCompare(b[0], 'vi'));
    }

    function _renderAttCards() {
        const gridEl = document.getElementById('attendanceGrid');
        if (!gridEl) return;
        if (_attCurrentProfiles.length === 0) {
            gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px 16px;color:#94a3b8;font-style:italic;font-size:0.88rem;">Không có võ sinh nào phù hợp bộ lọc</div>';
            _updateAttSummary([0,0,0,0,0]);
            return;
        }
        // Smart Name: đếm tên trùng toàn hệ thống — chỉ VS trùng tên mới hiện năm sinh
        // [SỬA] Đếm theo tên gốc — bỏ hậu tố phân biệt như "(2016)" hoặc "(2016-Lớn)"
        const _attStripSuffix = (k) => k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase();
        // Helper hiển thị tên — bỏ hậu tố nhưng GIỮ hoa/thường gốc
        const _attDisplayName = (k) => k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
        const _attNCount = {};
        Object.keys(allProfiles || {}).forEach(n => {
            const k = _attStripSuffix(n);
            _attNCount[k] = (_attNCount[k] || 0) + 1;
        });
        let html = '';
        // Đồng bộ window.currentAttendanceData từ _attendanceCache (ánh xạ 4→3 trạng thái)
        window.currentAttendanceData = {};
        _attCurrentProfiles.forEach(([name]) => {
            // [THÊM] docId bao gồm shiftId khi có ca được chọn
            const docId = _currentShiftId ? name + '_' + _attCurrentDate + '_' + _currentShiftId : name + '_' + _attCurrentDate;
            window.currentAttendanceData[name] = _mapLegacyStatus(_attendanceCache[docId] || 0);
        });
        // [THÊM] Badge "Mới" trên thẻ điểm danh — võ sinh đăng ký trong tháng hiện tại
        const _attCurMonth = _attCurrentDate ? _attCurrentDate.substring(0, 7) : '';
        const summary = [0, 0, 0, 0];
        _attCurrentProfiles.forEach(([name, p], idx) => {
            // [THÊM] docId bao gồm shiftId khi có ca được chọn
            const docId   = _currentShiftId ? name + '_' + _attCurrentDate + '_' + _currentShiftId : name + '_' + _attCurrentDate;
            const status  = window.currentAttendanceData[name] ?? 0;
            const cfg     = _ATT_STATUS[status];
            // Rút gọn tên đai để vừa 1 dòng
            const beltShort = (p.belt || 'Đai Trắng')
                .replace(/\s*\(Cấp \d+\)/g, '')
                .replace('Đai ', '')
                .replace(' - cấp', '')
                .trim();
            summary[status]++;
            // [SỬA] Cảnh báo nghỉ nhiều — 2 buổi KP liên tiếp: vàng; 3+ buổi KP: đỏ
            const _consAbsent = p.consecutiveAbsences || 0;
            const churnWarn2  = _consAbsent === 2;
            const churnWarn3  = _consAbsent >= 3;
            const churnWarn   = churnWarn2 || churnWarn3;
            // Belt progress bar
            const sessAttended = p.totalSessionsAttended || 0;
            const sessRequired = p.requiredSessions || 24;
            const sessPercent = Math.min(100, Math.round(sessAttended / sessRequired * 100));
            const sessColor = sessPercent >= 100 ? '#16a34a' : sessPercent >= 60 ? '#2563eb' : '#f97316';
            // Badges inline (không dùng thẻ riêng tránh wrap)
            const tuitionBadge = (p.tuitionStatus === 'unpaid' || p.tuitionStatus === 'overdue')
                ? '<span class="att-tuition-warn" title="Nợ học phí" style="display:inline-block;margin-left:3px;font-size:0.68rem;animation:attWarnPulse 1.4s ease-in-out infinite;">⚠️</span>' : '';
            // [SỬA] Đèn cảnh báo nhấp nháy — LUÔN render span có data-churn-icon để
            // toggleAttendance có thể tìm và cập nhật live mà không cần re-render card.
            // Ẩn khi không có cảnh báo (display:none), hiện + nhấp nháy khi có.
            const _churnIcon  = churnWarn3 ? '🔴' : churnWarn2 ? '🟡' : '';
            const _churnClass = churnWarn3 ? 'abs-warn-red' : churnWarn2 ? 'abs-warn-yellow' : '';
            const _churnTitle = churnWarn3
                ? 'Nghỉ ' + _consAbsent + ' buổi không phép liên tiếp — cần báo phụ huynh!'
                : churnWarn2 ? 'Nghỉ 2 buổi không phép liên tiếp — chú ý theo dõi!' : '';
            const churnBadge = '<span data-churn-icon class="' + _churnClass + '"'
                + ' title="' + _churnTitle + '"'
                + ' style="margin-left:3px;font-size:0.72rem;' + (!churnWarn ? 'display:none;' : '') + '">'
                + _churnIcon + '</span>';
            // Smart Name: gắn năm sinh dạng superscript màu xám nếu tên trùng
            const _attDob = p.dob || '';
            let _attYr = _attDob.includes('/') ? _attDob.split('/')[2] : (_attDob.includes('-') ? _attDob.split('-')[0] : '');
            // Fallback: trích năm từ hậu tố key nếu không có dob (vd: "Tên (2016)")
            if (!_attYr) { const _ym = name.match(/\((\d{4})/); if (_ym) _attYr = _ym[1]; }
            const _attIsDup = (_attNCount[_attStripSuffix(name)] || 0) > 1;
            // [SỬA] Hiện năm sinh ở góc trên bên phải tên — font nhỏ màu xám (superscript)
            const attYearBadge = (_attIsDup && _attYr)
                ? '<sup style="font-size:0.55rem;color:#94a3b8;font-weight:700;margin-left:2px;vertical-align:super;line-height:0;">' + _attYr + '</sup>' : '';
            // [THÊM] Badge "Mới" trên thẻ điểm danh khi võ sinh mới đăng ký tháng này
            const _attJoinM = p.createdAt ? p.createdAt.substring(0, 7) : '';
            const attNewBadge = (_attJoinM && _attCurMonth && _attJoinM === _attCurMonth)
                ? '<span style="font-size:0.58rem;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;border-radius:4px;padding:1px 4px;font-weight:900;margin-left:3px;vertical-align:middle;">MỚI</span>'
                : '';
            // [THÊM] Badge Biệt danh — hiển thị góc nhỏ bên cạnh tên, giúp HLV nhận biết khi trùng tên
            const _nickname = (p.nickname || '').trim();
            const nicknameBadge = _nickname
                ? '<span style="font-size:0.6rem;background:#ede9fe;color:#7c3aed;border:1px solid #ddd6fe;border-radius:5px;padding:1px 5px;font-weight:700;margin-left:4px;white-space:nowrap;vertical-align:middle;">🏷 ' + _nickname + '</span>'
                : '';
            // [SỬA GIAO DIỆN] Thiết kế lại thẻ điểm danh: tên hiển thị đủ 2 dòng,
            // font lớn hơn, card cao hơn — tương thích cả web lẫn mobile
            // [SỬA] Dùng class CSS có animation nhấp nháy thay vì border-left inline tĩnh
            // att-card-warn-yellow: 2 buổi KP liên tiếp — viền vàng nhấp nháy
            // att-card-warn-red:    3+ buổi KP liên tiếp — viền đỏ nhấp nháy
            const _cardWarnClass = churnWarn3 ? 'att-card-warn-red' : churnWarn2 ? 'att-card-warn-yellow' : '';
            html += '<div id="att_card_' + idx + '"'
                + (_cardWarnClass ? ' class="' + _cardWarnClass + '"' : '')
                + ' onclick="window.toggleAttendance(' + idx + ')"'
                + ' style="background:' + cfg.bg + ';color:' + cfg.text + ';border:1.5px solid ' + cfg.border + ';border-radius:10px;padding:8px 10px;cursor:pointer;user-select:none;display:flex;flex-direction:column;gap:5px;transition:transform 0.12s;box-shadow:0 1px 3px rgba(0,0,0,0.06);-webkit-tap-highlight-color:transparent;min-height:74px;"'
                + ' onpointerdown="this.style.transform=\'scale(0.94)\'" onpointerup="this.style.transform=\'\'" onpointercancel="this.style.transform=\'\'">'
                // Hàng 1: Tên võ sinh | Icon trạng thái
                // [SỬA] Container flex:1 không có onclick — chỉ span tên (inline) mới bắt click để xem lịch sử
                // Điều này đảm bảo bấm vào vùng trống card chỉ toggle điểm danh, không mở modal
                + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px;">'
                + '<div style="flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'
                + '<span data-hidx="' + idx + '" onclick="event.stopPropagation();window.showAttMemberHistory(' + idx + ')" title="' + name.replace(/"/g,'&quot;') + ' — Xem lịch sử" style="font-weight:800;font-size:clamp(0.83rem,3.8vw,0.97rem);line-height:1.25;word-break:break-word;text-decoration:underline dotted;text-underline-offset:2px;cursor:pointer;">'
                // [SỬA] Biệt danh KHÔNG nằm trong tên — đưa ra ngoài hàng riêng bên dưới
                + _attDisplayName(name) + attYearBadge + attNewBadge + tuitionBadge + churnBadge
                + '</span>'
                + '</div>'
                // Icon trạng thái lớn hơn, nằm góc trên phải
                + '<div style="font-size:1.15rem;flex-shrink:0;line-height:1;margin-top:1px;">' + cfg.icon + '</div>'
                + '</div>'
                // [THÊM] Hàng biệt danh — chỉ hiện khi có nickname, nằm ngoài tên để dễ đọc
                + (_nickname ? '<div style="font-size:0.58rem;font-weight:800;color:#7c3aed;background:#ede9fe;border:1px solid #ddd6fe;border-radius:5px;padding:2px 7px;display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:-1px;">🏷 ' + _nickname + '</div>' : '')
                // Hàng 2: Cấp đai rút gọn | Nhãn trạng thái
                + '<div style="display:flex;align-items:center;justify-content:space-between;gap:3px;">'
                + '<div style="font-size:0.68rem;font-weight:700;opacity:0.85;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🥋 ' + beltShort + '</div>'
                + '<div id="att_lbl_' + idx + '" style="font-size:0.65rem;font-weight:800;opacity:0.8;white-space:nowrap;flex-shrink:0;">' + cfg.icon + ' ' + cfg.label + '</div>'
                + '</div>'
                // Thanh tiến độ thăng đai (mỏng)
                + '<div title="' + sessAttended + '/' + sessRequired + ' buổi – tiến độ thăng đai" style="height:2px;background:rgba(0,0,0,0.1);border-radius:2px;overflow:hidden;">'
                + '<div data-attbar="' + idx + '" style="width:' + sessPercent + '%;height:2px;background:' + sessColor + ';border-radius:2px;transition:width 0.4s;"></div>'
                + '</div>'
                + '</div>';
        });
        gridEl.innerHTML = html;
        _updateAttSummary(summary);
        // ── Admin: cập nhật bảng thống kê nhanh theo cơ sở ──────────────────
        _renderAdminBranchSummary(summary);
        // Load tên HLV Cơ sở ngày này vào từng branch card (async, không blocking)
        if (_attCurrentDate) _loadCoachForBranchSummary(_attCurrentDate);
    }

    function _renderAdminBranchSummary(totalSummary) {
        const wrapEl = document.getElementById('admin_daily_branch_summary');
        const bodyEl = document.getElementById('admin_daily_branch_body');
        if (!wrapEl || !bodyEl) return;
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') {
            wrapEl.style.display = 'none';
            return;
        }
        // Tính thống kê theo từng cơ sở từ dữ liệu hiện tại
        const branchStats = {};
        _attCurrentProfiles.forEach(([name, p]) => {
            const branch = p.branch || 'Chung';
            if (!branchStats[branch]) branchStats[branch] = { present: 0, absent: 0, excused: 0, pending: 0, total: 0 };
            const st = window.currentAttendanceData[name] ?? 0;
            branchStats[branch].total++;
            if (st === 1) branchStats[branch].present++;
            else if (st === 2) branchStats[branch].absent++;
            else if (st === 3) branchStats[branch].excused++;
            else branchStats[branch].pending++;
        });
        const branches = Object.keys(branchStats);
        if (branches.length === 0) { wrapEl.style.display = 'none'; return; }
        wrapEl.style.display = 'block';
        let html = '';
        if (branches.length > 1) {
            // Multi-branch: hiện từng cơ sở
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;">';
            branches.sort().forEach(br => {
                const s = branchStats[br];
                const brName = window.getBranchNameDisplay ? window.getBranchNameDisplay(br) : br;
                const pct = s.total > 0 ? Math.round(s.present / s.total * 100) : 0;
                const pctColor = pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
                html += `<div style="background:#f8fafc;border-radius:10px;padding:10px 12px;border:1.5px solid #e2e8f0;">
                    <div style="font-size:0.7rem;font-weight:900;color:#0033A0;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍 ${brName}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <span style="font-size:0.7rem;background:#f0fdf4;color:#16a34a;padding:2px 7px;border-radius:99px;font-weight:800;border:1px solid #22c55e;">✅ ${s.present}</span>
                        <span style="font-size:0.7rem;background:#fef2f2;color:#dc2626;padding:2px 7px;border-radius:99px;font-weight:800;border:1px solid #ef4444;">❌ ${s.absent}</span>
                        <span style="font-size:0.7rem;background:#fefce8;color:#ca8a04;padding:2px 7px;border-radius:99px;font-weight:800;border:1px solid #eab308;">📝 ${s.excused}</span>
                    </div>
                    <div style="margin-top:6px;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;">
                        <div style="width:${pct}%;height:4px;background:${pctColor};border-radius:2px;transition:width 0.4s;"></div>
                    </div>
                    <div style="font-size:0.65rem;color:#64748b;margin-top:3px;font-weight:700;">${pct}% chuyên cần · ${s.total} VS</div>
                    <div id="coach_info_${br}" style="margin-top:5px;min-height:13px;"><span style="font-size:0.6rem;color:#cbd5e1;">⏳</span></div>
                </div>`;
            });
            html += '</div>';
        } else {
            // Single-branch: tóm tắt đơn giản
            const _onlyBr = branches[0];
            const s = Object.values(branchStats)[0];
            const pct = s.total > 0 ? Math.round(s.present / s.total * 100) : 0;
            const pctColor = pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
            html = `<div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <span style="font-size:0.78rem;background:#f0fdf4;color:#16a34a;padding:4px 12px;border-radius:99px;font-weight:800;border:1.5px solid #22c55e;">✅ Có mặt: ${s.present}</span>
                    <span style="font-size:0.78rem;background:#fef2f2;color:#dc2626;padding:4px 12px;border-radius:99px;font-weight:800;border:1.5px solid #ef4444;">❌ Vắng: ${s.absent}</span>
                    <span style="font-size:0.78rem;background:#fefce8;color:#ca8a04;padding:4px 12px;border-radius:99px;font-weight:800;border:1.5px solid #eab308;">📝 Có phép: ${s.excused}</span>
                    <span style="font-size:0.78rem;font-weight:900;color:${pctColor};">${pct}% chuyên cần</span>
                </div>
                <div id="coach_info_${_onlyBr}" style="margin-top:6px;min-height:13px;"><span style="font-size:0.6rem;color:#cbd5e1;">⏳</span></div>
            </div>`;
        }
        bodyEl.innerHTML = html;
    }

    // Async: load ghi chú HLV cho ngày đang xem, hiện tên HLV vào branch card
    async function _loadCoachForBranchSummary(date) {
        if (!date || !currentClubId) return;
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') return;
        try {
            const _nSnap = await getDocs(query(
                collection(db, 'clubs', currentClubId, 'attendanceNotes'),
                where('date', '==', date),
                limit(50) // [3.3E] max 50 coach notes per date
            ));
            // _brData[branch] = { coaches: [], notes: [{coach, note}] }
            const _brData = {};
            _nSnap.forEach(d => {
                const nd = d.data();
                const _br = nd.branch || '_noBranch';
                const _cn = nd.coachName || '';
                const _nt = (nd.note || '').trim();
                if (!_brData[_br]) _brData[_br] = { coaches: [], notes: [] };
                if (_cn && !_brData[_br].coaches.includes(_cn)) _brData[_br].coaches.push(_cn);
                if (_nt) _brData[_br].notes.push({ coach: _cn, note: _nt });
            });
            // Cập nhật UI cho từng cơ sở có ghi chú
            Object.entries(_brData).forEach(([br, data]) => {
                const el = document.getElementById('coach_info_' + br);
                if (!el) return;
                const multiCoach = data.coaches.length > 1;
                const coachLine = data.coaches.length
                    ? `<div style="font-size:0.62rem;font-weight:800;color:#0033A0;margin-bottom:3px;">👨‍🏫 ${data.coaches.join(', ')}</div>`
                    : '';
                const notesHtml = data.notes.map(n => {
                    const pfx = multiCoach && n.coach ? `<span style="color:#0052cc;font-weight:800;">${n.coach}: </span>` : '';
                    return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 9px;margin-top:4px;">
                        <div style="font-size:0.6rem;color:#15803d;font-weight:700;margin-bottom:2px;">✏️ Ghi chú buổi tập</div>
                        <div style="font-size:0.75rem;color:#1e293b;line-height:1.55;white-space:pre-line;">${pfx}${n.note}</div>
                    </div>`;
                }).join('');
                el.innerHTML = coachLine + (notesHtml || '<span style="font-size:0.6rem;color:#94a3b8;">HLV chưa để lại nội dung ghi chú</span>');
                el.style.marginTop = '7px';
            });
            // Xóa placeholder ⏳ cho cơ sở chưa có ghi chú
            document.querySelectorAll('[id^="coach_info_"]').forEach(el => {
                if (el.innerHTML.includes('⏳')) {
                    el.innerHTML = '<span style="font-size:0.6rem;color:#cbd5e1;">Chưa có ghi chú hôm nay</span>';
                }
            });
        } catch(_e) {
            document.querySelectorAll('[id^="coach_info_"]').forEach(el => {
                if (el.innerHTML.includes('⏳')) el.innerHTML = '';
            });
        }
    }

    // [THÊM] Hỗ trợ gọi bằng số index (Điểm Danh Ngày) HOẶC tên chuỗi + tháng (Thống Kê Tháng)
    window.showAttMemberHistory = async (idxOrName, overrideMonth) => {
        let name, p;
        if (typeof idxOrName === 'number') {
            // Gọi từ tab Điểm Danh Ngày — truyền index
            const entry = _attCurrentProfiles[idxOrName];
            if (!entry) return;
            [name, p] = entry;
        } else {
            // Gọi từ Thống Kê Tháng — truyền tên và tháng
            name = idxOrName;
            p = (allProfiles || {})[name] || {};
        }
        const month = overrideMonth || _attCurrentDate.substring(0, 7);
        const [yr, mo] = month.split('-').map(Number);
        const monthDisplay = String(mo).padStart(2,'0') + '/' + yr;

        let modalEl = document.getElementById('attHistModal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'attHistModal';
            modalEl.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:10010;backdrop-filter:blur(4px);align-items:flex-end;justify-content:center;';
            modalEl.innerHTML = '<div id="attHistContent" style="background:#fff;width:100%;max-width:640px;border-radius:20px 20px 0 0;padding:20px 18px;box-shadow:0 -10px 40px rgba(0,0,0,0.18);max-height:82vh;overflow-y:auto;padding-bottom:calc(20px + env(safe-area-inset-bottom));animation:slideUpSheet 0.3s cubic-bezier(0.16,1,0.3,1);"><div id="attHistBody"></div></div>';
            modalEl.addEventListener('click', (e) => { if (e.target === modalEl) modalEl.style.display = 'none'; });
            document.body.appendChild(modalEl);
        } else {
            modalEl.style.display = 'flex';
        }

        const bodyEl = document.getElementById('attHistBody');
        bodyEl.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;">⏳ Đang tải dữ liệu tháng ' + monthDisplay + '...</div>';

        try {
            const attRef = collection(db, 'clubs', currentClubId, 'attendance');

            // Determine exam quarter (Q1=T1-T3, Q2=T4-T6, Q3=T7-T9, Q4=T10-T12)
            const quarterNum = Math.ceil(mo / 3);
            const quarterStartMo = (quarterNum - 1) * 3 + 1;
            const quarterMonths = [];
            for (let qi = 0; qi < 3; qi++) {
                quarterMonths.push(yr + '-' + String(quarterStartMo + qi).padStart(2, '0'));
            }
            const quarterLabel = 'Quý ' + quarterNum + '/' + yr + ' (T' + quarterStartMo + '–T' + (quarterStartMo + 2) + ')';

            // Fetch all quarter data in one query (includes current month)
            const qQ = query(attRef, where('profileId', '==', name), where('month', 'in', quarterMonths), limit(93)); // [3.3E] limit: 31days×3mo max per student
            const snapQ = await getDocs(qQ);

            const dayMap = {};
            let present = 0, excused = 0, absent = 0;
            let qPresent = 0, qExcused = 0, qAbsent = 0;

            snapQ.forEach(d => {
                const data = d.data();
                const s = data.status || 0;
                // Quarter totals
                // _ATT_STATUS: 0=Chưa ĐD, 1=Có mặt, 2=Vắng mặt (không phép), 3=Có phép
                if (s === 1) qPresent++;
                else if (s === 2) qAbsent++;   // s=2: Vắng mặt (nghỉ KHÔNG phép) → đếm vào qAbsent
                else if (s === 3) qExcused++;  // s=3: Có phép (nghỉ CÓ phép)       → đếm vào qExcused
                // Current month only
                if (data.month === month) {
                    const dateStr = data.date || '';
                    const day = parseInt((dateStr.split('-')[2] || '0'), 10);
                    if (day) dayMap[day] = s;
                    if (s === 1) present++;
                    else if (s === 2) absent++;    // s=2: Vắng mặt (nghỉ KHÔNG phép) → đếm vào absent
                    else if (s === 3) excused++;   // s=3: Có phép (nghỉ CÓ phép)       → đếm vào excused
                }
            });

            // Rate helpers
            const mTotal = present + excused + absent;
            const mRate  = mTotal > 0 ? Math.round(present / mTotal * 100) : null;
            const qTotal = qPresent + qExcused + qAbsent;
            const qRate  = qTotal  > 0 ? Math.round(qPresent / qTotal * 100) : null;
            const _rCol  = (r) => r >= 80 ? '#166534' : r >= 60 ? '#92400e' : '#991b1b';
            const _rBg   = (r) => r >= 80 ? '#dcfce7' : r >= 60 ? '#fef3c7' : '#fee2e2';
            const _rIcon = (r) => r >= 80 ? '🟢' : r >= 60 ? '🟡' : '🔴';
            const rateBox = (rate, sessions, total, label) =>
                '<div style="background:#fff;border-radius:10px;padding:10px 12px;border:1px solid #e2e8f0;text-align:center;">'
                + '<div style="font-size:0.65rem;font-weight:700;color:#64748b;margin-bottom:5px;">' + label + '</div>'
                + (rate !== null
                    ? '<div style="font-size:1.45rem;font-weight:900;color:' + _rCol(rate) + ';background:' + _rBg(rate) + ';border-radius:8px;padding:5px 0;">' + _rIcon(rate) + ' ' + rate + '%</div>'
                      + '<div style="font-size:0.6rem;color:#94a3b8;margin-top:3px;">' + sessions + '/' + total + ' buổi có mặt</div>'
                    : '<div style="font-size:0.82rem;color:#94a3b8;padding:5px 0;">Chưa có dữ liệu</div>')
                + '</div>';

            const daysInMonth = new Date(yr, mo, 0).getDate();
            const firstDow    = new Date(yr, mo - 1, 1).getDay();

            const DOW = ['CN','T2','T3','T4','T5','T6','T7'];
            // Lịch học đã đăng ký
            const _hasSched = Array.isArray(p.trainingDays) && p.trainingDays.length > 0;
            // [THÊM] Lấy tên ca tập đã đăng ký của võ sinh (nếu có)
            const _p_shift_obj = (window._getClubShifts ? window._getClubShifts() : []).find(s => s.id === p.trainingShiftId);
            const _p_shift_name = _p_shift_obj ? (_p_shift_obj.name + (_p_shift_obj.timeStart && _p_shift_obj.timeEnd ? ' (' + _p_shift_obj.timeStart + '–' + _p_shift_obj.timeEnd + ')' : '')) : '';
            let scheduleHtml = '';
            if (_hasSched) {
                const _dayNames = [...p.trainingDays].sort((a,b)=>a-b)
                    .map(d => '<span style="font-size:0.74rem;background:#dbeafe;color:#1e40af;padding:3px 9px;border-radius:99px;font-weight:800;">' + (DOW[d] || d) + '</span>');
                scheduleHtml = '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:9px 12px;margin-bottom:12px;">'
                    + '<div style="font-size:0.65rem;font-weight:900;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">📅 Lịch học đã đăng ký</div>'
                    + '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;">' + _dayNames.join('') + '</div>'
                    + (_p_shift_name ? '<div style="margin-top:4px;display:flex;align-items:center;gap:4px;">'
                        + '<span style="font-size:0.68rem;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:99px;font-weight:700;">⏰ ' + _p_shift_name + '</span>'
                        + '</div>' : '')
                    + '<div style="font-size:0.61rem;color:#64748b;">🔄 Ô tím trong lịch = ngày <b>học bù</b> (tập ngoài lịch đăng ký)</div>'
                    + '</div>';
            }

            let calHtml = '<div style="font-size:0.72rem;font-weight:800;color:#334155;margin-bottom:8px;">📅 Lịch tháng ' + monthDisplay + '</div>';
            calHtml += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:5px;">';
            DOW.forEach(d => { calHtml += '<div style="text-align:center;font-size:0.6rem;font-weight:800;color:#94a3b8;padding:2px 0;">' + d + '</div>'; });
            calHtml += '</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">';
            for (let i = 0; i < firstDow; i++) calHtml += '<div></div>';
            for (let day = 1; day <= daysInMonth; day++) {
                const st = dayMap[day];
                const _dow = new Date(yr, mo - 1, day).getDay();
                const _isSchDay = !_hasSched || p.trainingDays.includes(_dow);
                // Học bù = có mặt (st=1) vào ngày KHÔNG có trong lịch học
                const _isMakeup = (st === 1) && _hasSched && !p.trainingDays.includes(_dow);
                let bg, col, icon;
                if (_isMakeup)        { bg = '#f3e8ff'; col = '#7c3aed'; icon = '🔄'; }
                else if (st === 1)    { bg = '#dcfce7'; col = '#166534'; icon = '✅'; }
                // st=2: Vắng mặt (nghỉ KHÔNG phép) → đỏ ❌
                else if (st === 2)    { bg = '#fee2e2'; col = '#991b1b'; icon = '❌'; }
                // st=3: Có phép (nghỉ CÓ phép) → xanh dương 📝
                else if (st === 3)    { bg = '#dbeafe'; col = '#1e40af'; icon = '📝'; }
                else if (_isSchDay)   { bg = '#f0f9ff'; col = '#93c5fd'; icon = '·'; }
                else                  { bg = '#f8fafc'; col = '#cbd5e1'; icon = ''; }
                calHtml += '<div title="' + day + '/' + monthDisplay + (_isMakeup ? ' – Học bù' : '') + '" style="background:' + bg + ';color:' + col + ';border-radius:6px;padding:4px 2px;text-align:center;min-height:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;">'
                    + '<div style="font-size:0.72rem;font-weight:700;">' + day + '</div>'
                    + '<div style="font-size:0.78rem;line-height:1;">' + icon + '</div>'
                    + '</div>';
            }
            calHtml += '</div>';

            const beltFull = p.belt || 'Đai Trắng';
            bodyEl.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">'
                + '<div><div style="font-size:1rem;font-weight:900;color:#0033A0;">' + name + '</div>'
                + '<div style="font-size:0.72rem;color:#64748b;margin-top:3px;">🥋 ' + beltFull + '</div></div>'
                + '<button onclick="document.getElementById(\'attHistModal\').style.display=\'none\'" style="background:#f1f5f9;border:none;border-radius:50%;width:32px;height:32px;font-size:1rem;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#475569;">✕</button>'
                + '</div>'
                + scheduleHtml
                + '<div style="display:flex;gap:7px;margin-bottom:12px;flex-wrap:wrap;">'
                + '<span style="background:#dcfce7;color:#166534;padding:5px 12px;border-radius:99px;font-size:0.75rem;font-weight:800;">✅ ' + present + ' buổi</span>'
                + '<span style="background:#dbeafe;color:#1e40af;padding:5px 12px;border-radius:99px;font-size:0.75rem;font-weight:800;">📝 ' + excused + ' phép</span>'
                + '<span style="background:#fee2e2;color:#991b1b;padding:5px 12px;border-radius:99px;font-size:0.75rem;font-weight:800;">❌ ' + absent + ' vắng</span>'
                + '</div>'
                + '<div style="background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:14px;border:1px solid #e2e8f0;">'
                + '<div style="font-size:0.65rem;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">📊 Tỷ lệ chuyên cần</div>'
                + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
                + rateBox(mRate, present, mTotal, 'Tháng ' + monthDisplay)
                + rateBox(qRate, qPresent, qTotal, quarterLabel)
                + '</div>'
                + '</div>'
                + calHtml
                + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;font-size:0.62rem;color:#64748b;">'
                + '<span>⬜ Chưa ĐD</span>'
                + (_hasSched ? '<span style="background:#f0f9ff;padding:1px 5px;border-radius:4px;color:#93c5fd;">· Ngày có lịch</span>' : '')
                + '<span style="background:#f3e8ff;padding:1px 5px;border-radius:4px;color:#7c3aed;">🔄 Học bù</span>'
                + '</div>';
        } catch(e) {
            bodyEl.innerHTML = '<div style="text-align:center;padding:32px;color:#dc2626;font-size:0.88rem;">⚠️ Lỗi tải dữ liệu. Vui lòng thử lại.</div>';
        }
    };

    function _updateAttSummary(summary) {
        const el = document.getElementById('attendanceSummary');
        if (!el) return;
        if (!summary) {
            summary = [0,0,0,0];
            _attCurrentProfiles.forEach(([name]) => { summary[_attendanceCache[name + '_' + _attCurrentDate] || 0]++; });
        }
        el.innerHTML =
            '<span style="font-size:0.7rem;background:#f0fdf4;color:#16a34a;padding:3px 10px;border-radius:99px;font-weight:800;border:1.5px solid #22c55e;">✅ ' + (summary[1]||0) + '</span>' +
            '<span style="font-size:0.7rem;background:#fef2f2;color:#dc2626;padding:3px 10px;border-radius:99px;font-weight:800;border:1.5px solid #ef4444;">❌ ' + (summary[2]||0) + '</span>' +
            '<span style="font-size:0.7rem;background:#fefce8;color:#ca8a04;padding:3px 10px;border-radius:99px;font-weight:800;border:1.5px solid #eab308;">📝 ' + (summary[3]||0) + '</span>' +
            '<span style="font-size:0.7rem;background:#f1f5f9;color:#475569;padding:3px 10px;border-radius:99px;font-weight:700;">— ' + (summary[0]||0) + '</span>';
    }



    // ── Banner sinh nhật hôm nay tại phần Thông tin chung ───────────────
    // [THÊM MỚI] Đưa thông báo sinh nhật ra ngoài tab Điểm danh để hiện
    // ngay khi đăng nhập. Luôn dùng ngày hôm nay (không phụ thuộc att_date).
    // HLV được giới hạn cơ sở chỉ thấy sinh nhật của cơ sở mình phụ trách.
    // Dùng window.* để renderApp (ở IIFE scope bên ngoài) có thể gọi được.
    window._renderHomeBirthdayBanner = function() {
        const bannerEl = document.getElementById('home_birthday_banner');
        if (!bannerEl) return;

        const todayStr = getLocalToday();
        const parts = todayStr.split('-');
        const tYear = parts[0], tMon = parts[1], tDay = parts[2];
        if (!tMon || !tDay) { bannerEl.style.display = 'none'; return; }

        // Lọc theo cơ sở của HLV nếu được phân công cơ sở cụ thể
        const coachBr = (window.userRole === 'coach' && window.coachBranch) ? window.coachBranch : null;

        const byBranch = {};
        Object.entries(allProfiles || {}).forEach(([name, p]) => {
            if (p.status !== 'active') return;
            // HLV chỉ thấy sinh nhật cơ sở của mình
            if (coachBr && p.branch !== coachBr) return;
            const dob = p.dob || '';
            if (!dob) return;
            let dobDay, dobMon, dobYear;
            if (dob.includes('/')) {
                const dp = dob.split('/');
                dobDay = (dp[0] || '').padStart(2, '0');
                dobMon = (dp[1] || '').padStart(2, '0');
                dobYear = dp[2] || '';
            } else if (dob.includes('-')) {
                const dp = dob.split('-');
                dobYear = dp[0] || ''; dobMon = dp[1] || ''; dobDay = dp[2] || '';
            } else return;
            if (dobDay !== tDay || dobMon !== tMon) return;
            const branch = p.branch || 'Chung';
            if (!byBranch[branch]) byBranch[branch] = [];
            const age = dobYear && tYear ? parseInt(tYear) - parseInt(dobYear) : null;
            byBranch[branch].push({ name, age });
        });

        const branches = Object.keys(byBranch);
        if (branches.length === 0) { bannerEl.style.display = 'none'; return; }

        // Ẩn nhãn cơ sở khi chỉ có 1 cơ sở hoặc HLV chỉ thấy cơ sở của mình
        const hideBranchLabel = (clubConfig.branchCount === 1) || !!coachBr;

        let html = '<div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fde68a;border-radius:12px;padding:10px 13px;">';
        html += '<div style="font-size:0.73rem;font-weight:900;color:#92400e;margin-bottom:7px;display:flex;align-items:center;gap:6px;">'
            + '<span style="font-size:1.05rem;">🎂</span>SINH NHẬT HÔM NAY — ' + tDay + '/' + tMon
            + '</div>';
        branches.sort().forEach(br => {
            const brName = window.getBranchNameDisplay ? window.getBranchNameDisplay(br) : br;
            const people = byBranch[br];
            html += '<div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:4px;margin-bottom:3px;">';
            if (!hideBranchLabel) {
                html += '<span style="font-size:0.64rem;font-weight:900;background:#fcd34d;color:#78350f;padding:1px 7px;border-radius:99px;flex-shrink:0;">📍 ' + brName + '</span>';
            }
            html += '<span style="font-size:0.78rem;font-weight:700;color:#92400e;">'
                + people.map(pr => pr.name + (pr.age ? ' (' + pr.age + ' tuổi)' : '')).join(', ')
                + '</span>';
            html += '</div>';
        });
        html += '</div>';
        bannerEl.innerHTML = html;
        bannerEl.style.display = 'block';
    }

    window.renderAttendanceList = async () => {
        const dateEl = document.getElementById('att_date');
        const gridEl = document.getElementById('attendanceGrid');
        if (!gridEl) return;
        if (dateEl && !dateEl.value) dateEl.value = getLocalToday();
        _attCurrentDate    = dateEl ? dateEl.value : getLocalToday();
        _attCurrentProfiles = _getFilteredAttProfiles();
        // [THÊM] Load ca tập nếu chưa tải (lần đầu mở tab điểm danh)
        if (!_clubShiftsLoaded) await _loadClubShifts();

        if (_attCurrentProfiles.length === 0) { _renderAttCards(); return; }
        // [Phase 3.8A] Large list tracking — theo dõi số võ sinh điểm danh
        if (typeof window.trackLargeListRender === 'function') {
            window.trackLargeListRender('attendance.list', _attCurrentProfiles.length, { reason: 'render-attendance-list' });
        }
        gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:#94a3b8;font-size:0.85rem;">⏳ Đang tải dữ liệu điểm danh...</div>';
        try {
            const attRef = collection(db, 'clubs', currentClubId, 'attendance');
            // Phase 4J-9: Scale config thay vì hard-code 500. Default 1200 cho CLB 1.500 võ sinh.
            const _attLimit = ((window.__scaleConfig || {}).attendanceDailyLimit) || 1200;
            // Phase 4J-9B: Thêm shift filter nếu có để giảm số docs đọc / tránh chạm limit.
            // Composite index attendance(date + shiftId) đã có trong firestore.indexes.json.
            // Backward-compatible: hồ sơ cũ chưa có shiftId vẫn load bình thường khi không filter shift.
            const _qConstraints = [where('date', '==', _attCurrentDate)];
            if (_currentShiftId) _qConstraints.push(where('shiftId', '==', _currentShiftId));
            _qConstraints.push(limit(_attLimit));
            const q = query(attRef, ..._qConstraints);
            const snap = await getDocs(q);
            if (snap.size >= _attLimit) {
                const _shiftInfo = _currentShiftId ? ' / ca: ' + _currentShiftId : ' (tất cả ca)';
                console.warn('[Attendance] ⚠️ Đạt limit ' + _attLimit + ' record — ngày ' + _attCurrentDate + _shiftInfo + '. Dữ liệu có thể bị cắt bớt. Gợi ý: chọn ca tập cụ thể để lọc hoặc dùng stats aggregation.');
                if (typeof window.warnUnsafeLimit === 'function') window.warnUnsafeLimit('attendance:renderList:limitHit', 'att-daily-list-truncated');
            }
            _attendanceCache = {};
            snap.forEach(d => {
                const _sd = d.data();
                const _docShift = _sd.shiftId || '';
                // [THÊM] Chỉ nạp record phù hợp với ca đang chọn (tương thích ngược)
                // Fix Phase 4J-9B FIXED2: Không chọn ca → lấy tất cả record trong ngày (kể cả record có shiftId).
                // Có chọn ca → chỉ lấy record đúng ca đó.
                if (_currentShiftId && _docShift !== _currentShiftId) return;
                _attendanceCache[d.id] = _mapLegacyStatus(_sd.status || 0);
            });
        } catch(e) { _attendanceCache = {}; }
        _renderAttCards();
    };

    // ═══════════════════════════════════════════════════════════════════
    // CA TẬP — Quản lý suất/ca tập trong ngày
    // Lưu tại: clubs/{clubId}/settings/shifts → { list: [{id,name,timeStart,timeEnd}] }
    // Tương thích ngược: record không có shiftId = điểm danh không theo ca
    // ═══════════════════════════════════════════════════════════════════

    // Load danh sách ca từ Firestore, populate selector
    async function _loadClubShifts() {
        try {
            const sDoc = await getDoc(doc(db, 'clubs', currentClubId, 'settings', 'shifts'));
            _clubShifts = sDoc.exists() ? (sDoc.data().list || []) : [];
        } catch(e) { _clubShifts = []; }
        _clubShiftsLoaded = true;
        _renderShiftSelector();
    }

    // Cập nhật dropdown att_shift với danh sách ca hiện có
    function _renderShiftSelector() {
        const sel = document.getElementById('att_shift');
        if (!sel) return;
        // HLV chỉ thấy ca của cơ sở mình (nếu ca có gán branch)
        const coachBr = (window.userRole === 'coach' && window.coachBranch) ? window.coachBranch : null;
        const shifts = coachBr ? _clubShifts.filter(s => !s.branch || s.branch === coachBr) : _clubShifts;
        let html = '<option value="">⏰ -- Chọn ca tập --</option>';
        shifts.forEach(s => {
            const time = s.timeStart && s.timeEnd ? ' (' + s.timeStart + '–' + s.timeEnd + ')' : '';
            html += '<option value="' + s.id + '">' + s.name + time + '</option>';
        });
        sel.innerHTML = html;
        // Giữ nguyên lựa chọn hiện tại nếu vẫn còn hợp lệ
        if (_currentShiftId && shifts.some(s => s.id === _currentShiftId)) {
            sel.value = _currentShiftId;
        } else {
            sel.value = '';
            _currentShiftId = '';
        }
        // [THÊM] Đồng bộ dropdown Ca tập trong modal Thêm võ sinh & Thông tin võ sinh
        // Dùng _clubShifts (toàn bộ, không lọc cơ sở) để không bị mất option khi admin dùng
        ['add_shift', 'm_shift'].forEach(function(sid) {
            const _ss = document.getElementById(sid);
            if (!_ss) return;
            const _curVal = _ss.value;
            let _sh = '<option value="">-- Không chọn ca --</option>';
            _clubShifts.forEach(function(s) {
                const _t = (s.timeStart && s.timeEnd) ? ' (' + s.timeStart + '\u2013' + s.timeEnd + ')' : '';
                _sh += '<option value="' + s.id + '">' + s.name + _t + '</option>';
            });
            _ss.innerHTML = _sh;
            // Giữ nguyên lựa chọn nếu ca đó vẫn còn tồn tại
            _ss.value = _clubShifts.some(function(s) { return s.id === _curVal; }) ? _curVal : '';
        });
    }

    // Xử lý khi người dùng đổi ca — reload điểm danh theo ca mới
    window.onShiftChange = () => {
        const sel = document.getElementById('att_shift');
        _currentShiftId = sel ? sel.value : '';
        if (typeof window.renderAttendanceList === 'function') window.renderAttendanceList();
    };

    // Mở modal quản lý ca tập
    window.openShiftModal = async () => {
        const modal = document.getElementById('shiftModal');
        if (!modal) return;
        modal.style.display = 'flex';
        // Reset form
        ['shift_name','shift_start','shift_end'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        // Load lại ca mới nhất trước khi hiển thị
        await _loadClubShifts();
        _renderShiftListInModal();
    };

    // Đóng modal quản lý ca tập
    window.closeShiftModal = () => {
        const modal = document.getElementById('shiftModal');
        if (modal) modal.style.display = 'none';
    };

    // Render danh sách ca trong modal
    function _renderShiftListInModal() {
        const listEl = document.getElementById('shiftList');
        if (!listEl) return;
        if (_clubShifts.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:0.82rem;">Chưa có ca tập nào. Thêm ca phía trên để bắt đầu.</div>';
            return;
        }
        listEl.innerHTML = _clubShifts.map(s => {
            const time = s.timeStart && s.timeEnd ? s.timeStart + ' – ' + s.timeEnd : 'Chưa đặt giờ';
            return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:6px;">'
                + '<div style="min-width:0;">'
                + '<div style="font-size:0.85rem;font-weight:800;color:#1e293b;">' + s.name + '</div>'
                + '<div style="font-size:0.72rem;color:#64748b;margin-top:1px;">🕐 ' + time + '</div>'
                + '</div>'
                + '<button onclick="window.deleteShift(\'' + s.id + '\')" type="button"'
                + ' style="flex-shrink:0;padding:6px 11px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;font-size:0.72rem;font-weight:800;cursor:pointer;">🗑️ Xóa</button>'
                + '</div>';
        }).join('');
    }

    // Thêm ca mới vào Firestore và cập nhật UI
    window.addShift = async () => {
        const nameEl  = document.getElementById('shift_name');
        const startEl = document.getElementById('shift_start');
        const endEl   = document.getElementById('shift_end');
        const sName = nameEl ? nameEl.value.trim() : '';
        if (!sName) { window.showToast('⚠️ Vui lòng nhập tên ca tập!', 2000); return; }
        const newShift = {
            id:        'shift_' + Date.now(),
            name:      sName,
            timeStart: startEl ? startEl.value : '',
            timeEnd:   endEl   ? endEl.value   : '',
            branch:    (window.userRole === 'coach' && window.coachBranch) ? window.coachBranch : ''
        };
        _clubShifts.push(newShift);
        try {
            await setDoc(doc(db, 'clubs', currentClubId, 'settings', 'shifts'), { list: _clubShifts });
            if (nameEl) nameEl.value = '';
            if (startEl) startEl.value = '';
            if (endEl) endEl.value = '';
            _renderShiftSelector();
            _renderShiftListInModal();
            window.showToast('✅ Đã thêm ca: ' + sName, 2000);
        } catch(e) {
            _clubShifts.pop(); // rollback
            window.showToast('⚠️ Lỗi thêm ca: ' + (e.message || ''), 3000);
        }
    };

    // Xóa ca tập theo id
    window.deleteShift = async (shiftId) => {
        const idx = _clubShifts.findIndex(s => s.id === shiftId);
        if (idx === -1) return;
        const removed = _clubShifts.splice(idx, 1)[0];
        try {
            await setDoc(doc(db, 'clubs', currentClubId, 'settings', 'shifts'), { list: _clubShifts });
            // Nếu ca đang chọn bị xóa, reset về không ca
            if (_currentShiftId === shiftId) {
                _currentShiftId = '';
                const sel = document.getElementById('att_shift');
                if (sel) sel.value = '';
            }
            _renderShiftSelector();
            _renderShiftListInModal();
            window.showToast('🗑️ Đã xóa ca: ' + removed.name, 2000);
        } catch(e) {
            _clubShifts.splice(idx, 0, removed); // rollback
            window.showToast('⚠️ Lỗi xóa ca: ' + (e.message || ''), 3000);
        }
    };

    // ── window.toggleAttendance(idxOrName) ──────────────────────────────────
    // Xoay vòng 3 trạng thái: 0(Vắng)→1(Có mặt)→2(Có phép)→0
    // Cập nhật UI ngay lập tức (optimistic), lưu offline rồi đẩy Firebase
    window.toggleAttendance = async (idxOrName) => {
        // Hỗ trợ gọi bằng số index hoặc tên võ sinh
        let idx, name, p;
        if (typeof idxOrName === 'number') {
            const entry = _attCurrentProfiles[idxOrName];
            if (!entry) return;
            [name, p] = entry; idx = idxOrName;
        } else {
            idx = _attCurrentProfiles.findIndex(([n]) => n === idxOrName);
            if (idx === -1) return;
            [name, p] = _attCurrentProfiles[idx];
        }
        // [THÊM] docId bao gồm shiftId khi có ca được chọn
        const docId         = _currentShiftId ? name + '_' + _attCurrentDate + '_' + _currentShiftId : name + '_' + _attCurrentDate;
        const currentStatus = window.currentAttendanceData[name] ?? 0;
        const newStatus     = (currentStatus + 1) % 4; // xoay vòng 0→1→2→3→0
        // Cập nhật cache & data toàn cục
        window.currentAttendanceData[name] = newStatus;
        _attendanceCache[docId] = newStatus;
        // Cập nhật UI ngay lập tức (không chờ Firebase)
        const cardEl = document.getElementById('att_card_' + idx);
        const cfg    = _ATT_STATUS[newStatus];
        if (cardEl) {
            cardEl.style.background  = cfg.bg;
            cardEl.style.color       = cfg.text;
            // Cập nhật borderColor trạng thái (outline cảnh báo là property riêng, không bị ảnh hưởng)
            cardEl.style.borderColor = cfg.border;
        }
        const lblEl = document.getElementById('att_lbl_' + idx);
        if (lblEl) lblEl.textContent = cfg.icon + ' ' + cfg.label;
        _updateAttSummary(null);
        // Lưu vào localStorage (offline buffer theo từng ngày)
        _saveAttOffline(currentClubId, _attCurrentDate);
        // Nếu mất mạng → thông báo và dừng lại, sẽ đồng bộ sau
        if (!navigator.onLine) {
            window.showToast('📴 Đã lưu offline – sẽ đồng bộ khi có mạng', 2500);
            return;
        }
        // Đẩy lên Firebase Firestore
        try {
            const attDocRef = doc(db, 'clubs', currentClubId, 'attendance', docId);
            if (newStatus === 0) {
                await deleteDoc(attDocRef);
            } else {
                // [THÊM] Lưu shiftId vào record nếu có ca được chọn
                await setDoc(attDocRef, {
                    profileId: name, name: name,
                    belt: p.belt || '', branch: p.branch || '',
                    date: _attCurrentDate,
                    month: _attCurrentDate.substring(0, 7),
                    status: newStatus,
                    timestamp: Date.now(),
                    ...(_currentShiftId ? { shiftId: _currentShiftId } : {})
                });
            }
            // Xóa key offline khi đã lưu Firebase thành công
            try { localStorage.removeItem('offline_att_' + currentClubId + '_' + _attCurrentDate); } catch(_e) {}
            // Feature 4+5: Cập nhật stats profile sau khi ghi Firestore thành công
            const _pu = {};
            if (newStatus === 1 && currentStatus !== 1) {
                p.totalSessionsAttended = (p.totalSessionsAttended || 0) + 1;
                _pu.totalSessionsAttended = increment(1);
            } else if (currentStatus === 1 && newStatus !== 1) {
                p.totalSessionsAttended = Math.max(0, (p.totalSessionsAttended || 0) - 1);
                _pu.totalSessionsAttended = increment(-1);
            }
            // [SỬA v3] Đếm buổi nghỉ KHÔNG PHÉP liên tiếp (status 2)
            // Dùng lastAbsenceDate để tránh tăng counter 2 lần cùng ngày
            // (vd: toggle 2→3→2 trong cùng 1 buổi chỉ đếm 1 lần)
            if (newStatus === 2 && currentStatus !== 2) {
                // Vừa chuyển SANG Vắng KP
                if (p.lastAbsenceDate !== _attCurrentDate) {
                    // Lần đầu đánh vắng ngày này → tăng bộ đếm
                    p.consecutiveAbsences = (p.consecutiveAbsences || 0) + 1;
                    p.lastAbsenceDate     = _attCurrentDate;
                    _pu.consecutiveAbsences = increment(1);
                    _pu.lastAbsenceDate     = _attCurrentDate;
                }
                // Nếu lastAbsenceDate === _attCurrentDate: đã đếm rồi, không đếm lại
            } else if (newStatus !== 2 && currentStatus === 2) {
                // Vừa chuyển RA KHỎI Vắng KP → reset bộ đếm
                p.consecutiveAbsences = 0;
                p.lastAbsenceDate     = '';
                _pu.consecutiveAbsences = 0;
                _pu.lastAbsenceDate     = '';
            }
            // Cả hai non-2 hoặc cả hai =2: không thay đổi bộ đếm
            if (Object.keys(_pu).length > 0) {
                updateDoc(doc(db, 'clubs', currentClubId, 'members', name), _pu).catch(() => {});
            }
            // [SỬA] Cập nhật DOM card: cảnh báo 2 mức — vàng (2 buổi KP) / đỏ (3+ buổi KP)
            const _newConsAbsent = p.consecutiveAbsences || 0;
            const newChurn2 = _newConsAbsent === 2;
            const newChurn3 = _newConsAbsent >= 3;
            const newChurn  = newChurn2 || newChurn3;
            if (cardEl) {
                // [SỬA v2] Cập nhật class nhấp nháy viền card ngay khi toggle điểm danh
                // Xóa inline border (border + border-color) trước để CSS animation class không bị ghi đè
                cardEl.classList.remove('att-card-warn-red', 'att-card-warn-yellow');
                if (newChurn3) {
                    cardEl.classList.add('att-card-warn-red');    // 3+ buổi KP → outline đỏ nhấp nháy
                } else if (newChurn2) {
                    cardEl.classList.add('att-card-warn-yellow'); // 2 buổi KP → outline vàng nhấp nháy
                } else {
                    // Hết cảnh báo: xóa inline outline nếu còn sót, khôi phục border status
                    cardEl.style.removeProperty('outline');
                    cardEl.style.borderColor = cfg.border;
                }
                const _barEl = cardEl.querySelector('[data-attbar]');
                if (_barEl) {
                    const _pct = Math.min(100, Math.round((p.totalSessionsAttended || 0) / (p.requiredSessions || 24) * 100));
                    _barEl.style.width = _pct + '%';
                    _barEl.style.background = _pct >= 100 ? '#16a34a' : _pct >= 60 ? '#2563eb' : '#f97316';
                    const _wrapEl = _barEl.parentElement;
                    if (_wrapEl) _wrapEl.title = (p.totalSessionsAttended || 0) + '/' + (p.requiredSessions || 24) + ' buổi – tiến độ thăng đai';
                }
                // [SỬA] Cập nhật badge cảnh báo nghỉ KP — span luôn tồn tại trong DOM (data-churn-icon)
                const _churnEl = cardEl.querySelector('[data-churn-icon]');
                if (_churnEl) {
                    if (newChurn3) {
                        _churnEl.style.display = 'inline-block';
                        _churnEl.style.removeProperty('display'); // clear none nếu đang ẩn
                        _churnEl.className = 'abs-warn-red';
                        _churnEl.textContent = '🔴';
                        _churnEl.title = 'Nghỉ ' + _newConsAbsent + ' buổi không phép liên tiếp — cần báo phụ huynh!';
                        _churnEl.style.fontSize = '0.72rem';
                        _churnEl.style.marginLeft = '3px';
                    } else if (newChurn2) {
                        _churnEl.style.display = 'inline-block';
                        _churnEl.style.removeProperty('display');
                        _churnEl.className = 'abs-warn-yellow';
                        _churnEl.textContent = '🟡';
                        _churnEl.title = 'Nghỉ 2 buổi không phép liên tiếp — chú ý theo dõi!';
                        _churnEl.style.fontSize = '0.72rem';
                        _churnEl.style.marginLeft = '3px';
                    } else {
                        _churnEl.style.display = 'none';
                        _churnEl.className = '';
                        _churnEl.textContent = '';
                        _churnEl.title = '';
                    }
                }
            }
        } catch(e) {
            // Hoàn tác (revert) nếu Firebase báo lỗi
            window.currentAttendanceData[name] = currentStatus;
            _attendanceCache[docId] = currentStatus;
            const cfgOld = _ATT_STATUS[currentStatus];
            if (cardEl) {
                cardEl.style.background  = cfgOld.bg;
                cardEl.style.color       = cfgOld.text;
                cardEl.style.borderColor = cfgOld.border;
            }
            if (lblEl) lblEl.textContent = cfgOld.icon + ' ' + cfgOld.label;
            _updateAttSummary(null);
            window.showToast('⚠️ Lỗi khi lưu điểm danh!', 3000);
        }
    };
    // Alias tương thích ngược
    window.toggleAttendanceStatus = window.toggleAttendance;

    // ═══════════════════════════════════════════════════════
    // FEATURE 1: BULK CHECK-IN
    // ═══════════════════════════════════════════════════════

    window.bulkCheckIn = async () => {
        if (!_attCurrentDate) { window.showToast('⚠️ Vui lòng chọn ngày điểm danh!', 2500); return; }
        const unmarked = _attCurrentProfiles.filter(([name]) => (window.currentAttendanceData[name] ?? 0) === 0);
        if (unmarked.length === 0) { window.showToast('ℹ️ Tất cả võ sinh đã được điểm danh!', 2500); return; }

        // Cập nhật cache & currentAttendanceData tức thì
        unmarked.forEach(([name]) => {
            window.currentAttendanceData[name] = 1;
            _attendanceCache[name + '_' + _attCurrentDate] = 1;
        });
        _renderAttCards();

        const btn = document.getElementById('att_bulk_btn');

        // Lưu offline buffer trước (phòng trường hợp mất mạng)
        _saveAttOffline(currentClubId, _attCurrentDate);
        if (!navigator.onLine) {
            window.showToast('📴 Mất mạng! Đã lưu offline ' + unmarked.length + ' võ sinh – sẽ tự đồng bộ khi có kết nối.', 3500);
            return;
        }

        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang lưu ' + unmarked.length + ' võ sinh...'; }
        try {
            const batch = writeBatch(db);
            unmarked.forEach(([name, p]) => {
                const attDocRef = doc(db, 'clubs', currentClubId, 'attendance', name + '_' + _attCurrentDate);
                batch.set(attDocRef, {
                    profileId: name, name,
                    belt: p.belt || '', branch: p.branch || '',
                    date: _attCurrentDate,
                    month: _attCurrentDate.substring(0, 7),
                    status: 1,
                    timestamp: Date.now()
                });
            });
            await batch.commit();
            window.showToast('✅ Đã điểm danh hàng loạt ' + unmarked.length + ' võ sinh!', 3000);
        } catch(e) {
            // Hoàn tác khi Firebase lỗi
            unmarked.forEach(([name]) => {
                window.currentAttendanceData[name] = 0;
                _attendanceCache[name + '_' + _attCurrentDate] = 0;
            });
            _renderAttCards();
            window.showToast('⚠️ Lỗi khi lưu điểm danh hàng loạt!', 3500);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✅ Đánh dấu tất cả có mặt'; }
            // Xóa key offline khi commit Firebase thành công
            try { localStorage.removeItem('offline_att_' + currentClubId + '_' + _attCurrentDate); } catch(_e) {}
        }
    };

    // ═══════════════════════════════════════════════════════
    // FEATURE 3: OFFLINE MODE INFRASTRUCTURE
    // ═══════════════════════════════════════════════════════

    // ── _saveAttOffline: Lưu toàn bộ điểm danh ngày vào localStorage ─────────
    // Key: offline_att_${clubId}_${date} — Value: JSON chứa clubId, date, records
    function _saveAttOffline(clubId, date) {
        try {
            const key = 'offline_att_' + clubId + '_' + date;
            const payload = { clubId, date, records: {} };
            _attCurrentProfiles.forEach(([name, p]) => {
                payload.records[name] = {
                    name,
                    status: window.currentAttendanceData[name] ?? 0,
                    belt: p.belt || '',
                    branch: p.branch || '',
                    date,
                    month: date.substring(0, 7),
                    profileId: name
                };
            });
            localStorage.setItem(key, JSON.stringify(payload));
        } catch(e) { /* localStorage không khả dụng */ }
    }

    // ── syncOfflineAttendance: Đẩy tất cả bản ghi offline lên Firebase ───────
    // Lặp qua các key localStorage có prefix 'offline_att_', đẩy từng cái lên Firestore
    window.syncOfflineAttendance = async () => {
        if (!navigator.onLine) return;
        // Thu thập tất cả key có prefix 'offline_att_'
        const offlineKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('offline_att_')) offlineKeys.push(k);
        }
        if (!offlineKeys.length) return;

        window.showToast('🔄 Đang đồng bộ ' + offlineKeys.length + ' ngày điểm danh offline...', 4000);
        let syncedCount = 0;
        for (const key of offlineKeys) {
            try {
                const payload = JSON.parse(localStorage.getItem(key) || 'null');
                if (!payload || !payload.records) { localStorage.removeItem(key); continue; }
                const { clubId, date, records } = payload;
                const batch = writeBatch(db);
                Object.values(records).forEach(rec => {
                    const docRef = doc(db, 'clubs', clubId, 'attendance', rec.name + '_' + date);
                    if (!rec.status || rec.status === 0) {
                        batch.delete(docRef);
                    } else {
                        batch.set(docRef, { ...rec, timestamp: Date.now() });
                    }
                });
                await batch.commit();
                localStorage.removeItem(key);
                syncedCount++;
            } catch(e) {
                // Giữ lại key, thử lại lần sau
            }
        }
        if (syncedCount > 0) {
            window.showToast('✅ Đã đồng bộ ' + syncedCount + ' bản ghi điểm danh offline!', 3000);
            // Làm mới giao diện nếu đang xem tab điểm danh
            if (_attCurrentDate && typeof window.renderAttendanceList === 'function') window.renderAttendanceList();
        }
    };

    // Lắng nghe khi có mạng trở lại → tự đồng bộ
    window.addEventListener('online', window.syncOfflineAttendance);
    // Gọi một lần khi app tải xong (phòng trường hợp tắt app đi bật lại mới có mạng)
    window.syncOfflineAttendance();

    // ═══════════════════════════════════════════════════════
    // ATTENDANCE MODULE – EXTENDED FUNCTIONS
    // ═══════════════════════════════════════════════════════

    // Switch between "Điểm danh ngày" and "Thống kê tháng" sub-tabs
    window.switchAttSubTab = (tab) => {
        const dayDiv   = document.getElementById('att_sub_day');
        const monDiv   = document.getElementById('att_sub_month');
        const btnDay   = document.getElementById('att_sub_btn_day');
        const btnMon   = document.getElementById('att_sub_btn_month');
        if (!dayDiv || !monDiv) return;

        const isDay = tab === 'day';
        dayDiv.style.display = isDay ? '' : 'none';
        monDiv.style.display = isDay ? 'none' : '';

        if (btnDay) {
            btnDay.style.background  = isDay ? '#0033A0' : '#fff';
            btnDay.style.color       = isDay ? '#fff'    : '#64748b';
            btnDay.style.borderColor = isDay ? '#0033A0' : '#e2e8f0';
            btnDay.style.boxShadow   = isDay ? '0 4px 12px rgba(0,51,160,0.2)' : 'none';
        }
        if (btnMon) {
            btnMon.style.background  = isDay ? '#fff'    : '#0033A0';
            btnMon.style.color       = isDay ? '#64748b' : '#fff';
            btnMon.style.borderColor = isDay ? '#e2e8f0' : '#0033A0';
            btnMon.style.boxShadow   = isDay ? 'none'    : '0 4px 12px rgba(0,51,160,0.2)';
        }

        if (!isDay) {
            // Default month to current month on first open
            const attMon = document.getElementById('att_month');
            if (attMon && !attMon.value) {
                const now = new Date();
                attMon.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            }
            window.renderAttMonthly();
        }
    };

    // Render monthly attendance statistics table
    window.renderAttMonthly = async () => {
        const monthEl  = document.getElementById('att_month');
        const branchEl = document.getElementById('att_month_branch');
        const tbody    = document.getElementById('att_monthly_body');
        if (!tbody) return;

        // Xác định chế độ mobile ngay từ đầu để điều hướng container đúng
        const _isMobile  = window.innerWidth <= 639;
        const _cardsEl   = document.getElementById('att_monthly_cards');
        const _tableWrap = document.getElementById('att_monthly_table_wrap');

        // Hàm hiển thị thông báo tĩnh (loading/empty/error) đúng container
        const _showMsg = (msg, isError) => {
            const color = isError ? '#dc2626' : '#94a3b8';
            const msgDiv = `<div style="text-align:center;padding:40px 16px;color:${color};font-size:0.88rem;">${msg}</div>`;
            const msgTr  = `<tr><td colspan="7" style="text-align:center;padding:40px;color:${color};font-size:0.88rem;">${msg}</td></tr>`;
            if (_isMobile && _cardsEl) {
                _cardsEl.style.display   = 'block';
                if (_tableWrap) _tableWrap.style.display = 'none';
                _cardsEl.innerHTML = msgDiv;
            } else {
                if (_cardsEl)   _cardsEl.style.display   = 'none';
                if (_tableWrap) _tableWrap.style.display = '';
                tbody.innerHTML = msgTr;
            }
        };

        const selMonth  = monthEl  ? monthEl.value  : '';
        // [SỬA LỖI] Ép chi nhánh HLV ở tầng dữ liệu — tránh lọc sai khi UI select bị reset.
        let selBranch = branchEl ? branchEl.value : 'all';
        if (window.userRole === 'coach' && window.coachBranch) selBranch = window.coachBranch;

        if (!selMonth) {
            _showMsg('Vui lòng chọn tháng để xem thống kê');
            return;
        }

        _showMsg('⏳ Đang tải dữ liệu...');

        try {
            const attRef  = collection(db, 'clubs', currentClubId, 'attendance');
            // OK_SAFE_LIMIT [3.8D-Phase6] — limit(10000) cho điểm danh hàng tháng: ngay cả CLB 1500 võ sinh
            // x 26 buổi/tháng = ~39.000 records/tháng — limit này vẫn có thể không đủ. Tuy nhiên
            // attendance là display-only report (không phải financial calculation) nên rủi ro thấp hơn.
            // TODO Phase 3.9: nếu CLB rất lớn, cân nhắc paginate attendance query.
            const q       = query(attRef, where('month', '==', selMonth), limit(10000)); // [3.3E] limit: monthly att report — high limit for large clubs
            const snap    = await getDocs(q);

            // Group by profileId
            const grouped = {};
            snap.forEach(d => {
                const data = d.data();
                const pid  = data.profileId || data.name || d.id.split('_')[0];
                if (!grouped[pid]) grouped[pid] = { name: pid, belt: data.belt || '', branch: data.branch || '', present: 0, excused: 0, absent: 0 };
                if (data.status === 1) grouped[pid].present++;
                // Schema: 2 = Vắng (không phép), 3 = Có phép
                if (data.status === 2) grouped[pid].absent++;
                if (data.status === 3) grouped[pid].excused++;
            });

            // Filter by branch
            let rows = Object.values(grouped).filter(r => selBranch === 'all' || r.branch === selBranch);

            // Also include active profiles with no attendance records this month
            Object.entries(allProfiles || {}).forEach(([pid, p]) => {
                if (p.status !== 'active') return;
                if (selBranch !== 'all' && p.branch !== selBranch) return;
                if (!grouped[pid]) rows.push({ name: pid, belt: p.belt || '', branch: p.branch || '', present: 0, excused: 0, absent: 0 });
            });

            rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

            if (rows.length === 0) {
                _showMsg('Không có dữ liệu điểm danh trong tháng này');
                return;
            }

            const monthDisplay = selMonth.split('-').reverse().join('/');

            // Helper: lấy badge cấp đai (dùng chung)
            const _mkBeltBadge = (belt) => window.getBeltBadge
                ? window.getBeltBadge(belt || 'Trắng')
                : `<span class="badge" style="background:#f0f4ff;color:#0033A0;border:1px solid #c7d2fe;">${(belt||'Trắng').replace(/^Đai /i,'')}</span>`;

            // Helper: màu chuyên cần theo %
            const _rateColor = (rate) => rate >= 80 ? '#16a34a' : rate >= 60 ? '#d97706' : '#dc2626';
            const _rateBg    = (rate) => rate >= 80 ? '#f0fdf4' : rate >= 60 ? '#fefce8' : '#fff1f2';

            // ── Phát hiện mobile (≤639px) để chọn cách render ──────────────────
            const isMobile = window.innerWidth <= 639;
            const cardsEl   = document.getElementById('att_monthly_cards');
            const tableWrap = document.getElementById('att_monthly_table_wrap');

            if (isMobile && cardsEl) {
                // ════════════════════════════════════════════════════════════
                // MOBILE: Render danh sách CARD DIVS — không dùng table,
                // không có horizontal scroll dù màn hình rất nhỏ
                // ════════════════════════════════════════════════════════════
                cardsEl.style.display   = 'block';
                if (tableWrap) tableWrap.style.display = 'none';

                let cardsHtml = '';
                rows.forEach(r => {
                    const _safeName = r.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                    const _mTot  = r.present + r.excused + r.absent;
                    const _mRate = _mTot > 0 ? Math.round(r.present / _mTot * 100) : null;
                    const _rateStr  = _mRate !== null ? `${_mRate}%` : '—';
                    const _rColor   = _mRate !== null ? _rateColor(_mRate) : '#94a3b8';
                    const _rBg      = _mRate !== null ? _rateBg(_mRate)    : '#f8fafc';
                    const _beltBadge = _mkBeltBadge(r.belt);
                    // [THÊM] Badge cảnh báo vắng không phép liên tiếp (từ profile)
                    const _mProfile  = (allProfiles || {})[r.name] || {};
                    const _mConsAbs  = _mProfile.consecutiveAbsences || 0;
                    const _mWarnHtml = _mConsAbs >= 3
                        ? '<span class="abs-warn-red" style="margin-left:5px;font-size:0.75rem;" title="Nghỉ ' + _mConsAbs + ' buổi không phép liên tiếp — cần báo phụ huynh!">🔴</span>'
                        : _mConsAbs === 2
                        ? '<span class="abs-warn-yellow" style="margin-left:5px;font-size:0.75rem;" title="Nghỉ 2 buổi không phép liên tiếp — chú ý theo dõi!">🟡</span>'
                        : '';

                    cardsHtml += `
                    <div style="background:#fff;border-radius:14px;border:1px solid #e8edf5;padding:12px 14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
                        <!-- Hàng 1: Tên + Đai -->
                        <!-- [THÊM] Bấm vào tên → mở lịch sử điểm danh tháng đang xem -->
                        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:9px;">
                            <div style="flex:1;min-width:0;overflow:hidden;">
                                <span onclick="window.showAttMemberHistory('${_safeName}','${selMonth}')" style="font-weight:800;font-size:0.9rem;color:#0033A0;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;">${r.name}</span>${_mWarnHtml}
                            </div>
                            <div style="flex-shrink:0;max-width:45%;">${_beltBadge}</div>
                        </div>
                        <!-- Hàng 2: 4 ô thống kê ngang nhau (Có mặt | Nghỉ CP | Nghỉ KP | Chuyên cần) -->
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px;margin-bottom:9px;">
                            <div style="text-align:center;background:#f0fdf4;border-radius:10px;padding:6px 3px;">
                                <div style="font-size:1.05rem;font-weight:900;color:#16a34a;line-height:1;">${r.present}</div>
                                <div style="font-size:0.5rem;font-weight:800;color:#16a34a;margin-top:2px;letter-spacing:0.02em;">✅ CÓ MẶT</div>
                            </div>
                            <div style="text-align:center;background:#eff6ff;border-radius:10px;padding:6px 3px;">
                                <div style="font-size:1.05rem;font-weight:900;color:#2563eb;line-height:1;">${r.excused}</div>
                                <div style="font-size:0.5rem;font-weight:800;color:#2563eb;margin-top:2px;letter-spacing:0.02em;">📝 NGHỈ CP</div>
                            </div>
                            <div style="text-align:center;background:#fff1f2;border-radius:10px;padding:6px 3px;">
                                <div style="font-size:1.05rem;font-weight:900;color:#dc2626;line-height:1;">${r.absent}</div>
                                <div style="font-size:0.5rem;font-weight:800;color:#dc2626;margin-top:2px;letter-spacing:0.02em;">❌ NGHỈ KP</div>
                            </div>
                            <div style="text-align:center;background:${_rBg};border-radius:10px;padding:6px 3px;">
                                <div style="font-size:1.05rem;font-weight:900;color:${_rColor};line-height:1;">${_rateStr}</div>
                                <div style="font-size:0.5rem;font-weight:800;color:${_rColor};margin-top:2px;letter-spacing:0.02em;">📊 CC</div>
                            </div>
                        </div>
                        <!-- Hàng 3: Nút copy báo cáo Zalo full-width -->
                        <button onclick="event.stopPropagation();window.copyAttReport('${_safeName}',${r.present},${r.excused},${r.absent},'${monthDisplay}')"
                            style="width:100%;padding:8px;background:#0068FF;color:#fff;border:none;border-radius:10px;font-size:0.75rem;font-weight:800;cursor:pointer;letter-spacing:0.02em;">
                            📋 Copy báo cáo Zalo gửi phụ huynh
                        </button>
                    </div>`;
                });
                cardsEl.innerHTML = cardsHtml;

            } else {
                // ════════════════════════════════════════════════════════════
                // DESKTOP: Render table rows như trước
                // ════════════════════════════════════════════════════════════
                if (cardsEl)   cardsEl.style.display   = 'none';
                if (tableWrap) tableWrap.style.display = '';

                let html = '';
                rows.forEach((r, i) => {
                    const _beltBadge = _mkBeltBadge(r.belt);
                    const rowBg = i % 2 === 0 ? '' : 'background:#f8fafc;';
                    const _mTot  = r.present + r.excused + r.absent;
                    const _mRate = _mTot > 0 ? Math.round(r.present / _mTot * 100) : null;
                    const _rateHtml = _mRate !== null
                        ? `<span style="font-weight:900;font-size:0.88rem;color:${_rateColor(_mRate)};">${_mRate}%</span>`
                        : `<span style="color:#94a3b8;font-size:0.75rem;">—</span>`;
                    const _safeName = r.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                    // [THÊM] Badge cảnh báo vắng không phép liên tiếp (từ profile)
                    const _dtProfile = (allProfiles || {})[r.name] || {};
                    const _dtConsAbs = _dtProfile.consecutiveAbsences || 0;
                    const _dtWarn = _dtConsAbs >= 3
                        ? '<span class="abs-warn-red" style="margin-left:4px;font-size:0.72rem;" title="Nghỉ ' + _dtConsAbs + ' buổi không phép liên tiếp — cần báo phụ huynh!">🔴</span>'
                        : _dtConsAbs === 2
                        ? '<span class="abs-warn-yellow" style="margin-left:4px;font-size:0.72rem;" title="Nghỉ 2 buổi không phép liên tiếp — chú ý theo dõi!">🟡</span>'
                        : '';
                    // [THÊM] Bấm vào tên trong bảng desktop → mở lịch sử điểm danh tháng đó
                    html += `<tr style="${rowBg}">
                        <td><span onclick="window.showAttMemberHistory('${_safeName}','${selMonth}')" style="font-weight:700;color:#0033A0;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;" title="Xem lịch sử điểm danh tháng ${monthDisplay}">${r.name}</span>${_dtWarn}</td>
                        <td>${_beltBadge}</td>
                        <td style="text-align:center;"><span style="font-weight:800;color:#16a34a;font-size:1rem;">${r.present}</span></td>
                        <td style="text-align:center;"><span style="font-weight:800;color:#2563eb;font-size:1rem;">${r.excused}</span></td>
                        <td style="text-align:center;"><span style="font-weight:800;color:#dc2626;font-size:1rem;">${r.absent}</span></td>
                        <td style="text-align:center;">${_rateHtml}</td>
                        <td style="text-align:center;"><button onclick="event.stopPropagation();window.copyAttReport('${_safeName}',${r.present},${r.excused},${r.absent},'${monthDisplay}')" style="background:#0068FF;color:#fff;border:none;padding:5px 9px;border-radius:8px;font-size:0.7rem;font-weight:700;cursor:pointer;white-space:nowrap;" title="Copy báo cáo tháng ${monthDisplay} gửi phụ huynh ${r.name}">📋 Zalo</button></td>
                    </tr>`;
                });
                tbody.innerHTML = html;
            }

            // Admin: tải ghi chú HLV theo tháng vào panel bên dưới
            if (window.userRole === 'admin' || window.userRole === 'super_admin') {
                window.loadAllSessionNotes(selMonth);
            }
        } catch(e) {
            console.error('renderAttMonthly error:', e);
            // Hiển thị lỗi ở cả 2 container tuỳ cái nào đang hiện
            const cardsEl = document.getElementById('att_monthly_cards');
            if (cardsEl && cardsEl.style.display !== 'none') {
                cardsEl.innerHTML = '<div style="text-align:center;padding:32px;color:#dc2626;font-size:0.88rem;">⚠️ Lỗi tải dữ liệu. Vui lòng thử lại.</div>';
            } else {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#dc2626;font-size:0.88rem;">⚠️ Lỗi tải dữ liệu. Vui lòng thử lại.</td></tr>';
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // XUẤT EXCEL BÁO CÁO ĐIỂM DANH THÁNG
    // Tạo file gồm: 1 sheet tổng hợp tất cả cơ sở + từng sheet riêng mỗi cơ sở
    // Bố cục đẹp, có viền bo, màu sắc rõ ràng để gửi phụ huynh xem
    // ═══════════════════════════════════════════════════════════════════════
    window.exportAttendanceExcel = async () => {
        // Kiểm tra quyền: chỉ admin/coach mới được xuất
        if (window.userRole === 'viewer') return alert('Tài khoản khách không thể tải File!');

        // Lấy tháng được chọn từ bộ lọc Thống kê tháng
        const monthEl = document.getElementById('att_month');
        const selMonth = monthEl ? monthEl.value : '';
        if (!selMonth) return alert('Vui lòng chọn tháng trước khi xuất báo cáo!');

        // Lấy tên CLB và số cơ sở từ cấu hình
        const clubName  = (clubData && clubData.clubName) || 'CLB Taekwondo';
        const bCount    = clubConfig.branchCount || 1;
        const isSingle  = bCount === 1;

        // Tạo nhãn tháng dạng MM/YYYY để hiển thị
        const [mYear, mMon] = selMonth.split('-');
        const monthDisplay  = `Tháng ${parseInt(mMon)}/${mYear}`;

        // Ngày xuất báo cáo
        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;

        window.showToast('⏳ Đang tải dữ liệu điểm danh...', 15000, true);

        try {
            // ── Lấy tất cả dữ liệu điểm danh trong tháng từ Firestore ──────────
            const attRef = collection(db, 'clubs', currentClubId, 'attendance');
            // OK_SAFE_LIMIT [3.8D-Phase6] — limit(10000) cho export điểm danh: attendance là display/report,
            // không phải financial calculation. Rủi ro thấp. TODO Phase 3.9 nếu CLB quá lớn.
            const snap   = await getDocs(query(attRef, where('month', '==', selMonth), limit(10000))); // [3.3E] limit: monthly att export

            // Gom nhóm theo tên võ sinh — đếm số buổi có mặt, nghỉ CP, nghỉ KP
            const grouped = {};
            snap.forEach(d => {
                const data = d.data();
                const pid  = data.profileId || data.name || d.id.split('_')[0];
                if (!grouped[pid]) grouped[pid] = { name: pid, belt: data.belt || '', branch: data.branch || 'CS1', present: 0, excused: 0, absent: 0 };
                if (data.status === 1) grouped[pid].present++;
                // Schema: 2 = Vắng (không phép), 3 = Có phép
                if (data.status === 2) grouped[pid].absent++;
                if (data.status === 3) grouped[pid].excused++;
            });

            // Bổ sung võ sinh đang tập chưa có dữ liệu điểm danh tháng này
            Object.entries(allProfiles || {}).forEach(([pid, p]) => {
                if (p.status !== 'active') return;
                if (!grouped[pid]) {
                    grouped[pid] = { name: pid, belt: p.belt || '', branch: p.branch || 'CS1', present: 0, excused: 0, absent: 0 };
                }
                // Cập nhật belt/branch từ profile nếu thiếu trong attendance
                if (!grouped[pid].belt && p.belt)   grouped[pid].belt   = p.belt;
                if (!grouped[pid].branch && p.branch) grouped[pid].branch = p.branch;
            });

            // Chuyển object thành mảng, sắp xếp tên tiếng Việt
            const allRows = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

            if (allRows.length === 0) {
                document.getElementById('toastMessage').classList.remove('show');
                return alert('Không có dữ liệu điểm danh nào trong tháng này!');
            }

            // ── Định nghĩa style dùng chung (xlsx-js-style) ────────────────────

            // Border
            const bAll  = { top:{style:'thin',color:{rgb:'C8D5E8'}}, bottom:{style:'thin',color:{rgb:'C8D5E8'}}, left:{style:'thin',color:{rgb:'C8D5E8'}}, right:{style:'thin',color:{rgb:'C8D5E8'}} };
            const bBold = { top:{style:'medium',color:{rgb:'0033A0'}}, bottom:{style:'medium',color:{rgb:'0033A0'}}, left:{style:'medium',color:{rgb:'0033A0'}}, right:{style:'medium',color:{rgb:'0033A0'}} };
            const bGreen= { top:{style:'medium',color:{rgb:'15803D'}}, bottom:{style:'medium',color:{rgb:'15803D'}}, left:{style:'medium',color:{rgb:'15803D'}}, right:{style:'medium',color:{rgb:'15803D'}} };

            // Font
            const fTitle = { bold:true, sz:15, name:'Arial', color:{rgb:'FFFFFF'} };
            const fSub   = { bold:true, sz:10, name:'Arial', color:{rgb:'1E3A6E'} };
            const fHdr   = { bold:true, sz:11, name:'Arial', color:{rgb:'FFFFFF'} };
            const fBold  = { bold:true, sz:11, name:'Arial' };
            const fNorm  = { sz:11, name:'Arial' };
            const fGreen = { bold:true, sz:11, name:'Arial', color:{rgb:'166534'} };
            const fBlue  = { bold:true, sz:11, name:'Arial', color:{rgb:'1D4ED8'} };
            const fRed   = { bold:true, sz:11, name:'Arial', color:{rgb:'9F1239'} };
            const fGray  = { sz:10,  name:'Arial', color:{rgb:'64748B'} };

            // Fill
            const fillTitle  = { patternType:'solid', fgColor:{rgb:'0033A0'} };        // xanh navy
            const fillSub    = { patternType:'solid', fgColor:{rgb:'DBEAFE'} };        // xanh nhạt
            const fillHdr    = { patternType:'solid', fgColor:{rgb:'1E40AF'} };        // xanh đậm
            const fillAlt    = { patternType:'solid', fgColor:{rgb:'F0F4FF'} };        // xen kẽ hàng chẵn
            const fillTotal  = { patternType:'solid', fgColor:{rgb:'DCFCE7'} };        // tổng kết xanh lá
            const fillWarn   = { patternType:'solid', fgColor:{rgb:'FEF9C3'} };        // cảnh báo vàng
            const fillGood   = { patternType:'solid', fgColor:{rgb:'F0FDF4'} };        // tốt (chuyên cần ≥80%)
            const fillOk     = { patternType:'solid', fgColor:{rgb:'FEFCE8'} };        // khá (60–79%)
            const fillBad    = { patternType:'solid', fgColor:{rgb:'FFF1F2'} };        // kém (<60%)

            // Alignment
            const aCenter = { horizontal:'center', vertical:'center', wrapText:true };
            const aLeft   = { horizontal:'left',   vertical:'center', wrapText:true };
            const aRight  = { horizontal:'right',  vertical:'center' };

            // ── Helper tạo ô ────────────────────────────────────────────────────
            const mc = (v, font, fill, border, align) => {
                const c = { v: v === undefined || v === null ? '' : v, t: typeof v === 'number' ? 'n' : 's', s: { font: font || fNorm, alignment: align || aLeft } };
                if (fill)   c.s.fill   = fill;
                if (border) c.s.border = border;
                return c;
            };
            const hc  = v => mc(v, fHdr,  fillHdr,  bBold, aCenter);  // header cell
            const nc  = (v, alt) => mc(v, fNorm, alt ? fillAlt : null, bAll, aLeft);
            const bc  = (v, alt) => mc(v, fBold, alt ? fillAlt : null, bAll, aLeft);
            const cc  = (v, font, fill) => mc(v, font || fNorm, fill, bAll, aCenter);
            const nNum = (v, alt) => mc(Number(v)||0, fNorm, alt ? fillAlt : null, bAll, aCenter, '#,##0');

            // ── Helper lấy fill cho cột chuyên cần dựa theo % ──────────────────
            const rateFill = (rate) => {
                if (rate === null) return null;
                if (rate >= 80) return fillGood;
                if (rate >= 60) return fillOk;
                return fillBad;
            };
            const rateFont = (rate) => {
                if (rate === null) return fGray;
                if (rate >= 80) return fGreen;
                if (rate >= 60) return fBold;
                return fRed;
            };

            // ── Màu sắc cấp đai (tương ứng getBeltBadge) cho cột Excel ─────────
            const beltFill = (belt) => {
                if (!belt) return null;
                const b = belt.toLowerCase();
                if (b.includes('đen'))         return { patternType:'solid', fgColor:{rgb:'1E293B'} };
                if (b.includes('đỏ'))          return { patternType:'solid', fgColor:{rgb:'FFE4E6'} };
                if (b.includes('xanh dương'))  return { patternType:'solid', fgColor:{rgb:'DBEAFE'} };
                if (b.includes('xanh lá'))     return { patternType:'solid', fgColor:{rgb:'DCFCE7'} };
                if (b.includes('vàng'))        return { patternType:'solid', fgColor:{rgb:'FEF9C3'} };
                return { patternType:'solid', fgColor:{rgb:'F8FAFC'} }; // trắng
            };
            const beltFont = (belt) => {
                if (!belt) return fNorm;
                const b = belt.toLowerCase();
                if (b.includes('đen'))        return Object.assign({}, fBold, {color:{rgb:'F8FAFC'}});
                if (b.includes('đỏ'))         return Object.assign({}, fBold, {color:{rgb:'9F1239'}});
                if (b.includes('xanh dương')) return Object.assign({}, fBold, {color:{rgb:'1D4ED8'}});
                if (b.includes('xanh lá'))    return Object.assign({}, fBold, {color:{rgb:'166534'}});
                if (b.includes('vàng'))       return Object.assign({}, fBold, {color:{rgb:'78350F'}});
                return fNorm;
            };

            // ── Tên cột header — có/không có cột Cơ sở ─────────────────────────
            const NUM_COLS   = isSingle ? 8 : 9;
            const colHeaders = isSingle
                ? ['STT', 'Họ và Tên', 'Cấp Đai', '✅ Có mặt', '📝 Nghỉ CP', '❌ Nghỉ KP', '📅 Tổng buổi', '📊 Chuyên cần']
                : ['STT', 'Họ và Tên', 'Cơ sở',   'Cấp Đai', '✅ Có mặt', '📝 Nghỉ CP', '❌ Nghỉ KP', '📅 Tổng buổi', '📊 Chuyên cần'];
            const colWidths = isSingle
                ? [{wch:5},{wch:30},{wch:26},{wch:10},{wch:10},{wch:10},{wch:12},{wch:14}]
                : [{wch:5},{wch:30},{wch:14},{wch:26},{wch:10},{wch:10},{wch:10},{wch:12},{wch:14}];

            // ── Hàm dựng một worksheet từ mảng rows ────────────────────────────
            // titleLine1: dòng tiêu đề chính, titleLine2: dòng phụ
            const buildAttSheet = (rows, titleLine1, titleLine2, showBranch) => {
                const numCols = showBranch ? 9 : 8;
                const headers = showBranch
                    ? ['STT', 'Họ và Tên', 'Cơ sở', 'Cấp Đai', '✅ Có mặt', '📝 Nghỉ CP', '❌ Nghỉ KP', '📅 Tổng buổi', '📊 Chuyên cần']
                    : ['STT', 'Họ và Tên', 'Cấp Đai', '✅ Có mặt', '📝 Nghỉ CP', '❌ Nghỉ KP', '📅 Tổng buổi', '📊 Chuyên cần'];

                const ws_data = [];

                // Hàng 1: tiêu đề chính — nền xanh navy, chữ trắng
                const titleRow = [mc(titleLine1, fTitle, fillTitle, bBold, aCenter)];
                for (let i = 1; i < numCols; i++) titleRow.push(mc('', fTitle, fillTitle, bBold, aCenter));
                ws_data.push(titleRow);

                // Hàng 2: thông tin phụ — nền xanh nhạt
                const subRow = [mc(titleLine2, fSub, fillSub, bAll, aCenter)];
                for (let i = 1; i < numCols; i++) subRow.push(mc('', fSub, fillSub, bAll, aCenter));
                ws_data.push(subRow);

                // Hàng 3: header cột
                ws_data.push(headers.map(h => hc(h)));

                // Hàng dữ liệu từng võ sinh
                let stt = 1;
                let totPresent = 0, totExcused = 0, totAbsent = 0;

                rows.forEach(r => {
                    const alt    = stt % 2 === 0;          // xen kẽ màu chẵn/lẻ
                    const mTot   = r.present + r.excused + r.absent;
                    const mRate  = mTot > 0 ? Math.round(r.present / mTot * 100) : null;
                    const rateStr = mRate !== null ? `${mRate}%` : '—';
                    const rFill  = rateFill(mRate);
                    const rFont  = rateFont(mRate);
                    const bFill  = beltFill(r.belt);
                    const bFont  = beltFont(r.belt);
                    const beltLabel = (r.belt || 'Trắng').replace(/^Đai /i, '');
                    const branchLabel = window.getBranchNameDisplay ? window.getBranchNameDisplay(r.branch || 'CS1') : (r.branch || 'CS1');

                    totPresent += r.present;
                    totExcused += r.excused;
                    totAbsent  += r.absent;

                    if (showBranch) {
                        ws_data.push([
                            cc(stt++,   fNorm, alt ? fillAlt : null),
                            bc(r.name,  alt),
                            cc(branchLabel, fNorm, alt ? fillAlt : null),
                            mc(beltLabel, bFont, bFill, bAll, aCenter),
                            cc(r.present, fGreen, alt ? fillAlt : null),
                            cc(r.excused, fBlue,  alt ? fillAlt : null),
                            cc(r.absent,  r.absent > 0 ? fRed : fNorm, alt ? fillAlt : null),
                            cc(mTot,      fBold,  alt ? fillAlt : null),
                            mc(rateStr,  rFont,  rFill  || (alt ? fillAlt : null), bAll, aCenter),
                        ]);
                    } else {
                        ws_data.push([
                            cc(stt++,   fNorm, alt ? fillAlt : null),
                            bc(r.name,  alt),
                            mc(beltLabel, bFont, bFill, bAll, aCenter),
                            cc(r.present, fGreen, alt ? fillAlt : null),
                            cc(r.excused, fBlue,  alt ? fillAlt : null),
                            cc(r.absent,  r.absent > 0 ? fRed : fNorm, alt ? fillAlt : null),
                            cc(mTot,      fBold,  alt ? fillAlt : null),
                            mc(rateStr,  rFont,  rFill  || (alt ? fillAlt : null), bAll, aCenter),
                        ]);
                    }
                });

                // Hàng tổng kết cuối — nền xanh lá
                const totTot = totPresent + totExcused + totAbsent;
                const totRate = totTot > 0 ? Math.round(totPresent / totTot * 100) : null;
                const totRateStr = totRate !== null ? `${totRate}%` : '—';
                const totCells = [
                    mc(`TỔNG  (${rows.length} võ sinh)`, fGreen, fillTotal, bGreen, aCenter),
                ];
                // điền ô trống span đến cột số liệu
                const skipCols = showBranch ? 3 : 2;  // STT + Tên (+ Cơ sở nếu có)
                for (let k = 1; k < skipCols; k++) totCells.push(mc('', fGreen, fillTotal, bGreen, aCenter));
                // Cấp đai ô trống
                totCells.push(mc('', fGreen, fillTotal, bGreen, aCenter));
                totCells.push(mc(totPresent,  fGreen, fillTotal, bGreen, aCenter));
                totCells.push(mc(totExcused,  fBlue,  fillTotal, bGreen, aCenter));
                totCells.push(mc(totAbsent,   totAbsent > 0 ? fRed : fGreen, fillTotal, bGreen, aCenter));
                totCells.push(mc(totTot,      fBold,  fillTotal, bGreen, aCenter));
                totCells.push(mc(totRateStr,  rateFont(totRate), fillTotal, bGreen, aCenter));
                ws_data.push(totCells);

                // Hàng ghi chú / chú giải cuối
                const noteRow = [mc(`Ghi chú: ✅ Có mặt  📝 Nghỉ có phép (CP)  ❌ Nghỉ không phép (KP)  📊 Chuyên cần = Có mặt / (Có mặt + Nghỉ CP + Nghỉ KP) × 100%`, fGray, null, null, aLeft)];
                for (let i = 1; i < numCols; i++) noteRow.push(mc('', fGray, null, null, aLeft));
                ws_data.push(noteRow);

                // Tạo worksheet và thiết lập cột / merge
                const ws = XLSX.utils.aoa_to_sheet(ws_data);
                ws['!cols'] = showBranch
                    ? [{wch:5},{wch:30},{wch:14},{wch:26},{wch:11},{wch:11},{wch:11},{wch:13},{wch:14}]
                    : [{wch:5},{wch:30},{wch:26},{wch:11},{wch:11},{wch:11},{wch:13},{wch:14}];
                ws['!rows'] = [{hpt:28}, {hpt:18}];  // chiều cao hàng tiêu đề
                // Merge tiêu đề và phụ đề qua tất cả cột
                const merges = [
                    {s:{r:0,c:0}, e:{r:0,c:numCols-1}},
                    {s:{r:1,c:0}, e:{r:1,c:numCols-1}},
                    {s:{r:0,c:0}, e:{r:0,c:numCols-1}},
                ];
                // Merge ô tổng (cột STT+tên(+chi nhánh) gộp lại)
                const lastDataRow = ws_data.length - 2; // hàng tổng (trước ghi chú)
                merges.push({s:{r:lastDataRow,c:0}, e:{r:lastDataRow,c:skipCols-1}});
                // Merge hàng ghi chú
                merges.push({s:{r:ws_data.length-1,c:0}, e:{r:ws_data.length-1,c:numCols-1}});
                ws['!merges'] = merges;
                return ws;
            };

            // ── Tạo workbook ────────────────────────────────────────────────────
            const wb = XLSX.utils.book_new();

            // ── SHEET 1: TỔNG HỢP TẤT CẢ CƠ SỞ ───────────────────────────────
            const ws_all = buildAttSheet(
                allRows,
                `📋 BÁO CÁO ĐIỂM DANH ${monthDisplay.toUpperCase()} — ${clubName.toUpperCase()}`,
                `Ngày xuất: ${dateStr}   |   Tổng: ${allRows.length} võ sinh   |   Tất cả cơ sở`,
                !isSingle   // hiện cột Cơ sở khi có nhiều cơ sở
            );
            XLSX.utils.book_append_sheet(wb, ws_all, 'Tong Hop');

            // ── SHEET TỪNG CƠ SỞ (chỉ tạo khi có nhiều cơ sở) ─────────────────
            if (!isSingle) {
                for (let bi = 1; bi <= bCount; bi++) {
                    const branchKey  = 'CS' + bi;
                    const branchName = clubConfig['branchName' + bi] || ('Cơ sở ' + bi);
                    // Lọc chỉ võ sinh thuộc cơ sở này
                    const branchRows = allRows.filter(r => (r.branch || 'CS1') === branchKey);
                    if (branchRows.length === 0) continue; // bỏ qua cơ sở không có dữ liệu

                    const ws_br = buildAttSheet(
                        branchRows,
                        `📋 BÁO CÁO ĐIỂM DANH ${monthDisplay.toUpperCase()} — ${branchName.toUpperCase()}`,
                        `Ngày xuất: ${dateStr}   |   Tổng: ${branchRows.length} võ sinh   |   ${branchName}`,
                        false   // không cần cột Cơ sở vì đây là sheet riêng mỗi cơ sở
                    );
                    // Tên sheet an toàn: tối đa 31 ký tự, không có ký tự đặc biệt
                    const safeSheetName = branchName.replace(/[\/\\?*\[\]:]/g,'').substring(0, 28);
                    XLSX.utils.book_append_sheet(wb, ws_br, safeSheetName);
                }
            }

            // ── Xuất file ───────────────────────────────────────────────────────
            const fileName = `DiemDanh_${monthDisplay.replace('/','_')}_${clubName.replace(/\s+/g,'_')}.xlsx`;
            XLSX.writeFile(wb, fileName);
            document.getElementById('toastMessage').classList.remove('show');
            window.showToast(`✅ Đã xuất: ${fileName}`);

        } catch(err) {
            console.error('exportAttendanceExcel error:', err);
            document.getElementById('toastMessage').classList.remove('show');
            alert('Lỗi xuất Excel điểm danh: ' + (err.message || err));
        }
    };

    // Copy monthly report to clipboard
    window.copyAttReport = (name, present, excused, absent, monthDisplay) => {
        const text = `Kính gửi Phụ huynh võ sinh ${name}, báo cáo tình hình tập luyện tháng ${monthDisplay}: Bé đã đi tập ${present} buổi, nghỉ có phép ${excused} buổi, nghỉ không phép ${absent} buổi. Cảm ơn gia đình đã đồng hành cùng CLB!`;
        navigator.clipboard.writeText(text)
            .then(() => window.showToast('✅ Đã copy báo cáo của ' + name))
            .catch(() => {
                // Fallback for older browsers / non-HTTPS
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                    document.body.appendChild(ta); ta.focus(); ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    window.showToast('✅ Đã copy báo cáo của ' + name);
                } catch(_) { window.showToast('⚠️ Không thể copy. Vui lòng copy thủ công.', 3000); }
            });
    };


    // ═══════════════════════════════════════════════════════════════
    //  COACH ACCOUNT MANAGEMENT
    // ═══════════════════════════════════════════════════════════════
    window.openCoachAccountsModal = () => {
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') return alert('Chỉ Admin mới có quyền quản lý tài khoản HLV!');
        document.getElementById('coachAccountsModal').style.display = 'flex';
        window.loadCoachAccounts();
    };

    window.loadCoachAccounts = async () => {
        const listEl = document.getElementById('coachAccountsList');
        if (!listEl) return;
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:0.85rem;">Đang tải...</div>';
        try {
            // FIX: query sub-collection clubs/{clubId}/coaches/ instead of top-level users
            // Admin has permission to read their own club's sub-collections
            const coachesRef = collection(db, 'clubs', currentClubId, 'coaches');
            const snap = await getDocs(query(coachesRef, limit(200))); // [3.3E] coaches list
            if (snap.empty) {
                listEl.innerHTML = '<div style="text-align:center;padding:24px 16px;color:#94a3b8;font-size:0.85rem;">Chưa có tài khoản HLV nào</div>';
                return;
            }
            let html = '';
            snap.forEach(d => {
                const data = d.data();
                const safeId    = d.id.replace(/'/g, "\\'");
                const safeEmail = (data.email || '').replace(/'/g, "\\'");
                const branchLabel = data.branch
                    ? (window.getBranchNameDisplay ? window.getBranchNameDisplay(data.branch) : data.branch)
                    : 'Tất cả cơ sở';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:6px;">'
                    + '<div>'
                    + '<div style="font-weight:700;font-size:0.88rem;color:#1e293b;">' + (data.displayName || data.email) + '</div>'
                    + '<div style="font-size:0.72rem;color:#64748b;">' + (data.email || '') + '</div>'
                    + '<div style="font-size:0.68rem;color:#0369a1;margin-top:2px;">📍 ' + branchLabel + '</div>'
                    + '</div>'
                    + '<div style="display:flex;gap:6px;flex-shrink:0;">'
                    + '<button onclick="window.resetCoachPassword(\'' + safeEmail + '\')" style="background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;padding:5px 10px;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;">🔑 Đặt lại MK</button>'
                    + '<button onclick="window.deleteCoachAccount(\'' + safeId + '\',\'' + safeEmail + '\')" style="background:#fee2e2;color:#dc2626;border:none;padding:5px 10px;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;">🗑️ Xóa</button>'
                    + '</div>'
                    + '</div>';
            });
            listEl.innerHTML = html;
        } catch(e) {
            listEl.innerHTML = '<div style="color:#dc2626;font-size:0.82rem;padding:12px;">Lỗi tải danh sách: ' + (e.message || '') + '</div>';
        }
    };

    window.createCoachAccount = async () => {
        const email  = (document.getElementById('coach_email').value  || '').trim();
        const pass   = (document.getElementById('coach_pass').value   || '').trim();
        const name   = (document.getElementById('coach_name').value   || '').trim();
        const branchEl = document.getElementById('coach_branch');
        const branch = branchEl ? (branchEl.value || '') : '';

        if (!name)  return alert('Vui lòng nhập tên HLV!');
        if (!email) return alert('Vui lòng nhập email!');
        if (!pass || pass.length < 6) return alert('Mật khẩu phải ít nhất 6 ký tự!');

        const btn = document.getElementById('btnCreateCoach');
        if (btn) { btn.disabled = true; btn.textContent = 'Đang tạo...'; }
        try {
            // Bước 1: Tạo tài khoản Firebase Auth qua secondaryAuth (không ảnh hưởng phiên admin)
            const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
            const uid = userCred.user.uid;
            try { await signOut(secondaryAuth); } catch(_) {}

            // Bước 2: Ghi hồ sơ HLV vào clubs/{clubId}/coaches/{uid} — LUÔN dùng quyền admin (critical path)
            await setDoc(doc(db, 'clubs', currentClubId, 'coaches', uid), {
                email,
                displayName: name,
                role:   'coach',
                clubId: currentClubId,
                branch: branch,
                uid,
                createdAt: new Date().toISOString()
            });

            // Bước 3: Ghi users/{uid} để tăng tốc đăng nhập (optional — tùy Firestore Rules)
            try {
                await setDoc(doc(db, 'users', uid), {
                    role:   'coach',
                    clubId: currentClubId,
                    branch: branch,
                    email:  email
                });
            } catch(_permErr) {
                // Không ảnh hưởng — hệ thống sẽ tìm HLV qua clubs/coaches khi đăng nhập
                console.warn('Ghi users/{uid} thất bại (không ảnh hưởng chức năng):', _permErr.code);
            }

            const branchDisplay = branch ? (' | Cơ sở: ' + (window.getBranchNameDisplay ? window.getBranchNameDisplay(branch) : branch)) : '';
            alert('✅ Tạo tài khoản HLV thành công!\n\nTên: ' + name + '\nEmail: ' + email + '\nMật khẩu: ' + pass + branchDisplay + '\n\nHLV có thể đăng nhập ngay bây giờ.');
            document.getElementById('coach_email').value  = '';
            document.getElementById('coach_pass').value   = '';
            document.getElementById('coach_name').value   = '';
            if (branchEl) branchEl.value = '';
            window.loadCoachAccounts();
        } catch(e) {
            if (e.code === 'auth/email-already-in-use') alert('Email này đã được sử dụng bởi tài khoản khác!');
            else alert('Lỗi tạo tài khoản: ' + (e.message || e.code));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '➕ Tạo tài khoản'; }
        }
    };

    window.resetCoachPassword = async (email) => {
        if (!email) return alert('Không tìm thấy email của HLV!');
        if (!confirm('Gửi email đặt lại mật khẩu đến:\n' + email + '\n\nHLV sẽ nhận được link trong hộp thư để tự đặt mật khẩu mới.')) return;
        try {
            await sendPasswordResetEmail(auth, email);
            window.showToast('✅ Đã gửi email đặt lại mật khẩu đến: ' + email, 3500);
        } catch(e) {
            if (e.code === 'auth/user-not-found') alert('Không tìm thấy tài khoản Firebase với email: ' + email);
            else alert('Lỗi gửi email đặt lại mật khẩu: ' + (e.message || e.code));
        }
    };

    window.deleteCoachAccount = async (uid, email) => {
        if (!confirm('Xóa tài khoản HLV: ' + email + '?\nHành động này không thể hoàn tác.')) return;
        try {
            // Bước 1: Xóa khỏi clubs/coaches (critical — luôn thực hiện bằng quyền admin)
            await deleteDoc(doc(db, 'clubs', currentClubId, 'coaches', uid));
            // Bước 2: Thử xóa users/{uid} (optional — có thể bị chặn bởi Firestore Rules)
            try {
                await deleteDoc(doc(db, 'users', uid));
            } catch(_permErr) {
                console.warn('Không thể xóa users/{uid}:', _permErr.code, '— không ảnh hưởng chức năng');
            }
            window.showToast('✅ Đã xóa tài khoản HLV: ' + email, 2500);
            window.loadCoachAccounts();
        } catch(e) {
            alert('Lỗi xóa tài khoản: ' + e.message);
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // TÍNH NĂNG: GHI CHÚ BUỔI ĐIỂM DANH (HLV ghi lý do nghỉ, nhận xét)
    // Lưu vào: clubs/{clubId}/attendanceNotes/{date}_{coachId}
    // ═══════════════════════════════════════════════════════════════════

    let _sessionNoteCache = {};   // { [date]: { note, coachName, updatedAt } }
    let _currentNoteDate  = '';

    // Tải ghi chú của ngày hiện tại khi HLV chọn ngày
    window.loadSessionNote = async (date) => {
        if (!date || !currentClubId) return;
        _currentNoteDate = date;
        const auth_ = getAuth(app);
        const uid = auth_.currentUser ? auth_.currentUser.uid : '';
        const docId = date + (uid ? '_' + uid : '');
        const noteArea = document.getElementById('session_note_text');
        const noteBadge = document.getElementById('session_note_badge');
        if (!noteArea) return;
        try {
            const noteDoc = await getDoc(doc(db, 'clubs', currentClubId, 'attendanceNotes', docId));
            if (noteDoc.exists()) {
                const data = noteDoc.data();
                _sessionNoteCache[date] = data;
                noteArea.value = data.note || '';
                if (noteBadge) { noteBadge.textContent = '✏️ Đã có ghi chú'; noteBadge.style.display = 'inline-block'; }
            } else {
                _sessionNoteCache[date] = null;
                noteArea.value = '';
                if (noteBadge) noteBadge.style.display = 'none';
            }
        } catch(e) {
            noteArea.value = _sessionNoteCache[date]?.note || '';
        }
    };

    // Lưu ghi chú buổi tập vào Firestore
    window.saveSessionNote = async () => {
        const noteArea = document.getElementById('session_note_text');
        if (!noteArea || !currentClubId || !_currentNoteDate) return;
        const note = noteArea.value.trim();
        const auth_ = getAuth(app);
        const uid = auth_.currentUser ? auth_.currentUser.uid : '';
        const docId = _currentNoteDate + (uid ? '_' + uid : '');

        const saveBtn = document.getElementById('btn_save_session_note');
        // [SỬA] Đổi nhãn nút thành "Gửi báo cáo" theo yêu cầu
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Đang gửi...'; }

        try {
            if (!note) {
                // Xóa ghi chú nếu rỗng
                await deleteDoc(doc(db, 'clubs', currentClubId, 'attendanceNotes', docId));
                // Đồng thời xóa thông báo admin tương ứng (không còn cần hiện nữa)
                try { await deleteDoc(doc(db, 'clubs', currentClubId, 'adminNotifications', docId)); } catch(_) {}
                _sessionNoteCache[_currentNoteDate] = null;
                const noteBadge = document.getElementById('session_note_badge');
                if (noteBadge) noteBadge.style.display = 'none';
                window.showToast('🗑️ Đã xóa báo cáo buổi tập', 2000);
            } else {
                const payload = {
                    date:        _currentNoteDate,
                    note:        note,
                    coachId:     uid,
                    coachName:   '',
                    branch:      window.coachBranch || '',
                    updatedAt:   new Date().toISOString(),
                    clubId:      currentClubId
                };
                // Thêm tên HLV và cơ sở từ coaches collection
                try {
                    const coachDoc = await getDoc(doc(db, 'clubs', currentClubId, 'coaches', uid));
                    if (coachDoc.exists()) {
                        payload.coachName = coachDoc.data().displayName || '';
                        payload.branch    = payload.branch || coachDoc.data().branch || '';
                    }
                } catch(_) {}

                await setDoc(doc(db, 'clubs', currentClubId, 'attendanceNotes', docId), payload);
                _sessionNoteCache[_currentNoteDate] = payload;
                const noteBadge = document.getElementById('session_note_badge');
                if (noteBadge) { noteBadge.textContent = '✏️ Đã có ghi chú'; noteBadge.style.display = 'inline-block'; }
                window.showToast('✅ Đã gửi báo cáo buổi tập!', 2500);

                // ── Ghi thông báo cho Admin ──────────────────────────────────
                // Tạo/cập nhật document trong adminNotifications để admin thấy ngay
                try {
                    await setDoc(doc(db, 'clubs', currentClubId, 'adminNotifications', docId), {
                        type:        'session_note',
                        date:        _currentNoteDate,
                        coachId:     uid,
                        coachName:   payload.coachName || '',
                        branch:      payload.branch || '',
                        notePreview: note.substring(0, 160),
                        createdAt:   new Date().toISOString(),
                        readAt:      null
                    });
                } catch (_ne) { /* không chặn flow chính nếu lỗi ghi notif */ }
            }
        } catch(e) {
            window.showToast('⚠️ Lỗi lưu ghi chú: ' + (e.message || ''), 3000);
        } finally {
            // [SỬA] Khôi phục nhãn nút sau khi gửi xong
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '📤 Gửi báo cáo'; }
        }
    };

    // Xem tất cả ghi chú HLV (Admin dùng) — tải danh sách ghi chú theo tháng
    window.loadAllSessionNotes = async (month) => {
        if (!month || !currentClubId) return;
        const wrapEl = document.getElementById('all_session_notes_wrap');
        const listEl = document.getElementById('all_session_notes_list');
        if (!listEl) return;
        // Chỉ Admin/Super Admin mới thấy panel này
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') {
            if (wrapEl) wrapEl.style.display = 'none';
            return;
        }
        if (wrapEl) wrapEl.style.display = 'block';
        listEl.innerHTML = '<p style="color:#94a3b8;font-size:0.82rem;text-align:center;padding:12px;">⏳ Đang tải ghi chú...</p>';
        try {
            // [SỬA] Chỉ hiện báo cáo 7 ngày gần nhất (hôm nay + 6 ngày trước).
            // Tính ngày bắt đầu = hôm nay trừ 6 ngày.
            const todayStr = getLocalToday();
            const _d7 = new Date(todayStr + 'T00:00:00');
            _d7.setDate(_d7.getDate() - 6);
            const _d7Str = _d7.toISOString().split('T')[0];
            // Lấy khoảng giao giữa 7 ngày gần nhất và tháng đang xem
            const monthStart = month + '-01';
            const monthEnd   = month + '-31';
            const start = _d7Str > monthStart ? _d7Str : monthStart;
            const end   = todayStr < monthEnd  ? todayStr : monthEnd;

            const q = query(
                collection(db, 'clubs', currentClubId, 'attendanceNotes'),
                where('date', '>=', start), where('date', '<=', end),
                orderBy('date', 'desc'),   // [SỬA] Ngày mới nhất (hôm nay) lên đầu
                limit(100) // [3.3E] 7 days × ~14 notes/day max
            );
            const snap = await getDocs(q);
            if (snap.empty) {
                listEl.innerHTML = '<p style="color:#94a3b8;font-size:0.82rem;text-align:center;padding:16px;">Không có báo cáo buổi tập nào trong 7 ngày gần đây</p>';
                return;
            }

            // Gom nhóm theo ngày
            const byDate = {};
            snap.forEach(d => {
                const data = d.data();
                const dt = data.date || '';
                if (!byDate[dt]) byDate[dt] = [];
                byDate[dt].push(data);
            });

            let html = '';
            // [SỬA] Sắp xếp ngày giảm dần — hôm nay lên đầu
            Object.keys(byDate).sort((a, b) => b.localeCompare(a)).forEach(dt => {
                const isToday = (dt === todayStr);
                // [SỬA] Trong mỗi ngày, sắp xếp báo cáo theo cơ sở (CS1, CS2...)
                const entries = byDate[dt].slice().sort((a, b) => {
                    const ba = a.branch || 'ZZ';
                    const bb = b.branch || 'ZZ';
                    return ba.localeCompare(bb);
                });

                // Nhãn ngày — hôm nay được đánh dấu nổi bật
                const dateLabel = isToday
                    ? `📅 HÔM NAY — ${formatDate(dt)}`
                    : `📅 ${formatDate(dt)}`;
                const dateLabelStyle = isToday
                    ? 'font-size:0.72rem;font-weight:900;color:#0033A0;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;padding:4px 8px;border-radius:7px;background:#e0e7ff;display:inline-block;'
                    : 'font-size:0.72rem;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;padding-bottom:3px;border-bottom:1.5px solid #e2e8f0;display:block;';

                html += `<div style="margin-bottom:12px;">
                    <div style="${dateLabelStyle}">${dateLabel}</div>`;

                entries.forEach(data => {
                    const branchDisplay = data.branch
                        ? (window.getBranchNameDisplay ? window.getBranchNameDisplay(data.branch) : data.branch)
                        : '';
                    const branchTag = branchDisplay
                        ? `<span style="font-size:0.65rem;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:99px;padding:2px 7px;font-weight:700;">${branchDisplay}</span>`
                        : '';
                    // Nền card hôm nay nổi bật hơn ngày cũ
                    const cardBg = isToday ? '#fffbeb' : '#fff';
                    const cardBorder = isToday ? '1px solid #fde68a' : '1px solid #e2e8f0';
                    html += `<div style="background:${cardBg};border:${cardBorder};border-radius:10px;padding:10px 13px;margin-bottom:5px;">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px;">
                            <span style="font-size:0.78rem;font-weight:800;color:#334155;">👨‍🏫 ${(data.coachName || 'HLV').replace(/</g,'&lt;')}</span>
                            ${branchTag}
                        </div>
                        <div style="font-size:0.83rem;color:#334155;line-height:1.6;white-space:pre-wrap;">${(data.note || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                    </div>`;
                });
                html += '</div>';
            });
            listEl.innerHTML = html;
        } catch(e) {
            listEl.innerHTML = `<p style="color:#dc2626;font-size:0.82rem;text-align:center;padding:12px;">Lỗi tải ghi chú: ${e.message}</p>`;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN NOTIFICATION SYSTEM — Thông báo báo cáo tình hình tập luyện
    // Khi HLV lưu ghi chú buổi tập → ghi adminNotifications → Admin thấy ngay
    // ═══════════════════════════════════════════════════════════════════════

    window._pendingNotifIds   = [];
    window._notifUnsubscribe  = null;

    // Render HTML nội dung từng thông báo (dùng chung giữa snapshot & check)
    const _buildNotifItemHtml = (data) => {
        const branchDisplay = data.branch
            ? (window.getBranchNameDisplay ? window.getBranchNameDisplay(data.branch) : data.branch)
            : '';
        const branchTag = branchDisplay
            ? `<span style="font-size:0.63rem;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:99px;padding:2px 8px;font-weight:700;">${branchDisplay}</span>`
            : '';
        const dateDisplay = data.date ? data.date.split('-').reverse().join('/') : '';
        return `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:9px 11px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                <strong style="font-size:0.8rem;color:#92400e;">👨‍🏫 ${(data.coachName || 'Huấn luyện viên').replace(/</g,'&lt;')}</strong>
                ${branchTag}
                <span style="font-size:0.72rem;color:#b45309;margin-left:2px;">• Ngày ${dateDisplay}</span>
            </div>
            <div style="font-size:0.78rem;color:#78350f;line-height:1.55;white-space:pre-wrap;">${(data.notePreview || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        </div>`;
    };

    // Hiển thị/cập nhật banner với dữ liệu từ snapshot hoặc getDocs
    const _renderNotifBanner = (docs) => {
        const bannerEl = document.getElementById('admin_notif_banner');
        const listEl   = document.getElementById('admin_notif_list');
        if (!bannerEl || !listEl) return;
        if (!docs || docs.length === 0) {
            bannerEl.style.display = 'none';
            window._pendingNotifIds = [];
            return;
        }
        window._pendingNotifIds = [];
        let html = '';
        docs.forEach(({ id, data }) => {
            window._pendingNotifIds.push(id);
            html += _buildNotifItemHtml(data);
        });
        listEl.innerHTML = html;
        bannerEl.style.display = 'block';
    };

    // Kiểm tra thông báo chưa đọc khi Admin mở trang (getDocs — 1 lần)
    window.checkAdminNotifications = async () => {
        if (!currentClubId || (window.userRole !== 'admin' && window.userRole !== 'super_admin')) return;
        try {
            const q    = query(
                collection(db, 'clubs', currentClubId, 'adminNotifications'),
                where('readAt', '==', null),
                orderBy('createdAt', 'desc'),
                limit(50) // [3.3E] max 50 unread admin notifications
            );
            const snap = await getDocs(q);
            const docs = [];
            snap.forEach(d => docs.push({ id: d.id, data: d.data() }));
            _renderNotifBanner(docs);
        } catch (_e) { /* im lặng — không làm gián đoạn giao diện */ }
    };

    // Lắng nghe real-time: admin đang online → thấy báo cáo mới của HLV ngay lập tức
    window.setupNotifListener = () => {
        if (!currentClubId || (window.userRole !== 'admin' && window.userRole !== 'super_admin')) return;
        const _notifKey = 'global:notif:' + currentClubId;
        // [Phase 3.6C] Remove old listener trước khi tạo mới (re-subscribable pattern).
        // Sau khi remove, safeRegisterSnapshot thấy key không còn → sẽ proceed tạo listener mới.
        if (window.removeListener) window.removeListener(_notifKey, 'notif-reinit');
        if (window._notifUnsubscribe) { try { window._notifUnsubscribe(); } catch(_) {} window._notifUnsubscribe = null; }
        try {
            const q = query(
                collection(db, 'clubs', currentClubId, 'adminNotifications'),
                where('readAt', '==', null),
                orderBy('createdAt', 'desc')
            );
            // [Phase 3.6C] safeRegisterSnapshot — key đã removed ở trên nên sẽ proceed
            if (window.safeRegisterSnapshot) {
                window.safeRegisterSnapshot(_notifKey, () => {
                    const _unsub = onSnapshot(q, (snap) => {
                        if (window.markListenerSnapshot) window.markListenerSnapshot(_notifKey);
                        const docs = [];
                        snap.forEach(d => docs.push({ id: d.id, data: d.data() }));
                        _renderNotifBanner(docs);
                    }, (_err) => { /* lỗi listener — im lặng */ });
                    window._notifUnsubscribe = _unsub; // bridge: legacy logout cleanup (line ~2783)
                    return _unsub;
                }, { owner: 'notif', scope: 'global', clubId: currentClubId, reason: 'setup-notif-listener' });
            } else {
                // Fallback Phase 3.6
                window._notifUnsubscribe = onSnapshot(q, (snap) => {
                    const docs = [];
                    snap.forEach(d => docs.push({ id: d.id, data: d.data() }));
                    _renderNotifBanner(docs);
                }, (_err) => {});
                if (window.registerListener) window.registerListener(_notifKey, window._notifUnsubscribe, { owner: 'notif', scope: 'global', reason: 'setup-notif-listener' });
            }
        } catch (_e) {}
    };

    // Admin bấm "Đã xem" → đánh dấu tất cả là đã đọc trong Firestore
    window.dismissAdminNotifications = async () => {
        const bannerEl = document.getElementById('admin_notif_banner');
        if (bannerEl) bannerEl.style.display = 'none';   // ẩn ngay — UX nhanh
        const ids = (window._pendingNotifIds || []).slice();
        window._pendingNotifIds = [];
        if (!ids.length || !currentClubId) return;
        try {
            const batch = writeBatch(db);
            const now   = new Date().toISOString();
            ids.forEach(id => {
                batch.update(doc(db, 'clubs', currentClubId, 'adminNotifications', id), { readAt: now });
            });
            await batch.commit();
        } catch (_e) { /* không cần báo lỗi — chỉ là đánh dấu đã đọc */ }
    };

    // ── MIGRATE: Tạo users/{uid} cho tài khoản HLV cũ không có users doc ──────
    window.migrateCoachAccounts = async () => {
        if (window.userRole !== 'admin' && window.userRole !== 'super_admin') {
            return alert('Chỉ Admin mới có quyền thực hiện chức năng này!');
        }
        const btn = document.getElementById('btnMigrateCoaches');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang xử lý...'; }
        try {
            const coachesRef = collection(db, 'clubs', currentClubId, 'coaches');
            const coachesSnap = await getDocs(query(coachesRef, limit(200))); // [3.3E] limit: coaches list
            if (coachesSnap.empty) {
                if (btn) { btn.disabled = false; btn.textContent = '🔄 Đồng bộ tài khoản HLV cũ'; }
                return alert('Không có tài khoản HLV nào trong hệ thống.');
            }
            let fixed = 0;
            let skipped = 0;
            for (const coachDoc of coachesSnap.docs) {
                const uid  = coachDoc.id;
                const data = coachDoc.data();
                // Bước 1: Đảm bảo clubs/coaches/{uid} có đầy đủ các trường cần thiết
                const needsFix = !data.uid || !data.email || !data.clubId || !data.role;
                if (needsFix) {
                    try {
                        await setDoc(doc(db, 'clubs', currentClubId, 'coaches', uid), {
                            uid,
                            role:   'coach',
                            clubId: currentClubId,
                            branch: data.branch || '',
                            email:  data.email  || '',
                            displayName: data.displayName || data.email || '',
                            createdAt: data.createdAt || new Date().toISOString()
                        }, { merge: true });
                        fixed++;
                    } catch(_fixErr) {
                        console.warn('Không thể cập nhật coaches doc cho', uid, ':', _fixErr.message);
                    }
                } else {
                    skipped++;
                }
                // Bước 2: Thử ghi users/{uid} (optional — có thể bị chặn bởi Firestore Rules)
                try {
                    const uSnap = await getDoc(doc(db, 'users', uid));
                    if (!uSnap.exists()) {
                        await setDoc(doc(db, 'users', uid), {
                            role:   'coach',
                            clubId: currentClubId,
                            branch: data.branch || '',
                            email:  data.email  || ''
                        });
                    }
                } catch(_permErr) {
                    // permission-denied là bình thường — hệ thống vẫn tìm được HLV qua clubs/coaches
                    if (_permErr.code !== 'permission-denied') {
                        console.warn('users/{uid} write failed for', uid, ':', _permErr.code);
                    }
                }
            }
            if (btn) { btn.disabled = false; btn.textContent = '🔄 Đồng bộ tài khoản HLV cũ'; }
            alert(
                `✅ Đồng bộ hoàn tất!\n\n`
                + `• Đã cập nhật hồ sơ HLV: ${fixed} tài khoản\n`
                + `• Đã đầy đủ (bỏ qua): ${skipped} tài khoản\n\n`
                + 'Tất cả HLV có thể đăng nhập ngay bây giờ.'
            );
        } catch(e) {
            if (btn) { btn.disabled = false; btn.textContent = '🔄 Đồng bộ tài khoản HLV cũ'; }
            alert('Lỗi đồng bộ: ' + (e.message || e));
        }
    };

    // Hook vào renderAttendanceList để tự động tải ghi chú khi HLV đổi ngày
    const _origRenderAttendanceList = window.renderAttendanceList;
    window.renderAttendanceList = async () => {
        await _origRenderAttendanceList();
        const dateEl = document.getElementById('att_date');
        if (dateEl && dateEl.value && (window.userRole === 'coach' || window.userRole === 'admin')) {
            window.loadSessionNote(dateEl.value);
        }
    };



    // ═══════════════════════════════════════════════════════════════
    // MOBILE MENU SHEET — openMobileMenu / closeMobileMenu
    // Được gọi từ .mhb-menu-btn (header mobile) và nút X bên trong sheet
    // CSS: #mobileMenuSheet.open { display: flex }
    // ═══════════════════════════════════════════════════════════════
    window.openMobileMenu = () => {
        const sheet = document.getElementById('mobileMenuSheet');
        if (!sheet) return;
        // Hiển thị nút Admin khi người dùng là admin / super_admin
        const adminBtn = document.getElementById('mmsAdminBtn');
        if (adminBtn) {
            adminBtn.style.display =
                (window.userRole === 'admin' || window.userRole === 'super_admin') ? 'block' : 'none';
        }
        sheet.classList.add('open');
    };

    window.closeMobileMenu = () => {
        const sheet = document.getElementById('mobileMenuSheet');
        if (sheet) sheet.classList.remove('open');
    };

    // ════════════════════════════════════════════════════════════════
    // Phase 4.0B-4D: DATA HYDRATION DIAGNOSTICS GLOBALS
    // Chỉ đọc — KHÔNG ghi Firestore, KHÔNG log PII.
    // ════════════════════════════════════════════════════════════════

    /**
     * printDataHydrationStatus() — Tóm tắt số lượng doc đã load vào store.
     * Không log tên/SĐT. Chỉ log count/status.
     */
    window.printDataHydrationStatus = function printDataHydrationStatus() {
        const profiles = window.__store && window.__store.profiles ? window.__store.profiles : {};
        const tx       = window.__store && window.__store.transactions ? window.__store.transactions : [];
        const inv      = window.__store && window.__store.inventory    ? window.__store.inventory    : [];
        const m        = window.__dataHydrationMetrics || {};

        const result = {
            clubId:                  window.__store && (window.__store.clubId || window.__store.currentClubId) || window.currentClubId || '',
            appContextReady:         !!(window.__appContextReadyState && window.__appContextReadyState.ready),
            profilesDocCount:        m.profilesDocCount         != null ? m.profilesDocCount         : null,
            transactionsDocCount:    m.transactionsDocCount     != null ? m.transactionsDocCount     : null,
            inventoryDocCount:       m.inventoryDocCount        != null ? m.inventoryDocCount        : null,
            storeProfilesCount:      Object.keys(profiles).length,
            storeTransactionsCount:  Array.isArray(tx)  ? tx.length  : 0,
            storeInventoryCount:     Array.isArray(inv) ? inv.length : 0,
            settingsLoaded:          !!m.settingsLoaded,
            clubLoaded:              !!m.clubLoaded,
            lastReason:              m.lastReason || ''
        };

        console.table(result);
        return result;
    };

    /**
     * printTabDataStatus() — Cho biết từng tab có đủ dữ liệu để render không.
     * Không log tên/SĐT. Chỉ log count/flag.
     */
    window.printTabDataStatus = function printTabDataStatus() {
        const profiles = window.__store && window.__store.profiles ? window.__store.profiles : {};
        const tx       = window.__store && window.__store.transactions ? window.__store.transactions : [];
        const inv      = window.__store && window.__store.inventory    ? window.__store.inventory    : [];

        const selectedMonth =
            (document.getElementById('filterMonth')  && document.getElementById('filterMonth').value)  ||
            (document.getElementById('monthFilter')   && document.getElementById('monthFilter').value)  ||
            '';

        const txInMonth = Array.isArray(tx)
            ? tx.filter(function(t) {
                return !selectedMonth ||
                    t.txMonth === selectedMonth ||
                    (t.date && String(t.date).startsWith(selectedMonth));
              }).length
            : 0;

        const result = {
            currentTab:                  window.currentTab || (window.__store && window.__store.currentTab) || '',
            selectedMonth,
            profilesCount:               Object.keys(profiles).length,
            transactionsCount:           Array.isArray(tx)  ? tx.length  : 0,
            transactionsInSelectedMonth: txInMonth,
            inventoryCount:              Array.isArray(inv) ? inv.length : 0,
            tuitionTabCanRender:         Object.keys(profiles).length > 0 || txInMonth > 0,
            debtTabCanRender:            Object.keys(profiles).length > 0,
            inventoryTabCanRender:       Array.isArray(inv) && inv.length > 0,
            dashboardCanRender:          Object.keys(profiles).length > 0 || (Array.isArray(tx) && tx.length > 0) || (Array.isArray(inv) && inv.length > 0)
        };

        console.table(result);
        return result;
    };

    /**
     * printFirestorePathStatus() — Phase 4.0B-4E: kiểm tra cả primary + legacy path.
     * Chỉ limit(1) — không log data, không ghi Firestore.
     */
    window.printFirestorePathStatus = async function printFirestorePathStatus() {
        const _db     = db;
        const _clubId = window.__store && (window.__store.clubId || window.__store.currentClubId) || window.currentClubId || '';

        if (!_db || !_clubId) {
            console.warn('[printFirestorePathStatus] db hoặc clubId chưa sẵn sàng.', { hasDb: !!_db, clubId: _clubId });
            return null;
        }

        async function _hasDoc(path) {
            try {
                const parts  = path.split('/');
                const ref    = collection(_db, ...parts);
                const snap   = await getDocs(query(ref, limit(1)));
                return snap && snap.size > 0;
            } catch(e) {
                if (e && e.code === 'permission-denied') return 'permission-denied';
                return 'error: ' + (e && e.message ? e.message.slice(0, 60) : 'unknown');
            }
        }

        console.log('[printFirestorePathStatus] Đang kiểm tra Firestore paths (limit 1)...');

        const [pProf, pTx, pInv, lProf, lTx, lInv] = await Promise.all([
            _hasDoc('clubs/' + _clubId + '/profiles'),
            _hasDoc('clubs/' + _clubId + '/transactions'),
            _hasDoc('clubs/' + _clubId + '/inventory'),
            _hasDoc('tst_profiles'),
            _hasDoc('tst_transactions'),
            _hasDoc('tst_inventory')
        ]);

        const primaryHasAny = pProf === true || pTx === true || pInv === true;
        const legacyHasAny  = lProf === true || lTx === true || lInv === true;
        let recommendation;
        if (primaryHasAny)      recommendation = 'primary — dùng clubs/' + _clubId;
        else if (legacyHasAny)  recommendation = 'legacy-root — gọi window.activateLegacyRootFallback()';
        else                    recommendation = 'empty — kiểm tra clubId hoặc nhập dữ liệu';

        const result = {
            clubId:      _clubId,
            primary:     { profilesHasDocs: pProf, transactionsHasDocs: pTx, inventoryHasDocs: pInv },
            legacy:      { profilesHasDocs: lProf, transactionsHasDocs: lTx, inventoryHasDocs: lInv },
            recommendation
        };

        console.table({ clubId: _clubId, recommendation });
        console.group('[printFirestorePathStatus] Primary path: clubs/' + _clubId);
        console.table(result.primary);
        console.groupEnd();
        console.group('[printFirestorePathStatus] Legacy root collections');
        console.table(result.legacy);
        console.groupEnd();
        console.log('[printFirestorePathStatus] ✅ Hoàn thành (chỉ kiểm tra, không ghi data).');
        return result;
    };

    // ════════════════════════════════════════════════════════════════
    // Phase 4.0B-4E: DATA SOURCE DECISION + RUNTIME RECOVERY
    // Chỉ đọc — KHÔNG ghi Firestore, KHÔNG migration, KHÔNG log PII.
    // ════════════════════════════════════════════════════════════════

    window.__firestoreDataSourceMetrics = window.__firestoreDataSourceMetrics || {
        activeDataSource: null,
        fallbackUsed:     false,
        fallbackReason:   '',
        source:           '',
        reason:           '',
        checkedAt:        0
    };

    /**
     * resolveActiveDataSource() — Phase 4.0B-4E Phase 2.
     * Xác định nguồn dữ liệu: primary / legacy-root / empty / permission-error / unknown.
     * Chỉ limit(1). Không ghi Firestore. Không log PII.
     */
    window.resolveActiveDataSource = async function resolveActiveDataSource() {
        const _db     = db;
        const _clubId = window.__store && (window.__store.clubId || window.__store.currentClubId) || window.currentClubId || '';

        if (!_db || !_clubId) {
            const result = {
                clubId: _clubId,
                source: 'unknown',
                primary: { profilesHasDocs: null, transactionsHasDocs: null, inventoryHasDocs: null },
                legacy:  { profilesHasDocs: null, transactionsHasDocs: null, inventoryHasDocs: null },
                reason:  'db hoặc clubId chưa sẵn sàng',
                safeToRender: false
            };
            console.warn('[resolveActiveDataSource]', result.reason);
            return result;
        }

        async function _hasDoc(path) {
            try {
                const parts = path.split('/');
                const ref   = collection(_db, ...parts);
                const snap  = await getDocs(query(ref, limit(1)));
                return snap.size > 0;
            } catch(e) {
                if (e && e.code === 'permission-denied') return 'permission-denied';
                return false;
            }
        }

        const [pProf, pTx, pInv, lProf, lTx, lInv] = await Promise.all([
            _hasDoc('clubs/' + _clubId + '/profiles'),
            _hasDoc('clubs/' + _clubId + '/transactions'),
            _hasDoc('clubs/' + _clubId + '/inventory'),
            _hasDoc('tst_profiles'),
            _hasDoc('tst_transactions'),
            _hasDoc('tst_inventory')
        ]);

        const primary = { profilesHasDocs: pProf, transactionsHasDocs: pTx, inventoryHasDocs: pInv };
        const legacy  = { profilesHasDocs: lProf, transactionsHasDocs: lTx, inventoryHasDocs: lInv };

        const permDenied   = [pProf, pTx, pInv].some(v => v === 'permission-denied');
        const primaryHas   = pProf === true || pTx === true || pInv === true;
        const legacyHas    = lProf === true || lTx === true || lInv === true;

        let source, reason, safeToRender;
        if (permDenied) {
            source = 'permission-error';
            reason = 'Firestore Rules denied read — kiểm tra firestore.rules (KHÔNG mở public)';
            safeToRender = false;
        } else if (primaryHas) {
            source = 'primary';
            reason = 'Primary path clubs/' + _clubId + ' có dữ liệu';
            safeToRender = true;
        } else if (legacyHas) {
            source = 'legacy-root';
            reason = 'Primary path rỗng — legacy root collections có dữ liệu. Gọi window.activateLegacyRootFallback() để bật.';
            safeToRender = true;
        } else {
            source = 'empty';
            reason = 'Cả primary lẫn legacy đều rỗng — kiểm tra clubId hoặc nhập dữ liệu';
            safeToRender = false;
        }

        window.__firestoreDataSourceMetrics.source    = source;
        window.__firestoreDataSourceMetrics.reason    = reason;
        window.__firestoreDataSourceMetrics.checkedAt = Date.now();

        if (source === 'primary') {
            window.__store && (window.__store.activeDataSource = 'primary');
            window.__firestoreDataSourceMetrics.activeDataSource = 'primary';
            window.__firestoreDataSourceMetrics.fallbackUsed     = false;
        }

        const result = { clubId: _clubId, source, primary, legacy, reason, safeToRender };

        console.group('[resolveActiveDataSource] source=' + source);
        console.table({ clubId: _clubId, source, safeToRender, reason });
        console.table(primary);
        console.table(legacy);
        console.groupEnd();

        if (source === 'legacy-root') {
            console.warn('[resolveActiveDataSource] 🔶 Legacy-root có dữ liệu. Gọi: await window.activateLegacyRootFallback()');
        } else if (source === 'empty') {
            console.warn('[resolveActiveDataSource] ❌ Không tìm thấy dữ liệu. clubId:', _clubId);
        } else if (source === 'permission-error') {
            console.error('[resolveActiveDataSource] ❌ Permission denied — không mở Firestore Rules public');
        }

        return result;
    };

    // ── Phase 4.0B-4F — Phase 4: bumpRuntimeDataVersion helper ───────────────
    function bumpRuntimeDataVersion(reason) {
        if (!window.__store) return;
        window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
        window.__store._lastDataVersionReason = reason || '';
    }

    /**
     * activateLegacyRootFallback() — Phase 4.0B-4F (updated from 4E).
     * Read-only. Không ghi Firestore. Không migration.
     * Sync vào: window.__store + closure allProfiles/allTransactions/allInventory
     *           + studentProfileStore + inventoryStore nếu có.
     * Bump dataVersion + invalidate tabs + scheduleRender.
     */
    window.activateLegacyRootFallback = async function activateLegacyRootFallback(reason) {
        const _db = db;
        if (!_db) {
            console.warn('[LegacyFallback] db chưa sẵn sàng — login trước.');
            return false;
        }

        reason = reason || 'manual';
        console.warn('[LegacyFallback] 🔶 Bật legacy-root read-only fallback. reason=' + reason);
        console.warn('[LegacyFallback] Đây là chế độ tạm trước khi migration chính thức. Không ghi Firestore.');

        if (window.__store) window.__store.activeDataSource = 'legacy-root';
        window.__firestoreDataSourceMetrics.activeDataSource = 'legacy-root';
        window.__firestoreDataSourceMetrics.fallbackUsed     = true;
        window.__firestoreDataSourceMetrics.fallbackReason   = 'primary-empty-legacy-root-available';

        async function _readLegacy(colName) {
            try {
                const ref  = collection(_db, colName);
                const _legacyLim = ((window.__scaleConfig || {}).legacyFallbackLimit) || 1200; // [4J-8] bumped from 500 → 1200 for 1000-student clubs
                const snap = await getDocs(query(ref, limit(_legacyLim)));
                return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            } catch(e) {
                console.warn('[LegacyFallback] Không đọc được ' + colName + ':', e && e.message ? e.message.slice(0, 80) : '');
                return null;
            }
        }

        const [legProfiles, legTx, legInv] = await Promise.all([
            _readLegacy('tst_profiles'),
            _readLegacy('tst_transactions'),
            _readLegacy('tst_inventory')
        ]);

        // ── Phase 3: Sync profiles → window.__store + closure + studentProfileStore
        if (legProfiles && legProfiles.length > 0) {
            const profileMap = {};
            legProfiles.forEach(function(doc) {
                const key = String(doc.name || doc.id || '').trim();
                if (key) profileMap[key] = doc;
            });

            // Phase 4.0B-4F: Sync vào closure (app.js IIFE scope) — phase 4E thiếu phần này
            allProfiles = profileMap;

            // Sync vào window.__store
            if (window.__store) window.__store.profiles = profileMap;

            // Sync vào studentProfileStore nếu có
            if (typeof window.syncProfilesToStudentStore === 'function') {
                window.syncProfilesToStudentStore(profileMap, 'legacy-root-fallback');
            }

            // Không log tên/SĐT/CCCD — chỉ log count
            console.info('[LegacyFallback] Profiles synced (count):', Object.keys(profileMap).length);
        }

        // ── Phase 3: Sync transactions → window.__store + closure
        if (legTx !== null) {
            // Phase 4.0B-4F: Sync vào closure
            allTransactions = Array.isArray(legTx) ? legTx : [];
            // Sync vào window.__store
            if (window.__store) window.__store.transactions = allTransactions;
            console.info('[LegacyFallback] Transactions synced (count):', allTransactions.length);
        }

        // ── Phase 3: Sync inventory → window.__store + closure + inventoryStore
        if (legInv !== null) {
            // Phase 4.0B-4F: Sync vào closure
            allInventory = Array.isArray(legInv) ? legInv : [];
            // Sync vào window.__store
            if (window.__store) window.__store.inventory = allInventory;
            // Sync vào inventoryStore nếu có
            if (window.__inventoryStore && typeof window.__inventoryStore.setAllInventory === 'function') {
                window.__inventoryStore.setAllInventory(allInventory, 'legacy-root-fallback');
            }
            console.info('[LegacyFallback] Inventory synced (count):', allInventory.length);
        }

        // ── Phase 4: Bump dataVersion + invalidate + render
        bumpRuntimeDataVersion('legacy-root-fallback');

        if (window.invalidateStudents)   window.invalidateStudents('legacy-root-fallback');
        if (window.invalidateFinance)    window.invalidateFinance('legacy-root-fallback');
        if (window.invalidateInventory)  window.invalidateInventory('legacy-root-fallback');
        if (window.invalidateDashboard)  window.invalidateDashboard('legacy-root-fallback');
        if (window.invalidateCurrentTab) window.invalidateCurrentTab('legacy-root-fallback');

        // scheduleRender → renderApp fallback (tối đa 1 lần)
        if (typeof window.scheduleRender === 'function') {
            window.scheduleRender('legacy-root-fallback');
        } else {
            setTimeout(function() {
                try { if (typeof window.renderApp === 'function') window.renderApp(); } catch(_e) {}
            }, 100);
        }

        const _profMapCount = legProfiles ? Object.keys(
            (function() { const m = {}; (legProfiles||[]).forEach(function(d){ const k=String(d.name||d.id||'').trim(); if(k)m[k]=1; }); return m; })()
        ).length : 0;

        const result = {
            activeDataSource:  'legacy-root',
            profilesCount:     _profMapCount,
            transactionsCount: legTx  ? (Array.isArray(legTx)  ? legTx.length  : 0) : 0,
            inventoryCount:    legInv ? (Array.isArray(legInv) ? legInv.length : 0) : 0,
            fallbackReason:    'primary-empty-legacy-root-available',
            calledBy:          reason
        };
        console.info('[LegacyFallback] ✅ Legacy fallback activated:', result);
        return result;
    }

    /**
     * printPilotTabReadiness() — Phase 4.0B-4E Phase 6.
     * Cho biết trạng thái sẵn sàng từng tab cho pilot launch. Không log PII.
     */
    window.printPilotTabReadiness = function printPilotTabReadiness() {
        const profiles = window.__store && window.__store.profiles ? window.__store.profiles : {};
        const tx       = window.__store && window.__store.transactions ? window.__store.transactions : [];
        const inv      = window.__store && window.__store.inventory    ? window.__store.inventory    : [];
        const metrics  = window.__firestoreDataSourceMetrics || {};

        const activeProfiles = Object.values(profiles).filter(function(p) {
            return p && p.status !== 'quit' && p.status !== 'retired';
        });
        const quitProfiles   = Object.values(profiles).filter(function(p) {
            return p && (p.status === 'quit' || p.status === 'retired');
        });

        const warnings = [];
        if (!metrics.activeDataSource) warnings.push('activeDataSource chưa xác định — gọi resolveActiveDataSource() trước');
        if (Object.keys(profiles).length === 0) warnings.push('Profiles rỗng — kiểm tra Firestore path hoặc bật legacy fallback');
        if (Array.isArray(tx) && tx.length === 0) warnings.push('Transactions rỗng');
        if (Array.isArray(inv) && inv.length === 0) warnings.push('Inventory rỗng');

        const result = {
            activeDataSource:   metrics.activeDataSource  || 'unknown',
            profilesCount:      Object.keys(profiles).length,
            transactionsCount:  Array.isArray(tx)  ? tx.length  : 0,
            inventoryCount:     Array.isArray(inv) ? inv.length : 0,
            tuitionReady:       Object.keys(profiles).length > 0 && Array.isArray(tx),
            debtReady:          Object.keys(profiles).length > 0,
            activeStudentsReady: activeProfiles.length > 0,
            quitStudentsReady:  quitProfiles.length > 0 || Object.keys(profiles).length > 0,
            inventoryReady:     Array.isArray(inv) && inv.length > 0,
            dashboardReady:     Object.keys(profiles).length > 0 || (Array.isArray(tx) && tx.length > 0),
            warnings:           warnings.length > 0 ? warnings.join(' | ') : 'none'
        };

        console.table(result);
        if (warnings.length) {
            warnings.forEach(function(w) { console.warn('[PilotReadiness] ⚠️', w); });
        } else {
            console.info('[PilotReadiness] ✅ Tất cả tabs sẵn sàng cho pilot!');
        }
        return result;
    };

    // ════════════════════════════════════════════════════════════════
    // End Phase 4.0B-4D/4E Diagnostics + Recovery Globals
    // ════════════════════════════════════════════════════════════════

    // ════════════════════════════════════════════════════════════════
    // Phase 4.0B-4F — RUNTIME RECOVERY + PILOT LAUNCH STATUS
    // ════════════════════════════════════════════════════════════════

    /**
     * runRuntimeDataRecovery() — Phase 4.0B-4F Phase 2.
     * Tự động phát hiện data source sau login.
     * Nếu source = legacy-root → tự kích hoạt activateLegacyRootFallback.
     * Chạy tối đa 1 lần mỗi login session. Reset khi logout.
     */
    window.runRuntimeDataRecovery = async function runRuntimeDataRecovery(reason) {
        reason = reason || 'manual';
        const state = window.__runtimeRecoveryState;

        if (state.running) {
            console.debug('[RuntimeRecovery] Đang chạy — bỏ qua. reason=' + reason);
            return;
        }
        if (state.completed) {
            console.debug('[RuntimeRecovery] Đã hoàn thành rồi — bỏ qua. reason=' + reason);
            return;
        }

        state.running   = true;
        state.checked   = true;
        state.checkedAt = Date.now();

        try {
            const src = await window.resolveActiveDataSource?.();

            state.activeDataSource = src ? (src.source || 'unknown') : 'unknown';
            state.reason           = src ? (src.reason || '')        : '';

            if (src && src.source === 'legacy-root') {
                await window.activateLegacyRootFallback?.('auto-runtime-recovery');
                state.recoveryUsed = true;
                console.info('[RuntimeRecovery] ✅ Legacy fallback activated automatically.');
            } else if (src && src.source === 'primary') {
                console.info('[RuntimeRecovery] ✅ Primary data source — không cần fallback.');
            } else {
                console.warn('[RuntimeRecovery] source=' + state.activeDataSource + ' reason=' + state.reason);
            }

            state.completed   = true;
            state.completedAt = Date.now();

        } catch (err) {
            state.error = (err && err.message) ? err.message.slice(0, 200) : String(err).slice(0, 200);
            console.warn('[RuntimeRecovery] failed:', state.error);
        } finally {
            state.running = false;
        }
    };

    /**
     * printPilotLaunchStatus() — Phase 4.0B-4F Phase 6.
     * Tổng hợp trạng thái sẵn sàng toàn hệ thống. Không log PII.
     */
    window.printPilotLaunchStatus = function printPilotLaunchStatus() {
        let tab = null;
        try {
            if (typeof window.printPilotTabReadiness === 'function') tab = window.printPilotTabReadiness();
        } catch(_e) {}

        let health = null;
        try {
            if (typeof window.getRuntimeHealthStatus === 'function') health = window.getRuntimeHealthStatus({ phase: 'all' });
        } catch(_e) {}

        const rr = window.__runtimeRecoveryState || {};
        const activeDataSource =
            (window.__store && window.__store.activeDataSource)
            || (window.__firestoreDataSourceMetrics && window.__firestoreDataSourceMetrics.activeDataSource)
            || 'unknown';

        const readyForOneClubPilot = !!(tab && tab.tuitionReady && tab.debtReady);

        const pilotBlockers = [];
        if (!readyForOneClubPilot)
            pilotBlockers.push('readyForOneClubPilot = false');
        if (activeDataSource !== 'primary' && activeDataSource !== 'legacy-root')
            pilotBlockers.push('activeDataSource = ' + activeDataSource);
        if (!tab || !(tab.profilesCount > 0))
            pilotBlockers.push('profilesCount = 0');
        if (!tab || !tab.tuitionReady)
            pilotBlockers.push('tuitionReady = false');
        if (!tab || !tab.debtReady)
            pilotBlockers.push('debtReady = false');
        if (!tab || !tab.dashboardReady)
            pilotBlockers.push('dashboardReady = false');
        if (!rr.completed && activeDataSource !== 'primary')
            pilotBlockers.push('runtimeRecovery not completed and activeDataSource != primary');
        if (rr.error)
            pilotBlockers.push('runtimeRecovery.error exists');
        if (health && health.criticalMissing && health.criticalMissing.length > 0)
            pilotBlockers.push('critical runtime health missing');

        const result = {
            runtimeRecovery:   rr,
            activeDataSource,
            profilesCount:     (tab && tab.profilesCount)     || 0,
            transactionsCount: (tab && tab.transactionsCount) || 0,
            inventoryCount:    (tab && tab.inventoryCount)    || 0,
            tuitionReady:      !!(tab && tab.tuitionReady),
            debtReady:         !!(tab && tab.debtReady),
            inventoryReady:    !!(tab && tab.inventoryReady),
            dashboardReady:    !!(tab && tab.dashboardReady),
            readyForInternalTest:
                !!((tab && tab.profilesCount > 0) || (tab && tab.transactionsCount > 0)),
            readyForOneClubPilot,
            readyForTenClubPilot: pilotBlockers.length === 0,
            pilotBlockers
        };

        console.table(result);
        return result;
    };

    /**
     * printTenClubPilotReadiness() — Phase 4.0B-4G.
     * Tổng hợp toàn bộ điều kiện sẵn sàng cho 10-CLB pilot.
     * Không log PII.
     */
    window.printTenClubPilotReadiness = function printTenClubPilotReadiness() {
        let launch = null;
        try {
            if (typeof window.printPilotLaunchStatus === 'function') launch = window.printPilotLaunchStatus();
        } catch(_e) {}

        let health = null;
        try {
            if (typeof window.getRuntimeHealthStatus === 'function') health = window.getRuntimeHealthStatus({ phase: 'all' });
        } catch(_e) {}

        let hydration = null;
        try {
            if (typeof window.printDataHydrationStatus === 'function') hydration = window.printDataHydrationStatus();
        } catch(_e) {}

        let tab = null;
        try {
            if (typeof window.printPilotTabReadiness === 'function') tab = window.printPilotTabReadiness();
        } catch(_e) {}

        const blockers = [];

        if (!launch || !launch.readyForOneClubPilot)
            blockers.push('Not ready for 1-CLB pilot yet');
        if (!tab || !(tab.profilesCount > 0))
            blockers.push('No profiles loaded');
        if (!tab || !tab.tuitionReady)
            blockers.push('Tuition tab not ready');
        if (!tab || !tab.debtReady)
            blockers.push('Debt tab not ready');
        if (!tab || !tab.dashboardReady)
            blockers.push('Dashboard not ready');
        if (health && health.criticalMissing && health.criticalMissing.length > 0)
            blockers.push('Runtime critical checks missing: ' + health.criticalMissing.join(', '));
        if (window.__runtimeRecoveryState && window.__runtimeRecoveryState.error)
            blockers.push('Runtime recovery error: ' + String(window.__runtimeRecoveryState.error).slice(0, 100));

        const result = {
            activeDataSource:      launch ? launch.activeDataSource      : 'unknown',
            profilesCount:         tab    ? (tab.profilesCount    || 0)  : 0,
            transactionsCount:     tab    ? (tab.transactionsCount || 0) : 0,
            inventoryCount:        tab    ? (tab.inventoryCount   || 0)  : 0,
            readyForOneClubPilot:  !!(launch && launch.readyForOneClubPilot),
            readyForTenClubPilot:  blockers.length === 0,
            blockers
        };

        console.table(result);
        return result;
    };

    // ── End Phase 4.0B-4G ─────────────────────────────────────────────────────

    // ════════════════════════════════════════════════════════════════════════════
    // PHASE 4.0B-4H — Browser Runtime Verification + 1-Club Pilot Launch Gate
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * generatePilotLaunchSnapshot() — Phase 4.0B-4H.
     * Gom kết quả tất cả diagnostic functions thành một snapshot duy nhất.
     * Dùng để chụp trạng thái đầy đủ tại một thời điểm. Không log PII.
     *
     * Cách dùng:
     *   const snap = await window.generatePilotLaunchSnapshot();
     *   console.log(JSON.stringify(snap, null, 2));
     */
    window.generatePilotLaunchSnapshot = async function generatePilotLaunchSnapshot() {
        const timestamp = new Date().toISOString();

        let dataSource = null;
        try {
            if (typeof window.resolveActiveDataSource === 'function') {
                dataSource = await window.resolveActiveDataSource();
            }
        } catch(e) {
            dataSource = { error: String(e).slice(0, 200) };
        }

        let hydration = null;
        try {
            if (typeof window.printDataHydrationStatus === 'function') hydration = window.printDataHydrationStatus();
        } catch(_e) {}

        let tab = null;
        try {
            if (typeof window.printPilotTabReadiness === 'function') tab = window.printPilotTabReadiness();
        } catch(_e) {}

        let launch = null;
        try {
            if (typeof window.printPilotLaunchStatus === 'function') launch = window.printPilotLaunchStatus();
        } catch(_e) {}

        let tenClub = null;
        try {
            if (typeof window.printTenClubPilotReadiness === 'function') tenClub = window.printTenClubPilotReadiness();
        } catch(_e) {}

        const snapshot = {
            snapshotAt:               timestamp,
            activeDataSource:         dataSource,
            dataHydration:            hydration,
            tabReadiness:             tab,
            pilotLaunchStatus:        launch,
            tenClubPilotReadiness:    tenClub,
            runtimeRecoveryState:     window.__runtimeRecoveryState   || null,
            firestoreDataSourceMetrics: window.__firestoreDataSourceMetrics || null
        };

        console.group('[generatePilotLaunchSnapshot] Pilot Launch Snapshot — ' + timestamp);
        console.log('activeDataSource:', snapshot.activeDataSource);
        console.log('readyForOneClubPilot:', launch && launch.readyForOneClubPilot);
        console.log('readyForTenClubPilot:', launch && launch.readyForTenClubPilot);
        console.log('pilotBlockers:', (launch && launch.pilotBlockers) || []);
        console.groupEnd();

        return snapshot;
    };

    /**
     * printOneClubPilotGate() — Phase 4.0B-4H.
     * Tổng hợp go/no-go gate cho 1-CLB pilot. Không log PII.
     *
     * Cách dùng:
     *   const gate = window.printOneClubPilotGate();
     *   // gate.readyForOneClubPilot === true  →  GO
     *   // gate.blockers.length > 0            →  NO-GO, xem gate.blockers
     */
    window.printOneClubPilotGate = function printOneClubPilotGate() {
        let tab = null;
        try {
            if (typeof window.printPilotTabReadiness === 'function') tab = window.printPilotTabReadiness();
        } catch(_e) {}

        let launch = null;
        try {
            if (typeof window.printPilotLaunchStatus === 'function') launch = window.printPilotLaunchStatus();
        } catch(_e) {}

        let tenClub = null;
        try {
            if (typeof window.printTenClubPilotReadiness === 'function') tenClub = window.printTenClubPilotReadiness();
        } catch(_e) {}

        let health = null;
        try {
            if (typeof window.getRuntimeHealthStatus === 'function') health = window.getRuntimeHealthStatus({ phase: 'all' });
        } catch(_e) {}

        const activeDataSource = (launch && launch.activeDataSource) || 'unknown';
        const profilesCount    = (tab    && tab.profilesCount)       || 0;
        const tuitionReady     = !!(tab  && tab.tuitionReady);
        const debtReady        = !!(tab  && tab.debtReady);
        const dashboardReady   = !!(tab  && tab.dashboardReady);
        const inventoryReady   = !!(tab  && tab.inventoryReady);

        const blockers = [];

        if (activeDataSource === 'unknown')
            blockers.push('activeDataSource unknown — login chưa hoàn tất hoặc chưa resolve data source');
        if (!(profilesCount > 0))
            blockers.push('profilesCount = 0 — chưa load dữ liệu võ sinh');
        if (!tuitionReady)
            blockers.push('tuitionReady = false — tab học phí chưa sẵn sàng');
        if (!debtReady)
            blockers.push('debtReady = false — tab báo nợ chưa sẵn sàng');
        if (!dashboardReady)
            blockers.push('dashboardReady = false — tab tổng quan chưa sẵn sàng');
        if (health && health.criticalMissing && health.criticalMissing.length > 0)
            blockers.push('Critical runtime health missing: ' + health.criticalMissing.join(', '));
        if (window.__runtimeRecoveryState && window.__runtimeRecoveryState.error)
            blockers.push('Runtime recovery error: ' + String(window.__runtimeRecoveryState.error).slice(0, 100));

        const readyForInternalTest = !!(profilesCount > 0 || ((tab && tab.transactionsCount) > 0));
        const readyForOneClubPilot = tuitionReady && debtReady && profilesCount > 0
            && (activeDataSource === 'primary' || activeDataSource === 'legacy-root');
        const readyForTenClubPilot = !!(tenClub && tenClub.readyForTenClubPilot);

        const gate = {
            readyForInternalTest,
            readyForOneClubPilot,
            readyForTenClubPilot,
            activeDataSource,
            profilesCount,
            transactionsCount: (tab && tab.transactionsCount) || 0,
            inventoryCount:    (tab && tab.inventoryCount)    || 0,
            tuitionReady,
            debtReady,
            dashboardReady,
            inventoryReady,
            blockers
        };

        console.table(gate);
        if (blockers.length > 0) {
            console.warn('[printOneClubPilotGate] ⚠️  NO-GO — ' + blockers.length + ' blocker(s):');
            blockers.forEach((b, i) => console.warn('  [' + (i + 1) + '] ' + b));
        } else {
            console.info('[printOneClubPilotGate] ✅ GO — sẵn sàng pilot 1 CLB.');
        }

        return gate;
    };

    // ── End Phase 4.0B-4H ─────────────────────────────────────────────────────

    // ════════════════════════════════════════════════════════════════════════════
    // PHASE 4.0B-4I — Automated Onboarding Checklist for New Clubs
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * runOnboardingGate(clubIdOrOptions) — Phase 4.0B-4I.
     * Chạy kiểm tra tự động cho một CLB mới trước khi bàn giao.
     * Read-only. Không ghi Firestore. Không migration. Không log PII.
     *
     * Cách dùng:
     *   await window.runOnboardingGate()
     *   await window.runOnboardingGate('clubId123')
     *   await window.runOnboardingGate({ clubId: 'clubId123', mode: 'pilot' })
     */
    window.runOnboardingGate = async function runOnboardingGate(clubIdOrOptions) {
        const checkedAt = new Date().toISOString();

        // Chuẩn hóa options
        let opts = {};
        if (typeof clubIdOrOptions === 'string') {
            opts = { clubId: clubIdOrOptions };
        } else if (clubIdOrOptions && typeof clubIdOrOptions === 'object') {
            opts = clubIdOrOptions;
        }

        // Bước 1 — Xác định clubId
        const clubId = opts.clubId
            || (window.__store && (window.__store.clubId || window.__store.currentClubId))
            || window.currentClubId
            || null;

        const blockers  = [];
        const warnings  = [];

        if (!clubId) {
            blockers.push('clubId missing — truyền clubId hoặc login trước');
        }

        // Bước 2 — resolveActiveDataSource
        let dataSource = null;
        try {
            if (typeof window.resolveActiveDataSource === 'function') {
                dataSource = await window.resolveActiveDataSource();
            }
        } catch(e) {
            dataSource = { source: 'error', error: String(e).slice(0, 200) };
        }
        const activeDataSource = (dataSource && dataSource.source) || 'unknown';
        if (activeDataSource === 'unknown') {
            blockers.push('activeDataSource unknown — login chưa hoàn tất hoặc chưa resolve data source');
        }
        if (activeDataSource === 'permission-error' || (dataSource && dataSource.permissionDenied)) {
            blockers.push('Permission denied while checking Firestore path — kiểm tra Firestore rules cho clubId này');
        }

        // Bước 3 — printDataHydrationStatus
        let hydration = null;
        try {
            if (typeof window.printDataHydrationStatus === 'function') hydration = window.printDataHydrationStatus();
        } catch(_e) {}

        // Bước 4 — printTabDataStatus
        let tabData = null;
        try {
            if (typeof window.printTabDataStatus === 'function') tabData = window.printTabDataStatus();
        } catch(_e) {}

        // Bước 5 — printPilotTabReadiness
        let tabReady = null;
        try {
            if (typeof window.printPilotTabReadiness === 'function') tabReady = window.printPilotTabReadiness();
        } catch(_e) {}

        // Bước 6 — printOneClubPilotGate
        let gate = null;
        try {
            if (typeof window.printOneClubPilotGate === 'function') gate = window.printOneClubPilotGate();
        } catch(_e) {}

        // Bước 7 — printTenClubPilotReadiness
        let tenClub = null;
        try {
            if (typeof window.printTenClubPilotReadiness === 'function') tenClub = window.printTenClubPilotReadiness();
        } catch(_e) {}

        // Tổng hợp metrics
        const profilesCount     = (tabReady && tabReady.profilesCount)     || (gate && gate.profilesCount)     || 0;
        const transactionsCount = (tabReady && tabReady.transactionsCount)  || (gate && gate.transactionsCount) || 0;
        const inventoryCount    = (tabReady && tabReady.inventoryCount)     || (gate && gate.inventoryCount)    || 0;
        const tuitionReady      = !!(tabReady && tabReady.tuitionReady)     || !!(gate && gate.tuitionReady);
        const debtReady         = !!(tabReady && tabReady.debtReady)        || !!(gate && gate.debtReady);
        const inventoryReady    = !!(tabReady && tabReady.inventoryReady)   || !!(gate && gate.inventoryReady);
        const dashboardReady    = !!(tabReady && tabReady.dashboardReady)   || !!(gate && gate.dashboardReady);
        const readyForInternalTest = !!(gate && gate.readyForInternalTest);
        const readyForOneClubPilot = !!(gate && gate.readyForOneClubPilot);
        const readyForTenClubPilot = !!(tenClub && tenClub.readyForTenClubPilot);

        // Bước 8 — Tổng hợp blockers
        if (!(profilesCount > 0))
            blockers.push('No profiles loaded — profilesCount = 0');
        if (!tuitionReady)
            blockers.push('Tuition tab not ready');
        if (!debtReady)
            blockers.push('Debt tab not ready');
        if (!dashboardReady)
            blockers.push('Dashboard not ready');
        if (window.__runtimeRecoveryState && window.__runtimeRecoveryState.error)
            blockers.push('Runtime recovery error: ' + String(window.__runtimeRecoveryState.error).slice(0, 100));

        // Critical health check
        let health = null;
        try {
            if (typeof window.getRuntimeHealthStatus === 'function') health = window.getRuntimeHealthStatus({ phase: 'all' });
        } catch(_e) {}
        if (health && health.criticalMissing && health.criticalMissing.length > 0)
            blockers.push('Critical runtime health missing: ' + health.criticalMissing.join(', '));

        // Optional: kiểm tra expectedClubName / expectedAdminEmail (không log giá trị)
        if (opts.expectedClubName) {
            const actualName = window.__store && (window.__store.clubName || window.__store.club && window.__store.club.name);
            if (actualName && actualName !== opts.expectedClubName) {
                blockers.push('Club name mismatch — tên CLB không khớp với expectedClubName');
            }
        }
        if (opts.expectedAdminEmail) {
            const actualEmail = window.__store && window.__store.currentUser && window.__store.currentUser.email;
            if (actualEmail && actualEmail !== opts.expectedAdminEmail) {
                warnings.push('Admin email mismatch — email đang login không khớp expectedAdminEmail');
            }
        }

        // Warnings cho các tab không critical
        if (opts.requireInventory && !inventoryReady)
            blockers.push('Inventory tab not ready (requireInventory = true)');
        if (opts.requireTransactions && !(transactionsCount > 0))
            warnings.push('No transactions loaded yet (requireTransactions = true)');

        const result = {
            clubId,
            activeDataSource,
            readyForInternalTest,
            readyForOneClubPilot,
            readyForTenClubPilot,
            profilesCount,
            transactionsCount,
            inventoryCount,
            tuitionReady,
            debtReady,
            inventoryReady,
            dashboardReady,
            blockers,
            warnings,
            checkedAt
        };

        const status = blockers.length === 0 ? '✅ PASS' : '❌ FAIL';
        console.group('[runOnboardingGate] ' + status + ' — clubId: ' + (clubId || '(not set)') + ' — ' + checkedAt);
        console.table({
            clubId:                clubId || '(not set)',
            activeDataSource,
            readyForOneClubPilot,
            readyForTenClubPilot,
            profilesCount,
            transactionsCount,
            inventoryCount,
            tuitionReady,
            debtReady,
            dashboardReady,
            blockers:              blockers.length > 0 ? blockers.join(' | ') : 'none',
            warnings:              warnings.length > 0 ? warnings.join(' | ') : 'none'
        });
        if (blockers.length > 0) {
            console.warn('[runOnboardingGate] BLOCKERS (' + blockers.length + '):');
            blockers.forEach(function(b, i) { console.warn('  [' + (i+1) + '] ' + b); });
        }
        console.groupEnd();

        return result;
    };

    /**
     * printOnboardingGate(clubIdOrOptions) — Phase 4.0B-4I.
     * Wrapper hiển thị kết quả bằng console.table. Read-only. Không log PII.
     *
     * Cách dùng:
     *   await window.printOnboardingGate()
     *   await window.printOnboardingGate({ clubId: window.__store?.clubId })
     */
    window.printOnboardingGate = async function printOnboardingGate(clubIdOrOptions) {
        const result = await window.runOnboardingGate(clubIdOrOptions);
        return result;
    };

    /**
     * generateOnboardingReportText(options) — Phase 4.0B-4I.
     * Tạo markdown text để người dùng copy vào ONBOARDING_REPORT_TEMPLATE.
     * Không tự download. Không ghi Firestore. Chỉ return string.
     *
     * Cách dùng:
     *   const text = await window.generateOnboardingReportText({ clubId: '...' });
     *   console.log(text);
     */
    window.generateOnboardingReportText = async function generateOnboardingReportText(options) {
        const result = await window.runOnboardingGate(options);

        const lines = [
            '# Onboarding Gate Report',
            '',
            '- Club ID: ' + (result.clubId || '(not set)'),
            '- Active Data Source: ' + result.activeDataSource,
            '- Profiles Count: ' + result.profilesCount,
            '- Transactions Count: ' + result.transactionsCount,
            '- Inventory Count: ' + result.inventoryCount,
            '- Tuition Ready: ' + result.tuitionReady,
            '- Debt Ready: ' + result.debtReady,
            '- Inventory Ready: ' + result.inventoryReady,
            '- Dashboard Ready: ' + result.dashboardReady,
            '- Ready For One Club Pilot: ' + result.readyForOneClubPilot,
            '- Ready For Ten Club Pilot: ' + result.readyForTenClubPilot,
            '- Blockers: ' + (result.blockers.length > 0 ? result.blockers.join('; ') : 'none'),
            '- Warnings: ' + (result.warnings.length > 0 ? result.warnings.join('; ') : 'none'),
            '- Checked At: ' + result.checkedAt
        ];

        const text = lines.join('\n');
        console.log('[generateOnboardingReportText] Copy text bên dưới:\n\n' + text);
        return text;
    };

    // ── End Phase 4.0B-4I ─────────────────────────────────────────────────────

    // ════════════════════════════════════════════════════════════════════════════
    // PHASE 4.0B-4J — SuperAdmin Multi-Club Audit Dashboard
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * probeClubDataReadOnly(clubId, options) — Phase 4.0B-4J.
     * Kiểm tra sơ bộ trạng thái dữ liệu của một CLB qua Firestore.
     * Read-only. Dùng limit(1). Không log doc data. Không log PII.
     */
    async function probeClubDataReadOnly(clubId, options) {
        options = options || {};
        const result = {
            clubId:                  clubId,
            primaryHasProfiles:      false,
            primaryHasTransactions:  false,
            primaryHasInventory:     false,
            legacyHasProfiles:       false,
            legacyHasTransactions:   false,
            legacyHasInventory:      false,
            permissionDenied:        false,
            probeError:              null
        };
        if (!clubId) {
            result.probeError = 'clubId missing';
            return result;
        }

        // Firebase SDK helpers — chỉ đọc nếu có sẵn
        var db = null;
        try {
            if (window.firebase && window.firebase.firestore) {
                db = window.firebase.firestore();
            } else if (window._db) {
                db = window._db;
            } else if (typeof getFirestore !== 'undefined') {
                db = getFirestore();
            }
        } catch(_e) {}

        if (!db) {
            result.probeError = 'Firestore db not available in probe';
            return result;
        }

        // Helper đọc 1 doc để kiểm tra có tồn tại không
        async function hasAny(path) {
            try {
                var ref, snap;
                // Modular API (v9+)
                if (typeof collection !== 'undefined' && typeof query !== 'undefined' && typeof limit !== 'undefined' && typeof getDocs !== 'undefined') {
                    var col = collection(db, path);
                    var q   = query(col, limit(1));
                    snap = await getDocs(q);
                    return !snap.empty;
                }
                // Compat API (v8)
                if (db.collection) {
                    snap = await db.collection(path).limit(1).get();
                    return !snap.empty;
                }
                return false;
            } catch(e) {
                var msg = String(e);
                if (/permission.denied|PERMISSION_DENIED/i.test(msg)) {
                    throw new Error('permission-denied');
                }
                return false;
            }
        }

        // Primary paths
        try {
            result.primaryHasProfiles     = await hasAny('clubs/' + clubId + '/profiles');
            result.primaryHasTransactions = await hasAny('clubs/' + clubId + '/transactions');
            result.primaryHasInventory    = await hasAny('clubs/' + clubId + '/inventory');
        } catch(e) {
            if (String(e).includes('permission-denied')) {
                result.permissionDenied = true;
                result.probeError = 'permission-denied while probing club data';
            } else {
                result.probeError = String(e).slice(0, 200);
            }
        }

        // Legacy root paths — chỉ nếu includeLegacyCheck và permission chưa bị block
        if (options.includeLegacyCheck && !result.permissionDenied) {
            try {
                result.legacyHasProfiles     = await hasAny('tst_profiles');
                result.legacyHasTransactions = await hasAny('tst_transactions');
                result.legacyHasInventory    = await hasAny('tst_inventory');
            } catch(_e) {}
        }

        return result;
    }

    /**
     * runSuperAdminAudit(options) — Phase 4.0B-4J.
     * Audit read-only nhiều CLB cùng lúc. Chỉ dành cho SuperAdmin.
     * Không ghi Firestore. Không đổi context. Không log PII.
     *
     * Cách dùng:
     *   await window.runSuperAdminAudit({ limit: 5 })
     *   await window.runSuperAdminAudit({ clubIds: ['clb1','clb2'] })
     */
    window.runSuperAdminAudit = async function runSuperAdminAudit(options) {
        options = options || {};
        var checkedAt          = new Date().toISOString();
        var mode               = options.mode               || 'pilot';
        var limit$             = options.limit              || 20;
        var includeLegacyCheck = options.includeLegacyCheck !== false;
        var includeTabReadiness= options.includeTabReadiness !== false;
        var onlyBlockers       = !!options.onlyBlockers;

        // SuperAdmin role check — không throw, chỉ warn
        var superAdminWarning = null;
        try {
            var isSA = false;
            if (typeof window.isSuperAdmin === 'function') isSA = window.isSuperAdmin();
            else if (window.__store && window.__store.superAdmin) isSA = true;
            else if (window.__store && window.__store.currentUser && window.__store.currentUser.isSuperAdmin) isSA = true;
            if (!isSA) superAdminWarning = 'SuperAdmin role not confirmed in runtime';
        } catch(_e) {
            superAdminWarning = 'SuperAdmin role not confirmed in runtime';
        }

        // Xác định danh sách clubIds
        var clubIds = [];
        if (options.clubIds && options.clubIds.length > 0) {
            clubIds = options.clubIds.slice(0, limit$);
        } else {
            // Thử lấy từ store
            var storeClubs = (window.__store && (window.__store.clubs || window.__store.superAdminClubs)) || null;
            if (storeClubs && typeof storeClubs === 'object') {
                if (Array.isArray(storeClubs)) {
                    clubIds = storeClubs.map(function(c) { return c.id || c.clubId || c; }).slice(0, limit$);
                } else {
                    clubIds = Object.keys(storeClubs).slice(0, limit$);
                }
            }
            // Nếu vẫn trống và đang login CLB nào đó, dùng CLB hiện tại
            if (clubIds.length === 0) {
                var currentId = (window.__store && (window.__store.clubId || window.__store.currentClubId)) || window.currentClubId;
                if (currentId) clubIds = [currentId];
            }
        }

        var clubs          = [];
        var readyForPilotCount = 0;
        var blockedCount   = 0;
        var warningCount   = 0;
        var blockersSummary = [];
        var currentLoginClubId = (window.__store && (window.__store.clubId || window.__store.currentClubId)) || window.currentClubId;

        for (var i = 0; i < clubIds.length; i++) {
            var cid = clubIds[i];
            var clubBlockers = [];
            var clubWarnings = [];

            // Probe Firestore read-only
            var probe = await probeClubDataReadOnly(cid, { includeLegacyCheck: includeLegacyCheck });

            if (probe.permissionDenied) {
                clubBlockers.push('permission-denied while probing club data');
            }
            if (probe.probeError && !probe.permissionDenied) {
                clubWarnings.push('probe error: ' + probe.probeError);
            }

            // Xác định activeDataSource
            var activeDataSource = 'unknown';
            if (probe.primaryHasProfiles) {
                activeDataSource = 'primary';
            } else if (probe.legacyHasProfiles) {
                activeDataSource = 'legacy-root';
            } else if (!probe.permissionDenied) {
                activeDataSource = 'empty';
            } else {
                activeDataSource = 'permission-error';
            }

            // Nếu là CLB đang login — dùng runtime gate đầy đủ hơn
            var gateResult      = null;
            var tuitionReady    = false;
            var debtReady       = false;
            var inventoryReady  = false;
            var dashboardReady  = false;
            var readyForOneClubPilot    = false;
            var readyForTenClubExpansion= false;
            var profilesReady   = probe.primaryHasProfiles || probe.legacyHasProfiles;

            if (cid === currentLoginClubId && includeTabReadiness) {
                try {
                    if (typeof window.runOnboardingGate === 'function') {
                        gateResult = await window.runOnboardingGate(cid);
                        tuitionReady         = !!(gateResult && gateResult.tuitionReady);
                        debtReady            = !!(gateResult && gateResult.debtReady);
                        inventoryReady       = !!(gateResult && gateResult.inventoryReady);
                        dashboardReady       = !!(gateResult && gateResult.dashboardReady);
                        readyForOneClubPilot = !!(gateResult && gateResult.readyForOneClubPilot);
                        readyForTenClubExpansion = !!(gateResult && gateResult.readyForTenClubPilot);
                        if (gateResult && gateResult.blockers) {
                            gateResult.blockers.forEach(function(b) { clubBlockers.push(b); });
                        }
                        if (gateResult && gateResult.warnings) {
                            gateResult.warnings.forEach(function(w) { clubWarnings.push(w); });
                        }
                    }
                } catch(_e) {
                    clubWarnings.push('runtime gate failed for current club');
                }
            } else {
                // CLB khác — chỉ dùng dữ liệu probe
                if (!profilesReady) clubBlockers.push('No profiles in primary or legacy path');
                readyForOneClubPilot     = profilesReady && !probe.permissionDenied;
                readyForTenClubExpansion = profilesReady && !probe.permissionDenied;
            }

            if (!profilesReady && !clubBlockers.some(function(b) { return b.includes('profile'); })) {
                clubBlockers.push('No profiles loaded');
            }

            if (superAdminWarning && i === 0) {
                clubWarnings.push(superAdminWarning);
            }

            if (clubBlockers.length === 0) {
                readyForPilotCount++;
            } else {
                blockedCount++;
                clubBlockers.forEach(function(b) {
                    if (!blockersSummary.includes(b)) blockersSummary.push(b);
                });
            }
            if (clubWarnings.length > 0) warningCount++;

            var clubEntry = {
                clubId:                   cid,
                clubName:                 (window.__store && window.__store.clubs && window.__store.clubs[cid] && window.__store.clubs[cid].name) || '',
                activeDataSource:         activeDataSource,
                primaryHasProfiles:       probe.primaryHasProfiles,
                primaryHasTransactions:   probe.primaryHasTransactions,
                primaryHasInventory:      probe.primaryHasInventory,
                legacyHasProfiles:        probe.legacyHasProfiles,
                legacyHasTransactions:    probe.legacyHasTransactions,
                legacyHasInventory:       probe.legacyHasInventory,
                profilesReady:            profilesReady,
                tuitionReady:             tuitionReady,
                debtReady:                debtReady,
                inventoryReady:           inventoryReady,
                dashboardReady:           dashboardReady,
                readyForOneClubPilot:     readyForOneClubPilot,
                readyForTenClubExpansion: readyForTenClubExpansion,
                blockers:                 clubBlockers,
                warnings:                 clubWarnings
            };

            if (!onlyBlockers || clubBlockers.length > 0) {
                clubs.push(clubEntry);
            }
        }

        var auditResult = {
            checkedAt:          checkedAt,
            mode:               mode,
            totalClubs:         clubIds.length,
            readyForPilotCount: readyForPilotCount,
            blockedCount:       blockedCount,
            warningCount:       warningCount,
            clubs:              clubs,
            blockersSummary:    blockersSummary
        };

        console.group('[runSuperAdminAudit] Audit — ' + mode + ' — ' + checkedAt);
        console.log('totalClubs:', auditResult.totalClubs);
        console.log('readyForPilotCount:', auditResult.readyForPilotCount);
        console.log('blockedCount:', auditResult.blockedCount);
        console.log('blockersSummary:', auditResult.blockersSummary);
        console.groupEnd();

        return auditResult;
    };

    /**
     * printSuperAdminAudit(options) — Phase 4.0B-4J.
     * Hiển thị bảng audit các CLB bằng console.table. Không log PII.
     *
     * Cách dùng:
     *   await window.printSuperAdminAudit({ limit: 10 })
     */
    window.printSuperAdminAudit = async function printSuperAdminAudit(options) {
        var result = await window.runSuperAdminAudit(options || {});
        console.table(result.clubs.map(function(c) {
            return {
                clubId:                   c.clubId,
                clubName:                 c.clubName || '',
                activeDataSource:         c.activeDataSource,
                profilesReady:            c.profilesReady,
                tuitionReady:             c.tuitionReady,
                debtReady:                c.debtReady,
                inventoryReady:           c.inventoryReady,
                dashboardReady:           c.dashboardReady,
                readyForOneClubPilot:     c.readyForOneClubPilot,
                readyForTenClubExpansion: c.readyForTenClubExpansion,
                blockers:                 (c.blockers && c.blockers.length) || 0
            };
        }));
        return result;
    };

    /**
     * generateSuperAdminAuditReportText(options) — Phase 4.0B-4J.
     * Tạo markdown text báo cáo audit để SuperAdmin copy. Không ghi Firestore.
     *
     * Cách dùng:
     *   const text = await window.generateSuperAdminAuditReportText({ limit: 10 });
     *   console.log(text);
     */
    window.generateSuperAdminAuditReportText = async function generateSuperAdminAuditReportText(options) {
        var result = await window.runSuperAdminAudit(options || {});

        var lines = [
            '# SuperAdmin Multi-Club Audit Report',
            '',
            '## Summary',
            '- Checked at: ' + result.checkedAt,
            '- Total clubs: ' + result.totalClubs,
            '- Ready for pilot: ' + result.readyForPilotCount,
            '- Blocked: ' + result.blockedCount,
            '- Warnings: ' + result.warningCount,
            '',
            '## Club Results',
            '| Club ID | Club Name | Data Source | Profiles | Tuition | Debt | Inventory | Dashboard | Pilot Ready | Blockers |',
            '|---|---|---|---|---|---|---|---|---|---|'
        ];

        result.clubs.forEach(function(c) {
            lines.push(
                '| ' + (c.clubId || '') +
                ' | ' + (c.clubName || '') +
                ' | ' + (c.activeDataSource || '') +
                ' | ' + (c.profilesReady ? 'YES' : 'NO') +
                ' | ' + (c.tuitionReady ? 'YES' : 'NO') +
                ' | ' + (c.debtReady ? 'YES' : 'NO') +
                ' | ' + (c.inventoryReady ? 'YES' : 'NO') +
                ' | ' + (c.dashboardReady ? 'YES' : 'NO') +
                ' | ' + (c.readyForOneClubPilot ? 'YES' : 'NO') +
                ' | ' + ((c.blockers && c.blockers.length) || 0) + ' |'
            );
        });

        lines.push('');
        lines.push('## Blockers Summary');
        if (result.blockersSummary.length > 0) {
            result.blockersSummary.forEach(function(b) { lines.push('- ' + b); });
        } else {
            lines.push('- none');
        }

        var text = lines.join('\n');
        console.log('[generateSuperAdminAuditReportText] Copy markdown text bên dưới:\n\n' + text);
        return text;
    };

    // ── End Phase 4.0B-4J ─────────────────────────────────────────────────────

})();

/**
 * Phase 4K-6V4C1A — Coach Branch Assignment Recovery
 *
 * Resolves the one authoritative attendance branch for Coach accounts before
 * branch-scoped Firestore listeners mount. It is intentionally fail-closed:
 * - Never falls back to all-club profile reads.
 * - Uses clubs/{clubId}/coaches/{uid} as the primary assignment source.
 * - Falls back to users/{uid} only for legacy records.
 * - Auto-assigns CS1 only when the club has exactly one branch.
 */
(function initCoachBranchResolver(global) {
    'use strict';

    if (global.CoachBranchResolver && global.CoachBranchResolver.version === '4K-6V4C1A') return;

    const VERSION = '4K-6V4C1A';
    const state = {
        inFlight: null,
        attempts: 0,
        successes: 0,
        failures: 0,
        lastResult: null,
        lastReason: '',
        lastAt: 0,
    };

    function _stripDiacritics(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    function _key(value) {
        return _stripDiacritics(value)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    function _rawCandidates(data) {
        const d = data && typeof data === 'object' ? data : {};
        const values = [
            d.branch,
            d.coachBranch,
            d.assignedBranch,
            d.branchId,
            d.locationBranch,
            d.centerBranch,
        ];
        const arrays = [d.branches, d.assignedBranches, d.branchIds];
        arrays.forEach(list => {
            if (Array.isArray(list) && list.length === 1) values.push(list[0]);
        });
        return values.filter(v => String(v || '').trim());
    }

    function normalizeBranch(raw, config) {
        let value = String(raw || '').trim();
        if (!value) return '';
        const compact = _key(value);
        if (!compact || ['all', 'tatca', 'tatcacoso', 'khonggioihan', 'none'].includes(compact)) return '';

        let match = value.match(/^\s*cs\s*0*(\d{1,2})\s*$/i);
        if (!match) match = _stripDiacritics(value).match(/^\s*co\s*so\s*0*(\d{1,2})\s*$/i);
        if (!match) match = value.match(/^\s*0*(\d{1,2})\s*$/);
        if (match) {
            const index = Number(match[1]);
            if (index >= 1 && index <= 10) return 'CS' + index;
        }

        const cfg = config && typeof config === 'object' ? config : null;
        if (cfg) {
            const count = Math.max(1, Math.min(10, Number(cfg.branchCount) || 1));
            for (let i = 1; i <= count; i++) {
                const name = cfg['branchName' + i] || ('Cơ sở ' + i);
                if (_key(name) && _key(name) === compact) return 'CS' + i;
            }
        }
        return '';
    }

    function extractBranch(data, config) {
        const candidates = _rawCandidates(data);
        for (let i = 0; i < candidates.length; i++) {
            const branch = normalizeBranch(candidates[i], config);
            if (branch) return branch;
        }
        return '';
    }

    async function _safeGet(ref) {
        const fb = global._fb_init || {};
        if (!fb.getDoc || !ref) return null;
        try {
            const snap = await fb.getDoc(ref);
            return snap && snap.exists && snap.exists() ? (snap.data() || {}) : null;
        } catch (error) {
            return { __readError: error };
        }
    }

    async function _readConfig(db, clubId) {
        const fb = global._fb_init || {};
        if (!db || !clubId || !fb.doc) return null;
        const data = await _safeGet(fb.doc(db, 'clubs', clubId, 'settings', 'main_config'));
        return data && !data.__readError ? data : null;
    }

    async function resolveAssignment(input) {
        const opts = input || {};
        const fb = global._fb_init || {};
        const db = opts.db || global.__store?.db || global._db || global.db;
        const uid = String(opts.uid || opts.user?.uid || global.__store?.currentUser?.uid || global._auth?.currentUser?.uid || '').trim();
        let clubId = String(opts.clubId || opts.userData?.clubId || global.currentClubId || global.__store?.currentClubId || global.__store?.clubId || '').trim();
        const reason = String(opts.reason || 'coach-login');
        state.attempts++;
        state.lastReason = reason;
        state.lastAt = Date.now();

        if (!db || !uid) {
            const result = { ok: false, branch: '', clubId, reason: !db ? 'db-not-ready' : 'uid-missing', source: 'none' };
            state.failures++;
            state.lastResult = result;
            return result;
        }

        let userData = opts.userData && typeof opts.userData === 'object' ? opts.userData : null;
        if (!userData && fb.doc) {
            const read = await _safeGet(fb.doc(db, 'users', uid));
            if (read && !read.__readError) userData = read;
        }
        if (!clubId && userData?.clubId) clubId = String(userData.clubId).trim();
        if (!clubId) {
            const result = { ok: false, branch: '', clubId: '', reason: 'club-id-missing', source: 'none' };
            state.failures++;
            state.lastResult = result;
            return result;
        }

        // The club coach document is the authoritative assignment because Club
        // Admins can update it even when top-level users/{uid} is write-restricted.
        let coachData = opts.coachData && typeof opts.coachData === 'object' ? opts.coachData : null;
        if (!coachData && fb.doc) {
            const read = await _safeGet(fb.doc(db, 'clubs', clubId, 'coaches', uid));
            if (read && !read.__readError) coachData = read;
        }

        let branch = extractBranch(coachData, null);
        let source = branch ? 'club-coach-doc' : '';
        if (!branch) {
            branch = extractBranch(userData, null);
            if (branch) source = 'user-doc-legacy';
        }

        let config = null;
        const rawCoachCandidates = _rawCandidates(coachData);
        const rawUserCandidates = _rawCandidates(userData);
        const hasUnmappedRaw = !branch && (rawCoachCandidates.length > 0 || rawUserCandidates.length > 0);
        if (!branch || hasUnmappedRaw) {
            config = await _readConfig(db, clubId);
            if (!branch) {
                branch = extractBranch(coachData, config) || extractBranch(userData, config);
                if (branch) source = 'legacy-branch-name-mapped';
            }
            if (!branch && config && Number(config.branchCount || 1) === 1) {
                branch = 'CS1';
                source = 'single-branch-auto-recovery';
            }
        }

        if (!branch) {
            const result = {
                ok: false,
                branch: '',
                clubId,
                reason: 'branch-assignment-missing',
                source: 'none',
                needsAdminAssignment: true,
                branchCount: config ? Number(config.branchCount || 1) : null,
            };
            state.failures++;
            state.lastResult = result;
            return result;
        }

        // Self-heal users/{uid} where rules permit updating the signed-in user's
        // own document. Failure is non-fatal because the coach subdocument remains
        // authoritative.
        if (fb.doc && fb.setDoc) {
            try {
                await fb.setDoc(fb.doc(db, 'users', uid), {
                    role: 'coach',
                    clubId,
                    branch,
                    coachBranchResolvedAt: new Date().toISOString(),
                }, { merge: true });
            } catch (_) {}
        }

        const result = { ok: true, branch, clubId, reason: 'resolved', source, needsAdminAssignment: false };
        state.successes++;
        state.lastResult = result;
        return result;
    }

    function applyAssignment(result, options) {
        if (!result || !result.ok || !result.branch) return false;
        const opts = options || {};
        const branch = result.branch;
        const clubId = result.clubId || global.currentClubId || global.__store?.currentClubId || '';
        global.coachBranch = branch;
        if (global.__store) {
            global.__store.coachBranch = branch;
            if (clubId) {
                global.__store.clubId = clubId;
                global.__store.currentClubId = clubId;
            }
        }
        if (global.RoleReadBoundary?.setContext) {
            global.RoleReadBoundary.setContext({ role: 'coach', coachBranch: branch, clubId });
        }

        ['att_branch', 'att_month_branch'].forEach(id => {
            const el = global.document?.getElementById(id);
            if (!el) return;
            if (![...el.options].some(option => option.value === branch)) {
                const option = global.document.createElement('option');
                option.value = branch;
                option.textContent = '📍 ' + (global.getBranchNameDisplay ? global.getBranchNameDisplay(branch) : branch);
                el.innerHTML = '';
                el.appendChild(option);
            }
            el.value = branch;
            el.disabled = true;
        });

        const header = global.document?.getElementById('coach_att_info');
        if (header) {
            const display = global.getBranchNameDisplay ? global.getBranchNameDisplay(branch) : branch;
            const esc = global.escapeHtml || (value => String(value));
            header.style.display = 'flex';
            header.innerHTML = '<span style="font-size:0.78rem;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:6px 14px;border-radius:99px;font-weight:700;">👨‍🏫 HLV đang điểm danh — Cơ sở: ' + esc(display) + '</span>';
        }

        global.dispatchEvent?.(new CustomEvent('coach:branch-resolved', {
            detail: { branch, clubId, source: result.source || '', reason: opts.reason || result.reason || '' }
        }));
        return true;
    }

    function showMissingBranchNotice(result) {
        const header = global.document?.getElementById('coach_att_info');
        if (header) {
            header.style.display = 'flex';
            header.innerHTML = '<div style="width:100%;max-width:620px;background:#fff7ed;border:1.5px solid #fdba74;color:#9a3412;padding:11px 13px;border-radius:12px;font-size:0.76rem;line-height:1.55;font-weight:700;text-align:left;">⚠️ Tài khoản HLV chưa được gán cơ sở điểm danh.<br><span style="font-weight:500;">Admin vào <b>Quản lý tài khoản HLV</b>, chọn một cơ sở và bấm <b>Lưu cơ sở</b>. Hệ thống không tải toàn bộ CLB để bảo vệ dữ liệu và giảm Firebase Reads.</span></div>';
        }
        const grid = global.document?.getElementById('attendanceGrid');
        if (grid) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:42px 18px;color:#9a3412;background:#fff7ed;border:1px dashed #fdba74;border-radius:14px;font-size:0.84rem;line-height:1.6;">Không thể tải danh sách võ sinh vì tài khoản HLV chưa được gán cơ sở.</div>';
        }
        if (global.showToast) global.showToast('⚠️ Tài khoản HLV chưa được gán cơ sở điểm danh', 'warning');
        global.dispatchEvent?.(new CustomEvent('coach:branch-missing', { detail: result || {} }));
    }

    async function recoverCurrentSession(options) {
        if (state.inFlight) return state.inFlight;
        const opts = options || {};
        state.inFlight = (async () => {
            const result = await resolveAssignment({
                db: opts.db,
                uid: opts.uid,
                user: opts.user,
                userData: opts.userData,
                coachData: opts.coachData,
                clubId: opts.clubId,
                reason: opts.reason || 'runtime-recovery',
            });
            if (result.ok) {
                applyAssignment(result, { reason: opts.reason || 'runtime-recovery' });
                if (opts.remount !== false) {
                    setTimeout(() => {
                        if (typeof global.mountActiveProfilesListenerIfNeeded === 'function') {
                            global.mountActiveProfilesListenerIfNeeded('coach-branch-recovered');
                        } else if (typeof global.mountActiveProfilesListener === 'function' && global.__store?.profRef) {
                            global.mountActiveProfilesListener({
                                db: global.__store.db,
                                clubId: result.clubId,
                                currentClubId: result.clubId,
                                profRef: global.__store.profRef,
                                role: 'coach',
                                coachBranch: result.branch,
                                reason: 'coach-branch-recovered',
                            });
                        }
                    }, 0);
                }
            } else {
                showMissingBranchNotice(result);
            }
            return result;
        })().finally(() => { state.inFlight = null; });
        return state.inFlight;
    }

    function diagnostics() {
        return {
            version: VERSION,
            attempts: state.attempts,
            successes: state.successes,
            failures: state.failures,
            inFlight: !!state.inFlight,
            lastReason: state.lastReason,
            lastAt: state.lastAt,
            lastResult: state.lastResult ? Object.assign({}, state.lastResult) : null,
        };
    }

    const api = {
        version: VERSION,
        normalizeBranch,
        extractBranch,
        resolveAssignment,
        applyAssignment,
        recoverCurrentSession,
        showMissingBranchNotice,
        diagnostics,
    };

    global.CoachBranchResolver = api;
    global.printCoachBranchDiagnostics = function printCoachBranchDiagnostics() {
        const result = diagnostics();
        console.group('[CoachBranchResolver] Diagnostics');
        console.table ? console.table(result) : console.log(result);
        console.groupEnd();
        return result;
    };
})(window);

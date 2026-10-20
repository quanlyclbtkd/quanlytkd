import {HISTORY_AUTHORITY, attendanceServerVersion, attendanceVisibleRecord} from '../core/attendanceContract.js';
/**
 * js/services/attendance.service.js — Phase 3.1
 * ────────────────────────────────────────────────────────────────
 * Service Layer: Tất cả Firestore operations cho:
 *   - attendance collection (scoped queries and versioned transactions)
 *   - attendanceNotes collection (getDocs)
 *   - settings/shifts doc (getDoc, setDoc)
 *   - no writes to derived members statistics
 *
 * Module attendance.js KHÔNG gọi Firebase trực tiếp nữa.
 * ────────────────────────────────────────────────────────────────
 */

function _sdk()    { return window._fb_init || {}; }
function _db()     { const db = (window.__store || {}).db; if (!db) throw new Error('[AttendanceService] db chưa sẵn sàng'); return db; }
function _clubId() { const id = (window.__store || {}).clubId; if (!id) throw new Error('[AttendanceService] clubId chưa sẵn sàng'); return id; }
function _isCoach() { return window.RoleReadBoundary?.isCoachAttendanceOnly?.() === true || String(window.userRole || '').toLowerCase() === 'coach'; }
function _canonicalBranch(value, fallback = '') {
    if (window.BranchIdentity?.normalize) return window.BranchIdentity.normalize(value, { fallback });
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    if (/^(Mặc định|mac dinh|default)$/i.test(raw)) return 'CS1';
    return raw;
}
function _branchAliases(value) {
    if (window.BranchIdentity?.aliases) return window.BranchIdentity.aliases(value);
    const code = _canonicalBranch(value, '');
    return code === 'CS1' ? ['CS1', 'Mặc định'] : (code ? [code] : []);
}
function _scopedBranch(options = {}) {
    const coach = _isCoach();
    const branch = _canonicalBranch(coach ? window.coachBranch : options.branch, coach ? '' : String(options.branch || '').trim());
    if (coach && !branch) {
        const error = new Error('[AttendanceService] Coach chưa được gán cơ sở — chặn query/write toàn CLB.');
        error.code = 'attendance/coach-branch-required';
        throw error;
    }
    return { coach, branch };
}
function _branchConstraint(where, branch, coach) {
    if (!branch || branch === 'all') return null;
    const aliases = coach ? _branchAliases(branch) : [branch];
    return aliases.length > 1 ? where('branch', 'in', aliases) : where('branch', '==', aliases[0]);
}
function _prepareWriteData(data) {
    const source = data && typeof data === 'object' ? data : {};
    const { coach, branch } = _scopedBranch({ branch: source.branch || '' });
    const canonical = _canonicalBranch(coach ? branch : source.branch, coach ? '' : 'CS1');
    if (!canonical) {
        const error = new Error('[AttendanceService] Thiếu branch hợp lệ cho bản ghi điểm danh.');
        error.code = 'attendance/branch-required';
        throw error;
    }
    return { ...source, branch: canonical };
}

// V9: Rules resolve one canonical profile for each Coach attendance write.
// Ten distinct profiles leave room under the per-batch Rules access-call limit.
// Guard every serial chunk against an account/club/role switch during an ACK.
function _bulkWriteContextGuard(db, clubId) {
    const principal = () => {
        const a = window.__verifiedAuthContextState || {};
        return JSON.stringify([a.uid, a.clubId, a.role, a.coachBranch, a.generation, a.ready,
            window.userRole, window.coachBranch, window.__store?.userRole, window.__store?.coachBranch]);
    };
    const captured = principal();
    return () => {
        if (_db() !== db || _clubId() !== clubId || principal() !== captured) {
            const error = new Error('[AttendanceService] Phiên điểm danh đã thay đổi; giữ lại dữ liệu chưa đồng bộ.');
            error.code = 'attendance/stale-bulk-context';
            throw error;
        }
    };
}

// V5U6G1: Offline journal metadata is orchestration-only. Build the canonical
// Firestore Attendance document from an explicit business-field whitelist so
// future journal fields cannot leak through a spread into persisted schema.
function _toCanonicalAttendanceWrite(record, fallbackDate = '') {
    const rec = record && typeof record === 'object' ? record : {};
    const date = String(rec.date || fallbackDate || '').slice(0, 10);
    const payload = {
        profileId: String(rec.profileId || rec.name || ''),
        name: String(rec.name || ''),
        belt: String(rec.belt || ''),
        branch: String(rec.branch || ''),
        date,
        month: String(rec.month || date.slice(0, 7)),
        status: Number(rec.status || 0),
        timestamp: Date.now(),
    };
    const shiftId = String(rec.shiftId || '').trim();
    if (shiftId) payload.shiftId = shiftId;
    return _prepareWriteData(payload);
}

// All online/offline mutations enter this one transaction writer. A stale
// expected version becomes a visible conflict, never an automatic rebase.
async function _commitAttendanceIntents(intents, options = {}) {
    const {runTransaction, doc} = _sdk(), db = _db(), clubId = _clubId();
    if (typeof runTransaction !== 'function') throw Object.assign(new Error('Chưa tải được chức năng lưu điểm danh an toàn.'), {code:'attendance/transaction-unavailable'});
    const ensureCurrent = _bulkWriteContextGuard(db, clubId);
    const auth = window.__verifiedAuthContextState;
    if (auth?.ready !== true || !auth.uid || !['admin','super_admin','coach'].includes(auth.role) ||
        window.userRole !== auth.role || window.__store?.userRole !== auth.role ||
        (window.__store?.currentUser?.uid && window.__store.currentUser.uid !== auth.uid) ||
        (auth.role !== 'super_admin' && auth.clubId !== clubId)) throw Object.assign(new Error('Phiên điểm danh chưa được xác minh.'), {code:'attendance/unverified-writer'});
    const rows = Array.isArray(intents) ? intents : [], maximumChunkSize = _isCoach() ? 10 : 400;
    const chunkSize = Math.max(1,Math.min(maximumChunkSize,Math.floor(Number(options.chunkSize)||maximumChunkSize)));
    const targets = new Set();
    const acknowledgedIds = [], versions = {};
    for (const row of rows) {
        if (typeof row?.id !== 'string' || row.id.length < 16 || !row.record || row.record.clubId !== clubId || !row.record.docId ||
            ![0,1,2,3].includes(Number(row.record.status)) || typeof row.baseVersion !== 'string' || row.baseVersion === 'unknown') {
            throw Object.assign(new Error('Thao tác cần được đối soát trước khi gửi.'), {code:'attendance/intent-review-required'});
        }
        const r=row.record, date=String(r.date||''), shift=String(r.shiftId||'');
        const parsed=new Date(date+'T00:00:00Z');
        const expectedId=String(r.name||'')+'_'+date+(shift?'_'+shift:'');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||
            r.month!==date.slice(0,7)||!r.name||!String(r.branch||'').trim()||r.branch==='all'||r.profileId!==r.name||r.docId!==expectedId||r.docId.includes('/')||targets.has(r.docId))
            throw Object.assign(new Error('Bản ghi điểm danh không đúng định danh/ngày học.'),{code:'attendance/invalid-intent'});
        targets.add(r.docId);
    }
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
        const chunk = rows.slice(offset,offset+chunkSize);
        try {
            ensureCurrent();
            const ack = await runTransaction(db, async transaction => {
                ensureCurrent();
                const current = [];
                // Firestore requires all transaction reads before its writes.
                for (const intent of chunk) {
                    const ref = doc(db,'clubs',clubId,'attendance',intent.record.docId);
                    const snap = await transaction.get(ref);
                    current.push({intent,ref,data:snap.exists()?snap.data():null});
                    window.recordFirestoreReadAttribution?.('attendance.intent-version',1,{reason:'compare-and-set',initial:false});
                }
                ensureCurrent();
                const conflicts = current.filter(({intent,data}) => data?.attendanceVersion !== intent.id && attendanceServerVersion(data) !== intent.baseVersion)
                    .map(({intent,data})=>({id:intent.id,docId:intent.record.docId,serverVersion:attendanceServerVersion(data),serverStatus:Number(data?.status||0)}));
                if (conflicts.length) throw Object.assign(new Error('Điểm danh trên máy chủ đã thay đổi. Dữ liệu trên thiết bị được giữ để đối soát.'), {code:'attendance/intent-conflict',conflicts});
                for (const {intent,ref,data} of current) {
                    const payload = _toCanonicalAttendanceWrite(intent.record, intent.record.date);
                    if (data?.attendanceVersion === intent.id) {
                        const fields=['profileId','name','branch','date','month','shiftId','status','belt'];
                        if (!fields.every(key=>(data[key]??'')===(payload[key]??''))||data.historyAuthority!==HISTORY_AUTHORITY)
                            throw Object.assign(new Error('Định danh thao tác đã có nội dung khác; cần đối soát.'),{code:'attendance/intent-reuse'});
                        continue;
                    }
                    payload.historyAuthority = HISTORY_AUTHORITY;
                    payload.attendancePreviousVersion = data?.attendanceVersion || 'legacy';
                    payload.attendanceVersion = intent.id;
                    // Status zero is an unmarked tombstone, retaining the CAS
                    // version so a delayed set cannot resurrect a deleted mark.
                    transaction.set(ref,payload);
                }
                return current.map(({intent})=>intent.id);
            },{maxAttempts:3});
            acknowledgedIds.push(...ack);
            chunk.forEach(row=>{versions[row.record.docId]=row.id;});
            options.onChunkCommitted?.(chunk,{committed:acknowledgedIds.length,total:rows.length});
        } catch(error) {
            error.committed = acknowledgedIds.length; error.acknowledgedIds = acknowledgedIds.slice();
            error.total = rows.length; error.pending = rows.length-acknowledgedIds.length; throw error;
        }
    }
    return {committed:acknowledgedIds.length,total:rows.length,pending:0,acknowledgedIds,versions};
}

export const AttendanceService = {

    // ── LOAD ATTENDANCE ─────────────────────────────────────────

    /**
     * Load tất cả bản ghi điểm danh theo ngày.
     * @param {string} date — YYYY-MM-DD
     * @returns {Array<{id, data}>}
     */
    async loadByDate(date, options = {}) {
        const { getDocs, query, where, collection, limit: _limit, startAfter } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const _lim   = typeof _limit === 'function' ? _limit : null;
        // H8R2.1 R5 — cursor pagination is part of this canonical reader's
        // correctness contract. Missing primitives must fail BEFORE the first
        // Firestore read; never fall back to unbounded or partial coverage.
        if (!_lim || typeof startAfter !== 'function') {
            const error = new Error('[AttendanceService] Daily pagination primitives are unavailable.');
            error.code = 'attendance/daily-pagination-unavailable';
            throw error;
        }

        const shiftId = String(options.shiftId || '');
        if (options.requireShift === true && !shiftId) {
            const error = new Error('[AttendanceService] Explicit shift is required before the daily query.');
            error.code = 'attendance/explicit-shift-required';
            throw error;
        }
        const shiftAuthorityMode = String(options.shiftAuthorityMode || (shiftId ? 'explicit-shift' : 'legacy-no-shift'));
        const { coach: isCoach, branch } = _scopedBranch(options);
        window.RoleReadBoundary?.canMount?.('attendance.daily', { date, branch, shiftId });

        // H8R2: one canonical daily reader, internally cursor-paged. The former
        // 1200 hard cap could silently truncate a large day. Keep the same query
        // semantics and the same getDocs call-site, but iterate with startAfter.
        const pageSize = Math.max(100, Math.min(500, Number((window.__scaleConfig || {}).attendanceDailyPageSize) || 400));
        const safetyCeiling = Math.max(pageSize, Number((window.__scaleConfig || {}).attendanceDailySafetyCeiling) || 10000);
        const baseConstraints = [where('date', '==', date)];
        if (isCoach) baseConstraints.push(where('historyAuthority','==',HISTORY_AUTHORITY));
        const branchConstraint = _branchConstraint(where, branch, isCoach);
        if (branchConstraint) baseConstraints.push(branchConstraint);
        if (shiftId) baseConstraints.push(where('shiftId', '==', shiftId));

        const results = [];
        let cursor = null;
        let pageCount = 0;
        let coverageComplete = true;
        let staleAborted = false;
        let lastPageSize = 0;
        let serverConfirmed = true;

        while (true) {
            if (typeof options.isCurrent === 'function' && options.isCurrent() !== true) {
                staleAborted = true;
                coverageComplete = false;
                break;
            }
            const constraints = baseConstraints.slice();
            if (cursor) constraints.push(startAfter(cursor));
            constraints.push(_lim(pageSize));

            const snap = await getDocs(query(
                collection(db, 'clubs', clubId, 'attendance'),
                ...constraints
            ));
            serverConfirmed = serverConfirmed && snap.metadata?.fromCache === false && snap.metadata?.hasPendingWrites === false;
            pageCount++;
            lastPageSize = Number(snap.size || 0);
            snap.forEach(d => {
                if (results.length < safetyCeiling) results.push({ id: d.id, data: d.data() });
            });

            if (typeof window.recordFirestoreReadAttribution === 'function') {
                window.recordFirestoreReadAttribution('attendance.daily', Number(snap.size || 0), {
                    initial: pageCount === 1,
                    reason: 'canonical-daily-refresh-page',
                    page: pageCount,
                    date,
                    branch,
                    shiftId,
                    shiftAuthorityMode,
                });
            }

            if (results.length >= safetyCeiling && lastPageSize >= pageSize) {
                coverageComplete = false;
                break;
            }
            if (lastPageSize < pageSize || snap.docs.length === 0) break;
            cursor = snap.docs[snap.docs.length - 1];
            if (!cursor) {
                const error = new Error('[AttendanceService] Daily pagination cursor is unavailable.');
                error.code = 'attendance/daily-pagination-unavailable';
                throw error;
            }
        }

        window.__attendanceDailyLoadMetrics = {
            date,
            shiftFiltered: !!shiftId,
            branchFiltered: !!branch && branch !== 'all',
            branch,
            docs: results.length,
            pageSize,
            pages: pageCount,
            safetyCeiling,
            coverageComplete,
            staleAborted,
            shiftAuthorityMode,
            updatedAt: Date.now()
        };

        if (!coverageComplete && !staleAborted) {
            const error = new Error('[AttendanceService] Daily attendance safety ceiling reached before coverage completed.');
            error.code = 'attendance/daily-coverage-incomplete';
            error.coverageComplete = false;
            error.loadedCount = results.length;
            error.safetyCeiling = safetyCeiling;
            if (typeof window.warnUnsafeLimit === 'function') {
                window.warnUnsafeLimit('attendance:daily:safety-ceiling', 'att-daily-coverage-incomplete');
            }
            throw error;
        }

        Object.defineProperties(results, {
            coverageComplete: { value: coverageComplete, enumerable: false },
            serverConfirmed: { value: serverConfirmed, enumerable: false },
            staleAborted: { value: staleAborted, enumerable: false },
            pageCount: { value: pageCount, enumerable: false },
        });
        return results;
    },

    // ── SAVE / DELETE ATTENDANCE ─────────────────────────────────

    /**
     * Lưu bản ghi điểm danh (setDoc — create hoặc update).
     * @param {string} docId — composite ID: "tên_ngày" hoặc "tên_ngày_shiftId"
     * @param {Object} data  — { profileId, name, belt, branch, date, month, status, ... }
     */
    async saveRecord(docId, data, options = {}) {
        if (!options.intent) throw Object.assign(new Error('Cần lưu qua nhật ký điểm danh.'),{code:'attendance/intent-required'});
        if (options.intent.record?.docId !== docId) throw Object.assign(new Error('Định danh điểm danh không khớp.'),{code:'attendance/invalid-intent'});
        return _commitAttendanceIntents([options.intent]);
    },
    async deleteRecord(docId, options = {}) {
        if (!options.intent) throw Object.assign(new Error('Cần lưu qua nhật ký điểm danh.'),{code:'attendance/intent-required'});
        if (options.intent.record?.docId !== docId) throw Object.assign(new Error('Định danh điểm danh không khớp.'),{code:'attendance/invalid-intent'});
        return _commitAttendanceIntents([options.intent]);
    },

    // ── SHIFTS ──────────────────────────────────────────────────

    /**
     * Load danh sách ca tập từ settings/shifts.
     * @returns {Array<{id, name, timeStart, timeEnd, branch}>}
     */
    async loadShifts() {
        const { doc, getDoc } = _sdk();
        const snap = await getDoc(
            doc(_db(), 'clubs', _clubId(), 'settings', 'shifts')
        );
        if (typeof window.recordFirestoreReadAttribution === 'function') {
            window.recordFirestoreReadAttribution('attendance.shifts', 1, {
                initial: true,
                reason: 'attendance-shifts-single-flight',
            });
        }
        return snap.exists() ? (snap.data().list || []) : [];
    },

    /**
     * Lưu toàn bộ danh sách ca tập.
     * @param {Array} shifts — mảng shift objects
     */
    async saveShifts(shifts) {
        const { doc, setDoc } = _sdk();
        await setDoc(
            doc(_db(), 'clubs', _clubId(), 'settings', 'shifts'),
            { list: shifts }
        );
    },

    // ── MEMBER HISTORY ──────────────────────────────────────────

    /**
     * Load lịch sử điểm danh của một võ sinh trong nhiều tháng (tối đa 10 tháng/query).
     * @param {string} profileId   — tên võ sinh
     * @param {string[]} months    — mảng YYYY-MM (giới hạn 10 phần tử cho 'in' query)
     * @returns {Array<{id, data}>}
     */
    async loadMemberHistory(profileId, months, options = {}) {
        const { getDocs, query, where, collection } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const { coach: isCoach, branch } = _scopedBranch(options);
        const baseConstraints = [
            where('profileId', '==', profileId),
            where('month', 'in', months)
        ];
        if (isCoach) baseConstraints.push(where('historyAuthority','==',HISTORY_AUTHORITY));
        window.RoleReadBoundary?.canMount?.('attendance.member-history', { profileId, months, branch });

        // `month in [...]` cannot be combined portably with a second `branch in [...]`.
        // Run one branch-equality query per legacy alias and de-duplicate by document id.
        const aliases = (branch && branch !== 'all') ? (isCoach ? _branchAliases(branch) : [branch]) : [''];
        const snapshots = await Promise.all(aliases.map(alias => {
            const constraints = baseConstraints.slice();
            if (alias) constraints.push(where('branch', '==', alias));
            return getDocs(query(collection(db, 'clubs', clubId, 'attendance'), ...constraints));
        }));
        const byId = new Map();
        snapshots.forEach(snap => snap.forEach(d => byId.set(d.id, { id: d.id, data: d.data() })));
        return Array.from(byId.values()).filter(row=>attendanceVisibleRecord(row.data));
    },

    // ── COACH NOTES ─────────────────────────────────────────────

    /**
     * Load ghi chú buổi tập của HLV theo ngày.
     * @param {string} date — YYYY-MM-DD
     * @returns {Array<{id, data}>}
     */
    async loadCoachNotes(date, options = {}) {
        const { getDocs, query, where, collection } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const { coach: isCoach, branch } = _scopedBranch(options);
        const constraints = [where('date', '==', date)];
        const branchConstraint = _branchConstraint(where, branch, isCoach);
        if (branchConstraint) constraints.push(branchConstraint);
        window.RoleReadBoundary?.canMount?.('attendance.notes', { date, branch });
        const snap   = await getDocs(
            query(
                collection(db, 'clubs', clubId, 'attendanceNotes'),
                ...constraints
            )
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, data: d.data() }));
        if (typeof window.recordFirestoreReadAttribution === 'function') {
            window.recordFirestoreReadAttribution('attendance.coachNotes', Number(snap.size || results.length || 0), {
                initial: true,
                reason: 'attendance-daily-accepted',
                date,
                branch,
            });
        }
        return results;
    },

    // ── LOAD BY MONTH (thống kê tháng) ──────────────────────────────

    /**
     * Load tất cả bản ghi điểm danh theo tháng (cho renderAttMonthly).
     * @param {string} month — YYYY-MM
     * @returns {Array<{id, data}>}
     */
    async loadByMonth(month, options = {}) {
        const { getDocs, query, where, collection, limit: _limit, startAfter: _startAfter } = _sdk();
        const db     = _db();
        const clubId = _clubId();

        if (!month || !/^\d{4}-\d{2}$/.test(String(month))) {
            throw new Error('[AttendanceService] Tháng không hợp lệ. Cần định dạng YYYY-MM.');
        }
        if (typeof _limit !== 'function' || typeof _startAfter !== 'function') {
            const error = new Error('[AttendanceService] Firebase SDK thiếu limit/startAfter cho monthly pagination.');
            error.code = 'attendance/monthly-pagination-unavailable';
            throw error;
        }

        const { coach: isCoach, branch } = _scopedBranch(options);
        window.RoleReadBoundary?.canMount?.('attendance.monthly', { month, branch });

        const pageSize = Math.max(100, Math.min(
            Number(options.pageSize || (window.__scaleConfig || {}).attendanceMonthlyPageSize || 1000),
            2000
        ));
        const maxPages = Math.max(1, Math.min(
            Number(options.maxPages || (window.__scaleConfig || {}).attendanceMonthlyMaxPages || 200),
            500
        ));
        const signal = options.signal || null;
        const onPage = typeof options.onPage === 'function' ? options.onPage : null;
        const startedAt = Date.now();
        const results = [];
        let cursor = null;
        let pages = 0;
        let completed = false;

        function throwIfAborted() {
            if (!signal || !signal.aborted) return;
            const error = new Error('Attendance monthly load aborted');
            error.name = 'AbortError';
            error.code = 'attendance/monthly-load-aborted';
            throw error;
        }

        try {
            while (pages < maxPages) {
                throwIfAborted();
                const constraints = [where('month', '==', month)];
                if (isCoach) constraints.push(where('historyAuthority','==',HISTORY_AUTHORITY));
                const branchConstraint = _branchConstraint(where, branch, isCoach);
                if (branchConstraint) constraints.push(branchConstraint);
                // Firestore's default ordering is document ID. A DocumentSnapshot
                // cursor preserves that deterministic order without requiring a new
                // composite index for month + date.
                if (cursor) constraints.push(_startAfter(cursor));
                constraints.push(_limit(pageSize));

                const snap = await getDocs(query(
                    collection(db, 'clubs', clubId, 'attendance'),
                    ...constraints
                ));
                throwIfAborted();

                pages++;
                const docs = Array.isArray(snap.docs) ? snap.docs : [];
                docs.forEach(d => results.push({ id: d.id, data: d.data() }));

                if (onPage) {
                    try {
                        onPage({ month, page: pages, pageDocs: docs.length, totalDocs: results.length, pageSize });
                    } catch (_) { /* progress callback must not break data loading */ }
                }

                if (docs.length < pageSize) {
                    completed = true;
                    break;
                }
                cursor = docs[docs.length - 1];
            }

            if (!completed) {
                const error = new Error(
                    '[AttendanceService] Monthly pagination reached safety ceiling (' +
                    maxPages + ' pages / ' + results.length + ' documents). Export/render stopped to avoid incomplete data.'
                );
                error.code = 'attendance/monthly-max-pages';
                error.partialCount = results.length;
                error.pages = pages;
                throw error;
            }

            window.__attendanceMonthlyPaginationMetrics = {
                month,
                branch,
                branchFiltered: !!branch && branch !== 'all',
                pages,
                docs: results.length,
                pageSize,
                maxPages,
                durationMs: Date.now() - startedAt,
                completed: true,
                aborted: false,
                updatedAt: Date.now()
            };
            return results.filter(row=>attendanceVisibleRecord(row.data));
        } catch (error) {
            window.__attendanceMonthlyPaginationMetrics = {
                month,
                branch,
                branchFiltered: !!branch && branch !== 'all',
                pages,
                docs: results.length,
                pageSize,
                maxPages,
                durationMs: Date.now() - startedAt,
                completed: false,
                aborted: error && (error.name === 'AbortError' || error.code === 'attendance/monthly-load-aborted'),
                errorCode: error && error.code || 'attendance/monthly-load-failed',
                updatedAt: Date.now()
            };
            throw error;
        }
    },

    // ── BULK OPERATIONS ──────────────────────────────────────────────

    /**
     * Lưu nhiều bản ghi điểm danh trong 1 writeBatch (điểm danh hàng loạt).
     * @param {Array<{docId, data}>} records — mảng records cần lưu
     */
    async bulkSaveRecords(records, options = {}) {
        return _commitAttendanceIntents(records, options);
    },
    async bulkSyncOffline(clubId, date, records) {
        if (clubId !== _clubId()) throw Object.assign(new Error('CLB đã thay đổi.'),{code:'attendance/stale-bulk-context'});
        return _commitAttendanceIntents(Array.isArray(records)?records:Object.values(records||{}));
    },
    async inspectIntent(record) {
        const {runTransaction,doc}=_sdk(), db=_db(), clubId=_clubId();
        const ensureCurrent=_bulkWriteContextGuard(db,clubId);
        if (record?.clubId !== clubId || !record.docId || record.docId.includes('/')) throw Object.assign(new Error('Bản ghi thuộc CLB khác.'),{code:'attendance/stale-bulk-context'});
        return runTransaction(db,async tx=>{ensureCurrent();const snap=await tx.get(doc(db,'clubs',clubId,'attendance',record.docId));ensureCurrent();
            window.recordFirestoreReadAttribution?.('attendance.intent-review',1,{reason:'explicit-user-review'});
            const data=snap.exists()?snap.data():null;return {data,version:attendanceServerVersion(data)};},{maxAttempts:3});
    },
    async attestHistory(record, serverVersion) {
        if (!['admin','super_admin'].includes(window.__verifiedAuthContextState?.role)||window.__verifiedAuthContextState?.ready!==true) throw Object.assign(new Error('Chỉ Admin xác minh lịch sử cũ.'),{code:'permission-denied'});
        const {attendanceIntentId}=await import('../core/attendanceContract.js');
        return _commitAttendanceIntents([{id:attendanceIntentId(),baseVersion:serverVersion,record:{...record,clubId:_clubId()}}]);
    },

    /**
     * Cập nhật stats chuyên cần (totalSessionsAttended, consecutiveAbsences...).
     * Ghi vào collection "members" (tách biệt với "profiles" — performance stats).
     * Đây là derived metadata. Caller giữ canonical attendance success nhưng
     * phải quan sát/reconcile failure; service không được nuốt lỗi.
     *
     * @param {string} name   — tên võ sinh
     * @param {Object} data   — FieldValue updates (increment, literal values)
     */
    async updateMemberStats() {
        throw Object.assign(new Error('Chuyên cần được tính từ lịch sử điểm danh; không ghi thống kê phụ.'), {code:'attendance/derived-read-only'});
    },

    /**
     * Trả về Firebase increment FieldValue (dùng trong toggleAttendance).
     * Cho phép module gọi AttendanceService._increment(n) thay vì import SDK trực tiếp.
     * @param {number} n — số nguyên (dương hoặc âm)
     * @returns {FieldValue}
     */
    _increment(n) { return (window._fb_init || {}).increment(n); },
};

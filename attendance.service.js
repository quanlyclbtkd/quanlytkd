/**
 * js/services/attendance.service.js — Phase 3.1
 * ────────────────────────────────────────────────────────────────
 * Service Layer: Tất cả Firestore operations cho:
 *   - attendance collection (getDocs, setDoc, deleteDoc)
 *   - attendanceNotes collection (getDocs)
 *   - settings/shifts doc (getDoc, setDoc)
 *   - members collection (updateDoc — chuyên cần thăng đai)
 *
 * Module attendance.js KHÔNG gọi Firebase trực tiếp nữa.
 * ────────────────────────────────────────────────────────────────
 */

function _sdk()    { return window._fb_init || {}; }
function _db()     { const db = (window.__store || {}).db; if (!db) throw new Error('[AttendanceService] db chưa sẵn sàng'); return db; }
function _clubId() { const id = (window.__store || {}).clubId; if (!id) throw new Error('[AttendanceService] clubId chưa sẵn sàng'); return id; }

export const AttendanceService = {

    // ── LOAD ATTENDANCE ─────────────────────────────────────────

    /**
     * Load tất cả bản ghi điểm danh theo ngày.
     * @param {string} date — YYYY-MM-DD
     * @returns {Array<{id, data}>}
     */
    async loadByDate(date) {
        const { getDocs, query, where, collection, limit: _limit } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const _lim   = typeof _limit === 'function' ? _limit : null;
        if (!_lim) console.warn('[AttendanceService] limit not available in SDK — loadByDate running without limit()');
        // [4J-8] Tăng limit từ 500 → 1200: CLB 1000 võ sinh × 2 ca/ngày = ~2000 records max.
        // 1200 bao phủ an toàn CLB đến 1000 võ sinh với buffer cho records cũ/trùng.
        const _attDailyLimit = ((window.__scaleConfig || {}).attendanceDailyLimit) || 1200;
        const snap   = await getDocs(
            query(
                collection(db, 'clubs', clubId, 'attendance'),
                where('date', '==', date),
                ...(_lim ? [_lim(_attDailyLimit)] : []) // [4J-8] 1200 (up from 500) — bao phủ 1000 võ sinh × 2 ca
            )
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, data: d.data() }));
        return results;
    },

    // ── SAVE / DELETE ATTENDANCE ─────────────────────────────────

    /**
     * Lưu bản ghi điểm danh (setDoc — create hoặc update).
     * @param {string} docId — composite ID: "tên_ngày" hoặc "tên_ngày_shiftId"
     * @param {Object} data  — { profileId, name, belt, branch, date, month, status, ... }
     */
    async saveRecord(docId, data) {
        const { doc, setDoc } = _sdk();
        await setDoc(
            doc(_db(), 'clubs', _clubId(), 'attendance', docId),
            data
        );
    },

    /**
     * Xóa bản ghi điểm danh khi status trở về 0 (chưa điểm danh).
     * @param {string} docId
     */
    async deleteRecord(docId) {
        const { doc, deleteDoc } = _sdk();
        await deleteDoc(
            doc(_db(), 'clubs', _clubId(), 'attendance', docId)
        );
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
    async loadMemberHistory(profileId, months) {
        const { getDocs, query, where, collection } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const snap   = await getDocs(
            query(
                collection(db, 'clubs', clubId, 'attendance'),
                where('profileId', '==', profileId),
                where('month', 'in', months)
            )
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, data: d.data() }));
        return results;
    },

    // ── COACH NOTES ─────────────────────────────────────────────

    /**
     * Load ghi chú buổi tập của HLV theo ngày.
     * @param {string} date — YYYY-MM-DD
     * @returns {Array<{id, data}>}
     */
    async loadCoachNotes(date) {
        const { getDocs, query, where, collection } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const snap   = await getDocs(
            query(
                collection(db, 'clubs', clubId, 'attendanceNotes'),
                where('date', '==', date)
            )
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, data: d.data() }));
        return results;
    },

    // ── LOAD BY MONTH (thống kê tháng) ──────────────────────────────

    /**
     * Load tất cả bản ghi điểm danh theo tháng (cho renderAttMonthly).
     * @param {string} month — YYYY-MM
     * @returns {Array<{id, data}>}
     */
    async loadByMonth(month) {
        const { getDocs, query, where, collection, limit: _limit } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const _lim   = typeof _limit === 'function' ? _limit : null;
        // [4J-8] Safety cap cho monthly load: 1000 võ sinh × 30 ngày × 2 ca = ~60k max.
        // 10000 là ngưỡng hợp lý — vượt qua thì có vấn đề data model.
        const _attMonthlyLimit = ((window.__scaleConfig || {}).attendanceMonthlyLimit) || 10000;
        const _constraints = [where('month', '==', month)];
        if (_lim) _constraints.push(_lim(_attMonthlyLimit)); // [4J-8] guard cap 10000
        const snap   = await getDocs(
            query(
                collection(db, 'clubs', clubId, 'attendance'),
                ..._constraints
            )
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, data: d.data() }));
        return results;
    },

    // ── BULK OPERATIONS ──────────────────────────────────────────────

    /**
     * Lưu nhiều bản ghi điểm danh trong 1 writeBatch (điểm danh hàng loạt).
     * @param {Array<{docId, data}>} records — mảng records cần lưu
     */
    async bulkSaveRecords(records) {
        const { writeBatch, doc } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const batch  = writeBatch(db);
        records.forEach(({ docId, data }) => {
            batch.set(doc(db, 'clubs', clubId, 'attendance', docId), data);
        });
        await batch.commit();
    },

    /**
     * Đồng bộ dữ liệu offline vào Firestore (writeBatch).
     * @param {string}  clubId  — club ID
     * @param {string}  date    — YYYY-MM-DD
     * @param {Object}  records — { name: { name, status, belt, branch, date, month, profileId } }
     */
    async bulkSyncOffline(clubId, date, records) {
        const { writeBatch, doc } = _sdk();
        const db    = _db();
        const batch = writeBatch(db);
        // [4J-6A] Helper shift-aware docId cho backward compat
        function _getAttDocId(name, d, shiftId) {
            return (shiftId && shiftId !== '') ? (name + '_' + d + '_' + shiftId) : (name + '_' + d);
        }
        Object.values(records).forEach(rec => {
            // Ưu tiên docId đã lưu trong record (Phase 4J-6A), fallback legacy
            const docId  = rec.docId || _getAttDocId(rec.name, rec.date || date, rec.shiftId || '');
            const docRef = doc(db, 'clubs', clubId, 'attendance', docId);
            if (!rec.status || rec.status === 0) {
                batch.delete(docRef);
            } else {
                const writeData = { ...rec, timestamp: Date.now() };
                // Đảm bảo shiftId luôn có trong document nếu record có shiftId
                if (rec.shiftId) writeData.shiftId = rec.shiftId;
                // Xóa docId khỏi data ghi Firestore (chỉ dùng làm document path)
                delete writeData.docId;
                batch.set(docRef, writeData);
            }
        });
        await batch.commit();
    },

    // ── MEMBER STATS (chuyên cần thăng đai) ─────────────────────

    /**
     * Cập nhật stats chuyên cần (totalSessionsAttended, consecutiveAbsences...).
     * Ghi vào collection "members" (tách biệt với "profiles" — performance stats).
     * Swallow error vì đây là non-critical background update.
     *
     * @param {string} name   — tên võ sinh
     * @param {Object} data   — FieldValue updates (increment, literal values)
     */
    async updateMemberStats(name, data) {
        const { doc, updateDoc } = _sdk();
        try {
            await updateDoc(
                doc(_db(), 'clubs', _clubId(), 'members', name),
                data
            );
        } catch (_) { /* non-critical — không chặn điểm danh */ }
    },

    /**
     * Trả về Firebase increment FieldValue (dùng trong toggleAttendance).
     * Cho phép module gọi AttendanceService._increment(n) thay vì import SDK trực tiếp.
     * @param {number} n — số nguyên (dương hoặc âm)
     * @returns {FieldValue}
     */
    _increment(n) { return (window._fb_init || {}).increment(n); },
};

/**
 * utils/idb-cache.js — Phase 3.4
 * ────────────────────────────────────────────────────────────────
 * IndexedDB Cache — Lightweight offline cache cho dữ liệu Firestore.
 *
 * MỤC ĐÍCH:
 *   - Cache quit student profiles (ít thay đổi, không cần realtime)
 *   - Cache club config (thay đổi vài lần/tháng)
 *   - Cache Excel export data (tránh re-query khi user export lần 2)
 *   - Offline mode: serve stale data khi mất kết nối
 *
 * TTL (Time-To-Live) mặc định:
 *   - quit profiles: 1 giờ
 *   - club config: 5 phút
 *   - Excel data: 10 phút
 *
 * API:
 *   cacheSet(key, value, ttlMs)  — Lưu vào IndexedDB với TTL
 *   cacheGet(key)                — Lấy từ cache (null nếu expired)
 *   cacheDelete(key)             — Xóa một entry
 *   cacheClearAll()              — Xóa toàn bộ cache
 *   cacheGetOrFetch(key, fetchFn, ttlMs) — Cache-first pattern
 *
 * /// Phase 3.4 — IndexedDB Cache
 * ────────────────────────────────────────────────────────────────
 */

const DB_NAME    = 'taekwondo_cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

// ── Internal ──────────────────────────────────────────────────────────────────

let _db = null;

/**
 * Mở hoặc khởi tạo IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
async function _openDb() {
    if (_db) return _db;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror   = (e) => reject(e.target.error);
    });
}

/**
 * Kiểm tra IndexedDB có hỗ trợ không (Safari private mode tắt IDB).
 * @returns {boolean}
 */
export function isIdbSupported() {
    try {
        return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (_) {
        return false;
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Lưu dữ liệu vào cache với TTL.
 *
 * @param {string} key     — Cache key (ví dụ: 'quit_profiles', 'club_config')
 * @param {any}    value   — Dữ liệu cần cache (sẽ được JSON.stringify)
 * @param {number} ttlMs   — Thời gian sống (milliseconds). Default: 5 phút
 */
export async function cacheSet(key, value, ttlMs = 5 * 60 * 1000) {
    if (!isIdbSupported()) return;
    try {
        const db    = await _openDb();
        const entry = { key, value, expiresAt: Date.now() + ttlMs };
        await new Promise((res, rej) => {
            const tx  = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).put(entry);
            req.onsuccess = () => res();
            req.onerror   = (e) => rej(e.target.error);
        });
    } catch (err) {
        console.warn('[idb-cache] cacheSet failed:', key, err);
    }
}

/**
 * Lấy dữ liệu từ cache.
 * Trả về null nếu không có hoặc đã hết hạn.
 *
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function cacheGet(key) {
    if (!isIdbSupported()) return null;
    try {
        const db = await _openDb();
        const entry = await new Promise((res, rej) => {
            const tx  = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = (e) => res(e.target.result);
            req.onerror   = (e) => rej(e.target.error);
        });
        if (!entry) return null;
        if (entry.expiresAt < Date.now()) {
            // Expired — delete async, return null
            cacheDelete(key).catch(() => {});
            return null;
        }
        return entry.value;
    } catch (err) {
        console.warn('[idb-cache] cacheGet failed:', key, err);
        return null;
    }
}

/**
 * Xóa một entry khỏi cache.
 * @param {string} key
 */
export async function cacheDelete(key) {
    if (!isIdbSupported()) return;
    try {
        const db = await _openDb();
        await new Promise((res, rej) => {
            const tx  = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).delete(key);
            req.onsuccess = () => res();
            req.onerror   = (e) => rej(e.target.error);
        });
    } catch (err) {
        console.warn('[idb-cache] cacheDelete failed:', key, err);
    }
}

/**
 * Xóa toàn bộ cache (dùng khi logout).
 */
export async function cacheClearAll() {
    if (!isIdbSupported()) return;
    try {
        const db = await _openDb();
        await new Promise((res, rej) => {
            const tx  = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).clear();
            req.onsuccess = () => res();
            req.onerror   = (e) => rej(e.target.error);
        });
        console.info('[idb-cache] Cache cleared on logout.');
    } catch (err) {
        console.warn('[idb-cache] cacheClearAll failed:', err);
    }
}

/**
 * Cache-first pattern: Trả về cached data nếu còn hạn,
 * nếu không thì gọi fetchFn() và cache kết quả.
 *
 * @param {string}   key      — Cache key
 * @param {Function} fetchFn  — Async function trả về dữ liệu mới
 * @param {number}   ttlMs    — TTL (ms)
 * @returns {Promise<any>}
 *
 * @example
 *   const quitStudents = await cacheGetOrFetch(
 *       `quit_profiles_${clubId}`,
 *       () => StudentService.getQuitProfiles(),
 *       60 * 60 * 1000  // 1 hour
 *   );
 */
export async function cacheGetOrFetch(key, fetchFn, ttlMs = 5 * 60 * 1000) {
    const cached = await cacheGet(key);
    if (cached !== null) return cached;

    const fresh = await fetchFn();
    await cacheSet(key, fresh, ttlMs);
    return fresh;
}

/**
 * Invalidate cache entries by prefix.
 * Xóa tất cả keys bắt đầu bằng prefix (dùng khi club data thay đổi).
 *
 * @param {string} prefix — ví dụ: 'quit_profiles_club123'
 */
export async function cacheInvalidatePrefix(prefix) {
    if (!isIdbSupported()) return;
    try {
        const db = await _openDb();
        const allKeys = await new Promise((res, rej) => {
            const tx  = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).getAllKeys();
            req.onsuccess = (e) => res(e.target.result);
            req.onerror   = (e) => rej(e.target.error);
        });
        const toDelete = allKeys.filter(k => k.startsWith(prefix));
        await Promise.all(toDelete.map(k => cacheDelete(k)));
        if (toDelete.length > 0) {
            console.info(`[idb-cache] Invalidated ${toDelete.length} entries for prefix "${prefix}"`);
        }
    } catch (err) {
        console.warn('[idb-cache] cacheInvalidatePrefix failed:', prefix, err);
    }
}

// ── Cache Key Constants ───────────────────────────────────────────────────────
/** Recommended TTLs */
export const CACHE_TTL = {
    QUIT_PROFILES:  60 * 60 * 1000,    // 1 hour — quit students rarely change
    CLUB_CONFIG:     5 * 60 * 1000,    // 5 minutes
    EXCEL_DATA:     10 * 60 * 1000,    // 10 minutes
    SHIFTS:         30 * 60 * 1000,    // 30 minutes — shifts rarely change
    COACH_LIST:     15 * 60 * 1000,    // 15 minutes
    LOGIN_HISTORY:   2 * 60 * 1000,    // 2 minutes
};

/**
 * Build a cache key with clubId scope.
 * @param {string} base    — base key name
 * @param {string} clubId  — club ID for namespacing
 * @param {string} [extra] — optional extra discriminator
 * @returns {string}
 */
export function makeCacheKey(base, clubId, extra = '') {
    return extra ? `${base}_${clubId}_${extra}` : `${base}_${clubId}`;
}

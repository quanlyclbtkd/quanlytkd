/**
 * utils/offline-queue.js — Phase 3.4
 * ────────────────────────────────────────────────────────────────
 * Offline Write Queue — Lưu trữ và retry các Firestore writes khi offline.
 *
 * VẤN ĐỀ:
 *   Khi mất mạng, user vẫn có thể thao tác (thêm học phí, điểm danh).
 *   Các thao tác này cần được lưu lại và replay khi có kết nối trở lại.
 *
 * KIẾN TRÚC:
 *   1. Intercept Firestore writes qua `queueWrite(operation)`
 *   2. Lưu vào IndexedDB (offline-queue store)
 *   3. Khi mạng khôi phục → auto-retry từ queue
 *   4. Optimistic UI: cập nhật UI ngay lập tức, rollback nếu thất bại
 *
 * OPERATIONS SUPPORTED:
 *   { type: 'addDoc',    collection, data }
 *   { type: 'setDoc',    path, data, merge }
 *   { type: 'updateDoc', path, data }
 *   { type: 'deleteDoc', path }
 *
 * SỬ DỤNG:
 *   import { queueWrite, startQueueProcessor, getQueueLength } from './offline-queue.js';
 *
 *   // Thay vì: await addDoc(colRef, data);
 *   // Dùng:   await queueWrite({ type: 'addDoc', collection: 'transactions', data });
 *
 * /// Phase 3.4 — Offline Mode + Retry Queue
 * ────────────────────────────────────────────────────────────────
 */

const DB_NAME    = 'taekwondo_cache';
const DB_VERSION = 1;
const QUEUE_STORE = 'offline_queue';

// ── IndexedDB setup ───────────────────────────────────────────────────────────
let _db = null;

async function _openDb() {
    if (_db) return _db;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                const store = db.createObjectStore(QUEUE_STORE, {
                    keyPath: 'id', autoIncrement: true
                });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror   = (e) => reject(e.target.error);
    });
}

// ── Online/Offline State ──────────────────────────────────────────────────────
let _isOnline = navigator.onLine;
let _processorRunning = false;
let _listeners = [];

window.addEventListener('online',  () => { _isOnline = true;  _notifyListeners('online');  processQueue(); });
window.addEventListener('offline', () => { _isOnline = false; _notifyListeners('offline'); });

function _notifyListeners(event) {
    _listeners.forEach(fn => { try { fn(event, _isOnline); } catch (_) {} });
}

/**
 * Đăng ký listener cho online/offline state.
 * @param {Function} fn — (event: 'online'|'offline', isOnline: boolean) => void
 * @returns {Function} unsubscribe function
 */
export function onConnectivityChange(fn) {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
}

/**
 * Kiểm tra trạng thái kết nối hiện tại.
 * @returns {boolean}
 */
export function isOnline() { return _isOnline; }

// ── Queue Operations ──────────────────────────────────────────────────────────

/**
 * Thêm một write operation vào queue.
 * Nếu đang online → thực thi ngay, nếu offline → lưu vào IndexedDB.
 *
 * @param {Object} operation — Write operation
 * @param {string} operation.type         — 'addDoc' | 'setDoc' | 'updateDoc' | 'deleteDoc'
 * @param {string} [operation.collection] — Collection path (addDoc)
 * @param {string} [operation.path]       — Document path (setDoc/updateDoc/deleteDoc)
 * @param {Object} [operation.data]       — Data to write
 * @param {boolean} [operation.merge]     — setDoc merge option
 * @param {string} [operation.optimisticId] — Client-side temp ID for optimistic UI
 *
 * @returns {Promise<{success: boolean, optimisticId?: string, error?: Error}>}
 */
export async function queueWrite(operation) {
    if (_isOnline) {
        // Online: execute immediately
        try {
            const result = await _executeOperation(operation);
            return { success: true, docId: result };
        } catch (err) {
            // If it fails online, queue for retry
            console.warn('[offline-queue] Online write failed, queueing:', err.message);
            await _enqueue(operation);
            return { success: false, queued: true, error: err };
        }
    } else {
        // Offline: queue for later
        await _enqueue(operation);
        return {
            success: false,
            queued: true,
            optimisticId: operation.optimisticId || `optimistic_${Date.now()}`,
        };
    }
}

/**
 * Get number of pending operations in the queue.
 * @returns {Promise<number>}
 */
export async function getQueueLength() {
    try {
        const db = await _openDb();
        return new Promise((res, rej) => {
            const tx  = db.transaction(QUEUE_STORE, 'readonly');
            const req = tx.objectStore(QUEUE_STORE).count();
            req.onsuccess = (e) => res(e.target.result);
            req.onerror   = () => res(0);
        });
    } catch (_) { return 0; }
}

/**
 * Start the queue processor.
 * Call this once on app startup — it auto-processes when online.
 */
export function startQueueProcessor() {
    if (_processorRunning) return;
    _processorRunning = true;

    // Try to process immediately if online
    if (_isOnline) processQueue();

    // Also show offline indicator in UI
    _setupOfflineUI();
}

/**
 * Process all queued operations (called when online).
 */
export async function processQueue() {
    if (!_isOnline) return;
    let count = 0;
    try {
        const db = await _openDb();
        const ops = await _getAllQueued(db);
        if (ops.length === 0) return;

        console.info(`[offline-queue] Processing ${ops.length} queued operations...`);

        for (const op of ops) {
            try {
                await _executeOperation(op);
                await _dequeue(db, op.id);
                count++;
            } catch (err) {
                console.warn(`[offline-queue] Failed to process op #${op.id}:`, err.message);
                // Keep in queue for next retry — stop processing this batch
                break;
            }
        }

        if (count > 0) {
            console.info(`[offline-queue] ✅ Processed ${count} operations.`);
            if (typeof window.showToast === 'function') {
                window.showToast(`✅ Đã đồng bộ ${count} thao tác offline.`);
            }
        }
    } catch (err) {
        console.warn('[offline-queue] processQueue error:', err);
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function _enqueue(operation) {
    try {
        const db = await _openDb();
        const entry = { ...operation, createdAt: Date.now(), retries: 0 };
        await new Promise((res, rej) => {
            const tx  = db.transaction(QUEUE_STORE, 'readwrite');
            const req = tx.objectStore(QUEUE_STORE).add(entry);
            req.onsuccess = () => res();
            req.onerror   = (e) => rej(e.target.error);
        });
    } catch (err) {
        console.error('[offline-queue] Failed to enqueue:', err);
    }
}

async function _getAllQueued(db) {
    return new Promise((res, rej) => {
        const tx  = db.transaction(QUEUE_STORE, 'readonly');
        const req = tx.objectStore(QUEUE_STORE).getAll();
        req.onsuccess = (e) => res(e.target.result || []);
        req.onerror   = () => res([]);
    });
}

async function _dequeue(db, id) {
    return new Promise((res, rej) => {
        const tx  = db.transaction(QUEUE_STORE, 'readwrite');
        const req = tx.objectStore(QUEUE_STORE).delete(id);
        req.onsuccess = () => res();
        req.onerror   = (e) => rej(e.target.error);
    });
}

async function _executeOperation(op) {
    const sdk    = window._fb_init || {};
    const store  = window.__store || {};
    const db     = store.db;
    const clubId = store.clubId;

    if (!db || !clubId) throw new Error('Firebase not initialized');

    const { addDoc, setDoc, updateDoc, deleteDoc, doc, collection } = sdk;

    switch (op.type) {
        case 'addDoc': {
            const colRef = collection(db, op.collection);
            const docRef = await addDoc(colRef, op.data);
            return docRef.id;
        }
        case 'setDoc': {
            const docRef = doc(db, ...op.path.split('/'));
            await setDoc(docRef, op.data, op.merge ? { merge: true } : undefined);
            return op.path;
        }
        case 'updateDoc': {
            const docRef = doc(db, ...op.path.split('/'));
            await updateDoc(docRef, op.data);
            return op.path;
        }
        case 'deleteDoc': {
            const docRef = doc(db, ...op.path.split('/'));
            await deleteDoc(docRef);
            return op.path;
        }
        default:
            throw new Error(`[offline-queue] Unknown operation type: ${op.type}`);
    }
}

function _setupOfflineUI() {
    window.addEventListener('offline', () => {
        let banner = document.getElementById('_offlineBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = '_offlineBanner';
            banner.style.cssText = [
                'position:fixed', 'bottom:0', 'left:0', 'right:0',
                'background:#1e293b', 'color:#f1f5f9',
                'text-align:center', 'padding:8px 16px',
                'font-size:0.82rem', 'font-weight:700',
                'z-index:99998',
            ].join(';');
            banner.textContent = '📴 Mất kết nối — Thao tác sẽ được đồng bộ khi có mạng';
            document.body.appendChild(banner);
        }
        banner.style.display = 'block';
    });
    window.addEventListener('online', () => {
        const banner = document.getElementById('_offlineBanner');
        if (banner) banner.style.display = 'none';
    });
}

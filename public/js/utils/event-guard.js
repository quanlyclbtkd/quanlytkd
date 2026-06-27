/**
 * utils/event-guard.js — Phase 3.3D
 * ────────────────────────────────────────────────────────────────
 * Event Listener Safety — Ngăn duplicate event bindings.
 *
 * VẤN ĐỀ: Các module được gọi nhiều lần (tab switch, re-render) có thể
 *          bind cùng một event listener nhiều lần → memory leak + duplicate actions.
 *
 * GIẢI PHÁP:
 *   1. guardBind(el, event, handler, key) — bind an toàn với key-based dedup
 *   2. guardOnce(key, fn)                 — chạy fn chỉ một lần dù gọi nhiều lần
 *   3. unbindAll(key?)                    — hủy tất cả hoặc một binding cụ thể
 *   4. getBindingCount()                  — debug: số bindings đang active
 *
 * PATTERN 1 — data attribute guard (cho DOM elements):
 *   if (!el.dataset.evtBound) {
 *       el.addEventListener('input', handler);
 *       el.dataset.evtBound = '1';
 *   }
 *
 * PATTERN 2 — registry guard (dùng file này):
 *   guardBind(searchInput, 'input', handler, 'search-input');
 *
 * PATTERN 3 — module init guard:
 *   if (!guardOnce('initStudentsEvents')) return;
 *   // ... bind events ...
 *
 * /// Phase 3.3D — Event Safety
 * ────────────────────────────────────────────────────────────────
 */

/** Registry: key → { el, event, handler } */
const _registry = new Map();

/** One-time guard: key → boolean */
const _onceFlags = new Set();

const _isDev = window.location.hostname === 'localhost'
            || window.location.hostname === '127.0.0.1'
            || window.location.search.includes('debug=1');

/**
 * Bind event listener an toàn với key dedup.
 * Nếu key đã được bind, hủy listener cũ trước khi bind mới.
 *
 * @param {HTMLElement|Document|Window} el  — target element
 * @param {string}   event   — event type ('click', 'input', ...)
 * @param {Function} handler — event handler
 * @param {string}   key     — unique identifier
 * @param {Object}   [opts]  — addEventListener options
 */
export function guardBind(el, event, handler, key, opts) {
    if (!el) {
        if (_isDev) console.warn(`[event-guard] guardBind: element null cho key "${key}"`);
        return;
    }

    if (_registry.has(key)) {
        const old = _registry.get(key);
        try { old.el.removeEventListener(old.event, old.handler, old.opts); } catch (_) {}
        if (_isDev) console.debug(`[event-guard] Re-bind: "${key}" (cũ đã hủy)`);
    }

    el.addEventListener(event, handler, opts);
    _registry.set(key, { el, event, handler, opts });
}

/**
 * Guard để một function chỉ chạy MỘT LẦN.
 * Trả về true lần đầu (caller nên tiếp tục).
 * Trả về false từ lần 2 trở đi (caller nên return sớm).
 *
 * @param {string} key — unique identifier cho block của bạn
 * @returns {boolean}  — true nếu là lần đầu, false nếu đã chạy
 *
 * @example
 *   export function initStudentsEvents() {
 *       if (!guardOnce('students-events')) return;
 *       // ... bind events ...
 *   }
 */
export function guardOnce(key) {
    if (_onceFlags.has(key)) {
        if (_isDev) console.debug(`[event-guard] guardOnce: "${key}" đã chạy, bỏ qua.`);
        return false;
    }
    _onceFlags.add(key);
    return true;
}

/**
 * Reset một guard (cho phép chạy lại — dùng khi logout/re-login).
 * @param {string} key
 */
export function resetGuard(key) {
    _onceFlags.delete(key);
}

/**
 * Reset tất cả guards — gọi khi logout.
 */
export function resetAllGuards() {
    _onceFlags.clear();
    if (_isDev) console.debug('[event-guard] Tất cả guards đã reset.');
}

/**
 * Hủy một binding cụ thể.
 * @param {string} key
 */
export function unbind(key) {
    if (_registry.has(key)) {
        const { el, event, handler, opts } = _registry.get(key);
        try { el.removeEventListener(event, handler, opts); } catch (_) {}
        _registry.delete(key);
    }
}

/**
 * Hủy tất cả bindings — gọi khi logout / cleanup.
 */
export function unbindAll() {
    _registry.forEach(({ el, event, handler, opts }) => {
        try { el.removeEventListener(event, handler, opts); } catch (_) {}
    });
    _registry.clear();
}

/**
 * Số bindings đang active (debug).
 * @returns {number}
 */
export function getBindingCount() {
    return _registry.size;
}

/**
 * Danh sách keys đang active (debug).
 * @returns {string[]}
 */
export function getActiveBindingKeys() {
    return Array.from(_registry.keys());
}

/**
 * Data attribute guard helper — áp dụng pattern 1 cho bất kỳ element nào.
 * Idempotent: an toàn khi gọi nhiều lần.
 *
 * @param {HTMLElement} el
 * @param {string}      event
 * @param {Function}    handler
 * @param {string}      [attrKey='evtBound'] — data attribute name
 */
export function bindOnce(el, event, handler, attrKey = 'evtBound') {
    if (!el || el.dataset[attrKey]) return;
    el.addEventListener(event, handler);
    el.dataset[attrKey] = '1';
}

/**
 * ui/loading.js — Phase 3.3B
 * ────────────────────────────────────────────────────────────────
 * Loading overlay manager — thuần UI, không có Firestore / business logic.
 *
 * EXPORTS:
 *   showLoading(msg?)        — Hiện loading overlay toàn màn hình
 *   hideLoading()            — Ẩn loading overlay
 *   showInlineLoader(el)     — Hiện spinner trong một container cụ thể
 *   hideInlineLoader(el)     — Ẩn spinner inline
 *   registerLoadingGlobals() — Đăng ký lên window (gọi từ main.js)
 *
 * LAZY LOADING HOOK:
 *   Tự động hiện loading khi đang import() module lần đầu, ẩn sau khi xong.
 *   Dùng withLoading(asyncFn, msg?) để wrap bất kỳ async operation nào.
 *
 * /// Phase 3.3B — UI Extraction
 * ────────────────────────────────────────────────────────────────
 */

// ── Private state ─────────────────────────────────────────────
let _loadingCount = 0;       // ref-counted: nhiều caller cùng lúc không xung đột
let _loadingTimer  = null;   // delay trước khi hiện (tránh flicker cho ops nhanh)

// ── DOM helper ────────────────────────────────────────────────

function _getOrCreateOverlay() {
    let el = document.getElementById('_loadingOverlay');
    if (el) return el;

    el = document.createElement('div');
    el.id = '_loadingOverlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = [
        'display:none',
        'position:fixed',
        'inset:0',
        'z-index:99999',
        'background:rgba(10,18,36,0.55)',
        'backdrop-filter:blur(3px)',
        'align-items:center',
        'justify-content:center',
        'flex-direction:column',
        'gap:14px',
    ].join(';');
    el.innerHTML = `
        <div style="
            background:#fff;
            border-radius:18px;
            padding:28px 36px;
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:14px;
            box-shadow:0 12px 40px rgba(0,0,0,0.18);
            min-width:160px;
        ">
            <div class="loading-spinner" style="
                width:38px;height:38px;
                border:4px solid #e2e8f0;
                border-top-color:#0033A0;
                border-radius:50%;
                animation:_ldSpin 0.8s cubic-bezier(0.5,0,0.5,1) infinite;
            "></div>
            <div id="_loadingMsg" style="
                font-size:0.85rem;
                font-weight:700;
                color:#334155;
                text-align:center;
                max-width:200px;
            ">Đang tải...</div>
        </div>
    `;

    // Inject keyframes once
    if (!document.getElementById('_loadingStyles')) {
        const style = document.createElement('style');
        style.id = '_loadingStyles';
        style.textContent = `@keyframes _ldSpin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
    }

    document.body.appendChild(el);
    return el;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Hiện loading overlay.
 * Ref-counted — gọi nhiều lần an toàn, chỉ hiện một lần.
 *
 * @param {string} [msg='Đang tải...'] — Thông điệp hiển thị
 * @param {number} [delay=150]         — ms trước khi hiện (tránh flicker)
 */
export function showLoading(msg = 'Đang tải...', delay = 150) {
    _loadingCount++;
    clearTimeout(_loadingTimer);
    _loadingTimer = setTimeout(() => {
        const el  = _getOrCreateOverlay();
        const txt = document.getElementById('_loadingMsg');
        if (txt) txt.textContent = msg;
        el.style.display = 'flex';
    }, delay);
}

/**
 * Ẩn loading overlay.
 * Chỉ thực sự ẩn khi mọi caller đã gọi hideLoading() (ref-count = 0).
 */
export function hideLoading() {
    _loadingCount = Math.max(0, _loadingCount - 1);
    if (_loadingCount === 0) {
        clearTimeout(_loadingTimer);
        const el = document.getElementById('_loadingOverlay');
        if (el) el.style.display = 'none';
    }
}

/**
 * Force ẩn dù ref-count còn > 0 (dùng khi bị stuck).
 */
export function forceHideLoading() {
    _loadingCount = 0;
    clearTimeout(_loadingTimer);
    const el = document.getElementById('_loadingOverlay');
    if (el) el.style.display = 'none';
}

/**
 * Wrap một async operation với loading overlay.
 * Tự động ẩn overlay dù có lỗi hay không.
 *
 * @param {Function} asyncFn — async function cần chạy
 * @param {string}   [msg]   — Loading message
 * @returns {Promise<any>}   — kết quả của asyncFn
 *
 * @example
 *   await withLoading(() => StudentService.getProfilesPage(...), 'Đang tải võ sinh...');
 */
export async function withLoading(asyncFn, msg = 'Đang tải...') {
    showLoading(msg);
    try {
        return await asyncFn();
    } finally {
        hideLoading();
    }
}

/**
 * Hiện spinner nhỏ trong một container element (không phải toàn màn hình).
 * Trả về function để ẩn spinner đó.
 *
 * @param {HTMLElement} containerEl — container element
 * @param {string}      [cls='']    — extra CSS classes
 * @returns {Function} cleanup function
 */
export function showInlineLoader(containerEl, cls = '') {
    if (!containerEl) return () => {};
    const spinner = document.createElement('div');
    spinner.className = '_inline-spinner ' + cls;
    spinner.style.cssText = 'text-align:center;padding:20px;color:#94a3b8;font-size:0.82rem;';
    spinner.innerHTML = `
        <div style="
            display:inline-block;
            width:24px;height:24px;
            border:3px solid #e2e8f0;
            border-top-color:#0033A0;
            border-radius:50%;
            animation:_ldSpin 0.8s linear infinite;
            margin-bottom:8px;
        "></div>
        <div>Đang tải...</div>
    `;
    containerEl.replaceChildren(spinner);
    return () => { if (spinner.parentNode === containerEl) containerEl.removeChild(spinner); };
}

/**
 * Đăng ký loading functions lên window.
 * Gọi từ main.js một lần trong bootstrap().
 */
export function registerLoadingGlobals() {
    window.showLoading      = showLoading;
    window.hideLoading      = hideLoading;
    window.forceHideLoading = forceHideLoading;
    window.withLoading      = withLoading;
}

/**
 * Phase 4K-6V4D7 — Canonical Branch Identity + Legacy Branch Alias Repair
 *
 * Keeps the current Firestore schema (`branch`) while making its values stable:
 * - Canonical persisted codes: CS1 ... CS10
 * - Legacy primary-branch aliases (`Mặc định`, `default`, empty) are read-compatible
 * - `all` is only accepted for admin filters, never for coach authorization
 */
(function initBranchIdentity(global) {
    'use strict';

    if (global.BranchIdentity && global.BranchIdentity.version === '4K-6V4D7') return;

    const VERSION = '4K-6V4D7';
    const PRIMARY_ALIASES = new Set([
        'mặc định', 'mac dinh', 'default', 'primary', 'cơ sở mặc định', 'co so mac dinh',
        'cs01', 'cs 1', 'cơ sở 1', 'co so 1', '1'
    ]);

    function _fold(value) {
        return String(value == null ? '' : value)
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/\s+/g, ' ');
    }

    function _configuredBranchNameMap() {
        const cfg = (global.__store && global.__store.clubConfig) || global.clubConfig || {};
        const map = Object.create(null);
        for (let i = 1; i <= 10; i++) {
            const name = String(cfg['branchName' + i] || '').trim();
            if (!name) continue;
            map[_fold(name)] = 'CS' + i;
        }
        return map;
    }

    function normalize(value, options) {
        const opts = options || {};
        const allowAll = opts.allowAll === true;
        const fallback = Object.prototype.hasOwnProperty.call(opts, 'fallback')
            ? String(opts.fallback || '')
            : 'CS1';
        const raw = String(value == null ? '' : value).trim();
        const folded = _fold(raw);

        if (allowAll && (folded === 'all' || folded === 'tat ca' || folded === 'tất cả')) return 'all';
        if (!raw) return fallback;
        if (PRIMARY_ALIASES.has(folded)) return 'CS1';

        const configured = _configuredBranchNameMap()[folded];
        if (configured) return configured;

        // Accept real-world legacy forms seen in warnings: CS02, CS 2, CS-2,
        // CS_2, Cơ sở 2, Co so 2, and plain numeric "2".
        const direct = folded.match(/^cs[\s_\-]*0*([1-9]|10)$/i);
        if (direct) return 'CS' + Number(direct[1]);

        const numbered = folded.match(/^(?:co so|cơ sở)[\s_:\-]*0*([1-9]|10)$/i);
        if (numbered) return 'CS' + Number(numbered[1]);

        const numeric = folded.match(/^0*([1-9]|10)$/i);
        if (numeric) return 'CS' + Number(numeric[1]);

        return fallback;
    }

    function isCanonical(value) {
        return /^CS(?:[1-9]|10)$/.test(String(value || '').trim());
    }

    function aliases(value) {
        const code = normalize(value, { fallback: '' });
        if (!code) return [];
        const n = Number(String(code).replace('CS', ''));
        const out = new Set([code, 'CS' + String(n).padStart(2, '0'), 'CS ' + n, 'Cơ sở ' + n, 'Co so ' + n, String(n)]);
        if (code === 'CS1') ['Mặc định', 'mac dinh', 'default'].forEach(v => out.add(v));
        const cfg = (global.__store && global.__store.clubConfig) || global.clubConfig || {};
        const configured = String(cfg['branchName' + n] || '').trim();
        if (configured) out.add(configured);
        return Array.from(out).filter(Boolean);
    }

    function isSameBranch(a, b) {
        const left = normalize(a, { fallback: '' });
        const right = normalize(b, { fallback: '' });
        return !!left && left === right;
    }

    const api = Object.freeze({
        version: VERSION,
        normalize,
        aliases,
        isCanonical,
        isSameBranch,
        primaryCode: 'CS1',
    });

    global.BranchIdentity = api;
    global.normalizeBranchIdentity = normalize;
})(window);

/**
 * Phase 4K-6V4B1 — Canonical Branch Identity
 *
 * Keeps the current Firestore schema (`branch`) while making its values stable:
 * - Canonical persisted codes: CS1 ... CS10
 * - Legacy primary-branch aliases (`Mặc định`, `default`, empty) are read-compatible
 * - `all` is only accepted for admin filters, never for coach authorization
 */
(function initBranchIdentity(global) {
    'use strict';

    if (global.BranchIdentity && global.BranchIdentity.version === '4K-6V4D4') return;

    const VERSION = '4K-6V4D4';
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

        const direct = folded.match(/^cs\s*0*([1-9]|10)$/i);
        if (direct) return 'CS' + Number(direct[1]);

        const numbered = folded.match(/^(?:co so|cơ sở)\s*0*([1-9]|10)$/i);
        if (numbered) return 'CS' + Number(numbered[1]);

        return fallback;
    }

    function isCanonical(value) {
        return /^CS(?:[1-9]|10)$/.test(String(value || '').trim());
    }

    function _configuredBranchName(code) {
        const match = String(code || '').match(/^CS(?:0)?([1-9]|10)$/i);
        if (!match) return '';
        const idx = Number(match[1]);
        const cfg = global.__store?.clubConfig || global.clubConfig || global.__store?.settings || {};
        return String(cfg['branchName' + idx] || '').trim();
    }

    function aliases(value) {
        const code = normalize(value, { fallback: '' });
        if (!code) return [];
        const out = [code];
        if (code === 'CS1') out.push('Mặc định');
        const display = _configuredBranchName(code);
        if (display && !out.some(v => _fold(v) === _fold(display))) out.push(display);
        return out;
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

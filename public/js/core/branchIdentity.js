/**
 * Phase 4K-6V4D8 — Canonical Branch Identity
 *
 * Stable branch identity bridge for Admin + Coach runtime:
 * - Canonical persisted codes: CS1 ... CS10
 * - Legacy primary aliases: Mặc định/default/primary
 * - Configured branch display names: branchName1..branchName10
 * - Can be seeded with config before window.__store.clubConfig is populated.
 */
(function initBranchIdentity(global) {
    'use strict';

    const VERSION = '4K-6V4D8';
    if (global.BranchIdentity && global.BranchIdentity.version === VERSION) return;

    const PRIMARY_ALIASES = new Set([
        'mặc định', 'mac dinh', 'default', 'primary', 'cơ sở mặc định', 'co so mac dinh',
        'cs01', 'cs 1', 'cơ sở 1', 'co so 1', '1'
    ]);
    let seededConfig = {};

    function _fold(value) {
        return String(value == null ? '' : value)
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/\s+/g, ' ');
    }

    function _runtimeConfig(extraConfig) {
        return Object.assign({},
            seededConfig || {},
            global.__store?.clubConfig || {},
            global.clubConfig || {},
            global.__store?.settings || {},
            extraConfig || {}
        );
    }

    function seedConfig(config) {
        if (config && typeof config === 'object') seededConfig = Object.assign({}, seededConfig, config);
        return Object.assign({}, seededConfig);
    }

    function _codeFromConfiguredName(raw, extraConfig) {
        const foldedRaw = _fold(raw);
        if (!foldedRaw) return '';
        const cfg = _runtimeConfig(extraConfig);
        for (let i = 1; i <= 10; i++) {
            const name = String(cfg['branchName' + i] || '').trim();
            if (name && _fold(name) === foldedRaw) return 'CS' + i;
        }
        return '';
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

        const configuredCode = _codeFromConfiguredName(raw, opts.config || opts.clubConfig || null);
        if (configuredCode) return configuredCode;

        return fallback;
    }

    function isCanonical(value) {
        return /^CS(?:[1-9]|10)$/.test(String(value || '').trim());
    }

    function _configuredBranchName(code, extraConfig) {
        const match = String(code || '').match(/^CS(?:0)?([1-9]|10)$/i);
        if (!match) return '';
        const idx = Number(match[1]);
        const cfg = _runtimeConfig(extraConfig);
        return String(cfg['branchName' + idx] || '').trim();
    }

    function aliases(value, options) {
        const opts = options || {};
        const code = normalize(value, { fallback: '', config: opts.config || opts.clubConfig || null });
        if (!code) return [];
        const out = [code];
        if (code === 'CS1') out.push('Mặc định');
        const display = _configuredBranchName(code, opts.config || opts.clubConfig || null);
        if (display && !out.some(v => _fold(v) === _fold(display))) out.push(display);
        return out;
    }

    function isSameBranch(a, b, options) {
        const cfg = options && (options.config || options.clubConfig) || null;
        const left = normalize(a, { fallback: '', config: cfg });
        const right = normalize(b, { fallback: '', config: cfg });
        return !!left && left === right;
    }

    const api = Object.freeze({
        version: VERSION,
        normalize,
        aliases,
        isCanonical,
        isSameBranch,
        seedConfig,
        fold: _fold,
        primaryCode: 'CS1',
    });

    global.BranchIdentity = api;
    global.normalizeBranchIdentity = normalize;
})(window);

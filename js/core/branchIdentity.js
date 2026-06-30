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

    if (global.BranchIdentity && global.BranchIdentity.version === '4K-6V4D9') return;

    const VERSION = '4K-6V4D9';
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

    function _clubConfig() {
        return (global.__store && global.__store.clubConfig) || global.clubConfig || {};
    }

    function _branchIndexFromCode(code) {
        const match = String(code || '').trim().match(/^CS([1-9]|10)$/);
        return match ? Number(match[1]) : 0;
    }

    function _configuredBranchName(index) {
        const cfg = _clubConfig();
        return String((cfg && cfg['branchName' + index]) || '').trim();
    }

    function _configuredNameMatches(foldedRaw, index) {
        const name = _configuredBranchName(index);
        if (!name) return false;
        const variants = [
            name,
            'Cơ sở ' + name,
            'Co so ' + name,
            'Cơ Sở ' + name,
            'CS' + index + ' ' + name,
            'CS' + index + ' - ' + name
        ];
        return variants.some(v => _fold(v) === foldedRaw);
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

        // Phase 4K-6V4D9: dữ liệu cũ có thể lưu branch bằng tên cơ sở
        // (ví dụ "Nguyễn Trãi" hoặc "Cơ sở Nguyễn Trãi") thay vì CS2.
        for (let i = 1; i <= 10; i++) {
            if (_configuredNameMatches(folded, i)) return 'CS' + i;
        }

        return fallback;
    }

    function isCanonical(value) {
        return /^CS(?:[1-9]|10)$/.test(String(value || '').trim());
    }

    function aliases(value) {
        const code = normalize(value, { fallback: '' });
        if (!code) return [];
        const idx = _branchIndexFromCode(code);
        const out = [];
        const add = (v) => {
            const raw = String(v == null ? '' : v).trim();
            if (raw && !out.includes(raw)) out.push(raw);
        };
        add(code);
        if (idx) {
            add('CS' + String(idx).padStart(2, '0'));
            add('CS ' + idx);
            add('Cơ sở ' + idx);
            add('Co so ' + idx);
            add(String(idx));
            const name = _configuredBranchName(idx);
            if (name) {
                add(name);
                add('Cơ sở ' + name);
                add('Co so ' + name);
                add('Cơ Sở ' + name);
                add(code + ' ' + name);
                add(code + ' - ' + name);
            }
        }
        if (code === 'CS1') {
            ['Mặc định', 'mac dinh', 'default', 'primary', 'Cơ sở mặc định', 'Co so mac dinh'].forEach(add);
        }
        return out;
    }

    function isSameBranch(a, b) {
        const left = normalize(a, { fallback: '' });
        const right = normalize(b, { fallback: '' });
        return !!left && left === right;
    }

    const api = Object.freeze({
        version: '4K-6V4D9',
        normalize,
        aliases,
        isCanonical,
        isSameBranch,
        primaryCode: 'CS1',
    });

    global.BranchIdentity = api;
    global.normalizeBranchIdentity = normalize;
})(window);

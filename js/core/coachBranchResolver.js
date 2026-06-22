/**
 * Phase 4K-6V4C2A — Coach Branch Resolution + Legacy Account Repair
 *
 * Canonical rules:
 * - Missing branch is truly missing. It is never silently treated as all branches.
 * - Explicit all-branch scope is stored as "all".
 * - Single-branch clubs use the legacy profile storage value "Mặc định" so
 *   coach profile/attendance queries match existing student documents.
 * - Multi-branch clubs use CS1..CS10.
 * - Legacy field names and display-name values are normalized safely.
 */
(function initCoachBranchResolver(global) {
    'use strict';

    if (global.CoachBranchResolver && global.CoachBranchResolver.version === '4K-6V4C2A') return;

    const VERSION = '4K-6V4C2A';
    const ALL = 'all';
    const SINGLE_DEFAULT = 'Mặc định';

    function fold(value) {
        return String(value == null ? '' : value)
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function branchCount(config) {
        const n = Number(config && config.branchCount);
        if (Number.isFinite(n) && n > 0) return Math.min(10, Math.floor(n));
        let inferred = 0;
        for (let i = 1; i <= 10; i++) {
            if (config && String(config['branchName' + i] || '').trim()) inferred = i;
        }
        return inferred > 0 ? inferred : 1;
    }

    function storageValueForIndex(index, config) {
        const idx = Number(index);
        if (!Number.isFinite(idx) || idx < 1 || idx > 10) return '';
        return branchCount(config) === 1 && idx === 1 ? SINGLE_DEFAULT : 'CS' + idx;
    }

    function isAllToken(value) {
        const key = fold(value);
        return [
            'all', 'all branches', 'all branch', 'tat ca', 'tat ca co so',
            'toan clb', 'toan cau lac bo', 'khong gioi han', 'global', '*'
        ].includes(key) || String(value || '').trim() === '*';
    }

    function extractRaw(data) {
        if (data == null) return '';
        if (typeof data === 'string' || typeof data === 'number') return String(data);
        if (typeof data !== 'object') return '';
        if (String(data.branchScope || '').toLowerCase() === 'all' || data.allBranches === true) return ALL;
        const fields = [
            'branch', 'branchId', 'branchCode', 'coachBranch', 'assignedBranch',
            'assignedBranchId', 'assignedBranchCode', 'facility', 'base',
            'location', 'branchName'
        ];
        for (const field of fields) {
            if (data[field] != null && String(data[field]).trim()) return String(data[field]).trim();
        }
        if (Array.isArray(data.branches) && data.branches.length === 1) return String(data.branches[0] || '').trim();
        return '';
    }

    function normalize(value, config) {
        const raw = extractRaw(value);
        if (!raw) return '';
        if (isAllToken(raw)) return ALL;

        const count = branchCount(config);
        const key = fold(raw);
        if (!key) return '';

        if (key === 'mac dinh' || key === 'default') {
            return SINGLE_DEFAULT;
        }

        let match = key.match(/^cs\s*0*([1-9]|10)$/);
        if (!match) match = key.match(/^co so\s*0*([1-9]|10)$/);
        if (!match) match = key.match(/^branch\s*0*([1-9]|10)$/);
        if (!match) match = key.match(/^0*([1-9]|10)$/);
        if (match) return storageValueForIndex(Number(match[1]), config);

        for (let i = 1; i <= count; i++) {
            const configured = config && config['branchName' + i];
            if (configured && fold(configured) === key) return storageValueForIndex(i, config);
        }

        // Single-branch legacy clubs sometimes store the only branch's display label.
        if (count === 1) {
            const onlyName = config && config.branchName1;
            if (!onlyName || fold(onlyName) === key) return SINGLE_DEFAULT;
        }

        return '';
    }

    function resolveFromSources(sources, config) {
        for (const source of (Array.isArray(sources) ? sources : [])) {
            const branch = normalize(source, config);
            if (branch) return branch;
        }
        return '';
    }

    function queryValues(value, config) {
        const raw = extractRaw(value);
        const canonical = normalize(value, config);
        if (!canonical || canonical === ALL) return [];
        const values = [];
        function push(candidate) {
            const text = String(candidate == null ? '' : candidate).trim();
            if (text && !values.includes(text)) values.push(text);
        }
        push(canonical);
        push(raw);
        if (canonical === SINGLE_DEFAULT) {
            push(SINGLE_DEFAULT);
            push('CS1');
            push(config && config.branchName1);
            push('Cơ sở 1');
        } else {
            const match = String(canonical).match(/^CS([1-9]|10)$/);
            if (match) {
                const idx = Number(match[1]);
                push(config && config['branchName' + idx]);
                push('Cơ sở ' + idx);
            }
        }
        return values;
    }

    function display(value, config) {
        const branch = normalize(value, config) || String(value || '').trim();
        if (!branch) return 'Chưa gán cơ sở';
        if (branch === ALL) return 'Tất cả cơ sở';
        if (branch === SINGLE_DEFAULT) return (config && config.branchName1) || 'Cơ sở 1';
        const match = String(branch).match(/^CS([1-9]|10)$/);
        if (match) {
            const idx = Number(match[1]);
            return (config && config['branchName' + idx]) || ('Cơ sở ' + idx);
        }
        return String(branch);
    }

    function listOptions(config, options) {
        const opts = options || {};
        const out = [];
        if (opts.includePlaceholder !== false) out.push({ value: '', label: '— Chọn cơ sở phụ trách —' });
        if (opts.includeAll === true) out.push({ value: ALL, label: 'Tất cả cơ sở (Reads cao hơn)' });
        const count = branchCount(config);
        for (let i = 1; i <= count; i++) {
            out.push({
                value: storageValueForIndex(i, config),
                label: (config && config['branchName' + i]) || ('Cơ sở ' + i),
            });
        }
        return out;
    }

    const api = {
        version: VERSION,
        ALL,
        SINGLE_DEFAULT,
        fold,
        branchCount,
        storageValueForIndex,
        isAllToken,
        extractRaw,
        normalize,
        resolveFromSources,
        queryValues,
        display,
        listOptions,
        isMissing(value, config) { return !normalize(value, config); },
        isAll(value, config) { return normalize(value, config) === ALL; },
        isSpecific(value, config) {
            const normalized = normalize(value, config);
            return !!normalized && normalized !== ALL;
        },
    };

    global.CoachBranchResolver = api;
    global.normalizeCoachBranch = normalize;
    global.getCoachBranchDisplay = display;
})(window);

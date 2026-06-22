/**
 * Phase 4K-6V4C1A — Coach Branch Resolution + Attendance Recovery
 *
 * Resolves legacy coach branch values to canonical CS1..CS10 without ever
 * widening a multi-branch coach to the whole club.  Classic script so auth,
 * listeners and ES modules share one runtime source of truth.
 */
(function initCoachBranchResolver(global) {
    'use strict';

    if (global.CoachBranchResolver && global.CoachBranchResolver.version === '4K-6V4C1A') return;

    const VERSION = '4K-6V4C1A';
    const state = {
        resolved: false,
        branch: '',
        singleBranch: false,
        branchCount: 0,
        branchNames: [],
        aliases: [],
        source: '',
        reason: 'not-resolved',
        rawCandidates: [],
        conflict: false,
        updatedAt: 0,
    };

    function strip(value) {
        return String(value == null ? '' : value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function configShape(config) {
        const cfg = config || {};
        const count = Math.max(1, Math.min(Number(cfg.branchCount || 1) || 1, 10));
        const names = [];
        for (let i = 1; i <= count; i++) names.push(String(cfg['branchName' + i] || ('Cơ sở ' + i)).trim());
        return { count, names };
    }

    function normalize(rawValue, config) {
        const raw = String(rawValue == null ? '' : rawValue).trim();
        const { count, names } = configShape(config);
        const singleBranch = count === 1;
        const norm = strip(raw);

        if (!raw || ['all', 'tat ca', 'tat ca co so', 'khong gioi han'].includes(norm)) {
            return singleBranch ? 'CS1' : '';
        }
        if (singleBranch && ['mac dinh', 'default', 'chung', 'co so'].includes(norm)) return 'CS1';

        let match = raw.match(/^\s*CS\s*0*(\d{1,2})\s*$/i);
        if (!match) match = norm.match(/^co\s*so\s*0*(\d{1,2})$/i);
        if (!match) match = norm.match(/^0*(\d{1,2})$/);
        if (match) {
            const n = Number(match[1]);
            return n >= 1 && n <= count ? 'CS' + n : '';
        }

        for (let i = 1; i <= count; i++) {
            if (norm === strip(names[i - 1])) return 'CS' + i;
        }
        return '';
    }

    function aliasesFor(branch, config) {
        const { count, names } = configShape(config);
        const match = String(branch || '').match(/^CS(\d+)$/i);
        if (!match) return [];
        const n = Number(match[1]);
        if (n < 1 || n > count) return [];
        const values = [
            'CS' + n,
            'cs' + n,
            'CS ' + n,
            'Cơ sở ' + n,
            'Cơ Sở ' + n,
            'Co so ' + n,
            names[n - 1],
        ];
        if (count === 1) values.push('Mặc định', 'Mac dinh', 'Default', 'Chung');
        return Array.from(new Set(values.map(v => String(v || '').trim()).filter(Boolean))).slice(0, 10);
    }

    function resolve(input) {
        const value = input || {};
        const config = value.config || {};
        const shape = configShape(config);
        const candidates = Array.isArray(value.candidates) ? value.candidates : [];
        const rawCandidates = candidates.map(item => {
            if (item && typeof item === 'object') return { source: String(item.source || 'unknown'), value: item.value };
            return { source: 'unknown', value: item };
        });
        const valid = [];
        rawCandidates.forEach(item => {
            const branch = normalize(item.value, config);
            if (branch) valid.push({ source: item.source, raw: String(item.value || ''), branch });
        });

        // coaches/{uid} is authoritative when populated; otherwise use users/cache.
        const selected = valid[0] || (shape.count === 1 ? { source: 'single-branch-default', raw: '', branch: 'CS1' } : null);
        const distinct = Array.from(new Set(valid.map(item => item.branch)));
        return {
            resolved: !!selected,
            branch: selected ? selected.branch : '',
            singleBranch: shape.count === 1,
            branchCount: shape.count,
            branchNames: shape.names,
            aliases: selected ? aliasesFor(selected.branch, config) : [],
            source: selected ? selected.source : '',
            reason: selected ? 'resolved' : 'missing-or-invalid-multi-branch',
            rawCandidates,
            conflict: distinct.length > 1,
            conflictBranches: distinct,
            clubId: String(value.clubId || ''),
            uid: String(value.uid || ''),
            updatedAt: Date.now(),
        };
    }

    function apply(resolution) {
        const result = resolution || {};
        Object.assign(state, {
            resolved: !!result.resolved,
            branch: result.resolved ? String(result.branch || '') : '',
            singleBranch: !!result.singleBranch,
            branchCount: Number(result.branchCount || 0),
            branchNames: Array.isArray(result.branchNames) ? result.branchNames.slice() : [],
            aliases: Array.isArray(result.aliases) ? result.aliases.slice() : [],
            source: String(result.source || ''),
            reason: String(result.reason || ''),
            rawCandidates: Array.isArray(result.rawCandidates) ? result.rawCandidates.slice() : [],
            conflict: !!result.conflict,
            updatedAt: Date.now(),
        });
        global.coachBranch = state.branch;
        global.__coachBranchResolution = diagnostics();
        if (global.__store) {
            global.__store.coachBranch = state.branch;
            global.__store.coachBranchResolution = diagnostics();
        }
        if (global.RoleReadBoundary && typeof global.RoleReadBoundary.setContext === 'function') {
            global.RoleReadBoundary.setContext({ coachBranch: state.branch });
        }
        return diagnostics();
    }

    function reset(reason) {
        Object.assign(state, {
            resolved: false,
            branch: '',
            singleBranch: false,
            branchCount: 0,
            branchNames: [],
            aliases: [],
            source: '',
            reason: String(reason || 'reset'),
            rawCandidates: [],
            conflict: false,
            updatedAt: Date.now(),
        });
        global.coachBranch = '';
        global.__coachBranchResolution = diagnostics();
    }

    function diagnostics() {
        return {
            version: VERSION,
            resolved: state.resolved,
            branch: state.branch,
            singleBranch: state.singleBranch,
            branchCount: state.branchCount,
            branchNames: state.branchNames.slice(),
            aliases: state.aliases.slice(),
            source: state.source,
            reason: state.reason,
            conflict: state.conflict,
            rawCandidates: state.rawCandidates.slice(),
            updatedAt: state.updatedAt,
        };
    }

    function isSingleBranchScope() { return !!state.resolved && !!state.singleBranch; }
    function shouldOmitBranchFilter() { return isSingleBranchScope(); }
    function matchesBranch(value) {
        if (!state.resolved) return false;
        if (state.singleBranch) return true;
        const cfg = { branchCount: state.branchCount };
        state.branchNames.forEach((name, i) => { cfg['branchName' + (i + 1)] = name; });
        return normalize(value, cfg) === state.branch;
    }

    const api = {
        version: VERSION,
        strip,
        normalize,
        aliasesFor,
        resolve,
        apply,
        reset,
        diagnostics,
        isSingleBranchScope,
        shouldOmitBranchFilter,
        matchesBranch,
    };

    global.CoachBranchResolver = api;
    global.normalizeCoachBranch = normalize;
    global.printCoachBranchResolution = function() {
        const result = diagnostics();
        if (global.console?.table) global.console.table(result);
        else global.console?.log(result);
        return result;
    };
})(window);

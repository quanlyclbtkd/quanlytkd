/**
 * Phase 4K-6V4B — Security-Enforced Coach Boundary + Canonical Branch Identity
 *
 * Purpose:
 * - Coach accounts may read only the club/config data required for Attendance.
 * - Admin/SuperAdmin behavior remains unchanged.
 * - Every blocked Firestore source is recorded for diagnostics.
 *
 * Classic script: it must load before transaction/listener bootstraps and app.js.
 */
(function initRoleReadBoundary(global) {
    'use strict';

    if (global.RoleReadBoundary && global.RoleReadBoundary.version === '4K-6V4B') return;

    const VERSION = '4K-6V4B';
    const COACH_ALLOWED_TABS = new Set(['attendance']);
    const COACH_ALLOWED_SOURCES = new Set([
        'club.config',
        'settings.main',
        'profiles.active',
        'attendance.daily',
        'attendance.monthly',
        'attendance.notes',
        'attendance.shifts',
        'attendance.member-history',
    ]);

    const state = {
        role: '',
        coachBranch: '',
        clubId: '',
        configuredAt: 0,
        allowed: Object.create(null),
        blocked: Object.create(null),
        events: [],
    };

    function normalizeRole(value) {
        const role = String(value || '').trim().toLowerCase().replace(/-/g, '_');
        if (role === 'hlv' || role === 'trainer') return 'coach';
        if (role === 'superadmin') return 'super_admin';
        return role;
    }

    function normalizeBranch(value, fallback) {
        if (global.BranchIdentity && typeof global.BranchIdentity.normalize === 'function') {
            return global.BranchIdentity.normalize(value, { fallback: fallback == null ? '' : fallback });
        }
        const raw = String(value || '').trim();
        if (!raw) return fallback == null ? '' : String(fallback || '');
        if (/^(mặc định|mac dinh|default)$/i.test(raw)) return 'CS1';
        const match = raw.match(/^CS0*([1-9]|10)$/i);
        return match ? ('CS' + Number(match[1])) : (fallback == null ? '' : String(fallback || ''));
    }

    function readContext() {
        const store = global.__store || {};
        return {
            role: normalizeRole(state.role || global.userRole || store.userRole),
            coachBranch: normalizeBranch(state.coachBranch || global.coachBranch || store.coachBranch || '', ''),
            clubId: String(state.clubId || global.currentClubId || store.currentClubId || store.clubId || '').trim(),
        };
    }

    function setContext(input) {
        const value = input || {};
        if (Object.prototype.hasOwnProperty.call(value, 'role')) state.role = normalizeRole(value.role);
        if (Object.prototype.hasOwnProperty.call(value, 'coachBranch')) state.coachBranch = normalizeBranch(value.coachBranch, '');
        if (Object.prototype.hasOwnProperty.call(value, 'clubId')) state.clubId = String(value.clubId || '').trim();
        state.configuredAt = Date.now();
        return readContext();
    }

    function isCoachAttendanceOnly() {
        return readContext().role === 'coach';
    }

    function record(kind, source, details) {
        const name = String(source || 'unknown');
        const bucket = kind === 'blocked' ? state.blocked : state.allowed;
        bucket[name] = (bucket[name] || 0) + 1;
        state.events.push({
            at: Date.now(),
            kind,
            source: name,
            details: details || null,
        });
        if (state.events.length > 120) state.events.splice(0, state.events.length - 120);
    }

    function canMount(source, details) {
        const name = String(source || 'unknown');
        if (!isCoachAttendanceOnly()) {
            record('allowed', name, details);
            return true;
        }

        const context = readContext();
        const allowed = COACH_ALLOWED_SOURCES.has(name) &&
            (name !== 'profiles.active' || !!context.coachBranch);
        record(allowed ? 'allowed' : 'blocked', name, details);
        if (!allowed && global.console && typeof global.console.info === 'function') {
            global.console.info('[RoleReadBoundary] Coach read blocked:', name, details || '');
        }
        return allowed;
    }

    function enforceTab(tabId) {
        const requested = String(tabId || '').replace(/^tab_/, '');
        if (!isCoachAttendanceOnly()) return requested;
        if (COACH_ALLOWED_TABS.has(requested)) return requested;
        record('blocked', 'tab.' + (requested || 'unknown'), { redirect: 'attendance' });
        return 'attendance';
    }

    function scopeKey(base, details) {
        const ctx = readContext();
        const prefix = String(base || 'listener');
        if (ctx.role === 'coach') {
            return prefix + ':coach:' + (ctx.coachBranch || 'missing-branch') + ':' + (ctx.clubId || 'missing-club');
        }
        return prefix + ':' + (ctx.role || 'unknown') + ':' + (ctx.clubId || 'missing-club') + (details ? ':' + String(details) : '');
    }

    function requireCoachBranch(source) {
        if (!isCoachAttendanceOnly()) return true;
        const branch = readContext().coachBranch;
        const ok = !!branch;
        if (!ok) record('blocked', source || 'coach.branch', { reason: 'missing-coach-branch' });
        return ok;
    }

    function reset(reason) {
        state.role = '';
        state.coachBranch = '';
        state.clubId = '';
        state.configuredAt = 0;
        state.allowed = Object.create(null);
        state.blocked = Object.create(null);
        state.events = [];
        if (reason) state.events.push({ at: Date.now(), kind: 'reset', source: String(reason), details: null });
    }

    function diagnostics() {
        const ctx = readContext();
        return {
            version: VERSION,
            role: ctx.role,
            coachBranch: ctx.coachBranch,
            clubId: ctx.clubId,
            attendanceOnly: ctx.role === 'coach',
            allowed: Object.assign({}, state.allowed),
            blocked: Object.assign({}, state.blocked),
            recentEvents: state.events.slice(-40),
            coachAllowedSources: Array.from(COACH_ALLOWED_SOURCES),
            expectedCoachBlockedSources: [
                'transactions.month',
                'transactions.pagination',
                'inventory.stats',
                'inventory.active-debts',
                'inventory.history',
                'dashboard.history',
                'debt.coverage',
                'profiles.quit',
                'profiles.export-all',
                'students.pagination',
                'exam.settings',
                'admin.notifications',
                'club.stats-cache',
            ],
        };
    }

    function printDiagnostics() {
        const result = diagnostics();
        if (global.console && typeof global.console.group === 'function') {
            global.console.group('[RoleReadBoundary] Firestore read budget');
            global.console.table ? global.console.table({
                role: result.role,
                coachBranch: result.coachBranch,
                clubId: result.clubId,
                attendanceOnly: result.attendanceOnly,
            }) : global.console.log(result);
            global.console.log('Allowed:', result.allowed);
            global.console.log('Blocked:', result.blocked);
            global.console.log('Recent events:', result.recentEvents);
            global.console.groupEnd();
        }
        return result;
    }

    const api = {
        version: VERSION,
        normalizeRole,
        normalizeBranch,
        setContext,
        readContext,
        isCoachAttendanceOnly,
        canMount,
        enforceTab,
        scopeKey,
        requireCoachBranch,
        reset,
        diagnostics,
        printDiagnostics,
    };

    global.RoleReadBoundary = api;
    global.shouldMountFirestoreSource = canMount;
    global.enforceRoleTab = enforceTab;
    global.printRoleReadBudget = printDiagnostics;
})(window);

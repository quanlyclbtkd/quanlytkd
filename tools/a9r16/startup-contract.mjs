// QA-only readiness evidence. Does not assign application state or call Firebase.
export function identityEvidence(expected, actual) {
    const wanted = expected.slice().sort(), found = actual.slice().sort();
    const valid = values => values.every(x => typeof x === 'string' && x.length > 0);
    const unique = new Set(found), target = new Set(wanted);
    return { ok: valid(wanted) && valid(found) && target.size === wanted.length && unique.size === found.length && wanted.length === found.length && wanted.every((id, i) => id === found[i]),
        count: found.length, duplicates: found.length - unique.size,
        missing: wanted.filter(id => !unique.has(id)), unexpected: found.filter(id => !target.has(id)) };
}

export function interactiveEvidence(win, doc) {
    const context = win.__verifiedAuthContextState;
    const visible = el => !!el && el.getClientRects().length > 0 && win.getComputedStyle(el).visibility !== 'hidden';
    const controls = ['att_branch', 'att_shift', 'att_date'].map(id => doc.getElementById(id));
    const branch = context?.activeBranch || context?.coachBranch || '';
    const overlay = doc.getElementById('_loadingOverlay'), login = doc.getElementById('loginOverlay');
    const failures = [];
    if (context?.ready !== true || context.role !== 'coach' || !context.uid || context.uid !== win.__QA?.uid) failures.push('VERIFIED_COACH_CONTEXT_REQUIRED');
    if (!branch || !context?.allowedBranches?.includes(branch)) failures.push('AUTHORIZED_ACTIVE_BRANCH_REQUIRED');
    if (!visible(doc.getElementById('mainApp')) || (login && visible(login))) failures.push('PROTECTED_SHELL_NOT_VISIBLE');
    const tab = doc.getElementById('tab_attendance');
    if (!visible(tab) || !tab.classList.contains('active')) failures.push('ATTENDANCE_TAB_NOT_VISIBLE');
    if (!win.AttendanceModule || typeof win.onShiftChange !== 'function') failures.push('ATTENDANCE_INITIALIZER_REQUIRED');
    if (!controls.every(el => visible(el) && !el.disabled && win.getComputedStyle(el).pointerEvents !== 'none' && el.dataset.evtBound === '1')) failures.push('CONTROLS_NOT_USABLE');
    if (controls[0]?.value !== branch) failures.push('BRANCH_SELECTOR_CONTEXT_MISMATCH');
    if (!Array.from(controls[1]?.options || []).some(x => x.value && !x.disabled)) failures.push('SHIFT_OPTIONS_NOT_READY');
    if (overlay && visible(overlay)) failures.push('MODULE_LOADING_OVERLAY_VISIBLE');
    return {ok: failures.length === 0, failures, uid: context?.uid || '', branch};
}

export function authorityEvidence(win, doc, expectedIds) {
    const shell = interactiveEvidence(win, doc), failures = shell.failures.slice();
    const daily = win.AttendanceModule?.getDailyState?.();
    if (daily?.cacheReady !== true || !daily.serverConfirmedContext || daily.inFlightKeys?.length !== 0) failures.push('DAILY_SERVER_AUTHORITY_REQUIRED');
    const profiles = win.getProfilesListenerMetrics?.();
    if (profiles?.coachRosterReadiness !== 'verified' || profiles.activeProfileCount !== expectedIds.length) failures.push('PROFILE_SERVER_AUTHORITY_REQUIRED');
    const stored = win.studentProfileStore?.getAllProfilesCompat?.() || win.__store?.profiles || {};
    const rendered = Array.from(doc.querySelectorAll('#attendanceGrid [id^="att_card_"]')).map(card => {
        // Positional card IDs are presentation only. Read the existing canonical
        // profileId payload of the member-history action, never display text.
        const code = card.querySelector('[data-hidx]')?.getAttribute('onclick') || '';
        const match = code.match(/showAttMemberHistory\(decodeURIComponent\('([^']*)'\)\)/);
        try { return match ? decodeURIComponent(match[1]) : ''; } catch { return ''; }
    });
    const cohorts = {
        canonicalStore: identityEvidence(expectedIds, Object.keys(stored)),
        filteredRoster: identityEvidence(expectedIds, Object.keys(win.currentAttendanceData || {})),
        renderedDOM: identityEvidence(expectedIds, rendered),
    };
    for (const [key, value] of Object.entries(cohorts)) if (!value.ok) failures.push('IDENTITY_SET_MISMATCH:' + key);
    return {ok: failures.length === 0, failures, cohorts, branch: shell.branch};
}

export function classifyStartupFailure(error, events = []) {
    if (['FAIL_RUNTIME','FAIL_SECURITY','FAIL_PERFORMANCE','FAIL_TEST_HARNESS','ENV_BLOCKED','SCOPE_VIOLATION','RELEASE_BLOCKED'].includes(error?.qaClassification)) return error.qaClassification;
    if (events.some(e => e.kind === 'pageerror')) return 'FAIL_RUNTIME';
    const message = String(error?.message || error || '');
    if (error?.code === 'permission-denied') return 'FAIL_SECURITY';
    if (error?.code === 'ERR_ASSERTION' || /ReferenceError|TypeError|SyntaxError/.test(message)) return 'FAIL_RUNTIME';
    if (/TEST_DEPENDENCY_MISSING|TEST_BROWSER_MISSING|Timeout|timed out|ECONNREFUSED/.test(message)) return 'ENV_BLOCKED';
    return 'FAIL_TEST_HARNESS';
}

export function browserContractSource() {
    return [identityEvidence, interactiveEvidence, authorityEvidence].map(fn => fn.toString()).join('\n') +
        '\nwindow.__qaStartupContract={identityEvidence,interactiveEvidence,authorityEvidence};';
}

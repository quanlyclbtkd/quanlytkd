// Pure registration contract. settings/shifts.list remains the only shift store.
// A9R14 allows no shift and no selected days; JS weekday numbering stays 0..6.
export function trainingBranch(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (globalThis.window?.BranchIdentity?.normalize) return window.BranchIdentity.normalize(raw,{fallback:''});
    return /^(Mặc định|mac dinh|default)$/i.test(raw) ? 'CS1' : raw;
}
export function trainingDaysValid(value) {
    return value == null || (Array.isArray(value) && value.every(day => Number.isInteger(day) && day >= 0 && day <= 6));
}
export function shiftAuthority(shift) {
    const branch = trainingBranch(shift?.branch);
    // Strict authority for new shift writes. Legacy read/use scope is separate.
    return /^CS(?:[1-9]|10)$/.test(branch) ? {resolved:true,branch} : {resolved:false,branch:''};
}
export function classifyShiftScope(shift) {
    const authority = shiftAuthority(shift);
    if (authority.resolved) return {...authority,scope:'EXPLICIT_BRANCH'};
    // A9R14 stored Admin-created shifts with a blank branch and read them as
    // global. Preserve that stored-data contract without admitting new writes.
    if (shift && typeof shift === 'object' && (shift.branch == null ||
        (typeof shift.branch === 'string' && shift.branch.trim() === ''))) {
        return {resolved:true,branch:'',scope:'LEGACY_GLOBAL'};
    }
    return {...authority,scope:'INVALID'};
}
export function resolveTrainingShift(id, shifts = []) {
    if (typeof id !== 'string' || !id) return null;
    const matches = Array.isArray(shifts) ? shifts.filter(shift => shift?.id === id) : [];
    return matches.length === 1 ? matches[0] : null;
}
export function isShiftEligibleForBranch(shift, branch) {
    const canonicalBranch = trainingBranch(branch),scope = classifyShiftScope(shift);
    if (!/^CS(?:[1-9]|10)$/.test(canonicalBranch)) return false;
    return scope.scope === 'LEGACY_GLOBAL' || (scope.resolved && scope.branch === canonicalBranch);
}
export function inspectTrainingRegistration(profile = {}, shifts = []) {
    const profileBranch = trainingBranch(profile.branch);
    const id = profile.trainingShiftId;
    const trainingShiftId = typeof id === 'string' ? id : '';
    const shift = resolveTrainingShift(trainingShiftId,shifts);
    const authority = classifyShiftScope(shift);
    const issues = [];
    if (!trainingDaysValid(profile.trainingDays)) issues.push('TRAINING_DAYS_INVALID');
    if (id != null && typeof id !== 'string') issues.push('SHIFT_NOT_FOUND');
    else if (trainingShiftId) {
        if (!shift) issues.push('SHIFT_NOT_FOUND');
        else if (!authority.resolved) issues.push('SHIFT_AUTHORITY_UNRESOLVED');
        else if (!isShiftEligibleForBranch(shift,profileBranch)) issues.push('SHIFT_BRANCH_MISMATCH');
    }
    return {profileBranch,trainingShiftId,shiftBranch:authority.branch || null,shiftScope:authority.scope,
        result:issues[0] || (trainingShiftId ? 'TRAINING_REGISTRATION_OK' : 'NO_SHIFT_ASSIGNED'),issues};
}
export function registrationMessage(result) {
    const branchName = value => /^CS\d+$/.test(value || '') ? 'Cơ sở ' + value.slice(2) : (value || 'chưa xác định');
    switch (result.result) {
        case 'SHIFT_BRANCH_MISMATCH': return 'Võ sinh thuộc ' + branchName(result.profileBranch) + ' nhưng Ca tập đã chọn thuộc ' + branchName(result.shiftBranch) + '. Vui lòng chọn lại Ca tập.';
        case 'SHIFT_NOT_FOUND': return 'Ca tập đã đăng ký không tồn tại hoặc ID không hợp lệ. Admin cần chọn lại Ca tập.';
        case 'SHIFT_AUTHORITY_UNRESOLVED': return 'Ca tập chưa có cơ sở được xác minh. Admin cần kiểm tra cấu hình ca; không tự coi là ca chung.';
        case 'TRAINING_DAYS_INVALID': return 'Ngày tập cũ sai định dạng. Admin cần xác nhận lại ngày tập (0 = Chủ nhật, 1–6 = Thứ 2–7).';
        default: return '';
    }
}
export function assertTrainingRegistration(profile, shifts) {
    const result = inspectTrainingRegistration(profile, shifts);
    if (result.issues.length) throw Object.assign(new Error(registrationMessage(result)), {
        code:result.result === 'SHIFT_BRANCH_MISMATCH' ? 'TRAINING_SHIFT_BRANCH_MISMATCH' : result.result,registration:result
    });
    return result;
}
// Read-only RAM audit. Output contains pseudonyms, never display names or document IDs.
export function auditTrainingRegistrations(profiles, shifts) {
    return Object.keys(profiles || {}).sort().map((key,index) => ({
        profileId:'P' + String(index + 1).padStart(5,'0'),...inspectTrainingRegistration(profiles[key],shifts)
    }));
}
// Service defense immediately before the existing writer; no extra Firestore read.
export function validateTrainingMutation(key, patch, creating = false) {
    if (!creating && !['branch','trainingShiftId','trainingDays'].some(field => Object.hasOwn(patch,field))) return;
    const existing = window.__store?.profiles?.[key];
    if (!creating && !existing) throw Object.assign(new Error('Chưa tải hồ sơ gốc để xác minh đăng ký tập. Vui lòng mở lại hồ sơ trước khi lưu.'),{code:'TRAINING_REGISTRATION_PROFILE_UNAVAILABLE'});
    const profile = {...(creating ? {} : existing),...patch};
    if (profile.trainingShiftId) {
        const state = window.AttendanceModule?.getShiftAuthority?.();
        if (state?.status !== 'ready' || state.clubId !== window.__store?.clubId ||
            Number(state.authGeneration) !== Number(window.__verifiedAuthContextState?.generation || 0)) {
            throw Object.assign(new Error('Chưa xác minh được cấu hình ca tập. Vui lòng tải lại form khi có mạng.'),{code:'SHIFT_AUTHORITY_UNRESOLVED'});
        }
    }
    return assertTrainingRegistration(profile,window._getClubShifts?.() || []);
}

// One persisted attendance contract. Keep this authority ID stable after deploy.
// Rules must be installed before the client/audit process can attest history.
export const HISTORY_AUTHORITY = 'attendance-history-7c42f5e2-6d94-4e49-b8e5-98f876cbd90a';
export const JOURNAL_DATABASE = 'tst-attendance-journal-v3';
export const ABSENT_VERSION = 'absent';
export function attendanceServerVersion(data) {
    if (!data) return ABSENT_VERSION;
    if (typeof data.attendanceVersion === 'string' && data.attendanceVersion) return data.attendanceVersion;
    // Legacy state has no revision. Compare a stable business-state fingerprint;
    // clock timestamps never decide whether an intent is newer than another.
    return 'legacy:' + JSON.stringify(['profileId','name','branch','date','month','shiftId','status','timestamp']
        .map(key => [key, data[key] ?? null]));
}
export function attendanceIntentId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (!globalThis.crypto?.getRandomValues) throw new Error('Không tạo được mã thao tác an toàn.');
    return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
}
export function attendanceIntentTarget(record) {
    return JSON.stringify([String(record.clubId||''),String(record.docId||'')]);
}
export function attendanceVisibleRecord(data) { return [1,2,3].includes(Number(data?.status)); }

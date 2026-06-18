/**
 * Phase 4K-6V3D1 — Canonical Tuition Month Ledger + Targeted Profile Reconciliation
 *
 * Goals:
 * - One canonical month calculation for Profile, Debt, Bulk Zalo, Reports and Thu Gộp.
 * - Atomic tuition transaction + profile ledger writes.
 * - Repair stale paidUntil from already-loaded paidMonths without another Firestore read.
 *
 * This is a classic script so both legacy app.js and the HTTP module layer can share it.
 */
(function initCanonicalTuitionMonthLedger(global) {
    'use strict';

    if (global.CanonicalTuitionMonthLedger && global.CanonicalTuitionMonthLedger.version === '4K-6V3D1') return;

    const VERSION = '4K-6V3D1';
    const LEDGER_SCHEMA_VERSION = 1;
    const MONTH_RE = /^(20\d{2}|21\d{2}|2200)-(0?[1-9]|1[0-2])$/;
    const MAX_MONTH_GUARD = 120;
    const MAX_REPAIR_WRITES_PER_SESSION = 20;
    const REPAIR_BATCH_SIZE = 8;
    const REPAIR_DELAY_MS = 1500;

    const _repairState = {
        clubId: '',
        timer: null,
        inFlight: false,
        writesThisSession: 0,
        runs: 0,
        repaired: 0,
        deferred: 0,
        lastReason: '',
        lastError: '',
        lastCandidates: [],
    };

    function _now() { return Date.now(); }

    function normalizeMonth(value) {
        const raw = String(value == null ? '' : value).trim().slice(0, 7);
        if (!raw) return '';
        const parts = raw.split('-');
        if (parts.length !== 2) return '';
        const normalized = String(parts[0]) + '-' + String(parts[1]).padStart(2, '0');
        return MONTH_RE.test(normalized) ? normalized : '';
    }

    function normalizeMonths(values) {
        const set = new Set();
        (Array.isArray(values) ? values : []).forEach(function(value) {
            const month = normalizeMonth(value);
            if (month) set.add(month);
        });
        return Array.from(set).sort();
    }

    function addMonths(month, count) {
        const normalized = normalizeMonth(month);
        if (!normalized) return '';
        const parts = normalized.split('-').map(Number);
        let year = parts[0];
        let mon = parts[1] + Number(count || 0);
        while (mon > 12) { mon -= 12; year += 1; }
        while (mon < 1) { mon += 12; year -= 1; }
        return String(year) + '-' + String(mon).padStart(2, '0');
    }

    function getStartMonth(profile, fallbackMonth) {
        const p = profile || {};
        const candidates = [
            p.ledgerStartMonth,
            p.tuitionStartMonth,
            p.lastAdmissionTuitionStartMonth,
            p.admissionDate,
            p.joinDate,
            p.joinedAt,
            p.createdAt,
            p.enrollDate,
            fallbackMonth,
        ];
        for (let i = 0; i < candidates.length; i++) {
            const month = normalizeMonth(candidates[i]);
            if (month) return month;
        }
        return '';
    }

    /**
     * Advance paidUntil only through contiguous paid months.
     * skippedMonths are intentionally NOT treated as paid. This keeps a removed skip
     * able to reappear as debt and prevents a paid month after a gap from hiding the gap.
     */
    function derivePaidThroughMonth(profile, additionalPaidMonths) {
        const p = profile || {};
        const paid = new Set(normalizeMonths(
            (Array.isArray(p.paidMonths) ? p.paidMonths : []).concat(
                Array.isArray(additionalPaidMonths) ? additionalPaidMonths : []
            )
        ));

        let cursor = normalizeMonth(p.paidThroughMonth || p.paidUntil);
        if (!cursor) {
            const start = getStartMonth(p, '');
            if (!start || !paid.has(start)) return '';
            cursor = start;
        }

        let guard = 0;
        while (guard < MAX_MONTH_GUARD) {
            const next = addMonths(cursor, 1);
            if (!next || !paid.has(next)) break;
            cursor = next;
            guard += 1;
        }
        return cursor;
    }

    function derivePaidThroughAfterRemoval(profile, remainingPaidMonths, removedMonths) {
        const p = profile || {};
        const remaining = normalizeMonths(remainingPaidMonths);
        const removed = normalizeMonths(removedMonths);
        let baseline = normalizeMonth(p.paidThroughMonth || p.paidUntil);

        // When a removed month was inside the old paid-through range, rewind to
        // the month immediately before the first removed month. Contiguous paid
        // evidence after that point may advance the boundary again.
        const affecting = baseline ? removed.filter(function(month) { return month <= baseline; }) : [];
        if (affecting.length) baseline = addMonths(affecting[0], -1);

        const draft = Object.assign({}, p, {
            paidUntil: baseline,
            paidThroughMonth: baseline,
            paidMonths: remaining,
        });
        if (!draft.ledgerStartMonth) {
            draft.ledgerStartMonth = getStartMonth(p, remaining[0] || removed[0] || '');
        }
        return derivePaidThroughMonth(draft);
    }

    function getChargeableMonths(profile, selectedMonth, options) {
        const p = profile || {};
        const opts = options || {};
        const target = normalizeMonth(selectedMonth);
        if (!target || p.feeExempt === true) return [];

        const statusKind = typeof global.classifyProfileStatus === 'function'
            ? global.classifyProfileStatus(p)
            : ((p.status === 'quit' || p.status === 'inactive' || p.active === false || p.isActive === false) ? 'quit' : 'active');
        if (statusKind === 'quit' && opts.includeQuit !== true) return [];

        const paid = new Set(normalizeMonths(p.paidMonths));
        const skipped = new Set(normalizeMonths(p.skippedMonths));
        const paidThrough = derivePaidThroughMonth(p);
        let cursor = paidThrough ? addMonths(paidThrough, 1) : getStartMonth(p, target);
        if (!cursor) cursor = target;

        const result = [];
        let guard = 0;
        const maxMonths = Math.max(1, Math.min(Number(opts.maxMonths) || 36, MAX_MONTH_GUARD));
        while (cursor && cursor <= target && guard < maxMonths) {
            if (!skipped.has(cursor) && !paid.has(cursor)) result.push(cursor);
            cursor = addMonths(cursor, 1);
            guard += 1;
        }
        return result;
    }

    function buildLedger(profile, options) {
        const p = profile || {};
        const opts = options || {};
        const paidMonths = normalizeMonths(
            (Array.isArray(p.paidMonths) ? p.paidMonths : []).concat(
                Array.isArray(opts.additionalPaidMonths) ? opts.additionalPaidMonths : []
            )
        );
        const draft = Object.assign({}, p, { paidMonths: paidMonths });
        const paidThroughMonth = derivePaidThroughMonth(draft);
        const targetMonth = normalizeMonth(opts.targetMonth);
        return {
            paidUntilRaw: normalizeMonth(p.paidUntil),
            paidThroughMonth: paidThroughMonth,
            paidMonths: paidMonths,
            skippedMonths: normalizeMonths(p.skippedMonths),
            owedMonths: targetMonth ? getChargeableMonths(draft, targetMonth, opts) : [],
            changed: !!paidThroughMonth && paidThroughMonth !== normalizeMonth(p.paidUntil),
            source: 'profile-paidMonths',
            schemaVersion: LEDGER_SCHEMA_VERSION,
        };
    }

    function _context() {
        const st = global.__store || {};
        return {
            st: st,
            sdk: global._fb_init || {},
            db: st.db || global.db || global._db || null,
            clubId: st.clubId || st.currentClubId || global.currentClubId || '',
            colRef: st.colRef || global.colRef || null,
            profiles: st.profiles || global.allProfiles || {},
            role: String(global.userRole || st.userRole || '').toLowerCase(),
        };
    }

    function _isAdmin(role) {
        return ['admin', 'super_admin', 'superadmin', 'root', 'root_admin'].includes(String(role || '').toLowerCase());
    }

    function _canonicalTxPayload(txData, reason, studentName, profile) {
        const p = profile || {};
        const input = Object.assign({}, txData || {});
        if (!input.description) input.description = studentName;
        if (!input.studentName) input.studentName = studentName;
        if (!input.profileName) input.profileName = studentName;
        if (!input.profileId) input.profileId = p.profileId || studentName;
        if (!input.memberId && p.memberId) input.memberId = p.memberId;
        input.tuitionLedgerSchemaVersion = LEDGER_SCHEMA_VERSION;
        input.tuitionLedgerSource = String(reason || 'tuition-atomic-write');
        return typeof global.canonicalizeTransactionForWrite === 'function'
            ? global.canonicalizeTransactionForWrite(input, reason || 'tuition-atomic-write')
            : input;
    }

    function _syncLocalProfile(studentName, months, paidThroughMonth) {
        const ctx = _context();
        const targets = [];
        if (ctx.st.profiles && ctx.st.profiles[studentName]) targets.push(ctx.st.profiles[studentName]);
        if (global.allProfiles && global.allProfiles[studentName] && targets.indexOf(global.allProfiles[studentName]) < 0) targets.push(global.allProfiles[studentName]);
        targets.forEach(function(profile) {
            profile.paidMonths = normalizeMonths((profile.paidMonths || []).concat(months || []));
            if (paidThroughMonth) {
                profile.paidUntil = paidThroughMonth;
                profile.paidThroughMonth = paidThroughMonth;
            }
            profile.tuitionLedgerSchemaVersion = LEDGER_SCHEMA_VERSION;
            profile.tuitionLedgerUpdatedAt = _now();
        });
    }

    async function commitTuitionPaymentsAtomic(entries, options) {
        const ctx = _context();
        const opts = options || {};
        const list = (Array.isArray(entries) ? entries : []).filter(function(entry) {
            return entry && entry.studentName && normalizeMonths(entry.months).length > 0 && entry.txData;
        });
        if (!list.length) throw new Error('[TuitionLedger] Không có khoản học phí hợp lệ để ghi');
        if (!ctx.db || !ctx.clubId) throw new Error('[TuitionLedger] Firestore/clubId chưa sẵn sàng');

        const sdk = ctx.sdk;
        const transactionsRef = opts.transactionsRef || ctx.colRef || (sdk.collection && sdk.collection(ctx.db, 'clubs', ctx.clubId, 'transactions'));
        if (!transactionsRef || !sdk.doc) throw new Error('[TuitionLedger] transactionsRef chưa sẵn sàng');

        const prepared = list.map(function(entry) {
            const studentName = String(entry.studentName || '').trim();
            const months = normalizeMonths(entry.months);
            const profile = entry.profile || ctx.profiles[studentName] || {};
            const txRef = entry.txRef || sdk.doc(transactionsRef);
            const profileRef = sdk.doc(ctx.db, 'clubs', ctx.clubId, 'profiles', studentName);
            return {
                studentName: studentName,
                months: months,
                profile: profile,
                txRef: txRef,
                profileRef: profileRef,
                txData: _canonicalTxPayload(entry.txData, entry.reason || opts.reason, studentName, profile),
                sideChecks: Array.isArray(entry.sideChecks) ? entry.sideChecks : (Array.isArray(opts.sideChecks) ? opts.sideChecks : []),
                sideWrites: Array.isArray(entry.sideWrites) ? entry.sideWrites : (Array.isArray(opts.sideWrites) ? opts.sideWrites : []),
                paidThroughMonth: '',
            };
        });

        const writeReason = String(opts.reason || prepared[0].txData.tuitionLedgerSource || 'tuition-atomic-write');

        if (typeof sdk.runTransaction === 'function') {
            await sdk.runTransaction(ctx.db, async function(transaction) {
                // Firestore requires every read to finish before the first write.
                const snapshots = [];
                for (let i = 0; i < prepared.length; i++) {
                    snapshots.push(await transaction.get(prepared[i].profileRef));
                }
                const sideSnapshots = [];
                for (let i = 0; i < prepared.length; i++) {
                    const itemSideSnapshots = [];
                    for (let j = 0; j < prepared[i].sideChecks.length; j++) {
                        itemSideSnapshots.push(await transaction.get(prepared[i].sideChecks[j].ref));
                    }
                    sideSnapshots.push(itemSideSnapshots);
                }
                for (let i = 0; i < prepared.length; i++) {
                    const item = prepared[i];
                    const snap = snapshots[i];
                    if (!snap || !snap.exists()) throw new Error('Không tìm thấy profile: ' + item.studentName);
                    item.sideChecks.forEach(function(check, index) {
                        const checkSnap = sideSnapshots[i][index];
                        if (typeof check.validate === 'function') return check.validate(checkSnap);
                        if (check.type === 'inventory-stock') {
                            const data = checkSnap && checkSnap.exists() ? (checkSnap.data() || {}) : {};
                            const available = Number(data[check.field] || 0);
                            if (available < Number(check.required || 0)) {
                                throw new Error('Kho không đủ ' + (check.label || 'sản phẩm') + ': còn ' + available + ', cần ' + check.required + '.');
                            }
                        }
                    });
                    const latestProfile = snap.data() || item.profile;
                    const existingPaid = new Set(normalizeMonths(latestProfile.paidMonths));
                    const existingPaidThrough = normalizeMonth(latestProfile.paidThroughMonth || latestProfile.paidUntil);
                    const duplicateMonths = item.months.filter(function(month) {
                        return existingPaid.has(month) || (!!existingPaidThrough && month <= existingPaidThrough);
                    });
                    if (duplicateMonths.length > 0 && opts.allowAlreadyPaid !== true) {
                        const duplicateError = new Error('Học phí đã được ghi nhận cho tháng: ' + duplicateMonths.join(', '));
                        duplicateError.code = 'TUITION_ALREADY_PAID';
                        duplicateError.duplicateMonths = duplicateMonths;
                        throw duplicateError;
                    }
                    const ledger = buildLedger(latestProfile, { additionalPaidMonths: item.months });
                    item.paidThroughMonth = ledger.paidThroughMonth || normalizeMonth(latestProfile.paidUntil) || item.months[0];
                    transaction.set(item.txRef, item.txData);
                    transaction.update(item.profileRef, {
                        paidUntil: item.paidThroughMonth,
                        paidThroughMonth: item.paidThroughMonth,
                        paidMonths: sdk.arrayUnion.apply(null, item.months),
                        tuitionLedgerSchemaVersion: LEDGER_SCHEMA_VERSION,
                        tuitionLedgerUpdatedAt: _now(),
                        tuitionLedgerSource: writeReason,
                    });
                    item.sideWrites.forEach(function(write) {
                        if (!write || !write.ref) return;
                        if (write.op === 'update') transaction.update(write.ref, write.data || {});
                        else if (write.op === 'delete') transaction.delete(write.ref);
                        else if (write.options) transaction.set(write.ref, write.data || {}, write.options);
                        else transaction.set(write.ref, write.data || {});
                    });
                }
            });
        } else {
            if (typeof sdk.writeBatch !== 'function') throw new Error('[TuitionLedger] writeBatch chưa sẵn sàng');
            const batch = sdk.writeBatch(ctx.db);
            prepared.forEach(function(item) {
                if (item.sideChecks.length) throw new Error('[TuitionLedger] Không thể kiểm tra tồn kho an toàn nếu runTransaction không sẵn sàng');
                const ledger = buildLedger(item.profile, { additionalPaidMonths: item.months });
                item.paidThroughMonth = ledger.paidThroughMonth || normalizeMonth(item.profile.paidUntil) || item.months[0];
                batch.set(item.txRef, item.txData);
                batch.update(item.profileRef, {
                    paidUntil: item.paidThroughMonth,
                    paidThroughMonth: item.paidThroughMonth,
                    paidMonths: sdk.arrayUnion.apply(null, item.months),
                    tuitionLedgerSchemaVersion: LEDGER_SCHEMA_VERSION,
                    tuitionLedgerUpdatedAt: _now(),
                    tuitionLedgerSource: writeReason,
                });
                item.sideWrites.forEach(function(write) {
                    if (!write || !write.ref) return;
                    if (write.op === 'update') batch.update(write.ref, write.data || {});
                    else if (write.op === 'delete') batch.delete(write.ref);
                    else if (write.options) batch.set(write.ref, write.data || {}, write.options);
                    else batch.set(write.ref, write.data || {});
                });
            });
            await batch.commit();
        }

        prepared.forEach(function(item) {
            _syncLocalProfile(item.studentName, item.months, item.paidThroughMonth);
            if (typeof global.mergeTransactionIntoRuntimeStore === 'function') {
                global.mergeTransactionIntoRuntimeStore(Object.assign({ id: item.txRef.id }, item.txData), writeReason);
            }
        });
        if (ctx.st) {
            ctx.st._dataVersion = (ctx.st._dataVersion || 0) + 1;
            ctx.st._lastTuitionWriteAt = _now();
            ctx.st._lastTuitionWriteReason = writeReason;
        }
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
            try {
                global.dispatchEvent(new CustomEvent('tuition:payment-committed', {
                    detail: {
                        reason: writeReason,
                        students: prepared.map(function(item) { return item.studentName; }),
                        months: prepared.reduce(function(all, item) { return all.concat(item.months); }, []),
                    }
                }));
            } catch (_) {}
        }
        if (typeof global.refreshListsComputation === 'function') {
            global.refreshListsComputation(['students.debtList', 'tx.txList', 'dashboard.summary', 'dashboard.branchRevenue'], writeReason);
        }
        if (typeof global.invalidateList === 'function') {
            global.invalidateList('students.debtList', writeReason);
            global.invalidateList('tx.txList', writeReason);
        }
        if (typeof global.invalidateStudents === 'function') global.invalidateStudents(writeReason);
        if (typeof global.invalidateFinance === 'function') global.invalidateFinance(writeReason);
        if (typeof global.invalidateDashboard === 'function') global.invalidateDashboard(writeReason);

        return prepared.map(function(item) {
            return {
                id: item.txRef.id,
                studentName: item.studentName,
                months: item.months.slice(),
                paidUntil: item.paidThroughMonth,
                txData: item.txData,
            };
        });
    }

    async function commitTuitionPaymentAtomic(options) {
        const opts = options || {};
        const results = await commitTuitionPaymentsAtomic([{
            studentName: opts.studentName,
            months: opts.months,
            profile: opts.profile,
            txData: opts.txData,
            txRef: opts.txRef,
            sideChecks: opts.sideChecks,
            sideWrites: opts.sideWrites,
            reason: opts.reason,
        }], opts);
        return results[0];
    }

    /**
     * Remove a skipped month and re-open any hidden tuition gap atomically.
     * This prevents a legacy paidUntil that jumped across a skipped month from
     * continuing to hide debt after the skip is removed.
     */
    async function removeSkippedMonthAtomic(options) {
        const opts = options || {};
        const studentName = String(opts.studentName || '').trim();
        const month = normalizeMonth(opts.month);
        const ctx = _context();
        if (!studentName || !month) throw new Error('[TuitionLedger] Võ sinh/tháng báo nghỉ không hợp lệ');
        if (!ctx.db || !ctx.clubId) throw new Error('[TuitionLedger] Firestore/clubId chưa sẵn sàng');

        const sdk = ctx.sdk;
        if (typeof sdk.runTransaction !== 'function' || typeof sdk.doc !== 'function' || typeof sdk.arrayRemove !== 'function') {
            throw new Error('[TuitionLedger] runTransaction/arrayRemove chưa sẵn sàng');
        }

        const profileRef = sdk.doc(ctx.db, 'clubs', ctx.clubId, 'profiles', studentName);
        let paidThroughMonth = '';
        await sdk.runTransaction(ctx.db, async function(transaction) {
            const snap = await transaction.get(profileRef);
            if (!snap || !snap.exists()) throw new Error('Không tìm thấy profile: ' + studentName);
            const latestProfile = snap.data() || {};
            const skippedMonths = normalizeMonths(latestProfile.skippedMonths);
            const hadSkip = skippedMonths.indexOf(month) >= 0;
            paidThroughMonth = hadSkip
                ? derivePaidThroughAfterRemoval(latestProfile, normalizeMonths(latestProfile.paidMonths), [month])
                : derivePaidThroughMonth(latestProfile);
            if (!paidThroughMonth) paidThroughMonth = normalizeMonth(latestProfile.paidUntil);

            transaction.update(profileRef, {
                skippedMonths: sdk.arrayRemove(month),
                paidUntil: paidThroughMonth || '',
                paidThroughMonth: paidThroughMonth || '',
                tuitionLedgerSchemaVersion: LEDGER_SCHEMA_VERSION,
                tuitionLedgerUpdatedAt: _now(),
                tuitionLedgerSource: 'remove-skipped-month-reconciliation',
            });
        });

        const targets = [];
        if (ctx.st.profiles && ctx.st.profiles[studentName]) targets.push(ctx.st.profiles[studentName]);
        if (global.allProfiles && global.allProfiles[studentName] && targets.indexOf(global.allProfiles[studentName]) < 0) targets.push(global.allProfiles[studentName]);
        targets.forEach(function(profile) {
            profile.skippedMonths = normalizeMonths(profile.skippedMonths).filter(function(value) { return value !== month; });
        });
        _syncLocalProfile(studentName, [], paidThroughMonth);
        return { studentName: studentName, month: month, paidUntil: paidThroughMonth || '' };
    }

    function _findRepairCandidates(profiles) {
        const candidates = [];
        Object.keys(profiles || {}).forEach(function(name) {
            const profile = profiles[name];
            if (!profile || profile.feeExempt === true) return;
            const raw = normalizeMonth(profile.paidUntil);
            const effective = derivePaidThroughMonth(profile);
            // Targeted and non-destructive: only advance a stale paidUntil.
            if (effective && (!raw || effective > raw)) {
                candidates.push({ name: name, raw: raw, effective: effective, paidMonths: normalizeMonths(profile.paidMonths) });
            }
        });
        return candidates.sort(function(a, b) { return a.name.localeCompare(b.name, 'vi'); });
    }

    async function reconcileLoadedProfiles(reason) {
        const ctx = _context();
        const why = String(reason || 'loaded-profiles');
        if (!ctx.clubId || !ctx.db || !_isAdmin(ctx.role)) {
            return { ok: false, skipped: true, reason: !ctx.clubId ? 'no-club' : (!_isAdmin(ctx.role) ? 'not-admin' : 'no-db') };
        }
        if (_repairState.inFlight) return { ok: true, skipped: true, reason: 'in-flight' };

        if (_repairState.clubId !== ctx.clubId) {
            _repairState.clubId = ctx.clubId;
            _repairState.writesThisSession = 0;
            _repairState.runs = 0;
            _repairState.repaired = 0;
            _repairState.deferred = 0;
            _repairState.lastCandidates = [];
        }

        const candidates = _findRepairCandidates(ctx.profiles);
        _repairState.lastCandidates = candidates.slice(0, 50);
        _repairState.lastReason = why;
        _repairState.runs += 1;
        if (!candidates.length) return { ok: true, repaired: 0, remaining: 0, reason: 'clean' };

        const remainingBudget = Math.max(0, MAX_REPAIR_WRITES_PER_SESSION - _repairState.writesThisSession);
        if (!remainingBudget) {
            _repairState.deferred = candidates.length;
            return { ok: true, repaired: 0, remaining: candidates.length, reason: 'session-budget' };
        }

        const selected = candidates.slice(0, Math.min(REPAIR_BATCH_SIZE, remainingBudget));
        const sdk = ctx.sdk;
        if (typeof sdk.writeBatch !== 'function' || typeof sdk.doc !== 'function') {
            return { ok: false, reason: 'write-batch-unavailable' };
        }

        _repairState.inFlight = true;
        try {
            const batch = sdk.writeBatch(ctx.db);
            selected.forEach(function(item) {
                batch.update(sdk.doc(ctx.db, 'clubs', ctx.clubId, 'profiles', item.name), {
                    paidUntil: item.effective,
                    paidThroughMonth: item.effective,
                    tuitionLedgerSchemaVersion: LEDGER_SCHEMA_VERSION,
                    tuitionLedgerUpdatedAt: _now(),
                    tuitionLedgerSource: 'targeted-profile-reconciliation',
                });
            });
            await batch.commit();
            selected.forEach(function(item) { _syncLocalProfile(item.name, [], item.effective); });
            _repairState.writesThisSession += selected.length;
            _repairState.repaired += selected.length;
            _repairState.deferred = Math.max(0, candidates.length - selected.length);

            if (typeof global.invalidateLists === 'function') {
                global.invalidateLists(['students.activeList', 'students.debtList'], 'tuition-ledger-reconciled');
            }
            if (typeof global.invalidateFinance === 'function') global.invalidateFinance('tuition-ledger-reconciled');

            if (_repairState.deferred > 0 && _repairState.writesThisSession < MAX_REPAIR_WRITES_PER_SESSION) {
                scheduleReconciliation('continuation:' + why);
            }
            return { ok: true, repaired: selected.length, remaining: _repairState.deferred, candidates: selected };
        } catch (error) {
            _repairState.lastError = error && error.message ? error.message : String(error);
            console.error('[CanonicalTuitionMonthLedger] targeted reconciliation failed:', error);
            return { ok: false, error: _repairState.lastError };
        } finally {
            _repairState.inFlight = false;
        }
    }

    function scheduleReconciliation(reason) {
        if (_repairState.timer) clearTimeout(_repairState.timer);
        _repairState.timer = setTimeout(function() {
            _repairState.timer = null;
            reconcileLoadedProfiles(reason || 'scheduled').catch(function(error) {
                console.warn('[CanonicalTuitionMonthLedger] scheduled reconciliation failed:', error && error.message);
            });
        }, REPAIR_DELAY_MS);
    }

    function resetReconciliation(reason) {
        if (_repairState.timer) clearTimeout(_repairState.timer);
        _repairState.timer = null;
        _repairState.inFlight = false;
        _repairState.clubId = '';
        _repairState.writesThisSession = 0;
        _repairState.runs = 0;
        _repairState.repaired = 0;
        _repairState.deferred = 0;
        _repairState.lastCandidates = [];
        _repairState.lastReason = String(reason || 'reset');
        _repairState.lastError = '';
    }

    function getMetrics() {
        return Object.assign({}, _repairState, {
            timer: !!_repairState.timer,
            lastCandidates: _repairState.lastCandidates.slice(),
            maxWritesPerSession: MAX_REPAIR_WRITES_PER_SESSION,
            batchSize: REPAIR_BATCH_SIZE,
        });
    }

    const api = {
        version: VERSION,
        schemaVersion: LEDGER_SCHEMA_VERSION,
        normalizeMonth: normalizeMonth,
        normalizeMonths: normalizeMonths,
        addMonths: addMonths,
        getStartMonth: getStartMonth,
        derivePaidThroughMonth: derivePaidThroughMonth,
        derivePaidThroughAfterRemoval: derivePaidThroughAfterRemoval,
        getChargeableMonths: getChargeableMonths,
        buildLedger: buildLedger,
        commitTuitionPaymentAtomic: commitTuitionPaymentAtomic,
        commitTuitionPaymentsAtomic: commitTuitionPaymentsAtomic,
        removeSkippedMonthAtomic: removeSkippedMonthAtomic,
        reconcileLoadedProfiles: reconcileLoadedProfiles,
        scheduleReconciliation: scheduleReconciliation,
        resetReconciliation: resetReconciliation,
        getMetrics: getMetrics,
    };

    global.CanonicalTuitionMonthLedger = api;
    global.getEffectivePaidUntil = function(profile) { return derivePaidThroughMonth(profile || {}); };
    global.derivePaidThroughAfterTuitionRemoval = derivePaidThroughAfterRemoval;
    global.getCanonicalTuitionLedger = function(profile, options) { return buildLedger(profile, options); };
    global.getCanonicalChargeableTuitionMonths = function(profile, month, options) { return getChargeableMonths(profile, month, options); };
    global.commitTuitionPaymentAtomic = commitTuitionPaymentAtomic;
    global.commitTuitionPaymentsAtomic = commitTuitionPaymentsAtomic;
    global.removeSkippedTuitionMonthAtomic = removeSkippedMonthAtomic;
    global.reconcileLoadedTuitionProfiles = reconcileLoadedProfiles;
    global.scheduleTuitionProfileReconciliation = scheduleReconciliation;
    global.resetTuitionProfileReconciliation = resetReconciliation;
    global.getTuitionLedgerMetrics = getMetrics;
})(window);

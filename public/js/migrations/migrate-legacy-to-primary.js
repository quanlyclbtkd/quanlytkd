/**
 * js/migrations/migrate-legacy-to-primary.js
 * ─────────────────────────────────────────────
 * Phase 4.0B-4G — Safe Migration Tool
 * Di chuyển dữ liệu từ legacy root collections sang primary SaaS path.
 *
 * TÍNH NĂNG AN TOÀN:
 *   - DRY-RUN mode mặc định: không ghi gì cho đến khi confirm
 *   - Rollback guard: không xóa/ghi đè nếu primary đã có data
 *   - Không xóa dữ liệu legacy sau khi migrate
 *   - Không ghi nếu primary đã có dữ liệu (tránh overwrite)
 *   - Báo cáo từng bước trước khi thực thi
 *   - Không log PII (chỉ log ID/count)
 *
 * CÁCH DÙNG (trong browser console, sau khi đăng nhập admin):
 *
 *   // 1. Xem báo cáo trước khi migrate (DRY-RUN — không ghi gì):
 *   await window.MigrationTool.dryRun()
 *
 *   // 2. Nếu báo cáo OK, chạy migrate thật:
 *   await window.MigrationTool.run({ confirm: true })
 *
 *   // 3. Kiểm tra kết quả:
 *   window.MigrationTool.getStatus()
 *
 * KHÔNG DEPLOY. KHÔNG MỞ RULES PUBLIC.
 * Đây là tool thủ công — chỉ admin CLB chạy khi sẵn sàng.
 */

(function() {
    'use strict';

    // ── Internal state ────────────────────────────────────────────
    const _state = {
        dryRunCompleted:   false,
        migrationStarted:  false,
        migrationDone:     false,
        profilesMigrated:  0,
        txMigrated:        0,
        invMigrated:       0,
        profilesSkipped:   0,
        txSkipped:         0,
        invSkipped:        0,
        errors:            [],
        startedAt:         0,
        completedAt:       0,
        rollbackGuard:     false,   // true = primary đã có data, không chạy
        lastDryRunResult:  null
    };

    // ── Helpers ───────────────────────────────────────────────────
    function _getDb()     { return window.__store && window.__store.db || window._db || null; }
    function _getClubId() {
        return (window.__store && (window.__store.clubId || window.__store.currentClubId))
            || window.currentClubId || '';
    }
    function _log(msg)  { console.info('[MigrationTool]', msg); }
    function _warn(msg) { console.warn('[MigrationTool]', msg); }
    function _err(msg)  { console.error('[MigrationTool]', msg); _state.errors.push(msg); }

    // Lấy Firebase SDK từ app.js context
    function _sdk() {
        const fb = window._fb_init || {};
        return {
            collection:  fb.collection  || window.collection,
            doc:         fb.doc         || window.doc,
            getDocs:     fb.getDocs     || window.getDocs,
            setDoc:      fb.setDoc      || window.setDoc,
            query:       fb.query       || window.query,
            limit:       fb.limit       || window.limit,
            writeBatch:  fb.writeBatch  || window.writeBatch
        };
    }

    // Đọc collection (read-only)
    async function _readAll(db, colName) {
        const { collection, getDocs, query, limit } = _sdk();
        if (!collection || !getDocs) throw new Error('Firebase SDK chưa load');
        try {
            const ref  = collection(db, colName);
            const snap = await getDocs(query(ref, limit(1000)));
            return snap.docs.map(function(d) { return Object.assign({ _docId: d.id }, d.data()); });
        } catch(e) {
            _warn('Không đọc được ' + colName + ': ' + (e.message || e));
            return [];
        }
    }

    // Kiểm tra primary có data không (limit 1 — chỉ count, không đọc data)
    async function _primaryHasData(db, clubId, colName) {
        const { collection, getDocs, query, limit } = _sdk();
        try {
            const ref  = collection(db, 'clubs', clubId, colName);
            const snap = await getDocs(query(ref, limit(1)));
            return snap.size > 0;
        } catch(e) {
            return false;
        }
    }

    // ── DRY-RUN ───────────────────────────────────────────────────
    async function dryRun() {
        _log('=== DRY-RUN — Không ghi gì ===');

        const db     = _getDb();
        const clubId = _getClubId();

        if (!db)     { _err('db chưa sẵn sàng — login trước'); return _state; }
        if (!clubId) { _err('clubId chưa xác định'); return _state; }

        _log('ClubId: ' + clubId);
        _log('Primary path: clubs/' + clubId + '/{profiles,transactions,inventory}');
        _log('Legacy path: tst_profiles, tst_transactions, tst_inventory');

        // Đọc legacy
        _log('Đang đọc dữ liệu legacy...');
        const [legProfiles, legTx, legInv] = await Promise.all([
            _readAll(db, 'tst_profiles'),
            _readAll(db, 'tst_transactions'),
            _readAll(db, 'tst_inventory')
        ]);

        // Kiểm tra primary
        _log('Đang kiểm tra primary path...');
        const [primHasProf, primHasTx, primHasInv] = await Promise.all([
            _primaryHasData(db, clubId, 'profiles'),
            _primaryHasData(db, clubId, 'transactions'),
            _primaryHasData(db, clubId, 'inventory')
        ]);

        const primaryHasAny = primHasProf || primHasTx || primHasInv;
        _state.rollbackGuard = primaryHasAny;

        const result = {
            clubId,
            legacy: {
                profilesCount:     legProfiles.length,
                transactionsCount: legTx.length,
                inventoryCount:    legInv.length
            },
            primary: {
                profilesHasData:     primHasProf,
                transactionsHasData: primHasTx,
                inventoryHasData:    primHasInv
            },
            rollbackGuard:    primaryHasAny,
            safeToMigrate:    !primaryHasAny && legProfiles.length > 0,
            warning:          primaryHasAny
                ? '⚠️ Primary path đã có data — migration sẽ bị chặn để tránh overwrite.'
                : legProfiles.length === 0
                    ? '⚠️ Legacy profiles rỗng — không có gì để migrate.'
                    : '✅ Primary rỗng — an toàn để migrate.',
            nextStep: primaryHasAny
                ? 'Không cần migrate — primary đã có data. Dùng primary path.'
                : 'Nếu đồng ý, chạy: await window.MigrationTool.run({ confirm: true })'
        };

        _state.dryRunCompleted  = true;
        _state.lastDryRunResult = result;

        console.table({
            clubId:                  result.clubId,
            legacyProfilesCount:     result.legacy.profilesCount,
            legacyTransactionsCount: result.legacy.transactionsCount,
            legacyInventoryCount:    result.legacy.inventoryCount,
            primaryHasProfiles:      result.primary.profilesHasData,
            primaryHasTransactions:  result.primary.transactionsHasData,
            primaryHasInventory:     result.primary.inventoryHasData,
            rollbackGuard:           result.rollbackGuard,
            safeToMigrate:           result.safeToMigrate
        });

        if (result.warning)  _warn(result.warning);
        if (result.nextStep) _log(result.nextStep);

        return result;
    }

    // ── RUN (ghi thật — cần confirm: true) ───────────────────────
    async function run(opts) {
        opts = opts || {};
        if (!opts.confirm) {
            _warn('Chạy dryRun trước, rồi gọi run({ confirm: true }) để migrate thật.');
            return _state;
        }
        if (_state.migrationStarted) {
            _warn('Migration đã bắt đầu rồi — không chạy lại.');
            return _state;
        }
        if (!_state.dryRunCompleted) {
            _warn('Chưa chạy dryRun — gọi await window.MigrationTool.dryRun() trước.');
            return _state;
        }

        const db     = _getDb();
        const clubId = _getClubId();

        if (!db || !clubId) { _err('db hoặc clubId chưa sẵn sàng'); return _state; }

        // Rollback guard: không migrate nếu primary đã có data
        if (_state.rollbackGuard) {
            _warn('🛑 ROLLBACK GUARD: Primary path đã có dữ liệu. Migration bị chặn.');
            _warn('Nếu cần overwrite, xóa data primary thủ công trước (KHÔNG nên làm tự động).');
            return _state;
        }

        _log('=== BẮT ĐẦU MIGRATION (ghi thật) ===');
        _log('clubs/' + clubId + ' ← tst_profiles / tst_transactions / tst_inventory');
        _log('Legacy data KHÔNG bị xóa sau migrate.');

        _state.migrationStarted = true;
        _state.startedAt        = Date.now();

        const { collection, doc, writeBatch } = _sdk();
        if (!writeBatch) { _err('writeBatch không có — Firebase SDK chưa load'); return _state; }

        // ── Migrate profiles ──────────────────────────────────────
        try {
            const legProfiles = await _readAll(db, 'tst_profiles');
            _log('Migrating profiles: ' + legProfiles.length + ' docs...');

            let batch = writeBatch(db);
            let count = 0;
            for (const prof of legProfiles) {
                const _docId  = prof._docId;
                const _data   = Object.assign({}, prof);
                delete _data._docId;
                _data._migratedFrom = 'tst_profiles';
                _data._migratedAt   = Date.now();

                const ref = doc(collection(db, 'clubs', clubId, 'profiles'), _docId);
                batch.set(ref, _data, { merge: false });
                count++;
                _state.profilesMigrated++;

                // Commit từng batch 400 docs (Firestore limit 500)
                if (count % 400 === 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                    _log('  profiles: ' + count + '/' + legProfiles.length + ' committed');
                }
            }
            if (count % 400 !== 0) await batch.commit();
            _log('✅ Profiles migrated: ' + _state.profilesMigrated);
        } catch(e) {
            _err('Profiles migration failed: ' + (e.message || e));
        }

        // ── Migrate transactions ──────────────────────────────────
        try {
            const legTx = await _readAll(db, 'tst_transactions');
            _log('Migrating transactions: ' + legTx.length + ' docs...');

            let batch = writeBatch(db);
            let count = 0;
            for (const tx of legTx) {
                const _docId = tx._docId;
                const _data  = Object.assign({}, tx);
                delete _data._docId;
                _data._migratedFrom = 'tst_transactions';
                _data._migratedAt   = Date.now();

                const ref = doc(collection(db, 'clubs', clubId, 'transactions'), _docId);
                batch.set(ref, _data, { merge: false });
                count++;
                _state.txMigrated++;

                if (count % 400 === 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                    _log('  transactions: ' + count + '/' + legTx.length + ' committed');
                }
            }
            if (count % 400 !== 0) await batch.commit();
            _log('✅ Transactions migrated: ' + _state.txMigrated);
        } catch(e) {
            _err('Transactions migration failed: ' + (e.message || e));
        }

        // ── Migrate inventory ─────────────────────────────────────
        try {
            const legInv = await _readAll(db, 'tst_inventory');
            _log('Migrating inventory: ' + legInv.length + ' docs...');

            let batch = writeBatch(db);
            let count = 0;
            for (const inv of legInv) {
                const _docId = inv._docId;
                const _data  = Object.assign({}, inv);
                delete _data._docId;
                _data._migratedFrom = 'tst_inventory';
                _data._migratedAt   = Date.now();

                const ref = doc(collection(db, 'clubs', clubId, 'inventory'), _docId);
                batch.set(ref, _data, { merge: false });
                count++;
                _state.invMigrated++;

                if (count % 400 === 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                    _log('  inventory: ' + count + '/' + legInv.length + ' committed');
                }
            }
            if (count % 400 !== 0) await batch.commit();
            _log('✅ Inventory migrated: ' + _state.invMigrated);
        } catch(e) {
            _err('Inventory migration failed: ' + (e.message || e));
        }

        _state.migrationDone = true;
        _state.completedAt   = Date.now();

        const summary = {
            profilesMigrated:  _state.profilesMigrated,
            txMigrated:        _state.txMigrated,
            invMigrated:       _state.invMigrated,
            errorsCount:       _state.errors.length,
            legacyDataDeleted: false,   // KHÔNG BAO GIỜ xóa legacy
            durationMs:        _state.completedAt - _state.startedAt
        };

        console.table(summary);

        if (_state.errors.length === 0) {
            _log('✅ Migration hoàn thành. Legacy data VẪN GIỮ NGUYÊN ở tst_*.');
            _log('Bước tiếp theo: reload lại app — dữ liệu sẽ load từ primary path.');
        } else {
            _warn('⚠️ Migration xong nhưng có ' + _state.errors.length + ' lỗi. Kiểm tra MigrationTool.getStatus().');
        }

        return summary;
    }

    // ── Expose public API ─────────────────────────────────────────
    window.MigrationTool = {
        dryRun,
        run,
        getStatus: function() {
            console.table(_state);
            return Object.assign({}, _state);
        },
        /** Reset để chạy lại (chỉ dùng sau khi đã xóa data primary thủ công) */
        _reset: function() {
            Object.assign(_state, {
                dryRunCompleted: false, migrationStarted: false, migrationDone: false,
                profilesMigrated: 0, txMigrated: 0, invMigrated: 0,
                errors: [], startedAt: 0, completedAt: 0,
                rollbackGuard: false, lastDryRunResult: null
            });
            _log('State reset. Chạy lại dryRun() trước khi run().');
        }
    };

    _log('✅ MigrationTool loaded (Phase 4.0B-4G). Chạy: await window.MigrationTool.dryRun()');

})();

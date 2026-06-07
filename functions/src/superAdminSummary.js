/**
 * functions/src/superAdminSummary.js — Phase 4K-6I-G
 * Server-side SuperAdmin summary cache.
 *
 * Why:
 * - SuperAdmin frontend must not run getCountFromServer/runAggregationQuery for every club.
 * - Club root docs need cached summary fields that SuperAdmin can read in O(1).
 * - This module keeps those fields updated automatically by Cloud Functions triggers
 *   and scheduled refresh/backfill.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getCurrentMonthVN, getTxMonth, classifyTx } = require('./helpers');

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const REGION = 'asia-southeast1';

function _statusKind(p) {
  if (!p || typeof p !== 'object') return 'unknown';
  const s = String(p.status || p.studentStatus || '').toLowerCase().trim();
  if (s === 'quit' || s === 'nghi' || s === 'nghỉ' || s === 'inactive' || s === 'stopped' || p.active === false || p.isActive === false) return 'quit';
  if (s === 'trial') return 'trial';
  return 'active';
}

function _isActiveProfile(p) {
  const k = _statusKind(p);
  return k === 'active' || k === 'trial';
}

function _safeInc(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v : 0;
}

function _txIncomeAmount(tx) {
  const classified = classifyTx(tx || {});
  if (!classified) return 0;
  const entries = Array.isArray(classified) ? classified : [classified];
  let total = 0;
  entries.forEach(entry => {
    if (entry && entry.field && entry.field.startsWith('income')) total += _safeInc(entry.value);
  });
  return total;
}

function _monthDocId(month) {
  return String(month || getCurrentMonthVN()).replace('-', '_');
}

function _rootSummaryPayload({ activeDelta = 0, profileDelta = 0, revenueDelta = 0, txDelta = 0, month = getCurrentMonthVN(), source = 'cloud-functions-superadmin-summary' }) {
  const docId = _monthDocId(month);
  const payload = {
    cachedCountUpdatedAt: FieldValue.serverTimestamp(),
    statsUpdatedAt: FieldValue.serverTimestamp(),
    statsSource: source,
    'superAdminStats.month': month,
    'superAdminStats.updatedAt': FieldValue.serverTimestamp(),
    'superAdminStats.source': source,
  };
  if (activeDelta) {
    payload.cachedActiveCount = FieldValue.increment(activeDelta);
    payload.cachedStudentCount = FieldValue.increment(activeDelta);
    payload.activeStudentCount = FieldValue.increment(activeDelta);
    payload.activeCount = FieldValue.increment(activeDelta);
    payload['superAdminStats.activeCount'] = FieldValue.increment(activeDelta);
  }
  if (profileDelta) {
    payload.cachedProfileCount = FieldValue.increment(profileDelta);
    payload.totalStudents = FieldValue.increment(profileDelta);
    payload.profileCount = FieldValue.increment(profileDelta);
    payload['superAdminStats.profileCount'] = FieldValue.increment(profileDelta);
  }
  if (txDelta) {
    payload.cachedTxCount = FieldValue.increment(txDelta);
    payload.txCount = FieldValue.increment(txDelta);
    payload['superAdminStats.txCount'] = FieldValue.increment(txDelta);
  }
  if (revenueDelta) {
    payload.cachedCurrentMonthRevenue = FieldValue.increment(revenueDelta);
    payload.currentMonthRevenue = FieldValue.increment(revenueDelta);
    payload[`cachedMonthlyRevenue.${month}`] = FieldValue.increment(revenueDelta);
    payload[`cachedMonthlyRevenue.${docId}`] = FieldValue.increment(revenueDelta);
    payload[`revenueByMonth.${month}`] = FieldValue.increment(revenueDelta);
    payload[`revenueByMonth.${docId}`] = FieldValue.increment(revenueDelta);
    payload['superAdminStats.revenueTotal'] = FieldValue.increment(revenueDelta);
  }
  return payload;
}

async function _updateRootSummary(clubId, payload) {
  if (!clubId || !payload || Object.keys(payload).length === 0) return null;
  return db.doc(`clubs/${clubId}`).set(payload, { merge: true });
}

exports.onProfileWriteSuperAdminSummary = functions
  .region(REGION)
  .firestore
  .document('clubs/{clubId}/profiles/{profileId}')
  .onWrite(async (change, context) => {
    const { clubId } = context.params;
    const beforeExists = change.before.exists;
    const afterExists = change.after.exists;
    const before = beforeExists ? change.before.data() : null;
    const after = afterExists ? change.after.data() : null;

    let profileDelta = 0;
    let activeDelta = 0;

    if (!beforeExists && afterExists) {
      profileDelta = 1;
      activeDelta = _isActiveProfile(after) ? 1 : 0;
    } else if (beforeExists && !afterExists) {
      profileDelta = -1;
      activeDelta = _isActiveProfile(before) ? -1 : 0;
    } else if (beforeExists && afterExists) {
      activeDelta = (_isActiveProfile(after) ? 1 : 0) - (_isActiveProfile(before) ? 1 : 0);
    }

    if (!profileDelta && !activeDelta) return null;
    return _updateRootSummary(clubId, _rootSummaryPayload({ activeDelta, profileDelta, source: 'profile-trigger' }));
  });

exports.onTransactionWriteSuperAdminSummary = functions
  .region(REGION)
  .firestore
  .document('clubs/{clubId}/transactions/{txId}')
  .onWrite(async (change, context) => {
    const { clubId } = context.params;
    const currentMonth = getCurrentMonthVN();
    let revenueDelta = 0;
    let txDelta = 0;

    if (change.before.exists) {
      const before = change.before.data();
      const beforeMonth = getTxMonth(before);
      if (beforeMonth === currentMonth) revenueDelta -= _txIncomeAmount(before);
      txDelta -= 1;
    }
    if (change.after.exists) {
      const after = change.after.data();
      const afterMonth = getTxMonth(after);
      if (afterMonth === currentMonth) revenueDelta += _txIncomeAmount(after);
      txDelta += 1;
    }

    if (!revenueDelta && !txDelta) return null;
    return _updateRootSummary(clubId, _rootSummaryPayload({ revenueDelta, txDelta, month: currentMonth, source: 'transaction-trigger' }));
  });

async function _countPaged(collectionRef, filterFn) {
  const PAGE_SIZE = 500;
  let last = null;
  let total = 0;
  let pages = 0;
  while (pages < 1000) {
    let q = collectionRef.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last.id);
    const snap = await q.get();
    if (snap.empty) break;
    pages++;
    snap.docs.forEach(docSnap => {
      if (!filterFn || filterFn(docSnap.data(), docSnap.id)) total++;
    });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  return { total, pages };
}

async function _sumCurrentMonthRevenue(clubId, month) {
  const txRef = db.collection(`clubs/${clubId}/transactions`);
  let q = txRef.where('txMonth', '==', month).limit(500);
  let last = null;
  let total = 0;
  let txCount = 0;
  let pages = 0;
  while (pages < 1000) {
    let pageQ = q;
    if (last) pageQ = txRef.where('txMonth', '==', month).orderBy(admin.firestore.FieldPath.documentId()).startAfter(last.id).limit(500);
    else pageQ = txRef.where('txMonth', '==', month).orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    const snap = await pageQ.get();
    if (snap.empty) break;
    pages++;
    snap.docs.forEach(d => {
      txCount++;
      total += _txIncomeAmount(d.data());
    });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
  return { total, txCount, pages };
}

async function refreshSuperAdminSummaryForClubInternal(clubId, options = {}) {
  const month = options.month || getCurrentMonthVN();
  const profilesRef = db.collection(`clubs/${clubId}/profiles`);
  const activeRes = await _countPaged(profilesRef, p => _isActiveProfile(p));
  const profileRes = await _countPaged(profilesRef);
  const txRevenue = await _sumCurrentMonthRevenue(clubId, month);
  const docId = _monthDocId(month);
  const now = FieldValue.serverTimestamp();

  const payload = {
    cachedActiveCount: activeRes.total,
    cachedStudentCount: activeRes.total,
    activeStudentCount: activeRes.total,
    activeCount: activeRes.total,
    cachedProfileCount: profileRes.total,
    profileCount: profileRes.total,
    totalStudents: profileRes.total,
    cachedTxCount: txRevenue.txCount,
    cachedCurrentMonthRevenue: txRevenue.total,
    currentMonthRevenue: txRevenue.total,
    cachedCountUpdatedAt: now,
    statsUpdatedAt: now,
    statsSource: 'cloud-functions-refresh-summary',
    [`cachedMonthlyRevenue.${month}`]: txRevenue.total,
    [`cachedMonthlyRevenue.${docId}`]: txRevenue.total,
    [`revenueByMonth.${month}`]: txRevenue.total,
    [`revenueByMonth.${docId}`]: txRevenue.total,
    superAdminStats: {
      month,
      activeCount: activeRes.total,
      profileCount: profileRes.total,
      revenueTotal: txRevenue.total,
      monthlyTxCount: txRevenue.txCount,
      source: 'cloud-functions-refresh-summary',
      updatedAt: admin.firestore.Timestamp.now(),
    },
  };

  await db.doc(`clubs/${clubId}`).set(payload, { merge: true });
  await db.doc(`clubs/${clubId}/stats/${docId}`).set({
    month,
    'income.total': txRevenue.total,
    income: { total: txRevenue.total },
    txCount: txRevenue.txCount,
    activeCount: activeRes.total,
    profileCount: profileRes.total,
    totalStudents: profileRes.total,
    source: 'cloud-functions-refresh-summary',
    updatedAt: now,
  }, { merge: true });

  return { clubId, month, activeCount: activeRes.total, profileCount: profileRes.total, revenueTotal: txRevenue.total, txCount: txRevenue.txCount };
}

exports.refreshSuperAdminSummaryForClub = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https
  .onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Bạn chưa đăng nhập.');
    const clubId = data && data.clubId;
    if (!clubId) throw new functions.https.HttpsError('invalid-argument', 'Thiếu clubId.');

    const userDoc = await db.doc(`users/${context.auth.uid}`).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const isSuperAdmin = context.auth.token.role === 'super_admin' || context.auth.token.email === 'admin@tstquynhon.com' || userData.role === 'super_admin';
    if (!isSuperAdmin && userData.clubId !== clubId) throw new functions.https.HttpsError('permission-denied', 'Không có quyền cập nhật thống kê CLB này.');

    return refreshSuperAdminSummaryForClubInternal(clubId, { month: data.month });
  });

exports.scheduledRefreshSuperAdminSummaries = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub
  .schedule('every 6 hours')
  .onRun(async () => {
    const clubsSnap = await db.collection('clubs').get();
    const results = [];
    for (const clubDoc of clubsSnap.docs) {
      try {
        results.push(await refreshSuperAdminSummaryForClubInternal(clubDoc.id));
      } catch (e) {
        functions.logger.warn('[scheduledRefreshSuperAdminSummaries] club failed', clubDoc.id, e && e.message);
      }
    }
    functions.logger.info('[scheduledRefreshSuperAdminSummaries] done', { count: results.length });
    return { count: results.length };
  });

module.exports._internal = { refreshSuperAdminSummaryForClubInternal };

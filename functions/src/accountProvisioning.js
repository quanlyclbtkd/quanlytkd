'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const REGION = 'asia-southeast1';
const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const SAFE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_CLUB_ID_RE = /^[a-z0-9_]{3,64}$/;
const SAFE_REQUEST_ID_RE = /^[A-Za-z0-9_-]{12,128}$/;
const MAX_BRANCH_COUNT = 10;

function httpsError(code, message, details) {
  return new functions.https.HttpsError(code, message, details);
}

function requireAuth(context) {
  if (!context.auth || !context.auth.uid) {
    throw httpsError('unauthenticated', 'Bạn chưa đăng nhập.');
  }
  return context.auth.uid;
}

async function loadActor(context) {
  const uid = requireAuth(context);
  const [userSnap, superSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`super_admins/${uid}`).get(),
  ]);
  const user = userSnap.exists ? userSnap.data() : {};
  const tokenRole = String(context.auth.token.role || '').toLowerCase();
  const role = String(user.role || tokenRole || '').toLowerCase();
  return {
    uid,
    email: String(context.auth.token.email || user.email || '').toLowerCase(),
    role,
    clubId: String(user.clubId || ''),
    isSuperAdmin: tokenRole === 'super_admin' || role === 'super_admin' || superSnap.exists,
  };
}

function requireSuperAdmin(actor) {
  if (!actor.isSuperAdmin) {
    throw httpsError('permission-denied', 'Chỉ SuperAdmin mới được thực hiện thao tác này.');
  }
}

function requireClubAdmin(actor, clubId) {
  if (actor.isSuperAdmin) return;
  if (!['admin', 'owner'].includes(actor.role) || actor.clubId !== clubId) {
    throw httpsError('permission-denied', 'Bạn không có quyền quản lý tài khoản của CLB này.');
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!SAFE_EMAIL_RE.test(email) || email.length > 254) {
    throw httpsError('invalid-argument', 'Email không hợp lệ.');
  }
  return email;
}

function normalizeClubId(value) {
  const clubId = String(value || '').trim().toLowerCase();
  if (!SAFE_CLUB_ID_RE.test(clubId)) {
    throw httpsError('invalid-argument', 'Mã CLB chỉ được gồm chữ thường, số và dấu gạch dưới.');
  }
  return clubId;
}

function normalizeText(value, field, maxLength = 160) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength) {
    throw httpsError('invalid-argument', `${field} không hợp lệ.`);
  }
  return text;
}

function normalizeOptionalText(value, maxLength = 160) {
  const text = String(value || '').trim();
  if (text.length > maxLength) throw httpsError('invalid-argument', 'Dữ liệu quá dài.');
  return text;
}

function normalizeRequestId(value) {
  const requestId = String(value || '').trim();
  if (!SAFE_REQUEST_ID_RE.test(requestId)) {
    throw httpsError('invalid-argument', 'requestId không hợp lệ.');
  }
  return requestId;
}

function normalizeBranchCount(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_BRANCH_COUNT) {
    throw httpsError('invalid-argument', `Số cơ sở phải từ 1 đến ${MAX_BRANCH_COUNT}.`);
  }
  return n;
}

function requestRef(requestId) {
  return db.doc(`account_provisioning_requests/${requestId}`);
}

async function getCompletedRequest(requestId, action, actorUid) {
  const snap = await requestRef(requestId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.actorUid !== actorUid || data.action !== action) {
    throw httpsError('already-exists', 'requestId đã được dùng cho thao tác khác.');
  }
  if (data.status === 'done') return data.result || {};
  throw httpsError('aborted', 'Yêu cầu này đang được xử lý. Vui lòng không bấm lại.');
}

async function markRequestPending(requestId, action, actor, target) {
  const ref = requestRef(requestId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() || {};
      if (data.actorUid !== actor.uid || data.action !== action) {
        throw httpsError('already-exists', 'requestId đã được dùng cho thao tác khác.');
      }
      if (data.status === 'done') return;
      throw httpsError('aborted', 'Yêu cầu này đang được xử lý.');
    }
    tx.create(ref, {
      action,
      actorUid: actor.uid,
      actorRole: actor.role,
      targetClubId: target.clubId || null,
      targetUid: target.uid || null,
      targetEmail: target.email || null,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

function auditRef() {
  return db.collection('audit_logs').doc();
}

function auditPayload({ actor, action, targetClubId, targetUid, requestId, success, errorCode, beforeSummary, afterSummary }) {
  return {
    actorUid: actor.uid,
    actorRole: actor.role,
    actorEmail: actor.email || null,
    action,
    targetClubId: targetClubId || null,
    targetUid: targetUid || null,
    requestId,
    success: success !== false,
    errorCode: errorCode || null,
    beforeSummary: beforeSummary || null,
    afterSummary: afterSummary || null,
    timestamp: FieldValue.serverTimestamp(),
  };
}

async function finishRequest({ requestId, action, actor, targetClubId, targetUid, result, beforeSummary, afterSummary }) {
  const batch = db.batch();
  batch.set(requestRef(requestId), {
    status: 'done',
    result,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(auditRef(), auditPayload({
    actor, action, targetClubId, targetUid, requestId,
    success: true, beforeSummary, afterSummary,
  }));
  await batch.commit();
}

async function failRequest({ requestId, action, actor, targetClubId, targetUid, error }) {
  try {
    const batch = db.batch();
    batch.set(requestRef(requestId), {
      status: 'failed',
      errorCode: error && error.code ? String(error.code) : 'internal',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(auditRef(), auditPayload({
      actor, action, targetClubId, targetUid, requestId,
      success: false,
      errorCode: error && error.code ? String(error.code) : 'internal',
    }));
    await batch.commit();
  } catch (auditError) {
    functions.logger.error('[accountProvisioning] failed to record failure', auditError);
  }
}

async function getOrCreateAuthUser(email, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    return { user: existing, created: false };
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  const user = await auth.createUser({
    email,
    displayName: displayName || undefined,
    emailVerified: false,
    disabled: false,
  });
  return { user, created: true };
}

function callable(handler) {
  return functions.region(REGION).runWith({ timeoutSeconds: 300, memory: '512MB' }).https.onCall(handler);
}

exports.provisionClubAdmin = callable(async (data, context) => {
  const actor = await loadActor(context);
  requireSuperAdmin(actor);
  const action = 'provisionClubAdmin';
  const requestId = normalizeRequestId(data && data.requestId);
  const completed = await getCompletedRequest(requestId, action, actor.uid);
  if (completed) return completed;

  const clubId = normalizeClubId(data && data.clubId);
  const clubName = normalizeText(data && data.clubName, 'Tên CLB');
  const email = normalizeEmail(data && data.email);
  const branchCount = normalizeBranchCount(data && data.branchCount);
  const logoBase64 = normalizeOptionalText(data && data.logoBase64, 700000);
  await markRequestPending(requestId, action, actor, { clubId, email });

  let authRecord = null;
  let createdAuth = false;
  try {
    const clubRef = db.doc(`clubs/${clubId}`);
    const clubSnap = await clubRef.get();
    if (clubSnap.exists) throw httpsError('already-exists', 'Mã CLB đã tồn tại.');

    const created = await getOrCreateAuthUser(email, clubName);
    authRecord = created.user;
    createdAuth = created.created;

    const existingUserSnap = await db.doc(`users/${authRecord.uid}`).get();
    if (existingUserSnap.exists) {
      const existingUser = existingUserSnap.data() || {};
      if (existingUser.clubId && existingUser.clubId !== clubId) {
        throw httpsError('already-exists', 'Email đã thuộc một CLB khác.');
      }
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.create(clubRef, {
      clubName,
      adminUid: authRecord.uid,
      adminEmail: email,
      createdAt: now,
      expiryDate: '2027-04-30',
      accountStatus: 'active',
      credentialStorageVersion: 2,
    });
    batch.set(db.doc(`users/${authRecord.uid}`), {
      uid: authRecord.uid,
      email,
      role: 'admin',
      clubId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
    batch.set(db.doc(`clubs/${clubId}/settings/main_config`), {
      bankId: '', accountNo: '', accountName: '', branchCount,
      location: 'Quy Nhơn',
      ...(logoBase64 ? { logoBase64 } : {}),
    }, { merge: true });
    batch.set(db.doc(`clubs/${clubId}/settings/inventory_stats`), {}, { merge: true });
    await batch.commit();

    const result = { clubId, adminUid: authRecord.uid, email, passwordResetRequired: true };
    await finishRequest({
      requestId, action, actor, targetClubId: clubId, targetUid: authRecord.uid, result,
      afterSummary: { clubCreated: true, role: 'admin', credentialStored: false },
    });
    return result;
  } catch (error) {
    if (createdAuth && authRecord) {
      try { await auth.deleteUser(authRecord.uid); } catch (_) {}
    }
    await failRequest({ requestId, action, actor, targetClubId: clubId, targetUid: authRecord && authRecord.uid, error });
    if (error instanceof functions.https.HttpsError) throw error;
    functions.logger.error('[provisionClubAdmin]', error);
    throw httpsError('internal', 'Không thể tạo CLB mới.');
  }
});

exports.provisionCoachAccount = callable(async (data, context) => {
  const actor = await loadActor(context);
  const action = 'provisionCoachAccount';
  const requestId = normalizeRequestId(data && data.requestId);
  const completed = await getCompletedRequest(requestId, action, actor.uid);
  if (completed) return completed;

  const clubId = normalizeClubId(data && data.clubId);
  requireClubAdmin(actor, clubId);
  const email = normalizeEmail(data && data.email);
  const displayName = normalizeText(data && data.displayName, 'Tên HLV');
  const branch = normalizeOptionalText(data && data.branch, 80);
  await markRequestPending(requestId, action, actor, { clubId, email });

  let authRecord = null;
  let createdAuth = false;
  try {
    const clubSnap = await db.doc(`clubs/${clubId}`).get();
    if (!clubSnap.exists) throw httpsError('not-found', 'Không tìm thấy CLB.');

    const created = await getOrCreateAuthUser(email, displayName);
    authRecord = created.user;
    createdAuth = created.created;
    const userRef = db.doc(`users/${authRecord.uid}`);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const current = userSnap.data() || {};
      if (current.clubId && current.clubId !== clubId) {
        throw httpsError('already-exists', 'Email đã thuộc một CLB khác.');
      }
      if (current.role && current.role !== 'coach') {
        throw httpsError('already-exists', 'Email đã thuộc một vai trò khác.');
      }
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(userRef, {
      uid: authRecord.uid, email, displayName, role: 'coach', clubId, branch,
      status: 'active', updatedAt: now,
      ...(userSnap.exists ? {} : { createdAt: now }),
    }, { merge: true });
    batch.set(db.doc(`clubs/${clubId}/coaches/${authRecord.uid}`), {
      uid: authRecord.uid, email, displayName, role: 'coach', clubId, branch,
      status: 'active', updatedAt: now,
      ...(userSnap.exists ? {} : { createdAt: now }),
    }, { merge: true });
    await batch.commit();

    const result = { uid: authRecord.uid, email, clubId, passwordResetRequired: true };
    await finishRequest({
      requestId, action, actor, targetClubId: clubId, targetUid: authRecord.uid, result,
      afterSummary: { role: 'coach', branch, credentialStored: false },
    });
    return result;
  } catch (error) {
    if (createdAuth && authRecord) {
      try { await auth.deleteUser(authRecord.uid); } catch (_) {}
    }
    await failRequest({ requestId, action, actor, targetClubId: clubId, targetUid: authRecord && authRecord.uid, error });
    if (error instanceof functions.https.HttpsError) throw error;
    functions.logger.error('[provisionCoachAccount]', error);
    throw httpsError('internal', 'Không thể tạo tài khoản HLV.');
  }
});

exports.replaceClubAdmin = callable(async (data, context) => {
  const actor = await loadActor(context);
  requireSuperAdmin(actor);
  const action = 'replaceClubAdmin';
  const requestId = normalizeRequestId(data && data.requestId);
  const completed = await getCompletedRequest(requestId, action, actor.uid);
  if (completed) return completed;

  const clubId = normalizeClubId(data && data.clubId);
  const email = normalizeEmail(data && data.email);
  await markRequestPending(requestId, action, actor, { clubId, email });

  let newAuth = null;
  let createdAuth = false;
  try {
    const clubRef = db.doc(`clubs/${clubId}`);
    const clubSnap = await clubRef.get();
    if (!clubSnap.exists) throw httpsError('not-found', 'Không tìm thấy CLB.');
    const club = clubSnap.data() || {};
    const created = await getOrCreateAuthUser(email, `${club.clubName || clubId} Admin`);
    newAuth = created.user;
    createdAuth = created.created;

    const existingUserSnap = await db.doc(`users/${newAuth.uid}`).get();
    if (existingUserSnap.exists) {
      const existingUser = existingUserSnap.data() || {};
      if (existingUser.clubId && existingUser.clubId !== clubId) {
        throw httpsError('already-exists', 'Email đã thuộc một CLB khác.');
      }
    }

    const oldAdminUid = String(club.adminUid || '');
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(db.doc(`users/${newAuth.uid}`), {
      uid: newAuth.uid, email, role: 'admin', clubId, status: 'active', updatedAt: now,
      ...(existingUserSnap.exists ? {} : { createdAt: now }),
    }, { merge: true });
    batch.set(clubRef, {
      adminUid: newAuth.uid,
      adminEmail: email,
      adminPassword: FieldValue.delete(),
      passwordChangedAt: FieldValue.delete(),
      credentialStorageVersion: 2,
      updatedAt: now,
    }, { merge: true });
    if (oldAdminUid && oldAdminUid !== newAuth.uid) {
      batch.set(db.doc(`users/${oldAdminUid}`), {
        role: 'former_admin', status: 'replaced', replacedAt: now, updatedAt: now,
      }, { merge: true });
    }
    await batch.commit();

    let oldAdminDisabled = false;
    if (oldAdminUid && oldAdminUid !== newAuth.uid) {
      try { await auth.updateUser(oldAdminUid, { disabled: true }); oldAdminDisabled = true; } catch (_) {}
    }

    const result = { clubId, adminUid: newAuth.uid, email, passwordResetRequired: true, oldAdminDisabled };
    await finishRequest({
      requestId, action, actor, targetClubId: clubId, targetUid: newAuth.uid, result,
      beforeSummary: { oldAdminUid: oldAdminUid || null, oldAdminEmail: club.adminEmail || null },
      afterSummary: { newAdminUid: newAuth.uid, newAdminEmail: email, credentialStored: false },
    });
    return result;
  } catch (error) {
    if (createdAuth && newAuth) {
      try { await auth.deleteUser(newAuth.uid); } catch (_) {}
    }
    await failRequest({ requestId, action, actor, targetClubId: clubId, targetUid: newAuth && newAuth.uid, error });
    if (error instanceof functions.https.HttpsError) throw error;
    functions.logger.error('[replaceClubAdmin]', error);
    throw httpsError('internal', 'Không thể cấp lại tài khoản Admin.');
  }
});

exports.removeCoachAccount = callable(async (data, context) => {
  const actor = await loadActor(context);
  const action = 'removeCoachAccount';
  const requestId = normalizeRequestId(data && data.requestId);
  const completed = await getCompletedRequest(requestId, action, actor.uid);
  if (completed) return completed;

  const clubId = normalizeClubId(data && data.clubId);
  const uid = normalizeText(data && data.uid, 'UID', 128);
  requireClubAdmin(actor, clubId);
  await markRequestPending(requestId, action, actor, { clubId, uid });
  try {
    const coachRef = db.doc(`clubs/${clubId}/coaches/${uid}`);
    const coachSnap = await coachRef.get();
    if (!coachSnap.exists) throw httpsError('not-found', 'Không tìm thấy tài khoản HLV.');
    const coach = coachSnap.data() || {};
    if (coach.clubId && coach.clubId !== clubId) throw httpsError('permission-denied', 'Sai phạm vi CLB.');

    const batch = db.batch();
    batch.delete(coachRef);
    batch.delete(db.doc(`users/${uid}`));
    await batch.commit();
    let authDeleted = true;
    try { await auth.deleteUser(uid); } catch (error) {
      if (error.code !== 'auth/user-not-found') authDeleted = false;
    }

    const result = { uid, clubId, authDeleted };
    await finishRequest({
      requestId, action, actor, targetClubId: clubId, targetUid: uid, result,
      beforeSummary: { role: 'coach', email: coach.email || null },
      afterSummary: { removed: true, authDeleted },
    });
    return result;
  } catch (error) {
    await failRequest({ requestId, action, actor, targetClubId: clubId, targetUid: uid, error });
    if (error instanceof functions.https.HttpsError) throw error;
    functions.logger.error('[removeCoachAccount]', error);
    throw httpsError('internal', 'Không thể xóa tài khoản HLV.');
  }
});

exports.migrateCoachAccounts = callable(async (data, context) => {
  const actor = await loadActor(context);
  const action = 'migrateCoachAccounts';
  const requestId = normalizeRequestId(data && data.requestId);
  const completed = await getCompletedRequest(requestId, action, actor.uid);
  if (completed) return completed;

  const clubId = normalizeClubId(data && data.clubId);
  requireClubAdmin(actor, clubId);
  await markRequestPending(requestId, action, actor, { clubId });
  try {
    const snap = await db.collection(`clubs/${clubId}/coaches`).limit(500).get();
    let fixed = 0;
    let skipped = 0;
    let batch = db.batch();
    let batchOps = 0;
    const commitIfNeeded = async force => {
      if (batchOps >= 400 || (force && batchOps > 0)) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    };
    for (const coachDoc of snap.docs) {
      const current = coachDoc.data() || {};
      const normalized = {
        uid: coachDoc.id,
        role: 'coach',
        clubId,
        branch: current.branch || '',
        email: String(current.email || '').toLowerCase(),
        displayName: current.displayName || current.email || '',
        status: current.status || 'active',
        updatedAt: FieldValue.serverTimestamp(),
      };
      const needsFix = current.uid !== coachDoc.id || current.role !== 'coach' || current.clubId !== clubId;
      batch.set(coachDoc.ref, normalized, { merge: true }); batchOps++;
      batch.set(db.doc(`users/${coachDoc.id}`), normalized, { merge: true }); batchOps++;
      needsFix ? fixed++ : skipped++;
      await commitIfNeeded(false);
    }
    await commitIfNeeded(true);
    const result = { clubId, scanned: snap.size, fixed, skipped, truncated: snap.size >= 500 };
    await finishRequest({ requestId, action, actor, targetClubId: clubId, result,
      afterSummary: { scanned: snap.size, fixed, skipped, truncated: result.truncated } });
    return result;
  } catch (error) {
    await failRequest({ requestId, action, actor, targetClubId: clubId, error });
    if (error instanceof functions.https.HttpsError) throw error;
    functions.logger.error('[migrateCoachAccounts]', error);
    throw httpsError('internal', 'Không thể đồng bộ tài khoản HLV.');
  }
});



exports.repairCurrentAccountMembership = callable(async (_data, context) => {
  const uid = requireAuth(context);
  const email = normalizeEmail(context.auth.token.email || '');
  const existing = await db.doc(`users/${uid}`).get();
  if (existing.exists) {
    const current = existing.data() || {};
    return { repaired: false, role: current.role || null, clubId: current.clubId || null, branch: current.branch || '' };
  }

  const adminMatches = await db.collection('clubs').where('adminEmail', '==', email).limit(2).get();
  if (adminMatches.size === 1) {
    const clubDoc = adminMatches.docs[0];
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(db.doc(`users/${uid}`), {
      uid, email, role: 'admin', clubId: clubDoc.id, status: 'active', createdAt: now, updatedAt: now,
    }, { merge: true });
    batch.set(clubDoc.ref, { adminUid: uid, credentialStorageVersion: 2, updatedAt: now }, { merge: true });
    batch.set(auditRef(), auditPayload({
      actor: { uid, role: 'authenticated_repair', email },
      action: 'repairCurrentAccountMembership', targetClubId: clubDoc.id, targetUid: uid,
      requestId: `repair_${uid}_${Date.now()}`, success: true,
      afterSummary: { role: 'admin', verifiedBy: 'clubs.adminEmail' },
    }));
    await batch.commit();
    return { repaired: true, role: 'admin', clubId: clubDoc.id, branch: '' };
  }
  if (adminMatches.size > 1) throw httpsError('failed-precondition', 'Email Admin đang trùng ở nhiều CLB. Cần SuperAdmin xử lý.');

  const coachMatches = await db.collectionGroup('coaches').where('email', '==', email).limit(2).get();
  if (coachMatches.size === 1) {
    const coachDoc = coachMatches.docs[0];
    const parts = coachDoc.ref.path.split('/');
    const clubId = parts[1] || '';
    const coach = coachDoc.data() || {};
    if (!clubId) throw httpsError('failed-precondition', 'Không xác định được CLB của HLV.');
    await db.doc(`users/${uid}`).set({
      uid, email, role: 'coach', clubId, branch: coach.branch || '', status: 'active',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await auditRef().set(auditPayload({
      actor: { uid, role: 'authenticated_repair', email },
      action: 'repairCurrentAccountMembership', targetClubId: clubId, targetUid: uid,
      requestId: `repair_${uid}_${Date.now()}`, success: true,
      afterSummary: { role: 'coach', verifiedBy: 'coaches.email' },
    }));
    return { repaired: true, role: 'coach', clubId, branch: coach.branch || '' };
  }
  if (coachMatches.size > 1) throw httpsError('failed-precondition', 'Email HLV đang trùng ở nhiều CLB. Cần Admin xử lý.');
  throw httpsError('not-found', 'Không tìm thấy phân quyền hợp lệ cho tài khoản này.');
});

exports.purgeLegacyCredentialFields = callable(async (data, context) => {
  const actor = await loadActor(context);
  requireSuperAdmin(actor);
  const action = 'purgeLegacyCredentialFields';
  const requestId = normalizeRequestId(data && data.requestId);
  const completed = await getCompletedRequest(requestId, action, actor.uid);
  if (completed) return completed;
  await markRequestPending(requestId, action, actor, {});
  try {
    const clubsSnap = await db.collection('clubs').limit(500).get();
    let batch = db.batch();
    let batchOps = 0;
    let cleanedClubs = 0;
    for (const clubDoc of clubsSnap.docs) {
      const data = clubDoc.data() || {};
      const hasLegacy = ['adminPassword', 'coachPassword', 'temporaryPassword', 'passwordChangedAt']
        .some(key => Object.prototype.hasOwnProperty.call(data, key));
      if (!hasLegacy) continue;
      batch.set(clubDoc.ref, {
        adminPassword: FieldValue.delete(),
        coachPassword: FieldValue.delete(),
        temporaryPassword: FieldValue.delete(),
        passwordChangedAt: FieldValue.delete(),
        credentialStorageVersion: 2,
        credentialPurgedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batchOps++;
      cleanedClubs++;
      if (batchOps >= 400) { await batch.commit(); batch = db.batch(); batchOps = 0; }
    }
    if (batchOps > 0) await batch.commit();
    const result = { scannedClubs: clubsSnap.size, cleanedClubs, truncated: clubsSnap.size >= 500 };
    await finishRequest({ requestId, action, actor, result,
      afterSummary: { scannedClubs: clubsSnap.size, cleanedClubs, credentialValuesLogged: false } });
    return result;
  } catch (error) {
    await failRequest({ requestId, action, actor, error });
    if (error instanceof functions.https.HttpsError) throw error;
    functions.logger.error('[purgeLegacyCredentialFields]', error);
    throw httpsError('internal', 'Không thể xóa dữ liệu mật khẩu cũ.');
  }
});

exports.setClubAccountStatus = callable(async (data, context) => {
  const actor = await loadActor(context);
  requireSuperAdmin(actor);
  const action = 'setClubAccountStatus';
  const requestId = normalizeRequestId(data && data.requestId);
  const completed = await getCompletedRequest(requestId, action, actor.uid);
  if (completed) return completed;
  const clubId = normalizeClubId(data && data.clubId);
  const status = String(data && data.status || '').trim();
  if (!['active', 'locked'].includes(status)) throw httpsError('invalid-argument', 'Trạng thái không hợp lệ.');
  await markRequestPending(requestId, action, actor, { clubId });
  try {
    const clubRef = db.doc(`clubs/${clubId}`);
    const snap = await clubRef.get();
    if (!snap.exists) throw httpsError('not-found', 'Không tìm thấy CLB.');
    const before = snap.data() || {};
    await clubRef.set({ accountStatus: status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (before.adminUid) {
      try { await auth.updateUser(before.adminUid, { disabled: status === 'locked' }); } catch (_) {}
    }
    const result = { clubId, status };
    await finishRequest({ requestId, action, actor, targetClubId: clubId, targetUid: before.adminUid || null, result,
      beforeSummary: { accountStatus: before.accountStatus || null }, afterSummary: { accountStatus: status } });
    return result;
  } catch (error) {
    await failRequest({ requestId, action, actor, targetClubId: clubId, error });
    if (error instanceof functions.https.HttpsError) throw error;
    throw httpsError('internal', 'Không thể cập nhật trạng thái CLB.');
  }
});

exports.updateClubSubscription = callable(async (data, context) => {
  const actor = await loadActor(context);
  requireSuperAdmin(actor);
  const action = 'updateClubSubscription';
  const requestId = normalizeRequestId(data && data.requestId);
  const completed = await getCompletedRequest(requestId, action, actor.uid);
  if (completed) return completed;
  const clubId = normalizeClubId(data && data.clubId);
  const expiryDate = String(data && data.expiryDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) throw httpsError('invalid-argument', 'Ngày hết hạn không hợp lệ.');
  await markRequestPending(requestId, action, actor, { clubId });
  try {
    const ref = db.doc(`clubs/${clubId}`);
    const snap = await ref.get();
    if (!snap.exists) throw httpsError('not-found', 'Không tìm thấy CLB.');
    const before = snap.data() || {};
    await ref.set({ expiryDate, accountStatus: 'active', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const result = { clubId, expiryDate, accountStatus: 'active' };
    await finishRequest({ requestId, action, actor, targetClubId: clubId, result,
      beforeSummary: { expiryDate: before.expiryDate || null, accountStatus: before.accountStatus || null },
      afterSummary: { expiryDate, accountStatus: 'active' } });
    return result;
  } catch (error) {
    await failRequest({ requestId, action, actor, targetClubId: clubId, error });
    if (error instanceof functions.https.HttpsError) throw error;
    throw httpsError('internal', 'Không thể cập nhật thời hạn CLB.');
  }
});

/**
 * Phase 4K-6V4B — Shared server-side authorization for callable functions.
 * Never trust clubId/role supplied by the browser.
 */
async function requireClubAdmin({ db, functions, context, clubId }) {
  if (!context || !context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Bạn chưa đăng nhập.');
  }
  if (!clubId || typeof clubId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu hoặc sai clubId.');
  }

  const uid = context.auth.uid;
  const [userSnap, superAdminSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`super_admins/${uid}`).get(),
  ]);
  const user = userSnap.exists ? userSnap.data() : {};
  const tokenRole = String((context.auth.token && context.auth.token.role) || '').toLowerCase();
  const userRole = String(user.role || '').toLowerCase();
  const isSuperAdmin = tokenRole === 'super_admin' || userRole === 'super_admin' || superAdminSnap.exists;

  if (isSuperAdmin) return { uid, role: 'super_admin', clubId, isSuperAdmin: true, user };

  const enabled = !['disabled', 'locked', 'suspended'].includes(String(user.status || 'active').toLowerCase());
  const isAdmin = ['admin', 'owner'].includes(userRole);
  if (!userSnap.exists || !enabled || !isAdmin || user.clubId !== clubId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Chỉ Admin của câu lạc bộ này mới được thực hiện thao tác.'
    );
  }

  return { uid, role: userRole, clubId, isSuperAdmin: false, user };
}

module.exports = { requireClubAdmin };

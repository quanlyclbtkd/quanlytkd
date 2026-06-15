/**
 * Phase 4K-6W — Secure Account Provisioning Client Facade
 * Privileged account writes are delegated to Cloud Functions/Admin SDK.
 * This module never receives, stores, logs, or returns a password.
 */

const REGION = 'asia-southeast1';
const _inFlight = new Map();
let _functions = null;

function _sdk() {
  const fb = window._fb_init || {};
  if (!fb.getFunctions || !fb.httpsCallable || !fb.getAuth || !fb.sendPasswordResetEmail) {
    throw new Error('Firebase Functions/Auth SDK chưa sẵn sàng.');
  }
  return fb;
}

function _getFunctions() {
  if (_functions) return _functions;
  const fb = _sdk();
  _functions = fb.getFunctions(undefined, REGION);
  return _functions;
}

function _requestId(prefix) {
  const cryptoObj = window.crypto;
  const id = cryptoObj && typeof cryptoObj.randomUUID === 'function'
    ? cryptoObj.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id}`.slice(0, 120);
}

function _normalizeCallableError(error) {
  const rawCode = String(error?.code || '');
  const code = rawCode.replace(/^functions\//, '');
  const known = {
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    'permission-denied': 'Tài khoản không có quyền thực hiện thao tác này.',
    'invalid-argument': error?.message || 'Dữ liệu gửi lên không hợp lệ.',
    'already-exists': error?.message || 'Email hoặc mã hệ thống đã tồn tại.',
    'not-found': error?.message || 'Không tìm thấy dữ liệu cần xử lý.',
    aborted: 'Yêu cầu đang được xử lý. Vui lòng không bấm lại.',
    unavailable: 'Máy chủ tạm thời không sẵn sàng. Vui lòng thử lại.',
    internal: 'Máy chủ không thể hoàn tất thao tác. Vui lòng thử lại.',
  };
  const normalized = new Error(known[code] || error?.message || 'Không thể hoàn tất thao tác tài khoản.');
  normalized.code = code || 'unknown';
  normalized.original = error;
  return normalized;
}

async function _callOnce(action, payload, key = action) {
  if (_inFlight.has(key)) return _inFlight.get(key);
  const promise = (async () => {
    const fb = _sdk();
    const callable = fb.httpsCallable(_getFunctions(), action);
    try {
      const response = await callable({ ...payload, requestId: payload.requestId || _requestId(action) });
      return response?.data || {};
    } catch (error) {
      throw _normalizeCallableError(error);
    }
  })().finally(() => _inFlight.delete(key));
  _inFlight.set(key, promise);
  return promise;
}

async function _sendSetupEmail(email) {
  const fb = _sdk();
  const auth = fb.getAuth();
  try {
    await fb.sendPasswordResetEmail(auth, email);
    return { sent: true };
  } catch (error) {
    console.warn('[AccountProvisioning] account created but setup email failed', {
      code: error?.code || 'unknown',
      // Deliberately do not log email or any credential.
    });
    return { sent: false, code: error?.code || 'unknown' };
  }
}

async function provisionClubAdmin(input) {
  const data = await _callOnce('provisionClubAdmin', {
    clubId: input.clubId,
    clubName: input.clubName,
    email: input.email,
    branchCount: input.branchCount,
    logoBase64: input.logoBase64 || '',
  }, `provisionClubAdmin:${String(input.clubId || '').toLowerCase()}`);
  const emailResult = await _sendSetupEmail(data.email || input.email);
  return { ...data, setupEmailSent: emailResult.sent };
}

async function provisionCoachAccount(input) {
  const data = await _callOnce('provisionCoachAccount', {
    clubId: input.clubId,
    email: input.email,
    displayName: input.displayName,
    branch: input.branch || '',
  }, `provisionCoachAccount:${String(input.email || '').toLowerCase()}`);
  const emailResult = await _sendSetupEmail(data.email || input.email);
  return { ...data, setupEmailSent: emailResult.sent };
}

async function replaceClubAdmin(input) {
  const data = await _callOnce('replaceClubAdmin', {
    clubId: input.clubId,
    email: input.email,
  }, `replaceClubAdmin:${String(input.clubId || '').toLowerCase()}`);
  const emailResult = await _sendSetupEmail(data.email || input.email);
  return { ...data, setupEmailSent: emailResult.sent };
}

function removeCoachAccount(input) {
  return _callOnce('removeCoachAccount', {
    clubId: input.clubId,
    uid: input.uid,
  }, `removeCoachAccount:${input.clubId}:${input.uid}`);
}

function migrateCoachAccounts(input) {
  return _callOnce('migrateCoachAccounts', {
    clubId: input.clubId,
  }, `migrateCoachAccounts:${input.clubId}`);
}


function repairCurrentAccountMembership() {
  return _callOnce('repairCurrentAccountMembership', {}, 'repairCurrentAccountMembership');
}

function purgeLegacyCredentialFields() {
  return _callOnce('purgeLegacyCredentialFields', {}, 'purgeLegacyCredentialFields');
}

function setClubAccountStatus(input) {
  return _callOnce('setClubAccountStatus', {
    clubId: input.clubId,
    status: input.status,
  }, `setClubAccountStatus:${input.clubId}`);
}

function updateClubSubscription(input) {
  return _callOnce('updateClubSubscription', {
    clubId: input.clubId,
    expiryDate: input.expiryDate,
  }, `updateClubSubscription:${input.clubId}`);
}

export const AccountProvisioningService = Object.freeze({
  provisionClubAdmin,
  provisionCoachAccount,
  replaceClubAdmin,
  removeCoachAccount,
  migrateCoachAccounts,
  repairCurrentAccountMembership,
  purgeLegacyCredentialFields,
  setClubAccountStatus,
  updateClubSubscription,
  isBusy(key) { return _inFlight.has(key); },
});

export function initAccountProvisioningService() {
  window.AccountProvisioningService = AccountProvisioningService;
  window.__accountProvisioningSecurity = Object.freeze({
    region: REGION,
    credentialStorage: 'forbidden',
    privilegedWrites: 'cloud-functions-only',
    initializedAt: new Date().toISOString(),
  });
  return AccountProvisioningService;
}

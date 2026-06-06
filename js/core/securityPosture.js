/**
 * Phase 4K-6D — securityPosture.js
 * Security Posture Service — read-only audit/readiness. No enforcement.
 * Không block user. Không ghi Firestore. Không đổi nghiệp vụ.
 */

export const SecurityPosture = {
  getBuildSecurityInfo() {
    return {
      appBuildVersion: (typeof window !== 'undefined' && window.APP_BUILD_VERSION) || '',
      appSecurityPhase: (typeof window !== 'undefined' && window.APP_SECURITY_PHASE) || '',
      buildFingerprint: (typeof window !== 'undefined' && window.APP_BUILD_FINGERPRINT) || '',
      mainScript: (typeof document !== 'undefined')
        ? Array.from(document.scripts || []).map(function(s) { return s.src || ''; }).filter(function(x) { return x.includes('main.js'); })
        : [],
      protocol: (typeof location !== 'undefined') ? location.protocol : '',
      host: (typeof location !== 'undefined') ? location.host : '',
      isHttps: (typeof location !== 'undefined') ? location.protocol === 'https:' : false,
      isFileProtocol: (typeof location !== 'undefined') ? location.protocol === 'file:' : false,
      hasFirebaseConfig: true,
      hasInlineAntiDevtools: true,
      antiDevtoolsEffectiveness: 'low-deterrent-only',
      note: 'Frontend JavaScript không thể chống copy tuyệt đối. Cần bảo vệ bằng Rules/AppCheck/Cloud Functions/license server-side.'
    };
  },

  getRuntimeSecurityInfo() {
    var auth = (typeof window !== 'undefined') ? window.auth : null;
    var st = (typeof window !== 'undefined' && window.__store) ? window.__store : {};
    return {
      hasAuthUser: !!(auth && auth.currentUser),
      userEmail: (auth && auth.currentUser && auth.currentUser.email) || '',
      userRole: (typeof window !== 'undefined' && window.userRole) || st.userRole || '',
      clubId: st.clubId || (typeof window !== 'undefined' && window.currentClubId) || '',
      isSuperAdmin: (typeof window !== 'undefined' && typeof window.isSuperAdminRole === 'function')
        ? window.isSuperAdminRole()
        : false,
      hasAppCheckRuntime: !!(typeof window !== 'undefined' && window.__appCheckInitialized),
      hasMobileSuperAdminGate: typeof window !== 'undefined' && typeof window.debugMobileSuperAdminGate === 'function',
      hasTenantDebug: typeof window !== 'undefined' && typeof window.debugTenantIsolation === 'function',
      hasRuntimeErrorGuard: typeof window !== 'undefined' && typeof window.debugRuntimeErrors === 'function'
    };
  },

  getLicenseInfo() {
    var st = (typeof window !== 'undefined' && window.__store) ? window.__store : {};
    var cfg = st.clubConfig || (typeof window !== 'undefined' && window.clubConfig) || {};
    var today = new Date().toISOString().slice(0, 10);
    var expiryDate = String(cfg.expiryDate || cfg.expiresAt || '');
    var accountStatus = String(cfg.accountStatus || cfg.status || '').toLowerCase();
    var allowedDomains = Array.isArray(cfg.allowedDomains) ? cfg.allowedDomains : [];
    var currentHost = (typeof location !== 'undefined') ? location.host : '';
    var isExpired = !!(expiryDate && expiryDate.slice(0, 10) < today);
    var isLocked = accountStatus === 'locked' || accountStatus === 'disabled';
    var domainAllowedClientSide = !allowedDomains.length ||
      allowedDomains.some(function(d) { return String(d || '').toLowerCase() === currentHost.toLowerCase(); });

    return {
      clubId: st.clubId || (typeof window !== 'undefined' && window.currentClubId) || '',
      clubName: cfg.clubName || cfg.name || '',
      accountStatus: accountStatus,
      expiryDate: expiryDate,
      isExpired: isExpired,
      isLocked: isLocked,
      allowedDomains: allowedDomains,
      currentHost: currentHost,
      domainAllowedClientSide: domainAllowedClientSide,
      licenseCheckMode: 'client-readiness-warn-only',
      shouldHardBlockNow: false,
      warning: 'Client-side license check có thể bị bypass. Enforcement thật cần Firestore Rules/Cloud Functions.'
    };
  },

  getIpProtectionInfo() {
    return {
      copyrightOwner: (typeof window !== 'undefined' && window.APP_COPYRIGHT_OWNER) || 'Tình Trương',
      productName: (typeof window !== 'undefined' && window.APP_PRODUCT_NAME) || 'Taekwondo Club Management Web App',
      buildFingerprint: (typeof window !== 'undefined' && window.APP_BUILD_FINGERPRINT) || '',
      sourceProtectionLevel: 'frontend-visible',
      antiCopyLevel: 'deterrent-only',
      canPreventCodeCopyCompletely: false,
      recommendedNext: [
        'Firebase App Check',
        'API key HTTP referrer restriction',
        'Firestore Rules emulator tests',
        'Cloud Functions for privileged actions',
        'Production minify/no sourcemap',
        'Light obfuscation after stability'
      ]
    };
  },

  getRecommendations() {
    return [
      { priority: 'critical', item: 'Deploy and test Firestore Rules tenant isolation' },
      { priority: 'critical', item: 'Restrict Firebase API key by HTTP referrers' },
      { priority: 'high',     item: 'Enable Firebase App Check after staging test' },
      { priority: 'high',     item: 'Move privileged SuperAdmin actions to Cloud Functions' },
      { priority: 'medium',   item: 'Production minify and remove source maps' },
      { priority: 'medium',   item: 'Light obfuscation after stable release' }
    ];
  }
};

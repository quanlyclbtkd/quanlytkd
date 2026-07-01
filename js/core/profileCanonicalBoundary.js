/**
 * Phase 4K-6V5A — Canonical Read Adoption + Legacy Fallback Gate
 *
 * Purpose:
 * - New/edited profiles always get stable read-index fields:
 *   statusKind: 'active' | 'quit' | 'trial'
 *   branchCode: 'CS1'...'CS10'
 *   isQuit: boolean
 *   updatedAt: number
 * - Legacy data is read through fallback only when these canonical fields are absent.
 * - Lightweight self-heal is scoped to one profile document; no full migration, no scan.
 */
(function initProfileCanonicalBoundary(global) {
  'use strict';

  if (!global) return;
  var VERSION = '4K-6V5A-canonical-read-adoption-legacy-fallback-gate-20260701';
  if (global.ProfileCanonicalBoundary && global.ProfileCanonicalBoundary.version === VERSION) return;

  var STATUS_VALUES = Object.freeze(['active', 'quit', 'trial']);
  var _selfHealLocks = Object.create(null);

  function _now() { return Date.now(); }

  function _fold(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function _isCanonicalBranch(value) {
    return /^CS(?:[1-9]|10)$/.test(String(value || '').trim());
  }

  function _cfg() {
    return Object.assign({},
      global.__store && global.__store.clubConfig || {},
      global.clubConfig || {},
      global.__store && global.__store.settings || {}
    );
  }

  function canonicalBranchCodeFromValue(value, fallback) {
    var fb = _isCanonicalBranch(fallback) ? String(fallback).trim() : 'CS1';
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return fb;
    try {
      if (global.BranchIdentity && typeof global.BranchIdentity.normalize === 'function') {
        var n = global.BranchIdentity.normalize(raw, { fallback: '', config: _cfg() });
        if (_isCanonicalBranch(n)) return n;
      }
    } catch (_) {}
    var f = _fold(raw);
    var m = f.match(/^cs\s*0*([1-9]|10)$/) || f.match(/^co so\s*0*([1-9]|10)$/);
    if (m) return 'CS' + Number(m[1]);
    if (['mac dinh', 'default', 'primary', 'co so mac dinh'].indexOf(f) >= 0) return 'CS1';
    var cfg = _cfg();
    for (var i = 1; i <= 10; i++) {
      var name = String(cfg['branchName' + i] || '').trim();
      if (name && _fold(name) === f) return 'CS' + i;
    }
    return fb;
  }

  function _legacyBranchValue(profile) {
    var p = profile || {};
    return p.branchCode || p.branch || p.branchId || p.branchLabel || p.coachBranch || p.clubBranch ||
      p.studentBranch || p.trainingBranch || p.classBranch || p.branchName || p.facility || p.base ||
      p.campus || p.campusName || p.site || p.trainingBase || p.trainingLocation || p.coso || p.coSo ||
      p.co_so || p.coSoTap || p.noiTap || p.diaDiemTap || p.location || '';
  }

  function canonicalBranchCodeFromProfile(profile, fallback) {
    var p = profile || {};
    if (_isCanonicalBranch(p.branchCode)) return String(p.branchCode).trim();
    return canonicalBranchCodeFromValue(_legacyBranchValue(p), fallback || p.branch || 'CS1');
  }

  function canonicalStatusKind(profile, explicitStatus) {
    var p = profile || {};
    var canonical = String(explicitStatus != null ? explicitStatus : (p.statusKind || '')).toLowerCase().trim();
    if (STATUS_VALUES.indexOf(canonical) >= 0) return canonical;

    // Canonical boolean always wins over legacy strings.
    if (p.isQuit === true || p.quit === true || p.stopped === true || p.active === false || p.isActive === false) return 'quit';

    var dateFields = ['quitDate', 'stoppedDate', 'leftDate', 'inactiveDate', 'nghiDate', 'ngayNghi'];
    for (var i = 0; i < dateFields.length; i++) {
      var v = p[dateFields[i]];
      if (v !== undefined && v !== null && v !== false && String(v).trim() !== '') return 'quit';
    }

    var statusRaw = String(p.status || p.state || p.trainingStatus || '').trim();
    var f = _fold(statusRaw);
    if (/\b(quit|inactive|retired|stopped|left|stop|leave|nghi|da nghi|nghi tap|tam dung|dung tap|bao nghi)\b/.test(f)) return 'quit';
    if (/\b(trial|try|hoc thu|tap thu|thu)\b/.test(f)) return 'trial';
    if (/\b(active|dang tap|tap luyen|hoc vien)\b/.test(f)) return 'active';

    try {
      if (typeof global.classifyProfileStatus === 'function') {
        var cls = String(global.classifyProfileStatus(p) || '').toLowerCase().trim();
        if (cls === 'quit') return 'quit';
        if (cls === 'trial') return 'trial';
        if (cls === 'active') return 'active';
      }
    } catch (_) {}
    return 'active';
  }

  function _hasBranchSignal(profile, options) {
    var p = profile || {};
    var opts = options || {};
    if (opts.forceBranchIndex === true || opts.branch || opts.branchCode) return true;
    var fields = ['branchCode','branch','branchId','branchLabel','coachBranch','clubBranch','studentBranch','trainingBranch','classBranch','branchName','facility','base','campus','campusName','site','trainingBase','trainingLocation','coso','coSo','co_so','coSoTap','noiTap','diaDiemTap','location'];
    return fields.some(function (f) { return p[f] !== undefined && p[f] !== null && String(p[f]).trim() !== ''; });
  }

  function buildCanonicalProfilePatch(profile, reason, options) {
    var opts = options || {};
    var p = profile || {};
    var statusKind = canonicalStatusKind(p, opts.statusKind);
    var hasBranchSignal = _hasBranchSignal(p, opts);
    var branchCode = hasBranchSignal ? canonicalBranchCodeFromProfile(Object.assign({}, p, opts.branch ? { branch: opts.branch } : {}), opts.branchCode || opts.branch || 'CS1') : '';
    var patch = {
      statusKind: statusKind,
      isQuit: statusKind === 'quit',
      updatedAt: opts.updatedAt || _now()
    };
    if (branchCode) patch.branchCode = branchCode;
    if (opts.preserveStatus !== true && (p.status == null || opts.forceStatus === true)) patch.status = statusKind === 'trial' ? 'trial' : (statusKind === 'quit' ? 'quit' : 'active');
    if (branchCode && opts.preserveBranch !== true && (!p.branch || opts.forceBranch === true)) patch.branch = branchCode;
    if (statusKind === 'quit' && !p.quitDate && opts.ensureQuitDate !== false) patch.quitDate = opts.quitDate || (typeof global.getLocalToday === 'function' ? global.getLocalToday() : new Date().toISOString().slice(0, 10));
    if (statusKind !== 'quit' && opts.clearQuitDate === true) patch.quitDate = null;
    if (reason) patch.canonicalProfileReason = String(reason).slice(0, 80);
    return patch;
  }

  function canonicalizeProfileForWrite(data, reason, options) {
    var raw = data && typeof data === 'object' ? Object.assign({}, data) : {};
    return Object.assign(raw, buildCanonicalProfilePatch(raw, reason || 'profile-write', options || {}));
  }

  function needsCanonicalSelfHeal(profile) {
    var p = profile || {};
    var expectedStatus = canonicalStatusKind(p);
    var expectedBranch = canonicalBranchCodeFromProfile(p);
    if (p.statusKind !== expectedStatus) return true;
    if (p.isQuit !== (expectedStatus === 'quit')) return true;
    if (_hasBranchSignal(p, {}) && (!_isCanonicalBranch(p.branchCode) || p.branchCode !== expectedBranch)) return true;
    return false;
  }

  async function selfHealProfileCanonicalFields(profileId, profile, reason) {
    var id = String(profileId || '').trim();
    if (!id || !profile || !needsCanonicalSelfHeal(profile)) return false;
    var role = String(global.userRole || global.__store && global.__store.userRole || '').toLowerCase().trim();
    if (!['admin', 'owner', 'super_admin', 'superadmin', 'root'].includes(role)) return false;
    var clubId = global.currentClubId || global.__store && (global.__store.clubId || global.__store.currentClubId) || '';
    var db = global.__store && global.__store.db;
    var sdk = global._fb_init || {};
    if (!db || !clubId || !sdk.doc || !sdk.setDoc) return false;
    var key = clubId + '::' + id;
    if (_selfHealLocks[key]) return false;
    _selfHealLocks[key] = _now();
    try {
      var patch = buildCanonicalProfilePatch(profile, reason || 'single-profile-self-heal', {
        preserveStatus: true,
        preserveBranch: true,
        ensureQuitDate: false
      });
      await sdk.setDoc(sdk.doc(db, 'clubs', clubId, 'profiles', id), patch, { merge: true });
      try {
        if (global.allProfiles && global.allProfiles[id]) Object.assign(global.allProfiles[id], patch);
        if (global.__store && global.__store.profiles && global.__store.profiles[id]) Object.assign(global.__store.profiles[id], patch);
      } catch (_) {}
      return true;
    } catch (err) {
      console.debug('[ProfileCanonicalBoundary] self-heal skipped:', err && (err.code || err.message) || err);
      return false;
    } finally {
      setTimeout(function () { delete _selfHealLocks[key]; }, 15000);
    }
  }


  function _hasCanonicalStatusSignal(profile) {
    var p = profile || {};
    var sk = String(p.statusKind == null ? '' : p.statusKind).toLowerCase().trim();
    return STATUS_VALUES.indexOf(sk) >= 0 || typeof p.isQuit === 'boolean';
  }

  function _legacyStatusKind(profile) {
    var p = profile || {};
    if (p.quit === true || p.stopped === true || p.active === false || p.isActive === false) return 'quit';
    var dateFields = ['quitDate', 'stoppedDate', 'leftDate', 'inactiveDate', 'nghiDate', 'ngayNghi'];
    for (var i = 0; i < dateFields.length; i++) {
      var v = p[dateFields[i]];
      if (v !== undefined && v !== null && v !== false && String(v).trim() !== '') return 'quit';
    }
    var statusRaw = String(p.status || p.state || p.trainingStatus || '').trim();
    var f = _fold(statusRaw);
    if (/\b(quit|inactive|retired|stopped|left|stop|leave|nghi|da nghi|nghi tap|tam dung|dung tap|bao nghi)\b/.test(f)) return 'quit';
    if (/\b(trial|try|hoc thu|tap thu|thu)\b/.test(f)) return 'trial';
    if (/\b(active|dang tap|tap luyen|hoc vien)\b/.test(f)) return 'active';
    return 'active';
  }

  function getCanonicalProfileReadStatus(profile) {
    var p = profile || {};
    var sk = String(p.statusKind == null ? '' : p.statusKind).toLowerCase().trim();
    var hasStatusKind = STATUS_VALUES.indexOf(sk) >= 0;
    var hasIsQuit = typeof p.isQuit === 'boolean';
    if (hasStatusKind || hasIsQuit) {
      var kind = hasStatusKind ? sk : (p.isQuit ? 'quit' : 'active');
      // Canonical conflict policy: quit wins to avoid showing quit students in debt/attendance.
      if (p.isQuit === true) kind = 'quit';
      if (kind !== 'quit' && kind !== 'trial') kind = 'active';
      return {
        kind: kind,
        active: kind === 'active' || kind === 'trial',
        quit: kind === 'quit',
        canonical: true,
        fallback: false,
        source: hasStatusKind ? 'statusKind' : 'isQuit',
        hasStatusKind: hasStatusKind,
        hasIsQuit: hasIsQuit,
        conflict: hasStatusKind && hasIsQuit && ((sk === 'quit') !== (p.isQuit === true))
      };
    }
    var legacy = _legacyStatusKind(p);
    return {
      kind: legacy,
      active: legacy === 'active' || legacy === 'trial',
      quit: legacy === 'quit',
      canonical: false,
      fallback: true,
      source: 'legacy-status-fallback',
      hasStatusKind: false,
      hasIsQuit: false,
      conflict: false
    };
  }

  function getCanonicalProfileReadBranch(profile, fallback) {
    var p = profile || {};
    var hasBranchCode = _isCanonicalBranch(p.branchCode);
    if (hasBranchCode) {
      return { branchCode: String(p.branchCode).trim(), canonical: true, fallback: false, source: 'branchCode', hasBranchCode: true };
    }
    var hasLegacy = _hasBranchSignal(p, {});
    var code = hasLegacy ? canonicalBranchCodeFromProfile(p, fallback || p.branch || 'CS1') : (fallback && _isCanonicalBranch(fallback) ? String(fallback).trim() : '');
    return { branchCode: code || '', canonical: false, fallback: !!hasLegacy, source: hasLegacy ? 'legacy-branch-fallback' : 'missing-branch', hasBranchCode: false };
  }

  function profileBranchMatchesFilter(profile, selectedBranch, options) {
    var sel = String(selectedBranch || 'all').trim();
    if (!sel || sel === 'all') return true;
    var p = profile || {};
    var info = getCanonicalProfileReadBranch(p, options && options.fallback || '');
    if (!info.branchCode) return false;
    try {
      if (global.BranchIdentity && typeof global.BranchIdentity.isSameBranch === 'function') {
        return global.BranchIdentity.isSameBranch(info.branchCode, sel);
      }
    } catch (_) {}
    return canonicalBranchCodeFromValue(info.branchCode, '') === canonicalBranchCodeFromValue(sel, '');
  }

  function isProfileActiveForDisplay(profile) {
    return getCanonicalProfileReadStatus(profile).active;
  }

  function isProfileQuitForDisplay(profile) {
    return getCanonicalProfileReadStatus(profile).quit;
  }

  function isProfileActiveForAttendance(profile) {
    return isProfileActiveForDisplay(profile);
  }

  function isProfileActiveForDebt(profile) {
    var p = profile || {};
    if (p.feeExempt === true) return false;
    return isProfileActiveForDisplay(p);
  }

  function getCanonicalProfileReadInfo(profile) {
    var p = profile || {};
    var status = getCanonicalProfileReadStatus(p);
    var branch = getCanonicalProfileReadBranch(p);
    return Object.assign({}, status, {
      statusKind: status.kind,
      branchCode: branch.branchCode,
      branchCanonical: branch.canonical,
      branchFallback: branch.fallback,
      branchSource: branch.source,
      completeCanonical: !!(status.canonical && branch.canonical)
    });
  }

  function computeCanonicalProfileHealth(profiles) {
    var map = profiles || {};
    if (Array.isArray(map)) {
      var obj = {};
      map.forEach(function (p, i) { obj[p && (p.id || p.name) || String(i)] = p; });
      map = obj;
    }
    var metrics = {
      total: 0,
      statusCanonical: 0,
      statusFallback: 0,
      branchCanonical: 0,
      branchFallback: 0,
      branchMissing: 0,
      active: 0,
      quit: 0,
      trial: 0,
      canonicalComplete: 0,
      statusConflicts: 0,
      canonicalRatio: 0,
      branchCanonicalRatio: 0,
      generatedAt: _now()
    };
    Object.keys(map || {}).forEach(function (id) {
      var p = map[id] || {};
      metrics.total++;
      var status = getCanonicalProfileReadStatus(p);
      var branch = getCanonicalProfileReadBranch(p);
      if (status.canonical) metrics.statusCanonical++; else metrics.statusFallback++;
      if (branch.canonical) metrics.branchCanonical++;
      else if (branch.fallback) metrics.branchFallback++;
      else metrics.branchMissing++;
      if (status.kind === 'quit') metrics.quit++;
      else if (status.kind === 'trial') metrics.trial++;
      else metrics.active++;
      if (status.conflict) metrics.statusConflicts++;
      if (status.canonical && branch.canonical) metrics.canonicalComplete++;
    });
    if (metrics.total > 0) {
      metrics.canonicalRatio = Math.round((metrics.statusCanonical / metrics.total) * 1000) / 10;
      metrics.branchCanonicalRatio = Math.round((metrics.branchCanonical / metrics.total) * 1000) / 10;
    }
    return metrics;
  }

  function printCanonicalProfileHealth(profiles) {
    var map = profiles || (global.studentProfileStore && typeof global.studentProfileStore.getAllProfilesCompat === 'function' ? global.studentProfileStore.getAllProfilesCompat() : null) || (global.__store && global.__store.profiles) || global.allProfiles || {};
    var metrics = computeCanonicalProfileHealth(map);
    try { console.table(metrics); } catch (_) { console.log('[CanonicalProfileHealth]', metrics); }
    return metrics;
  }

  var api = Object.freeze({
    version: VERSION,
    canonicalStatusKind: canonicalStatusKind,
    getCanonicalProfileReadStatus: getCanonicalProfileReadStatus,
    getCanonicalProfileReadBranch: getCanonicalProfileReadBranch,
    getCanonicalProfileReadInfo: getCanonicalProfileReadInfo,
    isProfileActiveForDisplay: isProfileActiveForDisplay,
    isProfileQuitForDisplay: isProfileQuitForDisplay,
    isProfileActiveForAttendance: isProfileActiveForAttendance,
    isProfileActiveForDebt: isProfileActiveForDebt,
    profileBranchMatchesFilter: profileBranchMatchesFilter,
    computeCanonicalProfileHealth: computeCanonicalProfileHealth,
    printCanonicalProfileHealth: printCanonicalProfileHealth,
    canonicalBranchCodeFromValue: canonicalBranchCodeFromValue,
    canonicalBranchCodeFromProfile: canonicalBranchCodeFromProfile,
    buildCanonicalProfilePatch: buildCanonicalProfilePatch,
    canonicalizeProfileForWrite: canonicalizeProfileForWrite,
    needsCanonicalSelfHeal: needsCanonicalSelfHeal,
    selfHealProfileCanonicalFields: selfHealProfileCanonicalFields,
    isCanonicalBranchCode: _isCanonicalBranch
  });

  global.ProfileCanonicalBoundary = api;
  global.canonicalizeProfileForWrite = canonicalizeProfileForWrite;
  global.buildCanonicalProfilePatch = buildCanonicalProfilePatch;
  global.canonicalProfileStatusKind = canonicalStatusKind;
  global.canonicalProfileBranchCode = canonicalBranchCodeFromProfile;
  global.needsCanonicalProfileSelfHeal = needsCanonicalSelfHeal;
  global.selfHealProfileCanonicalFields = selfHealProfileCanonicalFields;
  global.getCanonicalProfileReadStatus = getCanonicalProfileReadStatus;
  global.getCanonicalProfileReadBranch = getCanonicalProfileReadBranch;
  global.getCanonicalProfileReadInfo = getCanonicalProfileReadInfo;
  global.isProfileActiveForDisplay = isProfileActiveForDisplay;
  global.isProfileQuitForDisplay = isProfileQuitForDisplay;
  global.isProfileActiveForAttendance = isProfileActiveForAttendance;
  global.isProfileActiveForDebt = isProfileActiveForDebt;
  global.profileBranchMatchesFilter = profileBranchMatchesFilter;
  global.computeCanonicalProfileHealth = computeCanonicalProfileHealth;
  global.printCanonicalProfileHealth = printCanonicalProfileHealth;
})(window);

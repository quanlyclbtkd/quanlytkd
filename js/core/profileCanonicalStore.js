/**
 * Phase 4K-6V5 — Profile Canonical Store Read-only Audit
 *
 * Purpose:
 *   - Build a read-only, in-memory canonical view of student profiles.
 *   - Use only profiles that are already loaded by the existing listener/cache.
 *   - Provide audit/debug tools before any tab cutover.
 *
 * Safety guarantees:
 *   - No Firestore query.
 *   - No Firestore write/migration.
 *   - No UI render cutover in V4D1.
 */
(function initProfileCanonicalStore(global) {
  'use strict';

  if (!global || global.ProfileCanonicalStore) return;

  var VERSION = '4K-6V4D1-profile-canonical-store-readonly-audit-20260628';
  var BUILD_SLUG = 'profile-canonical-store-20260628-v4d1';

  var _state = {
    version: VERSION,
    build: BUILD_SLUG,
    ready: false,
    source: 'not-built',
    reason: '',
    lastBuiltAt: 0,
    lastSignature: '',
    store: null,
    buildCount: 0,
    extraReads: 0,
    lastError: ''
  };

  function _now() { return Date.now(); }

  function _fold(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function _displayName(raw, key) {
    var p = raw || {};
    return String(p.name || p.fullName || p.studentName || p.displayName || p.hoTen || p.memberName || key || '').trim();
  }

  function _rawProfileId(raw, key) {
    var p = raw || {};
    return String(p.profileId || p.id || p.uid || p.memberId || p.memberID || p.studentId || key || '').trim();
  }

  function _normalizeMonth(value) {
    try {
      if (global.TuitionDebtCanonical && typeof global.TuitionDebtCanonical.normalizeMonth === 'function') {
        return global.TuitionDebtCanonical.normalizeMonth(value) || '';
      }
      if (typeof global.normalizeTuitionDebtMonth === 'function') {
        return global.normalizeTuitionDebtMonth(value) || '';
      }
      if (typeof global.normalizeYYYYMM === 'function') {
        return global.normalizeYYYYMM(value) || '';
      }
    } catch (_) {}

    if (value == null) return '';
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0');
    }
    if (value && typeof value.toDate === 'function') {
      try { return _normalizeMonth(value.toDate()); } catch (_) {}
    }
    var raw = String(value || '').trim();
    if (!raw) return '';
    var folded = _fold(raw);
    var yearMatch = folded.match(/\b(20\d{2})\b/);
    var monthMap = {
      mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6,
      bay: 7, tam: 8, chin: 9, muoi: 10, 'muoi mot': 11, 'muoi hai': 12,
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4,
      april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
      sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
      dec: 12, december: 12
    };
    function readMonthToken(text) {
      var s = String(text || '').replace(/\b(thang|month|t|nam|year)\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (!s) return 0;
      var n = s.match(/\b(1[0-2]|0?[1-9])\b/);
      if (n) return Number(n[1]);
      if (monthMap[s]) return monthMap[s];
      if (/\bmuoi\s+hai\b/.test(s)) return 12;
      if (/\bmuoi\s+mot\b/.test(s)) return 11;
      if (/^muoi$/.test(s)) return 10;
      return 0;
    }
    if (yearMatch) {
      var y = yearMatch[1];
      var before = folded.slice(0, yearMatch.index);
      var after = folded.slice(yearMatch.index + y.length);
      var mWord = readMonthToken(before) || readMonthToken(after);
      if (mWord >= 1 && mWord <= 12) return y + '-' + String(mWord).padStart(2, '0');
    }
    var compact = raw
      .replace(/tháng/gi, '')
      .replace(/thang/gi, '')
      .replace(/^t\s*/i, '')
      .replace(/\s+/g, '')
      .replace(/[.–—]/g, '-')
      .trim();
    var m = compact.match(/^(20\d{2})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
    if (m) {
      var mo = Number(m[2]);
      if (mo >= 1 && mo <= 12) return m[1] + '-' + String(mo).padStart(2, '0');
    }
    m = compact.match(/^(\d{1,2})[-/](20\d{2})$/);
    if (m) {
      mo = Number(m[1]);
      if (mo >= 1 && mo <= 12) return m[2] + '-' + String(mo).padStart(2, '0');
    }
    m = compact.match(/^(?:T)?(\d{1,2})[-/]?(20\d{2})$/i);
    if (m) {
      mo = Number(m[1]);
      if (mo >= 1 && mo <= 12) return m[2] + '-' + String(mo).padStart(2, '0');
    }
    return '';
  }

  function _normalizeMonthList(values) {
    var input = [];
    if (Array.isArray(values)) input = values;
    else if (values && typeof values === 'string') input = values.split(/[,;|]+/);
    return Array.from(new Set(input.map(_normalizeMonth).filter(Boolean))).sort();
  }

  function _branchRaw(raw) {
    var p = raw || {};
    try {
      if (global.ProfileCanonicalBoundary && typeof global.ProfileCanonicalBoundary.getCanonicalProfileReadBranch === 'function') {
        var info = global.ProfileCanonicalBoundary.getCanonicalProfileReadBranch(p);
        if (info && info.branchCode) return info.branchCode;
      }
    } catch (_) {}
    return p.branchCode || p.branch || p.branchName || p.coachBranch || p.facility || p.base || p.coso || p.coSo || p.location || '';
  }

  function _branchCanonical(value) {
    var raw = String(value || '').trim();
    var f = _fold(raw);
    if (!raw) return 'CS1';
    if (/^(mac dinh|default|co so mac dinh)$/.test(f)) return 'CS1';
    try {
      if (global.BranchIdentity && typeof global.BranchIdentity.normalize === 'function') {
        return global.BranchIdentity.normalize(raw, { fallback: raw ? raw : 'CS1' }) || (raw ? raw : 'CS1');
      }
    } catch (_) {}
    var numbered = f.match(/^cs\s*0*([1-9]|10)$/) || f.match(/^co so\s*0*([1-9]|10)$/);
    if (numbered) return 'CS' + Number(numbered[1]);
    return raw;
  }

  function _branchAliases(canonical, raw) {
    var out = [];
    try {
      if (global.BranchIdentity && typeof global.BranchIdentity.aliases === 'function') {
        out = global.BranchIdentity.aliases(canonical) || [];
      }
    } catch (_) {}
    [canonical, raw].forEach(function (v) {
      var s = String(v || '').trim();
      if (s && !out.includes(s)) out.push(s);
    });
    return out;
  }

  function _canonicalStatus(raw, classifierResult) {
    var p = raw || {};
    var rawStatus = String(p.status || p.state || p.trainingStatus || '').trim();
    var folded = _fold(rawStatus);
    var cls = String(classifierResult || '').toLowerCase();

    if (cls === 'quit' || cls === 'inactive') return 'quit';
    if (p.quit === true || p.isQuit === true || p.active === false || p.isActive === false || p.stopped === true) return 'quit';
    if (/\b(quit|inactive|retired|stopped|left|nghi|da nghi|nghi tap|bao nghi|tam dung|dung tap)\b/.test(folded)) return 'quit';
    if (/\b(trial|try|thu|hoc thu|tap thu)\b/.test(folded) || cls === 'trial') return 'trial';
    if (/\b(active|dang tap|tap luyen|hoc vien)\b/.test(folded) || cls === 'active') return 'active';
    if (!rawStatus && (p.joinDate || p.admissionDate || p.createdAt || p.name || p.fullName)) return 'active';
    return 'unknown';
  }

  function _statusClassifier(raw) {
    try {
      if (typeof global.classifyProfileStatus === 'function') return global.classifyProfileStatus(raw || {});
    } catch (_) {}
    return '';
  }

  function _profileSource() {
    var st = global.__store || {};
    var candidates = [
      { source: 'store.profiles', data: st.profiles },
      { source: 'allProfiles', data: global.allProfiles },
      { source: 'profilesCache', data: global.profilesCache },
      { source: 'studentProfiles', data: global.studentProfiles },
      { source: 'profiles', data: global.profiles }
    ];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (Array.isArray(c.data) && c.data.length) return c;
      if (c.data && typeof c.data === 'object' && Object.keys(c.data).length) return c;
    }
    return { source: 'empty-local-cache', data: {} };
  }

  function _entriesFromProfiles(profiles) {
    if (Array.isArray(profiles)) {
      return profiles.map(function (p, i) {
        var key = _rawProfileId(p, '') || _displayName(p, '') || String(i);
        return [key, p || {}];
      });
    }
    return Object.entries(profiles || {}).map(function (entry) {
      return [String(entry[0]), entry[1] || {}];
    });
  }

  function _sourceSignature(entries) {
    var length = entries.length;
    var first = length ? String(entries[0][0]) : '';
    var last = length ? String(entries[length - 1][0]) : '';
    var dataVersion = (global.__store && (global.__store._dataVersion || global.__store.dataVersion || global.__store.profilesVersion)) || global._dataVersion || '';
    return [length, first, last, dataVersion].join('|');
  }

  function canonicalizeProfile(raw, key, duplicateMap) {
    var p = raw || {};
    var warnings = [];
    var displayName = _displayName(p, key);
    var profileId = _rawProfileId(p, key);
    var classifier = _statusClassifier(p);
    var statusCanonical = _canonicalStatus(p, classifier);
    var isActiveCanonical = statusCanonical === 'active' || statusCanonical === 'trial';
    var branchRaw = _branchRaw(p);
    var branchCanonical = _branchCanonical(branchRaw);
    var branchAliases = _branchAliases(branchCanonical, branchRaw);
    var paidUntilRaw = p.paidUntil || p.paid_to || p.paidTo || p.daDongToi || '';
    var paidUntilCanonical = _normalizeMonth(paidUntilRaw);
    var skippedMonthsRaw = Array.isArray(p.skippedMonths) ? p.skippedMonths.slice()
      : (Array.isArray(p.skipMonths) ? p.skipMonths.slice()
      : (Array.isArray(p.pausedMonths) ? p.pausedMonths.slice() : []));
    var skippedMonthsCanonical = _normalizeMonthList(skippedMonthsRaw);

    if (!profileId) warnings.push('missing-profile-id');
    if (!displayName) warnings.push('missing-display-name');
    if (statusCanonical === 'unknown') warnings.push('unknown-status');
    if (!branchRaw) warnings.push('missing-branch-raw');
    if (branchRaw && branchCanonical !== branchRaw && !/^CS(?:[1-9]|10)$/.test(branchRaw)) warnings.push('branch-normalized-from-alias');
    if (paidUntilRaw && !paidUntilCanonical) warnings.push('invalid-paidUntil');
    if (skippedMonthsRaw.length && skippedMonthsCanonical.length !== skippedMonthsRaw.length) warnings.push('invalid-skipped-month');
    if (duplicateMap && profileId && duplicateMap[profileId] > 1) warnings.push('duplicate-profile-id');

    var phone = p.phone || p.phoneNumber || p.sdt || p.parentPhone || '';
    var studentCode = p.studentCode || p.memberCode || p.code || p.maHV || p.maHocVien || '';
    var belt = p.belt || p.currentBelt || p.capDai || '';
    var searchText = _fold([displayName, profileId, key, studentCode, phone, branchCanonical, branchRaw, belt].join(' '));

    return Object.freeze({
      version: VERSION,
      profileId: profileId,
      rawId: String(key || ''),
      displayName: displayName,
      searchText: searchText,
      statusRaw: String(p.status || p.state || p.trainingStatus || '').trim(),
      statusCanonical: statusCanonical,
      isActiveCanonical: isActiveCanonical,
      branchRaw: String(branchRaw || '').trim(),
      branchCanonical: branchCanonical,
      branchAliases: branchAliases,
      paidUntilRaw: paidUntilRaw,
      paidUntilCanonical: paidUntilCanonical,
      skippedMonthsRaw: skippedMonthsRaw,
      skippedMonthsCanonical: skippedMonthsCanonical,
      feeExemptCanonical: p.feeExempt === true || p.tuitionExempt === true || p.exemptTuition === true,
      raw: p,
      sourceWarnings: Array.from(new Set(warnings))
    });
  }

  function _emptyStore(source, reason) {
    return {
      version: VERSION,
      build: BUILD_SLUG,
      ready: true,
      source: source || 'empty-local-cache',
      reason: reason || '',
      noRead: true,
      extraReads: 0,
      totalRawProfiles: 0,
      totalCanonicalProfiles: 0,
      byId: Object.create(null),
      byRawKey: Object.create(null),
      byStatus: { active: [], trial: [], quit: [], unknown: [] },
      byBranch: Object.create(null),
      activeProfiles: [],
      quitProfiles: [],
      searchIndex: [],
      skippedByMonth: Object.create(null),
      duplicates: [],
      warningsByType: Object.create(null),
      profilesWithWarnings: [],
      builtAt: _now(),
      signature: '0|||'
    };
  }

  function build(options) {
    var opts = options || {};
    var source = _profileSource();
    var entries = _entriesFromProfiles(source.data);
    var signature = _sourceSignature(entries);
    if (!opts.force && _state.store && _state.lastSignature === signature) return _state.store;

    var store = _emptyStore(source.source, opts.reason || 'buildProfileCanonicalStore');
    store.totalRawProfiles = entries.length;
    store.signature = signature;

    var duplicateMap = Object.create(null);
    entries.forEach(function (entry) {
      var id = _rawProfileId(entry[1], entry[0]);
      if (id) duplicateMap[id] = (duplicateMap[id] || 0) + 1;
    });

    entries.forEach(function (entry, index) {
      var key = entry[0];
      var raw = entry[1] || {};
      var item = canonicalizeProfile(raw, key, duplicateMap);
      store.byRawKey[item.rawId] = item;
      if (item.profileId && !store.byId[item.profileId]) store.byId[item.profileId] = item;
      if (!store.byStatus[item.statusCanonical]) store.byStatus[item.statusCanonical] = [];
      store.byStatus[item.statusCanonical].push(item);
      if (item.isActiveCanonical) store.activeProfiles.push(item);
      if (item.statusCanonical === 'quit') store.quitProfiles.push(item);
      if (!store.byBranch[item.branchCanonical]) store.byBranch[item.branchCanonical] = [];
      store.byBranch[item.branchCanonical].push(item);
      item.skippedMonthsCanonical.forEach(function (month) {
        if (!store.skippedByMonth[month]) store.skippedByMonth[month] = [];
        store.skippedByMonth[month].push(item);
      });
      store.searchIndex.push({ profileId: item.profileId, rawId: item.rawId, displayName: item.displayName, searchText: item.searchText, index: index });
      item.sourceWarnings.forEach(function (w) { store.warningsByType[w] = (store.warningsByType[w] || 0) + 1; });
      if (item.sourceWarnings.length) store.profilesWithWarnings.push({ profileId: item.profileId, rawId: item.rawId, displayName: item.displayName, warnings: item.sourceWarnings });
    });

    store.duplicates = Object.keys(duplicateMap).filter(function (id) { return duplicateMap[id] > 1; }).map(function (id) { return { profileId: id, count: duplicateMap[id] }; });
    store.totalCanonicalProfiles = store.searchIndex.length;
    store.builtAt = _now();
    store.ready = true;
    store.noRead = true;
    store.extraReads = 0;
    Object.freeze(store.byStatus.active);
    Object.freeze(store.byStatus.trial);
    Object.freeze(store.byStatus.quit);
    Object.freeze(store.byStatus.unknown);
    Object.freeze(store.activeProfiles);
    Object.freeze(store.quitProfiles);
    Object.freeze(store.searchIndex);
    Object.freeze(store.profilesWithWarnings);
    Object.freeze(store.duplicates);

    _state.store = store;
    _state.ready = true;
    _state.source = source.source;
    _state.reason = opts.reason || 'buildProfileCanonicalStore';
    _state.lastBuiltAt = store.builtAt;
    _state.lastSignature = signature;
    _state.buildCount += 1;
    _state.extraReads = 0;
    _state.lastError = '';
    global.__profileCanonicalStore = store;
    return store;
  }

  function ensure(options) {
    try { return build(options || {}); }
    catch (error) {
      _state.ready = false;
      _state.lastError = error && error.message ? error.message : String(error || 'unknown');
      if (global.console && global.console.warn) global.console.warn('[ProfileCanonicalStore] build failed; legacy logic remains active.', error);
      return _emptyStore('build-error', _state.lastError);
    }
  }

  function getStatus(options) {
    var store = ensure(Object.assign({ reason: 'getProfileCanonicalStoreStatus' }, options || {}));
    return {
      version: VERSION,
      build: BUILD_SLUG,
      ready: !!store.ready,
      source: store.source,
      noRead: true,
      extraReads: 0,
      totalRawProfiles: store.totalRawProfiles,
      totalCanonicalProfiles: store.totalCanonicalProfiles,
      activeCount: store.activeProfiles.length,
      quitCount: store.quitProfiles.length,
      trialCount: store.byStatus.trial.length,
      unknownStatusCount: store.byStatus.unknown.length,
      branchCount: Object.keys(store.byBranch).length,
      skippedMonthCount: Object.keys(store.skippedByMonth).length,
      duplicateProfileIdCount: store.duplicates.length,
      profilesWithWarningsCount: store.profilesWithWarnings.length,
      buildCount: _state.buildCount,
      builtAt: store.builtAt,
      lastError: _state.lastError
    };
  }

  function audit(options) {
    var store = ensure(Object.assign({ reason: 'auditProfileCanonicalStore' }, options || {}));
    var warnings = store.warningsByType || {};
    var invalidPaidUntilCount = warnings['invalid-paidUntil'] || 0;
    var invalidSkippedMonthCount = warnings['invalid-skipped-month'] || 0;
    var missingProfileIdCount = warnings['missing-profile-id'] || 0;
    var unknownBranchCount = warnings['missing-branch-raw'] || 0;
    var result = {
      version: VERSION,
      build: BUILD_SLUG,
      ready: !!store.ready,
      noRead: true,
      extraReads: 0,
      source: store.source,
      totalRawProfiles: store.totalRawProfiles,
      totalCanonicalProfiles: store.totalCanonicalProfiles,
      activeCount: store.activeProfiles.length,
      trialCount: store.byStatus.trial.length,
      quitCount: store.quitProfiles.length,
      unknownStatusCount: store.byStatus.unknown.length,
      unknownBranchCount: unknownBranchCount,
      invalidPaidUntilCount: invalidPaidUntilCount,
      invalidSkippedMonthCount: invalidSkippedMonthCount,
      missingProfileIdCount: missingProfileIdCount,
      duplicateProfileIdCount: store.duplicates.length,
      profilesWithWarningsCount: store.profilesWithWarnings.length,
      warningsByType: Object.assign({}, warnings),
      duplicateSamples: store.duplicates.slice(0, 20),
      warningSamples: store.profilesWithWarnings.slice(0, 30),
      readyForTabCutover: store.ready && invalidPaidUntilCount === 0 && invalidSkippedMonthCount === 0 && store.duplicates.length === 0,
      nextRecommendation: 'V4D1 is read-only. Only cut over tabs after reviewing warnings and samples.'
    };
    if (global.console && global.console.table) global.console.table(result);
    return result;
  }

  function findById(id) {
    var store = ensure({ reason: 'debugProfileCanonicalById' });
    var key = String(id || '').trim();
    return (key && store.byId[key]) || (key && store.byRawKey[key]) || null;
  }

  function findByName(name) {
    var store = ensure({ reason: 'debugProfileCanonical' });
    var q = _fold(name);
    if (!q) return null;
    var exact = store.searchIndex.find(function (x) { return _fold(x.displayName) === q || _fold(x.profileId) === q || _fold(x.rawId) === q; });
    var row = exact || store.searchIndex.find(function (x) { return x.searchText.indexOf(q) !== -1; });
    if (!row) return null;
    return store.byId[row.profileId] || store.byRawKey[row.rawId] || null;
  }

  function debugById(id) {
    var item = findById(id);
    var result = item ? Object.assign({ found: true }, item) : { found: false, query: id, version: VERSION, build: BUILD_SLUG };
    if (global.console && global.console.table) global.console.table(result);
    return result;
  }

  function debugByName(name) {
    var item = findByName(name);
    var result = item ? Object.assign({ found: true, query: name }, item) : { found: false, query: name, version: VERSION, build: BUILD_SLUG };
    if (global.console && global.console.table) global.console.table(result);
    return result;
  }

  var api = Object.freeze({
    version: VERSION,
    build: BUILD_SLUG,
    buildStore: build,
    ensure: ensure,
    getStatus: getStatus,
    audit: audit,
    canonicalizeProfile: canonicalizeProfile,
    debugProfileCanonical: debugByName,
    debugProfileCanonicalById: debugById,
    findById: findById,
    findByName: findByName,
    normalizeMonth: _normalizeMonth,
    normalizeMonthList: _normalizeMonthList,
    fold: _fold
  });

  global.ProfileCanonicalStore = api;
  global.buildProfileCanonicalStore = function (options) { return build(options || { reason: 'buildProfileCanonicalStore' }); };
  global.getProfileCanonicalStoreStatus = function (options) { return getStatus(options || {}); };
  global.auditProfileCanonicalStore = function (options) { return audit(options || {}); };
  global.debugProfileCanonical = function (name) { return debugByName(name); };
  global.debugProfileCanonicalById = function (id) { return debugById(id); };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Phase 4K-6V4C — Tuition Debt Source of Truth + Profile Canonical Reconciliation
 *
 * Read-only canonical helpers for tuition debt/profile state.
 * - No Firestore query.
 * - No mutation/migration.
 * - One computation boundary shared by Báo nợ, debug and exports.
 */
(function () {
  'use strict';

  var VERSION = '4K-6V4C-tuition-debt-source-of-truth-20260628';

  function _fold(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  function _isMonthlySkipStatusValue(value) {
    var folded = _fold(value);
    if (!folded) return false;
    return /\b(bao nghi|bao nghi thang|nghi thang|tam nghi thang|mien hoc phi|mien phi|xin nghi thang)\b/.test(folded)
      || folded === 'bao nghi'
      || folded === 'bao nghi thang'
      || folded === 'nghi thang'
      || folded === 'tam nghi thang';
  }

  function _monthWordToNumber(text) {
    var key = _fold(text)
      .replace(/\b(thang|month|t)\b/g, ' ')
      .replace(/[_,.;:()\[\]]/g, ' ')
      .replace(/\s*[-/]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key) return 0;

    var map = {
      'mot': 1, 'm ot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'tu': 4,
      'nam': 5, 'lam': 5, 'sau': 6, 'bay': 7, 'tam': 8, 'chin': 9,
      'muoi': 10, 'muoi mot': 11, 'muoi hai': 12,
      'thu mot': 1, 'thu hai': 2, 'thu ba': 3, 'thu bon': 4, 'thu tu': 4,
      'thu nam': 5, 'thu sau': 6, 'thu bay': 7, 'thu tam': 8, 'thu chin': 9,
      'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
      'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
      'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
      'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
    };

    function read(k) {
      var s = String(k || '').replace(/\s+/g, ' ').trim();
      if (!s) return 0;
      var numeric = s.match(/\b(1[0-2]|0?[1-9])\b/);
      if (numeric) return Number(numeric[1]);
      if (map[s] >= 1 && map[s] <= 12) return map[s];
      if (/\bmuoi\s+hai\b/.test(s)) return 12;
      if (/\bmuoi\s+mot\b/.test(s)) return 11;
      if (/^muoi$/.test(s)) return 10;
      return 0;
    }

    var direct = read(key);
    if (direct) return direct;
    var strippedYearMarker = key.replace(/\b(year)\b\s*$/g, '').replace(/\s+/g, ' ').trim();
    var strippedVietnameseYear = key.replace(/\bnam\b\s*$/g, '').replace(/\s+/g, ' ').trim();
    // “Tháng năm 2026” means month 5; only strip trailing “nam” as year if another month token remains.
    return read(strippedYearMarker) || (strippedVietnameseYear ? read(strippedVietnameseYear) : 0);
  }

  function normalizeMonth(input) {
    if (input == null) return '';
    if (input instanceof Date && !isNaN(input.getTime())) {
      return input.getFullYear() + '-' + String(input.getMonth() + 1).padStart(2, '0');
    }
    var raw = String(input || '').trim();
    if (!raw) return '';

    var folded = _fold(raw);
    var yearMatch = folded.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      var year = yearMatch[1];
      var beforeYear = folded.slice(0, yearMatch.index).trim();
      var afterYear = folded.slice(yearMatch.index + year.length).trim();
      var wordMonth = _monthWordToNumber(beforeYear) || _monthWordToNumber(afterYear);
      if (wordMonth >= 1 && wordMonth <= 12) return year + '-' + String(wordMonth).padStart(2, '0');
    }

    raw = raw
      .replace(/tháng/gi, '')
      .replace(/thang/gi, '')
      .replace(/^t\s*/i, '')
      .replace(/\s+/g, '')
      .replace(/[.]/g, '-')
      .replace(/[–—]/g, '-')
      .trim();

    var m = raw.match(/^(20\d{2})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
    if (m) {
      var mo = Number(m[2]);
      if (mo >= 1 && mo <= 12) return m[1] + '-' + String(mo).padStart(2, '0');
    }
    m = raw.match(/^(\d{1,2})[-/](20\d{2})$/);
    if (m) {
      mo = Number(m[1]);
      if (mo >= 1 && mo <= 12) return m[2] + '-' + String(mo).padStart(2, '0');
    }
    m = raw.match(/^(?:T)?(\d{1,2})[-/]?(20\d{2})$/i);
    if (m) {
      mo = Number(m[1]);
      if (mo >= 1 && mo <= 12) return m[2] + '-' + String(mo).padStart(2, '0');
    }
    return '';
  }

  function addMonths(month, delta) {
    var m = normalizeMonth(month);
    if (!m) return '';
    var parts = m.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1 + Number(delta || 0), 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function normalizeMonthList(values) {
    return Array.isArray(values)
      ? Array.from(new Set(values.map(normalizeMonth).filter(Boolean))).sort()
      : [];
  }

  function _displayName(name, p) {
    var pp = p || {};
    return String(pp.name || pp.fullName || pp.studentName || pp.displayName || name || '').trim();
  }

  function _profileId(name, p) {
    var pp = p || {};
    return String(pp.profileId || pp.id || pp.uid || pp.memberId || _displayName(name, pp) || '').trim();
  }

  function _canonicalBranch(value, fallback) {
    if (typeof window !== 'undefined' && window.BranchIdentity && typeof window.BranchIdentity.normalize === 'function') {
      return window.BranchIdentity.normalize(value, { fallback: fallback || 'CS1' });
    }
    var raw = String(value || '').trim();
    if (!raw) return fallback || 'CS1';
    if (/^(mặc định|mac dinh|default)$/i.test(raw)) return 'CS1';
    var match = raw.match(/^CS0*([1-9]|10)$/i);
    return match ? ('CS' + Number(match[1])) : (fallback || raw || 'CS1');
  }

  function deriveProfileCanonicalState(profile, name, options) {
    var p = profile || {};
    var warnings = [];
    var displayName = _displayName(name, p);
    var statusByClassifier = '';
    try {
      if (typeof window !== 'undefined' && typeof window.classifyProfileStatus === 'function') {
        statusByClassifier = window.classifyProfileStatus(p);
      }
    } catch (_) {}
    var rawStatus = String(p.status || p.state || '').trim();
    var foldedStatus = _fold(rawStatus);
    var isMonthlySkipStatus = _isMonthlySkipStatusValue(rawStatus);
    var isExplicitQuitText = /\b(quit|inactive|retired|stopped|left|da nghi|nghi tap|nghi han|dung tap|ngung tap|bo tap|thoi tap)\b/.test(foldedStatus);
    var isQuit = statusByClassifier === 'quit' || p.active === false || p.isActive === false || p.quit === true || p.isQuit === true ||
      (!isMonthlySkipStatus && isExplicitQuitText);
    var statusCanonical = isQuit ? 'quit' : 'active';
    var branchRaw = p.branch || p.branchCode || p.coachBranch || p.facility || p.base || '';
    var branchCanonical = _canonicalBranch(branchRaw, 'CS1');
    var quitAt = normalizeMonth(p.quitDate || p.ngayNghi || p.inactiveDate || p.stoppedDate || p.leftDate || p.nghiDate || '');
    if (!displayName) warnings.push('missing-display-name');
    if (!branchRaw) warnings.push('missing-branch-raw');
    if (statusCanonical === 'active' && quitAt) warnings.push('active-with-quit-date');
    if (statusCanonical === 'quit' && !quitAt) warnings.push('quit-without-quit-date');

    return {
      profileId: _profileId(name, p),
      displayName: displayName,
      statusRaw: rawStatus,
      statusCanonical: statusCanonical,
      branchRaw: branchRaw,
      branchCanonical: branchCanonical,
      quitAt: quitAt,
      schemaWarnings: warnings,
      schemaVersion: 'tuition-profile-canonical-v1',
      source: (options && options.reason) || 'canonical-profile-state'
    };
  }

  function _txArray(options) {
    if (options && Array.isArray(options.transactions)) return options.transactions;
    if (typeof window !== 'undefined') {
      if (Array.isArray(window.allTransactions)) return window.allTransactions;
      if (window.__store && Array.isArray(window.__store.transactions)) return window.__store.transactions;
      if (window.__store && Array.isArray(window.__store.tx)) return window.__store.tx;
    }
    return [];
  }

  function _looksLikeTuitionTx(tx) {
    var text = _fold([
      tx && tx.type, tx && tx.kind, tx && tx.category, tx && tx.source,
      tx && tx.label, tx && tx.note, tx && tx.description
    ].filter(Boolean).join(' '));
    return !!(tx && (tx.tuition === true || tx.tuitionAmount || /hoc\s*phi|tuition/.test(text)));
  }

  function _txMatchesProfile(tx, profile, name) {
    var p = profile || {};
    var pid = _profileId(name, p);
    var display = _fold(_displayName(name, p));
    var txPid = String((tx && (tx.profileId || tx.studentId || tx.memberId || tx.memberID)) || '').trim();
    if (pid && txPid && txPid === pid) return true;
    var txName = _fold(tx && (tx.studentName || tx.name || tx.profileName || tx.memberName));
    return !!(display && txName && display === txName);
  }

  function extractTuitionTransactionMonths(profile, name, options) {
    var out = [];
    _txArray(options).forEach(function (tx) {
      if (!_looksLikeTuitionTx(tx) || !_txMatchesProfile(tx, profile, name)) return;
      var candidates = [];
      if (Array.isArray(tx.months)) candidates = candidates.concat(tx.months);
      if (Array.isArray(tx.tuitionMonths)) candidates = candidates.concat(tx.tuitionMonths);
      if (Array.isArray(tx.paidMonths)) candidates = candidates.concat(tx.paidMonths);
      candidates = candidates.concat([tx.month, tx.tuitionMonth, tx.paidUntil, tx.period, tx.forMonth]);
      normalizeMonthList(candidates).forEach(function (m) { if (!out.includes(m)) out.push(m); });
    });
    return out.sort();
  }

  function computeProfileDebt(profile, selectedMonth, options) {
    var p = profile || {};
    var opt = options || {};
    var name = opt.name || p.name || p.fullName || p.studentName || '';
    var state = deriveProfileCanonicalState(p, name, opt);
    var selected = normalizeMonth(selectedMonth || opt.selectedMonth || '');
    var warnings = [].concat(state.schemaWarnings || []);
    if (!selected) warnings.push('missing-selected-month');

    var skippedMonths = normalizeMonthList(p.skippedMonths);
    var rawPaidMonths = normalizeMonthList(p.paidMonths);
    var paidUntil = normalizeMonth(p.paidUntil || '');
    var txPaidMonths = extractTuitionTransactionMonths(p, name, opt);
    var trustFuturePaidMonths = opt.trustFuturePaidMonths === true;
    var trustTransactionMonths = opt.trustTransactionMonths === true;

    var trustedPaidMonths = paidUntil && !trustFuturePaidMonths
      ? rawPaidMonths.filter(function (m) { return m <= paidUntil; })
      : rawPaidMonths.slice();
    var ignoredFuturePaidMonthsAfterPaidUntil = paidUntil && !trustFuturePaidMonths
      ? rawPaidMonths.filter(function (m) { return m > paidUntil; })
      : [];

    if (!paidUntil && txPaidMonths.length) {
      // Safe fallback only when profile paidUntil is absent. Existing profile boundary remains authoritative.
      trustedPaidMonths = Array.from(new Set(trustedPaidMonths.concat(txPaidMonths))).sort();
      warnings.push('paidUntil-missing-used-transaction-months-as-evidence');
    } else if (paidUntil && txPaidMonths.some(function (m) { return m > paidUntil; }) && !trustTransactionMonths) {
      warnings.push('transaction-months-after-paidUntil-not-used-for-debt-suppression');
    }

    if (paidUntil && ignoredFuturePaidMonthsAfterPaidUntil.length) warnings.push('paidMonths-after-paidUntil-ignored');
    if (p.isOwed === false || (Array.isArray(p.owedMonths) && p.owedMonths.length === 0)) warnings.push('legacy-owed-flags-not-authoritative');

    var hiddenReasons = [];
    var chargeableMonths = [];
    if (!selected) hiddenReasons.push('missing-selected-month');
    if (state.statusCanonical === 'quit') hiddenReasons.push('profile-is-quit');
    if (p.feeExempt === true) hiddenReasons.push('fee-exempt');

    if (!hiddenReasons.length) {
      var startMonth = '';
      if (paidUntil) startMonth = addMonths(paidUntil, 1);
      if (!startMonth) {
        startMonth = normalizeMonth(p.admissionDate || p.joinDate || p.joinedAt || p.createdAt || p.enrollDate || selected) || selected;
      }
      var cur = startMonth;
      var guard = 0;
      while (cur && cur <= selected && guard < 60) {
        if (!skippedMonths.includes(cur) && !trustedPaidMonths.includes(cur)) chargeableMonths.push(cur);
        cur = addMonths(cur, 1);
        guard++;
      }
      if (guard >= 60) warnings.push('month-loop-guard-hit');
      if (p.isOwed === true && Array.isArray(p.owedMonths)) {
        normalizeMonthList(p.owedMonths).forEach(function (m) {
          if (m <= selected && !skippedMonths.includes(m) && !trustedPaidMonths.includes(m) && !chargeableMonths.includes(m)) {
            chargeableMonths.push(m);
          }
        });
        chargeableMonths.sort();
      }
      if (!chargeableMonths.length) hiddenReasons.push('no-chargeable-months');
    }

    return {
      version: VERSION,
      profileState: state,
      selectedMonth: selected,
      paidUntilRaw: p.paidUntil || '',
      paidUntilCanonical: paidUntil,
      paidMonthsRaw: Array.isArray(p.paidMonths) ? p.paidMonths.slice() : [],
      paidMonthsCanonical: rawPaidMonths,
      trustedPaidMonthsForDebt: trustedPaidMonths,
      ignoredFuturePaidMonthsAfterPaidUntil: ignoredFuturePaidMonthsAfterPaidUntil,
      transactionPaidMonths: txPaidMonths,
      skippedMonthsRaw: Array.isArray(p.skippedMonths) ? p.skippedMonths.slice() : [],
      skippedMonthsCanonical: skippedMonths,
      feeExempt: p.feeExempt === true,
      chargeableMonths: chargeableMonths,
      debtMonths: chargeableMonths,
      shouldAppearInDebtBeforeRender: chargeableMonths.length > 0 && hiddenReasons.length === 0,
      hiddenReasons: hiddenReasons,
      warnings: Array.from(new Set(warnings))
    };
  }

  function auditProfiles(profiles, selectedMonth, options) {
    var input = profiles || {};
    var entries = Array.isArray(input) ? input.map(function (p, i) { return [String(p.name || i), p]; }) : Object.entries(input);
    var summary = {
      version: VERSION,
      selectedMonth: normalizeMonth(selectedMonth || (options && options.selectedMonth) || ''),
      totalProfiles: entries.length,
      activeProfiles: 0,
      quitProfiles: 0,
      debtProfiles: 0,
      missingProfileId: 0,
      missingBranch: 0,
      paidUntilFormatIssues: 0,
      paidMonthsAfterPaidUntil: 0,
      legacyOwedFlagsNotAuthoritative: 0,
      feeExemptProfiles: 0,
      skippedMonthProfiles: 0,
      warningsByType: {},
      samples: []
    };
    entries.forEach(function (entry) {
      var name = entry[0];
      var p = entry[1] || {};
      var d = computeProfileDebt(p, summary.selectedMonth, Object.assign({}, options || {}, { name: name, reason: 'auditTuitionDebtCanonicalProfiles' }));
      if (d.profileState.statusCanonical === 'quit') summary.quitProfiles++; else summary.activeProfiles++;
      if (d.chargeableMonths.length) summary.debtProfiles++;
      if (!d.profileState.profileId) summary.missingProfileId++;
      if (!d.profileState.branchRaw) summary.missingBranch++;
      if (p.paidUntil && !d.paidUntilCanonical) summary.paidUntilFormatIssues++;
      if (d.ignoredFuturePaidMonthsAfterPaidUntil.length) summary.paidMonthsAfterPaidUntil++;
      if (p.isOwed === false || (Array.isArray(p.owedMonths) && p.owedMonths.length === 0)) summary.legacyOwedFlagsNotAuthoritative++;
      if (p.feeExempt === true) summary.feeExemptProfiles++;
      if (Array.isArray(p.skippedMonths) && p.skippedMonths.length) summary.skippedMonthProfiles++;
      d.warnings.forEach(function (w) { summary.warningsByType[w] = (summary.warningsByType[w] || 0) + 1; });
      if (summary.samples.length < 20 && (d.warnings.length || d.chargeableMonths.length)) {
        summary.samples.push({ name: d.profileState.displayName || name, profileId: d.profileState.profileId, warnings: d.warnings, chargeableMonths: d.chargeableMonths });
      }
    });
    summary.readyForCanonicalCutover = summary.paidUntilFormatIssues === 0 && summary.missingProfileId === 0;
    return summary;
  }

  function findProfileByName(name) {
    var st = (typeof window !== 'undefined' && window.__store) || {};
    var profiles = st.profiles || (typeof window !== 'undefined' && window.allProfiles) || {};
    var q = String(name || '').trim();
    if (!q) return { key: '', profile: null, profiles: profiles };
    if (typeof window !== 'undefined' && typeof window.getCanonicalStudentName === 'function') {
      var canonical = window.getCanonicalStudentName(q, profiles);
      if (canonical && profiles[canonical]) return { key: canonical, profile: profiles[canonical], profiles: profiles };
    }
    var folded = _fold(q);
    var foundKey = Object.keys(profiles).find(function (key) {
      var p = profiles[key] || {};
      return _fold(key) === folded || _fold(p.name || p.fullName || p.studentName || p.displayName) === folded;
    });
    return { key: foundKey || q, profile: foundKey ? profiles[foundKey] : null, profiles: profiles };
  }

  function debugDebtTrace(name, selectedMonth, options) {
    var found = findProfileByName(name);
    var st = (typeof window !== 'undefined' && window.__store) || {};
    var selected = selectedMonth || (typeof document !== 'undefined' && document.getElementById('filterMonth') && document.getElementById('filterMonth').value) || st.selectedMonth || '';
    var trace = found.profile
      ? computeProfileDebt(found.profile, selected, Object.assign({}, options || {}, { name: found.key, reason: 'debugDebtTrace' }))
      : { version: VERSION, selectedMonth: normalizeMonth(selected), chargeableMonths: [], hiddenReasons: ['profile-not-found'], warnings: ['profile-not-found'] };

    var debtRowExists = null;
    if (typeof document !== 'undefined' && found.key) {
      var safeKey = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(found.key) : found.key.replace(/"/g, '\\"');
      debtRowExists = !!document.querySelector('#debtList tr[data-debt-id="' + safeKey + '"]');
    }
    var result = Object.assign({
      queryName: name,
      canonicalName: found.key,
      hasProfile: !!found.profile,
      assetVersion: VERSION,
      debtRowExists: debtRowExists,
      renderedDebtRows: typeof document !== 'undefined' ? document.querySelectorAll('#debtList tr[data-debt-id], #debtList tr[data-student-id]').length : null
    }, trace);
    if (typeof console !== 'undefined' && console.table) console.table(result);
    return result;
  }

  var api = {
    version: VERSION,
    normalizeMonth: normalizeMonth,
    addMonths: addMonths,
    normalizeMonthList: normalizeMonthList,
    deriveProfileCanonicalState: deriveProfileCanonicalState,
    computeProfileDebt: computeProfileDebt,
    auditProfiles: auditProfiles,
    debugDebtTrace: debugDebtTrace,
    extractTuitionTransactionMonths: extractTuitionTransactionMonths
  };

  window.TuitionDebtCanonical = api;
  window.normalizeTuitionDebtMonth = normalizeMonth;
  window.deriveProfileCanonicalState = deriveProfileCanonicalState;
  window.computeTuitionDebtCanonical = computeProfileDebt;
  window.auditTuitionDebtCanonicalProfiles = function (selectedMonth, options) {
    var st = window.__store || {};
    var result = auditProfiles(st.profiles || window.allProfiles || {}, selectedMonth || st.selectedMonth, options || {});
    if (console && console.table) console.table(result);
    return result;
  };
  window.debugDebtTrace = debugDebtTrace;
})();

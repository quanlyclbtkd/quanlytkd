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

  function _stableProfileId(p) {
    var pp = p || {};
    return String(pp.profileId || pp.id || pp.uid || pp.memberId || pp.memberID || pp.studentId || '').trim();
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
    var isQuit = statusByClassifier === 'quit' || p.active === false || p.isActive === false || p.quit === true || p.isQuit === true ||
      /\b(quit|inactive|retired|stopped|left|nghi|da nghi|nghi tap|bao nghi)\b/.test(foldedStatus);
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
    var stableProfileId = _stableProfileId(p);
    var txStableId = String((tx && (tx.profileId || tx.studentId || tx.memberId || tx.memberID)) || '').trim();
    if (stableProfileId && txStableId) return txStableId === stableProfileId;

    var display = _fold(_displayName(name, p));
    var txName = _fold(tx && (tx.studentName || tx.name || tx.profileName || tx.memberName));
    if (display && txName) return display === txName;

    var legacyDescription = _fold(tx && tx.description);
    return !!(display && legacyDescription && display === legacyDescription);
  }

  function getTuitionMonthSettlement(profile, month, options) {
    var p = profile || {};
    var target = normalizeMonth(month);
    if (!target) return { month: '', paid: false, settled: false, skipped: false, reason: 'invalid-month' };
    var skippedMonths = normalizeMonthList(p.skippedMonths);
    if (skippedMonths.includes(target)) {
      return { month: target, paid: false, settled: false, skipped: true, reason: 'skipped-month' };
    }
    var paidUntil = normalizeMonth(p.paidUntil || '');
    var paidMonths = normalizeMonthList(p.paidMonths);
    if (paidMonths.includes(target)) {
      return {
        month: target, paid: true, settled: true, skipped: false,
        reason: paidUntil && target <= paidUntil ? 'paid-month-and-paid-until' : 'paid-month'
      };
    }
    if (paidUntil && target <= paidUntil) {
      return { month: target, paid: true, settled: true, skipped: false, reason: 'legacy-paid-until' };
    }
    if (!(options && options.allowTransactionFallback === false)) {
      var txPaidMonths = extractTuitionTransactionMonths(p, (options && options.name) || _displayName('', p), options || {});
      if (txPaidMonths.includes(target)) {
        return { month: target, paid: true, settled: true, skipped: false, reason: 'transaction-fallback' };
      }
    }
    return { month: target, paid: false, settled: false, skipped: false, reason: 'unpaid' };
  }

  function reconcilePaidUntilFromMonthEvidence(profile, paidMonths, options) {
    var p = profile || {};
    var opt = options || {};
    var skipped = normalizeMonthList(p.skippedMonths);
    var paid = normalizeMonthList(paidMonths);
    var previous = normalizeMonth(p.paidUntil || '');
    var allowRegression = opt.allowRegression === true;
    var removedMonths = normalizeMonthList(opt.removedMonths || opt.monthsActuallyRemoved);

    // Reversal baseline is derived from the months actually removed, not only
    // from the remaining explicit paidMonths array. This preserves legacy
    // contiguous coverage when deleting a future gap payment (e.g. Aug baseline
    // + explicit Oct, delete Oct => baseline stays Aug), while allowing a real
    // removal inside the previous contiguous boundary to reopen only the
    // affected suffix.
    if (allowRegression && previous && removedMonths.length) {
      var affectingBoundary = removedMonths.filter(function (month) {
        return month <= previous && !skipped.includes(month);
      });
      if (!affectingBoundary.length) return previous;
      var boundary = addMonths(affectingBoundary[0], -1);
      while (boundary && skipped.includes(boundary)) boundary = addMonths(boundary, -1);
      return boundary;
    }

    if (!paid.length) return allowRegression ? '' : previous;

    if (!allowRegression && previous) {
      var paidSet = new Set(paid);
      var maxPaid = paid[paid.length - 1];
      var cursor = addMonths(previous, 1);
      var contiguous = previous;
      while (cursor && cursor <= maxPaid) {
        if (skipped.includes(cursor)) { cursor = addMonths(cursor, 1); continue; }
        if (!paidSet.has(cursor)) break;
        contiguous = cursor;
        cursor = addMonths(cursor, 1);
      }
      return contiguous;
    }

    var contiguousEnd = paid[0];
    for (var i = 1; i < paid.length; i++) {
      var cursor2 = addMonths(contiguousEnd, 1);
      while (cursor2 && cursor2 < paid[i] && skipped.includes(cursor2)) cursor2 = addMonths(cursor2, 1);
      if (cursor2 !== paid[i]) break;
      contiguousEnd = paid[i];
    }
    return contiguousEnd;
  }

  function areTuitionMonthsSettled(profile, months, options) {
    var normalized = normalizeMonthList(Array.isArray(months) ? months : [months]);
    var states = normalized.map(function (month) { return getTuitionMonthSettlement(profile, month, options || {}); });
    return {
      months: normalized,
      states: states,
      allSettled: states.length > 0 && states.every(function (state) { return state.paid === true; }),
      paidMonths: states.filter(function (state) { return state.paid === true; }).map(function (state) { return state.month; }),
      skippedMonths: states.filter(function (state) { return state.skipped === true; }).map(function (state) { return state.month; }),
      unpaidMonths: states.filter(function (state) { return state.paid !== true; }).map(function (state) { return state.month; })
    };
  }

  function extractTuitionTransactionMonths(profile, name, options) {
    var out = [];
    _txArray(options).forEach(function (tx) {
      if (!tx || tx.deleted === true || tx.isDeleted === true) return;
      var status = _fold(tx.status || tx.state || '');
      if (status === 'deleted' || status === 'reversed' || status === 'void') return;
      if (!_looksLikeTuitionTx(tx) || !_txMatchesProfile(tx, profile, name)) return;
      var candidates = [];
      if (Array.isArray(tx.packageMonths)) candidates = candidates.concat(tx.packageMonths);
      if (Array.isArray(tx.accountingMonths)) candidates = candidates.concat(tx.accountingMonths);
      if (Array.isArray(tx.months)) candidates = candidates.concat(tx.months);
      if (Array.isArray(tx.tuitionMonths)) candidates = candidates.concat(tx.tuitionMonths);
      if (Array.isArray(tx.paidMonths)) candidates = candidates.concat(tx.paidMonths);
      candidates = candidates.concat([
        tx.txMonth, tx.month, tx.tuitionMonth, tx.paymentMonth,
        tx.primaryAccountingMonth, tx.paidUntil, tx.period, tx.forMonth
      ]);
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
    var trustTransactionMonths = opt.trustTransactionMonths === true;

    var futurePaidMonthsAfterPaidUntil = paidUntil ? rawPaidMonths.filter(function (m) { return m > paidUntil; }) : [];
    var verifiedFuturePaidMonths = [];
    var ambiguousFuturePaidMonths = [];
    var trustedPaidMonths = rawPaidMonths.slice();
    var ignoredFuturePaidMonthsAfterPaidUntil = [];

    if (paidUntil) {
      // paidUntil is the contiguous payment boundary. Explicit paidMonths beyond
      // that boundary are only safe to suppress from Debt when an existing,
      // surviving tuition transaction in the computation context verifies the
      // same month. Otherwise preserve the month as AMBIGUOUS so the profile
      // remains visible for reconciliation without enabling a double charge.
      var contiguousPaidMonths = rawPaidMonths.filter(function (m) { return m <= paidUntil; });
      verifiedFuturePaidMonths = futurePaidMonthsAfterPaidUntil.filter(function (m) { return txPaidMonths.includes(m); });
      ambiguousFuturePaidMonths = futurePaidMonthsAfterPaidUntil.filter(function (m) { return !verifiedFuturePaidMonths.includes(m); });
      trustedPaidMonths = Array.from(new Set(contiguousPaidMonths.concat(verifiedFuturePaidMonths))).sort();
      ignoredFuturePaidMonthsAfterPaidUntil = ambiguousFuturePaidMonths.slice();
    }

    if (!paidUntil && txPaidMonths.length) {
      // Safe fallback only when profile paidUntil is absent. Existing profile boundary remains authoritative.
      trustedPaidMonths = Array.from(new Set(trustedPaidMonths.concat(txPaidMonths))).sort();
      warnings.push('paidUntil-missing-used-transaction-months-as-evidence');
    } else if (paidUntil && txPaidMonths.some(function (m) { return m > paidUntil && !rawPaidMonths.includes(m); }) && !trustTransactionMonths) {
      warnings.push('transaction-months-after-paidUntil-not-used-for-debt-suppression');
    }

    if (futurePaidMonthsAfterPaidUntil.length) warnings.push('paidMonths-after-paidUntil-preserved');
    if (verifiedFuturePaidMonths.length) warnings.push('future-paid-month-verified-by-transaction');
    if (ambiguousFuturePaidMonths.length) warnings.push('future-paid-month-requires-reconciliation');
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
      var fromParts = startMonth.split('-').map(Number);
      var toParts = selected.split('-').map(Number);
      var span = (toParts[0] - fromParts[0]) * 12 + toParts[1] - fromParts[1] + 1;
      if (!Number.isInteger(span) || span > 960) {
        throw new Error('Không thể tính đủ nợ học phí: khoảng tháng không hợp lệ hoặc vượt 80 năm.');
      }
      while (cur && cur <= selected) {
        if (!skippedMonths.includes(cur) && !trustedPaidMonths.includes(cur) && !ambiguousFuturePaidMonths.includes(cur)) chargeableMonths.push(cur);
        cur = addMonths(cur, 1);
      }
      if (p.isOwed === true && Array.isArray(p.owedMonths)) {
        normalizeMonthList(p.owedMonths).forEach(function (m) {
          if (m <= selected && !skippedMonths.includes(m) && !trustedPaidMonths.includes(m) && !ambiguousFuturePaidMonths.includes(m) && !chargeableMonths.includes(m)) {
            chargeableMonths.push(m);
          }
        });
        chargeableMonths.sort();
      }
      if (!chargeableMonths.length && !ambiguousFuturePaidMonths.length) hiddenReasons.push('no-chargeable-months');
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
      futurePaidMonthsAfterPaidUntil: futurePaidMonthsAfterPaidUntil,
      verifiedFuturePaidMonths: verifiedFuturePaidMonths,
      ambiguousFuturePaidMonths: ambiguousFuturePaidMonths,
      requiresReconciliation: ambiguousFuturePaidMonths.length > 0,
      transactionPaidMonths: txPaidMonths,
      skippedMonthsRaw: Array.isArray(p.skippedMonths) ? p.skippedMonths.slice() : [],
      skippedMonthsCanonical: skippedMonths,
      feeExempt: p.feeExempt === true,
      chargeableMonths: chargeableMonths,
      debtMonths: chargeableMonths,
      shouldAppearInDebtBeforeRender: (chargeableMonths.length > 0 || ambiguousFuturePaidMonths.length > 0) && hiddenReasons.length === 0,
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
      if (d.shouldAppearInDebtBeforeRender) summary.debtProfiles++;
      if (!d.profileState.profileId) summary.missingProfileId++;
      if (!d.profileState.branchRaw) summary.missingBranch++;
      if (p.paidUntil && !d.paidUntilCanonical) summary.paidUntilFormatIssues++;
      if (d.futurePaidMonthsAfterPaidUntil.length) summary.paidMonthsAfterPaidUntil++;
      if (p.isOwed === false || (Array.isArray(p.owedMonths) && p.owedMonths.length === 0)) summary.legacyOwedFlagsNotAuthoritative++;
      if (p.feeExempt === true) summary.feeExemptProfiles++;
      if (Array.isArray(p.skippedMonths) && p.skippedMonths.length) summary.skippedMonthProfiles++;
      d.warnings.forEach(function (w) { summary.warningsByType[w] = (summary.warningsByType[w] || 0) + 1; });
      if (summary.samples.length < 20 && (d.warnings.length || d.chargeableMonths.length || d.ambiguousFuturePaidMonths.length)) {
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
    getTuitionMonthSettlement: getTuitionMonthSettlement,
    areTuitionMonthsSettled: areTuitionMonthsSettled,
    reconcilePaidUntilFromMonthEvidence: reconcilePaidUntilFromMonthEvidence,
    computeProfileDebt: computeProfileDebt,
    auditProfiles: auditProfiles,
    debugDebtTrace: debugDebtTrace,
    extractTuitionTransactionMonths: extractTuitionTransactionMonths
  };

  window.TuitionDebtCanonical = api;
  window.normalizeTuitionDebtMonth = normalizeMonth;
  window.deriveProfileCanonicalState = deriveProfileCanonicalState;
  window.getTuitionMonthSettlement = getTuitionMonthSettlement;
  window.areTuitionMonthsSettled = areTuitionMonthsSettled;
  window.reconcilePaidUntilFromMonthEvidence = reconcilePaidUntilFromMonthEvidence;
  window.computeTuitionDebtCanonical = computeProfileDebt;
  window.auditTuitionDebtCanonicalProfiles = function (selectedMonth, options) {
    var st = window.__store || {};
    var result = auditProfiles(st.profiles || window.allProfiles || {}, selectedMonth || st.selectedMonth, options || {});
    if (console && console.table) console.table(result);
    return result;
  };
  window.debugDebtTrace = debugDebtTrace;
})();

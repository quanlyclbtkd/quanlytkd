/**
 * js/core/studentSearchIndex.js
 * ────────────────────────────────────────────────────────────────
 * Phase 4K-6K-E — Unified Student Search Index Accuracy Gate
 *
 * A read-only, in-memory student search index shared by active/quit/debt
 * search flows. It improves search accuracy for Vietnamese names, phone,
 * CLB member code, VTF member code, branch and belt without adding Firestore
 * reads or changing any write/business logic.
 * ────────────────────────────────────────────────────────────────
 */

const _state = {
  built: false,
  version: '',
  lastBuildAt: 0,
  buildCount: 0,
  lastSearchAt: 0,
  searchCount: 0,
  lastTerm: '',
  lastResultCount: 0,
  exactNameCount: 0,
  entryCount: 0,
  vtfCount: 0,
  phoneCount: 0,
  memberIdCount: 0,
  ambiguousNameCount: 0,
  recent: []
};

let _entries = [];
let _byName = new Map();
let _byNormName = new Map();
let _byCode = new Map();
let _byPhone = new Map();

function _stripVN(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function normalizeStudentSearchText(value) {
  return _stripVN(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s@._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _compact(value) {
  return normalizeStudentSearchText(value).replace(/\s+/g, '');
}

function _tokens(value) {
  return normalizeStudentSearchText(value).split(' ').filter(t => t && t.length >= 1);
}

function _wordBoundaryContains(text, term) {
  const t = normalizeStudentSearchText(text);
  const q = normalizeStudentSearchText(term);
  if (!q) return false;
  return t.split(' ').some(part => part === q || part.startsWith(q) || part.includes(q));
}

function _digits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function _upperCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function _getProfiles() {
  const st = window.__store || {};
  if (st.profiles && typeof st.profiles === 'object') return st.profiles;
  try {
    if (window.studentProfileStore && typeof window.studentProfileStore.getAllProfilesCompat === 'function') {
      return window.studentProfileStore.getAllProfilesCompat() || {};
    }
  } catch (_) {}
  return {};
}

function _profileVersion(profiles) {
  const keys = Object.keys(profiles || {});
  const st = window.__store || {};
  // Prefer explicit profile/list data versions when available. Fallback to a
  // lightweight key fingerprint so the index rebuilds after import/add/delete.
  const versionHint = st._profileDataVersion || st._profilesVersion || st._studentsDataVersion || st._dataVersion || 0;
  const first = keys[0] || '';
  const last = keys[keys.length - 1] || '';
  return [keys.length, versionHint, first, last].join('|');
}

function _pushUnique(arr, value) {
  const s = String(value || '').trim();
  if (!s) return;
  if (!arr.includes(s)) arr.push(s);
}

function _studentNameFromEntry(id, profile) {
  return String((profile && (profile.name || profile.fullName || profile.studentName)) || id || '').trim();
}

function _getVtfValue(profile) {
  const p = profile || {};
  return p.vtfCode || p.vtfId || p.vtf || p.vtfMemberId || p.memberVtf ||
    p.maVTF || p.maVtf || p.maHoiVienVTF || p.maHoiVienVtf || p.maHoiVien ||
    p.memberId || p.studentCode || p.code || p.idCode || '';
}

function _codeFields(profile) {
  const p = profile || {};
  return [
    p.memberId, p.studentCode, p.code, p.idCode,
    p.vtfCode, p.vtfId, p.vtf, p.vtfMemberId, p.memberVtf,
    p.maVTF, p.maVtf, p.maHoiVienVTF, p.maHoiVienVtf, p.maHoiVien,
    p.memberNo, p.cardNo, p.registrationNo
  ].filter(Boolean);
}

function _phoneFields(profile) {
  const p = profile || {};
  return [p.phone, p.phoneNumber, p.sdt, p.mobile, p.parentPhone, p.contactPhone, p.guardianPhone, p.motherPhone, p.fatherPhone].filter(Boolean);
}

function _buildTokens(id, profile) {
  const p = profile || {};
  const name = _studentNameFromEntry(id, p);
  const parts = [];
  [
    id, name, p.name, p.fullName, p.studentName, p.nickname, p.searchName,
    p.gender, p.dob, p.birthDate,
    p.branchCode, p.branch, p.branchName, p.base, p.facility,
    p.belt, p.currentBelt, p.rank,
    p.notes, p.note, p.address, p.email,
    p.cccd, p.identityNo
  ].forEach(v => _pushUnique(parts, v));

  _codeFields(p).forEach(v => _pushUnique(parts, v));
  _phoneFields(p).forEach(v => _pushUnique(parts, v));

  const normalizedParts = parts.map(normalizeStudentSearchText).filter(Boolean);
  const compactParts = parts.map(_compact).filter(Boolean);
  const digitParts = _phoneFields(p).map(_digits).filter(Boolean);
  const codeParts = _codeFields(p).map(_upperCode).filter(Boolean);

  const blob = Array.from(new Set(normalizedParts.concat(compactParts, digitParts, codeParts.map(normalizeStudentSearchText)))).join(' ');

  return { parts, blob, compactName: _compact(name), normalizedName: normalizeStudentSearchText(name), nameTokens: _tokens(name), digitParts, codeParts };
}

function _addToMap(map, key, entry) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(entry);
}

export const StudentSearchIndex = {
  normalize: normalizeStudentSearchText,
  compact: _compact,
  digits: _digits,

  buildIndex(reason = 'manual') {
    const profiles = _getProfiles();
    const version = _profileVersion(profiles);
    _entries = [];
    _byName = new Map();
    _byNormName = new Map();
    _byCode = new Map();
    _byPhone = new Map();

    Object.entries(profiles || {}).forEach(([id, profile]) => {
      const p = profile || {};
      const name = _studentNameFromEntry(id, p);
      if (!name) return;
      const tokens = _buildTokens(id, p);
      const entry = {
        id,
        name,
        profile: p,
        normalizedName: tokens.normalizedName,
        compactName: tokens.compactName,
        nameTokens: tokens.nameTokens,
        blob: tokens.blob,
        codes: tokens.codeParts,
        phones: tokens.digitParts,
        status: String(p.status || '').toLowerCase(),
        branch: p.branchCode || p.branch || p.branchName || p.base || '',
        belt: p.belt || p.currentBelt || '',
        vtf: _getVtfValue(p)
      };
      _entries.push(entry);
      _addToMap(_byName, name, entry);
      _addToMap(_byNormName, entry.normalizedName, entry);
      entry.codes.forEach(code => _addToMap(_byCode, code, entry));
      entry.phones.forEach(phone => _addToMap(_byPhone, phone, entry));
    });

    let ambiguous = 0;
    _byNormName.forEach(list => { if (list.length > 1) ambiguous++; });

    _state.built = true;
    _state.version = version;
    _state.lastBuildAt = Date.now();
    _state.buildCount++;
    _state.entryCount = _entries.length;
    _state.exactNameCount = _byName.size;
    _state.ambiguousNameCount = ambiguous;
    _state.vtfCount = _entries.filter(e => e.vtf).length;
    _state.phoneCount = _entries.filter(e => e.phones && e.phones.length).length;
    _state.memberIdCount = _entries.filter(e => e.codes && e.codes.length).length;
    window.__studentSearchIndexReady = true;
    window.__studentSearchIndexVersion = version;
    return this.getStats(reason);
  },

  ensureIndex(reason = 'ensure') {
    const profiles = _getProfiles();
    const version = _profileVersion(profiles);
    if (!_state.built || _state.version !== version) {
      return this.buildIndex(reason);
    }
    return this.getStats(reason);
  },

  invalidate(reason = 'manual') {
    _state.built = false;
    _state.version = '';
    window.__studentSearchIndexReady = false;
    return { ok: true, reason };
  },

  isReady() {
    this.ensureIndex('is-ready');
    return _state.built && _entries.length > 0;
  },

  getEntries() {
    this.ensureIndex('get-entries');
    return _entries.slice();
  },

  matchesMode(entry, mode) {
    const tab = mode || 'active';
    const profile = entry && entry.profile || {};
    const name = entry && (entry.name || entry.id) || '';
    if (typeof window.filterStudentItemsForMode === 'function') {
      try {
        return window.filterStudentItemsForMode([Object.assign({ id: name }, profile)], tab).length > 0;
      } catch (_) {}
    }
    if (tab === 'quit') {
      const s = String(profile.status || '').toLowerCase();
      return s === 'quit' || s === 'inactive' || s === 'nghi' || !!profile.quitDate;
    }
    if (tab === 'active') {
      if (typeof window.shouldShowActiveStudentByNewFilter === 'function') {
        try { return !!window.shouldShowActiveStudentByNewFilter(name, profile); } catch (_) {}
      }
      const s = String(profile.status || '').toLowerCase();
      return !(s === 'quit' || s === 'inactive' || s === 'nghi') && !profile.quitDate;
    }
    return true;
  },

  _score(entry, normTerm, compactTerm, digitTerm, codeTerm) {
    let score = 0;
    const matches = [];
    if (!entry) return { score, matches };
    if (entry.normalizedName === normTerm) { score += 120; matches.push('exact-name'); }
    else if (entry.normalizedName.startsWith(normTerm)) { score += 80; matches.push('name-prefix'); }
    else if (entry.normalizedName.includes(normTerm)) { score += 60; matches.push('name-contains'); }

    const nameTokens = Array.isArray(entry.nameTokens) ? entry.nameTokens : _tokens(entry.name || entry.normalizedName || '');
    if (normTerm && nameTokens.some(t => t === normTerm)) { score += 95; matches.push('name-token-exact'); }
    else if (normTerm && nameTokens.some(t => t.startsWith(normTerm))) { score += 72; matches.push('name-token-prefix'); }
    else if (normTerm && nameTokens.some(t => t.includes(normTerm))) { score += 58; matches.push('name-token-contains'); }

    if (compactTerm && entry.compactName === compactTerm) { score += 100; matches.push('compact-name'); }
    else if (compactTerm && entry.compactName.includes(compactTerm)) { score += 55; matches.push('compact-name-contains'); }

    if (codeTerm && entry.codes.some(c => c === codeTerm)) { score += 115; matches.push('exact-code'); }
    else if (codeTerm && entry.codes.some(c => c.includes(codeTerm))) { score += 75; matches.push('code-contains'); }

    if (digitTerm && digitTerm.length >= 3 && entry.phones.some(p => p === digitTerm)) { score += 110; matches.push('exact-phone'); }
    else if (digitTerm && digitTerm.length >= 3 && entry.phones.some(p => p.includes(digitTerm))) { score += 70; matches.push('phone-contains'); }

    if (entry.blob.includes(normTerm)) { score += 25; matches.push('blob'); }
    return { score, matches: Array.from(new Set(matches)) };
  },

  searchStudents(rawTerm, options = {}) {
    this.ensureIndex('search');
    const normTerm = normalizeStudentSearchText(rawTerm);
    const compactTerm = _compact(rawTerm);
    const digitTerm = _digits(rawTerm);
    const codeTerm = _upperCode(rawTerm);
    const limit = Number(options.limit || 100);
    const mode = options.mode || options.tab || 'active';
    const branch = String(options.branch || '').trim();
    const includeAllStatuses = !!options.includeAllStatuses || mode === 'all';

    if (!normTerm && !digitTerm && !codeTerm) return { items: [], entries: [], total: 0, term: normTerm, source: 'student-search-index' };

    const rows = [];
    for (const entry of _entries) {
      if (!includeAllStatuses && !this.matchesMode(entry, mode)) continue;
      if (branch && branch !== 'all' && branch !== 'Tất cả cơ sở') {
        const eb = String(entry.branch || '').trim();
        let sameBranch = eb === branch;
        try {
          if (window.BranchIdentity && typeof window.BranchIdentity.isSameBranch === 'function') sameBranch = window.BranchIdentity.isSameBranch(eb, branch);
        } catch (_) {}
        if (eb && !sameBranch) continue;
      }
      const scored = this._score(entry, normTerm, compactTerm, digitTerm, codeTerm);
      if (scored.score > 0) rows.push(Object.assign({ score: scored.score, matches: scored.matches }, entry));
    }

    rows.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'vi'));
    const sliced = rows.slice(0, limit);
    _state.searchCount++;
    _state.lastSearchAt = Date.now();
    _state.lastTerm = normTerm;
    _state.lastResultCount = rows.length;
    _state.recent.push({ at: Date.now(), term: normTerm, mode, total: rows.length, returned: sliced.length, top: sliced[0] && sliced[0].name, matches: sliced[0] && sliced[0].matches });
    if (_state.recent.length > 30) _state.recent.shift();

    return {
      items: sliced.map(e => Object.assign({ id: e.id, _searchScore: e.score, _searchMatches: e.matches }, e.profile)),
      entries: sliced,
      total: rows.length,
      term: normTerm,
      source: 'student-search-index',
      limit
    };
  },

  findStudent(rawTerm, options = {}) {
    const result = this.searchStudents(rawTerm, Object.assign({ includeAllStatuses: true, mode: 'all', limit: 10 }, options));
    return result.entries[0] || null;
  },

  getStats(reason = '') {
    return Object.assign({ reason }, _state, {
      ready: _state.built,
      recent: _state.recent.slice(-10),
      indexFieldCoverage: {
        vtf: _state.vtfCount,
        phone: _state.phoneCount,
        memberId: _state.memberIdCount,
        ambiguousName: _state.ambiguousNameCount
      }
    });
  },

  debugAccuracy(rawTerm, options = {}) {
    const result = this.searchStudents(rawTerm, Object.assign({ includeAllStatuses: true, mode: 'all', limit: options.limit || 20 }, options));
    const out = {
      term: rawTerm,
      normalizedTerm: normalizeStudentSearchText(rawTerm),
      compactTerm: _compact(rawTerm),
      digitTerm: _digits(rawTerm),
      total: result.total,
      returned: result.entries.length,
      topMatches: result.entries.map(e => ({ name: e.name, id: e.id, score: e.score, matches: e.matches, status: e.profile && e.profile.status, memberId: e.profile && e.profile.memberId, vtf: e.vtf, phone: e.profile && e.profile.phone }))
    };
    console.table(out.topMatches);
    return out;
  },

  debugStudent(rawName) {
    this.ensureIndex('debug-student');
    const norm = normalizeStudentSearchText(rawName);
    const exact = _byName.get(String(rawName || '').trim()) || [];
    const normalized = _byNormName.get(norm) || [];
    const search = this.debugAccuracy(rawName, { limit: 10 });
    return {
      rawName,
      normalized: norm,
      exactCount: exact.length,
      normalizedCount: normalized.length,
      exact: exact.map(e => ({ name: e.name, id: e.id, memberId: e.profile && e.profile.memberId, vtf: e.vtf })),
      normalizedMatches: normalized.map(e => ({ name: e.name, id: e.id, memberId: e.profile && e.profile.memberId, vtf: e.vtf })),
      search
    };
  }
};

export function initStudentSearchIndex() {
  window.StudentSearchIndex = window.StudentSearchIndex || StudentSearchIndex;
  window.normalizeStudentSearchText = window.normalizeStudentSearchText || normalizeStudentSearchText;
  window.searchStudentsUnified = function(term, options) {
    return window.StudentSearchIndex.searchStudents(term, options || {});
  };
  window.invalidateStudentSearchIndex = function(reason) {
    return window.StudentSearchIndex.invalidate(reason || 'manual');
  };
  window.debugStudentSearchIndex = function() {
    const result = window.StudentSearchIndex.ensureIndex('debug');
    console.table({ ready: result.ready, entryCount: result.entryCount, buildCount: result.buildCount, searchCount: result.searchCount, vtfCount: result.vtfCount, phoneCount: result.phoneCount, memberIdCount: result.memberIdCount, ambiguousNameCount: result.ambiguousNameCount });
    return result;
  };
  window.debugSearchAccuracy = function(term) {
    return window.StudentSearchIndex.debugAccuracy(term || ((document.getElementById('searchInput') || {}).value || ''), { limit: 20 });
  };
  window.debugSearchIndexForStudent = function(name) {
    return window.StudentSearchIndex.debugStudent(name || ((document.getElementById('searchInput') || {}).value || ''));
  };
  try { StudentSearchIndex.ensureIndex('init'); } catch (_) {}
  console.info('[StudentSearchIndex] ✅ Phase 4K-6K-E unified student search index ready.');
  return StudentSearchIndex.getStats('init');
}

export default StudentSearchIndex;

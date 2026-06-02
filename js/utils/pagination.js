/**
 * js/utils/pagination.js — Phase 3.2A
 * ────────────────────────────────────────────────────────────────
 * Reusable Firestore cursor-based pagination engine.
 *
 * EXPORTS:
 *   PAGE_SIZE              — default page size (50)
 *   createPaginationState  — create a fresh pagination state object
 *   resetPagination        — reset state to initial values (for new search/tab)
 *   prepareNextPage        — advance cursor to next page
 *   preparePreviousPage    — step back to previous page
 *   processPage            — extract docs + update state from a getDocs snapshot
 *   renderPaginationControls — build pagination controls HTML string
 *
 * USAGE (in a module):
 *   import { createPaginationState, resetPagination, processPage,
 *            prepareNextPage, preparePreviousPage,
 *            renderPaginationControls, PAGE_SIZE } from '../utils/pagination.js';
 *
 *   // 1. Create state once
 *   store.pagination.students = createPaginationState(PAGE_SIZE);
 *
 *   // 2. Load first page
 *   const snap = await getDocs(query(colRef, orderBy('__name__'), limit(PAGE_SIZE + 1)));
 *   const items = processPage(snap, store.pagination.students);
 *
 *   // 3. Load next page
 *   const cursor = prepareNextPage(state);
 *   if (cursor) {
 *     const snap = await getDocs(query(colRef, orderBy('__name__'), startAfter(cursor), limit(PAGE_SIZE + 1)));
 *     const items = processPage(snap, state);
 *   }
 *
 * /// Phase 3.2A — Pagination Engine
 * ────────────────────────────────────────────────────────────────
 */

/** Default page size — 50 documents per page */
export const PAGE_SIZE = 50;

/**
 * Create a fresh pagination state object.
 * Must be stored in store.pagination.<module>.
 *
 * @param {number} pageSize — documents per page (default: PAGE_SIZE = 50)
 * @returns {Object} pagination state
 */
export function createPaginationState(pageSize = PAGE_SIZE) {
    return {
        pageSize,
        currentPage:   0,       // 1-based; 0 = not yet loaded
        totalLoaded:   0,       // cumulative docs seen across all pages
        lastVisible:   null,    // DocumentSnapshot — cursor for startAfter (next)
        firstVisible:  null,    // DocumentSnapshot — cursor for startAt (prev)
        hasNext:       false,
        hasPrevious:   false,
        isLoading:     false,
        enabled:       false,   // true when paginated mode is active
        pageHistory:   [],      // stack of firstVisible cursors for back-navigation
        searchActive:  false,   // true when a search query is restricting results
        searchQuery:   '',      // current search string (for re-querying on page turn)
        currentItems:  [],      // array of {id, ...data} for the current page
    };
}

/**
 * Reset pagination state to initial values.
 * Call when: tab switch, search change, filter change.
 *
 * @param {Object} state — pagination state from createPaginationState()
 */
export function resetPagination(state) {
    if (!state) return;
    state.currentPage  = 0;
    state.totalLoaded  = 0;
    state.lastVisible  = null;
    state.firstVisible = null;
    state.hasNext      = false;
    state.hasPrevious  = false;
    state.isLoading    = false;
    state.pageHistory  = [];
    state.searchActive = false;
    state.searchQuery  = '';
    state.currentItems = [];
}

/**
 * Process a getDocs snapshot (fetched with limit = pageSize + 1 trick).
 * Detects whether a next page exists, trims results, updates state.
 *
 * @param {QuerySnapshot} snap  — result of getDocs(query(..., limit(pageSize+1)))
 * @param {Object}        state — pagination state (mutated in place)
 * @returns {Array} array of {id, ...data} for the CURRENT page
 */
export function processPage(snap, state) {
    const docs = snap.docs;
    state.hasNext    = docs.length > state.pageSize;
    const pageDocs   = docs.slice(0, state.pageSize);

    if (pageDocs.length > 0) {
        state.firstVisible = pageDocs[0];
        state.lastVisible  = pageDocs[pageDocs.length - 1];
    }

    state.currentPage = Math.max(1, state.currentPage);
    const from        = (state.currentPage - 1) * state.pageSize + 1;
    const to          = from + pageDocs.length - 1;
    state.totalLoaded = to;

    state.currentItems = pageDocs.map(d => ({ id: d.id, ...d.data() }));
    state.isLoading    = false;
    return state.currentItems;
}

/**
 * Prepare for next-page navigation.
 * Pushes current firstVisible onto history stack, increments currentPage.
 *
 * @param {Object} state — pagination state
 * @returns {DocumentSnapshot|null} lastVisible cursor for startAfter(), or null if no next page
 */
export function prepareNextPage(state) {
    if (!state || state.isLoading || !state.hasNext) return null;
    state.pageHistory.push(state.firstVisible);
    state.hasPrevious = true;
    state.currentPage += 1;
    state.isLoading    = true;
    return state.lastVisible;
}

/**
 * Prepare for previous-page navigation.
 * Pops from history stack, decrements currentPage.
 *
 * @param {Object} state — pagination state
 * @returns {DocumentSnapshot|null} popped cursor for startAt(), or null if already on first page
 */
export function preparePreviousPage(state) {
    if (!state || state.isLoading || !state.hasPrevious) return null;
    const cursor      = state.pageHistory.pop();
    state.hasPrevious = state.pageHistory.length > 0;
    state.currentPage = Math.max(1, state.currentPage - 1);
    state.isLoading   = true;
    return cursor;
}

/**
 * Render pagination controls as an HTML string.
 * Inject this after the <table> element for the paginated list.
 *
 * Buttons call:
 *   window._pgPrev_<prefix>()
 *   window._pgNext_<prefix>()
 *
 * @param {Object} state   — pagination state
 * @param {string} prefix  — 'students' | 'transactions' (used for element IDs)
 * @param {number} from    — first item number on this page (e.g. 1)
 * @param {number} to      — last item number on this page (e.g. 50)
 * @returns {string} HTML string for the controls bar
 */
export function renderPaginationControls(state, prefix, from, to) {
    if (!state || state.currentPage === 0) return '';

    const { currentPage, hasPrevious, hasNext, isLoading } = state;

    const _base    = 'display:inline-flex;align-items:center;padding:6px 16px;border-radius:8px;font-weight:700;font-size:0.82rem;cursor:pointer;border:1.5px solid;transition:opacity 0.12s;';
    const _prevSt  = hasPrevious && !isLoading
        ? `${_base}border-color:#cbd5e1;background:#f8fafc;color:#334155;`
        : `${_base}border-color:#e2e8f0;background:#f8fafc;color:#cbd5e1;cursor:not-allowed;`;
    const _nextSt  = hasNext && !isLoading
        ? `${_base}border-color:#0033A0;background:#eff6ff;color:#0033A0;`
        : `${_base}border-color:#e2e8f0;background:#f8fafc;color:#cbd5e1;cursor:not-allowed;`;

    const rangeLabel = (from > 0 && to > 0)
        ? `<span style="font-size:0.75rem;color:#64748b;">Hiển thị <strong>${from}–${to}</strong></span>`
        : '';

    return `
<div id="pgCtrl_${prefix}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 10px 10px;gap:8px;flex-wrap:wrap;">
  <button type="button" id="pgPrev_${prefix}"
    onclick="if(typeof window._pgPrev_${prefix}==='function')window._pgPrev_${prefix}()"
    ${hasPrevious && !isLoading ? '' : 'disabled'}
    style="${_prevSt}">← Trước</button>
  <span style="font-size:0.8rem;color:#475569;font-weight:700;display:flex;align-items:center;gap:8px;">
    Trang ${currentPage}${rangeLabel ? ' &nbsp;·&nbsp; ' + rangeLabel : ''}
    ${isLoading ? '<span style="font-size:0.7rem;color:#64748b;">(Đang tải...)</span>' : ''}
  </span>
  <button type="button" id="pgNext_${prefix}"
    onclick="if(typeof window._pgNext_${prefix}==='function')window._pgNext_${prefix}()"
    ${hasNext && !isLoading ? '' : 'disabled'}
    style="${_nextSt}">Tiếp →</button>
</div>`;
}

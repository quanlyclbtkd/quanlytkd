/**
 * modules/students/students.render.js — Phase 3.3H (Stub)
 * ────────────────────────────────────────────────────────────────
 * Khi hoàn tất tách, file này sẽ chứa:
 *
 *   renderAchievements(list)      — Render danh sách thành tích thi đấu
 *   renderStudentRow(name, p, opts) — Build một <tr> cho võ sinh
 *   renderDebtRow(name, p, opts)  — Build một <tr> cho tab nợ
 *   renderQuitRow(name, p, opts)  — Build một <tr> cho tab nghỉ
 *
 * Phase 3.3F: Dùng DocumentFragment thay vì innerHTML += '' để giảm reflow:
 *
 *   const frag = document.createDocumentFragment();
 *   items.forEach(item => {
 *       const tr = document.createElement('tr');
 *       tr.innerHTML = buildRowHtml(item);
 *       frag.appendChild(tr);
 *   });
 *   tableBody.replaceChildren(frag);
 *
 * NGUỒN: modules/students.js lines 74–104 (renderAchievements)
 *        ui/render.js lines 310–500 (student row HTML)
 *
 * STATUS: 🚧 Stub
 *
 * /// Phase 3.3H — Code Organization
 * /// Phase 3.3F — Performance Optimization
 * ────────────────────────────────────────────────────────────────
 */

/**
 * Phase 3.3F: Build table body dùng DocumentFragment.
 * Thay thế dần `tableEl.innerHTML += rowHtml` pattern.
 *
 * @param {HTMLElement}       tbody  — <tbody> element
 * @param {string[]}          rowHtmlArr — mảng HTML string mỗi row
 */
export function renderTableBodyFragment(tbody, rowHtmlArr) {
    if (!tbody) return;
    const frag = document.createDocumentFragment();
    rowHtmlArr.forEach(html => {
        const tr = document.createElement('tr');
        tr.innerHTML = html;
        frag.appendChild(tr);
    });
    // replaceChildren nhanh hơn innerHTML = '' + append
    tbody.replaceChildren(frag);
}

/**
 * Phase 3.3F: Safe innerHTML setter với replaceChildren.
 * Thay thế el.innerHTML = html; (trigger full reparse + reflow).
 *
 * @param {HTMLElement} el
 * @param {string}      html
 */
export function setInnerHTML(el, html) {
    if (!el) return;
    const temp = document.createElement('div');
    temp.innerHTML = html;
    el.replaceChildren(...temp.childNodes);
}

export const __stub__ = 'students.render — Phase 3.3H stub';

# PHASE 4K-6V5U6H8R2.1C1 — UI Residual Audit

Input: PHASE 4K-6V5U6H8R2.1C Professional UI/UX Mobile App Shell.
Scope: presentation-only role/access/UI-contract closure. No data-flow or business owner changes.

| ID | Severity | Residual defect | Exact root cause | Existing authority mirrored | Planned presentation-only fix | Data/Firestore impact | Risk / rollback |
|---|---|---|---|---|---|---|---|
| C1-A | U0 | Tenant bottom navigation appears in SuperAdmin/access-block states | CSS equates `#mainApp[style*="display: block"]` with accepted tenant runtime, but both SuperAdmin root and `_renderClubAccessBlocked()` intentionally set `mainApp.style.display='block'` | Existing `#superAdminView` visibility + dynamically inserted `#clubAccessBlockBanner` | Replace broad bottom-nav predicate with a DOM-derived accepted-tenant predicate excluding SuperAdmin and access-block; hide tenant chrome during access block | 0 reads / 0 writes / 0 listeners | CSS rollback only |
| C1-B | U1 | Coach/SuperAdmin/blocked More sheet exposes tenant module entries | H8R2.1C module grid has no semantic wrapper and only Exam has a role-derived CSS hide | Existing desktop tab/button visibility and Attendance-active role presentation | Add `#mobileMoreModuleSection`; hide it from existing DOM markers for Coach, SuperAdmin and access-block | 0 | HTML/CSS rollback only |
| C1-C | U1 | Mobile utility entries can diverge from desktop permission presentation | Settings/Tax/Excel mobile buttons have no stable IDs and are always present in sheet | Existing desktop `#btnSettings`, `#exportTaxBtn`, `#exportBtn` visibility | Add presentation IDs and CSS mirror selectors; do not copy role logic | 0 | HTML/CSS rollback only |
| C1-D | U2 | Filter sheet toggle does not expose open state | `aria-controls` exists but no `aria-expanded`; sheet lacks named grouping/dialog semantics | Existing filterArea class toggle | Add aria-expanded updates in existing inline DOM handlers and accessible title/group contract | 0 | Attribute-only rollback |
| C1-E | U2 | More sheet lacks full dialog/trigger state contract | Sheet has no dialog label; triggers do not expose `aria-controls`/`aria-expanded` | Existing `openMobileMenu` / `closeMobileMenu` DOM-only functions | Add dialog labeling and update aria-expanded inside same existing functions | 0 | Attribute-only rollback |
| C1-F | U2 | Bottom-nav label is ~10.9px | `.ui-bottom-nav-item{font-size:.68rem}` | H8R2.1C CSS layer | Raise to `.75rem` (12px) without changing grid | 0 | CSS rollback only |

## Frozen owners verified

- `app.js` and `js/**` remain read-only for C1.
- `switchTab()` / `enforceRoleTab()` remain unchanged.
- Club Access Gate remains `_renderClubAccessBlocked()` + existing bootstrap state; C1 only mirrors the resulting DOM.
- Coach presentation marker remains existing hidden legacy tab buttons + active Attendance tab.
- SuperAdmin marker remains existing `#superAdminView.style.display='block'`.
- No new role/access/navigation state is required.

## Deferred

- MODULE CARD SEMANTIC MIGRATION = DEFERRED TO C2.
- Search behavior changes = not required for C1; existing SearchRuntime remains untouched.

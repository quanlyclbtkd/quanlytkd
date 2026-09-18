# PHASE 4K-6V5U6H8R2.1C1C — Mobile Navigation + Tuition Layout Refinement

## Result

**SOURCE = PASS**

This is a presentation-only refinement on top of C1A/C1B evidence. No Firebase reader/writer/listener authority was added.

## Progress review before patch

- C1A source baseline remained clean.
- Updated C1B evidence showed production bootstrap/CSS available, Admin desktop navigation/25-cycle stable, SuperAdmin isolation and Access Block fail-closed passing at the available desktop viewport.
- C1B remained NOT READY because real mobile viewport matrix and confirmed Coach runtime were still not verified.

## User-requested changes implemented

1. Mobile Bottom Navigation exact order:
   - 💳 Học Phí
   - ⚠️ Báo Nợ
   - 📋 Điểm danh
   - 🥋 Đang tập
   - ☰ Khác

2. Tổng quan was moved into the existing More sheet as `🏠 Tổng quan`; Báo Nợ is no longer duplicated in More.

3. Tuition action block (`GHI NHẬN THU HỌC PHÍ`, `THU GỘP KHOẢN`, `GIA ĐÌNH`, `THÊM VÕ SINH`) was moved above the existing Search / Filter DOM block. Existing IDs and onclick handlers were preserved.

4. Tuition transaction mobile card overlap was fixed. Root cause was legacy CSS assigning both the date cell and the period/month cell to `grid-column:1; grid-row:2`. The renderer now exposes semantic classes and mobile presentation uses separate rows:
   - name + amount: row 1
   - period/month + actions: row 2
   - payment date: row 3

5. Transaction data/business semantics were not changed; only semantic classes were added to the existing HTML row renderer.

## Changed runtime files

- `index.html`
- `css/ui-mobile-shell.css`
- `app.js` — presentation class names only in the existing transaction renderer
- `tools/check-ui-mobile-app-shell.mjs` — gate updated for the approved navigation/layout contract

`/public` was generated only by `npm run build:public`; it was not edited manually.

## Verification

- `check:ui-mobile-app-shell`: **80/80 PASS**
- `check:syntax`: **246 items PASS**
- `check:canonical-transaction-safe-cutover`: **27/27 PASS**
- `check:financial-action-audit-guard`: **PASS**
- `check:runtime-stability-gate`: **29/29 PASS**
- `check:long-term-production-stability`: **39/39 PASS**
- `precheck:all:critical`: **PASS**
- `check:release`: **36/36 PASS**
- `check:deploy-package`: **12/12 PASS**
- `check:root-public-parity`: **PASS — 124/124, missing=0, extra=0, hashMismatch=0**

Firestore static budget remains:

- getDoc = 29
- getDocs = 51
- onSnapshot = 16

## Runtime status after this source patch

This package is source-verified. Real mobile visual acceptance still must be rerun because prior C1B evidence did not execute the required 320/360/390/430/768 viewport matrix or a confirmed Coach session.

Required next runtime checks:

- 320×568, 360×800, 390×844, 430×932, 768×1024
- verify exact Bottom Nav order/icons
- verify tuition action block above Search/Filter
- verify payment date and period/month never overlap
- Coach Attendance-only mobile presentation
- More/Filter repeat cycles and runtime error budget

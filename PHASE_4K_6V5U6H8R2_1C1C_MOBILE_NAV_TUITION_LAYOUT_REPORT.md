# PHASE 4K-6V5U6H8R2.1C1C — Mobile Nav + Tuition Layout Report

## Kết luận source

**H8R2.1C1C UI SOURCE = PASS**

C1C chỉ thay đổi presentation. Không sửa business flow, renderer, navigation authority, role/auth authority hoặc Firestore flow. `switchTab()` và canonical `openMobileMenu()` tiếp tục là các authority hiện hữu.

Runtime mobile thật vẫn thuộc bước C1B sau deploy; báo cáo này không chuyển các mục chưa chạy trên thiết bị/browser mobile thành runtime PASS.

## 1. Progress baseline

Baseline là source C1A có cùng hash với candidate đã dùng trong C1B. Trước C1C:

| Gate / evidence | Baseline |
| --- | --- |
| UI Mobile Shell | 75/75 PASS |
| Runtime Stability | 29/29 PASS |
| Long-Term Stability | 39/39 PASS |
| Release | 36/36 PASS |
| Deploy Package | 12/12 PASS |
| Root/Public parity | 124/124 PASS |
| Firestore static budget | 29 / 51 / 16 |
| C1B runtime | NOT READY: mobile viewport và confirmed Coach chưa được xác minh |

## 2. Files changed

Source runtime/gate thay đổi:

- `index.html`
- `css/ui-mobile-shell.css`
- `tools/check-ui-mobile-app-shell.mjs`

Generated bằng `npm run build:public`:

- `public/index.html`
- `public/css/ui-mobile-shell.css`

Report:

- `PHASE_4K_6V5U6H8R2_1C1C_MOBILE_NAV_TUITION_LAYOUT_REPORT.md`

Không sửa `app.js`, `js/modules/**`, `js/services/**`, `js/core/**`, `js/ui/render/computation/financeRenderer.js`, Rules, Functions hoặc schema. So sánh toàn cây với C1A chỉ thấy năm file source/generated ở trên khác nội dung.

| File / scope | C1A SHA-256 | C1C SHA-256 |
| --- | --- | --- |
| `index.html` | `57c80276f3111ae950b60358c0212af51a5b2395a8e18e5019b608da93cbf51c` | `5d51fee25e6c3f37d797b9d6d7b644c8c9594ed155b3bdf2525e1bb81b397989` |
| `css/ui-mobile-shell.css` | `d0acd2b3a4e58f1f86853387d73cae25bc1706a7bf207fcbd09aa2dbbee78695` | `d4bc94faf2856aa7930c5e0058d9161bd7c9ffe625265acead9c1535affcad21` |
| `tools/check-ui-mobile-app-shell.mjs` | `8cefe2ba86a4a643ce797bf24685f68c2bdbae7602887279081efccca5bc98df` | `3923473b61d083b53578acdec1cc2dad8959dc3c68a8bb3b4ac4e60f0c9002a0` |
| `app.js` | `03fed2d6258ea0e36d28a97671aadd9b7bcc4d4dbd780a8e8753ede875fde470` | unchanged |
| `js/ui/legacyUiShell.js` | `901817a9bc99e248a0638d57d948e119c0d8040660ad2327437589ec2b0fb2b7` | unchanged |
| Business JS aggregate | `7c1b6383e47d3e1ca47989d3bfa24ff4c377493a3950f82c97d0cace07a0c818` | unchanged |

Canonical mobile stylesheet URL được cache-bust thành `ui-mobile-shell-20260918-h8r2_1c1c` để deploy GitHub Pages không giữ CSS C1A cũ.

## 3. Bottom Navigation before/after

| Position | Before | After | Existing action authority |
| --- | --- | --- | --- |
| 1 | Tổng quan | Học Phí | `switchTab('tx')` |
| 2 | Học phí | Báo Nợ | `switchTab('debt')` |
| 3 | Điểm danh | Điểm danh | `switchTab('attendance')` |
| 4 | Võ sinh | Đang tập | `switchTab('active')` |
| 5 | Khác | Khác | `openMobileMenu()` |

Primary nav có đúng năm button theo ID:

1. `mobileNavTuition`
2. `mobileNavDebt`
3. `mobileNavAttendance`
4. `mobileNavStudents`
5. `mobileNavMore`

`mobileNavDashboard` không còn là primary item. Dashboard tab và `switchTab('dashboard')` vẫn giữ nguyên.

Active presentation được derive từ `.tab-content.active`: `tab_tx`, `tab_debt`, `tab_attendance`, `tab_active` lần lượt map vào bốn item trực tiếp; Dashboard/Inventory/Exam/Expense/Quit map vào `mobileNavMore`. Không có active-nav state mới.

## 4. More menu before/after

| Before | After |
| --- | --- |
| Báo nợ | Tổng quan |
| Kho đồ | Kho đồ |
| Thi đai | Thi đai |
| Chi phí | Chi phí |
| Đã nghỉ | Đã nghỉ |

`mobileMoreDashboard` gọi đúng `closeMobileMenu();switchTab('dashboard')`. `mobileMoreDebt` bị loại khỏi markup để không trùng với Bottom Navigation. Canonical More owner từ C1A không thay đổi.

## 5. Coach parity

Coach presentation vẫn derive từ các desktop role markers hiện hữu. Không có role state mới.

- Ẩn `mobileNavTuition`.
- Ẩn `mobileNavDebt`.
- Ẩn `mobileNavStudents`.
- Ẩn `mobileNavMore` và `mobileMoreModuleSection`.
- Giữ `mobileNavAttendance` visible.

SuperAdmin và Access Block tiếp tục ẩn tenant Bottom Nav/More. Heading Học phí mới cũng bị ẩn rõ trong hai trạng thái này để giữ fail-closed.

## 6. Exact Date/Month root cause

Legacy mobile CSS đặt đồng thời:

- `#tbl_tx tbody td:first-child` — Ngày nộp — vào `grid-column:1; grid-row:2`.
- `#tbl_tx tbody td:nth-last-child(5)` — Kỳ doanh thu/Tháng — vào `grid-column:1; grid-row:2`.

Hai cell dùng cùng grid area nên chồng nhau. Đây là lỗi presentation; transaction data và renderer không sai.

## 7. Exact Date/Month fix

`css/ui-mobile-shell.css` thêm override canonical, tải sau legacy inline CSS:

- row: `grid-template-columns:minmax(0,1fr) auto`.
- row tracks: `auto auto auto`.
- name: column 1, row 1, `min-width:0`, safe wrap.
- amount: column 2, row 1, max-content sizing.
- date: column 1, row 2.
- month: column 1, row 3, safe range wrap.
- action: column 2, `grid-row:2 / span 2`.
- action touch target: tối thiểu 44px.
- pseudo-label mobile: `Ngày nộp:` và `Tháng:`.

Semantic selectors `.tx-date-cell`, `.tx-month-cell`, `.tx-name-cell`, `.tx-amount-cell`, `.tx-actions-cell` được ưu tiên. Positional selectors chỉ giữ compatibility cho legacy/single-row paths chưa có đủ semantic amount class. Không sửa `financeRenderer.js`.

UI gate chứng minh Date row 2 và Month row 3 không thể dùng chung area.

## 8. Mobile tuition heading/filter order

DOM source order mới:

1. `#mobileTuitionContextHeading` — `💳 GHI NHẬN THU HỌC PHÍ`
2. `#filterArea`
3. existing Học phí content

Heading mobile mặc định `display:none`, chỉ hiện ở `max-width:767px` khi `#tab_tx.active`. H4 gốc trong `#tab_tx` được đánh dấu `.tx-primary-heading` và chỉ bị ẩn trong mobile tx-active state; action buttons cùng hàng không bị clone hoặc ẩn. Ở desktop, heading mobile vẫn hidden và H4 gốc giữ nguyên.

## 9. Proof no duplicate search/filter

Gate đếm đúng một occurrence cho từng ID:

- `searchInput`: 1
- `filterMonth`: 1
- `filterBranch`: 1
- `uiFilterToggle`: 1
- `filterArea`: 1

Không có mobile search/filter clone, event dispatch mới hoặc filter state mới.

## 10. Viewport matrix

Cloud browser trong phiên này từ chối mở candidate local theo URL security policy. Vì source chưa deploy và không được phép dùng workaround browser khác, visual runtime/screenshot không được giả lập thành PASS.

| Viewport | Source/CSS contract | Live visual result |
| --- | --- | --- |
| 320 × 568 | Mobile rules: five equal nav columns; 44px touch token; three-row tuition grid | NOT EXECUTED |
| 360 × 800 | Same mobile contract | NOT EXECUTED |
| 390 × 844 | Same mobile contract | NOT EXECUTED |
| 430 × 932 | Same mobile contract | NOT EXECUTED |
| 768 × 1024 | Desktop media boundary; mobile heading/nav not introduced | NOT EXECUTED |
| 1366 × 768 | Desktop layout remains outside mobile override | NOT EXECUTED on patched local candidate |

Static source assertions do not replace post-deploy C1B device/browser evidence.

## 11. 320px screenshot

Không có screenshot hợp lệ: patched local candidate không thể được browser surface mở trong phiên này. Không dùng screenshot của production C1A để đại diện cho C1C.

## 12. 390px screenshot

Không có screenshot hợp lệ vì cùng giới hạn trên.

## 13. Firestore budget

| API | Before | After | Delta |
| --- | ---: | ---: | ---: |
| `getDoc` | 29 | 29 | 0 |
| `getDocs` | 51 | 51 | 0 |
| `onSnapshot` | 16 | 16 | 0 |

Không thêm reader, writer, listener, transaction, cache, polling hoặc scheduler.

## 14. Full regression

| Command | Result |
| --- | --- |
| `npm run check:ui-mobile-app-shell` | 95/95 PASS |
| `npm run check:runtime-stability-gate` | 29/29 PASS |
| `npm run check:long-term-production-stability` | 39/39 PASS |
| `npm run check:profile-display-name-safe-edit` | 28/28 PASS |
| `npm run check:production-security-trust-boundary` | 41/41 PASS |
| `npm run check:production-authority-closure` | 64/64 PASS |
| `npm run check:attendance-daily-single-refresh-authority` | 73/73 PASS |
| `npm run check:attendance-explicit-shift-authority` | 60/60 PASS |
| `npm run check:canonical-transaction-safe-cutover` | 27/27 PASS |
| `npm run check:inventory-ledger-reconciliation` | 33/33 PASS |
| `npm run check:financial-action-audit-guard` | PASS |
| `npm run check:exam-payment-identity` | 20/20 PASS |
| `npm run precheck:all:critical` | PASS |
| `npm run check:release` | 36/36 PASS |
| `npm run check:deploy-package` | 12/12 PASS |

## 15. Root/Public parity

`npm run build:public` hoàn tất từ root source; `/public` không được patch thủ công.

`npm run check:root-public-parity`:

- root files: 124
- public files: 124
- missing: 0
- extra: 0
- hashMismatch: 0
- status: PASS

Final parity hashes:

- root/public `index.html`: `5d51fee25e6c3f37d797b9d6d7b644c8c9594ed155b3bdf2525e1bb81b397989`
- root/public `css/ui-mobile-shell.css`: `d4bc94faf2856aa7930c5e0058d9161bd7c9ffe625265acead9c1535affcad21`

## 16. Remaining C1B verification

Sau khi deploy chính xác `/public`, phải rerun C1B:

- viewport thật 320/360/390/430 và desktop boundary 768/1366;
- single-month, six-month, bundle và tên >=30 ký tự;
- confirmed Coach account: Attendance only + branch boundary;
- canonical More runtime và SuperAdmin `Mở CLB Mới`;
- More 50-cycle;
- Filter 30-cycle;
- navigation 25-cycle với nav order mới;
- runtime error/listener/DOM budgets;
- remote deployed asset/hash confirmation;
- screenshots 320px và 390px.

C2 Semantic Mobile Cards vẫn deferred cho đến khi C1B sau deploy PASS.

# Phase 4K-6V5J — System Audit + Active Filter Gate Consistency

## Mục tiêu

Đánh giá tổng thể bản mới nhất sau V5I và kiểm tra lại theo vai trò SuperAdmin/Admin/HLV. Trong quá trình kiểm tra phát hiện 2 vấn đề nhỏ thuộc nhóm audit/gate, đã sửa để tăng độ tin cậy trước khi nâng cấp hiệu năng sâu hơn.

## Kết quả kiểm tra tổng quan

### npm run check

Trước khi sửa V5J, `npm run check` trên V5I đã PASS. Sau khi vá V5J, các nhóm trọng yếu và các nhóm còn lại trong pipeline đều đã chạy tách lớp và PASS. Lệnh `npm run check`/`check:all` đầy đủ rất dài trong môi trường tool nên có lần timeout, nhưng các nhóm bị dừng đã được chạy tiếp riêng và đều PASS.

### Các vấn đề phát hiện và đã xử lý

#### 1. GitHub Pages path test báo fail giả

- Nguyên nhân: `main.js` đã import SuperAdmin bằng relative path đúng, nhưng có query cache-bust `?v=...` nên test cũ chỉ tìm exact `import('./modules/superadmin.js')` và báo fail.
- Đã sửa: `tools/check-github-pages-paths.mjs` chấp nhận relative import có version query string.
- Kết quả: `check:github-pages-paths` PASS 18/18.

#### 2. Active new-student filter chưa áp dụng ở PASS 2 renderer

- Nguyên nhân: `studentsRenderer.js` PASS 1 đã áp dụng `shouldShowActiveStudentByNewFilter()`, nhưng PASS 2 pagination override chưa áp dụng, có thể làm tab Đang tập lệch sau load-more/cache override.
- Đã sửa: PASS 2 cũng áp dụng cùng filter `shouldShowActiveStudentByNewFilter(name, p)`.
- Kết quả: `check:active-new-students-filter` PASS 30/30.

## Kiểm tra theo vai trò

### SuperAdmin

PASS các nhóm:

- `check:superadmin-monthstats` — PASS 8/8
- `check:v5e-audit-gate-superadmin-hardening` — PASS 10/10
- `check:superadmin-hotfix` — PASS 27/27
- `check:db-ready-guards` — PASS 14/14
- `check:github-pages-paths` — PASS 18/18
- `check:deploy-package` — PASS 12/12

Đánh giá: SuperAdmin ổn hơn sau V5E/V5J. Các lỗi lớn trước đây như monthStats null, race SuperAdmin module, path deploy GitHub Pages đã có guard.

### Admin CLB

PASS các nhóm:

- `check:v5c-tx-delete-reconcile-smart-search` — PASS 15/15
- `check:debt-authoritative-tuition-coverage` — PASS 32/32
- `check:tuition-debt-source-of-truth` — PASS
- `check:finance-indexes` — PASS 9/9
- `check:payment-bundle-runtime-hotfix` — PASS 20/20
- `check:inventory-ledger-reconciliation` — PASS 33/33
- `check:active-new-students-filter` — PASS 30/30

Đánh giá: Admin CLB đủ an toàn cho Học phí, Báo nợ, xóa giao dịch, kho đồ, search tên. Điều kiện bắt buộc: đã deploy Firestore Rules từ V5H/V5C để quyền xóa giao dịch và login_history đúng.

### HLV

PASS các nhóm:

- `check:v5b-coach-attendance-toggle-stability` — PASS 13/13
- `check:v5i-attendance-render-window-slow-warning-guard` — PASS 16/16
- `check:coach-attendance-only-read-boundary` — PASS 30/30
- `check:security-coach-branch-boundary` — PASS 35/35
- `check:coach-branch-runtime-repair` — PASS 25/25
- `check:attendance-canonical-ownership` — PASS 141 assertions
- `check:attendance-shift-filter` — PASS 10/10

Đánh giá: HLV đã ổn định hơn nhiều. Luồng chính chỉ đọc điểm danh theo cơ sở, không đọc tài chính/kho/stats, toggle không bị nhảy trạng thái, danh sách lớn đã có render window.

## Kiểm tra hiệu năng và cấu trúc

### Đã ổn

- Không còn cảnh báo lớn do render thật toàn bộ debt/attendance nếu đã dùng V5I/V5J.
- Slow render production đã được gate/coalesce.
- Báo nợ, Điểm danh đã có render window/load-more.
- Search tên cuối đã thống nhất qua nhiều renderer.

### Rủi ro còn tồn tại

#### 1. app.js vẫn lớn

- `app.js`: khoảng 685 KB, 11.049 dòng.
- Đây là rủi ro trung hạn vì nhiều fallback/legacy vẫn còn trong kernel.
- Chưa nên refactor mạnh ngay nếu hệ thống đang ổn.

#### 2. Static Firestore call count còn cao

Static grep trên source:

- `onSnapshot`: 72 lần xuất hiện
- `getDocs`: 158 lần xuất hiện
- `getCountFromServer`: 28 lần xuất hiện
- `limit(`: 121 lần xuất hiện

Đây là số lượng xuất hiện trong source, không đồng nghĩa tất cả chạy cùng lúc. Tuy nhiên nó cho thấy hệ thống vẫn còn nhiều đường đọc cũ/fallback cần kiểm soát dần.

#### 3. check:all quá dài

Pipeline kiểm tra hiện rất dài, dễ timeout trong môi trường tool/CI yếu. Nên tách thành các nhóm:

- `check:role-superadmin`
- `check:role-admin`
- `check:role-coach`
- `check:performance`
- `check:deploy`

## Hướng nâng cấp tiếp theo đề xuất

### Phase 4K-6V5K — Role-Based Check Pipeline + Read/Render Profiling

Mục tiêu:

1. Tách pipeline kiểm tra theo vai trò.
2. Thêm report thời gian chạy từng check.
3. Thêm runtime metrics dễ đọc cho Admin:
   - số rows đang render thật
   - số rows tổng
   - số lần render tab
   - số listener đang active
   - số lần fallback legacy được dùng
4. Không thay đổi nghiệp vụ Học phí/Báo nợ/HLV.

Lý do nên làm V5K trước:

- Không phá chức năng đang ổn định.
- Giúp kiểm tra nhanh hơn trước mỗi lần deploy.
- Tạo nền để giảm Reads/render thật sự mà không đoán mò.

### Phase sau V5K: Legacy Read Reduction / App.js Boundary

Chỉ nên làm sau khi có profiler rõ:

- tách dần kernel `app.js` theo boundary nhỏ;
- loại bỏ legacy full-list fallback ít dùng;
- giảm active profile listener cho Admin bằng lazy/hybrid cache;
- triển khai virtualization thật cho bảng lớn nếu cần.

## Kết luận

Sau V5J, không phát hiện lỗi nghiêm trọng trong nhóm kiểm tra trọng yếu. Hai vấn đề audit/gate phát hiện trong quá trình kiểm tra đã được sửa. Hệ thống hiện phù hợp để vận hành, nhưng bước tiếp theo nên là đo lường và tách pipeline theo vai trò thay vì tiếp tục vá nghiệp vụ rời rạc.

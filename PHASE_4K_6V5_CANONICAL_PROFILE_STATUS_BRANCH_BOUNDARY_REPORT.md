# Phase 4K-6V5 — Canonical Profile Status + Branch Index Boundary

## Mục tiêu

Chuẩn hóa dữ liệu đọc của võ sinh để giảm lỗi lặp lại ở các luồng: Đang tập, Đã nghỉ, HLV điểm danh và Báo nợ, nhưng không migration hàng loạt, không Cloud Functions, không dùng Blaze và không làm tăng full-read không cần thiết.

## Nguyên tắc an toàn đã áp dụng

1. Không bulk migration toàn bộ collection profiles.
2. Không tự gán `branchCode: CS1` cho mọi update.
3. Chỉ ghi `branchCode` khi payload thật sự có tín hiệu cơ sở hoặc khi đang tạo/sửa hồ sơ đầy đủ.
4. Các update không liên quan hồ sơ như thu học phí, chỉnh nợ, cập nhật tiền, hoặc status-only patch không bị ép branch mặc định sai.
5. Dữ liệu legacy vẫn được đọc fallback khi thiếu field chuẩn, nhưng không còn là luồng ưu tiên.
6. Self-heal chỉ chạy trên một hồ sơ đang thao tác/mở, không scan toàn CLB.

## Thay đổi chính

### 1. Boundary chuẩn hóa hồ sơ

Thêm module `js/core/profileCanonicalBoundary.js` với API:

- `canonicalizeProfileForWrite()`
- `buildCanonicalProfilePatch()`
- `canonicalProfileStatusKind()`
- `canonicalProfileBranchCode()`
- `needsCanonicalProfileSelfHeal()`
- `selfHealProfileCanonicalFields()`

Các field chuẩn:

- `statusKind: "active" | "quit" | "trial"`
- `branchCode: "CS1"..."CS10"`
- `isQuit: true/false`
- `updatedAt`

### 2. Luồng ghi dữ liệu võ sinh

Các luồng tạo/sửa hồ sơ giờ ghi field chuẩn:

- Thêm võ sinh mới.
- Sửa hồ sơ võ sinh.
- Đổi trạng thái nghỉ tập.
- Student service create/update/patch/rename.

Các patch chỉ cập nhật trạng thái nghỉ sử dụng canonical patch an toàn, không ép branch nếu payload không có branch.

### 3. Luồng đọc/lọc dữ liệu

Các luồng đọc ưu tiên field chuẩn:

- Classifier ưu tiên `statusKind` và `isQuit` trước legacy status.
- HLV điểm danh query chính theo `branchCode == coachBranch`.
- Tab Đã nghỉ query chính theo `statusKind == 'quit'`, sau đó mới fallback legacy.
- Attendance branch filter ưu tiên `branchCode`.
- Render Đang tập/Đã nghỉ hiển thị `branchCode` trước `branch`.
- ProfileCanonicalStore ưu tiên `branchCode`.

### 4. Self-heal nhẹ

Khi Admin mở hồ sơ hoặc sửa hồ sơ, hệ thống có thể tự bổ sung field chuẩn cho đúng một hồ sơ đang thao tác. Không có `getDocs`, không full collection scan, không migration nền.

### 5. Firestore Rules và bảo mật

Rules hiện vẫn giữ branch-scoped boundary cho HLV. V5 không mở quyền full-club cho HLV. HLV vẫn không đọc tài chính/kho/stats, và profile read vẫn bị ràng buộc theo cơ sở được giao.

## Các file chính đã cập nhật

- `index.html`
- `app.js`
- `js/main.js`
- `js/core/profileCanonicalBoundary.js`
- `js/data/profileStatusConfig.js`
- `js/data/studentProfileStore.js`
- `js/core/profileCanonicalStore.js`
- `js/services/students.service.js`
- `js/listeners/profiles.listeners.js`
- `js/modules/attendance.js`
- `js/modules/students.js`
- `js/ui/render/renderStudents.js`
- `firestore.rules`
- `package.json`
- `tools/check-v5-canonical-profile-status-branch-boundary.mjs`
- public mirror tương ứng

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:v5-canonical-profile-status-branch-boundary` — PASS 18/18
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:v4d10-admin-tx-quit-authoritative` — PASS 11/11
- `npm run check:v4d11-attendance-excel-tx-delete-reconcile` — PASS 12/12
- `npm run check:v4d12-superadmin-access-recovery` — PASS 14/14
- `npm run check` — PASS toàn bộ pipeline

## Kết luận

V5 đã đưa hệ thống sang hướng đọc/ghi hồ sơ có index chuẩn `statusKind` và `branchCode`, nhưng vẫn giữ fallback legacy để không làm hỏng dữ liệu cũ. Đây là bước nền quan trọng để sau này giảm dần các query legacy nhiều field và giảm full authoritative fallback ở tab Đã nghỉ.

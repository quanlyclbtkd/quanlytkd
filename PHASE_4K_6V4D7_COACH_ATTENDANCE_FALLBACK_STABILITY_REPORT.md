# Phase 4K-6V4D7 — Coach Attendance Fallback Stability

## Mục tiêu

Kiểm tra thật kỹ tài khoản HLV sau V4D6 có load được danh sách võ sinh trong cơ sở được giao để điểm danh hay chưa. Nếu chưa ổn định, tìm đúng luồng lỗi và sửa không ảnh hưởng đến các tab/tính năng khác.

## Kết luận kiểm tra

V4D6 đã có các lớp chính:

- HLV login qua `users/{uid}` và fallback `coach_login_index/{uid}`.
- HLV chỉ mount tab Điểm danh, không mount tài chính/kho/báo nợ.
- Profile listener của HLV query theo `status + branch`.
- Nếu query active rỗng bất thường, fallback đọc branch được giao.
- Attendance UI đọc từ union bộ nhớ `studentProfileStore.getAllProfilesCompat()` + `window.allProfiles` + `window.__store.profiles` rồi lọc theo `coachBranch`.

Tuy nhiên, vẫn tìm thấy một luồng lỗi có thể làm danh sách điểm danh HLV bị rỗng/thiếu sau khi đã load được fallback.

## Nguyên nhân lỗi còn sót

Trong `js/listeners/profiles.listeners.js`:

1. `loadCoachBranchProfilesFallback()` có thể đọc đúng danh sách võ sinh theo cơ sở được giao, đặc biệt khi data cũ thiếu field `status` nên query `where('status', 'in', ...)` trả rỗng.
2. Fallback này `setActiveProfiles(activeMap, ...)` để danh sách điểm danh có dữ liệu.
3. Nhưng kết quả fallback không được lưu vào `_state.coachCanonicalActiveMap` hoặc một vùng nhớ bền riêng.
4. Khi realtime active snapshot sau đó trả về rỗng/ít dữ liệu, hàm `_mergedCoachActiveMap()` chỉ merge `coachLegacyActiveMap` + `coachCanonicalActiveMap`; fallback bị mất.
5. Vì `studentProfileStore.setActiveProfiles()` là replace toàn bộ, snapshot rỗng có thể ghi đè danh sách fallback, làm tab Điểm danh HLV lại trống dù trước đó đã load được.

Đây là lý do lỗi có thể xuất hiện dai dẳng: HLV có thể đăng nhập được nhưng danh sách võ sinh trong cơ sở được giao vẫn trống/thiếu do fallback bị active listener ghi đè.

## Sửa đổi V4D7

- Thêm `_state.coachFallbackActiveMap` để giữ danh sách fallback của cơ sở HLV.
- Sửa `_mergedCoachActiveMap()` thành merge 3 nguồn:
  1. `coachFallbackActiveMap`
  2. `coachLegacyActiveMap`
  3. `coachCanonicalActiveMap`
- Thứ tự merge: fallback → legacy → canonical. Canonical realtime vẫn thắng nếu có dữ liệu mới, nhưng fallback không bị mất khi realtime query rỗng do data cũ thiếu status.
- `loadCoachBranchProfilesFallback()` giờ ghi `activeMap` vào `_state.coachFallbackActiveMap` trước khi `setActiveProfiles(_mergedCoachActiveMap(), ...)`.
- Cleanup/reset sẽ xóa `coachFallbackActiveMap` để không rò dữ liệu khi đổi user/club/branch.
- Không thêm full-club reads cho HLV. Fallback vẫn chỉ đọc theo branch alias được giao.

## Trả lời câu hỏi: HLV đã load được danh sách điểm danh chưa?

Sau V4D7: về mặt luồng code và test gate, HLV đã có đủ điều kiện để load danh sách võ sinh trong cơ sở được giao:

- Login HLV có fallback từ `coach_login_index/{uid}` nếu `users/{uid}` thiếu/stale.
- Auth context bắt buộc có `clubId` và `coachBranch`; thiếu thì fail-closed.
- Profile listener của HLV đọc server-side theo cơ sở được giao.
- Nếu query active theo status bị rỗng do data cũ thiếu `status`, fallback branch-only sẽ đọc lại võ sinh trong đúng cơ sở.
- Fallback branch-only bây giờ được giữ bền trong runtime và không bị snapshot rỗng ghi đè.
- Attendance UI lọc theo `coachBranch` và đọc từ full in-memory union.

## Các file chính đã chỉnh

- `js/listeners/profiles.listeners.js`
- `js/core/coachBranchRuntimeRepair.js`
- `js/main.js`
- `app.js`
- `index.html`
- `package.json`
- `tools/check-v4d7-coach-attendance-fallback-stability.mjs`
- Đồng bộ các file tương ứng trong `public/`.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:v4d6-quit-coach-attendance` — PASS 16/16
- `npm run check:v4d7-coach-attendance-fallback-stability` — PASS 8/8
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- Full `npm run check` — PASS, STATUS: 0

## Lưu ý triển khai bắt buộc

Nếu đang sửa trên Firebase thật:

1. Upload bản V4D7 lên hosting/GitHub.
2. Deploy `firestore.rules` đi kèm nếu bản hiện tại chưa deploy rules từ V4D6.
3. Admin/SuperAdmin chạy đồng bộ/tự sửa tài khoản HLV cũ một lần để tạo đủ `users/{uid}` và `coach_login_index/{uid}`.
4. HLV đăng xuất, mở lại tab ẩn danh hoặc xóa cache, rồi đăng nhập lại.

Nếu chưa deploy rules hoặc chưa đồng bộ HLV cũ, app web đã sửa nhưng Firebase thật vẫn có thể trả `permission-denied` hoặc thiếu `coachBranch`.

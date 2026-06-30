# Phase 4K-6V4D9 — Coach Roster Hydration + Branch Rules Repair

## Mục tiêu
Sửa dứt điểm lỗi tài khoản HLV đăng nhập được nhưng không load được danh sách võ sinh tại cơ sở được giao để điểm danh.

## Triệu chứng thực tế
- Console báo `Coach profiles module unavailable — blocked full-club fallback` ở bản trước.
- Sau khi module profile đã sẵn, HLV vẫn không có roster vì các query theo cơ sở bị `permission-denied` hoặc trả về rỗng.
- Điểm danh không hiện danh sách võ sinh dù tài khoản HLV đã có `clubId` và `coachBranch`.

## Nguyên nhân gốc
1. Firestore Rules dùng `assignedBranch(resource.data)` theo thứ tự ưu tiên `branchCode -> branch -> coachBranch -> branchName`.
   - Với query `where('branch', '==', 'CS2')`, Rules vẫn không chứng minh được tài liệu hợp lệ nếu document có thể có `branchCode` khác.
   - Vì vậy các query hợp lệ của HLV như `branch=CS2`, `branchCode=CS2`, `branchName=Cơ sở 2` có thể bị deny.
2. `loadCoachBranchProfilesFallback()` dùng chung `fallbackCount/maxFallbackPerSession` với full fallback Admin.
   - Khi có nhiều lần fallback lỗi/deny, HLV có thể hết lượt fallback và roster không retry.
3. Nếu tất cả alias query bị `permission-denied`, fallback cũ vẫn có thể set activeProfiles rỗng và đánh dấu loaded, khiến Điểm danh hiển thị “không có võ sinh”.
4. `attendance.js` lọc danh sách bằng `p.branch` là chính.
   - Nếu profile legacy lưu cơ sở ở `branchCode`, `coachBranch`, `branchName`, `location`, `facility`, võ sinh đã được load vào store vẫn bị lọc rớt khỏi Điểm danh.
5. Tên cơ sở tùy chỉnh trong `main_config` chỉ biết sau settings snapshot, nhưng fallback HLV đã chạy trước đó nên thiếu alias tên cơ sở custom.

## Sửa đổi chính
### Firestore Rules
- Thêm `dataHasAssignedBranch(data)` để kiểm tra độc lập từng field:
  - `branch`
  - `branchCode`
  - `coachBranch`
  - `branchName`
- `resourceBranchMatchesCoach()` và `requestBranchMatchesCoach()` không còn phụ thuộc vào `assignedBranch(resource.data)` dạng ưu tiên.
- `selfCoachMirrorMatches()` dùng `branchEquivalent(...)` thay vì so sánh chuỗi tuyệt đối, để `CS2`, `CS02`, `CS 2`, `Cơ sở 2` cùng hợp lệ.
- Sửa lỗi syntax `isBranch10Alias()` bị thừa dòng `||`.

### Profiles listener
- Tách guard fallback HLV riêng:
  - `coachBranchFallbackInProgress`
  - `maxCoachBranchFallbackPerSession`
- Fallback HLV không còn tiêu hao `fallbackCount` full-club của Admin.
- Nếu mọi alias query đều bị deny, không set roster rỗng là loaded.
- Khi fallback có dữ liệu, merge với realtime canonical rows thay vì thay thế mù.
- Khi profile legacy thiếu `branch`, tự bổ sung `branch/branchCode` canonical vào bản ghi in-memory để Attendance dùng ổn định.

### Attendance UI
- Thêm `_profileBranchValue(profile)` và `_profileMatchesBranch(profile, branch)`.
- Danh sách điểm danh HLV lọc theo tất cả field cơ sở legacy, không chỉ `p.branch`.
- Khi ghi điểm danh dùng branch canonical/branchCode qua AttendanceService.

### Settings snapshot
- Sau khi `main_config` load xong, HLV chạy lại branch fallback để bắt các profile lưu theo tên cơ sở tùy chỉnh.

## Cache bust
`coach-roster-hydration-rules-repair-20260630-v4d9`

## File chính đã chỉnh
- `firestore.rules`
- `app.js`
- `js/listeners/profiles.listeners.js`
- `js/modules/attendance.js`
- `js/core/branchIdentity.js`
- `js/main.js`
- `index.html`
- `public/*` mirrors
- `tools/check-coach-roster-hydration-rules-repair-v4d9.mjs`

## Kiểm tra đã chạy
- `npm run check:syntax` — PASS
- `npm run check:coach-roster-hydration-rules-repair` — PASS 17/17
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:quit-mobile-coach-attendance-repair` — PASS 21/21
- `npm run check:quit-tab-mobile-parity` — PASS 17/17

## Bắt buộc khi triển khai
1. Upload toàn bộ bản V4D9 lên hosting/GitHub.
2. Deploy `firestore.rules` đi kèm bản này.
3. Cho tài khoản HLV đăng xuất, mở tab ẩn danh hoặc xóa cache/PWA cache rồi đăng nhập lại.

Nếu chỉ upload web mà chưa deploy Rules, các query HLV vẫn có thể bị `permission-denied`.

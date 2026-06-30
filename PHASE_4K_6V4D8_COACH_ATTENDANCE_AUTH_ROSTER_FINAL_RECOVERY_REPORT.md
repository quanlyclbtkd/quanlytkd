# Phase 4K-6V4D8 — Coach Attendance Auth + Roster Final Recovery

## Mục tiêu
Khắc phục triệt để lỗi tài khoản HLV điểm danh không load được danh sách võ sinh tại cơ sở được giao sau nhiều lần sửa.

## Kết luận nguyên nhân sâu

### 1. Runtime branch identity bị giữ version guard cũ
`BranchIdentity` và `CoachBranchRuntimeRepair` đã được bổ sung logic mới ở các bản trước, nhưng guard/version vẫn là `4K-6V4D4`. Trong một số vòng đời cache/trình duyệt, object cũ có thể không bị thay thế, làm logic map tên cơ sở như `Nguyễn Trãi` sang `CS2` không chạy đúng.

### 2. Assignment HLV có thể lưu cơ sở bằng tên hiển thị, không phải mã CS
Nhiều dữ liệu cũ có thể lưu `clubs/{clubId}/coaches/{uid}.branch` hoặc `coachBranch` là tên cơ sở hiển thị. Ví dụ: `Nguyễn Trãi`. Luồng cũ canonicalize trước khi `settings/main_config` sẵn sàng nên không biết `Nguyễn Trãi = CS2`, dẫn tới `window.coachBranch` rỗng hoặc sai.

### 3. Firestore Rules self-repair vẫn yêu cầu assignment khớp tuyệt đối
Bản trước yêu cầu:

`assignedBranch(coachAssignment) == assignedBranch(usersMirror)`

Nếu assignment lưu `Nguyễn Trãi` còn users mirror cần ghi `CS2`, rules từ chối self-repair. HLV đăng nhập nhưng không có `users/{uid}` mirror chuẩn nên không đủ quyền đọc profile điểm danh.

### 4. Settings/main_config bị chặn khi users mirror chưa chuẩn
HLV cần `settings/main_config` để biết tên cơ sở nào tương ứng với `CSx`, nhưng rules cũ chỉ cho đọc settings khi `isCoach(clubId)` đã đúng. Đây là vòng lặp chết: chưa có users mirror chuẩn thì không đọc được settings, không đọc được settings thì không canonicalize được assignment branch name.

### 5. Fallback roster phụ thuộc `_ctx` nội bộ module
Nếu `app.js` đã nhận dữ liệu hoặc gọi fallback trước khi `main.js/profiles.listeners.js` mount context, `loadCoachBranchProfilesFallback()` dùng `_ctx = null` và tự chặn. Vì vậy có trường hợp dữ liệu đã có hoặc có thể query được nhưng HLV vẫn thấy danh sách trống.

### 6. Dữ liệu võ sinh có nhiều field cơ sở legacy
Bản trước đã hỗ trợ một số field như `branchName`, `coSo`, `facility`, nhưng thực tế dữ liệu có thể nằm ở nhiều field khác: `branchId`, `branchLabel`, `clubBranch`, `studentBranch`, `trainingBranch`, `classBranch`, `campus`, `campusName`, `site`, `trainingBase`, `trainingLocation`, `co_so`, `coSoTap`, `noiTap`, `diaDiemTap`.

### 7. Renderer Điểm danh có thể sẵn sàng sau snapshot
Có trường hợp snapshot roster về trước khi `renderAttendanceList()` được expose. Dữ liệu đã nằm trong store nhưng UI không repaint lại, khiến người dùng nghĩ danh sách không load.

## Phương án đã chọn
Không mở quyền đọc toàn CLB cho HLV. V4D8 xử lý theo tuyến an toàn:

1. HLV đọc đúng assignment của chính mình.
2. HLV được đọc `settings/main_config` tối thiểu nếu có assignment hợp lệ, kể cả khi `users/{uid}` mirror còn cũ.
3. Runtime map tên cơ sở hiển thị sang mã `CSx`.
4. Runtime self-repair `users/{uid}` sang canonical `role='coach', branch='CSx', coachBranch='CSx'`.
5. Roster chỉ query các hồ sơ thuộc cơ sở được giao qua các field legacy an toàn.
6. Sau khi attendance renderer sẵn sàng, hệ thống retry roster và repaint UI.

## File chính đã sửa

- `index.html`
- `app.js`
- `firestore.rules`
- `package.json`
- `js/main.js`
- `js/core/branchIdentity.js`
- `js/core/coachBranchRuntimeRepair.js`
- `js/listeners/profiles.listeners.js`
- `js/modules/attendance.js`
- Các bản mirror trong `public/`
- `tools/check-v4d8-coach-attendance-auth-roster-final-recovery.mjs`
- Cập nhật một số regression gate cũ để chấp nhận V4D8.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:v4d4-coach-quit-authoritative-fix` — PASS 17/17
- `npm run check:v4d5-coach-quit-attendance-full-recovery` — PASS 12/12
- `npm run check:v4d6-coach-attendance-root-cause-recovery` — PASS 12/12
- `npm run check:v4d7-coach-attendance-deep-branch-recovery` — PASS 13/13
- `npm run check:v4d8-coach-attendance-auth-roster-final-recovery` — PASS 18/18
- `npm run check` — PASS toàn bộ pipeline.

## Lưu ý deploy
Bản này có sửa `firestore.rules`. Cần deploy cả Hosting/source và Firestore Rules. Nếu chỉ deploy source mà không deploy rules, HLV vẫn có thể không self-repair được quyền hoặc không đọc được settings/main_config để map tên cơ sở sang `CSx`.

Sau khi deploy nên mở tài khoản HLV bằng tab ẩn danh hoặc xóa cache site một lần để tránh giữ bundle V4D7 cũ.

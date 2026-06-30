# Phase 4K-6V4D7 — Quit Mobile + Coach Attendance Branch Rules Repair

## Mục tiêu

Sửa các lỗi còn lại sau 4K-6V4D6:

1. File warnings còn báo `Missing or insufficient permissions`.
2. HLV đăng nhập được nhưng không lấy đủ danh sách võ sinh để điểm danh.
3. Tab Đã nghỉ bị kẹt ở trạng thái “Đang tải đầy đủ danh sách võ sinh đã nghỉ…”.

## Nguyên nhân xác định

### 1. Login history warning

`login_history` chưa có rule create phù hợp, nên app báo warning khi ghi lịch sử đăng nhập. Đây không phải lỗi chặn đăng nhập nhưng gây warning liên tục.

### 2. HLV không lấy đủ danh sách điểm danh

Rules và query cũ chỉ xét nhánh `branch` với giá trị exact. Trong dữ liệu thật, cùng một cơ sở có thể xuất hiện dưới nhiều dạng:

- `branch=CS2`
- `branchCode=CS2`
- `branch=CS02`
- `branch=CS 2`
- `branch=Cơ sở 2`
- tên cơ sở tùy chỉnh từ `branchName2`, ví dụ “Sân vận động”

Khi HLV được phân công `CS2` nhưng profile/attendance lưu bằng alias khác, Rules trả `permission-denied`, listener bỏ qua, nên danh sách điểm danh thiếu.

### 3. Tab Đã nghỉ bị kẹt loading

V4D6 đã chặn danh sách tạm, nhưng chưa ép render lại sau khi `ensureQuitProfilesAuthoritative()` hoàn tất. Kết quả UI vẫn đứng ở loading dù full sync có thể đã xong.

## Sửa đổi chính

### Firestore Rules

- Thêm alias branch trong Rules cho CS1–CS10:
  - `CS2`, `CS02`, `CS 2`, `Cơ sở 2`, `Co so 2`, `2`.
- Rules cũng chấp nhận tên cơ sở tùy chỉnh từ `settings/main_config.branchNameN`.
- `assignedBranch(data)` giờ ưu tiên đủ các field:
  - `branchCode`
  - `branch`
  - `coachBranch`
  - `branchName`
- Thêm rule create cho `login_history/{docId}`.

### Coach profile listener

- Coach fallback query không còn chỉ query `branch`.
- Fallback query lần lượt thử các field:
  - `branch`
  - `branchCode`
  - `coachBranch`
  - `branchName`
- Mỗi field dùng đầy đủ alias của cơ sở.
- Nếu một spec bị `permission-denied`, hệ thống log lại nhưng tiếp tục thử spec khác, không dừng toàn bộ fallback.

### Attendance service

- Daily attendance `loadByDate()` query theo nhiều branch fields/aliases và dedupe theo document id.
- `loadCoachNotes()` cũng dùng branch alias query.
- Khi ghi attendance, service ghi cả:
  - `branch`
  - `branchCode`

### Branch identity

- `branchIdentity.js` hỗ trợ normalize:
  - `CS02`
  - `CS 2`
  - `Cơ sở 2`
  - `Co so 2`
  - `2`
  - tên cơ sở tùy chỉnh trong config.

### Đã nghỉ

- Khi full authoritative sync hoàn tất, `renderQuitList()` được gọi lại để thoát khỏi trạng thái loading.
- Nếu fallback `loadQuitProfilesIfNeeded()` hoàn tất, cũng tự render lại tab Đã nghỉ.

## Cache bust

Build marker mới:

`coach-roster-hydration-rules-repair-20260630-v4d9`

Đã đồng bộ root và thư mục `public/`.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:quit-mobile-coach-attendance-repair` — PASS 21/21
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25

## Lưu ý triển khai bắt buộc

1. Upload bản web V4D7.
2. Deploy `firestore.rules` đi kèm bản này.
3. Xóa cache/PWA cache trên mobile hoặc mở tab ẩn danh.
4. Đăng nhập lại HLV và kiểm tra tab Điểm danh.

Nếu chưa deploy Rules, lỗi `permission-denied` vẫn còn dù đã upload code web.

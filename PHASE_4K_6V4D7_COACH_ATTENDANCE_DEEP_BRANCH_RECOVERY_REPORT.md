# Phase 4K-6V4D7 — Coach Attendance Deep Branch Recovery

## Mục tiêu
Tìm sâu nguyên nhân khiến tài khoản HLV điểm danh vẫn không load được hoặc load thiếu danh sách võ sinh tại cơ sở được giao, sau nhiều lần sửa trước đó.

## Kết luận nguyên nhân gốc

### 1. Không phải lỗi cần mở Firestore public
Log `resolveActiveDataSource Permission denied — không mở Firestore Rules public` là dấu hiệu HLV không được phép đọc full collection. Điều này đúng về bảo mật. Không nên mở public/full club cho HLV.

Bản V4D6 đã chuyển HLV sang `coach-scoped`, nhưng danh sách vẫn thiếu vì nguyên nhân sâu hơn nằm ở định danh cơ sở và field dữ liệu legacy.

### 2. Hệ thống chỉ đọc/lọc theo `profile.branch`, trong khi dữ liệu thật có nhiều field cơ sở khác nhau
Dữ liệu võ sinh cũ có thể lưu cơ sở ở các field như:

- `branch`
- `branchCode`
- `coachBranch`
- `branchName`
- `facility`
- `base`
- `coso`
- `coSo`
- `location`

Các bản trước chủ yếu query `branch == CSx`. Vì vậy nếu võ sinh thuộc cơ sở được giao nhưng dữ liệu lưu là `branchName`, `coSo`, hoặc `branchCode`, HLV sẽ không đọc được hồ sơ đó.

### 3. Tên cơ sở cấu hình không được normalize về mã CS
Có trường hợp HLV được giao `CS2`, nhưng hồ sơ võ sinh lưu `branch = Nguyễn Trãi` hoặc một tên cơ sở trong `branchName2`. Listener có thể đọc được một phần, nhưng tab Điểm danh lại lọc bằng `BranchIdentity.isSameBranch()`. Hàm này trước đó chưa map tên cơ sở cấu hình về `CS2`, nên võ sinh đọc được vẫn bị lọc rớt khi render.

### 4. Firestore Rules chỉ cho HLV đọc khi `resource.data.branch` khớp
Nếu hồ sơ legacy dùng `branchName`, `branchCode`, `coSo`, hệ thống client có query đúng cũng vẫn có thể bị Rules chặn vì Rules cũ chỉ so `resource.data.branch`. Đây là nguyên nhân khiến HLV vẫn trắng danh sách trong một số CLB.

### 5. Legacy fallback trong `app.js` vẫn thiếu branch-field compatibility
Khi `main.js` hoặc profile module nạp chậm, fallback cũ chỉ query field `branch`, nên vẫn bỏ sót dữ liệu legacy.

## Các phương án đã đánh giá

### Phương án A — Migration toàn bộ dữ liệu về chuẩn `branch = CSx`
- Ưu điểm: sạch nhất, lâu dài nhất.
- Nhược điểm: cần backup/migration, có rủi ro thao tác sai dữ liệu, không phù hợp nếu muốn sửa nhanh trên gói hiện tại.

### Phương án B — Runtime compatibility + Rules compatibility theo branch fields
- Ưu điểm: sửa đúng nguyên nhân ngay, không cần migration, không mở full-club reads, vẫn an toàn theo cơ sở được giao.
- Nhược điểm: nhiều query branch-field hơn cho HLV, nhưng chỉ trong đúng cơ sở được giao và các alias, không đọc toàn CLB.

### Phương án C — Tạm mở Rules hoặc cho HLV đọc full club rồi lọc client
- Ưu điểm: dễ làm thấy dữ liệu nhanh.
- Nhược điểm: sai bảo mật, tăng reads, HLV có thể đọc dữ liệu ngoài cơ sở. Không chọn.

## Phương án đã chọn
Chọn **Phương án B**: vá runtime + rules để HLV đọc đúng mọi dữ liệu cơ sở legacy, nhưng vẫn bị khóa trong phạm vi cơ sở được giao.

## Sửa đổi chính trong V4D7

### BranchIdentity
- Thêm normalize tên cơ sở cấu hình `branchName1..branchName10` về mã `CS1..CS10`.
- Ví dụ: `Nguyễn Trãi` trong `branchName2` sẽ được xem như `CS2`.

### Attendance module
- Không còn lọc chỉ bằng `p.branch`.
- Thêm `_profileBranchValue()` để nhận diện cơ sở từ nhiều field legacy: `branch`, `branchCode`, `branchName`, `coachBranch`, `facility`, `base`, `coso`, `coSo`, `location`.
- Tab Điểm danh lọc bằng branch extracted + canonical branch identity.

### Profiles listener cho HLV
- Tạo `_coachProfileQuerySpecs()` để query an toàn theo nhiều branch fields.
- HLV vẫn không được full-club fallback.
- Mỗi query vẫn là equality query theo đúng cơ sở/alias được giao.

### Firestore Rules
- Thêm `resourceProfileBranchMatchesCoach()` cho `profiles` và `students`.
- HLV được đọc hồ sơ nếu một trong các branch fields của hồ sơ khớp với cơ sở được Admin giao.
- Attendance writes vẫn yêu cầu canonical `branch`, không nới lỏng ghi điểm danh.

### Legacy app fallback
- Khi profile module chưa sẵn, `app.js` cũng dùng branch-field safe specs, không còn chỉ query `branch`.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:v4d4-coach-quit-authoritative-fix` — PASS 17/17
- `npm run check:v4d5-coach-quit-attendance-full-recovery` — PASS 12/12
- `npm run check:v4d6-coach-attendance-root-cause-recovery` — PASS 12/12
- `npm run check:v4d7-coach-attendance-deep-branch-recovery` — PASS 13/13
- `npm run check` — PASS toàn bộ pipeline

## Lưu ý triển khai
Bản này có sửa `firestore.rules`. Cần deploy cả Hosting/source và Firestore Rules. Nếu chỉ upload source mà không deploy Rules, HLV vẫn có thể không đọc được các hồ sơ lưu branch ở field legacy như `branchName`, `branchCode`, `coSo`.

Sau deploy, nên mở tài khoản HLV bằng tab ẩn danh hoặc xóa cache site một lần để chắc chắn trình duyệt không giữ bundle cũ.

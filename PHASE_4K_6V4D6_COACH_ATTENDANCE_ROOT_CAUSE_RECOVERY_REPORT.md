# Phase 4K-6V4D7 — Coach Attendance Root-Cause Recovery

## Mục tiêu
Sửa lỗi tài khoản HLV điểm danh vẫn không load đủ danh sách võ sinh trong cơ sở được giao, đặc biệt khi console có lỗi:

```text
[resolveActiveDataSource] ❌ Permission denied — không mở Firestore Rules public
```

## Nguyên nhân đã xác định

### 1. `resolveActiveDataSource()` đang chạy probe dành cho Admin trên tài khoản HLV
`resolveActiveDataSource()` kiểm tra các collection toàn CLB như:

- `clubs/{clubId}/profiles`
- `clubs/{clubId}/transactions`
- `clubs/{clubId}/inventory`
- legacy root collections

Với HLV, Firestore Rules đúng là phải chặn các collection tài chính/kho/full-club. Vì vậy `permission-denied` ở đây là hành vi bảo mật đúng, nhưng runtime lại ghi lỗi đỏ và có thể làm người vận hành tưởng cần mở Rules public. Bản V4D6 sửa thành `coach-scoped`: HLV không probe full-club, chỉ đi theo luồng scoped theo cơ sở.

### 2. `main.js` phụ thuộc tĩnh vào `finance.js`, trong khi HLV không cần tài chính
`main.js` import tĩnh `finance.js`; `finance.js` import `finance.service.js`. Nếu service này bị stale cache/503, module graph của `main.js` có thể bị abort hoặc nạp không hoàn chỉnh. Khi đó `mountActiveProfilesListener()` không sẵn, làm HLV rơi vào fallback thiếu/không ổn định.

V4D6 tách finance khỏi bootstrap bắt buộc: Coach attendance-only không load finance module; Admin/Owner/Viewer vẫn lazy-load finance khi cần.

### 3. Alias cơ sở phụ thuộc `settings/main_config` nhưng listener võ sinh mount trước khi settings về
Nhiều hồ sơ cũ có thể lưu `branch` bằng tên cơ sở hiển thị, ví dụ `Nguyễn Trãi`, thay vì `CS2`. `BranchIdentity.aliases()` chỉ biết tên cơ sở sau khi `settings/main_config` load xong. Nhưng listener HLV lại mount trước settings snapshot, nên lần đầu có thể chỉ query `CS2`, bỏ sót hồ sơ đang lưu `Nguyễn Trãi`.

V4D6 thêm reconcile sau settings: sau khi `branchName1..10` có dữ liệu, HLV chạy lại branch-safe fallback theo toàn bộ alias cơ sở được giao, không đọc full CLB.

### 4. Cache-bust service cũ vẫn còn trong `students.js`
`students.js` vẫn còn import `students.service.js?v=firestore-read-attribution-canonical-tx-boundary-20260616-v3a`. Điều này làm thiết bị dễ giữ service cũ. V4D6 đổi cache-bust cho `students.service.js` và `finance.service.js` sang cùng build mới.

## Sửa đổi chính

- `resolveActiveDataSource()` nhận diện HLV và trả về `source: 'coach-scoped'`, không probe full-club/finance/kho.
- `runRuntimeDataRecovery()` xem `coach-scoped` là trạng thái hợp lệ, không báo `permission-error`.
- `main.js` không còn import tĩnh `finance.js`; finance được lazy-load cho tài khoản không phải HLV.
- HLV attendance-only bỏ qua finance module, nên lỗi `finance.service.js 503` không còn làm hỏng luồng điểm danh.
- Sau `settings/main_config` snapshot, hệ thống gọi `ensureCoachBranchProfilesReady('settings-snapshot-branch-aliases')` để nạp lại danh sách võ sinh đúng cơ sở theo alias cấu hình.
- `profiles.listeners.js` export `ensureCoachBranchProfilesReady()` và `loadCoachBranchProfilesFallback()` để app có thể kích hoạt reconcile đúng thời điểm.
- Cập nhật cache-bust cho `finance.service.js` và `students.service.js` sang `coach-attendance-deep-branch-recovery-20260630-v4d7`.
- Đồng bộ `public/` mirror cho bản deploy hosting.

## Không thay đổi / không mở rộng quyền nguy hiểm

- Không mở Firestore Rules public.
- Không cho HLV đọc full club profiles.
- Không cho HLV đọc transactions/inventory/stats.
- Không thay đổi luồng Admin tài chính/kho ngoài việc lazy-load finance module.
- Coach fallback chỉ query `branch == alias` trong cơ sở được giao.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:v4d1a-runtime-recovery` — PASS 22/22
- `npm run check:v4d4-coach-quit-authoritative-fix` — PASS 17/17
- `npm run check:v4d5-coach-quit-attendance-full-recovery` — PASS 12/12
- `npm run check:v4d6-coach-attendance-root-cause-recovery` — PASS 12/12

`npm run check` đã chạy qua phần lớn pipeline và không có test fail; do pipeline quá dài nên tool bị timeout ở cuối. Các nhóm còn lại sau điểm timeout đã được chạy riêng và đều PASS.

## Ghi chú deploy

Sau khi upload bản này lên hosting, cần xóa cache site hoặc mở tab ẩn danh trên máy HLV để tránh trình duyệt giữ bundle V4D5 cũ. Lỗi `Permission denied — không mở Firestore Rules public` trong `resolveActiveDataSource` không nên xuất hiện nữa với HLV; nếu vẫn thấy, nghĩa là trình duyệt còn cache bản cũ.

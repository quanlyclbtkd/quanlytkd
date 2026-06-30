# Phase 4K-6V4D6 — Quit Mobile Full Sync + Coach Attendance Login Repair

## Mục tiêu

Sửa chính xác 2 lỗi còn tồn tại:

1. Mobile/web không truy cập được đầy đủ danh sách võ sinh trong tab **Đã nghỉ**.
2. Tài khoản **HLV điểm danh** không đăng nhập được hoặc đăng nhập xong không thấy đúng danh sách võ sinh tại cơ sở được phân công.

## Nguyên nhân gốc đã xác định

### 1. Tab Đã nghỉ vẫn thiếu danh sách

Các bản trước vẫn còn đường tải dữ liệu nhanh/targeted cho Đã nghỉ. Đường này có thể trả về trước full-sync và ghi vào `quitProfiles`, làm hệ thống tưởng danh sách đã đủ trong khi thực tế chỉ là danh sách tạm.

Trên mobile lỗi dễ xuất hiện hơn vì render tab chậm hơn, chuyển tab nhanh hơn và cache cũ dễ bị giữ lại.

### 2. HLV không đăng nhập được

Luồng HLV phụ thuộc vào mirror phân quyền `users/{uid}`. Với tài khoản HLV cũ, có thể tồn tại hồ sơ trong `clubs/{clubId}/coaches/{uid}` nhưng thiếu/sai `users/{uid}`, `branch`, hoặc `coachBranch`.

Ngoài ra, runtime repair trước đó có thể ném lỗi nếu ghi mirror thất bại. Khi đó HLV bị chặn đăng nhập dù hệ thống vẫn có thể xác định được club/cơ sở từ hồ sơ Coach do Admin quản lý.

### 3. HLV đăng nhập nhưng không thấy danh sách điểm danh đúng cơ sở

Nguồn profile cho Điểm danh vẫn có trường hợp đọc từ source cục bộ chưa đủ. Nếu `studentProfileStore` đã hydrate danh sách đúng nhưng `attendance.js` chỉ đọc một phần từ `__store.profiles`, danh sách điểm danh có thể trống hoặc thiếu.

## Sửa đổi chính

### Tab Đã nghỉ

- Gỡ bỏ đường targeted/partial query làm nguồn cuối cho Đã nghỉ.
- `loadQuitProfilesIfNeeded()` với Admin luôn đi qua `ensureQuitProfilesAuthoritative()`.
- Thêm single-flight `quitAuthoritativePromise` để chỉ có một full-sync Đã nghỉ chạy cùng lúc.
- Không cho targeted/partial data ghi đè full-sync.
- `isQuitProfilesLoaded()` với Admin chỉ trả true khi `quitCompletenessReconciled === true`.
- `renderQuitIsland()` không render danh sách tạm; khi chưa đủ dữ liệu sẽ hiện trạng thái đang đối soát đầy đủ.
- Sau khi full-sync xong, render trực tiếp danh sách authoritative đầy đủ, không dùng cache/pagination cũ.
- Bỏ load-more/page-limit cho Đã nghỉ trên cả web và mobile.

### HLV đăng nhập

- Thêm chỉ mục khôi phục đăng nhập `coach_login_index/{uid}`.
- Auth fallback đọc `coach_login_index/{uid}` khi `users/{uid}` bị thiếu/stale.
- Tạo HLV mới ghi đồng thời:
  - `clubs/{clubId}/coaches/{uid}`
  - `users/{uid}`
  - `coach_login_index/{uid}`
- Đồng bộ HLV cũ refresh cả `users/{uid}` và `coach_login_index/{uid}`.
- Runtime branch repair không còn chặn đăng nhập nếu đã xác định được branch hợp lệ nhưng ghi mirror bị lỗi tạm thời.
- Firestore Rules cho phép HLV tự đọc/sửa mirror đăng nhập an toàn khi dữ liệu khớp hồ sơ Coach do Admin quản lý.

### HLV điểm danh đúng cơ sở

- `attendance.js` merge profile từ `studentProfileStore.getAllProfilesCompat()`, `window.allProfiles`, và `__store.profiles`.
- Giữ các gate branch-scoped cho Coach: HLV chỉ mount Attendance, query theo branch được phân công, thiếu branch thì fail-closed không query.

## Cache bust

Build marker mới:

`quit-mobile-coach-attendance-repair-20260630-v4d6`

Đã đồng bộ cả root và `public/`.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS.
- `npm run check:quit-mobile-coach-attendance-repair` — PASS 17/17.
- `npm run check:quit-tab-mobile-parity` — PASS 17/17.
- `npm run check:coach-branch-runtime-repair` — PASS 25/25.
- `npm run check:security-coach-branch-boundary` — PASS 35/35.
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30.

## Việc cần làm khi triển khai

1. Upload toàn bộ bản V4D6 lên hosting/GitHub.
2. Deploy file `firestore.rules` đi kèm bản này.
3. Đăng nhập Admin/SuperAdmin và chạy đồng bộ/tự sửa tài khoản HLV cũ một lần.
4. Trên điện thoại, mở tab ẩn danh hoặc xóa cache/PWA cache một lần để chắc chắn không giữ bundle cũ.

Nếu chỉ upload web nhưng chưa deploy `firestore.rules`, lỗi HLV vẫn có thể còn do Firestore trả `permission-denied` khi tự khôi phục mirror.

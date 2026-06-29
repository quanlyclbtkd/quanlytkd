# Phase 4K-6V4D5 — Quit Mobile Full Sync + Coach Login Repair

## Mục tiêu

Sửa dứt điểm hai lỗi còn tồn tại sau V4D4:

1. Tab **Đã nghỉ** trên web/mobile vẫn không hiển thị đầy đủ danh sách võ sinh đã báo nghỉ/nghỉ tập.
2. Tài khoản **HLV điểm danh** không đăng nhập được hoặc đăng nhập xong không hydrate đúng quyền/cơ sở.

## Nguyên nhân gốc

### 1. Đã nghỉ bị thiếu danh sách

V4D4 đã có full authoritative sync, nhưng vẫn còn rủi ro race-condition:

- Query nhanh/targeted quit có thể trả về một phần dữ liệu trước.
- Full sync chạy chậm hơn trên mobile hoặc khi chuyển tab nhanh.
- Kết quả targeted cũ vẫn có thể ghi đè lên trạng thái `quitProfiles` sau đó.
- UI chỉ nhìn `quitLoaded` nên có lúc xem danh sách tạm là danh sách cuối.

Kết quả: web và mobile đều có thể chỉ thấy một phần võ sinh đã nghỉ.

### 2. HLV không đăng nhập được

Luồng đăng nhập Coach phụ thuộc nhiều vào `users/{uid}` mirror. Với tài khoản HLV cũ, có thể tồn tại `clubs/{clubId}/coaches/{uid}` nhưng thiếu/stale:

- `users/{uid}`
- `branch`
- `coachBranch`

Khi mirror thiếu hoặc branch không hợp lệ, runtime fail-closed nên HLV bị chặn đăng nhập hoặc không có dữ liệu điểm danh.

## Sửa đổi chính

### Đã nghỉ

- Thêm single-flight `quitAuthoritativePromise` để chỉ có một full sync Đã nghỉ chạy tại một thời điểm.
- `loadQuitProfilesIfNeeded()` của Admin ưu tiên ép chạy `ensureQuitProfilesAuthoritative()` trước, không dùng targeted query làm nguồn cuối.
- Targeted query không được phép ghi đè nếu full authoritative sync đã hoàn tất hoặc đang chạy.
- `renderQuitIsland()` không render danh sách tạm như danh sách thật. Khi chưa đủ dữ liệu, UI hiển thị trạng thái đang đối soát.
- Chỉ render danh sách cuối khi `quitLoaded === true` và `quitCompletenessReconciled === true`.
- Bỏ page-limit/load-more cũ cho tab Đã nghỉ trên web và mobile.

### HLV đăng nhập

- Thêm `coach_login_index/{uid}` làm chỉ mục đăng nhập an toàn cho Coach.
- Auth context có fallback đọc `coach_login_index/{uid}` nếu `users/{uid}` thiếu/stale.
- Tạo HLV mới ghi đồng thời:
  - `clubs/{clubId}/coaches/{uid}`
  - `users/{uid}`
  - `coach_login_index/{uid}`
- Đồng bộ tài khoản HLV cũ refresh cả `users/{uid}` và `coach_login_index/{uid}`.
- Runtime branch repair luôn refresh cả hai mirror phân quyền.
- Firestore Rules cho phép Coach tự đọc index của chính mình và tự sửa mirror an toàn khi khớp hồ sơ Coach do Admin quản lý.

## Cache bust

Build marker mới:

`quit-mobile-coach-login-repair-20260629-v4d5`

Đã đồng bộ cả root và thư mục `public/`.

## Kiểm tra đã chạy

Các gate trọng tâm đã PASS:

- `npm run check:syntax`
- `npm run check:mobile-small-ui-recovery`
- `npm run check:quit-mobile-authoritative-local-sync`
- `npm run check:quit-authoritative-full-sync`
- `npm run check:coach-branch-runtime-repair`
- `npm run check:security-coach-branch-boundary`
- `npm run check:quit-tab-mobile-parity`
- `npm run check:profile-canonical-store`
- `npm run check:v4d1a-runtime-recovery`
- `npm run check:active-skipped-month-section`

Ghi chú: full `npm run check` chain chạy qua các gate chính nhưng chain bị treo ở đoạn kiểm tra Đã nghỉ cũ trong môi trường local, nên không ghi nhận là full-chain complete. Các gate liên quan trực tiếp đến lỗi này đã được chạy riêng và PASS.

## Lưu ý triển khai

Để sửa lỗi HLV đăng nhập trên Firebase thật, cần:

1. Upload web bản V4D5.
2. Deploy `firestore.rules` đi kèm bản này.
3. Đăng nhập Admin/SuperAdmin và chạy nút đồng bộ/tự sửa tài khoản HLV cũ một lần.
4. Cho HLV đăng xuất, mở lại bằng tab ẩn danh hoặc xóa cache rồi đăng nhập lại.

Nếu chỉ upload web mà chưa deploy Rules, Coach có thể vẫn bị `permission-denied` khi tự khôi phục mirror đăng nhập.

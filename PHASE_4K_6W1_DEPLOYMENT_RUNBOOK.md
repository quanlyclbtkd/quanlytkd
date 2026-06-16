# Phase 4K-6W1 — Deployment Runbook

## Mục tiêu

Thực thi khóa CLB và hạn sử dụng tại Firestore Rules, thay vì chỉ dựa vào giao diện. `expiryDate` vẫn dùng để hiển thị; `expiryAt` (Firestore Timestamp) là nguồn quyết định bảo mật và được so sánh với `request.time`.

## Nguyên tắc bắt buộc

- Không deploy Firestore Rules 6W1 trước khi tất cả CLB hợp lệ đã có `expiryAt`.
- Không dùng đồng hồ trình duyệt để quyết định CLB còn hạn.
- Gia hạn chỉ sửa `expiryDate` và `expiryAt`; không tự mở khóa.
- Khóa/mở khóa chỉ sửa `accountStatus`; mở khóa yêu cầu `expiryAt` còn hiệu lực.
- Lock được Rules thực thi ngay. Cloud Function thu hồi refresh token để buộc các phiên cũ đăng nhập lại.
- Luôn backup Firestore trước migration/deploy.

## Thứ tự triển khai production

### 1. Backup và chốt baseline

1. Xuất backup Firestore hoặc xác nhận backup gần nhất có thể khôi phục.
2. Lưu danh sách CLB, `accountStatus`, `expiryDate`, `adminUid`.
3. Chạy tại thư mục dự án:

```bash
npm ci
npm run check
npm run check:6w1
```

### 2. Deploy Cloud Functions trước

```bash
firebase deploy --only functions
```

Xác minh các callable tồn tại:

- `setClubAccountStatus`
- `updateClubSubscription`
- `backfillClubExpiryTimestamp`

### 3. Backfill ở chế độ dry-run

Đăng nhập SuperAdmin trên bản frontend 6W1 hoặc gọi callable bằng công cụ quản trị đã xác thực:

```js
await AccountProvisioningService.backfillClubExpiryTimestamp({
  dryRun: true,
  pageSize: 250
});
```

Điều kiện để tiếp tục:

- `complete === true`
- `invalid === 0`
- `scanned` bằng tổng số CLB dự kiến
- `wouldUpdate` hợp lý
- `readyForRules === false` trước apply nếu còn CLB cần cập nhật

Nếu `invalid > 0`, sửa `expiryDate` của từng CLB được liệt kê rồi chạy lại dry-run. Không chuyển sang apply khi còn ngày không hợp lệ.

### 4. Backfill thật

```js
await AccountProvisioningService.backfillClubExpiryTimestamp({
  dryRun: false,
  pageSize: 250
});
```

Điều kiện bắt buộc:

- `complete === true`
- `invalid === 0`
- `updated + skipped === scanned`
- `readyForRules === true`

Chạy lại dry-run lần cuối. Kết quả phải có `wouldUpdate === 0` và `readyForRules === true`.

### 5. Chạy Rules Emulator

```bash
npm run test:rules
```

Tất cả trường hợp active/locked/expired/missing-expiry/cross-tenant/self-role phải PASS.

### 6. Canary trước khi deploy Rules

Dùng một CLB thử nghiệm:

1. CLB active, còn hạn: Admin/HLV đọc và ghi đúng quyền.
2. Khóa CLB: root club vẫn đọc được để hiển thị lý do; profiles/transactions/attendance bị từ chối.
3. Mở khóa: chỉ thực hiện khi còn hạn; thành viên đăng nhập lại và hoạt động bình thường.
4. Đặt hạn đã qua: dữ liệu nghiệp vụ bị từ chối dù `accountStatus` vẫn active.
5. Gia hạn CLB đang locked: vẫn locked.
6. Mở khóa sau khi gia hạn: hoạt động lại.
7. SuperAdmin vẫn đọc được tenant locked/expired.

### 7. Deploy Firestore Rules

Chỉ thực hiện sau khi các bước 3–6 đạt:

```bash
firebase deploy --only firestore:rules
```

### 8. Deploy frontend

Deploy GitHub Pages hoặc Firebase Hosting theo quy trình hiện tại. Làm mới cache/ẩn danh khi smoke test.

### 9. Giám sát sau deploy

Trong ít nhất một chu kỳ vận hành:

- Theo dõi `permission-denied` bất thường.
- Kiểm tra audit log của lock/unlock/update expiry.
- Kiểm tra số người được thu hồi token và lỗi revoke.
- Kiểm tra CLB hết hạn đúng thời điểm `expiryAt`.
- Không tự sửa Rules để “mở tạm” nếu chưa xác định nguyên nhân.

## Rollback

Nếu Rules gây chặn nhầm:

1. Không xóa `expiryAt` đã backfill.
2. Rollback Firestore Rules về bản 6W đã lưu trong source control/backup.
3. Giữ Cloud Functions 6W1 vì update subscription tương thích ngược và không tự mở khóa.
4. Thu thập CLB bị ảnh hưởng và log `permission-denied`.
5. Sửa Rules/test, chạy emulator lại rồi mới redeploy.

## Tiêu chí hoàn tất

- Tất cả CLB có `expiryAt` timestamp hợp lệ.
- `npm run check`, `npm run check:all`, `npm run check:all:critical`, `npm run test:rules` đều PASS.
- Khóa tenant chặn dữ liệu ở Rules, không chỉ ẩn giao diện.
- Gia hạn không tự mở khóa.
- Mở khóa không thay đổi ngày hết hạn.
- Không có mật khẩu/token trong logs hoặc audit docs.

# Phase 4K-6W Deployment Runbook

## Mục tiêu

Triển khai Secure Account Provisioning, xóa mật khẩu dạng rõ và khóa quyền sửa `role/clubId` mà không làm gián đoạn đăng nhập.

## Thứ tự bắt buộc

Không deploy `firestore.rules` trước Cloud Functions. Rules 6W chặn client tự tạo/sửa tài khoản; các callable phải hoạt động trước.

### 1. Sao lưu

- Xuất backup Firestore hoặc tạo bản sao dự án trước khi triển khai.
- Ghi lại số CLB và số tài khoản Admin/HLV.
- Không sao chép hoặc ghi mật khẩu vào log kiểm tra.

### 2. Cài dependencies Functions

```bash
cd functions
npm install
npm run lint
cd ..
```

### 3. Deploy Cloud Functions trước

```bash
firebase deploy --only functions
```

Các callable mới:

- `provisionClubAdmin`
- `provisionCoachAccount`
- `replaceClubAdmin`
- `removeCoachAccount`
- `migrateCoachAccounts`
- `repairCurrentAccountMembership`
- `purgeLegacyCredentialFields`
- `setClubAccountStatus`
- `updateClubSubscription`

### 4. Canary với một CLB

Trên tài khoản SuperAdmin:

1. Tạo một CLB thử.
2. Kiểm tra email thiết lập mật khẩu được gửi.
3. Đặt mật khẩu từ email và đăng nhập Admin CLB.
4. Tạo một HLV thử.
5. Đặt mật khẩu và đăng nhập HLV.
6. Kiểm tra HLV chỉ nhìn thấy đúng CLB/cơ sở.
7. Xóa HLV thử và xác nhận không đăng nhập lại được.
8. Cấp lại Admin thử và xác nhận Admin cũ bị vô hiệu hóa.

### 5. Đồng bộ tài khoản cũ

Mỗi Admin CLB dùng nút **Đồng bộ tài khoản HLV cũ**. Callable server sẽ chuẩn hóa `users/{uid}` và `clubs/{clubId}/coaches/{uid}`.

Tài khoản thiếu `users/{uid}` khi đăng nhập sẽ gọi `repairCurrentAccountMembership`; server chỉ cấp quyền sau khi xác minh `adminEmail` hoặc hồ sơ HLV khớp.

### 6. Xóa mật khẩu dạng rõ

Đăng nhập SuperAdmin, mở Console của trình duyệt và chạy đúng một lần:

```javascript
await window.AccountProvisioningService.purgeLegacyCredentialFields()
```

Kết quả chỉ trả số lượng đã quét/xóa, không trả hoặc log nội dung mật khẩu.

Sau đó kiểm tra ngẫu nhiên vài document `clubs/{clubId}` và xác nhận không còn:

- `adminPassword`
- `coachPassword`
- `temporaryPassword`
- `passwordChangedAt`

### 7. Deploy Firestore Rules

Chỉ thực hiện sau khi callable và canary đã đạt:

```bash
firebase deploy --only firestore:rules
```

Rules 6W:

- Chặn client tạo/xóa `users`.
- Chặn user tự đổi `role`, `clubId`, `branch`, `email`, `status`.
- Chặn client ghi collection `coaches`.
- Chặn Club Admin sửa trường SaaS nhạy cảm của document CLB.
- Chặn client ghi `audit_logs` và `account_provisioning_requests`.
- Không có catch-all cho phép ghi subcollection.

### 8. Deploy giao diện

Firebase Hosting:

```bash
firebase deploy --only hosting
```

Hoặc upload toàn bộ nội dung ZIP lên GitHub Pages. Lưu ý: GitHub Pages chỉ cập nhật giao diện; Cloud Functions và Firestore Rules vẫn phải deploy bằng Firebase CLI.

### 9. Smoke test production

- SuperAdmin tạo CLB mới.
- Admin mới nhận email và đặt mật khẩu.
- Admin tạo HLV.
- HLV đăng nhập và điểm danh.
- Admin đổi mật khẩu của chính mình.
- SuperAdmin gửi email đặt lại mật khẩu.
- Khóa/mở khóa CLB.
- Gia hạn CLB.
- Thu học phí, Thu gộp khoản, Kho đồ, Thi đai và Xác nhận thăng đai.
- Logout/login và đổi CLB thử nghiệm.

## Rollback

Nếu callable lỗi trước khi deploy rules:

- Redeploy bản Phase 4K-6V giao diện.
- Không deploy rules 6W.

Nếu rules đã deploy và cần rollback khẩn cấp:

1. Giữ Functions 6W đang hoạt động.
2. Redeploy rules trước đó trong thời gian ngắn.
3. Sửa callable hoặc dữ liệu membership.
4. Chạy lại canary rồi deploy rules 6W.

Không khôi phục các field mật khẩu đã xóa.

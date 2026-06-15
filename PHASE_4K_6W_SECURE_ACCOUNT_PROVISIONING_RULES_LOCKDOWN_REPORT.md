# Phase 4K-6W — Secure Account Provisioning + Credential Eradication + Firestore Rules Lockdown

## 1. Phạm vi đã thực hiện

Phase này xử lý rủi ro bảo mật lớn nhất còn lại: client tự tạo tài khoản, tự ghi `role/clubId`, lưu mật khẩu Admin dạng rõ và Firestore Rules cho phép user tự sửa toàn bộ hồ sơ quyền hạn.

Không thay đổi nghiệp vụ Học phí, Thu gộp khoản, Kho đồ, Thi Đai, Điểm danh, listener, `renderApp` hoặc Firestore schema nghiệp vụ.

## 2. Kiến trúc mới

### Cloud Functions/Admin SDK

Tạo `functions/src/accountProvisioning.js` với các callable:

- `provisionClubAdmin`
- `provisionCoachAccount`
- `replaceClubAdmin`
- `removeCoachAccount`
- `migrateCoachAccounts`
- `repairCurrentAccountMembership`
- `purgeLegacyCredentialFields`
- `setClubAccountStatus`
- `updateClubSubscription`

Mỗi callable:

- Bắt buộc đăng nhập.
- Kiểm tra SuperAdmin hoặc Club Admin trên server.
- Validate email, clubId, requestId và phạm vi tenant.
- Có idempotency request document để chống bấm hai lần.
- Ghi audit log không chứa mật khẩu/token.
- Không trả mật khẩu về client.

### Client facade

Tạo `js/services/accountProvisioningService.js`:

- Dùng `httpsCallable` tại region `asia-southeast1`.
- Chống gọi trùng bằng shared in-flight promise.
- Chỉ gửi email thiết lập/đặt lại mật khẩu sau khi server tạo tài khoản.
- Không nhận, lưu, log hoặc hiển thị mật khẩu.

## 3. Xóa credential plaintext

Đã loại bỏ khỏi frontend:

- `adminPassword: pass`
- `adminPassword: newPass`
- Hiển thị/ẩn mật khẩu trong bảng SuperAdmin.
- Đồng bộ mật khẩu mới từ Firebase Auth sang Firestore.
- Trường nhập “Mật khẩu cấp phát” khi tạo CLB/HLV.

Callable `purgeLegacyCredentialFields` xóa an toàn các field cũ bằng `FieldValue.delete()` và chỉ trả số lượng đã xử lý.

## 4. Secure account flows

### Tạo CLB

SuperAdmin gửi Tên CLB, Mã CLB, Email Admin, số cơ sở và logo. Server tạo Auth user không có plaintext password, tạo `users/{uid}`, `clubs/{clubId}` và settings. Client gửi email để Admin tự thiết lập mật khẩu.

### Tạo HLV

Admin CLB chỉ có thể tạo HLV cho đúng `clubId` của mình. Server tạo Auth + membership docs; client gửi email thiết lập mật khẩu.

### Cấp lại Admin

Server tạo/xác minh Admin mới, cập nhật `adminUid/adminEmail`, xóa field mật khẩu cũ và vô hiệu hóa Admin cũ.

### Xóa HLV

Server xóa membership và Firebase Auth user. Client không còn tự xóa `users/{uid}`.

### Khôi phục membership cũ

Khi `users/{uid}` chưa tồn tại, callable `repairCurrentAccountMembership` chỉ cấp role sau khi server xác minh email khớp `clubs.adminEmail` hoặc hồ sơ `coaches`.

## 5. Firestore Rules 6W

- Client không được tạo/xóa `clubs` hoặc `users`.
- User chỉ tự sửa allowlist: `displayName`, `photoURL`, `phone`, `lastSeenAt`, `updatedAt`.
- `role`, `clubId`, `branch`, `email`, `status` là server-owned.
- Club Admin không được sửa `adminUid`, `adminEmail`, credential fields, `accountStatus`, `expiryDate`, plan/license và quota.
- Collection `coaches` chỉ đọc theo quyền; mọi write chạy qua Admin SDK.
- `audit_logs` và `account_provisioning_requests` là server-only.
- Đã loại bỏ permissive subcollection catch-all để tránh rules OR bypass.

## 6. Ảnh hưởng kích thước

| Chỉ số | Phase 4K-6V | Phase 4K-6W |
|---|---:|---:|
| `app.js` | 642.994 bytes | 639.631 bytes |
| Số dòng `app.js` | 10.344 | 10.245 |
| Giảm | — | 3.363 bytes / 99 dòng |

Phase này ưu tiên security boundary; Functions tăng thêm do chuyển logic đặc quyền sang server.

## 7. Kiểm tra

- Syntax: 108 JavaScript files + 8 inline scripts — PASS.
- `npm run check` — PASS.
- `npm run check:all` — PASS.
- `npm run check:all:critical` — PASS.
- Security gate mới: 79 assertions — PASS.
- Functions lint/syntax — PASS.
- Tenant isolation — PASS.
- Deploy contract/package/GitHub Pages paths — PASS.

## 8. Điều kiện triển khai

Mã nguồn hoàn chỉnh không đồng nghĩa callable/rules đã được deploy lên Firebase. Bắt buộc triển khai theo `PHASE_4K_6W_DEPLOYMENT_RUNBOOK.md`: Functions trước, canary/migration, Rules sau, cuối cùng mới deploy giao diện.

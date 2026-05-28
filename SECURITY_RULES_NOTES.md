# Firestore Security Rules — Ghi Chú & Assumptions

> File này giải thích các quyết định thiết kế và assumptions trong `firestore.rules`.
> Cập nhật khi có thay đổi rules hoặc schema.

## Assumptions về dữ liệu

| Assumption | Chi tiết |
|---|---|
| Mỗi user có một document tại `users/{uid}` | Chứa `clubId` (string) và `role` (string) |
| ClubAdmin role | `role` = `'admin'` hoặc `'owner'` |
| Coach role | `role` = `'coach'` — **cần xác nhận** với app hiện tại |
| Parent role | `role` = `'parent'` — **TODO**: chưa triển khai trong app |
| SuperAdmin | Document tại `super_admins/{uid}` **hoặc** custom claim `role = 'super_admin'` |
| Dữ liệu CLB | Nằm trong `clubs/{clubId}/...` — multi-tenant theo clubId |

## Điều chưa triển khai

- **Parent rules**: Parent chỉ xem dữ liệu con mình. Cần biết field lưu `parentUid` trong student doc.
- **Coach scope**: HLV có ghi điểm danh không? Cần xác nhận scope với business logic.
- **Field-level write restriction**: User tự update profile cần giới hạn field (không tự đổi `role` hay `clubId`).
- **Audit log**: Xóa giao dịch hàng loạt (SuperAdmin) nên đi qua Cloud Function để có audit trail.

## Quy trình test trước khi deploy

```bash
# 1. Cài Firebase CLI nếu chưa có
npm install -g firebase-tools

# 2. Chạy emulator
firebase emulators:start --only firestore

# 3. Chạy rules test suite (cần viết test file riêng)
firebase emulators:exec --only firestore "node test/firestore-rules.test.mjs"
```

## Cảnh báo quan trọng

> ⚠️ **KHÔNG DEPLOY** rules này lên production trước khi:
> 1. Test trên emulator với dữ liệu thực
> 2. Xác nhận role strings khớp với dữ liệu trong Firestore
> 3. Test các flow: Login Admin → đọc CLB → ghi võ sinh → logout
> 4. Test SuperAdmin: đọc toàn bộ clubs, khóa/mở CLB

## Lịch sử

| Phiên bản | Ngày | Mô tả |
|---|---|---|
| Phase 4.0B-3 Baseline | tháng 5/2026 | Tạo lần đầu — deny-by-default + multi-tenant + SuperAdmin |

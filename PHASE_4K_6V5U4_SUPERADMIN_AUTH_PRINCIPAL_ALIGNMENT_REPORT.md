# Phase 4K-6V5U4 — SuperAdmin Auth Principal Alignment

## Root cause

Runtime cũ nhận diện `admin@tstquynhon.com` là `super_admin` hoàn toàn ở client rồi mount SuperAdmin UI ngay, trong khi `firestore.rules` chỉ công nhận Custom Claim `role=super_admin`, `users/{uid}.role=super_admin` hoặc document `super_admins/{uid}`. Khi tài khoản ROOT chưa có một trong ba principal server-authoritative này, UI cho vào ROOT nhưng Firestore từ chối cả `list clubs` và `list login_history` bằng `permission-denied`. Đây là split-brain authorization.

## Fix

- Không mở Firestore public.
- Không cấp quyền đọc CLB trực tiếp bằng email.
- Rules V5U4 chỉ cho đúng Firebase Auth email ROOT tạo/đọc **document principal của chính UID đó** tại `super_admins/{uid}` với payload whitelist nghiêm ngặt.
- Auth flow gọi `_ensureSuperAdminPrincipal(user)` trước khi đặt `window.userRole = super_admin` và trước khi mount SuperAdmin data.
- Sau bootstrap đầu tiên, Rules và Cloud Functions đều nhận SuperAdmin qua canonical `super_admins/{uid}` hiện hữu.
- Nếu production Rules chưa được deploy, login fail closed với hướng dẫn rõ; không còn trạng thái “UI là ROOT nhưng Firestore không phải ROOT”.
- Hướng dẫn `login_history` cũ từng gợi ý `allow write: if request.auth != null` đã được loại bỏ.

## Firestore cost

- Mỗi đăng nhập ROOT: 1 `get` vào `super_admins/{uid}`.
- Chỉ lần đầu khi principal chưa tồn tại: thêm 1 `create`.
- Không thêm listener, không thêm query CLB, không tăng reads cho Admin/Coach.

## Deployment order

1. Deploy `firestore.rules` V5U4.
2. Deploy Hosting V5U4.
3. Đăng xuất ROOT và đăng nhập lại.
4. Xác nhận `super_admins/{uid}` được tạo.
5. Mở Quản lý CLB và Lịch sử đăng nhập.

## Scope safety

Không thay đổi Tuition, Debt, Inventory, Attendance, Exam, student search, canonical command boundaries hay Coach branch Rules.

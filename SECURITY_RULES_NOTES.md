# Firestore Security Rules — Phase 4K-6V4B

> Tài liệu này mô tả security boundary đang được thực thi trong `firestore.rules`.
> Phiên bản này thay thế ghi chú baseline cũ vốn chưa giới hạn quyền Coach và chưa khóa field phân quyền trong `users/{uid}`.

## Mô hình quyền hiện tại

| Vai trò | Phạm vi chính |
|---|---|
| SuperAdmin | Quản trị đa CLB theo custom claim, `users/{uid}.role`, hoặc `super_admins/{uid}` |
| Admin / Owner | Quản trị dữ liệu trong đúng `clubId` của mình |
| Coach | Chỉ đọc võ sinh và đọc/ghi điểm danh thuộc `coachBranch` đã gán |
| Viewer | Chỉ đọc dữ liệu được phép trong đúng CLB; không ghi |
| User bị khóa/vô hiệu hóa | Bị từ chối truy cập dữ liệu CLB |

## Chuẩn cơ sở

- Mã chuẩn cho dữ liệu mới: `CS1` đến `CS10`.
- `Mặc định` chỉ được giữ làm alias tương thích tạm thời của `CS1`.
- Coach bắt buộc có một `coachBranch` hợp lệ; branch rỗng không có nghĩa là “tất cả cơ sở”.
- Coach CS1 được phép đọc dữ liệu cũ có `branch == "Mặc định"` để tránh migration phá vỡ hệ thống.
- Mọi ghi mới từ client được chuẩn hóa về mã `CSx`.

## Bảo vệ document người dùng

Người dùng chỉ được tự cập nhật nhóm field hồ sơ an toàn:

- `displayName`
- `photoURL`
- `phone`
- `preferences`
- `updatedAt`

Người dùng không thể tự thay đổi:

- `role`
- `clubId`
- `coachBranch`
- `status`
- `permissions`
- `isSuperAdmin`

Admin chỉ được tạo/cập nhật tài khoản Coach thuộc chính CLB của mình và phải gán branch hợp lệ.

## Boundary của Coach

Coach được phép:

- Đọc profile/student thuộc đúng branch.
- Đọc và ghi attendance thuộc đúng branch.
- Ghi chú điểm danh của chính mình thuộc đúng branch.
- Đọc một số cấu hình tối thiểu phục vụ điểm danh (`main_config`, `shifts`).

Coach không được phép đọc:

- Transactions/học phí.
- Inventory/kho đồ.
- Costs/chi phí.
- Club stats và dashboard tài chính.
- Exam data.
- Audit logs.
- Collection không khai báo.

## Cloud Functions

Các callable thực hiện thao tác toàn CLB như tính lại công nợ, rebuild stats và refresh SuperAdmin summary phải đi qua `functions/src/authz.js` và yêu cầu Admin/Owner/SuperAdmin ở server-side. Không tin `role` hoặc `clubId` do client gửi lên.

## Kiểm thử bắt buộc trước deploy

```bash
npm install
npm run check
npm run check:rules:emulator
```

Ma trận Emulator phải xác nhận tối thiểu:

1. Coach CS1 đọc được `CS1` và alias `Mặc định`, không đọc được CS2.
2. Coach không đọc được transactions, inventory và stats.
3. Coach không ghi attendance sang branch khác.
4. User không tự nâng role hoặc chuyển club/branch.
5. Admin CLB A không truy cập CLB B.
6. User bị khóa bị từ chối.
7. Collection không xác định bị deny.

## Trình tự rollout

1. Backup dữ liệu và Rules hiện hành.
2. Xác nhận Admin triển khai có `users/{uid}` hợp lệ và lập danh sách branch của toàn bộ Coach.
3. Chạy toàn bộ checker và Rules Emulator.
4. Trong cửa sổ bảo trì: deploy Rules, sau đó Admin chạy “Đồng bộ tài khoản HLV cũ” đến khi số lỗi bằng 0.
5. Canary một Admin và ít nhất hai Coach ở hai cơ sở khác nhau.
6. Chỉ sau khi canary đạt mới deploy Hosting/Functions cho toàn bộ người dùng.

## Hạn chế còn lại

- `settings/main_config` vẫn được Coach đọc để giữ tương thích runtime; nên tách thành `settings/attendance_public` ở phase tiếp theo nếu document hiện chứa dữ liệu ngân hàng/tài chính.
- Alias `Mặc định` tạo thêm một query cho Coach CS1; có thể bỏ sau khi hoàn tất migration branch có kiểm soát.
- Bộ Rules Emulator đã được viết nhưng phải được chạy trên môi trường có thể tải/chạy Firestore Emulator trước production deploy.

## Lịch sử

| Phiên bản | Ngày | Mô tả |
|---|---|---|
| Phase 4.0B-3 Baseline | 05/2026 | Multi-tenant baseline, còn quyền đọc rộng |
| Phase 4K-6V4B | 25/06/2026 | Security-enforced Coach boundary, field-level user protection, canonical branch compatibility |

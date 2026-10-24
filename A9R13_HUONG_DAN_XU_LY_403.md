# A9R13 — Kiểm tra đúng bản ghi bị 403

Bản này sửa lỗi tải lịch sử HLV ở CS1 và bổ sung công cụ xác định đúng nguyên nhân chặn ghi. Nó không tự thay đổi dữ liệu hoặc Rules trên Firebase.

## 1. Dùng source A9R13

Giải nén ZIP đầy đủ vào thư mục riêng, ví dụ `D:\A9R13\source`, sau đó dùng quy trình đưa source hiện tại của anh lên website. Kiểm tra Console:

```javascript
window.APP_BUILD_VERSION
```

Phải là `qr-v11r6-a9r13-member-history-diagnostics-20261024`.

Rules trong A9R13 giống hệt A9R12. Nếu server đã dùng đúng Rules A9R12, không cần deploy lại chỉ vì đổi sang A9R13. Nếu chưa đối chiếu Rules server, kiểm tra với hash và source trong báo cáo; file source trên GitHub không tự cập nhật Rules Firebase.

## 2. Admin kiểm tra đúng mã bị chặn

1. Đăng nhập Admin đúng CLB `tstquynhon_tkd`.
2. Vào Điểm danh → `Đối soát lịch sử cũ`.
3. Dán vào ô `Mã bản ghi điểm danh cần kiểm tra`:

```text
Dương Nguyễn Thanh Phong_2026-10-24_shift_1779176291415
```

4. Bấm `Tải tháng để đối soát`. Khi ô mã có giá trị, ứng dụng chỉ tra đúng một document bằng inspector hiện hữu.
5. Phân loại kết quả:

| Kết quả | Cách xử lý |
|---|---|
| Bản ghi cũ chưa xác minh | Đối chiếu trạng thái đi học, ngày, ca và cơ sở thực tế. Chỉ khi đúng mới nhập cơ sở tại ngày điểm danh và bấm `Xác minh bản ghi này`. |
| Bản ghi đã xác minh | Kiểm tra cơ sở hiển thị có thuộc quyền HLV không; kiểm tra assignment `users` và `coaches`, trạng thái tài khoản, Rules server. Không xác minh lại để che lỗi quyền. |
| Không tìm thấy bản ghi | Không kết luận legacy collision. Kiểm tra tài khoản/CLB/Rules của lần lỗi và mã có chính xác không. Trường hợp document mới đã được kiểm thử là ghi được với Rules A9R12 đúng. |
| Admin cũng bị từ chối | Kiểm tra phiên Admin, CLB và Rules server trước; chưa có căn cứ sửa dữ liệu. |

Nếu dữ liệu cũ sai hoặc không đủ chứng từ, giữ nguyên và xử lý nghiệp vụ trước. Không xác minh hàng loạt từ cơ sở hiện tại của hồ sơ.

## 3. HLV xử lý thao tác đang giữ trên thiết bị

Sau khi Admin đã giải quyết đúng nguyên nhân:

1. Mở lại ngày/cơ sở/ca, rồi chọn `Kiểm tra nhật ký` trên chính thiết bị đang giữ thao tác.
2. Chọn `Xem máy chủ để đối soát`.
3. Nếu trạng thái máy chủ đúng: chọn `Giữ dữ liệu máy chủ`.
4. Nếu cần áp dụng thao tác đã giữ và đã đối chiếu thực tế: chọn `Áp dụng trạng thái trên thiết bị`, đọc xác nhận rồi chấp thuận.
5. Kiểm tra trạng thái được máy chủ xác nhận và mở lại lịch sử.

Bước này tạo revision qua CAS hiện hữu. Các thao tác đang `needs-review` không tự replay sau nâng bản. Không xóa cache/IndexedDB hoặc liên tục bấm điểm danh để thử vượt lỗi.

## 4. Kiểm thử cục bộ tùy chọn

Các kiểm thử đã được chạy và kèm kết quả. Nếu cần lặp lại trên Windows:

```powershell
cd D:\A9R13\source
npm.cmd ci --no-audit --no-fund
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R13-Coach-Attendance-Emulator.ps1
```

Script chỉ dùng project `demo-a9r13-attendance` và loopback, không deploy hoặc ghi Firestore thật. Kết quả mục tiêu: source identity/root-public PASS, CAS 13 PASS, Emulator 22/22 PASS.

Các script A9R11/A9R12 giữ lại để truy vết phiên bản cũ; dùng script A9R13 cho source hiện tại. Các suite trình duyệt bổ sung cần Chromium của Playwright, có thể trỏ bằng `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

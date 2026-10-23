# A9R9 — Bàn giao (test only)

Baseline: A9R8. Các tệp runtime, Rules, Auth/ACL, QR, Finance và Journal giữ nguyên byte-for-byte.

Đã thêm bộ kiểm toán ngoài SPA để đóng các **khoảng trống công cụ** S01 + Journal; **không khẳng định đã đóng dữ liệu thực**.

Kiểm thử: 22/22 unit A9R9, Root/Public PASS, syntax PASS, 21/21 attendance entrypoints, 9/9 attendance write guard.

Chưa có: snapshot server staging fixed-read-time được ký; toàn bộ sao lưu thiết bị/legacy; ACK đối chiếu theo server version; phê duyệt chủ hệ thống; Android/iOS staging acceptance; source re-pin; gate kích thước app.js vẫn FAIL. Không triển khai production.

Cách chạy: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R9-Offline.ps1`

Tuyệt đối không gửi private key, ID token, backup chứa tên võ sinh, số tài khoản, dữ liệu điểm danh thô lên chat. Chỉ gửi báo cáo tổng hợp đã loại thông tin nhận dạng.

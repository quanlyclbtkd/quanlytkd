# Bước cần hoàn tất và quay lại

1. Giữ candidate thử nghiệm này ngoài production. Gói đầu vào được giữ nguyên và có SHA-256. Không dùng public/ thử nghiệm để thay website hiện tại.
2. Chủ hệ thống/Admin kiểm tra trong UI đúng CLB: branchCount, tên cơ sở, branchPaymentAccountMap, bank enabled, đủ tuple và các định danh bank nhất quán. Chỉ cung cấp thông tin che số tài khoản; không gửi token/credentials. Không tự áp migration từ fixture hoặc chọn một ngân hàng mặc định.
3. Duyệt change request tích hợp decoder JavaScript đã kiểm toán và đóng gói local cho Safari, cùng chính sách memo dài/gia đình. jsQR hiện chỉ là dependency kiểm thử. Không thêm CDN/proxy, reader/listener/writer hay encoder/provider mới trong bản V7 này.
4. Trên iPhone xuất chứng cứ: URL app.js/main/students thực đang tải, content hashes, trạng thái cache, owner delegate/exportReceipt, stage và reason; club/role/generation đã che định danh. So với bốn asset công khai đã khớp V4. Không xuất full số tài khoản, tên võ sinh, token hoặc URL VietQR có PII trong log.
5. Trên thiết bị/tenant giả lập đúng cấu hình, bấm hai nút; đo CORS/redirect/HTTP/MIME/timeout, decode nguồn/preview/file tải; kiểm 375/390/430 px, touch, bàn phím, modal đóng/mở, QR cũ sau đổi bank/club/auth. Nếu app ngân hàng được dùng, chỉ kiểm màn hình trước chuyển khoản và không xác nhận giao dịch.
6. Chạy Rules Emulator với các ca adversarial Coach, khép hồ sơ read-cost và hai CSS browser gate; xử lý gate query Coach trong đúng phase được phép. Chạy lại full critical/release mà không sửa expected để ép xanh. Mọi thay đổi finance/Rules cần RED và change request riêng.

Rollback trong sandbox: dùng lại nguyên ZIP V4 đã xác minh hoặc bỏ thư mục làm việc V7, không ghi bù/xóa ledger, không rollback dữ liệu vì không có thay đổi production. Vì chưa deploy nên không có thao tác khôi phục website cần làm ở lượt này. Nếu phase sau triển khai được duyệt, phải giữ artifact website trước deploy và runbook khôi phục static build riêng; không dùng render failure làm lý do thu tiền lại.

Tái lập: Node >=18; Python 3 + Pillow/reportlab cho fixture; công cụ Playwright/Chromium cho component browser. pngjs và jsQR test-only đã kèm; public không có decoder mới. Chạy trong thư mục gốc dự án. Raw command/exit/source SHA nằm trong evidence/final và các bảng JSON. Dữ liệu ở mọi ảnh kiểm thử là giả lập.

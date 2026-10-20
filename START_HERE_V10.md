# V10 — Bản full sửa điểm danh HLV, chỉ dùng kiểm thử

Tài liệu hiện hành: `handoff/v10/BAO_CAO_V10.md`.

Đã sửa bridge clubId của listener HLV và điều kiện lưu nhật ký khi mất mạng thật. Đã ghi nhận chấp thuận READS, khép 5 gate kế thừa và 12 gate cũ bằng kiểm thử hành vi. Nguồn root/public đồng nhất.

**HOLD / TEST ONLY / NO PRODUCTION DEPLOY.** Hai nhóm lỗi S01/O01 vẫn được tái hiện trên chính bản này. Gate phát hành bổ sung chặn chúng; `check:release` và `check:all:critical` phải trả exit 1 ở `check:v10-release-risk-boundary`. Đây là lỗi nghiệp vụ/bảo mật thật, không phải assertion cũ cần đổi để lấy PASS.

Staging cục bộ đã thử giao diện cảm ứng, SDK/Rules Emulator và mất mạng thật trong trình duyệt. Chưa thử điện thoại vật lý/Safari; gọi VietQR live bị môi trường mạng chặn.

Đọc báo cáo và `handoff/v10/REPRODUCE.md` trước khi dùng. Các báo cáo V9 và trước đó trong gói là lịch sử, không phải trạng thái phát hành hiện tại. Không có triển khai, đăng nhập hoặc ghi dữ liệu production trong đợt này.

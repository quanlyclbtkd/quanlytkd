# A9R15 rollback

Trạng thái: **RELEASE_BLOCKED — chưa deploy**. Không có thao tác production để hoàn tác.

1. Giữ nguyên ZIP A9R14 gốc và xác minh SHA-256 `a81478cb6fb50eeed23ece4d0e106c949d73397010d52ead8adff6841bbc5c8a`.
2. Để hủy bản thử cục bộ, dùng một bản giải nén độc lập của ZIP đó. Không áp reverse patch lên workspace có thay đổi khác; không ghi đè bản gốc.
3. Không sửa/xóa attendance, profile, settings hoặc dữ liệu legacy. A9R15 không migrate hay mass-update dữ liệu production.
4. Không đổi historyAuthority, không hạ Journal V4, không xóa IndexedDB/localStorage/pending intents để “reset lỗi”. Dữ liệu cần đối soát tiếp tục được bảo toàn.
5. Rules/indexes A9R15 byte-identical A9R14; không cần rollback server Rules/indexes trong công việc này.
6. Nếu một môi trường staging riêng sau này được chủ hệ thống cho phép dùng bản này, rollback static assets phải dùng toàn bộ build A9R14 tương ứng, kiểm tra root/public và cache identity; không trộn HTML/JS giữa hai build. Đây là hướng dẫn, không có deployment nào được thực hiện.

Các fixture demo do QA tạo nằm trong Emulator. Không dùng script QA để sửa dữ liệu thật. Bất kỳ chỉnh sửa thủ công nào của Admin trên dữ liệu thật cần hồ sơ thay đổi riêng; patch source không tự đảo những chỉnh sửa đó.

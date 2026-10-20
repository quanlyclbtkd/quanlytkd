# V9 — bản nguồn đầy đủ đã vá, chưa triển khai

Tài liệu mới nhất: `handoff/QR_V9_BAO_CAO_SUA_LOI_VA_KIEM_TOAN.md`. Các báo cáo khác trong nguồn là lịch sử.

Đã đóng 3/5 gate; 2 gate chờ quyết định READS của chủ hệ thống. Rules Emulator 108/108; gate 148 hiện 146 PASS/2 BLOCKED. Có 12 gate lịch sử khác còn FAIL; provider QR trực tiếp trong lần này timeout; iPhone/Safari thật chưa xác nhận. Không phải RELEASE READY.

Giữ `public/` làm cây giao diện hiện có; Rules/indexes ở root. Đọc hướng dẫn staging và trình tự client trước Rules trong báo cáo trước khi cân nhắc triển khai. Không có dữ liệu production hoặc credentials đăng nhập trong gói QA.

Dependency đã cài, Java/trình duyệt QA và log tạm không nằm trong ZIP. Giấy phép/fixture và công cụ kiểm thử được giữ. `handoff/COST_APPROVAL_PENDING.json` là đề xuất đang chờ, không phải chấp thuận.

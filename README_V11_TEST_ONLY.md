# QR V11 — TEST ONLY / CHƯA PHÁT HÀNH

Đã sửa S01, O01, journal đa tab và chuyên cần. Đây là nguồn đầy đủ để xét duyệt, không phải bản đã triển khai production.

Đọc `handoff/V11/REPORT.md` trước khi thử. Có manifest, diff, toàn bộ log và hướng dẫn cutover an toàn trong cùng thư mục.

267/267 lệnh hồi quy, 12 gate cũ và hai gate bảo mật đã PASS. Gate phát hành tổng thể vẫn HOLD: phần đọc phiên bản/CAS/V3 mới chưa được duyệt; chưa có deployed identity, Android vật lý, iPhone Safari và QR trực tuyến. Phê duyệt +1.500 hồ sơ đọc ban đầu vẫn giữ đúng phạm vi cũ, không bao gồm transaction reads mới.

Không ghi dữ liệu production, không tự backfill lịch sử, không dùng PASS cục bộ để tuyên bố production đã sửa. Giữ nguyên V10 làm baseline; test V10 cũ được lưu để đối chiếu ở tools/v11/legacy-v10/.

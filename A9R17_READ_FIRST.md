# A9R17 — FULL SOURCE

Project đầy đủ ở **source/**. Bản đã áp dụng: Tháng/Cơ sở cùng hàng trên, search toàn hàng dưới; giảm chờ thư viện tạo QR; khóa nút tạo phiếu báo khi pending; diagnostics tách công đoạn/queue.

Runtime `a642be12f61d25eb0cb1b77f46224f7d5908bab5db78d9ce746fee88c80d3765`; build `qr-v11r6-a9r17-mobile-layout-qr-20261026`. Root/public129/129, Rules/indexes giữ nguyên. Không deploy hoặc thay dữ liệu production.

Đọc **audit/A9R17_REPORT.md** và **audit/GATE_LEDGER.json**. Cold QR cải thiện trong đo kiểm soát; warm chưa có gain ổn định. Legacy mobile-shell79/80 và physical/live-data blockers vẫn công bố. Trạng thái phát hành **RELEASE_BLOCKED**, dùng bản này để review/kiểm thử trước khi staging/production.

Dependencies không đóng gói. Trong source: `npm ci`, `npm run check`, `npm run check:all`, `npm run check:a9r17`. Các README/report A9R13–R3R1 là lịch sử; A9R17_REPORT là kết quả hiện hành.

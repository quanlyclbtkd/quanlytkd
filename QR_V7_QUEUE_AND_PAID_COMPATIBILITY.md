# Hàng đợi, preview và biên lai đã thu

Chỉ một exportReceipt và một _receiptRenderQueue trong production. request epoch hiện chỉ cấp jobId; không dùng job mới làm lý do hủy job hợp lệ cũ. PAID→REPORT, REPORT→PAID, REPORT→REPORT, fail→success, success→fail đều chạy tuần tự và có kết quả riêng.

Snapshot principal/config được so sánh trước/giữa/sau render và trước download. _receiptActiveJobId chỉ phân biệt preview đang hiện; callback cũ trả về mà không xóa ảnh mới. Ảnh và nút cũ bị xóa khi job tiếp theo bắt đầu hoặc thất bại; đóng modal thì callback tải cũ cũng bị chặn. Khi mở phiếu lại, scroll về đầu.

Nhãn BIÊN LAI THU TIỀN được chuẩn hóa khoảng trắng/chữ hoa/dấu trước phân loại. Biên lai PAID vẫn JPEG, không tạo payable QR, giữ các reason legacy cho caller. Nhãn phiếu không nhận diện không bị tự coi là REPORT. Không đổi signature thành một cờ kind mới hoặc thêm writer/queue.

Primary financial commit không nằm trong renderer; lỗi tạo ảnh sau commit không thu lại/không rollback/replay. QuickPay 24/24 và các gate H8R2/1C1F1… đã PASS. Khối primary pay của processMultiItem không đổi; branch fallback của action=pay giữ nguyên.

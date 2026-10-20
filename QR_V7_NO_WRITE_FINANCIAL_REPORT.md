# Bảo toàn tài chính

Trong VM, API setDoc/addDoc/updateDoc/deleteDoc/writeBatch/runTransaction và các financial command boundary được gắn spy. Handler thực của processMultiItem('report') và delegate Báo nợ đã chạy qua success/error/retry/queue; không có lời gọi writer. Có ca witness gọi trực tiếp biến writeBatch mà handler dùng và spy bắt được một lần, nên số 0 không phải một hằng giả lập không được nối vào code.

Trong browser component test, các API SDK stub bị chặn và đếm lời gọi; cả 10 lượt tạo/xuất/tải file đều 0. Browser không chạy Firebase bootstrap và không dùng tenant production. Không diễn giải kết quả này thành audit log của production Firestore.

Học phí được tick: kiểm đúng 500000, một dòng breakdown và tổng bằng amount. Bỏ tick học phí không dùng giá trị ẩn cũ. Kiểm các khoản exam/other/inventory/inventoryDebt, tổng dòng và discount 10% chỉ khi tick. Các khoản có memo quá dài vẫn phải bị chặn; test amount/breakdown không tự chứng nhận mọi hỗn hợp có QR thành công.

Report thiếu profile branch không mượn branch của form. Report thất bại không gọi collectTuition, không cập nhật paidUntil/debt/inventory/ledger. Không sửa công thức nợ hoặc số tiền canonical. Test delegate nhiều tháng kiểm số tiền truyền trực tiếp, không nhân số tháng × học phí tại delegate; renderer nợ/công thức nợ gốc không được sửa ở phase này.

Primary pay block, atomic writer, idempotency và các module tài chính được đối chiếu hash/byte. Lỗi receipt sau commit không phát sinh commit thứ hai; các suite H8R2 tiếp tục kiểm điều đó. Firestore Rules và saveClubSettings giữ nguyên. Gate Coach/Rules chưa PASS không được bỏ qua chỉ vì QR đạt cục bộ.

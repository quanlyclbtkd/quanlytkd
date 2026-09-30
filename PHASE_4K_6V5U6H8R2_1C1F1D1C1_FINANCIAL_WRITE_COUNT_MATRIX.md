# D1C1 — số lần ghi theo ý định người dùng

Các số dưới đây là quan sát từ actual-handler và Firestore I/O giả lập, **không** phải xác nhận production/Rules. `batch` là lần `commit`, `docs` là số đích trong batch; `add/update/delete` là thao tác primary tách batch. Test: `tools/check-h8r2-1c1f1d1c1-financial-entry.mjs`, `tools/check-h8r2-1c1f1d1c1-inventory-atomic.mjs`, `tools/repro-h8r2-1c1f1d1c1-admission-blocker.mjs`.

| Ca | Ý định | Batch / docs | Profile | Transaction | Kho / stats | Local | Biên lai / audit | Kết quả |
|---|---:|---:|---:|---:|---:|---:|---|---|
| A01–A09 guard thiếu/sai quyền và B input sai | 1 | 0 | 0 | 0 | 0 | 0 primary | 0 primary | Chặn trước ghi |
| QuickPay hợp lệ | 1 | 1 / tx+profile | 1 | 1 | 0 | canonical sau commit | audit phụ không giữ lane | Qua D1C/D1B |
| Thu phí thi hợp lệ / nhấn đôi / lặp trước snapshot | 1/2/1 | 0 | 0 | 1/1/0 add | 0 | merge sau add | không giả lập biên lai | Một effect; lặp 0 mới |
| Hủy lệ phí thi thuần / hủy lại | 1/1 | 0 | 0 | 1/0 delete | 0 | xóa khỏi ba mảng sau thành công | không có | Đúng identity |
| Hủy thành phần thi trong giao dịch hỗn hợp | 1 | 0 | 0 | 1 update allowlist | 0 | giữ phần học phí | không có | Không xóa học phí |
| Xuất kho đã thu / nhập kho / tặng | 1 | 1 / 3 | 0 | 1 | 1 / 1 | inventory+tx sau commit | không có | Một commit |
| Xuất kho bán nợ | 1 | 1 / 2 | 0 | 0 | 1 / 1 | inventory sau commit | không có | Không ghi doanh thu |
| Kho: guard thiếu/qty sai/batch lỗi | 1 | 0 committed | 0 | 0 | 0 persisted | 0 | không có | Không dở dang |
| Kho: đánh dấu đã thu | 1 | 1 / 2 | 0 | 1 | 1 / 0 | hai miền sau commit | không có | Lặp không ghi mới |
| Kho: sửa cùng loại hợp lệ | 1 | 1 / 3 | 0 | 1 | 1 / 1 | sau commit | không có | Giữ liên kết |
| Chi phí thường / kỳ thi hợp lệ | 1 | 0 | 0 | 1 add | 0 | add write-through | không có | Một effect |
| Chi phí guard thiếu, số tiền/ngày sai, quyền sai | 1 | 0 | 0 | 0 | 0 | 0 | 0 | Chặn trước ghi |
| Chi phí nhấn đôi / ghi lỗi | 2 / 1 | 0 | 0 | 1 / 0 committed | 0 | reset chỉ sau thành công | không có | Mở lại khi lỗi |
| Sửa chi phí hợp lệ / lỗi | 1 / 1 | 0 | 0 | 1 / 0 committed update | 0 | merge chỉ sau thành công | không có | Patch hẹp |
| Nhập học học phí 0 | 1 | 0 | 1 | 0 | 0 | không chứng minh qua reload | 0 | **BLOCKED: sai lệch bằng chứng thanh toán, chính sách mơ hồ** |
| Nhập học có phí, giao dịch bị từ chối | 1 | 0 | **1 tồn tại** | 0 | 0 | không đầy đủ | 0 | **P1: primary dở dang** |

Các con số về receipt/audit trong hai bộ test A–E không bao phủ mọi nhánh phụ. Không dùng bảng này để tuyên bố đã hoàn tất F, Rules hoặc nghiệm thu xác thực.

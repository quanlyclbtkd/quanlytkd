# Phase 4K-6V3F2 — Quick Pay Commit Acknowledgement Hotfix

## 1. Hiện tượng

Khi bấm `💰 Thu` trong tab Báo nợ, modal hiển thị:

> ⚠️ Khoản thu chưa được ghi nhận. Kiểm tra thông báo lỗi và thử lại.

Trong một số trường hợp giao dịch đã được Firestore ghi nhưng giao diện vẫn báo thất bại. Nếu người dùng bấm lại, canonical tuition ledger có thể phát hiện tháng đã đóng và từ chối ghi trùng, khiến người dùng tiếp tục thấy lỗi.

## 2. Nguyên nhân gốc

### 2.1. Sai hợp đồng trả về giữa modal và `quickPay`

Modal V3F1 chỉ xem thao tác thành công khi `quickPay()` trả về đúng boolean `true`.

Nhánh `quickPay` legacy trong `app.js` ghi Firestore thành công nhưng kết thúc mà không `return true`, tức trả về `undefined`. Modal vì vậy hiển thị lỗi giả dù giao dịch có thể đã được ghi.

### 2.2. Lỗi biên lai che mất kết quả thu tiền

Trong nhánh legacy, ghi Firestore và xuất biên lai nằm trong cùng một `try/catch`. Nếu transaction/profile đã ghi thành công nhưng `exportReceipt()` lỗi, toàn bộ thao tác bị hiển thị như thu tiền thất bại.

### 2.3. Trạng thái “đã đóng” bị coi như thất bại chung

Nếu lần bấm trước đã ghi thành công nhưng UI chưa kịp cập nhật, lần bấm tiếp theo nhận `TUITION_ALREADY_PAID`. V3F1 trả `false`, khiến modal tiếp tục hiển thị thông báo chung thay vì đóng modal và làm mới Báo nợ.

## 3. Nội dung sửa

### 3.1. Xác nhận commit ba lớp

Modal hiện chấp nhận một thao tác là đã giải quyết khi có ít nhất một bằng chứng:

1. `quickPay()` trả `true`;
2. nhận sự kiện `finance:quick-pay-committed` đúng võ sinh và tháng;
3. `window.__lastQuickPayState` có trạng thái `success` hoặc `already-paid` đúng lần thao tác hiện tại.

Điều này tương thích cả runtime module và fallback legacy.

### 3.2. Chuẩn hóa kết quả `quickPay`

Cả module và fallback legacy hiện trả:

- `true`: Firestore đã commit thành công hoặc tháng đã được ghi nhận trước đó;
- `false`: lỗi thật, chưa xác nhận commit;
- các nhánh hủy/validation cũng trả `false` rõ ràng.

### 3.3. Tách lỗi biên lai khỏi lỗi ghi tiền

`exportReceipt()` có `try/catch` riêng. Nếu biên lai lỗi sau khi Firestore đã commit:

- khoản thu vẫn được xác nhận thành công;
- modal đóng đúng;
- hiển thị cảnh báo có thể in lại biên lai trong tab Học phí;
- không yêu cầu người dùng thu lại.

### 3.4. Xử lý `TUITION_ALREADY_PAID`

Đây được xem là trạng thái đã giải quyết:

- không tạo giao dịch mới;
- không cộng doanh thu lần hai;
- đóng modal;
- làm mới Báo nợ và danh sách giao dịch;
- thông báo rõ tháng đã được ghi nhận.

### 3.5. Hiển thị lỗi thật

Khi Firestore thực sự thất bại, modal hiển thị nguyên nhân cụ thể:

- thiếu quyền ghi: hướng kiểm tra Firestore Rules và quyền tài khoản;
- mất mạng/unavailable: thông báo chưa xác nhận dữ liệu;
- lỗi khác: hiển thị `error.message` thay vì câu chung.

## 4. Phạm vi không thay đổi

Hotfix không thay đổi:

- cấu trúc Firestore;
- Firestore Rules;
- canonical tuition ledger;
- công thức Báo nợ;
- tồn kho hoặc công nợ Kho;
- phân loại doanh thu V3F1.

Không cần migration, Cloud Functions hoặc Blaze.

## 5. Kiểm thử

- `npm run check`: PASS, exit code 0.
- Quick Pay Commit Acknowledgement: 8/8 PASS.
- V3F1 Financial Collection/Revenue/Inline Edit: 44/44 PASS.
- V3F Inventory Sale Policy: 21/21 PASS.
- Runtime Collection/Edit: 9/9 PASS.
- Runtime Stability Gate: 17/17 PASS.
- Production Stability Gate: 22/22 PASS.
- Deploy Package Structure: 12/12 PASS.
- GitHub Pages Paths: 18/18 PASS.

`npm run check:all` là chuỗi rất dài và vượt giới hạn thời gian của môi trường chạy, nhưng không xuất hiện lỗi trước khi bị dừng. Các cổng liên quan trực tiếp và production/deploy đều đã được chạy riêng và đạt.

## 6. Triển khai

1. Sao lưu bản hiện tại.
2. Upload toàn bộ nội dung ZIP lên GitHub Pages.
3. Không cần deploy lại Firestore Rules cho riêng hotfix này.
4. Tải lại bằng `Ctrl + F5` để nhận cache-bust V3F2.
5. Thử một khoản học phí trên một CLB:
   - bấm `💰 Thu`;
   - modal phải đóng sau khi commit;
   - giao dịch xuất hiện trong Học phí;
   - võ sinh biến mất khỏi tháng nợ vừa thu;
   - bấm lặp không tạo giao dịch trùng.
6. Nếu modal hiển thị lỗi quyền sau hotfix, kiểm tra Rules production và `users/{uid}.role/clubId`; lỗi lúc đó là lỗi quyền thật, không còn là thông báo giả.

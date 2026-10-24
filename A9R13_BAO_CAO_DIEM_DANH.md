# A9R13 — Lịch sử Điểm danh và lỗi quyền đọc trước khi lưu

Ngày bàn giao: 24/10/2026, múi giờ Việt Nam.

## Kết quả và giới hạn xác minh

Đã sửa lỗi truy vấn lịch sử từng võ sinh của HLV và bổ sung chẩn đoán chính xác bước đọc bị từ chối trước khi lưu. Đã bổ sung cách Admin kiểm tra đúng mã bản ghi bằng một lần đọc qua chức năng đối soát hiện có.

Không tuyên bố lỗi 403 trên dữ liệu production đã được khép: phiên này không đọc nội dung bản ghi thật, không xác minh Rules đang triển khai và không ghi dữ liệu vào `quanly-tst`. Bản ghi lịch sử cũ bị khóa vẫn cần Admin đối chiếu thực tế trước khi xác minh. Thay source không tự chuyển các bản ghi này sang authority mới.

## 1. Console chứng minh điều gì?

Chuỗi lỗi là:

`toggleAttendance → syncOfflineAttendance → bulkSyncOffline → _commitAttendanceIntents → transaction.get → BatchGetDocuments → permission-denied`.

Đây là Firestore từ chối quyền đọc bản ghi để so sánh phiên bản trước khi ghi. Nó không chứng minh lỗi CORS, mất mạng, chỉ mục hay dữ liệu đã được lưu thành công. Khi một lần đọc trong transaction bị từ chối, transaction không có ACK ghi thành công; Journal giữ thao tác ở `needs-review`.

Mã bản ghi trong log:

`Dương Nguyễn Thanh Phong_2026-10-24_shift_1779176291415`

Đường dẫn tương ứng: `clubs/tstquynhon_tkd/attendance/<mã trên>`.

Log không chứa nội dung `historyAuthority`, `branch`, assignment hiện tại hoặc bản Rules server. Vì vậy, chỉ từ log không thể khẳng định chắc chắn trường nào sai trong production.

### Bấm tên và bấm thẻ là hai thao tác khác nhau

Tên võ sinh gọi `showAttMemberHistory` và chặn sự kiện lan sang thẻ. Thẻ gọi `toggleAttendance`. Stack anh gửi thuộc luồng ghi; lỗi cửa sổ lịch sử là vấn đề độc lập đã tìm thấy trong source. Kiểm thử trình duyệt mới xác nhận bấm đúng tên không enqueue và không ghi điểm danh.

## 2. Lỗi source đã sửa: lịch sử CS1 truy vấn thêm alias bị cấm

A9R12 đã sửa truy vấn ngày và tháng, nhưng `loadMemberHistory()` vẫn chạy song song hai truy vấn cho CS1:

- `branch == CS1`;
- `branch == Mặc định`.

Cả hai có bộ lọc authority hiện tại. Rules A9R12 kiểm tra `branch` trực tiếp trong `allowedBranches`, vốn chứa mã `CS1…CS10`. Truy vấn alias có thể bị từ chối ngay cả khi không có bản ghi nào khớp. `Promise.all` làm toàn bộ việc tải lịch sử thất bại.

A9R13 dùng `_attendanceBranchConstraint()` cho cả ba reader: ngày, tháng và lịch sử từng võ sinh. Lịch sử HLV dùng một truy vấn `branch == CSn`, giữ bộ lọc profile/tháng/authority. CS1 giảm từ hai truy vấn xuống một. Các alias cho hồ sơ và chức năng khác được giữ theo hợp đồng hiện hữu.

## 3. Nguyên nhân 403 đã tái hiện bằng Rules và service thật

A9R11/A9R12 áp dụng authority mới, nhưng vẫn dùng cùng mã vật lý `profileId_ngày_ca`. Một slot có thể đồng thời:

1. Đã có attendance thuộc authority cũ tại đúng mã này.
2. Bị loại khỏi truy vấn ngày của HLV bởi bộ lọc authority mới, nên giao diện tưởng chưa có điểm danh.
3. Khi HLV bấm điểm danh, CAS đọc đúng mã vật lý đó.
4. Rules cấm HLV đọc lịch sử cũ, nên `BatchGetDocuments` trả `permission-denied`.

Đã tái hiện đầy đủ trường hợp này. Đồng thời đã kiểm tra đối chứng: đọc document chưa tồn tại được phép, tạo attendance mới được phép, cập nhật attendance hiện tại với CAS đúng được phép. Vì vậy không sửa tùy tiện nhánh `resource == null` trong Rules.

Các khả năng khác vẫn cần loại trừ trên dữ liệu thật: attendance thuộc cơ sở ngoài quyền, user/coaches assignment không khớp, tài khoản bị khóa hoặc Rules server khác bản bàn giao. Chưa có bằng chứng để tự kết luận production chỉ có một nguyên nhân.

## 4. Thay đổi A9R13

- Sửa query `loadMemberHistory` về một cơ sở canonical.
- Thêm diagnostic ở đúng `transaction.get`: `stage=intent-version-read`, club, docId, branch, role. Giữ nguyên mã lỗi `permission-denied` và không biến lỗi thành document rỗng.
- Thẻ phân biệt `Bị chặn quyền lưu` với xung đột `Cần đối soát`. Nhật ký và thao tác chưa ACK được giữ nguyên.
- Màn hình Admin `Đối soát lịch sử cũ` có ô dán mã bản ghi. Dùng lại `inspectIntent`, một lần đọc, không tải cả tháng nếu có mã chính xác.
- Lỗi lịch sử được hiển thị và ghi nhận qua kho lỗi runtime hiện có.
- Đồng nhất cache token của các import bị ảnh hưởng; các phần logic thay đổi chỉ thuộc `attendance.service.js` và `attendance.js`.
- Cập nhật một kiểm tra QA cũ vốn bắt buộc query theo alias, để kiểm tra đúng giới hạn branch canonical hiện tại.

Authority vẫn là `attendance-history-1aedda93-9437-4132-9694-35c2e6234d55`; Journal vẫn V4. Không thêm writer, không đổi mã attendance, không ghi đè lịch sử, không tự replay các mục cần đối soát, không nới quyền tài chính hoặc xóa điểm danh.

Rules giữ nguyên A9R12, SHA-256:

`1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3`

## 5. Kiểm thử thực hiện trong phiên này

| Bộ kiểm tra | Kết quả |
|---|---:|
| Service thật + Firestore Emulator: lịch sử, create, update, CAS, branch, old authority, Admin xác minh | 22/22 PASS |
| Trình duyệt dùng Firebase SDK 10.7.1 thật + service thật + Emulator | 7/7 PASS |
| UI hiện hữu + IndexedDB thật, tiêm lỗi SDK/storage có kiểm soát | 6/6 PASS |
| Hồi quy A5: lifecycle, đổi ngày/cơ sở/tài khoản, thứ tự thao tác | 23/23 PASS |
| Hợp đồng CAS | 13/13 PASS |
| Coach read boundary | 30/30 PASS |
| Write guard | 9/9 PASS |
| Attendance entrypoints | 21/21 PASS |
| Role authority | 34/34 PASS |
| Explicit shift | 60/60 PASS |
| Daily refresh | 73/73 PASS |
| Syntax | PASS |
| Source identity / root-public | 128/128 PASS |

Emulator chạy cục bộ v1.19.8 với Java 17; các kiểm thử service Node dùng Firebase 12.15.0. Bổ sung kiểm thử trình duyệt riêng dùng đúng Firebase 10.7.1 của ứng dụng, gồm transaction BatchGet thực và tái hiện legacy collision. Kiểm thử trình duyệt chạy Chromium headless; đây không phải nghiệm thu điện thoại vật lý hoặc production.

Các ca DENY mong đợi có thể in `PERMISSION_DENIED`; đối chiếu kết quả từng ca, không đếm mọi dòng đỏ là một FAIL.

### Gate tổng thể kế thừa vẫn chưa xanh hoàn toàn

Đã chạy riêng toàn bộ 58 lệnh trong precheck/check để tránh short-circuit che lỗi phía sau: 54 PASS, 4 bộ kiểm tra FAIL. Bốn bộ này cũng FAIL trên A9R12 gốc, đã chạy đối chứng:

- `check:attendance-canonical-ownership`: `app.js` 703.656 byte > 700.000 và 11.317 dòng > 11.300.
- `check:security-coach-branch-boundary`: hai assertion kế thừa còn dùng cache marker/helper Rules trước A9R12.
- `check:coach-branch-runtime-repair`: kiểm thử cơ chế repair cũ, không khớp hợp đồng assignment đã xác minh trên server hiện tại.
- `check:v5u2e-attendance-excel-sdk-fix`: yêu cầu bộ proof cutover cũ cho nhánh active; không có đủ proof đó để tuyên bố PASS.

Không hạ ngưỡng hoặc sửa các bộ này để ép kết quả xanh. Đây không phải tuyên bố toàn hệ thống đã được chứng nhận production. Logs và kết quả đối chứng kèm trong `evidence/A9R13`.

## 6. Bước xử lý đúng bản ghi trong log

Thực hiện theo `A9R13_HUONG_DAN_XU_LY_403.md`. Admin phải đọc đúng mã, phân loại bản ghi và đối chiếu buổi học trước khi xác minh; sau đó HLV xử lý lại mục Journal theo lựa chọn có chủ đích. Không xóa IndexedDB/localStorage để che lỗi.

## Tài liệu chuẩn đối chiếu

- [Firestore: điều kiện Rules, get/exists](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Firestore: Rules không hoạt động như bộ lọc truy vấn](https://firebase.google.com/docs/firestore/security/rules-query)
- [Firestore: quyền đọc áp dụng ở cấp document](https://firebase.google.com/docs/firestore/security/rules-fields)

Baseline: `QR_V11R6_A9R12_COACH_ATTENDANCE_QUERY_CLOSURE_FULL_SOURCE.zip`, SHA-256 `fb3e45ff8839cebf1e2fbef9d337db8b9b571eb49f98d9130e0f8567a776a737`. Bản ZIP đầu vào đã đối chiếu hash và CRC trước khi sửa.

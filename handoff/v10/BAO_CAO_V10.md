# V10 — Sửa điểm danh HLV và kiểm toán kết thúc đợt

Ngày 20/10/2026, múi giờ Việt Nam.

**Kết luận:** đã sửa chính xác lỗi “Danh sách Điểm danh chưa được xác minh cho tài khoản/cơ sở này” trên bản nguồn V9, đồng thời sửa tình huống mất mạng thật ngăn HLV lưu nhật ký offline. Đã ghi nhận chấp thuận READS của chủ hệ thống và đóng 5 gate kế thừa cùng 12 gate lịch sử. **Chưa hoàn tất điều kiện phát hành toàn hệ thống:** các phản ví dụ S01/O01 vẫn tồn tại; điện thoại vật lý/Safari và VietQR live chưa được nghiệm thu. Bản full bàn giao là TEST ONLY, không phải bản có thể triển khai production ngay.

## 1. Đúng bản nguồn và phạm vi sửa

Đầu vào: `QR_V9_FULL_SOURCE_AUDITED_TEST_ONLY(1).zip`, **7.086.883 byte, 1.255 tệp**, CRC đạt.

SHA-256 đầu vào: `e103182b149bbfb2f170421353a8543162d4c937745b2db999ab28c303d8d74b`.

Ảnh người dùng cung cấp cho thấy danh sách HLV CS1 đã hiển thị nhưng thao tác bị chặn trước writer. Không có nhật ký runtime của điện thoại người dùng, nên kết luận nguyên nhân dưới đây là kết quả tái hiện trên đúng nguồn V9, không phải phép đo trực tiếp phiên điện thoại đó.

Chỉ bốn tệp runtime ở root được thay đổi, có mirror tương ứng trong public:

- `js/listeners/profiles.listeners.js`: cung cấp clubId của owner hiện hữu; lưu bằng chứng RAM cho phép xếp nhật ký offline trong cùng phiên.
- `js/modules/attendance.js`: sử dụng bằng chứng đó chỉ khi navigator báo offline, vẫn kiểm UID/generation/club/role/branch/key/slot/error.
- `js/main.js`, `index.html`: tăng phiên bản đường nạp hai module đã sửa để tránh dùng cache cũ.

`app.js`, Rules/indexes V9, AttendanceService, các owner tài chính, QR, hồ sơ và Kho được kiểm hash giữ nguyên. Không thêm reader/listener/writer/collection, không có proxy QR, không thêm hàng đợi hoặc luồng đồng bộ thứ hai. Batch Coach 10 bản ghi tuần tự và cơ chế đồng bộ hiện hữu được giữ lại. Chi tiết nằm trong `SOURCE_CHANGES.json`, `PROTECTED_OWNERS_V10.json` và `V10_CHANGESET.diff` của gói bằng chứng.

## 2. Nguyên nhân và sửa lỗi HLV

### F01: thiếu clubId ở đường nối owner → guard

Guard `_coachAttendanceWriteAuthorized` đối chiếu `metrics.authorityClubId || metrics.clubId` với CLB của verified principal. `authorityClubId` chỉ cấp cho full-club authority của Admin. Listener HLV chỉ sở hữu danh sách theo cơ sở; getter V9 không trả `clubId` của context.

Vì thế, cả CS1 và CS2 có thể đạt roster verified, đúng UID, epoch và các slot server, nhưng vẫn thất bại ở `METRICS_CLUB_MATCH`. Test cũ tự dựng metrics với sẵn authorityClubId nên không phát hiện lỗi nối này.

Sửa: getter hiện hữu trả `clubId: String(_ctx?.clubId || '')`. **Không cấp authorityClubId cho Coach, không đổi cache thành server authority và không bỏ guard.**

RED: dùng nguồn V9 gốc, listener và handler thật, mỗi cơ sở 36 hồ sơ giả lập, cả tick/bulk đều bị chặn, không đến batch writer. GREEN: trên candidate cuối, tick và bulk ghi đúng qua SDK/Rules Emulator; các trường hợp sai UID, epoch, CLB, role, cơ sở, key, lỗi slot và thiếu server evidence vẫn bị chặn. Bằng chứng: `COACH_JOIN_RED.json`, `COACH_JOIN_GREEN.json` và log trong gói bằng chứng.

### F02: mất mạng thật làm mất điều kiện lưu offline

Staging cảm ứng dùng sự kiện offline thật của trình duyệt tìm thấy lỗi mà test đổi riêng cờ mạng chưa bao phủ: Firestore gửi metadata fromCache khi mất mạng, làm trạng thái roster không còn verified. Guard vì thế chặn ngay trước khi xếp nhật ký.

Sửa: listener hiện hữu chỉ ghi nhận bằng chứng RAM sau khi cả các slot cần thiết đã server-verified trong cùng owner. Khi chỉ metadata mạng thay đổi, bằng chứng này cho phép xếp **nhật ký cục bộ** nếu thiết bị đang offline. Bằng chứng bị xóa khi đổi/reset owner, sửa chữa slot, listener lỗi, cache có thay đổi dữ liệu hoặc pending writes. Cache khởi động chưa từng được xác nhận không được cấp quyền này.

Online vẫn yêu cầu server evidence hiện tại. Roster không được nâng thành verified chỉ vì có bằng chứng offline; full-club authority của Admin không đổi. Đồng bộ lại vẫn dùng cùng AttendanceService và Rules kiểm hồ sơ gốc; bản ghi trái quyền bị từ chối và giữ pending.

## 3. READS đã chốt theo chấp thuận của chủ hệ thống

`handoff/OWNER_READS_APPROVAL_V10.json` ghi nguyên văn chấp thuận từ yêu cầu hiện tại, liên kết hash Rules, listener và phép đo của candidate cuối. Tài liệu không tự suy diễn thành chấp thuận triển khai production hoặc bật Blaze.

| Quy mô | Coach / kịch bản | Query trạng thái cũ | Theo cơ sở hiện tại | Tăng tải đầu |
|---:|---|---:|---:|---:|
| 1.000 | CS1 hỗn hợp, gồm Mặc định | 350 | 750 | +400 |
| 1.000 | CS2 hỗn hợp | 100 | 200 | +100 |
| 1.000 | Tất cả đã nghỉ, cùng CS1 | 0 | 1.000 | +1.000 |
| 1.500 | CS1 hỗn hợp, gồm Mặc định | 525 | 1.125 | +600 |
| 1.500 | CS2 hỗn hợp | 150 | 300 | +150 |
| 1.500 | Tất cả đã nghỉ, cùng CS1 | 0 | 1.500 | +1.500 |

Đây là **result documents tăng thêm ở lượt tải đầu** trên dữ liệu giả lập, không phải quota cứng, tổng số reads tính tiền hoặc giới hạn READS/ngày. Chấp thuận còn bao gồm Rules tra hồ sơ gốc khi Coach ghi điểm danh. Nó không tự cấp ngân sách cho một thiết kế query/history/reconciliation mới.

Số điểm gọi client vẫn getDoc/getDocs/onSnapshot = **29/44/16**. Không thêm điểm gọi trong bản sửa này. Phép đo 1.000/1.500 hồ sơ chạy lại bằng Emulator; không đo billing, reconnect dài hạn hoặc tải 20 CLB đồng thời.

## 4. Gate và bằng chứng cuối

| Nhóm | Kết quả |
|---|---|
| Hai gate CSS/ca tập kế thừa | PASS |
| Gate debt-authoritative-profile-coverage kế thừa | PASS |
| Hai gate security/release-blockers chờ READS | PASS với chấp thuận thật, Rules/measurement và actual Coach join |
| Bộ 148 gate cũ | 148/148 PASS trong phạm vi bộ cũ; hai gate security chạy riêng trong aggregate |
| 12 gate lịch sử | 12/12 PASS; không xóa gate |
| Hợp đồng hành vi thay assertion cũ | 11 nhóm đạt; bắt đủ 12/12 mutation tương ứng 12 gate |
| Kiểm quyền lưu offline | 15 ca guard cùng kiểm listener metadata/revocation đạt |
| Bộ lệnh độc lập mở rộng | 267/267 PASS, tương ứng 273 tên script có alias; không gộp các gate Emulator/aggregate vào mẫu số này |
| Rules kế thừa + chống spoof writer | 108/108 PASS; bộ này chưa bao phủ đủ lỗi đọc lịch sử S01 |
| Handler QR / network | 109/109 và 16/16 PASS |
| SVG an toàn | 25/25 PASS |
| Build/public | Đã chạy build:public; 126/126 cặp khớp SHA-256 |
| Assets/imports / cú pháp | 71/71 assets; syntax JS/inline PASS |
| Gate rủi ro mới | **BLOCKED**: S01, O01-replay, O01-cross-tab |
| check:release và check:all:critical cuối | **exit 1 tại gate rủi ro mới**, sau khi các phần kiểm thử kế thừa đạt |

Không được dùng 148/148 hay 267/267 để nói toàn hệ thống hết lỗi. Để tránh phát hành nhầm, thêm `check:v10-release-risk-boundary` vào cả hai aggregate. Gate chạy lại phản ví dụ trên Emulator và đối chiếu hash candidate, không đọc một marker PASS trong báo cáo để quyết định.

## 5. Staging di động và QR

Đã dùng DOM từ index thật, các owner/listener/module/service thật, SDK và authenticated Rules Emulator với tài khoản/dữ liệu giả lập. Principal được tạo trong harness; **không phải end-to-end đăng nhập production bằng Firebase Auth của app**.

| Cấu hình cảm ứng | Cơ sở | Online tick + bulk | Mất mạng, chấm đơn | Offline bulk 36, kết nối lại |
|---|---|---|---|---|
| Pixel 7 / Chromium | CS1 | PASS | PASS, hết pending sau ACK | PASS, 10/10/10/6 |
| Pixel 7 / Chromium | CS2 | PASS | PASS, hết pending sau ACK | PASS, 10/10/10/6 |
| iPhone 13 / Chromium | CS1 | PASS | PASS, hết pending sau ACK | PASS, 10/10/10/6 |
| iPhone 13 / Chromium | CS2 | PASS | PASS, hết pending sau ACK | PASS, 10/10/10/6 |

Các dòng iPhone là mô phỏng kích thước/cảm ứng trong Chromium, **không phải Safari hoặc iPhone vật lý**. WebKit executable không có trong runtime hiện tại. Không có điện thoại vật lý hoặc URL staging được triển khai trong đợt này.

QR: giữ nguyên bản sửa SVG/redirect/decoder V8. Cả Báo nợ và Thu gộp đạt 22 kịch bản Chromium ở 375/390/430/768/1366 px, gồm redirect, SVG và mạng lỗi. Ảnh nguồn, preview, tải xuống được giải mã bằng ZXing độc lập trong các ca dương; preview và download khớp hash. Các ca tạo phiếu ghi nhận 0 lệnh ghi tài chính trong harness.

Hai lượt VietQR live được chạy riêng: Báo nợ gặp `ERR_TUNNEL_CONNECTION_FAILED`; Thu gộp bị hủy trong môi trường mạng đó (`ERR_ABORTED`). Cả hai không đạt nghiệm thu live. Không suy ra chúng là lỗi CORS production, cũng không sửa bằng proxy, thêm retry hay bỏ xác minh QR. Chưa xác nhận Zalo/ứng dụng ngân hàng, chưa chuyển tiền.

## 6. Những lỗi thật còn tồn tại

### S01 — quyền đọc lịch sử cũ khai sai cơ sở

Rules V9 đã khóa thao tác tạo/sửa/xóa của Coach bằng hồ sơ gốc, nhưng quyền get/list lịch sử vẫn dựa vào branch của bản ghi attendance. Seed lịch sử giả lập cũ có branch CS1 nhưng profileId thuộc CS2; Coach CS1 vẫn đọc được bằng get và cả ba service reader ngày/tháng/member-history. Phản ví dụ được chạy lại trên chính candidate V10.

Cần chốt nghiệp vụ: lịch sử đi theo cơ sở hiện tại của hồ sơ hay cơ sở tại ngày ghi. Hướng khuyến nghị là quyền đọc dựa trên hồ sơ canonical hiện tại, đồng thời xây query chứng minh được quyền tại server và đo chi phí của chiến lược đó. Chỉ thêm get hồ sơ vào Rules read có thể làm query ngày/tháng hợp lệ bị từ chối; lọc client không bảo vệ dữ liệu đã trả về. Không âm thầm đổi query hoặc di chuyển/xóa dữ liệu thật trong bản vá HLV.

### O01 — thử lại sau partial commit/mất ACK và khoảng hở giữa các tab

Tái hiện trên actual caller/service và Emulator: nhật ký V1 11 dòng commit được 10, chunk sau lỗi; giữ nguyên raw là đúng nhưng retry vẫn gửi lại cả gói. Nếu P0 đã được chấm online mới hơn ở trạng thái 2 và có intent V2 tương ứng, retry V1 cũ ghi trạng thái về 1; V2 vẫn pending.

Tái hiện khác: trong khoảng sau compare raw và trước removeItem, mô hình tab B ghi intent mới. Cleanup của tab A vẫn xóa raw mới đó. Đây là interleaving điều khiển trên handler thật, chưa phải chứng nhận hai tab vật lý. localStorage compare/remove không phải CAS nguyên tử.

Cần một hợp đồng duy nhất cho intent/ACK/conflict và journal transaction/claim an toàn giữa các tab; partial ACK phải gắn từng intent đã gửi, retry không được blind-overwrite trạng thái mới hơn. Intent không đủ bằng chứng phải được giữ để đối soát, không xóa để báo hết pending. Phải bao phủ cả set/delete, V1/V2 và lỗi sau commit trước ACK. Việc này có thể cần đổi lưu trữ local hoặc read/transaction reconciliation và ngân sách tương ứng; không thể kết luận đã giải quyết chỉ bằng giảm batch xuống 10.

### P1 — thống kê members thứ cấp của HLV

Trong 4 ca mobile staging, thao tác cập nhật thống kê members thứ cấp phát sinh cảnh báo `attendance-member-stats-reconcile-required` vì Rules từ chối. Bản attendance chuẩn đã ACK và vẫn còn trên server. Đây là hạn chế về chuyên cần/thống kê dẫn xuất cần thống nhất owner/cách đối soát; không cấp thêm quyền profile/member cho Coach để làm hết cảnh báo.

Bằng chứng còn mở: `V10_KNOWN_RELEASE_RISKS.json`, `known-risks.log`, các JSON của gate release mới và `mobile-staging/results.json` trong gói bằng chứng. Các ca được ghi OPEN_REPRODUCED là lỗi bất biến đã tái hiện, không tính thành safety PASS.

## 7. Đánh giá các phần còn lại

Học phí/Báo nợ, nhập học 0, atomic thu gộp, QuickPay, đối soát, hoàn/xóa, Kho/ledger, Thi đai, hồ sơ/Đã nghỉ, tìm kiếm và phân quyền đều chạy các gate hiện hành tương ứng. Owner của các phần này giữ byte theo danh sách bảo vệ. Điều đó không thay thế đối soát dữ liệu thật như hồ sơ Đăng Khôi, kiểm index đã deploy, phiên đăng nhập mọi vai trò, hoặc tải production dài hạn.

Không có claim “không còn lỗi toàn hệ thống”. Các lỗi đã xác nhận và giới hạn nghiệm thu nằm ở mục 5–6; số PASS là phạm vi kiểm thử cụ thể.

## 8. Bước tiếp theo

1. **Đóng S01 và O01 trước phát hành:** chốt quyền lịch sử khi chuyển cơ sở; chọn hợp đồng xử lý intent/ACK/xung đột offline. Ưu tiên giữ dữ liệu chưa đối soát và server enforcement. Đo chi phí của thiết kế sửa, không lấy chấp thuận READS tải roster để mặc định chấp thuận thiết kế mới.
2. Chuẩn bị candidate tiếp theo trong các owner hiện có; chạy lại valid history, forged/moved/deleted profile, batch/partial ACK, set/delete, hai tab thật và các gate V10. Gate rủi ro mới chỉ được xanh khi bất biến thực sự được sửa.
3. Nghiệm thu staging ngoài môi trường mạng bị chặn: Android/Chrome, iPhone/Safari, nếu cần Zalo; đúng build V10 hoặc candidate kế tiếp. Kiểm hai nút QR, quét preview/tải xuống, chỉ xem thông tin, không cần chuyển tiền. Kiểm điểm danh đơn/bulk >10, mất mạng, mở lại app và đổi tài khoản/cơ sở. Không dùng dữ liệu production cho thử lỗi.
4. Chỉ sau khi các mục đó đạt mới chuẩn bị quyết định triển khai. Không triển khai candidate đang HOLD. Khi có bản đạt, nạp client mới trước Rules V9 có lookup; tránh client cũ batch 400 bị từ chối. Không rollback về Rules cho phép spoof branch.

## 9. Đóng gói

Gói full giữ toàn bộ cây nguồn V9, các bản sửa V10, public đã build, cấu hình/Rules/indexes và công cụ tái hiện. `handoff/v10/EVIDENCE_V10.zip` chứa log/JSON/diff, không kèm ảnh chụp trình duyệt mới. Không đóng dependency đã cài, Java/Chromium QA hoặc log tạm trong source.

Manifest SHA-256 từng tệp, kiểm CRC/EOCD/tên Windows/path traversal, giải nén độc lập và đối chiếu toàn bộ file nằm trong báo cáo đóng gói bên ngoài ZIP. Sau khi lưu, chính bản tải lại được kiểm hash/byte/CRC lần nữa.

**Trạng thái: COACH_FIX_TESTED / OWNER_READS_APPROVED / LEGACY_5_AND_12_CLOSED / RELEASE_HOLD_S01_O01 / LIVE_QR_AND_PHYSICAL_PHONE_UNCONFIRMED / NO_DEPLOY.**

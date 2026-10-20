# V9 — Sửa lỗi và kiểm toán toàn hệ thống

Ngày: 20/10/2026. Bản nguồn: V8 trong báo cáo người dùng cung cấp.

**Kết luận:** đã sửa phần kỹ thuật của 5 gate được chỉ định và khóa thêm lỗ hổng giả cơ sở khi Coach ghi điểm danh. **3/5 gate đã PASS; 2/5 vẫn BLOCKED vì chưa có quyết định chấp thuận READS của chủ hệ thống.** Không tạo hồ sơ chấp thuận thay chủ hệ thống, không đổi FAIL thành PASS. Chưa triển khai hoặc thao tác dữ liệu production.

Chưa thể kết luận hệ thống hết lỗi hoặc RELEASE READY: kiểm tra mở rộng còn 12 gate cũ báo đỏ, và kiểm tra VietQR trực tiếp trong Chromium của lần này bị quá hạn. Chi tiết dưới đây phân biệt lỗi mã đã sửa, tiêu chí kiểm thử cũ và phần chưa xác nhận thực tế.

## 1. Đầu vào và phạm vi thay đổi

- `QR_V8_FULL_SOURCE_SVG_SAFARI_TEST_ONLY.zip`: **6.529.954 byte, 1.236 tệp**, CRC đạt.
- SHA-256: `4868a5cafeb9cd8c7bd5b33719f2c498b3f9f50c574daa49c5922b2dcdabf6ad`.
- Làm việc trên bản sao độc lập. Giữ đầy đủ nguồn root/public, các module, cấu hình, Rules, indexes và công cụ kiểm thử.
- `app.js`, toàn bộ QR helper/decoder V8, module/service tài chính, module võ sinh, module/service kho và profile listener **không đổi byte** so với V8. Xem `PROTECTED_OWNERS.json`.
- Phần production sửa: Rules điểm danh; giới hạn/chốt phiên của batch trong `AttendanceService`; cache version dọc đường nạp `index → main → attendance → attendance.service`.
- Công cụ kiểm thử được sửa để dùng Python/Chromium có cấu hình, kiểm tra handler Coach thay assertion cũ, nạp đúng service đang được module sử dụng, chạy CLI khóa trong dự án và kiểm tra quyết định READS theo số đo thật của Emulator.
- Chuẩn hóa 723 URL tải dependency trong lockfile sang registry công khai; **không đổi phiên bản hoặc integrity dependency**. Bản lockfile cũ trỏ đến máy chủ nội bộ khiến việc cài lại bên ngoài môi trường cũ thất bại.

## 2. Kết quả 5 gate kế thừa

| Gate | Nguyên nhân trước sửa | Kết quả V9 |
|---|---|---|
| `check:d1c3b7r2r5-shift-touch-closure` | Python Playwright thiếu; đường dẫn Chromium cố định `/usr/bin/chromium` | **PASS**. 88 ca handler ca tập; 9 cấu hình CSS/pointer gồm điện thoại, tablet và desktop |
| `check:d1c3b7r2-mobile-css-runtime` | Cùng vấn đề môi trường và đường dẫn trình duyệt | **PASS**. 6 kích thước, kiểm tra computed style, vùng bấm và tràn trang |
| `check:d1c3b-debt-authoritative-profile-coverage` | Assertion cũ đòi lọc `status` trước `branch`, mâu thuẫn bản R1 vốn phải bao phủ hồ sơ trạng thái legacy | **PASS 6/6 nhóm**. Thực thi thêm 19 ca handler Coach: branch-only, alias, metadata, xóa/chuyển cơ sở, phiên cũ và teardown |
| `check:d1c3b7-release-security` | Chưa chạy CLI/Rules và thiếu quyết định READS | **BLOCKED: còn đúng 1 điều kiện — quyết định READS của chủ hệ thống**. Rules/đo dữ liệu trên Emulator đã chạy thành công |
| `check:d1c3b6-release-blockers` | Phụ thuộc security gate | **BLOCKED theo cùng quyết định READS**, không còn blocker kỹ thuật độc lập trong gate này |

Hai gate cuối giữ yêu cầu từ mã nguồn kế thừa: `Document-read cost authorization absent (owner-supplied record required)` trong `tools/check-d1c3b7-security-release.mjs`. Chỉ một tài liệu tự ghi PASS hoặc một tệp đề xuất do người sửa sinh ra không đủ đóng điều kiện này.

Gate V9 còn kiểm tra quyết định có hash Rules/listener chính xác, hash phép đo, giới hạn đã chấp thuận không thấp hơn số đo và chấp thuận việc tra hồ sơ gốc khi Coach ghi điểm danh. Bộ kiểm tra quyết định có **16 ca đạt**, gồm từ chối người phát hành không đúng, số đo cũ và giới hạn 0/1499 khi số đo là 1500.

## 3. Lỗ hổng Rules được tái hiện và sửa

**Trước sửa:** Coach CS1 có thể gửi bản ghi `branch: CS1` nhưng `profileId` thuộc võ sinh CS2. Rules chỉ tin `branch` trong payload; Emulator xác nhận yêu cầu giả mạo được ALLOW. Bộ bổ sung trước vá: **9 PASS / 14 FAIL**; không phải 14 lỗi nghiệp vụ độc lập.

**Sau sửa:** nhánh Coach trong create/update/delete phải đối chiếu `clubs/{clubId}/profiles/{profileId}` gốc trong cùng CLB. Coach không được đổi `profileId` của bản ghi khi update. Hồ sơ thiếu, sai cơ sở, thiếu ID, ID sai kiểu và hồ sơ vừa chuyển cơ sở đều bị chặn. CS1 và “Mặc định” vẫn là alias cơ sở chính. Admin giữ quyền sửa dữ liệu legacy.

Trong quá trình thử, việc lặp lại kiểm tra vai trò trong từng phép so nhánh gây chạm giới hạn expression của Rules; việc vừa `exists()` vừa `get()` hồ sơ cũng làm batch chạm giới hạn truy cập. Bản cuối dùng một `get()` hồ sơ, phép so nhánh thuần và giữ `isCoach(clubId)` tại **mọi allow-clause sử dụng helper nhánh**. Các lỗi trung gian không thuộc kết quả cuối.

Batch Coach được chia tối đa **10 bản ghi/lần commit, tuần tự**, ngay trong service hiện có. Admin vẫn tối đa 400. Mỗi chunk kiểm tra lại UID/generation/club/role/branch/db; lỗi hoặc đổi phiên dừng các chunk sau, trả số đã commit và giữ phần chưa đồng bộ. Không thêm writer, collection, hàng đợi hoặc đường đồng bộ thứ hai.

Kiểm thử Rules cuối:

| Bộ kiểm thử thực trên Emulator | Kết quả |
|---|---:|
| Principal/branch/alias/locked/anonymous/query | 12/12 |
| Chống giả cơ sở và service chấm/offline 41 võ sinh | 23/23 |
| Ma trận Rules toàn hệ thống kế thừa | 73/73 |
| **Tổng số ca Rules** | **108/108** |

Thêm **23/23 ca service** kiểm tra tuần tự, ACK/lỗi từng chunk, giữ đầu vào offline, Admin 400/1 và đổi phiên giữa các chunk. Đây là kiểm tra service thực với SDK điều khiển ACK, tách biệt với bằng chứng Rules Emulator.

Ảnh hưởng cần biết: Coach không còn sửa/xóa được bản ghi cũ thiếu hồ sơ gốc hoặc gắn sai cơ sở; Admin cần xử lý nếu dữ liệu dạng này tồn tại. Không tự quét hoặc sửa dữ liệu production để giả định chúng không tồn tại.

## 4. READS: số đo và đề xuất cần chủ hệ thống quyết định

Số điểm gọi client vẫn **getDoc 29 / getDocs 44 / onSnapshot 16**, không tăng so với V8. Số điểm gọi không đồng nghĩa số document reads hoặc chi phí của một phiên.

Phép đo bên dưới chạy query/listener thật trên Emulator với dữ liệu **giả lập**, không phải số liệu hoặc hóa đơn production. So với V8, query Coach không đổi; cột tăng thêm so với thiết kế cũ lọc `active/trial` đã được R1 thay thế để tránh sót hồ sơ.

| Quy mô | Kịch bản / Coach | Thiết kế lọc status cũ | Query theo cơ sở hiện tại | Tăng số hồ sơ ở tải đầu |
|---:|---|---:|---:|---:|
| 1.000 | Hỗn hợp, CS1 gồm alias | 350 | 750 | +400 |
| 1.000 | Hỗn hợp, CS2 | 100 | 200 | +100 |
| 1.000 | Tất cả đã nghỉ, cùng CS1 | 0 | 1.000 | +1.000 |
| 1.500 | Hỗn hợp, CS1 gồm alias | 525 | 1.125 | +600 |
| 1.500 | Hỗn hợp, CS2 | 150 | 300 | +150 |
| 1.500 | Tất cả đã nghỉ, cùng CS1 | 0 | 1.500 | +1.500 |

Đề xuất chấp thuận: tối đa **+1.500 result documents/lượt tải đầu của Coach**, trong phạm vi CLB tối đa 1.500 hồ sơ đã thử; và việc Rules tra hồ sơ gốc cho thao tác ghi điểm danh Coach. Đây là giới hạn của **quyết định/phép thử**, không phải quota cứng trong Firestore.

Tra hồ sơ gốc là dependent read phía Rules; tổng chi phí còn phụ thuộc đọc phân quyền, cache, query rỗng, reconnect, cập nhật realtime và đặc tính truy vấn. Vì vậy không quy đổi bảng này thành tổng READ/ngày hoặc tiền. Firebase xác nhận đọc phụ thuộc bằng `get/exists/getAfter` có thể được tính phí; Emulator không thay thế thống kê billing.

`handoff/COST_APPROVAL_PENDING.json` được điền phạm vi/hash/số đo và giữ `decision: pending`, không phải văn bản chấp thuận. Sau quyết định rõ của chủ hệ thống mới tạo bản ghi chấp thuận tương ứng và chạy lại hai gate. Chưa có thao tác đó trong đợt này.

## 5. QR: phần đã kiểm chứng và giới hạn mới phát hiện

Giữ nguyên bản sửa V8: cùng owner `exportReceipt`, cùng queue, SVG/PNG được kiểm tra và raster hóa, decoder cục bộ và đọc lại pixel/TLV/CRC. Không tăng thời hạn, không thêm retry, proxy hay bỏ kiểm tra để cho phiếu đi qua.

| Phép kiểm tra trên bản V9 | Kết quả |
|---|---:|
| Handler QR thực tế | 109/109 |
| Network/URL/không có BarcodeDetector | 16/16 |
| SVG an toàn trong Chromium | 25/25 |
| Hai nút, PNG/SVG, 375–1366 px, tải ảnh + giải mã độc lập; thêm mạng lỗi | 22/22 |
| Ghi tài chính khi tạo phiếu trong component test | 0 lần |

**Kiểm tra trực tiếp VietQR của đợt này chưa đạt:** hai lượt chạy suite đều dừng ở ca Báo nợ đầu tiên vì `QR_TIMEOUT` tại fetch sau 15 giây; vì suite dừng sớm, ca Thu gộp live lần này chưa được thực thi. HTTP probe riêng nhận **200, image/svg+xml, CORS `*`, 25.364 byte sau 9,349 giây**. Điều này chưa đủ xác định nguyên nhân chênh lệch của Chromium, mạng môi trường thử hoặc độ trễ nhà cung cấp. Không được gọi hai lượt timeout là PASS hoặc suy ra thiết bị người dùng chắc chắn gặp cùng nguyên nhân.

Báo cáo V8 trước đây ghi hai ca live đạt trong môi trường cũ; không lấy kết quả đó thay cho lần thử hiện tại. Chromium có điều khiển phản hồi đã chứng minh luồng xử lý ảnh; chưa có chứng nhận hoạt động liên tục của nhà cung cấp.

Safari/iPhone thật, Android/Zalo và ứng dụng ngân hàng: **chưa xác nhận**. Không thực hiện giao dịch chuyển tiền. Component test không khởi động toàn bộ Firebase/auth của app.

## 6. Kiểm tra toàn hệ thống

- Bộ 148 gate của báo cáo V8: từ **143 PASS / 5 FAIL** thành **146 PASS / 2 BLOCKED**. Hai mục còn lại cùng chờ quyết định READS.
- Mở rộng sang **265 lệnh riêng biệt**, tương ứng **271 tên script** sau gộp alias: **253 PASS / 12 FAIL kế thừa**. Hai gate bảo mật và Rules Emulator được chạy riêng; không gộp chúng vào mẫu số 265. Các lệnh tổng hợp được ghi riêng.
- Cả 12 FAIL bổ sung đều được chạy lại trên V8 gốc và cũng FAIL. Không có lỗi mới trong các lệnh đã so sánh.
- `check:all:critical` và `check:release` thực sự được chạy; cả hai dừng ở điều kiện chấp thuận READS. Không ghi chúng là PASS.
- Cú pháp runtime: **272 mục**, gồm 264 tệp JS và 8 inline script hợp lệ. Tệp kiểm thử/security mới được kiểm tra cú pháp riêng.
- Assets/import: **71/71**. Root/public: **126/126 cặp khớp SHA-256**.

### 12 gate bổ sung chưa được khép trong đợt này

Đây là nợ kiểm thử cần xử lý minh bạch, không phải kết luận có 12 lỗi runtime mới. Không xóa gate, đổi marker hoặc chèn comment để ép xanh.

| Gate | Đối chiếu mã hiện tại / điều cần xử lý |
|---|---|
| `check:scale` | Đòi `attendanceDailyLimit` và luồng đổi tên khóa chính cũ. Hiện daily reader phân trang bằng cursor; hồ sơ sửa displayName, khóa chính bất biến |
| `check:search-bindings` | Match chuỗi `constraints` và warning giới hạn cứng; reader hiện dùng `baseConstraints`, truyền ca tập và phân trang |
| `check:attendance-shift-filter` | Cùng giả định reader cũ; mã hiện tại vẫn thêm điều kiện shiftId vào query trước khi phân trang |
| `check:profile-hydration` | Đòi nguyên văn hai câu phân loại trong listener; hiện phân loại qua store chuẩn, các bộ coverage mới thực thi handler/store đã đạt |
| `check:finance-index-errors` | Cắt từ catch cuối của cả module, không chọn đúng catch `_doLoad`; catch thực tế reset `pgState.isLoading = false` và hiển thị lỗi index |
| `check:club-context-ready` | Đòi ghi `window.currentClubId` trực tiếp trong init; cần cập nhật test theo chủ sở hữu verified auth context hiện tại |
| `check:active-zero-fallback` | Đòi query probe `limit(1)` và full fallback sau kết quả rỗng; mâu thuẫn authority mới: roster server rỗng đã verified không được tự đọc lại |
| `check:exam-fee-setting` | Cắt 600 ký tự đầu của hàm; `window.getClubExamFee?.()` hiện có ở phần sau. Cần test hành vi fallback thay cách cắt |
| `check:coach-branch-runtime-repair` | Vẫn yêu cầu `statusConstraint` trong query; cùng hợp đồng cũ với gate coverage đã sửa. Query thật và Rules branch-only đã được kiểm chứng |
| `check:v5q-quit-single-authoritative-pipeline` | Đòi comment/cách hydrate cũ; cần đổi sang test partial merge trong cùng club/role/session. Các bộ D1C3B3/B4 hiện tại đã chạy |
| `check:v5s-quit-context-behavior` | Fixture getDocs không có snapshot metadata; authority mới chặn đúng ở `pending-server-confirmation`, nên không được ép production tin snapshot thiếu bằng chứng |
| `check:profile-display-name-safe-edit` | Regex cũ đòi handler tên truyền thẳng và spacing cố định. Renderer hiện encode/decode token cho profileKey; finance hiện giữ `profileId: name`, tên hiển thị dùng displayName. Cần bổ sung ca UI đầy đủ cho chuỗi có dấu/nháy |

Khuyến nghị khép riêng 12 gate này bằng kiểm thử hành vi hiện hành, có ca âm chứng minh vẫn bắt lỗi; không phục hồi thiết kế cũ chỉ để đúng regex. Những nhận định trên dựa trên đối chiếu nguồn và các bộ hiện tại, không thay thế một lượt end-to-end đăng nhập đủ mọi vai trò.

### Đánh giá theo chức năng

| Phần hệ thống | Kết quả/giới hạn |
|---|---|
| Học phí, Báo nợ, nhập học 0, đối soát đã thu | Các gate tài chính/authority/atomicity trong bộ kiểm tra riêng đạt; các owner tài chính giữ nguyên byte. Không đối chiếu hồ sơ thật Đăng Khôi hoặc dữ liệu production trong đợt này |
| Thu gộp, QuickPay, biên lai, hoàn tác/xóa | Kiểm thử serialization, stale/replay, bundle và receipt kế thừa đạt. Tạo phiếu không ghi khoản thu trong component test |
| Kho, bundle nhiều khoản | Các gate ledger, hydration, atomic bundle và lịch sử đạt; không thêm writer/collection |
| Điểm danh/ca tập/offline | Các bộ actual-handler đạt; sửa Rules giả cơ sở, batch Coach và chốt phiên. Nhật ký chưa ACK không bị tự xóa khi service lỗi |
| Hồ sơ/Đã nghỉ/tìm kiếm | Các bộ authority/session/legacy coverage mới đạt. Các test lịch sử chưa khép được liệt kê đầy đủ ở bảng trên |
| Admin/Coach/Viewer/SuperAdmin | 108 ca Rules đạt trên Emulator. Không chứng minh rằng Rules mới đã được triển khai lên website; chưa làm việc đó |
| Mobile/CSS | Kiểm tra hình học Chromium đạt. Chưa kiểm tra cảm ứng, bàn phím/chia sẻ ảnh và cache trên điện thoại vật lý |
| Mạng nhà cung cấp QR | Hai timeout trong kiểm tra live hiện tại; cần nhật ký mạng trên môi trường staging/thiết bị thật để khép |
| Quy mô/chi phí | Đã đo 1.000/1.500 hồ sơ giả lập. Không đo đồng thời 20 CLB, billing, reconnect dài hạn hoặc tải production |

## 7. Bàn giao và đóng gói

ZIP full chứa toàn bộ nguồn V8 cộng bản sửa V9; `public/` là cây giao diện triển khai hiện có, Rules/indexes ở root. Thư mục `handoff/` chứa báo cáo mới, diff, số đo READS, đề xuất chấp thuận đang chờ, kết quả và hướng dẫn tái hiện. Các báo cáo lịch sử trong nguồn là tài liệu quá khứ; `START_HERE_V9.md` chỉ định trạng thái mới nhất.

Loại khỏi gói các dependency đã cài, trình duyệt/Java tải để QA, log tạm của Emulator và dữ liệu QA tạm. Không loại các công cụ/fixture/license vốn cần để tái hiện kiểm thử. Nhật ký/bảng kết quả nằm trong `handoff/QR_V9_EVIDENCE_AND_DIFF.zip`; không đưa ảnh chụp trình duyệt vào gói bằng chứng.

Đóng ZIP qua tệp tạm, đóng/flush/fsync, kiểm CRC, EOCD, mục lục, tên Windows, tên trùng/case collision, path traversal và giải nén độc lập; so SHA-256 từng tệp. Sau lưu sẽ tải lại chính ZIP để kiểm byte/hash/CRC. Manifest SHA-256 từng tệp nằm trong `SOURCE_MANIFEST_V9.json`; kiểm tra nội dung đóng gói nằm trong `handoff/PACKAGING_AUDIT.json`. Hash/CRC của chính ZIP được xác minh thêm ở lần tải lại sau lưu; không nhúng hash của ZIP vào chính nó.

## 8. Bước tiếp theo

1. Chủ hệ thống xem bảng READS và quyết định chấp thuận đề xuất +1.500 result docs ở tải đầu trong phạm vi đã thử, cùng lookup hồ sơ gốc khi Coach ghi điểm danh. Khi có quyết định, điền bản ghi thật và chạy lại **hai gate đang chờ**. Không tự đánh dấu chấp thuận.
2. Khép 12 gate kiểm thử lịch sử bằng ca hành vi tương ứng. Không lấy việc chúng cũ làm lý do bỏ chúng khỏi báo cáo.
3. Thử staging bằng Admin, Coach CS1/CS2, Viewer/SuperAdmin; kiểm hai nút QR trên iPhone/Safari và Android/Zalo. Đối chiếu tài khoản, số tiền, nội dung từ ảnh xem trước/tải xuống; chỉ xem thông tin sau quét, không cần chuyển tiền. Ghi phiên bản main/attendance/service V9 và QR helper V8, thời gian request, status/MIME/reason/stage.
4. Thử điểm danh online/offline trên hơn 10 võ sinh, lỗi mạng giữa chunk, đổi tài khoản/CLB, alias Mặc định và hồ sơ chuyển cơ sở. Rà dữ liệu legacy thiếu profileId bằng quy trình Admin riêng nếu có trường hợp bị chặn.
5. Chỉ sau khi các điều kiện trên đạt mới lập quyết định triển khai production. Khi triển khai được cho phép, cần nạp client V9 trước Rules mới và xác nhận người dùng đã làm mới phiên; client cũ còn batch 400 có thể bị Rules mới từ chối. Không tự rollback Rules cũ vì sẽ mở lại lỗi giả cơ sở.

**Trạng thái cuối đợt:** `SOURCE_PATCHED / 3_OF_5_GATES_CLOSED / 2_OWNER_COST_DECISION_PENDING / LEGACY_TEST_DEBT_RECORDED / LIVE_PROVIDER_UNCONFIRMED / NO_DEPLOY`.

Nguồn kỹ thuật chính thức:

- https://firebase.google.com/docs/firestore/security/test-rules-emulator
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/firestore/pricing

Các ca âm có `PERMISSION_DENIED` trong log là kết quả mong đợi khi `assertFails` đạt; đọc dòng PASS/tổng cuối, không đếm mỗi log từ chối là lỗi hệ thống.

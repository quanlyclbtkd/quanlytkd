# V11 — Sửa lỗi Điểm danh, kiểm chứng và READS

**Trạng thái: bản nguồn đầy đủ để xét duyệt/thử nghiệm. Chưa triển khai production và chưa nghiệm thu điện thoại vật lý/QR trực tuyến.**

## 1. Kết quả chính

Đã sửa tại owner Điểm danh hiện hữu: S01, replay/ACK của O01, mất journal giữa hai tab, thống kê chuyên cần phụ và trường hợp Firestore mất kết nối dù `navigator.onLine` vẫn là `true`.

- **267/267 lệnh hồi quy độc lập PASS**, tương ứng 273 tên script; không tính hai gate bảo mật và gate quyết định phát hành trong số này.
- **Hai gate B7/B6 PASS** sau khi thực sự chạy Firebase CLI/Emulator và kiểm tra phạm vi READS ban đầu đã được người dùng duyệt.
- Bộ Emulator mới: **18 ca chức năng PASS + 2 phá thử Rules bị bắt**; 12 ca principal/tenant và **73 ca Rules toàn hệ thống PASS**.
- Trình duyệt: **28 ca PASS**, dùng DOM/module thật, SDK thật, Emulator, IndexedDB gốc và hai tab Chromium thực. Có mô phỏng touch/viewport Pixel 7 và iPhone 13; đây **không phải** Android vật lý hay Safari.
- Service CAS: 12 hợp đồng chức năng PASS, 4 phá thử bị bắt. Journal gốc: 6 ca dương tính và 6 phá thử bị bắt.
- 12 điểm kiểm tra cũ đều có ca phá thử bị bắt; 11 hợp đồng dương tính đi kèm PASS. Chứng cứ: `evidence/legacy-12-mutations.json`.
- QR: 109 ca handler/ảnh và 16 ca phản hồi mạng bằng fixture PASS. **QR VietQR trực tuyến và iPhone Safari chưa được nghiệm thu.**

Gate phát hành tổng thể vẫn **HOLD**: đọc phiên bản trong transaction và việc chuyển journal sang V3 là phạm vi mới cần duyệt; chưa có đối chiếu deployed source/Rules, cutover dữ liệu thật và nghiệm thu thiết bị thật. Không diễn giải PASS cục bộ thành “production đã sửa”.

## 2. Đầu vào và phản ví dụ độc lập

Đầu vào: `QR_V10_FULL_SOURCE_COACH_FIXED_TEST_ONLY(1).zip`, SHA-256:

`d4a1f8a56b513542ddc79e04d97845b0e0c636113fd4157a9fe01fe3e6449416`

Đã đọc báo cáo kiểm toán độc lập và prompt sửa P0. Chạy lại đúng nguồn V10 trong Emulator, tái hiện được:

1. S01: `get`, danh sách ngày, tháng và lịch sử võ sinh trả về bản ghi cố ý khai branch CS1 nhưng profile thuộc CS2.
2. O01: commit thứ hai lỗi; replay làm trạng thái mới từ 2 về 1.
3. O01: xen kẽ `getItem`/`removeItem` làm mất raw journal mới. V10 này là kiểm thử xen kẽ có kiểm soát; V11 bổ sung hai tab Chromium thực.

Không có chứng cứ production đã bị khai sai; không kết luận dữ liệu production bị rò rỉ. Không có Firebase token, tài khoản staging công khai hay Rules deployed để xác nhận phiên bản đang chạy.

## 3. S01 — lịch sử theo cơ sở lúc điểm danh

Người dùng đã chọn **“Theo lúc điểm danh”** trong phiên này.

Hai phương án được đối chiếu:

| Phương án | Đặc tính | Quyết định |
| --- | --- | --- |
| Theo hồ sơ hiện tại, Rules tra profile khi đọc | Quyền lịch sử chuyển theo profile; có dependent read và khó làm danh sách ngày/tháng bao phủ đủ mà không fan-out | Không phù hợp chính sách đã chọn |
| Xác minh cơ sở khi ghi và giữ bất biến trong lịch sử | Một thế hệ chứng thực mới; cùng reader hiện hữu thêm điều kiện server; dữ liệu cũ cần đối soát | Chọn cho V11 |

Rules yêu cầu `historyAuthority` thuộc thế hệ V11. Coach chỉ đọc bản ghi đã xác minh và thuộc cơ sở được gán. Coach tạo bản ghi phải có profile gốc cùng cơ sở; cập nhật phải giữ profile/branch và chỉ sửa bản ghi đã có chứng thực. Coach không thể tự nâng lịch sử cũ chưa xác minh thành lịch sử tin cậy bằng blind update. Khi profile chuyển cơ sở hoặc mất khỏi danh sách hiện tại, bản ghi đã xác minh vẫn thuộc cơ sở lịch sử ban đầu.

Các reader ngày/tháng/lịch sử và Excel dùng điều kiện chứng thực ở truy vấn server; **không lấy dữ liệu trái quyền rồi lọc ở client**. Bổ sung 5 composite index tương ứng, giữ các index cũ. Coach không có dependent profile lookup mới trên mỗi lần đọc lịch sử.

Dữ liệu cũ chưa xác minh không hiển thị cho Coach. Admin có nút **Đối soát lịch sử cũ**, tải tháng, đối chiếu chứng từ, xác nhận cơ sở từng bản ghi và ghi CAS qua chính AttendanceService. Không tự backfill theo branch hiện tại; không tự gắn nhãn tin cậy hàng loạt.

### Cutover bắt buộc trước khi kích hoạt dữ liệu thật

Marker là giao thức chứng thực, không phải mật khẩu và không tự chứng minh dữ liệu được tạo dưới Rules mới. Để tránh tin một marker có thể đã tồn tại từ trước:

1. Xác nhận đúng project và byte nguồn/Rules deployed; bảo toàn bản sao dữ liệu.
2. Trong cửa sổ bảo trì, áp dụng bản **Coach attendance deny** ở `firestore-cutover-admin-only.rules`. Coach không đọc/ghi Điểm danh trong pha này.
3. Admin kiểm tra toàn bộ collection theo giá trị `historyAuthority` của thế hệ ứng viên. Trước khi client V11 được công bố, số bản ghi của thế hệ này phải là **0**. Nếu khác 0, dừng kích hoạt và điều tra/đổi thế hệ rồi thử lại trong pha deny. Không mặc nhiên tin marker sẵn có.
4. Xây xong index; áp dụng Rules cuối cùng rồi client V11. Chỉ sau đó các bản ghi mới do Rules xác thực mới được dùng làm lịch sử tin cậy. Admin đối soát dữ liệu cũ có chủ ý.
5. Giữ nguyên mã thế hệ sau khi kích hoạt; không đổi tùy tiện ở các bản phát hành sau, tránh làm mất khả năng đọc lịch sử đã xác minh.

Pha deny đã được kiểm thử: Coach get/list/create/update đều bị chặn; Admin phát hiện cohort tồn tại và ca kích hoạt với cohort khác 0 bị từ chối. **Chưa thực hiện cutover production.**

## 4. O01 — một hợp đồng intent/ACK

- Online và offline đều enqueue trước rồi dùng cùng sync worker/AttendanceService. Không còn save/delete trực tiếp song song từ nút online.
- Journal V3 dùng transaction IndexedDB cho enqueue, claim lease và ACK. ACK chỉ tác động đúng UUID + claim; giữ bản ghi audit, không xóa raw theo kiểu compare rồi remove không nguyên tử.
- Intent kế tiếp cùng document phụ thuộc intent trước, không dựa đồng hồ để quyết định mới/cũ.
- V1/V2 localStorage là đầu vào chuyển đổi **chỉ để đối soát**, nhập mỗi raw snapshot theo digest; không tự replay và không xóa key mutable của tab khác. Khi không biết phiên bản gốc, không tự suy đoán.
- Writer transaction đọc phiên bản hiện tại, so `baseVersion`, rồi ghi. Mismatch giữ intent ở trạng thái xung đột. UUID đã commit và cùng nội dung được ACK lại mà không ghi lần hai. Reuse UUID khác nội dung bị chặn.
- Coach tối đa 10 document/transaction; Admin tối đa 400; chunk nhỏ hơn được giữ. Tất cả read đứng trước write, kiểm tra context trước mỗi chunk và sau các await đọc.
- Trạng thái 0 là **tombstone chưa điểm danh** có version. Không dùng blind delete, tránh một set trễ làm sống lại điểm danh đã xóa. Ngày hiển thị chưa điểm danh; thống kê/lịch sử/Excel loại tombstone khỏi số buổi.
- Nút **Kiểm tra nhật ký** cho phép giữ máy chủ hoặc đọc bản ghi hiện tại để áp dụng lại trạng thái có chủ ý bằng UUID mới. Máy chủ đổi thêm lần nữa vẫn sinh conflict. Pending/conflict có nhãn riêng, thống kê màn hình được ghi rõ là tạm tính khi chưa ACK.
- Đóng tab giữa commit và ACK giữ journal. Lease hết sau 60 giây có thể nhận lại; claim cũ không ACK được claim mới. Khi một phiên cũ đóng, dùng nút Đồng bộ lại sau thời gian lease; không có timer poll mới.

Đã thử commit hai lỗi, mất ACK, dữ liệu server mới hơn, set→xóa→set, claim hết hạn, ACK tab cũ, hai tab enqueue, đổi tài khoản/cơ sở/role/db/generation, raw V1 thay đổi và dữ liệu nhiều ngày. Không áp dụng LWW theo timestamp hay tự rebase khi chưa có quyết định người dùng.

### Có Internet nhưng Firestore mất kết nối

Dùng proof roster cùng phiên đã được server xác minh để cho phép **lưu vào queue**, kể cả `navigator.onLine=true`. Rules/transaction vẫn quyết định ghi server. Browser test chặn transport tới Emulator trong khi `navigator.onLine` giữ true; intent còn nguyên rồi đồng bộ thành công sau khi mở transport.

Chỉ gọi `disableNetwork()` không đủ mô phỏng trường hợp này ở SDK thử nghiệm: listen stream dừng nhưng transaction RPC có thể vẫn tới server. Vì vậy không dùng riêng ca đó làm bằng chứng mất mạng thực.

## 5. Chuyên cần thứ cấp và các luồng giao nhau

Attendance không gọi `updateMemberStats()` nữa; Coach vẫn không có quyền ghi `members`. Thẻ và lịch sử lấy chuyên cần từ các record Attendance đã xác minh trong quý đang xem, qua reader lịch sử có sẵn. Chưa tải thì hiển thị yêu cầu chạm tên xem lịch sử; không hiển thị số lũy kế cũ như số hiện tại hoặc giả 0. ACK làm mất hiệu lực cache chuyên cần. Không dùng số buổi quý thay cho tổng trọn đời/thăng đai và không tự sửa dữ liệu lũy kế legacy trong `members`.

| Giao nhau | Xử lý V11 |
| --- | --- |
| Coach CS1 + Mặc định | Giữ 2 listener bổ sung của owner roster; không thêm listener |
| Online + V1/V2/V3 | Một queue hoạt động V3, một worker; V1/V2 chỉ review; một CAS writer |
| Attendance + members | Bỏ projection write trái quyền; chuyên cần chỉ đọc từ Attendance |
| Hai tab | IndexedDB transaction + claim identity; CAS ở Firestore bảo vệ version |
| StudentProfileStore + fallback app.js | Không xóa guard tương thích; hồi quy Admin/roster giữ lại |
| Thu gộp/Báo nợ/QuickPay/QR | Giữ owner tài chính và xuất phiếu hiện hữu; không sửa app.js hay luồng ghi tiền |

`app.js`, `style.css`, `finance.js`, `students.js`, `profiles.listeners.js` giữ nguyên byte so với V10. Các thay đổi báo cáo Excel chỉ là scope/chứng thực/tombstone và cache bust cho chuỗi lazy import.

## 6. READS đo lại và phạm vi phê duyệt

Chấp thuận gốc trong phiên: **“chấp thuận đề xuất tối đa +1.500 hồ sơ đọc thêm/lượt tải đầu của Coach trong phạm vi CLB ≤1.500 hồ sơ, cùng việc Rules tra hồ sơ gốc khi Coach ghi điểm danh”**.

Giữ nguyên phạm vi này; không xin lại. Record V11 chỉ ràng lại cùng phạm vi vào Rules/source/measurement hiện tại và giữ nguyên statement/provenance V10. File JSON là dấu vết; thẩm quyền xuất phát từ chấp thuận trực tiếp của người dùng, không tự sinh từ JSON.

| Tổng hồ sơ CLB | Kịch bản/cơ sở | Cũ | Mới | Tăng lượt đầu |
| --- | --- | ---: | ---: | ---: |
| 1000 | mixed / CS1 | 350 | 750 | +400 |
| 1000 | mixed / CS2 | 100 | 200 | +100 |
| 1000 | all-quit-CS1 / CS1 | 0 | 1000 | +1000 |
| 1500 | mixed / CS1 | 525 | 1125 | +600 |
| 1500 | mixed / CS2 | 150 | 300 | +150 |
| 1500 | all-quit-CS1 / CS1 | 0 | 1500 | +1500 |

Sáu kịch bản dùng truy vấn/listener thật tới Emulator, dữ liệu tổng hợp 1.000/1.500. Giới hạn lớn nhất đo được +1.500 tài liệu kết quả. Không có listener hoặc fan-out roster mới trong V11.

**Phần mới chưa thuộc chấp thuận cũ:**

| Thao tác được đo | Đọc document thêm ở writer | Ghi |
| --- | ---: | ---: |
| Một intent được xác nhận | 1 | 1 |
| Thử lại UUID đã commit, mất ACK | 1 | 0 |
| Đổi trạng thái với phiên bản đúng | 1 | 1 |
| Phát hiện replay stale | 1 | 0 |
| Hàng loạt 41 intent | 41 | 41, chia 5 transaction |

SDK đặt tối đa **3 attempt cho mỗi lần gọi transaction**: ở cấp logic, một intent cần 1 lần đọc phiên bản/attempt, có thể tới 3 lần/lượt gọi. Retry thủ công, mất ACK, phiên đồng bộ khác và nút đọc để đối soát có thể phát sinh lượt đọc mới; đây không phải trần đọc trọn đời/intent hoặc trần hóa đơn. Explicit review đọc 1 document/attempt, tối đa 3 attempt/lượt gọi, trước khi có thể thêm một transaction áp dụng lại.

Đã bỏ việc tải lại toàn bộ ngày sau mỗi ACK online: merge đúng document vào RAM bằng ACK; ca browser khẳng định cả single và bulk không tạo thêm daily query. READS trên không bao gồm dependent Rules reads, minimum query charges, index reads, reconnect/listener changes hay phí truyền tải; chưa có telemetry production hoặc hóa đơn. Canonical-profile lookup của Rules là phạm vi cũ đã duyệt; version-read/CAS/V3 migration là đề xuất mới trong `TRANSACTION_READS_DECISION.json`, trạng thái **pending**.

## 7. Gate và tính trung thực của kiểm thử

Đã giữ nguyên các kiểm tra không liên quan. 15 gate lỗi ban đầu sau thay hợp đồng được chuyển sang hành vi V11 có kiểm chứng; source test V10 giữ dưới `tools/v11/legacy-v10/` để review. Không thêm chuỗi PASS vào source nhằm thay kết quả chạy.

- Orchestration ngày/ca: giữ **73/73** và **60/60** assertion. Adapter journal chỉ dùng trong bài kiểm tra orchestration; chứng minh storage phải qua native IndexedDB riêng.
- Các gate V1/V2 không còn đòi replay không biết version hoặc raw delete; thay bằng 12 hợp đồng CAS và native journal có phá thử. Bộ Emulator và browser chạy tách biệt để tránh xem SDK fixture là bằng chứng server/đa tab.
- Phá thử bỏ CAS, ACK recovery, whitelist, context guard đều bị bắt; bỏ historical proof/canonical profile check trong Rules đều bị bắt; bỏ claim identity, dependency, principal, review hoặc khôi phục raw delete đều bị bắt.
- Hai gate bảo mật chạy CLI thật, principal + Rules + roster cost thật và browser. B7/B6 PASS chỉ chốt phạm vi cũ; gate risk sau cùng vẫn HOLD phần mới chưa được duyệt.

`evidence/regression-results.json` có kết quả và log của từng lệnh. Hash nguồn trong các evidence Emulator/cost khớp ứng viên. Sai khác runtime và các file được giữ nguyên có trong `SOURCE_MANIFEST.json` và `RUNTIME_CHANGES.diff`.

## 8. Phần chưa nghiệm thu và bước tiếp theo

1. Duyệt phương án journal V3/CAS/tombstone và phạm vi đọc phiên bản mới nêu trên trước khi áp dụng staging/production dùng dữ liệu thật. Không gán chấp thuận cũ cho phần này.
2. Có môi trường staging và xác nhận đúng deployed source/Rules mới thực hiện cutover. Chưa sửa hoặc triển khai vào project production.
3. Android vật lý: đăng nhập HLV CS1/CS2; điểm danh đơn/hàng loạt; mất mạng; đóng/mở lại; kết nối lại; không nhầm nhãn chờ với ACK; thử hai tab và conflict có mặt/vắng/phép/xóa.
4. iPhone Safari: thử **cả hai nút QR**, preview, lưu/mở PNG, giải mã ngân hàng–tài khoản–số tiền–nội dung chuyển khoản, cả khi mất mạng. QR không tạo thêm giao dịch tài chính.

Lần thử trình duyệt QR có yêu cầu tới VietQR đã bị duyệt tự động từ chối vì rủi ro gửi dữ liệu thanh toán tới đích chưa được chấp thuận. Không lách hoặc chạy lại yêu cầu bị chặn. Muốn nghiệm thu QR trực tuyến cần chấp thuận rõ việc gửi **dữ liệu staging/kiểm thử** tới VietQR và một thiết bị/Safari thực. 109+16 bài fixture đã PASS nhưng không thay thế nghiệm thu này.

## 9. Tái chạy cục bộ

Dependency kiểm chứng hiện tại: Firebase SDK 12.15.0, Firebase CLI 15.22.2, Java 21 và Chromium headless. HTML production vẫn dùng Firebase CDN 10.7.1 của V10; chưa thay SDK production và chưa chứng nhận parity trên thiết bị chạy CDN đó.

```bash
npm run build:public
python tools/run-v10-audit.py
node tools/check-v10-legacy-mutations.mjs
node tools/v11/cas-contract.mjs
node tools/v11/cas-mutations.mjs
node tools/v11/journal-mutations.mjs
firebase emulators:exec --only firestore --project demo-v11-check 'node tools/v11/emulator.mjs && node tools/v11/read-cost.mjs && node tools/v11/browser.mjs && node tools/v11/cutover.mjs'
D1C3B7_COST_APPROVAL_FILE=handoff/V11/OWNER_INITIAL_READS_SCOPE_CARRIED_FORWARD.json node tools/check-d1c3b7-security-release.mjs
D1C3B7_COST_APPROVAL_FILE=handoff/V11/OWNER_INITIAL_READS_SCOPE_CARRIED_FORWARD.json node tools/check-d1c3b6-release-blockers.mjs
node tools/check-v10-release-risk-boundary.mjs # dự kiến HOLD khi new scope còn pending
```

Browser tests cần Playwright, `CODEX_PRIMARY_RUNTIME_NODE_MODULES` và `PLAYWRIGHT_CHROMIUM_EXECUTABLE` trỏ tới Chromium; không dùng WebKit giả làm Safari. Bộ audit CSS dùng Python Playwright. Không có node_modules/Java/Chromium đóng trong gói; dùng dependency môi trường để tái chạy. Không chạy `deploy:hosting` từ gói thử này.

Runtime tree SHA-256: `50af273211c1280b52b022f3a120d5a8ba5ef1637bfced70c00f40b0832524bf`.

Rules SHA-256: `c1803b367f264740758a776e3b30455a13c82e1a04b695a688da359d868b7b9a`.

Không có ảnh chụp trình duyệt hoặc dữ liệu thanh toán mới trong gói evidence; chỉ log/text/JSON tổng hợp kiểm thử.

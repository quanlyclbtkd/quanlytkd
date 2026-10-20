# QR Phiếu báo V7 — kết quả thực hiện ngày 20/10/2026

**Đã bàn giao bản full mã nguồn thử nghiệm, chưa triển khai. Chưa thể xác nhận đã khắc phục hoàn toàn lỗi trên iPhone hoặc đủ điều kiện production.**

Trạng thái: `SOURCE_PATCH_TESTED / QR_SCOPE_PARTIAL / QR_END_TO_END_NOT_CLOSED / GLOBAL_RELEASE_BLOCKED / NO_DEPLOY`.

| Nội dung | Kết quả đã thực hiện |
|---|---|
| Gói đầu vào | Khớp SHA-256 yêu cầu V7; 1.171 mục; CRC, đường dẫn ZIP, tên trùng và symlink đều đạt |
| Bốn asset công khai của website | Khớp bản V4: index.html, app.js, students.js, main.js; chỉ GET tệp tĩnh |
| Bản thực tế trong iPhone, cache, cấu hình và phiên đăng nhập | `LIVE_NOT_CORRELATED`; chưa có nhật ký thiết bị, không đọc cấu hình production |
| Kiểm thử V7 qua thân hàm thực tế | **109/109 PASS**; bản V4 gốc cùng bộ test: 16 PASS / 93 FAIL |
| QuickPay | **24/24 PASS**, phục hồi từ 23/24 của V4 |
| Các script kiểm tra trong hai chuỗi critical/release và các gate bắt buộc bổ sung | **143/148 PASS; 5 FAIL**, cả 5 FAIL cũng tái hiện trên V4 gốc |
| Hai nút tạo phiếu trong Chromium | 10/10 lượt: Báo nợ và Thu gộp tại 375, 390, 430, 768, 1366 px; có tải tệp thật |
| Nguồn ảnh và bộ giải mã của các lượt Chromium | PNG VietQR lấy bằng HTTP client rồi phát lại; jsQR chỉ được cài vào trang kiểm thử, không nằm trong public runtime |
| PNG nguồn → preview → tệp tải xuống | Đọc pixel độc lập, kiểm TLV lồng nhau và CRC; đúng BIN, tài khoản giả lập, 500.000 VND và memo |
| CORS trực tiếp từ browser | Chưa xác minh: timeout / opaque fetch failure; không suy ra đây là nguyên nhân iPhone |
| Safari iPhone / Android thật / Zalo WebView / app ngân hàng | `NOT_RUN / BLOCKED`; không chuyển tiền thật |
| SDK callsites getDoc/getDocs/onSnapshot | **29/44/16**, không tăng |
| root/public | **124/124**; sinh bằng build:public nguyên gốc |

Các FAIL của bộ V7 trên V4 gốc là các điều kiện kiểm thử chưa đạt, **không phải 93 lỗi độc lập**. Có cả các yêu cầu mới về authority, mã lỗi và bộ giải mã mà V4 chưa cung cấp.

## Các sửa đổi trong bản full thử nghiệm

1. Chuẩn hóa mã ngân hàng bằng danh mục QRBankingHelpers hiện có. AGRIBANK/AGB/970405, MB/970422, VCB/970436, BIDV/970418 và các ngân hàng được hỗ trợ đều dùng BIN nhất quán. Kiểm tất cả bankId/bin/bankCode/bankName không rỗng, từ chối mâu thuẫn. Không ghép ngân hàng và số tài khoản từ hai bản ghi, không chọn ngầm bank1. Giữ số 0 đầu và từ chối số tài khoản dạng số hoặc ký hiệu khoa học.
2. Siết phân giải cơ sở: branchCount hợp lệ trong 1–10, tên riêng/Unicode và alias phải xác định duy nhất. Thiếu map, map cũ không còn nhận diện, map mâu thuẫn, tài khoản tắt hoặc thiếu tuple đều bị chặn. Giữ chính sách legacy một tài khoản chỉ khi server settings thực sự ghi branchCount=1; không tự sửa cài đặt.
3. Dùng metadata của **listener settings hiện hữu** để cấp dấu xác nhận cho phiếu. Bootstrap mặc định, cache-only, pending writes, cấu hình thiếu, sai CLB hoặc sai principal/generation không được coi là tài khoản nhận tiền đã xác thực. Không thêm reader/listener/writer. Receipt dùng bản dữ liệu settings đã nhận từ callback, không dùng trường ngân hàng mặc định được merge từ bootstrap.
4. Sửa hàng đợi xuất phiếu hiện hữu thành FIFO thực sự. Enqueue B không hủy job A hợp lệ. Mỗi job có jobId/kind/outcome; phân biệt hiệu lực job với nút tải đang hiển thị. Thay bank/cơ sở/phiên làm link cũ mất hiệu lực; callback của phiếu cũ không xóa phiếu mới. Giữ biên lai đã thu ở JPEG và giữ mã lỗi legacy cho caller PAID.
5. Giữ lỗi sơ cấp từ owner tới caller Báo nợ/Thu gộp. Hai delegate legacy và students.js đều return Promise. Thu gộp dùng cơ sở thật của hồ sơ cho action=report, không mượn CS1; lỗi số tiền đi qua cùng hàng đợi để xóa link cũ. Bỏ alert chung gây hiểu nhầm “chưa ghi khoản thu”. Không sửa cách tính học phí/paidUntil hay thêm retry thu tiền.
6. Kiểm PNG, decode, bộ dữ liệu EMV, ảnh preview và tính nhất quán trước tải. Không có bộ giải mã native thì **chặn an toàn bằng QR_VERIFICATION_UNAVAILABLE**. Đây là điểm chặn có chủ ý trong prototype; chưa có JS decoder production đã được duyệt cho Safari.
7. Memo được chuẩn hóa rõ thành chữ/số/khoảng trắng, hiển thị trên phiếu, giữ đủ kỳ và không âm thầm cắt ở 48 ký tự. Nội dung dài bị chặn bằng MEMO_TOO_LONG. Quy tắc này cần chủ hệ thống chấp nhận trước phase production; chưa có quy tắc viết tắt tự động cho tên dài/phiếu gia đình.

## Hai lỗi được tái hiện ở đâu

Trên cấu hình **giả lập đã map đúng cơ sở, MB, học phí 500.000 VND**, cả nút QR Báo nợ và nút TẠO PHIẾU BÁO đều đến resolver rồi dừng đầu tiên tại `generateVietQR` của V4: regex chỉ nhận BIN dạng số và từ chối MB. Không có fetch QR trước điểm dừng đó. F02 còn bị alert wrapper làm mất nguyên nhân sơ cấp. Bằng chứng ở `browser-before/results.json` và ảnh trước sửa.

Đây là root cause đã xác nhận **trên exact V4 và fixture đó**. Không đủ cấu hình/log iPhone thật để kết luận hai request production cũng dừng tại cùng điểm. Nếu production thiếu branch map, chưa xác thực settings, đổi phiên hoặc lỗi mạng, lỗi đầu tiên sẽ khác và bản vá trả đúng nhóm mã tương ứng.

Hàng đợi V4 tăng request epoch cho mọi enqueue và từ chối job trước, kể cả biên lai PAID còn hợp lệ. Kiểm QuickPay gốc 23/24 và kiểm FIFO actual-handler xác nhận regression này.

## Những gì chưa thể gọi là hoàn tất

- Cần duyệt và tích hợp bộ giải mã pixel dùng được trên Safari vào production, hoặc chứng minh BarcodeDetector thực sự có trên thiết bị mục tiêu. Trong Chromium hiện tại, API này không có; runtime không có adapter kiểm thử sẽ chặn xuất QR. Không được lấy 10 lượt có test adapter làm chứng nhận native Safari.
- Cần đo HTTP/CORS/redirect trên iPhone với đúng build và phiên. HTTP client tải PNG thành công không chứng minh CORS trong browser. Chưa có quyền hoặc dữ liệu để xác minh bank mapping thật.
- Cần chấp nhận quy tắc memo, xác định cách xử lý tên dài/phiếu gia đình mà vẫn giữ đủ kỳ. Không có thao tác sửa dữ liệu nợ để khớp memo.
- Cần khép các gate release đang FAIL ở dưới. Giữ nguyên gate và package scripts, không hạ điều kiện PASS.

| Gate chưa đạt | Bằng chứng / giới hạn |
|---|---|
| check:d1c3b7r2r5-shift-touch-closure | 88 kiểm thử handler PASS; bước CSS browser kế thừa thiếu Python playwright |
| check:d1c3b7r2-mobile-css-runtime | Bước browser kế thừa thiếu Python playwright; kiểm QR mới không thay thế gate này |
| check:d1c3b7-release-security | Chưa xác minh Rules Emulator do thiếu Firebase CLI; thiếu hồ sơ chấp thuận chi phí document reads |
| check:d1c3b6-release-blockers | Phụ thuộc gate security chưa khép |
| check:d1c3b-debt-authoritative-profile-coverage | Assertion về query branch/status của Coach không đạt trên cả V4 gốc; profiles listener không bị sửa trong V7 |

`npm run check:all:critical` và `npm run check:release` đã chạy cuối, đều exit 1. Chúng dừng ở gate mobile đầu tiên; 148 script con được chạy riêng để thấy các lỗi phía sau. Chạy riêng script con là bổ sung bằng chứng, **không thay kết quả của chuỗi release**.

## Phạm vi bảo toàn và giới hạn authority

Không triển khai, không ghi Firestore production, không thu tiền, không phát hành giao dịch tài chính mới. Các đường report đã chạy có 0 SDK/financial writes; spy gắn vào các biến API thực mà handler dùng, kèm ca chứng minh spy bắt được lời gọi nếu có. Những kiểm chứng này diễn ra trong sandbox, không phải log Firestore production.

Giữ nguyên Rules, Auth, FinanceService, TuitionCommandBoundary, công thức nợ, Kho, Thi đai, Điểm danh, journal và saveClubSettings. Bộ kiểm PAID/idempotency/atomicity đã đạt; khối primary pay trong processMultiItem giữ nguyên byte. Không thêm endpoint production, CDN decoder, queue hay Firestore owner thứ hai. Metadata-only callback có thể làm UI nhận thêm sự kiện từ listener đã có; số callsites tĩnh không phải số document reads thực tế.

Cấu hình đổi trên thiết bị khác chỉ bị phát hiện khi listener hiện hữu của phiên này đã nhận biết. Không cam kết xác minh server tức thời trước mỗi lần download; không thêm reads để tạo cam kết đó.

## Đọc gói bàn giao

- `QR_V7_FULL_SOURCE_TEST_ONLY.zip`: toàn bộ dự án, public đã build, các test mới, fixture, phụ thuộc giải mã PNG dùng cho test và các báo cáo V7. Tệp lịch sử V4 và các phase trước được giữ nguyên; trạng thái hiện tại nằm trong README_QR_V7.md.
- `QR_V7_EVIDENCE_AND_DECISION_PACKAGE.zip`: bản full ở trên, báo cáo này, unified diff, danh sách file đổi, SHA-256 BEFORE/AFTER, raw logs, kết quả từng script, PNG nguồn/preview/download và ảnh kiểm thử bằng dữ liệu giả lập.
- `QR_V7_CASE_MATRIX.csv` và `FINAL_REGRESSION_RESULTS.json`: tra từng ca / lệnh và lớp bằng chứng; các bản chạy trước đó trong thư mục evidence chỉ là lịch sử, kết quả quyết định ở `final/` và `browser-final/`.

SHA-256 đầu vào: `0385603e77b25df181513f168b145ebcb139da47660b2a8ef91fa95b8ab47592`.
SHA-256 app.js sau sửa: `043173828e5f5543b33ef3a27401d9dac1dedc78486c25ba5d4bde0dd982b70e`.
SHA-256 Rules giữ nguyên: `170c2a7218fa4c930c23cc7f7621190160ea602fe2ed1bd7210d691ae0e33652`.

Không dùng bản này thay production cho tới khi các điều kiện trên được duyệt và kiểm chứng. Các bước cụ thể và phương án quay lại nằm trong QR_V7_NEXT_STEPS_AND_ROLLBACK.md.

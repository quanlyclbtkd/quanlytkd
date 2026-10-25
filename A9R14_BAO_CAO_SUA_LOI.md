# A9R14 — Sửa bốn FAIL và sắp xếp bộ lọc trên mobile

Ngày bàn giao: 25/10/2026, giờ Việt Nam.

## Kết quả

Bốn FAIL được yêu cầu đã khép. Bộ kiểm tra mặc định đạt **58/58**, `check:all` đạt **97/97**. Trên mobile, **Kỳ / Tháng** nằm ở hàng đầu, toàn chiều ngang; ô tìm kiếm và Cơ sở nằm ở hàng kế tiếp. Desktop giữ bố cục trước đó.

Đã kiểm tra hình học trình duyệt và thao tác tìm kiếm thật bằng dữ liệu giả trong RAM. Mã thực thi của 122 tệp JavaScript runtime giống A9R13 sau khi chuẩn hóa cache token; 5 tệp tìm kiếm/sự kiện được đối chiếu nguyên byte.

## 1. Phân tích và sửa từng FAIL

| Kiểm tra | Nguyên nhân đã xác định | Sửa trong A9R14 | Kết quả |
|---|---|---|---|
| `attendance-canonical-ownership` | `app.js` chứa nhiều khối JSDoc dài; kích thước vượt hai trần đã đặt. Những kiểm tra ownership, phân trang và lifecycle còn lại đều đạt. | Chuyển 16 khối tài liệu API sang `docs/APP_API_NOTES.md`, giữ chú dẫn ở vị trí cũ. Giữ nguyên trần 700.000 byte / 11.300 dòng. So sánh cây cú pháp chứng minh mã thực thi không đổi. | **141/141 PASS** |
| `security-coach-branch-boundary` | QA chỉ nhận một số build cũ và đếm marker lịch sử trong HTML; assertion Rules đòi helper alias cũ, trong khi A9R12 đã dùng membership trực tiếp trong `allowedBranches`. | Kiểm tra source được pin, root/public, build và toàn bộ import graph. Assertion kiểm tra đúng helper canonical hiện tại, đồng thời giữ kiểm tra canonical profile, authority và cấm blind delete. | **35/35 PASS** |
| `coach-branch-runtime-repair` | Source mới bị rơi vào harness V4B1: fixture không có metadata server, chỉ một branch, kỳ vọng HLV tự ghi mirror. Hợp đồng hiện tại xác minh assignment từ server, so sánh version/allowlist và dành repair cho Admin qua CAS. | Source pin khai báo hợp đồng assignment hiện tại. Gate chạy 7 suite thực thi đang phù hợp: assignment, Admin save, preflight/ACK, login thật, repair CAS, nút repair và tạo/khôi phục Auth. Kiểm tra hash Rules ở fixture cũ cũng chuyển sang đúng source pin hiện tại. | **7 suite / 77 ca PASS** |
| `v5u2e-attendance-excel-sdk-fix` | Kiểm tra phụ thuộc `CUTOVER_PROOF.json` và mẫu build `active-20261022-*`; đây là chứng cứ phát hành cũ, không phải dependency của SDK xuất Excel. | Kiểm tra SDK qua source pin, parity, import graph, client/Rules gate và authority. Vẫn giữ các kiểm tra `documentId`, export đọc dữ liệu, thứ tự document và cursor. Gate phê duyệt phát hành độc lập được giữ nguyên. | **22/22 PASS** |

### Kích thước app.js

| Chỉ số | A9R13 | A9R14 | Trần giữ nguyên |
|---|---:|---:|---:|
| Byte | 703.656 | **698.720** | 700.000 |
| Dòng | 11.317 | **11.211** | 11.300 |

Cây cú pháp được so sánh sau khi bỏ thông tin vị trí dòng/cột và chuẩn hóa cache token. Không thay đổi biểu thức, hàm, sự kiện hoặc luồng ghi để giảm kích thước. Các ghi chú API đầy đủ còn trong tệp tài liệu.

## 2. Bố cục mobile và tìm kiếm

Thay đổi tập trung trong media query `max-width: 767px` của `css/ui-mobile-shell.css`:

- Hàng 1: nhãn **📅 Kỳ / Tháng** và ô tháng, toàn chiều ngang.
- Hàng 2: **Tìm tên, SĐT, đai...** bên trái; Cơ sở bên phải.
- Nhãn 12 px; giá trị trong input/select 16 px; placeholder tìm kiếm 14 px. Giữ mục tiêu chạm tối thiểu 44 px.
- Khai báo rõ hai cột để selector CSS cũ cho một cột không tạo cột ngầm và làm ô tháng chỉ rộng nửa hàng.
- Từ 768 px, quy tắc desktop tiếp tục được dùng; hình học được so sánh với A9R13 tại 1024 px.

Các element `searchInput`, `filterMonth`, `filterBranch` vẫn là đúng những node hiện hữu. Markup bộ lọc, ID, event adapter, debounce, xếp hạng tên, cache tìm kiếm và xử lý bộ gõ tiếng Việt được giữ nguyên.

Năm tệp đối chiếu nguyên byte với A9R13:

1. `js/modules/searchRuntime.js`
2. `js/core/studentSearchIndex.js`
3. `js/modules/students/students.search.js`
4. `js/events/students.events.js`
5. `js/events/finance.events.js`

Kiểm thử trình duyệt dùng search controller và index thật, kiểm tra tên tiếng Việt không dấu, SĐT, đai, gõ nhanh lấy truy vấn mới nhất, composition IME, đổi tháng chỉ gọi callback một lần và resize giữ nguyên node input. Dữ liệu nằm trong RAM; không phát sinh server search trong các ca này.

## 3. Các fixture cũ phát hiện thêm khi chạy tổng thể

Để hồi quy đúng hợp đồng đang chạy, đã sửa thêm các lỗi trong **mã kiểm thử**:

- `tools/v11/journal-mutations.mjs` đang mở cứng Journal V3, trong khi runtime dùng V4. Fixture nay lấy `JOURNAL_DATABASE` từ hợp đồng hiện tại, xử lý lỗi mở schema rõ ràng và giữ đủ kiểm tra âm. Kết quả: 6 ca dương tính và 6 mutation bị bắt.
- Negative control trong `tools/v11/emulator.mjs` còn tìm tên helper Rules trước A9R12 nên không tạo được mutation. Đã nhận đúng helper canonical; cả việc bỏ historical proof và bỏ canonical-profile check đều bị kiểm thử phát hiện.
- Fixture Rules tổng thể dùng cùng previous version cho canonical assignment chưa tồn tại và User mirror legacy đã tồn tại. Fixture sửa hai precondition riêng `absent` / `legacy`, đồng thời thêm ca DENY cho precondition sai. Quy tắc server và writer ứng dụng giữ nguyên.
- Kiểm tra CSS bằng Python được chạy với Playwright trong môi trường kiểm thử. Không đóng gói trình duyệt, dependency cài đặt hoặc ảnh chụp kiểm tra vào source.

## 4. Kiểm thử và bằng chứng

| Phạm vi | Kết quả |
|---|---:|
| `precheck` + `check` | **58/58 PASS** |
| `check:all` | **97/97 PASS** |
| `check:all:critical` | **124/127 PASS; 3 gate phát hành còn HOLD** |
| Lệnh kiểm tra duy nhất sau khi loại phần trùng | 159: 156 PASS, 3 gate phát hành exit 1 |
| Mobile 320, 360, 390, 430, 767 px; desktop 1024 px; tương tác search | **7/7 PASS** |
| Negative controls cho source pin, parity, Rules, indexes, gate và proof giả | **10/10 PASS** |
| Service Điểm danh thật + Emulator | **22/22 PASS** |
| Trình duyệt + Firebase SDK 10.7.1 thật + Emulator | **7/7 PASS** |
| Rules tổng thể | **74/74 PASS** |
| V11 SDK/CAS/Rules | **20 ca được xác minh**, gồm 2 mutation bị bắt |
| V11 UI/IndexedDB/SDK | **28/28 PASS**, viewport mô phỏng |
| Phép đo kết quả truy vấn với 1.000 / 1.500 profiles | **6/6 kịch bản PASS** |
| JavaScript runtime so sánh AST với A9R13 | **122/122 không đổi mã thực thi** |
| Root/public và source identity | **128/128 PASS** |
| Syntax | **PASS** |

Trình duyệt kiểm thử là Chromium headless. Các tên viewport iPhone/Android trong log là mô phỏng; chúng không thay cho nghiệm thu thiết bị vật lý. Emulator cục bộ v1.19.8, Node Firebase SDK 12.15.0; có suite riêng chạy browser SDK 10.7.1 giống ứng dụng. Các ca DENY in `PERMISSION_DENIED` là kết quả mong đợi khi kết quả ca kiểm thử ghi PASS.

### Ba gate phát hành còn HOLD

Kết quả exit 1 được giữ nguyên, không thay bằng PASS:

| Gate | Lý do còn HOLD |
|---|---|
| `d1c3b7-release-security` | Toàn bộ component Rules/SDK/browser và phép đo đã chạy đạt; thiếu hồ sơ chấp thuận chi phí đọc do chủ hệ thống cung cấp. |
| `d1c3b6-release-blockers` | Gate này gọi lại gate B7 nên tiếp tục HOLD theo cùng hồ sơ còn thiếu. |
| `v10-release-risk-boundary` | Quyết định cho transaction/version READS vẫn `pending`; thiếu hồ sơ nghiệm thu production/thiết bị theo hợp đồng phát hành cũ. |

Đây là các chốt phê duyệt đã có trong hệ thống. Bốn FAIL được yêu cầu sửa đều đã PASS. A9R14 không tự tạo hồ sơ chấp thuận READS, không tạo proof cutover giả và không thay đổi các gate phát hành để bỏ điều kiện còn thiếu.

Phép đo READS dùng dữ liệu giả và đếm document kết quả truy vấn. Nó không phải số phí production. A9R14 giữ nguyên logic runtime, reader/writer và topology listener so với A9R13; các số đo phản ánh cấu trúc branch-only đã có từ trước.

## 5. Phạm vi bàn giao

- Build: `qr-v11r6-a9r14-qa-mobile-20261025`.
- Giữ Rules, indexes, phân quyền HLV, CAS, authority và Journal V4 của A9R13.
- Source ZIP đầu vào: `A9R13_FULL_SOURCE(1)(1).zip`, SHA-256 `31030b29f44c171c7f3c4e891ff05c4ce393877fd63db7d3daccd59baa3be88f`.
- Rules SHA-256 giữ nguyên: `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3`.
- Dữ liệu và website production chưa được thay đổi trong phiên này. Việc đối soát attendance cũ đang bị khóa tiếp tục theo quy trình A9R13.
- Bằng chứng mới đặt trong `evidence/A9R14`; các báo cáo A9R13 được giữ để truy vết.

Hướng dẫn dùng source và chạy lại kiểm tra: `A9R14_HUONG_DAN.md`.

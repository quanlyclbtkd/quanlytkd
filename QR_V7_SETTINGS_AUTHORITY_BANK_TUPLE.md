# Authority của cấu hình, cơ sở và ngân hàng

getPaymentAccountForBranch vẫn là owner chọn thụ hưởng. QRBankingHelpers.findBank/normalizeBankAccountStrict chỉ nhận diện/chuẩn hóa. Helper resolveBankAccountForBranch cũ vẫn có fallback display-only; test chứng minh gọi nhầm helper có thể trả tài khoản nhưng receipt authority vẫn từ chối cơ sở unknown. Không xóa hoặc chuyển owner ngoài phạm vi.

Tuple dùng chung cho URL, chữ trên phiếu, kỳ vọng giải mã và download: clubId, branchKey, bankKey, bankBin, accountNo, accountName, amount, memo, intentKind. Tất cả định danh bank không rỗng trong một record phải về cùng BIN; mã số lạ cũng bị từ chối, không chỉ kiểm regex. Tài khoản enabled phải rõ ràng, tên chủ tài khoản không trống, số tài khoản là chuỗi bảo toàn số 0.

Settings được đóng dấu bởi callback onSnapshot đã tồn tại với includeMetadataChanges. Chỉ nhận document tồn tại, fromCache=false, hasPendingWrites=false, principal/generation/CLB hợp lệ. Snapshot raw được clone để dữ liệu mặc định bootstrap không trở thành authority khi server thiếu field. Cờ __settingsSnapshotReady cũ vẫn giữ hợp đồng cũ; receipt còn yêu cầu dấu metadata riêng từ chính callback đó. Không hardcode readiness khi chạy test: test gọi lại callback thật với metadata cụ thể.

Fingerprint bao phủ branchCount, branchName1..10, map, mọi record ngân hàng, legacy bank identifiers/account/enabled, principal, role, generation, club và policy version. Input branch/breakdown được snapshot tại enqueue. Việc cập nhật được phiên hiện tại nhận biết sẽ làm callback tải cũ mất hiệu lực. Không có read/listener mới để bảo đảm kiểm chứng tức thời trên máy khác.

Danh mục vẫn là 10 ngân hàng trong QRBankingHelpers gốc, thêm alias/code/tên chính thức đã đối chiếu từ snapshot [VietQR Bank API](https://api.vietqr.io/v2/banks) ngày 20/10/2026. Không mở thêm ngân hàng chưa được duyệt. ppOpenTransferSheet cũ có ACB/VIB ngoài danh mục helper; V7 không lấy danh sách hoặc fallback của sheet đó làm authority. Nếu cần ACB/VIB hoặc bank chưa có, phải duyệt cập nhật danh mục riêng.

| Mã UI / alias | BIN |
|---|---|
| AGRIBANK / AGB / VBA | 970405 |
| MB / MB Bank / MBBank | 970422 |
| VCB / Vietcombank | 970436 |
| BIDV | 970418 |
| CTG / ICB / VietinBank | 970415 |
| TCB / Techcombank | 970407 |
| VPB / VPBank | 970432 |
| TPB / TPBank | 970423 |
| HDB / HDBank | 970437 |
| STB / Sacombank | 970403 |

Nguồn API đầy đủ nằm trong evidence/banks-provider.json và tools/qr-v7/fixtures/bank-registry-provenance.json. Không fetch danh mục này trong production. Test kiểm cả tên ngân hàng chính thức, code, shortName và BIN của cả 10 bank.

Không có map/branchCount hợp lệ: yêu cầu Admin xác minh qua giao diện Cài đặt hiện hữu. Không triển khai migration, không tự đoán chỉ vì một tài khoản còn active. Đổi tên cơ sở mà còn key cũ không nhận diện được sẽ bị chặn; cần làm sạch cấu hình qua một thay đổi có phê duyệt.

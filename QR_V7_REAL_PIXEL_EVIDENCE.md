# PNG, pixel và giới hạn chứng cứ

HTTP client đã tải provider PNG với fixture MB / tài khoản giả lập / 500000 VND / memo TEST VDV Hoc Phi Thang 10 2026. File gốc: provider-exact-intent.png. Không chuyển tiền, không kiểm chứng sự tồn tại hoặc chủ tài khoản bằng giao dịch ngân hàng.

Chromium component test dùng HTML gốc, nút gốc, actual handlers, initStudents thật và html2canvas 1.4.1 của lazy owner. Vì BarcodeDetector native không có trong Chromium này, test cài một adapter jsQR 1.4.0 **chỉ trong trang test**. Ảnh được phát lại từ capture HTTP; nguồn được ghi `HTTP_CLIENT_PROVIDER_CAPTURE_REPLAY_NOT_BROWSER_CORS`. Không gọi đây là request CORS provider end-to-end.

10 lượt thành công gồm 2 nút × 5 viewport. Tệp PNG tải bằng sự kiện download thật được mở lại; jsQR đọc pixel; Python binascii.crc_hqx và parser TLV độc lập đối chiếu EMV. Không import generator hoặc parser production làm oracle. AccountName chỉ kiểm chữ hiển thị, không giả định có trong payload EMV.

Kết quả provider/preview/download nhất quán về BIN 970422, tài khoản giả lập có số 0 đầu, amount 500000 và memo chính xác. Byte PNG giữa nguồn và phiếu có thể khác do raster hóa; không dùng byte equality làm chuẩn chính. Ảnh QR giữ tỷ lệ 1:1 và nền trắng; decoder nhận được QR từ ảnh phiếu thực. Kiểm quiet-zone tại runtime là kiểm biên hình học bảo thủ, chưa phải đo chuẩn đủ bốn module cho mọi phiên bản QR; phần kiểm chất lượng/mật độ đầy đủ trên iOS vẫn BLOCKED.

Các negative PNG thật: trắng, sai ngân hàng/tài khoản/amount/memo, CRC sai, crop hết viền, kéo dãn, làm mờ mạnh, truncate. Đều bị từ chối; preview khác provider cũng bị từ chối. Không dùng PNG trắng/1×1/mock toDataURL làm bằng chứng cuối. Mock DOM/canvas chỉ tồn tại ở lớp unit/actual-handler, được ghi rõ trong log.

HTTP từ browser thử Accept mặc định và image/png đều chưa khép được trong sandbox (timeout/opaque fetch). HTTP client thành công không chứng minh browser CORS. Không nới no-cors/allowTaint, không thêm proxy/provider/encoder khác. Safari/iPhone, Android thật, Zalo WebView và app ngân hàng: NOT_RUN. Không gắn nhãn QR END-TO-END CLOSED.

Tham chiếu khung tiêu chuẩn: [EMVCo QR Codes](https://www.emvco.com/emv-technologies/qr-codes/). Bộ parser này kiểm scheme VietQR/QRIBFTTA đã quan sát; không phải tuyên bố chứng nhận toàn bộ EMVCo.

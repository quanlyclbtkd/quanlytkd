# Call chain và lỗi đầu tiên

| Luồng | Đường gọi hiện hữu | Kết quả trong exact V4 fixture MB map đúng |
|---|---|---|
| Báo nợ | studentsRenderer/legacy row → generateMultiMonthPaymentRequest → exportReceipt → _receiptRenderQueue → _exportReceiptNow → getPaymentAccountForBranch → generateVietQR → fetch → decode → canvas → preview/download | Dừng đầu tiên ở intent: bank token MB bị regex BIN từ chối; chưa tới fetch |
| Thu gộp | index.html processMultiItem('report') → checkbox học phí, tháng, total=500000, breakdown=500000, branch hồ sơ → await exportReceipt → result.ok | Cùng điểm dừng trên fixture này; sau đó wrapper của V4 thêm alert chung làm mất thông tin |
| PAID và bấm nhiều yêu cầu | exportReceipt enqueue A/B → request epoch | V4 từ chối A trước render dù principal/config còn đúng; QuickPay 23/24 |

Module students được init sau legacy trong luồng bootstrap có trong index/main. Trong component browser test đã gọi initStudents thật và chứng minh module thay delegate legacy; cả hai delegate sau sửa đều trả Promise. Đây không phải trace của main.js/Firebase bootstrap đầy đủ hay effective owner trên iPhone thật.

Provider, cache và cấu hình production chưa có trace thiết bị; những lỗi đó không được kết luận là root cause production. Bốn tệp tĩnh công khai khớp V4 nhưng cache/principal/config của iPhone vẫn LIVE_NOT_CORRELATED.

Lỗi trả về có stage/reason/jobId/kind. Network TypeError trong browser không cho phép phân biệt chắc CORS, DNS, proxy hoặc redirect bị reject; QR_FETCH_CORS là nhóm opaque fetch rejection, không phải bằng chứng CORS sai. Redirect có phản hồi nhận diện được thì QR_FETCH_REDIRECT; HTTP, MIME, timeout, bytes, decode, EMV, canvas, preview và modal có mã riêng. Không log Error gốc có URL/nội dung nhạy cảm ở receipt owner.

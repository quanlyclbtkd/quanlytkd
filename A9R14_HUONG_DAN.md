# Dùng bản A9R14

## Tệp và phiên bản

Giải nén ZIP vào thư mục riêng, ví dụ `D:\A9R14\source`.

Đọc `A9R14_BAO_CAO_SUA_LOI.md` để xem nguyên nhân, bản sửa và phạm vi kiểm thử. Ghi chú API đã chuyển từ `app.js` nằm trong `docs/APP_API_NOTES.md`.

Khi cập nhật website bằng quy trình hiện tại, dùng đúng cây runtime root hoặc `/public` theo cấu hình hosting đang dùng; hai cây đã được đối chiếu 128/128. Giữ nguyên cách deploy GitHub Pages hiện hữu của anh.

Kiểm tra build ở Console:

```javascript
window.APP_BUILD_VERSION
```

Giá trị cần thấy: `qr-v11r6-a9r14-qa-mobile-20261025`.

Rules và indexes không đổi so với A9R13. A9R14 là bản sửa QA và bố cục; các chốt nghiệm thu production còn HOLD được nêu trong báo cáo.

## Kiểm tra nguồn trên Windows

```powershell
cd D:\A9R14\source
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R14-Verify.ps1
```

Script chạy bốn gate được sửa, kiểm tra âm cho source profile và syntax. Nó không deploy hoặc ghi Firestore thật.

Để chạy lại bộ kiểm tra thông thường:

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd run check
npm.cmd run check:all
```

Kết quả phiên bàn giao: 58/58 và 97/97 PASS. `check:all:critical` vẫn có ba gate phát hành yêu cầu hồ sơ chủ hệ thống, xem báo cáo.

Để lặp lại suite Điểm danh cục bộ:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R14-Attendance-Emulator.ps1
```

Script dùng project `demo-*` / loopback. Các test browser cần Chromium của Playwright hoặc biến `PLAYWRIGHT_CHROMIUM_EXECUTABLE` trỏ trình duyệt được cài. Kiểm tra UI mobile bổ sung chạy bằng `npm.cmd run qa:a9r14-mobile`; khi muốn đối chiếu desktop với A9R13, đặt `A9R14_BASELINE_ROOT` trỏ thư mục source A9R13 trước khi chạy.

## Kiểm tra nhanh trên điện thoại

1. Mở Học phí hoặc Đang tập: Kỳ / Tháng ở hàng trên, ô tìm kiếm ở hàng dưới.
2. Chọn tháng rồi tìm tên, SĐT hoặc đai; thử xóa và nhập lại.
3. Chuyển tab để xác nhận hành vi tìm kiếm cũ tiếp tục được giữ.

Các ID/handler tìm kiếm không được thay. Kiểm thử bàn giao đã xác nhận tên tiếng Việt, SĐT, đai, gõ nhanh, IME và bộ lọc tháng bằng controller/index thật.

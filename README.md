# Quản lý CLB Taekwondo — mã nguồn V11R6 A5

Ứng dụng Vanilla JavaScript và Firebase. Bản nguồn giữ profile **maintenance**; Điểm danh HLV chỉ mở bằng quy trình cutover đã được phê duyệt. Upload mã nguồn lên GitHub không phải phê duyệt phát hành active.

## Cài đặt và kiểm tra

```bash
npm ci
npx playwright install chromium
npm run check:a5-attendance-lifecycle
npm run check:a5-owner-boundary
npm run check:syntax
npm run check:cutover-output-safety
npm run build:public
npm run check:root-public-parity
```

`public/` là thư mục Firebase Hosting. `app.js`, `index.html`, `js/` và `css/` tại gốc là nguồn canonical. Chạy `build:public` sau khi sửa giao diện hoặc runtime.

## Điểm danh và dữ liệu chờ đồng bộ

Cấu hình ca chỉ được chấp nhận sau khi có bằng chứng máy chủ và danh sách hợp lệ. Khi kết nối trở lại, owner hiện hữu xác minh lại cấu hình ca một lần trước khi gửi journal. Nếu chưa xác minh được, nhật ký được giữ nguyên; chờ kết nối ổn định rồi chọn **Đồng bộ lại**. Mục không còn đúng ca hoặc quyền được giữ để đối soát.

Nhãn **Đang lưu trên thiết bị** chưa xác nhận IndexedDB đã lưu. **Chờ máy chủ xác nhận** là intent đã lưu nhưng chưa nhận ACK. **Cần đối soát** giữ lại thao tác xung đột hoặc không đủ điều kiện. Các nhãn này không phải xác nhận thanh toán hay dữ liệu tài chính.

Chỉ thao tác trên danh sách đã hiển thị đúng ngày/cơ sở/ca. Lịch sử võ sinh kiểm tra thứ tự yêu cầu và tài khoản hiện tại. Các lần xem lại máy chủ để đối soát dùng phiên bản được hiển thị gần nhất; nếu máy chủ đổi tiếp, CAS vẫn yêu cầu đối soát.

Các kiểm thử trình duyệt cần Playwright/Chromium; kiểm thử Rules cần Firestore Emulator và Java phù hợp. Đọc `tools/requirements-qa.txt` cho công cụ QA Python. `npm run check:release` và cổng cutover phải tiếp tục HOLD khi chưa có bằng chứng và phê duyệt hợp lệ.

## Công cụ cutover

`activate()` chỉ nhận thư mục đích chưa tồn tại và tạo candidate cục bộ. Không truyền thư mục source, thư mục cha chứa source hoặc thư mục có dữ liệu. `make-demo-active.mjs` tạo checkout DEMO tách biệt. `refresh-demo-proof.mjs` chỉ cập nhật metadata của chính candidate DEMO có proof hợp lệ và runtime/Rules/index giữ nguyên; candidate đã sao chép sang thư mục khác phải được tạo và kiểm thử lại.

Nếu refresh bị ngắt hoặc hai tệp proof không khớp, dừng candidate đó, tạo thư mục candidate mới và kiểm thử lại. Không sửa JSON để bỏ qua kiểm tra. Phép thử lỗi ghi đè và ngắt metadata nằm trong `npm run check:cutover-output-safety`.

Các JSON trong `handoff/` đi kèm là manifest khóa danh tính source hoặc cấu hình quyết định còn hiệu lực cho công cụ. Giữ nguyên các quyết định `pending`. Mẫu trống phục vụ vận hành và hướng dẫn index đi kèm cho các contract hiện hữu. Không có báo cáo kiểm toán, log kiểm thử, ảnh chụp người dùng, dữ liệu Firestore, dependency đã cài hoặc binary Emulator/Chromium trong gói.

S01, phê duyệt chi phí READS/CAS, đối soát journal V1/V2, giao dịch học phí thật, client cũ và nghiệm thu Android/iPhone phải được hoàn tất trên đúng môi trường trước khi xét phát hành. Không thu lại hoặc tạo giao dịch bù khi chưa đối soát nguyên nhân.

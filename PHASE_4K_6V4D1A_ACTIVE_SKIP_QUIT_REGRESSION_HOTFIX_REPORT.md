# Phase 4K-6V4D1A — Active Skipped Month + Quit Tab Regression Hotfix

## Phạm vi

Bản này chỉ sửa đúng 2 lỗi người dùng báo sau V4D1:

1. Tab **Đang tập**: khung **Báo nghỉ tháng** không hiện các võ sinh đã báo nghỉ tháng hiện tại để miễn học phí.
2. Tab **Đã nghỉ**: danh sách võ sinh đã nghỉ không đầy đủ.

Không thay đổi logic Báo nợ/Học phí/Kho đồ/Thi đai, không migration, không ghi Firestore, không thêm listener, không thêm aggregation query.

## Nguyên nhân chính

### 1. Báo nghỉ tháng bị ẩn

V4D1 đưa thêm `profileCanonicalStore.js` và dùng lại các helper canonical hiện có. Tuy nhiên các helper trạng thái cũ vẫn coi mọi chuỗi chứa `nghỉ/nghi`, đặc biệt `Báo nghỉ`, là trạng thái nghỉ tập hẳn. Vì vậy võ sinh có trạng thái/thông tin legacy kiểu `Báo nghỉ`, `Báo nghỉ tháng`, `Nghỉ tháng`, dù có `skippedMonths` đúng tháng hiện tại, vẫn có thể bị phân loại là `quit` và bị loại khỏi khung Báo nghỉ tháng.

### 2. Tab Đã nghỉ không đầy đủ

Bộ lazy loader Đã nghỉ đã có nhiều query cho `quit/inactive/retired`, `Đã nghỉ`, `Nghỉ tập`, các cờ boolean và ngày nghỉ. Nhưng vẫn thiếu một số alias nghỉ tập hẳn phổ biến như `Dừng tập`, `Ngừng tập`, `Bỏ tập`, `Thôi tập`. Những hồ sơ chỉ có các status này và không có `quitDate/active=false` có thể không được query vào danh sách Đã nghỉ.

## Cách sửa

### A. Phân biệt “Báo nghỉ tháng” và “Nghỉ tập hẳn”

Thêm nhận diện monthly skip status:

- `Báo nghỉ`
- `Báo nghỉ tháng`
- `Nghỉ tháng`
- `Tạm nghỉ tháng`
- `Miễn học phí`

Các trạng thái này không còn bị xem là `quit` nếu không có tín hiệu nghỉ hẳn như `active=false`, `quitDate`, `ngayNghi`, `isQuit=true`, `stopped=true`.

Áp dụng trong:

- `js/data/profileStatusConfig.js`
- `js/core/tuitionDebtCanonical.js`
- `js/core/profileCanonicalStore.js`
- `js/ui/render.js`
- `app.js`

### B. Khôi phục khung Báo nghỉ tháng an toàn hơn

Khung Báo nghỉ tháng giờ ưu tiên điều kiện:

- có `skippedMonths` trùng tháng đang chọn;
- không có tín hiệu nghỉ tập hẳn.

Không còn phụ thuộc mù vào `deriveProfileCanonicalState()`/`classifyProfileStatus()` nếu profile có monthly skipped month hợp lệ.

### C. Bổ sung alias Đã nghỉ còn thiếu

Lazy loader Đã nghỉ bổ sung query alias:

- `Dừng tập`, `dừng tập`, `Dung tap`, `dung tap`
- `Ngừng tập`, `ngừng tập`, `Ngung tap`, `ngung tap`
- `Bỏ tập`, `bỏ tập`, `Bo tap`, `bo tap`
- `Thôi tập`, `thôi tập`, `Thoi tap`, `thoi tap`

Không thêm `Báo nghỉ` vào alias Đã nghỉ để tránh đưa võ sinh báo nghỉ tháng sang tab Đã nghỉ.

## Files chính thay đổi

- `js/data/profileStatusConfig.js`
- `js/core/tuitionDebtCanonical.js`
- `js/core/profileCanonicalStore.js`
- `js/ui/render.js`
- `js/listeners/profiles.listeners.js`
- `app.js`
- Mirrors tương ứng trong `public/`
- `tools/check-active-skip-quit-regression-v4d1a.mjs`

## Cache-bust

`profile-canonical-store-regression-hotfix-20260628-v4d1a`

## APP_PATCH_VERSION

`4K-6V4D1A-active-skip-quit-regression-hotfix-20260628`

## Kiểm tra

Các gate đã chạy thành công được ghi trong `PHASE_4K_6V4D1A_TEST_SUMMARY.txt`.

Lưu ý: không dùng kết quả của `npm run check` trọn bộ vì suite tổng hợp rất dài và đã vượt thời gian môi trường chạy. Thay vào đó, đã chạy riêng các gate ảnh hưởng trực tiếp đến lỗi này, cùng syntax, deploy package, GitHub Pages paths và Firestore indexes.

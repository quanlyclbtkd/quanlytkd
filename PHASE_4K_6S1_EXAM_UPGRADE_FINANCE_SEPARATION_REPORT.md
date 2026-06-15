# Phase 4K-6S1 — Exam Upgrade / Finance Separation

**Ngày:** 2026-06-16  
**Phạm vi:** Tab **Thi Đai** — nút **⚡ Xác nhận thăng đai**  
**Mục tiêu:** Thao tác thăng đai chỉ cập nhật cấp đai; tuyệt đối không tạo giao dịch lệ phí thi và không làm thay đổi doanh thu.

## 1. Kết luận nguyên nhân

Lỗi nằm trực tiếp trong `window.processBatchUpgrade` của `app.js`.

Hàm cũ thực hiện đồng thời hai nghiệp vụ không nên gộp chung:

1. cập nhật hồ sơ võ sinh sang cấp đai mới;
2. tự dò trạng thái đóng lệ phí và tự tạo thêm giao dịch `Lệ phí thi` cho người bị cho là chưa đóng.

Đoạn dò phí trong hàm cũ là một nhánh legacy riêng, không dùng canonical exam payment ledger. Nó chỉ nhận diện một số dạng giao dịch theo:

- `type === 'Lệ phí thi'` hoặc `type === 'Học phí + Lệ phí thi'`;
- tháng giao dịch trùng tháng đang chọn;
- tên võ sinh được suy ra từ `description`.

Do đó, hàm có thể bỏ sót các trường hợp đã thu phí qua `Thu gộp`, `components`, `paymentKind`, dữ liệu tên canonical khác nhau, hoặc dữ liệu realtime chưa kịp đồng bộ. Khi bỏ sót, hệ thống đưa võ sinh vào `studentsToCharge` rồi tạo thêm một transaction lệ phí trong cùng batch thăng đai.

Đây không phải là ghi đè toàn bộ hồ sơ Firestore vì profile vẫn dùng `{ merge: true }`. Sai lệch doanh thu đến từ **giao dịch lệ phí bị ghi thêm lần thứ hai**.

## 2. Phương án được chọn

Không sửa thuật toán nhận diện “đã đóng phí” bên trong nút thăng đai. Thay vào đó, tách tuyệt đối hai nghiệp vụ:

- **Thu lệ phí:** chỉ thực hiện qua nút `💰 Thu phí` hoặc các luồng Thu gộp đã có canonical ledger.
- **Xác nhận thăng đai:** chỉ ghi ba trường hồ sơ:
  - `belt`
  - `upgradedAt`
  - `upgradedFrom`

`processBatchUpgrade` không còn:

- đọc `getClubExamFee`;
- đọc `exam_fee_all_actual`;
- quét `allTransactions`;
- tính `studentsToCharge` hoặc `chargeAmount`;
- tạo document trong `transactions`;
- ghi `type: 'Lệ phí thi'`;
- hiển thị thông báo “Hệ thống sẽ thu phí...”.

## 3. Hardening bổ sung

### 3.1 Chặn double-click

Thêm `window.__examUpgradeInFlight` và khóa nút trong lúc batch đang commit. Một lần bấm nhanh lặp lại không thể tạo batch thứ hai.

### 3.2 Kiểm tra dữ liệu stale

Chỉ nâng cấp hồ sơ:

- vẫn tồn tại trong `allProfiles`;
- vẫn thuộc đúng cấp đai đang lọc.

Nếu checkbox cũ không còn khớp dữ liệu hiện tại, hệ thống yêu cầu tải lại và chọn lại thay vì ghi nhầm.

### 3.3 Chỉ cập nhật cache sau commit thành công

Sau khi Firestore commit thành công, cache `allProfiles` và `window.__store.profiles` mới được đồng bộ. Nếu commit lỗi, cache không bị thay đổi giả.

### 3.4 Profile write vẫn an toàn

Mỗi write tiếp tục dùng:

```js
batch.set(profileRef, {
  belt: newBelt,
  upgradedAt: currentMonth,
  upgradedFrom: currentBelt
}, { merge: true });
```

Các trường khác như học phí, số điện thoại, ngày sinh, cơ sở và lịch sử hồ sơ không bị ghi đè.

### 3.5 Cache bust khi triển khai GitHub Pages

- `app.js?v=exam-upgrade-finance-separation-20260616`
- `main.js?v=exam-upgrade-finance-separation-20260616`
- `APP_BUILD_VERSION = 4K-6S1-exam-upgrade-finance-separation-20260616`

## 4. Regression gate mới

Thêm:

```text
tools/check-exam-upgrade-finance-separation.mjs
```

Gate có 41 kiểm tra, gồm cả kiểm tra runtime giả lập:

- không còn token/payment path trong `processBatchUpgrade`;
- confirmation không chứa nội dung phí/doanh thu;
- chỉ ghi vào `clubs/{clubId}/profiles/{student}`;
- payload chỉ gồm ba trường thăng đai;
- mọi write đều `merge:true`;
- transaction cache giữ nguyên trước và sau commit;
- double-click không tạo batch thứ hai;
- nút được khóa và phục hồi đúng;
- cache hồ sơ chỉ đổi sau commit thành công;
- luồng `quickCollectExam` vẫn tồn tại riêng để thu phí.

Gate mới được thêm vào:

- `npm run check`
- `npm run check:all`
- `npm run check:all:critical`

## 5. Kết quả kiểm tra

### Default gate

`npm run check`: **PASS**

Bao gồm syntax, mobile startup, lazy assets, static CSS, mobile filter/currency, exam upgrade/finance separation, ownership, listener, inventory và financial audit guard.

### Exam-specific gates

Các gate sau đều **PASS**:

- exam upgrade/finance separation: **41/41**
- exam fee save pipeline
- exam fee setting: **24/24**
- exam fee UI cleanup: **8/8**
- exam payment identity: **14/14**
- canonical exam ledger
- auto-select paid: **11/11**
- cancel exam payment: **7/7**
- financial action audit guard

### Critical production gate

`npm run check:all:critical`: **PASS**  
Tổng chuỗi thực thi: **79 command entries**, không có `FAIL`, `FAILED` hoặc `ERROR`.

### Full system gate

`npm run check:all` đã chạy đến nhóm cuối cùng trong giới hạn thời gian môi trường; không có failure trong log. Nhóm cuối `check:global-ownership-adoption-cleanup` được chạy lại riêng và **PASS 98 assertions**.

### Syntax

- JavaScript files: **101**
- Inline scripts: **8**
- Tổng: **109 items**
- Kết quả: **PASS**

## 6. Ảnh hưởng đến `app.js`

So với Phase 4K-6S:

- trước: `806,122 bytes`, `13,104` dòng theo `wc`;
- sau: `806,859 bytes`, `13,140` dòng;
- chênh lệch: `+737 bytes`, `+36` dòng.

Kích thước tăng nhẹ vì bổ sung in-flight guard, stale-data guard, xử lý lỗi và đồng bộ cache. Không tách module trong hotfix này để tránh mở rộng phạm vi vào luồng nghiệp vụ nhạy cảm. Việc giảm tiếp `app.js` nên tiếp tục ở phase utility/UI extraction riêng sau khi bản sửa doanh thu được canary ổn định.

## 7. Dữ liệu trùng đã phát sinh trước bản sửa

Bản sửa ngăn giao dịch mới bị tạo lặp, nhưng không tự động xóa giao dịch lịch sử vì hệ thống không thể biết chắc bản nào là khoản thu thật nếu không đối chiếu biên lai.

Cách xử lý an toàn:

1. lọc đúng tháng kỳ thi;
2. đối chiếu từng võ sinh có hai giao dịch lệ phí;
3. giữ giao dịch có biên lai/nguồn thu hợp lệ;
4. dùng nút **Hủy** tại tab Thi Đai cho giao dịch lệ phí bị tạo dư;
5. kiểm tra lại `Tổng thu lệ phí`, dashboard và doanh thu tháng.

Không nên xóa hàng loạt tự động theo tên và tháng.

## 8. Tệp thay đổi chính

- `app.js`
- `index.html`
- `js/main.js`
- `package.json`
- `tools/check-exam-upgrade-finance-separation.mjs`
- `tools/check-exam-fee-save-pipeline.mjs`
- `tools/check-exam-fee-setting.mjs`
- `tools/check-global-ownership-adoption-cleanup.mjs`

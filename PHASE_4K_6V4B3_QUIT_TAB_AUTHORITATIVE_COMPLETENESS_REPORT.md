# Phase 4K-6V4B3 — Quit Tab Authoritative Completeness

Ngày hoàn thành: 27/06/2026

## 1. Vấn đề thực tế

Tài khoản Admin mở tab **Đã nghỉ** nhưng vẫn không thấy đủ toàn bộ võ sinh đã nghỉ của CLB. Bản V4B2 đã bổ sung nhiều query legacy, nhưng vẫn còn thiếu một nhóm dữ liệu quan trọng.

## 2. Nguyên nhân chính xác

### 2.1. `quitDate!=null` có query nhưng classifier lại loại bỏ

Bản V4B2 có query:

```js
where('quitDate', '!=', null)
```

Tuy nhiên mỗi document lấy về vẫn bị kiểm tra lại bằng:

```js
classifyProfileStatus(data) === 'quit'
```

Classifier cũ **không coi `quitDate` là tín hiệu nghỉ**. Nếu hồ sơ chỉ có `quitDate` nhưng thiếu `status='quit'`, thiếu `active=false`, thiếu `quit=true`, document bị trả về bởi Firestore nhưng lại bị app loại bỏ. Đây là nguyên nhân trực tiếp khiến Admin vẫn thiếu một số võ sinh đã nghỉ.

### 2.2. Một số status legacy không nằm trong query status chính

Query chính chỉ bắt:

```text
quit, inactive, retired
```

Nhưng dữ liệu cũ có thể lưu:

```text
Đã nghỉ, Nghỉ, Nghỉ tập, nghi, stopped, left, stop, leave
```

Classifier có thể nhận diện nhiều alias nếu document được fetch, nhưng loader V4B2 chưa query các alias này nên không bao giờ thấy các document đó.

### 2.3. Targeted queries không thể bảo đảm 100% dữ liệu legacy lạ

Dữ liệu thực tế qua nhiều phase có thể có các trường nghỉ không chuẩn như:

```text
ngayNghi, inactiveDate, stoppedDate, leftDate
```

Nếu chỉ dùng các query mục tiêu đã biết, tab Đã nghỉ vẫn có khả năng thiếu người khi dữ liệu cũ dùng một cách đánh dấu khác.

## 3. Bản sửa V4B3

### 3.1. Sửa classifier

`classifyProfileStatus()` hiện coi các field ngày nghỉ là tín hiệu nghỉ:

```text
quitDate
stoppedDate
leftDate
inactiveDate
nghiDate
ngayNghi
```

Các field này được kiểm tra trước `active=true`, vì trong dữ liệu cũ có thể còn `active=true` bị sót sau khi đã ghi ngày nghỉ.

### 3.2. Mở rộng query status alias

Quit loader hiện query thêm các nhóm status legacy:

```text
Đã nghỉ
Nghỉ
Nghỉ tập
nghi
nghi tap
Stopped
Left
Stop
Leave
```

Mỗi kết quả vẫn phải qua classifier nên không đưa nhầm võ sinh đang tập vào tab Đã nghỉ.

### 3.3. Mở rộng query date signals

Ngoài `quitDate`, loader query thêm:

```text
ngayNghi
inactiveDate
stoppedDate
leftDate
```

### 3.4. Không thay thế dữ liệu đầy đủ bằng dữ liệu partial

Nếu đã có `quitProfiles` đầy đủ từ fallback/full load, targeted loader không được ghi đè làm mất dữ liệu. V4B3 giữ lại các profile cũ vẫn classify là `quit` trước khi set lại store.

### 3.5. Authoritative full reconciliation cho Admin

Sau khi targeted queries chạy, Admin tab Đã nghỉ tự chạy một full reconciliation **một lần mỗi session**:

```text
loadFullProfilesFallback('quit-tab-authoritative-reconcile')
```

Đây là điểm sửa quan trọng nhất để bảo đảm tab Đã nghỉ load được **toàn bộ** danh sách, kể cả hồ sơ legacy dùng schema lạ mà targeted query không biết trước.

Cơ chế này:

- Chỉ chạy cho Admin.
- Coach vẫn bị chặn `profiles.quit` và `profiles.full-fallback`.
- Chỉ chạy khi mở tab Đã nghỉ/ensure quit profiles.
- Sau full load, hệ thống phân loại toàn bộ profiles thành active/quit bằng classifier mới.
- Render tab Đã nghỉ lấy từ `quitProfiles` đầy đủ, không từ pagination Đang tập.

## 4. Ảnh hưởng Firebase Reads

V4B3 ưu tiên đúng dữ liệu cho Admin tab Đã nghỉ.

Khi Admin mở tab Đã nghỉ lần đầu trong session:

1. Targeted queries chạy trước để có dữ liệu nhanh.
2. Full reconciliation chạy một lần để bảo đảm không thiếu người.

Điều này có thể đọc toàn bộ profiles một lần trong session Admin khi mở tab Đã nghỉ. Đây là đánh đổi cần thiết vì không thể biết hết mọi schema legacy bằng query mục tiêu nếu không migration/index chuẩn.

Coach không bị tăng Reads vì Coach vẫn không được đọc tab Đã nghỉ.

## 5. Những phần không thay đổi

- Học phí.
- Báo nợ.
- Kho đồ.
- Thu gộp.
- Thi đai.
- Điểm danh HLV.
- Firestore Rules.
- Branch boundary V4B/V4A.
- Không dùng Blaze.
- Không dùng Cloud Functions.
- Không migration dữ liệu.

## 6. Kiểm thử

Đã chạy:

```bash
npm run check
npm run check:all:critical
node tools/check-deploy-package.mjs
node tools/check-github-pages-paths.mjs
node tools/check-firestore-indexes.mjs
node tools/check-runtime-stability-gate.mjs
node tools/check-production-stability-gate.mjs
node tools/check-inventory-ledger-reconciliation.mjs
node tools/check-debt-profile-read-boundary.mjs
```

Kết quả đều PASS.

Các gate chính:

- Quit Tab Completeness V4B2: 12/12 PASS.
- Quit Tab Authoritative Completeness V4B3: 9/9 PASS.
- Coach Branch Runtime Repair: 25/25 PASS.
- Security Coach Branch Boundary: 35/35 PASS.
- Deploy package: 12/12 PASS.
- GitHub Pages paths: 18/18 PASS.
- Firestore indexes: 16/16 PASS.
- Runtime stability: 17/17 PASS.
- Production stability: 22/22 PASS.
- Inventory Ledger Reconciliation: 33/33 PASS.
- Debt Profile Read Boundary: 21/21 PASS.

## 7. Kiểm tra sau deploy

1. Deploy bản V4B3.
2. Admin tải lại bằng Ctrl+F5.
3. Mở tab Đã nghỉ.
4. Đợi targeted load và full reconciliation hoàn tất.
5. Kiểm tra các võ sinh trước đây bị mất tên.
6. Mở Console kiểm tra:

```js
printProfileScaleMetrics?.()
debugListPaginationCoverage?.()
```

Kỳ vọng:

```text
quitProfiles có tổng số đủ hơn V4B2
lastProfilesMode có thể là full-fallback
#quitList dùng quitProfiles đầy đủ
Coach không được đọc profiles.quit/full-fallback
```

## 8. Kết luận

V4B2 thiếu vì `quitDate` đã được query nhưng classifier không nhận là quit, đồng thời chưa có full authoritative reconciliation. V4B3 sửa cả hai lớp: nhận diện đúng dữ liệu legacy và chạy full reconciliation một lần cho Admin tab Đã nghỉ để bảo đảm không còn thiếu danh sách võ sinh đã nghỉ.

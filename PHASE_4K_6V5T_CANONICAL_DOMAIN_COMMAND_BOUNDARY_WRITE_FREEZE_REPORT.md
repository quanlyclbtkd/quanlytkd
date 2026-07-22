# Phase 4K-6V5T — Canonical Domain Command Boundary + Legacy Write Freeze

## 1. Quyết định kiến trúc

### Có nên thực hiện V5T không?

Có, nhưng chỉ nên thực hiện theo dạng **ownership boundary + legacy write freeze**, không chuyển toàn bộ nghiệp vụ sang một implementation mới trong cùng phase.

Lý do:

- Hệ thống đang có nhiều handler toàn cục, service và fallback legacy cùng tham gia một nghiệp vụ.
- Việc chuyển ngay các luồng Học phí, Kho đồ, Điểm danh và Tuyển sinh sang command mới sẽ tạo thêm một đường ghi và có nguy cơ làm sai payload, local store, invalidation hoặc receipt.
- Cách an toàn là đăng ký một command ID duy nhất cho từng action đã được kiểm tra, nhưng command chỉ ủy quyền vào đúng handler đang hoạt động.
- Đồng thời khóa số lượng và chữ ký direct Firestore writes trong `app.js`, ngăn source legacy tiếp tục phình thêm.

V5T vì vậy là phase thiết lập quyền sở hữu, không phải phase viết lại nghiệp vụ.

## 2. Nguyên tắc triển khai đã áp dụng

### Không tạo writer mới

`canonicalDomainCommandBoundary.js` không import hoặc gọi:

```text
addDoc
setDoc
updateDoc
deleteDoc
writeBatch
runTransaction
```

Module cũng không:

- sửa `window.__store`;
- sửa `studentProfileStore`;
- gọi `invalidateList`;
- gọi `renderApp`;
- sửa DOM;
- thay đổi Firestore payload.

### Giữ nguyên handler đã ổn định

Luồng sau V5T:

```text
UI / inline handler
        ↓
compatibility command wrapper
        ↓
handler module hiện hữu
        ↓
service / integrity guard / Firestore hiện hữu
```

Không có luồng ghi song song mới.

### Chống double action theo single-flight

Các lời gọi có cùng command ID và cùng action key khi đang xử lý sẽ dùng chung một Promise. Điều này giảm nguy cơ:

- bấm Thu hai lần;
- xóa giao dịch hai lần;
- bấm Nghỉ/Báo nghỉ liên tiếp;
- đánh dấu Kho đồ đã thu lặp.

Các action khác key vẫn chạy độc lập.

### Giữ nguyên contract cũ

Compatibility wrapper:

- trả nguyên giá trị của handler cũ;
- ném lại nguyên lỗi cũ;
- giữ `function.toString()` của handler cũ để các diagnostic/write-safety gate hiện tại không bị sai;
- không đổi chữ ký inline handler.

## 3. Command inventory V5T

### Đã bọc bằng single-flight compatibility wrapper

#### Student/Profile

```text
student.updateProfile
student.deleteProfile
student.skipMonth
student.removeSkip
student.markQuitFromDebt
student.skipDebtMonth
```

#### Finance/Inventory

```text
finance.quickPay
finance.deleteTransaction
inventory.markPaid
```

Tổng cộng: **9 command được bọc**.

### Chỉ đăng ký ownership, không thay handler

```text
attendance.toggle
attendance.bulkCheckIn
attendance.syncOffline
admission.processMultiItem
```

Tổng cộng: **4 command observe-only**.

Lý do không bọc:

- Attendance có session/offline queue và ownership riêng; thay identity của handler có thể làm hỏng offline sync.
- `processMultiItem` là luồng rất rủi ro, cùng lúc ghi profile, học phí, kho đồ, lệ phí thi và transaction bundle; chưa đủ an toàn để migrate trong V5T.

## 4. Legacy Write Freeze

Đã tạo baseline:

```text
tools/baselines/v5t-legacy-write-baseline.json
```

Direct Firestore write trong `app.js` tại thời điểm freeze:

```text
addDoc:    26
setDoc:    21
updateDoc: 16
deleteDoc:  8
Tổng:      71
```

Gate V5T kiểm tra:

- tổng direct write không được tăng;
- từng loại write không được tăng;
- không được thêm chữ ký direct-write mới;
- `app.js` và `public/app.js` phải đồng bộ;
- command boundary không được chứa Firestore write.

### Ý nghĩa chính xác

V5T **chưa xóa 71 writer cũ**. V5T đóng băng chúng và ngăn phát sinh writer thứ 72.

Đây là bước cần thiết trước khi migrate từng command ở phase tiếp theo.

## 5. API và diagnostics

V5T expose:

```js
window.CanonicalDomainCommandBoundary
window.DomainCommands
window.getDomainCommandMetrics()
window.printDomainCommandStatus()
```

Metrics theo dõi:

- command đã đăng ký;
- handler owner;
- số lần gọi;
- số lần hoàn tất/thất bại;
- số duplicate bị ngăn;
- command collision;
- in-flight actions.

## 6. Rủi ro và biện pháp kiểm soát

### Rủi ro 1 — Wrapper làm đổi kết quả handler

Biện pháp:

- compatibility API trả raw legacy result;
- error được rethrow nguyên vẹn;
- behavior test kiểm tra cụ thể.

Kết quả: PASS.

### Rủi ro 2 — Wrapper che source khiến diagnostic hiểu sai

Một số diagnostic hiện dùng `handler.toString()` để kiểm tra integrity/action guard.

Biện pháp:

- wrapper override `.toString()` và trả source handler cũ.

Kết quả: write-safety và financial guard PASS.

### Rủi ro 3 — Bọc Attendance làm hỏng offline/session owner

Biện pháp:

- Attendance chỉ observe-only trong V5T;
- không thay handler identity.

Kết quả: Attendance/Coach/offline checks PASS.

### Rủi ro 4 — Bọc multi-item tạo xung đột transaction bundle

Biện pháp:

- `processMultiItem` chỉ observe-only;
- không thay code hoặc payload.

Kết quả: multi-item/inventory/tuition package checks PASS.

### Rủi ro 5 — Single-flight khóa nhầm hai action hợp lệ

Biện pháp:

- key chứa command ID cùng profile/transaction/month tương ứng;
- khác key vẫn độc lập;
- behavior test kiểm tra khác key.

Kết quả: PASS.

### Rủi ro 6 — Command boundary khởi tạo trước module owner

Biện pháp:

- khởi tạo sau `initStudents`, `initFinance`, `initInventory`, `initAttendance`;
- chỉ capture handler khi handler đã tồn tại.

Kết quả: static/bootstrap checks PASS.

## 7. Lỗi phát hiện trong quá trình regression

Không phát hiện lỗi nghiệp vụ mới do V5T.

Các failure phát hiện đều thuộc nhóm **test gate cũ**, chủ yếu do test chỉ nhận cache-bust/version hoặc tên biến cũ:

- V5S quit-context gate chưa nhận patch V5T;
- profile canonical store gate yêu cầu helper và app dùng cùng query string;
- tuition source-of-truth gate yêu cầu exact cache marker;
- debt search regex không nhận `debtPassFilter && passDebtOverdueFilter`;
- active island gate yêu cầu guard pagination cũ dù V5R đã có source mạnh hơn;
- active-new-students test còn tìm tên biến `passFilter` cũ;
- exam registration count gate chưa nhận V5T;
- render warning coalescing gate chưa nhận APP patch V5T.

Các gate được cập nhật để kiểm tra **hành vi/lineage thực tế**, không sửa nghiệp vụ để làm test PASS.

## 8. Kết quả kiểm tra toàn diện

### Pipeline tổng

```text
npm run check     — PASS hoàn toàn, exit code 0
npm run check:all — PASS hoàn toàn, exit code 0
```

### V5T

```text
check:v5t-command-boundary-write-freeze — PASS 21/21
check:v5t-command-boundary-behavior     — PASS 15/15
check:v5t-stability                     — PASS
```

### Đang tập / Đã nghỉ / trạng thái võ sinh

```text
quit-tab-completeness                  — PASS 10/10
quit-tab-authoritative-completeness    — PASS 9/9
quit-tab-mobile-parity                 — PASS 17/17
v5q quit authoritative pipeline       — PASS 21/21
v5r quit single-source lock            — PASS 16/16
v5r quit source behavior               — PASS 5/5
v5s quit context/render-loop guard     — PASS 16/16
v5s quit context behavior              — PASS 6/6
profile-canonical-store                — PASS 27/27
v4d1a runtime recovery                 — PASS 22/22
student quit separation/hard separation — PASS
active list/search/load-more gates     — PASS
```

### Học phí / Báo nợ / giao dịch

```text
debt authoritative tuition coverage — PASS 32/32
tuition debt source of truth         — PASS
tuition actions                      — PASS
tuition package month coverage       — PASS 33/33
debt action/search/full coverage     — PASS
transaction realtime                — PASS 46/46
transaction row/delete integrity     — PASS
canonical transaction cutover       — PASS
financial action audit guard        — PASS
```

### Kho đồ

```text
inventory consumer hydration        — PASS 25/25
inventory dynamic size catalog      — PASS 28/28
inventory ledger reconciliation     — PASS 33/33
inventory finance rollup            — PASS 43/43
inventory history/active debt       — PASS
multi-item inventory hydration      — PASS 16/16
```

### Điểm danh / HLV

```text
attendance canonical ownership      — PASS
attendance schedule/offline/shift   — PASS
coach attendance read boundary      — PASS 30/30
coach branch security               — PASS 35/35
coach branch runtime repair         — PASS 25/25
```

### Thi đai

```text
exam upgrade/finance separation     — PASS 41/41
exam payment/registration/export    — PASS
exam fee/cancel/name parser         — PASS
```

### Dashboard / SuperAdmin / deploy

```text
dashboard stats/history/branch/chart — PASS
superadmin hotfix                    — PASS 27/27
superadmin monthStats                — PASS 8/8
superadmin audit/quota/cache         — PASS
runtime stability                   — PASS 17/17
performance stability               — PASS 27/27
production stability                — PASS 22/22
GitHub Pages paths                   — PASS 18/18
deploy package                       — PASS 12/12
```

## 9. Đánh giá độ ổn định sau V5T

### Điểm được cải thiện

- Có một command ID rõ ràng cho các action đã review.
- Giảm nguy cơ double-click tạo ghi trùng.
- Có metrics phát hiện collision và duplicate.
- Không còn được phép thêm direct writer mới vào legacy kernel.
- Không thay đổi payload, service hay local-store logic đang ổn định.
- Tab Đã nghỉ V5R/V5S không bị tác động.
- HLV/offline Attendance không bị thay identity.

### Điểm chưa được giải quyết

- `app.js` vẫn còn 71 direct Firestore writes.
- Một số nghiệp vụ vẫn vừa có legacy fallback vừa có service/module path.
- Command boundary hiện là delegate/freeze, chưa phải writer owner thực sự.
- `processMultiItem`, family pay và admission bundle vẫn là vùng rủi ro rất cao.
- Local commit/invalidation vẫn nằm rải rác trong các handler cũ.
- Source/public mirror vẫn phải duy trì song song.

## 10. Hướng tiếp theo tốt nhất

### Phase 4K-6V5U-1 — Student Status Command Cutover

Chỉ migrate nhóm trạng thái võ sinh trước:

```text
updateProfile
renameProfile
markQuit
restoreStudent
skipMonth
removeSkip
```

Mục tiêu:

1. Một command owner thực sự cho trạng thái võ sinh.
2. Command gọi đúng `StudentService` hiện có; không tạo service thứ hai.
3. Một kết quả chuẩn mô tả profile/domain đã thay đổi.
4. Một `commitStudentCommandResult()` cập nhật canonical stores.
5. Một invalidation map duy nhất cho:
   - students.activeList;
   - students.quitList;
   - students.debtList;
   - attendance.list;
   - dashboard.summary.
6. Xóa direct writer tương ứng khỏi `app.js`; baseline 71 phải giảm.
7. Chưa migrate Học phí, Kho đồ hoặc multi-item trong V5U-1.

### Vì sao chọn Student Status trước Finance

- Phạm vi dữ liệu nhỏ hơn.
- Đã có V5R/V5S single-source và regression mạnh.
- Có thể kiểm chứng rõ giữa Đang tập, Đã nghỉ, Báo nợ và Điểm danh.
- Ít rủi ro doanh thu hơn so với quickPay/familyPay/multi-item.

Sau khi V5U-1 vận hành ổn định mới thực hiện:

```text
V5U-2 — Tuition Command Cutover
V5U-3 — Inventory Command Cutover
V5U-4 — Admission/Multi-item Atomic Boundary
V5V   — Render/Invalidation Ownership Consolidation
V5W   — Role/Tab Read Boundary Reduction
```

## 11. Deploy

V5T chỉ sửa Hosting/source và test tooling.

Không yêu cầu thay Firestore Rules riêng cho V5T nếu V5S Rules đã được deploy.

Build marker:

```text
canonical-domain-command-boundary-write-freeze-20260722-v5t
```

Sau deploy cần hard refresh hoặc xóa cache site.

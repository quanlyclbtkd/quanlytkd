# Phase 4K-6V5U-1 — Student Status Command Cutover + Tuition Transaction Delete Fix

## Mục tiêu

Phase này gồm hai phạm vi được tách rõ:

1. Sửa lỗi Admin không xóa được giao dịch trong tab Học phí, không tạo đường xóa mới.
2. Cutover thật sự nhóm ghi trạng thái võ sinh sang một command owner duy nhất; không chỉ bọc writer như V5T.

Finance, Kho đồ và multi-item không được migrate ownership trong phase này. Phần Finance chỉ nhận hotfix tối thiểu cho quyền xóa giao dịch và xử lý lỗi giao diện.

## 1. Lỗi xóa giao dịch Học phí

### Nguyên nhân gốc

UI và `FinanceService.deleteTransaction()` cho phép Admin gọi `deleteDoc()` trên:

```text
clubs/{clubId}/transactions/{transactionId}
```

Nhưng Firestore Rules V5T chỉ cho SuperAdmin xóa giao dịch. Vì vậy request bị từ chối với `permission-denied`, giao dịch vẫn còn nguyên. Lỗi bị truyền qua command wrapper thành rejected Promise, đồng thời giao diện có thể chuyển về tab Báo nợ trong quá trình reconcile/render.

### Cách sửa

#### Firestore Rules

Quyền transactions được thống nhất:

```rules
allow get, list: if isSuperAdmin() || isAdminOrViewer(clubId);
allow create, update: if isSuperAdmin() || isClubAdmin(clubId);
allow delete: if isSuperAdmin() || isClubAdmin(clubId);
```

Coach và Viewer vẫn không được xóa giao dịch.

#### FinanceService

- Kiểm tra transaction ID hợp lệ.
- Vẫn dùng đúng `deleteDoc()` hiện hữu, không tạo đường xóa song song.
- Giữ nguyên `permission-denied` code và bổ sung thông báo rõ ràng để chẩn đoán Rules.

#### Finance UI

`window.deleteTx` giờ:

- bắt lỗi permission thay vì tạo `Uncaught (in promise)`;
- chỉ reconcile profile/inventory/exam sau khi xóa thành công;
- khi thất bại không sửa local transaction cache;
- giữ người dùng ở tab Học phí;
- hiển thị hướng dẫn deploy Rules V5U-1 nếu quyền chưa được cập nhật.

### clubStatsAutoCache

Log người dùng còn cho thấy stats auto-cache cố ghi Firestore không đúng vai trò. V5U-1 giới hạn writer này cho:

- Admin/Owner;
- SuperAdmin/Root.

Coach và Viewer không mount writer stats cache.

## 2. V5U-1 Student Status Command Cutover

### Boundary mới

Đã thêm:

```text
js/core/studentStatusCommandBoundary.js
public/js/core/studentStatusCommandBoundary.js
```

Boundary sử dụng `StudentService` hiện hữu, không chứa `setDoc`, `updateDoc`, `addDoc`, `deleteDoc` hay một Firestore path mới.

### Command được cutover

```text
student.updateProfile
student.deleteProfile
student.addSkippedMonth
student.removeSkippedMonth
student.markQuit
```

Các thao tác tương ứng:

- sửa hồ sơ;
- đổi tên;
- nghỉ tập;
- khôi phục tập lại thông qua cập nhật status hồ sơ;
- báo nghỉ tháng;
- hủy báo nghỉ tháng;
- xóa hồ sơ.

### Luồng mới

```text
UI students/finance alias
        ↓
StudentStatusCommandBoundary
        ↓
StudentService hiện hữu
        ↓
Firestore write thành công
        ↓
canonical local-store commit
        ↓
một invalidation map thống nhất
```

Không có writer trạng thái thứ hai chạy song song.

### Domain đồng bộ sau thay đổi trạng thái

```text
students.activeList
students.quitList
students.debtList
attendance.list
dashboard.summary
student search cache
```

### Đổi tên hồ sơ

Đổi tên vẫn dùng atomic batch cho profile mới + xóa profile cũ. Việc cập nhật mô tả transaction lịch sử được chia batch 400 để không vượt giới hạn 500 writes của Firestore.

### Single-flight

Các command giống nhau đang chạy dùng chung một Promise theo command + identity, giảm double-click và ghi trùng.

## 3. Legacy Writer Reduction

Baseline V5T:

```text
addDoc:    26
setDoc:    21
updateDoc: 16
deleteDoc:  8
Tổng:      71
```

Baseline V5U-1:

```text
addDoc:    26
setDoc:    17
updateDoc: 16
deleteDoc:  7
Tổng:      66
```

Kết quả:

```text
Giảm 5 direct Firestore writes trong app.js
setDoc giảm 4
DeleteDoc giảm 1
```

Các writer legacy đã được thay bằng no-write stubs trong `app.js`; module students khởi tạo sau bootstrap sẽ cung cấp handler chính thức qua command boundary.

Baseline mới:

```text
tools/baselines/v5u1-legacy-write-baseline.json
```

Gate V5T vẫn tiếp tục cấm tăng writer trở lại.

## 4. Phạm vi không thay đổi

V5U-1 không migrate ownership của:

- Thu học phí/Thu gộp/Thu gia đình;
- Kho đồ;
- Multi-item/Thêm võ sinh;
- Lệ phí thi;
- Attendance offline queue;
- SuperAdmin provisioning.

Hotfix xóa transaction chỉ sửa quyền Rules và catch/error/tab retention, không tạo Finance command flow mới.

## 5. Lỗi test gate phát hiện và đã sửa

Một số regression gate cũ yêu cầu local sync nằm trực tiếp trong `app.js`, `students.js` hoặc `finance.js`. Sau cutover thật sự, sync đã chuyển vào `StudentStatusCommandBoundary`, nên các gate đó báo fail giả.

Đã cập nhật các gate để kiểm tra ownership mới thay vì ép khôi phục writer cũ:

- `check-debt-actions-sync.mjs`
- `check-debt-service-bridge.mjs`
- `check-student-quit-separation.mjs`
- `check-student-quit-hard-separation.mjs`
- `check-v5r-quit-single-source-lock.mjs`

Các gate cache-bust cũ cũng được cập nhật để chấp nhận V5U-1:

- quit mobile parity;
- V5S render-loop guard;
- inventory ledger reconciliation;
- exam registration count;
- render warning coalescing;
- profile canonical store.

Không thay đổi nghiệp vụ để ép test PASS.

## 6. Kết quả kiểm tra

### Pipeline tổng

```text
npm run check     — PASS, exit code 0
npm run check:all — PASS, exit code 0
```

### V5U-1

```text
check:v5u1-student-status-command-cutover — PASS 24/24
check:v5u1-student-status-command-behavior — PASS 15/15
check:v5t-command-boundary-write-freeze — PASS
check:v5t-command-boundary-behavior — PASS 15/15
```

### Học phí/Báo nợ/Transactions

```text
transaction realtime — PASS 46/46
tuition actions — PASS
tuition source of truth — PASS
debt authoritative tuition coverage — PASS 32/32
debt actions sync — PASS 17/17
debt service bridge — PASS 11/11
debt full coverage — PASS 10/10
canonical transaction cutover — PASS
transaction delete integrity — PASS
```

### Đang tập/Đã nghỉ/Trạng thái

```text
quit completeness — PASS 10/10
quit authoritative completeness — PASS 9/9
quit mobile parity — PASS 17/17
V5Q authoritative pipeline — PASS 21/21
V5R single-source lock — PASS 16/16
V5R behavior — PASS 5/5
V5S render-loop guard — PASS 16/16
V5S behavior — PASS 6/6
student quit separation — PASS 14/14
student quit hard separation — PASS 10/10
student pagination status — PASS 11/11
profile canonical store — PASS 27/27
runtime recovery — PASS 22/22
```

### Điểm danh/HLV

```text
attendance canonical ownership — PASS 141 assertions
coach read boundary — PASS 30/30
coach branch security — PASS 35/35
coach runtime repair — PASS 25/25
```

### Kho đồ/Multi-item

```text
inventory hydration — PASS 25/25
dynamic size catalog — PASS 28/28
inventory ledger reconciliation — PASS 33/33
inventory finance rollup — PASS 43/43
inventory active debt/history — PASS 25/25
multi-item hydration — PASS 16/16
payment bundle runtime — PASS 20/20
```

### Thi đai

```text
exam upgrade/finance separation — PASS 41/41
exam registration count — PASS 11/11
exam cancel fee — PASS 7/7
exam fee setting — PASS 24/24
exam payment identity — PASS 14/14
exam belt export sort — PASS 13/13
exam export download — PASS 10/10
exam name parser — PASS 26/26
```

### Dashboard/SuperAdmin/Runtime/Deploy

```text
dashboard stats/history/branch/chart — PASS
SuperAdmin hotfix — PASS 27/27
SuperAdmin monthStats — PASS 8/8
runtime stability — PASS 17/17
performance stability — PASS 27/27
production stability — PASS 22/22
GitHub Pages paths — PASS 18/18
deploy package — PASS 12/12
```

### Firestore Rules emulator

Đã thử chạy:

```text
npm run check:rules:emulator
```

Nhưng môi trường kiểm tra không có Firebase CLI (`firebase: not found`), nên Rules Emulator không chạy được tại đây. Static Rules gates, role/branch security gates và V5U-1 transaction delete Rules gate đều PASS. Cần chạy emulator ở máy có Firebase CLI trước production nếu quy trình deploy yêu cầu.

## 7. Đánh giá rủi ro sau V5U-1

### Rủi ro đã giảm

- Không còn hai writer trạng thái trong app.js và module.
- Giảm khả năng Đang tập/Đã nghỉ/Báo nợ/Điểm danh lệch nhau sau đổi trạng thái.
- Single-flight giảm thao tác lặp.
- Xóa transaction có quyền Rules đúng cho Club Admin.
- Permission failure không còn làm giao diện nhảy tab hoặc tạo rejected Promise không được xử lý.

### Rủi ro còn lại

- app.js vẫn còn 66 direct writes.
- Finance, Inventory, multi-item vẫn còn writer legacy/fallback.
- Một số local invalidation cũ vẫn tồn tại quanh UI alias, dù writer đã thống nhất.
- Firestore Rules mới phải được deploy; chỉ deploy Hosting sẽ chưa sửa được quyền xóa giao dịch.

## 8. Deploy bắt buộc

V5U-1 cần deploy cả:

```text
1. Hosting/source
2. Firestore Rules
```

Sau deploy, hard refresh/xóa cache và xác nhận build:

```text
student-status-command-cutover-tx-delete-fix-20260722-v5u1
```

## 9. Hướng tiếp theo

Bước tiếp theo tốt nhất là:

```text
Phase 4K-6V5U-2 — Tuition Command Cutover
```

Nhưng chỉ nên triển khai từng lát nhỏ:

1. `deleteTransaction + reconcile` trước, vì vừa xác nhận Rules và integrity boundary.
2. `quickPay` sau khi delete flow ổn định production.
3. Thu gộp/Thu gia đình thực hiện ở phase riêng.
4. Không gộp Kho đồ hoặc multi-item vào V5U-2.

Tiêu chí V5U-2:

- Finance writer thực sự rời app.js.
- Baseline 66 tiếp tục giảm.
- Một command result + một local commit + một invalidation map.
- Không tạo service hoặc transaction format mới.
- Rules Emulator và toàn bộ tuition/debt/transaction regression phải PASS.

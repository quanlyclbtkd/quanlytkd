# Phase 4K-6V4B2 — Quit Tab Completeness + Name Display

Ngày hoàn thành: 27/06/2026
Bản nền: `taekwondo-phase4K-6V4B1-coach-branch-runtime-repair-complete.zip`

## 1. Đánh giá hệ thống hiện tại

Hệ thống hiện tại đã có các lớp bảo vệ quan trọng từ V4B1:

- Tài khoản HLV chỉ được vào Điểm danh và đọc profiles đúng cơ sở.
- Firestore Rules đã có ranh giới branch cho Coach.
- Admin vẫn giữ đầy đủ Học phí, Báo nợ, Kho đồ, Thu gộp, Thi đai và Dashboard.
- Active profiles listener cho Admin vẫn là nguồn dữ liệu đầy đủ để bảo toàn Học phí/Báo nợ/Search.
- Quit profiles (`Đã nghỉ`) được lazy-load khi cần, không tải cho Coach.

Lỗi lần này không phải mất dữ liệu Firestore. Lỗi nằm ở pipeline tải/render tab `Đã nghỉ`: một số hồ sơ đã nghỉ không được đưa vào `quitProfiles`, hoặc đã có trong store nhưng bị phần pagination ghi đè khi render.

## 2. Hiện tượng lỗi

Trong tab `Đã nghỉ`, một số võ sinh đã nghỉ không xuất hiện hoặc tên hiển thị sai/mất. Các trường hợp thường gặp:

- Hồ sơ cũ chỉ có `active:false`, `isActive:false`, `quit:true`, `isQuit:true`, `stopped:true`, hoặc `quitDate`, nhưng không có `status:'quit'`.
- Tab `Đã nghỉ` đang bật pagination của tab Đang tập nên renderer dùng `pgStudents.currentItems`, không dùng full/lazy `quitProfiles`.
- Document ID không phải tên võ sinh, trong khi UI dùng key/docId để hiển thị tên.

## 3. Nguyên nhân chính xác

### 3.1. Quit loader chỉ đọc status mới

Trước bản sửa, `loadQuitProfilesIfNeeded()` chỉ query theo nhóm status:

```js
where('status', 'in', ['quit', 'inactive', 'retired'])
```

Vì vậy hồ sơ legacy đánh dấu nghỉ bằng flag hoặc ngày nghỉ không được đọc.

### 3.2. Renderer bị pagination override

Trong `computeAndCacheStudents()`, PASS 1 chỉ render quit rows khi pagination không active:

```js
if (!pgStudentsActive && buildQuit) { ... }
```

Nhưng hệ thống hiện có `pgStudentsActive` cho tab Đang tập. Khi mở `Đã nghỉ`, điều kiện này làm PASS 1 không render đủ danh sách quit từ profile store.

Sau đó PASS 2 có thể ghi đè `#quitList` bằng `pgStudents.currentItems`. Đây là nguồn làm mất tên vì `pgStudents.currentItems` không bảo đảm là toàn bộ danh sách đã nghỉ.

### 3.3. Dòng quit hiển thị docId thay vì tên trong profile

`renderQuitRow(name, p)` dùng `name` là key của map. Với hồ sơ cũ, key có thể là document id/stable id, còn tên thật nằm trong `p.name`, `p.fullName`, `p.displayName`, `p.studentName` hoặc `p.memberName`.

## 4. Nội dung sửa

### 4.1. Quit lazy loader đọc đầy đủ tín hiệu legacy

`loadQuitProfilesIfNeeded()` hiện đọc các nguồn:

- `status == quit` hoặc `status in quitValues`;
- `active == false`;
- `isActive == false`;
- `quit == true`;
- `isQuit == true`;
- `stopped == true`;
- `quitDate != null`.

Mỗi query lỗi thì chỉ bỏ qua query đó, không làm hỏng toàn bộ tab.

Mọi document từ tín hiệu rộng đều phải đi qua:

```js
classifyProfileStatus(data) === 'quit'
```

để tránh đưa võ sinh đang tập vào tab Đã nghỉ.

### 4.2. Không cho pagination active ghi đè quit store

Renderer có thêm `useFullProfileQuitRender`. Khi full/lazy quit profiles đã sẵn sàng:

- PASS 1 vẫn render `quitRows` dù pagination đang active.
- PASS 2 không được dùng `pgStudents.currentItems` để ghi đè `#quitList`.
- Nút tải thêm của tab Đã nghỉ dùng tổng `fullQuitProfilesCount`, không dùng page hiện tại của Đang tập.

### 4.3. Hiển thị đúng tên võ sinh

`renderQuitRow()` hiện ưu tiên tên hiển thị từ profile:

```js
p.name
p.fullName
p.displayName
p.studentName
p.memberName
```

DocId vẫn được giữ cho `openProfile(...)`, nên mở hồ sơ không bị sai identity.

## 5. Ảnh hưởng Reads

Bản sửa không tải toàn bộ profiles cho Coach và không thay đổi Học phí/Báo nợ.

Tab `Đã nghỉ` là dữ liệu Admin-only và chỉ lazy-load khi cần. Để bao phủ dữ liệu legacy, hệ thống có thể chạy thêm vài query mục tiêu. Chi phí tăng chỉ xảy ra khi Admin mở tab Đã nghỉ, đổi lại danh sách không bị thiếu.

Không có Cloud Functions, migration hoặc thay đổi Firestore Rules.

## 6. Kiểm thử

- `npm run check`: PASS, exit code 0.
- `npm run check:all:critical`: PASS, exit code 0.
- `check:quit-tab-completeness`: 12/12 PASS.
- Syntax: 232 items PASS.
- Deploy package: 12/12 PASS.
- GitHub Pages paths: 18/18 PASS.
- Firestore indexes: 16/16 PASS.
- Runtime stability: 17/17 PASS.
- Production stability: 22/22 PASS.
- V4A Coach Attendance-only: 30/30 PASS.
- V4B Security/Branch Boundary: 35/35 PASS.
- V4B1 Coach Branch Runtime Repair: 25/25 PASS.
- Inventory Ledger Reconciliation: 33/33 PASS.

## 7. Kiểm tra sau deploy

1. Deploy frontend mới.
2. Tải lại bằng `Ctrl + F5`.
3. Đăng nhập Admin.
4. Mở tab `Đã nghỉ`.
5. Kiểm tra các võ sinh trước đây bị mất tên.
6. Bấm vào tên để mở hồ sơ.
7. Nếu cần debug, chạy:

```js
printProfileScaleMetrics?.()
debugListPaginationCoverage?.()
```

Kỳ vọng:

- `quitProfiles` có dữ liệu.
- `#quitList` không bị page của Đang tập ghi đè.
- Tên hiển thị đúng tên võ sinh, không phải docId.

## 8. Kết luận

Lỗi mất tên trong tab `Đã nghỉ` do kết hợp giữa thiếu tương thích dữ liệu legacy và renderer dùng sai nguồn pagination. Bản V4B2 sửa ở cả tầng đọc dữ liệu, phân loại status, render danh sách và hiển thị tên, đồng thời giữ nguyên các ranh giới giảm Reads và phân quyền hiện có.

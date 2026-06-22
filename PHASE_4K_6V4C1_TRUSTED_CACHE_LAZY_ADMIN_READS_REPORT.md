# Phase 4K-6V4C1 — Trusted Cache + Lazy Admin Reads + Profiles Delta Shadow

Ngày hoàn thành: 20/06/2026
Bản nền: `taekwondo-phase4K-6V4A-coach-attendance-only-read-boundary-complete.zip`
SHA-256 bản nền: `7605db79b88c34d31a3b8a265ea514132388e876c77b5749527c44e91d3b6eb7`

## 1. Mục tiêu

Giảm Firestore Reads do đăng nhập lại, F5/reconnect và các listener Admin không phải phiên nào cũng cần, nhưng không làm thiếu dữ liệu của:

- Học phí;
- Báo nợ;
- Thu gộp;
- Công nợ Kho;
- Lịch sử Kho;
- Điểm danh HLV đã được giới hạn theo cơ sở ở V4A.

Phase này không dùng Blaze, Cloud Functions hoặc migration dữ liệu.

## 2. Phương án đã chọn

V4C1 gồm bốn lớp:

1. **Trusted-device Firestore persistent cache** — chỉ bật khi người dùng xác nhận máy cá nhân.
2. **Stable listener lifecycle** — một listener giữ nguyên trong phiên, không tháo/gắn lại khi hàm setup bị gọi trùng.
3. **Lazy Admin reads** — công nợ Kho chỉ mount khi có chức năng thật sự cần.
4. **Profiles delta-sync shadow readiness** — đo độ sẵn sàng cho V4C2 từ dữ liệu đã tải, chưa thay nguồn realtime hiện tại.

Không chuyển active profiles hoặc transactions sang delta sync trong phase này vì mọi đường ghi chưa có `syncVersion` thống nhất. Chuyển sớm có thể làm thiếu võ sinh trong Học phí/Báo nợ.

## 3. Thay đổi đã thực hiện

### 3.1. Trusted-device cache

Tạo mới:

```text
js/core/firestoreCachePolicy.js
```

Khi thiết bị tin cậy được bật:

```js
initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});
```

Khi không bật:

```js
initializeFirestore(app, {
    localCache: memoryLocalCache()
});
```

Mặc định vẫn là memory-only. Không tự lưu dữ liệu bền trên máy công cộng.

#### Một Firestore instance dùng chung

Cả `app.js` và `js/firebase/config.js` đều lấy DB qua `FirestoreCachePolicy.initialize(app)` và dùng chung:

```js
window.__primaryFirestoreDb
```

Điều này tránh legacy runtime và module runtime khởi tạo hai cấu hình cache khác nhau.

#### Tách cache theo Auth UID

Persistent Firestore cache là cache cấp project, không tự tách hoàn toàn theo tài khoản đăng nhập. V4C1 lưu UID đã ràng buộc với thiết bị tin cậy.

Nếu UID thay đổi:

1. Dừng Firestore instance hiện tại.
2. Xóa persistent cache.
3. Ràng buộc UID mới.
4. Reload trước khi các query nghiệp vụ được mount.

Nếu xóa cache thất bại, thiết bị tin cậy bị tắt và lần reload tiếp theo dùng memory-only.

#### Xóa cache thiết bị

Màn hình đăng nhập có:

- Checkbox “Đây là thiết bị cá nhân/tin cậy”.
- Nút “Xóa cache thiết bị”.

Tắt thiết bị tin cậy cũng tự xóa cache bền trước khi chuyển về memory-only.

### 3.2. Công nợ Kho lazy-once-per-session

Trước V4C1, Admin đăng nhập là listener sau có thể mount ngay:

```js
query(inventoryRef, where('unpaid', '==', true))
```

Sau V4C1, trạng thái ban đầu:

```text
unmounted
```

Listener chỉ mount lần đầu khi Admin:

- mở tab Kho;
- mở tab Báo nợ;
- mở Thu gộp;
- chạy chức năng cần công nợ Kho;
- xuất báo cáo có dữ liệu Kho.

Sau khi mount, listener được giữ đến hết phiên và không tạo lại khi đổi tab.

API:

```js
ensureInventoryDebtListener(reason)
waitForInventoryDebtCompleteness(options)
```

Trạng thái completeness:

```text
unmounted
loading
complete
partial
failed
blocked-coach-attendance-only
```

### 3.3. Completeness gate cho nghiệp vụ tiền

#### Thu gộp

`processMultiItem()` không được ghi giao dịch nếu công nợ Kho chưa `complete`.

Điều này ngăn tình huống tối ưu Reads nhưng Thu gộp không nhìn thấy khoản nợ đang tồn tại.

#### Xuất Excel

Export chờ dữ liệu công nợ Kho đầy đủ. Nếu hết thời gian hoặc listener lỗi, export dừng và cảnh báo thay vì xuất file thiếu dữ liệu.

#### Báo nợ và Kho

Khi mở tab, listener được mount. Trong thời gian loading, hệ thống hiển thị cảnh báo và không được kết luận “không có nợ Kho”.

### 3.4. Loại bỏ notification Reads trùng

Trước V4C1, Admin bootstrap chạy đồng thời:

```text
getDocs(unread notifications, limit 50)
+ onSnapshot(unread notifications)
```

Initial snapshot của listener đã cung cấp trạng thái hiện tại. Query `getDocs()` trước đó gây đọc trùng.

Sau V4C1:

- bootstrap chỉ gọi `setupNotifListener()`;
- listener có `limit(50)`;
- `safeRegisterSnapshot()` chặn setup trùng;
- không remove/recreate listener mỗi lần setup được gọi.

`checkAdminNotifications()` vẫn được giữ làm công cụ fallback thủ công nhưng không còn được bootstrap gọi.

### 3.5. Profiles delta-sync shadow readiness

Tạo mới:

```text
js/core/profileDeltaSyncShadow.js
```

Module này:

- không gọi `getDocs()`;
- không gọi `onSnapshot()`;
- không ghi Firestore;
- chỉ nhận active profile map đã được listener hiện tại tải;
- đo tỷ lệ profile có `updatedAt`, `syncVersion` và ID ổn định;
- tạo fingerprint không đảo ngược;
- chỉ lưu metadata/fingerprint, không lưu tên võ sinh;
- luôn giữ `cutoverAllowed: false` trong V4C1.

Console:

```js
printProfileDeltaShadowReadiness()
```

V4C2 chỉ được triển khai khi mọi đường ghi profile đã cập nhật `updatedAt + syncVersion` nguyên tử và shadow đạt 100% coverage.

## 4. Những phần cố ý giữ nguyên

Để không ảnh hưởng Học phí/Báo nợ:

- Active profiles listener Admin vẫn tải toàn bộ võ sinh đang tập ở lần đầu.
- Transaction listener tháng hiện tại vẫn giữ realtime.
- `inventory_stats` vẫn mount cho Admin vì chỉ là một document và cần cho tồn kho, size, thêm võ sinh, Thu gộp.
- Canonical Tuition Ledger không thay đổi.
- Debt Profile Read Boundary không thay đổi.
- Inventory history vẫn phân trang 100 dòng/lần.
- HLV Attendance-only V4A vẫn giữ nguyên.

## 5. Tác động Reads dự kiến

### 5.1. Phiên Admin không mở Kho/Báo nợ/Thu gộp/export

Tiết kiệm:

```text
N document công nợ Kho đang unpaid
```

Ví dụ có 300 khoản nợ Kho đang hoạt động thì phiên này tránh khoảng 300 initial document reads.

### 5.2. Notification

Loại bỏ một query ban đầu trùng, tiết kiệm tối đa khoảng 50 document reads mỗi lần Admin đăng nhập, tùy số thông báo chưa đọc.

### 5.3. Thiết bị tin cậy

- Lần đầu trên thiết bị mới vẫn phải tải dữ liệu đầy đủ.
- F5/reconnect/đăng nhập lại trên thiết bị đã có cache có thể giảm đáng kể Reads, tùy dữ liệu thay đổi và khả năng resume của Firestore.
- Không thể cam kết một tỷ lệ cố định từ code; cần đo Firebase Usage trước/sau cùng mức hoạt động.

### 5.4. Những Reads vẫn còn

Admin lần đầu hoặc máy không bật trusted cache vẫn đọc:

- active profiles toàn CLB;
- transactions tháng hiện tại;
- các document cấu hình;
- inventory debts khi mở một chức năng cần Kho.

V4C1 không tuyên bố đã biến mỗi login thành vài Reads. Mục tiêu đó cần V4C2/V4C3/V4C4 với version manifest và delta sync sau khi write boundary hoàn chỉnh.

## 6. Diagnostics

### Cache

```js
printFirestoreCachePolicy()
```

Kỳ vọng máy tin cậy:

```text
mode: persistent-multi-tab
trustedPreference: true
userBindingPresent: true
```

Máy dùng chung:

```text
mode: memory-only
trustedPreference: false
```

### Tổng trạng thái tối ưu

```js
printFirestoreOptimizationStatus()
```

Ngay sau Admin login nhưng chưa mở Kho/Báo nợ/Thu gộp:

```text
inventoryDebtMounted: false
inventoryDebtCompleteness: unmounted
adminNotificationListenerMounted: true
notificationListenerCount: 1
```

Sau khi mở Báo nợ:

```text
inventoryDebtMounted: true
inventoryDebtCompleteness: complete
inventoryDebtMountReason: module-switch-debt-tab hoặc legacy-enter-debt-tab
```

### Shadow V4C2

```js
printProfileDeltaShadowReadiness()
```

Nếu `updatedAtCoveragePct` hoặc `syncVersionCoveragePct` chưa đạt 100%, không được cutover active profiles listener.

## 7. Kiểm thử bắt buộc

### Admin

1. Đăng nhập và chỉ ở Học phí: inventory debt phải `unmounted`.
2. Học phí và transaction tháng vẫn hiển thị đầy đủ.
3. Mở Báo nợ: inventory debt chuyển `loading → complete`.
4. Báo nợ hiển thị đủ học phí và nợ Kho sau complete.
5. Mở Thu gộp ngay khi mạng chậm: nút xử lý phải chờ hoặc dừng, không ghi phiếu thiếu nợ Kho.
6. Mở Kho: lịch sử vẫn phân trang, công nợ mount một lần.
7. Gọi `setupNotifListener()` nhiều lần: listener count vẫn là một.

### HLV

1. Chỉ tải Điểm danh đúng cơ sở như V4A.
2. Không mount transaction, inventory stats hoặc inventory debts.
3. Trusted cache không làm mất branch boundary.

### Cache

1. Bật trusted device → reload → mode persistent.
2. F5 → dữ liệu hiển thị từ cache và đồng bộ server.
3. Đăng xuất, đăng nhập cùng UID → cache được phép tái sử dụng.
4. Đăng nhập UID khác → cache bị xóa và reload trước bootstrap.
5. Tắt trusted device → cache bền bị xóa và mode chuyển memory-only.

## 8. Rollback

Rollback V4C1 không cần migration dữ liệu:

1. Khôi phục các file theo patch V4C1.
2. Cache cũ trên trình duyệt có thể xóa bằng nút “Xóa cache thiết bị”.
3. Firestore documents không bị thay cấu trúc.
4. Không có manifest document hoặc syncVersion được ghi trong V4C1.

## 9. Bước tiếp theo

Không triển khai transaction delta sync ngay.

Bước tiếp theo phù hợp là **V4C2 — Profile Write Boundary + Manifest Shadow**:

1. Liệt kê và gom tất cả đường ghi profile.
2. Mỗi create/update/status change ghi `updatedAt` và `syncVersion` nguyên tử.
3. Tạo manifest profiles nhưng chưa dùng làm nguồn production.
4. Chạy shadow comparison 3–7 ngày.
5. Chỉ cutover nếu count, ID, status, debt inputs và search data khớp 100%.


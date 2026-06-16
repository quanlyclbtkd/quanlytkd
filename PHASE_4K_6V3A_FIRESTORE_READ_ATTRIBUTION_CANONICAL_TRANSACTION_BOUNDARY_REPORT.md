# PHASE 4K-6V3A — FIRESTORE READ ATTRIBUTION + CANONICAL TRANSACTION READ BOUNDARY

**Ngày hoàn thành:** 16/06/2026  
**Bản nền:** Phase 4K-6V2C — Inventory Ledger Reconciliation  
**Phạm vi:** Đo nguồn Firestore Reads, chuẩn hóa chỉ mục tháng cho giao dịch mới, dựng cổng đối chiếu trước khi hợp nhất ba transaction listener.  
**Không sử dụng:** Blaze, Cloud Functions, migration tự động, listener canonical chạy nền.

---

## 1. Mục tiêu của V3A

Hệ thống hiện vẫn phải duy trì ba query giao dịch để tương thích dữ liệu cũ:

1. Theo `date`.
2. Theo `txMonth`.
3. Theo `packageMonths`.

Một document có thể khớp hai hoặc ba query, vì vậy bị Firestore trả về nhiều lần trước khi client loại trùng. Không thể tắt ba query ngay vì giao dịch cũ chưa có một trường tháng thống nhất.

V3A tạo lớp chuyển tiếp an toàn:

- Ghi nhận document đã nhận theo từng listener/query.
- Đo mức giao nhau của ba query mà không phát sinh query mới.
- Chuẩn hóa mọi giao dịch mới bằng `accountingMonths`.
- Dựng query canonical ở chế độ đối chiếu thủ công.
- Không thay nguồn dữ liệu production cho đến khi count, ID và tổng tiền khớp hoàn toàn.

---

## 2. Phân tích các bước triển khai cần thiết

### Bước A — Xác lập ranh giới an toàn

Các nguyên tắc bắt buộc:

- Không xóa hoặc tắt ba listener cũ trong V3A.
- Không tự động chạy query canonical khi đăng nhập.
- Không quét hoặc sửa dữ liệu cũ.
- Không thay đổi cấu trúc collection.
- Không làm thay đổi cách Học phí, Báo nợ, Thu gộp, Thi đai và Dashboard nhận dữ liệu.

### Bước B — Chuẩn hóa tháng kế toán

Một giao dịch có thể biểu diễn tháng bằng nhiều trường:

- `date`
- `txMonth`
- `paymentMonth`
- `packageMonths`
- `components[].month`
- `components[].packageMonths`
- `paymentComponents[]`

Boundary mới hợp nhất tất cả thành:

```javascript
{
  accountingMonths: ["2026-06", "2026-07"],
  primaryAccountingMonth: "2026-06",
  accountingSchemaVersion: 1,
  accountingBoundarySource: "payment-bundle"
}
```

### Bước C — Bao phủ tất cả đường ghi giao dịch

Boundary phải áp dụng cho:

- Form giao dịch thông thường.
- Thu học phí một tháng và nhiều tháng.
- Thu gộp khoản.
- Thu lệ phí thi.
- Thu đồ võ và tặng đồ.
- Thêm võ sinh có học phí/võ phục.
- Ghi chi phí và chi phí kỳ thi.
- Giao dịch gia đình.
- FinanceService, StudentService và InventoryService.
- Giao dịch được lưu trong offline queue.
- Sửa giao dịch có thay đổi trường tháng.

### Bước D — Đo Reads theo đúng nguồn

Không dùng kích thước danh sách đã merge để ước tính Reads vì danh sách đó đã loại trùng. Metrics được đặt ngay tại snapshot/query nguồn:

- Active profile listener.
- Full profile fallback.
- Quit profile query.
- Debt full-profile scan.
- Ba transaction listener.
- Inventory history pagination.
- Inventory active-debt listener.
- Dashboard stats/fallback.
- Notification query/listener.

Snapshot đầu tiên ghi `snapshot.size`; snapshot tiếp theo ưu tiên `snapshot.docChanges().length`.

### Bước E — Dựng cổng đối chiếu canonical

Query canonical:

```javascript
where("accountingMonths", "array-contains", selectedMonth)
```

Chỉ chạy khi Admin chủ động gọi. Kết quả được so sánh với dữ liệu ba query cũ đang tải theo:

- Số document duy nhất.
- Tập document ID.
- Tổng `amount`.
- Nguy cơ chạm giới hạn query.

Chỉ báo `readyForCanonicalCutover === true` khi tất cả điều kiện đều khớp.

### Bước F — Giữ tương thích và chạy hồi quy

- Giữ marker/cache compatibility cho V2C và các phase cũ.
- Cache-bust tất cả module đã thay đổi.
- Không tạo hai module instance Dashboard do URL import khác nhau.
- Giữ `app.js` trong giới hạn Phase 4K-6V.
- Chạy toàn bộ gate mặc định và `check:all`.

---

## 3. Những thay đổi đã thực hiện

### 3.1 Boundary mới

File mới:

```text
js/core/transactionCanonicalBoundary.js
```

API được cung cấp:

```javascript
window.canonicalizeTransactionForWrite(data, reason)
window.canonicalizeTransactionPatch(patch, existing, reason)
window.recordFirestoreReadAttribution(source, docs, detail)
window.recordFirestoreSnapshotAttribution(source, snapshot, detail)
window.recordTransactionQueryOverlap(month, sources)
window.printFirestoreReadAudit()
window.resetFirestoreReadAudit(reason)
window.runCanonicalTransactionParityAudit(month, options)
```

Boundary là classic deferred script và được tải trước `app.js`, nên cả legacy runtime và ES modules đều dùng chung một implementation.

### 3.2 Canonical schema cho giao dịch mới

Mọi create path được kiểm tra đã đi qua canonical boundary. Patch chỉ tái tính tháng khi trường liên quan tháng thay đổi, tránh ghi dư trong các thao tác chỉ đổi tên hoặc trạng thái.

`txMatchesSelectedMonth()` ưu tiên `accountingMonths` trước, sau đó vẫn giữ fallback dữ liệu cũ.

### 3.3 Read attribution

Metrics phân biệt:

- Initial snapshot documents.
- Changed documents.
- Số event.
- Mức cao nhất của một event.
- Lý do và thời điểm gần nhất.

Mức giao nhau của ba transaction query hiển thị:

```text
rawDocs
uniqueDocs
duplicateDocs
overlapPercent
canonicalCovered
canonicalMissing
canonicalCoveragePercent
```

### 3.4 Chống đăng ký listener trùng

Guard listener cùng CLB/tháng tiếp tục được giữ nguyên. V3A chỉ quan sát snapshot nguồn, không tạo listener thứ tư.

### 3.5 Parity audit có kiểm soát Reads

- Không chạy tự động.
- Dùng `getDocs()` một lần khi Admin gọi.
- Có TTL cache mặc định 10 phút.
- Lần gọi lặp trong TTL không đọc Firestore lại.
- Giới hạn mặc định theo `txListenerLimit` hiện tại.
- Không tự động tắt listener cũ dù parity đạt.

---

## 4. Cách sử dụng công cụ sau khi deploy

### Xem phân bổ Reads của phiên hiện tại

```javascript
window.printFirestoreReadAudit()
```

### Xóa metrics và đo lại một quy trình cụ thể

```javascript
window.resetFirestoreReadAudit('manual-test')
```

Sau đó thực hiện lần lượt: đăng nhập, mở Học phí, Báo nợ, Kho đồ, Dashboard và gọi lại `printFirestoreReadAudit()`.

### Đối chiếu canonical cho tháng đang chọn

```javascript
await window.runCanonicalTransactionParityAudit('2026-06')
```

Ép chạy lại, bỏ qua cache:

```javascript
await window.runCanonicalTransactionParityAudit('2026-06', { force: true })
```

Lưu ý: lệnh parity tạo document Reads bằng số giao dịch canonical trả về. Không chạy lặp lại không cần thiết.

---

## 5. Kết quả kiểm thử

### Bộ mặc định

```text
npm run check: PASS
```

- Syntax: **116 mục hợp lệ**.
- Phase 4K-6V3A: **34/34 PASS**.
- Phase 4K-6V2C: **33/33 PASS**.
- Phase 4K-6V2B: **28/28 PASS**.
- Phase 4K-6V2A: **25/25 PASS**.
- Phase 4K-6V2: **25/25 PASS**.
- Spark Read Cost Hardening: **17/17 PASS**.
- Attendance Canonical Ownership: **141 assertions PASS**.

### Bộ mở rộng

`check:all` có **65 nhóm kiểm thử**. Chuỗi đơn lớn vượt giới hạn thời gian của môi trường, vì vậy các nhóm còn lại được chạy độc lập với timeout riêng.

Kết quả cuối:

```text
65/65 nhóm kiểm thử: PASS
0 nhóm lỗi
0 nhóm timeout khi chạy độc lập
```

Các nhóm bao gồm:

- Runtime smoke/deploy/GitHub Pages.
- Financial flow và debt actions.
- Thu gộp và học phí nhiều tháng.
- Thi đai và lệ phí thi.
- Kho đồ V2/V2A/V2B/V2C.
- Search và pagination.
- SuperAdmin.
- Listener ownership.
- Dashboard.
- Attendance.
- V3A canonical boundary.

### Giới hạn `app.js`

```text
660.485 byte
10.700 dòng theo gate tương thích
```

Đạt giới hạn Phase 4K-6V.

---

## 6. Ảnh hưởng đến Firestore Reads

### Reads hằng ngày

V3A không thêm query hoặc listener chạy nền, vì vậy instrumentation không làm tăng Reads hằng ngày.

### Parity audit

Chỉ phát sinh Reads khi Admin chủ động gọi. TTL cache ngăn lặp query trong 10 phút.

### Mức giảm Reads ngay ở V3A

V3A **chưa tắt ba transaction listener**, do đó chưa tạo mức giảm lớn ở production. Đây là phase đo lường và chuẩn hóa để V3B/V3C có thể cắt listener an toàn mà không làm mất giao dịch cũ.

---

## 7. Những gì V3A cố ý chưa làm

- Không migration giao dịch cũ.
- Không Cloud Functions.
- Không nâng Blaze.
- Không tắt query theo `date`.
- Không tắt query theo `txMonth`.
- Không tắt query theo `packageMonths`.
- Không tự động chạy parity audit.
- Không kết luận hệ thống đã giải quyết triệt để Reads.

---

## 8. Điều kiện chuyển sang V3B/V3C

Trước khi hợp nhất ba listener, cần đo ít nhất các tháng quan trọng và đạt:

```text
missingFromCanonicalCount = 0
extraInCanonicalCount = 0
amountDelta = 0
truncatedRisk = false
readyForCanonicalCutover = true
```

Nếu không đạt, phải backfill có kiểm soát theo từng tháng hoặc giữ compatibility query cho phạm vi dữ liệu cũ.

---

## 9. Danh sách file chính đã thay đổi

```text
app.js
index.html
js/core/transactionCanonicalBoundary.js            [mới]
js/main.js
js/listeners/profiles.listeners.js
js/modules/dashboard.js
js/modules/finance.js
js/modules/inventory.js
js/modules/students.js
js/services/finance.service.js
js/services/inventory.service.js
js/services/students.service.js
js/ui/render.js
js/ui/tabs.js
js/utils/offline-queue.js
package.json
tools/check-firestore-read-attribution-canonical-tx-boundary.mjs [mới]
```

---

## 10. Kết luận

Phase 4K-6V3A đã hoàn thành đúng vai trò **đo lường + canonical write boundary + cutover gate**:

- Không làm thay đổi nghiệp vụ production.
- Không thêm listener/query nền.
- Giao dịch mới có chỉ mục tháng thống nhất.
- Reads được quy nguồn rõ ràng hơn.
- Có thể đo chính xác mức đọc trùng của ba transaction query.
- Có parity audit trước khi cắt listener.
- Toàn bộ gate dự án đã đạt khi chạy độc lập.

Bước tiếp theo chỉ nên là V3B/V3C sau khi thu thập số liệu thực tế và canonical parity đạt cho phạm vi tháng cần vận hành.

# Phase 4K-6V4D1 — Profile Canonical Store Read-only Audit

## Mục tiêu

Tạo lớp **Profile Canonical Store** ở chế độ read-only để chuẩn hóa dữ liệu võ sinh trong RAM trước khi cutover các tab.

Phase này **không đổi logic UI chính**, **không thêm Firestore Reads**, **không ghi dữ liệu**, **không migration**.

## Các bước đã kiểm tra trước khi thực hiện

1. Xác định phạm vi V4D1 chỉ là read-only audit, không cutover tab.
2. Kiểm tra các lỗi gần đây cần tránh:
   - Báo nợ thiếu võ sinh do nhiều nguồn học phí mâu thuẫn.
   - Báo nghỉ tháng bị ẩn do so sánh raw status/skippedMonths.
   - Firestore 429 do `runAggregationQuery` tự động.
   - Render lặp/chậm do cache invalidation quá rộng.
3. Chọn phương án an toàn:
   - Tạo file mới `js/core/profileCanonicalStore.js`.
   - Load sau `tuitionDebtCanonical.js` và trước `app.js`.
   - Chỉ lấy dữ liệu từ `window.__store.profiles`, `window.allProfiles`, hoặc cache local có sẵn.
   - Giữ fallback legacy vì V4D1 chưa thay render của tab.
4. Thêm test gate riêng để chặn lỗi phát sinh:
   - Store không chứa Firestore read/write API.
   - Có public mirror.
   - Có debug/audit API.
   - Có normalize status/branch/month/search index.
   - Không tăng reads.

## File mới

- `js/core/profileCanonicalStore.js`
- `public/js/core/profileCanonicalStore.js`
- `tools/check-profile-canonical-store-v4d1.mjs`

## API mới

```js
getProfileCanonicalStoreStatus()
auditProfileCanonicalStore()
debugProfileCanonical("Tên võ sinh")
debugProfileCanonicalById("profileId")
buildProfileCanonicalStore({ force: true })
```

## Dữ liệu canonical tạo ra

Mỗi profile raw có bản canonical:

```js
{
  profileId,
  rawId,
  displayName,
  searchText,
  statusRaw,
  statusCanonical,
  isActiveCanonical,
  branchRaw,
  branchCanonical,
  branchAliases,
  paidUntilRaw,
  paidUntilCanonical,
  skippedMonthsRaw,
  skippedMonthsCanonical,
  feeExemptCanonical,
  sourceWarnings
}
```

## Index trong RAM

```js
byId
byRawKey
byStatus
byBranch
activeProfiles
quitProfiles
searchIndex
skippedByMonth
duplicates
warningsByType
profilesWithWarnings
```

## Cam kết an toàn

- Không dùng `getDocs`.
- Không dùng `onSnapshot`.
- Không dùng `getCountFromServer`.
- Không dùng `runAggregationQuery`.
- Không dùng `updateDoc`, `setDoc`, `addDoc`, `deleteDoc`, `writeBatch`.
- Không thay Firestore Rules.
- Không thay schema Firestore.
- Không đổi renderer của Đang tập/Báo nợ/Điểm danh trong V4D1.

## Cache-bust

```text
profile-canonical-store-regression-hotfix-20260628-v4d1a
```

## Kết quả đánh giá sau cập nhật

V4D1 giúp hệ thống có nền tảng để audit dữ liệu võ sinh thống nhất trước khi cutover. Đây là bước chuẩn bị an toàn cho V4D2, không phải migration dữ liệu.

Sau deploy, cần chạy:

```js
getProfileCanonicalStoreStatus()
auditProfileCanonicalStore()
```

Nếu audit còn nhiều cảnh báo `unknownStatusCount`, `unknownBranchCount`, `invalidPaidUntilCount`, `invalidSkippedMonthCount`, `duplicateProfileIdCount`, chưa nên cutover tab. Cần xử lý mapping/canonical rule trước.

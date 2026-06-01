# Phase 4.0B-4J-6A — Attendance Offline Shift Sync + Branch Report Accuracy Patch

**Ngày:** 2026-05-31  
**Trạng thái:** ✅ Hoàn thành

---

## Đã sửa

### Fixed

| Hạng mục | Trạng thái |
|---|---|
| Offline queue stores `shiftId` | ✅ |
| Offline queue stores `docId` (shift-aware) | ✅ |
| `bulkSyncOffline` shift-aware docId | ✅ |
| `bulkCheckIn` rollback cache shift-aware | ✅ |
| `printAttendanceBranchReport` dùng dữ liệu điểm danh thật | ✅ |
| `computeMonthlyAttendanceAccuracy` hỗ trợ shiftId key lookup | ✅ |
| `computeMonthlyAttendanceAccuracy` xử lý object values từ `loadByMonth` | ✅ |
| `printAttendanceStatus` có `offlineQueueCount` + `offlineShiftRecordsCount` | ✅ |

---

## Safety

| Kiểm tra | Kết quả |
|---|---|
| Firestore schema changed | ❌ Không |
| Old attendance data deleted | ❌ Không |
| Deploy executed | ❌ Không |
| Public rules opened | ❌ Không |
| PII (tên võ sinh) logged | ❌ Không |
| React conversion | ❌ Không |

---

## Tests

| Tool | Kết quả |
|---|---|
| `check-syntax.mjs` | ✅ PASS |
| `check-attendance-reliability.mjs` | ✅ PASS |
| `check-attendance-scheduled-accuracy.mjs` | ✅ PASS |
| `check-attendance-offline-shift.mjs` | ✅ PASS |
| `check:all` | ✅ PASS |

---

## Giải thích chi tiết

### 1. Vì sao offline sync theo ca bị sai trước đây?

`_saveAttOffline(clubId, date)` lưu payload vào `localStorage` nhưng **không lưu `shiftId` và `docId`** vào từng record:

```js
// CŨ — thiếu shiftId và docId
payload.records[name] = {
    name, status, belt, branch, date, month, profileId
};
```

Khi `bulkSyncOffline` chạy, nó tính docId theo kiểu:
```js
rec.name + '_' + date  // → luôn là name_date, bỏ qua ca tập
```

Nên dữ liệu offline của ca "Buổi sáng" và "Buổi chiều" đều ghi vào cùng một document — gây ghi đè và mất dữ liệu ca trước.

### 2. Đã lưu `shiftId`/`docId` vào offline queue thế nào?

Trong `_saveAttOffline`:

```js
const shiftId = _currentShiftId || '';
const docId   = getAttendanceDocId(name, date, shiftId || null);
payload.records[name] = {
    ...,
    shiftId, docId
};
```

`getAttendanceDocId` đã tồn tại và xử lý đúng:
- Có ca: `name_date_shiftId`
- Không ca: `name_date`

### 3. `bulkSyncOffline` ghi đúng docId theo ca ra sao?

```js
const docId = rec.docId || _getAttDocId(rec.name, rec.date || date, rec.shiftId || '');
```

- Nếu record đã có `docId` (từ Phase 6A trở đi): dùng trực tiếp
- Nếu record cũ không có `docId`: tính lại từ `rec.shiftId` (nếu có) hoặc fallback `name_date`
- `docId` bị xóa khỏi data ghi Firestore (`delete writeData.docId`) — chỉ dùng làm document path

### 4. `printAttendanceBranchReport` dùng dữ liệu thật thế nào?

Trước đây:
```js
const acc = computeMonthlyAttendanceAccuracy(p, monthStr, {}); // ← map rỗng!
```

→ `missingAttendanceCount` luôn bằng `expectedSessions` dù đã điểm danh.

Bây giờ:
```js
const monthRecords = await AttendanceService.loadByMonth(monthStr);
// ... forEach
const attendanceMap = _buildAttendanceMapForProfile(monthRecords, name);
const acc = computeMonthlyAttendanceAccuracy(p, monthStr, attendanceMap, { profileName: name });
```

`_buildAttendanceMapForProfile` xây map với 3 loại key:
- `profileName_date_shiftId` — cho records có ca tập
- `profileName_date` — fallback không có ca
- `date` — fallback cho `computeMonthlyAttendanceAccuracy` kiểu cũ

### 5. Dữ liệu cũ không có `shiftId` còn dùng được không?

**Có.** Mọi nơi đều có fallback:

- `bulkSyncOffline`: `rec.docId || _getAttDocId(rec.name, date, rec.shiftId || '')` → khi không có shiftId, dùng `name_date`
- `computeMonthlyAttendanceAccuracy`: thử key shiftId trước, fallback `profileName_date`, fallback `date`
- `_buildAttendanceMapForProfile`: ghi cả key `date` để lookup kiểu cũ vẫn hoạt động
- Rollback cache: `getAttendanceDocId(name, date, _currentShiftId)` → khi không có ca, trả `name_date`

### 6. Đã test những gì?

- **18-item static check** trong `check-attendance-offline-shift.mjs`:
  - `_saveAttOffline` lưu shiftId + docId
  - `bulkSyncOffline` dùng rec.docId, shift-aware fallback, không leak docId vào Firestore doc
  - `bulkCheckIn` rollback dùng `getAttendanceDocId`
  - `printAttendanceBranchReport` async, gọi `loadByMonth`, không còn map rỗng
  - `computeMonthlyAttendanceAccuracy` hỗ trợ shiftId key + object values
  - `printAttendanceStatus` có `offlineQueueCount` + `offlineShiftRecordsCount`
  - Không viết Firestore trong helpers mới
  - Không log PII
  - Backward compat cho records cũ không có shiftId
  - Không mở firestore.rules public

---

## Scripts đã thêm vào `package.json`

```json
"check:attendance-offline-shift": "node tools/check-attendance-offline-shift.mjs"
```

`check:all` đã được cập nhật để chạy thêm check này.

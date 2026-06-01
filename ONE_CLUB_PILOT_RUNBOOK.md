# One-Club Pilot Runbook

> Phase 4.0B-4H — Taekwondo Club Management SaaS
> Thực hiện từng bước theo thứ tự. Dùng cho mỗi CLB pilot.

---

## Chuẩn bị

1. Đảm bảo đã hoàn thành `PILOT_BACKUP_CHECKLIST.md` cho CLB này.
2. Chuẩn bị tài khoản admin của CLB (email + password).
3. Mở terminal tại thư mục project.

---

## Bước 1 — Chạy local server

```bash
npm run local
```

Mở browser tại địa chỉ được hiển thị (thường `http://localhost:3000` hoặc port được ghi ra).

> **Lưu ý:** Server này chỉ để verify local. Không deploy lên production trong bước này.

---

## Bước 2 — Login

1. Mở browser → vào URL local server.
2. Login bằng tài khoản admin của CLB.
3. Chờ app load xong (không có spinner, tabs hiển thị).

---

## Bước 3 — Mở DevTools Console

- Chrome/Edge: `F12` → tab **Console**
- Firefox: `F12` → tab **Console**
- Safari: `Cmd+Option+I` → tab **Console**

---

## Bước 4 — Chạy các lệnh kiểm tra

Chạy từng lệnh theo thứ tự, chờ kết quả trước khi chạy lệnh tiếp theo:

### 4.1 — Resolve data source

```js
const ds = await window.resolveActiveDataSource()
console.log('source:', ds.source, '| reason:', ds.reason)
```

✅ Kết quả mong đợi: `source: "primary"` hoặc `source: "legacy-root"`

⚠️ Nếu `source: "empty"` hoặc `source: "permission-error"` → dừng, xem phần Xử lý lỗi bên dưới.

---

### 4.2 — Kiểm tra data hydration

```js
window.printDataHydrationStatus()
```

✅ Kết quả mong đợi: `profilesDocCount > 0`, `settingsLoaded: true`, `clubLoaded: true`

---

### 4.3 — Kiểm tra tab readiness

```js
window.printPilotTabReadiness()
```

✅ Kết quả mong đợi: `tuitionReady: true`, `debtReady: true`, `profilesCount > 0`

---

### 4.4 — Chạy pilot gate (kết quả go/no-go chính thức)

```js
const gate = window.printOneClubPilotGate()
```

✅ **GO** khi: `readyForOneClubPilot: true` và `blockers: []`

❌ **NO-GO** khi: `blockers` có phần tử → xem từng blocker và xử lý

---

### 4.5 — Chụp snapshot đầy đủ (để lưu vào report)

```js
const snap = await window.generatePilotLaunchSnapshot()
console.log(JSON.stringify(snap, null, 2))
```

Sao chép toàn bộ output JSON → dán vào `PILOT_LAUNCH_REPORT_TEMPLATE.md` của CLB này.

---

## Bước 5 — Kiểm tra tabs thủ công

Click vào từng tab và kiểm tra:

| Tab | Kiểm tra |
|---|---|
| **Học phí** | Danh sách học phí hiển thị đúng tên, số tiền |
| **Báo nợ** | Danh sách nợ hiển thị, số tiền đúng |
| **Đang tập** | Danh sách võ sinh active |
| **Đã nghỉ** | Danh sách võ sinh đã nghỉ |
| **Kho đồ** | Danh sách hàng tồn kho |
| **Tổng quan** | Dashboard hiển thị số liệu tổng hợp |
| **Điểm danh** | Bảng điểm danh load được |
| **Thi đai** | Danh sách thi đai load được |

---

## Bước 6 — Xác định pass/fail

### ✅ PASS — sẵn sàng pilot

- `readyForOneClubPilot: true`
- `blockers: []`
- Tất cả tabs chính hiển thị đúng
- Không có console error màu đỏ liên quan đến dữ liệu

### ❌ FAIL — cần xử lý trước

- `readyForOneClubPilot: false`
- `blockers` có phần tử
- Tab hiển thị trống hoặc lỗi

---

## Bước 7 — Ghi report

1. Sao chép `PILOT_LAUNCH_REPORT_TEMPLATE.md` → đổi tên thành `PILOT_LAUNCH_REPORT_<clubId>_<date>.md`
2. Điền đầy đủ thông tin club info, kết quả từng lệnh console, tab verification.
3. Điền **Decision** section: Ready for 1-CLB pilot: Yes/No + blockers.

---

## Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Xử lý |
|---|---|---|
| `source: "empty"` | Chưa có dữ liệu trong Firestore | Kiểm tra clubId đúng chưa |
| `source: "permission-error"` | Firestore rules chưa set cho CLB này | Kiểm tra rules + user role |
| `profilesCount: 0` | Dữ liệu chưa sync về store | Reload trang, login lại |
| `tuitionReady: false` | Tab học phí chưa nhận đủ dữ liệu | Chờ 3–5 giây, chạy lại |
| `runtimeRecovery.error` | Recovery bị lỗi runtime | Xem chi tiết error, reload |
| Console error đỏ | Lỗi JS runtime | Copy error → gửi vào `PILOT_ISSUE_REPORT_TEMPLATE.md` |

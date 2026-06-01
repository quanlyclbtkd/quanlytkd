# Phase 4.0B-4G: 10-Club Pilot Hardening Report

> Taekwondo Club Management SaaS
> Hoàn thành: Phase 4.0B-4G — 10-CLB Pilot Hardening + Browser Verification + Tenant Safety

---

## Tóm tắt

Phase 4.0B-4G bổ sung các lớp kiểm tra, công cụ vận hành và điều kiện thực tế cho hệ thống sẵn sàng mở rộng pilot lên 10 CLB có kiểm soát.

---

## Những gì đã thực hiện

### 1. printTenClubPilotReadiness (Phase 1 + 2)

Thêm `window.printTenClubPilotReadiness()` vào `app.js`.

Hàm tổng hợp trạng thái từ:
- `printPilotLaunchStatus()`
- `getRuntimeHealthStatus()`
- `printDataHydrationStatus()`
- `printPilotTabReadiness()`

Trả về object:
```
{
  activeDataSource,
  profilesCount,
  transactionsCount,
  inventoryCount,
  readyForOneClubPilot,
  readyForTenClubPilot,
  blockers: []
}
```

### 2. Điều kiện readyForTenClubPilot (Phase 1)

`readyForTenClubPilot` trong `printPilotLaunchStatus()` không còn hard-code `false`.

`readyForTenClubPilot = true` chỉ khi tất cả điều kiện đều thỏa:

| Điều kiện | Blocker nếu không thỏa |
|---|---|
| readyForOneClubPilot = true | `readyForOneClubPilot = false` |
| activeDataSource = primary hoặc legacy-root | `activeDataSource = <value>` |
| profilesCount > 0 | `profilesCount = 0` |
| tuitionReady = true | `tuitionReady = false` |
| debtReady = true | `debtReady = false` |
| dashboardReady = true | `dashboardReady = false` |
| runtimeRecovery.completed = true HOẶC source = primary | `runtimeRecovery not completed...` |
| Không có runtimeRecovery.error | `runtimeRecovery.error exists` |
| Không có critical health check fail | `critical runtime health missing` |

`pilotBlockers: []` ghi rõ từng điều kiện chưa thỏa.

### 3. Tenant Isolation Check (Phase 3)

Tạo `tools/check-tenant-isolation.mjs` kiểm tra 9 điều kiện:

1. App dùng `clubs/${clubId}` dynamic pattern
2. Không hard-code clubId cụ thể
3. Legacy fallback `tst_*` read-only (không có setDoc/updateDoc)
4. Fallback có guard — chỉ kích hoạt khi `source === 'legacy-root'`
5. Firestore rules không có catch-all public read
6. Rules có clubId/role guard (`isClubMember`, `myClubId`, `isClubAdmin`)
7. Không có anonymous read clubs
8. Không có migration/copy trong recovery
9. SuperAdmin được bảo vệ riêng biệt

### 4. Backup / Export Checklist (Phase 4)

Tạo `PILOT_BACKUP_CHECKLIST.md` — checklist vận hành trước khi giao CLB dùng thật.

Bao gồm: xác định project, export dữ liệu, chụp runtime status, kiểm tra tabs, ràng buộc bắt buộc.

### 5. Pilot Launch Report Template (Phase 5)

Tạo `PILOT_LAUNCH_REPORT_TEMPLATE.md` — template report cho từng CLB pilot.

Bao gồm: club info, runtime checks, tab verification, known issues, decision.

### 6. Ten-Club Pilot Check Tool (Phase 6)

Tạo `tools/check-ten-club-pilot.mjs` kiểm tra 8 điều kiện tĩnh.

Thêm scripts vào `package.json`:
- `"check:tenant"`: `node tools/check-tenant-isolation.mjs`
- `"check:ten-club"`: `node tools/check-ten-club-pilot.mjs`

Cập nhật `check:all` bao gồm cả hai tool mới.

---

## Ràng buộc đảm bảo

- **Không deploy**
- **Không ghi Firestore**
- **Không migration tự động**
- **Không mở Firestore Rules public**
- **Không log PII**
- **Không rewrite app**
- **Không đổi schema**
- **Không đổi business logic**

---

## Blockers còn lại

Không có blocker kỹ thuật từ phía codebase. Blockers thực tế phụ thuộc vào runtime:

- `profilesCount = 0` → cần có dữ liệu thật trong Firestore
- `activeDataSource = unknown` → cần đăng nhập và resolve data source
- `runtimeRecovery not completed` → cần chạy `runRuntimeDataRecovery()` sau login

---

## Cách verify sau khi login

```js
// Bước 1: resolve data source
await window.resolveActiveDataSource()

// Bước 2: kiểm tra dữ liệu đã hydrate
window.printDataHydrationStatus()

// Bước 3: kiểm tra từng tab
window.printPilotTabReadiness()

// Bước 4: tổng hợp 1-CLB và 10-CLB readiness
window.printPilotLaunchStatus()
window.printTenClubPilotReadiness()
```

---

## Kết quả check:all

Tất cả 9 tools pass:

| Tool | Kết quả |
|---|---|
| check-syntax | ✅ |
| check-assets | ✅ |
| check-deploy-contract | ✅ |
| check-functions | ✅ |
| check-runtime-bootstrap | ✅ |
| check-data-hydration | ✅ |
| check-pilot-readiness | ✅ |
| check-tenant-isolation | ✅ |
| check-ten-club-pilot | ✅ |

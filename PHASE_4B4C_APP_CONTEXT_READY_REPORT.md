# Phase 4.0B-4C App Context Ready Dispatch Report

## Objective
- Dispatch `app:context-ready` từ `app.js` sau khi login + `initSaaSDatabase` đã set context cơ bản
- Kích hoạt after-login runtime health check trong `main.js` thật (thay vì chỉ có listener nhưng chưa bao giờ nhận event)

---

## Added

### `app.js` — helper `dispatchAppContextReady`

```js
window.__appContextReadyState = { ready, clubId, dispatchedAt, generation, reason }
function dispatchAppContextReady(reason) { ... }
window.dispatchAppContextReady = dispatchAppContextReady;
```

- Kiểm tra context tối thiểu trước khi dispatch: `db && store.db && clubId`
- Guard idempotent: không dispatch lại nếu cùng `clubId + reason` đã sẵn sàng
- `generation` tăng mỗi lần dispatch thật — phân biệt các session login khác nhau
- Không throw, chỉ `warn` nếu context chưa đủ

### `app.js` — sync alias trong `initSaaSDatabase`

```js
window.__store.currentClubId = clubId;
window.__store.currentUser   = auth.currentUser || null;
window.currentClubId         = clubId;
dispatchAppContextReady('initSaaSDatabase-store-synced');
```

### `app.js` — logout reset

```js
window.__appContextReadyState = { ready: false, clubId: null, ..., reason: 'logout' };
window.currentClubId = null;
window.__store.currentClubId = null;
window.__store.clubId        = null;
```

---

## Context tối thiểu `app:context-ready` có nghĩa là gì?

| Điều kiện | Nghĩa |
|-----------|-------|
| `db` đã init | Firebase Firestore instance sẵn sàng |
| `store.db` đã set | Bridge `window.__store.db` đã gán |
| `clubId` tồn tại | Club đã xác định cho session này |
| `colRef`, `profRef`, `invRef` đã tạo | Collection references sẵn sàng để đọc |

**KHÔNG có nghĩa là:** data snapshot (học viên, tài chính, kho) đã load xong — đó là việc của các listener Firestore bên trong `initSaaSDatabase`.

---

## Luồng hoạt động sau Phase 4C

```
1. User nhập email/password → signIn Firebase
2. onAuthStateChanged(user) bắn
3. Đọc Firestore lấy clubId, role
4. gọi initSaaSDatabase(clubId)
5.   colRef, profRef, invRef được tạo
6.   window.__store.db/colRef/profRef/invRef/clubId được set
7.   window.__store.currentClubId = clubId  ← 4C mới thêm
8.   window.currentClubId = clubId          ← 4C mới thêm
9.   dispatchAppContextReady('initSaaSDatabase-store-synced')  ← 4C mới thêm
10.     → CustomEvent('app:context-ready') bắn lên window
11.       → main.js listener _onAppContextReady() nhận event
12.           → setTimeout 300ms → printRuntimeHealth({ phase: 'after-login' })
13.               → getRuntimeHealthStatus({ phase: 'after-login' })
14.                   → kiểm tra 6 health checks after-login
15.                   → in kết quả phân loại critical/warning/info ra console
```

---

## Cách kiểm tra sau khi login (DevTools Console)

```js
// Trạng thái context
window.__appContextReadyState
// → { ready: true, clubId: "abc123", generation: 1, reason: "initSaaSDatabase-store-synced", ... }

// Health check after-login
window.getRuntimeHealthStatus({ phase: 'after-login' })
// → { ok: true/false, criticalMissing: [], warnings: [...], infos: [...] }

// In đẹp ra console
window.printRuntimeHealth({ phase: 'after-login' })
```

---

## Checks

- **check-syntax:** PASS — 80 items (JS files + inline scripts)
- **check-assets:** PASS — 38 items
- **check-deploy:** PASS — FLAT_ROOT_MODE OK
- **check-functions:** PASS — syntax OK, 1 WARN node_modules (hợp lý)
- **check-runtime-bootstrap:** PASS — 38 patterns (main.js + app.js)
- **check:all:** PASS — exit code 0

---

## Runtime Test (sau khi login trên browser)

```
window.__appContextReadyState.ready === true
window.__appContextReadyState.clubId có giá trị
after-login health check chạy thật
không có console.error critical giả
```

---

## Safety

| Hạng mục | Trạng thái |
|----------|-----------|
| Business logic changed | **NO** |
| Firestore schema changed | **NO** |
| Firestore Rules opened public | **NO** |
| Deploy executed | **NO** |
| Firestore collection path changed | **NO** |
| Login/logout flow changed | **NO** — chỉ thêm sau cleanup |
| Module logic changed | **NO** |
| Tách module mới | **NO** |

---

## Files thay đổi

| File | Loại thay đổi |
|------|--------------|
| `app.js` | Thêm helper + alias sync + logout reset |
| `tools/check-runtime-bootstrap.mjs` | Thêm Phần B — kiểm tra app.js |
| `PHASE_4B4C_APP_CONTEXT_READY_REPORT.md` | Tạo mới |
| `MIGRATION_NOTES.md` | Thêm entry Phase 4.0B-4C |

---

## Next Recommended Phase
- **Phase 4.0B-4D:** Lint / Code Quality Gate — ESLint hoặc custom linter enforce convention

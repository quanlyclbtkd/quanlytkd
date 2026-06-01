# Phase 4.0B-4B Runtime Bootstrap Guard Report

## Objective
- Phân loại health check runtime theo 3 mức: `critical` / `warning` / `info`
- Thêm bootstrap guard: kiểm tra ngay sau khi `main.js` load xong
- Thêm after-login guard: lắng nghe event `app:context-ready` trước khi check post-login globals
- Không báo lỗi đỏ giả cho optional globals chưa có ở boot
- Expose debug functions lên `window` để DevTools Console có thể gọi

---

## Health Classification

| Severity | Ý nghĩa | Hành vi |
|----------|---------|---------|
| **critical** | App không thể chạy nếu thiếu | `console.error` — lỗi đỏ thật |
| **warning** | App bị giảm chức năng nếu thiếu | `console.warn` — cảnh báo vàng |
| **info** | Optional — app vẫn chạy bình thường nếu thiếu | `console.info` — không tạo error đỏ |

---

## Health Registry (`RUNTIME_HEALTH_CHECKS`)

### Phase: `bootstrap` — kiểm tra ngay khi main.js load

| Key | Label | Severity |
|-----|-------|----------|
| `appLoaded` | Legacy app.js loaded | **critical** |
| `mainLoaded` | main.js module loaded | **critical** |
| `renderBridge` | Render bridge available | **critical** |
| `tabBridge` | Tab bridge available | warning |
| `loadingBridge` | Loading UI bridge | warning |
| `toastBridge` | Toast bridge | warning |

### Phase: `after-login` — kiểm tra sau khi user login + data mount

| Key | Label | Severity |
|-----|-------|----------|
| `listenerBridge` | Listener registry bridge | warning |
| `profileBridge` | Student profile bridge | warning |
| `financeBridge` | Finance bridge | warning |
| `inventoryBridge` | Inventory bridge | warning |
| `superAdminModule` | SuperAdmin module bound | info |
| `invalidateBridge` | Invalidation bridge | info |

---

## Globals Exposed

### Bootstrap phase (sẵn sàng ngay khi main.js load)
- `window.getRuntimeHealthStatus(options?)` — trả object kết quả phân loại
- `window.printRuntimeHealth(options?)` — in ra console với severity đúng
- `window.ensureModuleRuntimeReady(moduleName, globals[])` — kiểm tra nhẹ, chỉ warn

### After-login phase
- `window.addEventListener('app:context-ready', ...)` — guard đã được đăng ký tự động
- Khi app.js dispatch `app:context-ready`, sẽ tự gọi `printRuntimeHealth({ phase: 'after-login' })`

---

## Cách dùng trong DevTools Console

```js
// Kiểm tra toàn bộ
window.printRuntimeHealth()

// Chỉ bootstrap
window.printRuntimeHealth({ phase: 'bootstrap' })

// Chỉ after-login
window.printRuntimeHealth({ phase: 'after-login' })

// Lấy kết quả dạng object (không log)
const status = window.getRuntimeHealthStatus()
status.ok               // true/false
status.criticalMissing  // array các critical thiếu
status.warnings         // array các warning
status.infos            // array các info

// Kiểm tra module cụ thể
window.ensureModuleRuntimeReady('finance', ['quickPay', 'deleteTx'])
```

---

## Tools

| Script | Mô tả |
|--------|-------|
| `npm run check:runtime-bootstrap` | `node tools/check-runtime-bootstrap.mjs` |

`check-runtime-bootstrap.mjs` kiểm tra source tĩnh trong `js/main.js`:
- Có `RUNTIME_HEALTH_CHECKS` với đủ severity + phase entries
- Có `getRuntimeHealthStatus`, `printRuntimeHealth`, `ensureModuleRuntimeReady`
- Có `app:context-ready` listener
- Có bootstrap health check `setTimeout`
- Không có `throw` bên trong `check()` functions
- `_runHealthCheck` cũ vẫn được guard bởi `_isDev` (backward compat)

---

## Tests

- **check-syntax:** PASS — 80 items (JS files + inline scripts)
- **check-assets:** PASS — 38 items (static + imports)
- **check-deploy:** PASS — FLAT_ROOT_MODE OK
- **check-functions:** PASS — syntax OK, 1 WARN node_modules (hợp lý)
- **check-runtime-bootstrap:** PASS — tất cả patterns tìm thấy
- **check:all:** PASS — exit code 0

---

## Safety

| Hạng mục | Trạng thái |
|----------|-----------|
| Business logic changed | **NO** |
| Firestore schema changed | **NO** |
| Firestore Rules opened public | **NO** |
| Deploy executed | **NO** |
| app.js modified | **NO** |
| _runHealthCheck cũ xóa | **NO** — giữ nguyên, guard bởi `_isDev` |
| Tách module mới | **NO** |
| Chỉ thêm vào `js/main.js` | Thêm `RUNTIME_HEALTH_CHECKS`, 3 globals, 1 event listener |

---

## Next Recommended Phase
- **Phase 4.0B-4C:** Lint / Code Quality Gate — ESLint hoặc custom linter để enforce các convention đã thiết lập

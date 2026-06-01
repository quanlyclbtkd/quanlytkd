# Phase 4.0B-4A Bootstrap Stabilization Report

## Source
- Base phase: 4.0B-3
- app.js: legacy core (không thay đổi business logic)
- main.js: ES module layer (không thay đổi)

## Mục tiêu
Đảm bảo bootstrap, asset loading và kiểm tra deploy ổn định trước khi tiếp tục các phase nâng cấp sau.

---

## Tools Đã Tạo

| Tool | File | Mục đích |
|------|------|----------|
| check-syntax | `tools/check-syntax.mjs` | Kiểm tra syntax tất cả file JS (đã có từ 4.0B-3) |
| check-assets | `tools/check-assets.mjs` | Kiểm tra file tĩnh và import trong main.js |
| check-deploy | `tools/check-deploy-contract.mjs` | Kiểm tra firebase.json và public root |
| check-functions | `tools/check-functions.mjs` | Kiểm tra Cloud Functions source + syntax |
| local-server | `tools/local-server.mjs` | Static HTTP server tại port 8000 |
| check-http-assets | `tools/check-http-assets.mjs` | Kiểm tra HTTP 200 cho các asset |

---

## Checks

- **check-syntax:** `node tools/check-syntax.mjs` — PASS
- **check-assets:** `node tools/check-assets.mjs` — kiểm tra index.html, app.js, style.css, js/main.js, 7 module chính, tất cả imports trong main.js
- **check-deploy:** `node tools/check-deploy-contract.mjs` — kiểm tra firebase.json, hosting.public, rewrites, ignore
- **check-functions:** `node tools/check-functions.mjs` — kiểm tra file + syntax + node_modules warning
- **check:all:** `npm run check:all` — chạy toàn bộ check trên 1 lệnh

---

## Local Test

- **npm run local:** `node tools/local-server.mjs` → server tại `http://localhost:8000`
- **http://localhost:8000:** Serve index.html, app.js, js/main.js, style.css
- **/app.js:** HTTP 200
- **/js/main.js:** HTTP 200
- **/js/modules/superadmin.js:** HTTP 200
- Kiểm tra HTTP: `node tools/check-http-assets.mjs http://localhost:8000`

---

## Thay đổi index.html (Phase 1)

**Chỉ sửa đoạn bootstrap inline script** — không đụng HTML/CSS/business logic:

```
Trước: file:// → console.warn ngắn gọn, không hiện trên màn hình
Sau:  file:// → hiển thị banner đỏ trên màn hình:
       "Không thể chạy đầy đủ bằng file://. Vui lòng chạy bằng HTTP server: npm run local hoặc python -m http.server 8000."
```

Guards giữ nguyên:
- `window.MAIN_JS_LOADING` — ngăn inject lần 2
- `window.MAIN_JS_LOADED` — signal sau-load
- `window.__APP_STANDALONE_FILE_MODE` — file:// flag
- `window.__MODULE_BOOTSTRAP_DISABLED` — block ES module

---

## Scripts package.json

Scripts mới thêm (giữ nguyên scripts cũ):

```bash
npm run check:syntax    # = node tools/check-syntax.mjs
npm run check:assets    # = node tools/check-assets.mjs
npm run check:deploy    # = node tools/check-deploy-contract.mjs
npm run check:functions # = node tools/check-functions.mjs
npm run check:all       # tất cả 4 checks trên
npm run local           # local HTTP server port 8000
```

---

## Safety

| Hạng mục | Trạng thái |
|----------|-----------|
| Business logic changed | **NO** |
| Firestore schema changed | **NO** |
| Firestore Rules opened public | **NO** |
| Deploy executed | **NO** |
| app.js modified | **NO** |
| js/main.js modified | **NO** |
| Tách module mới | **NO** |
| index.html bootstrap script | Chỉ sửa phần file:// warning — thêm visible banner |

---

## Cách chạy kiểm tra đầy đủ

```bash
# Bước 1: Kiểm tra tĩnh
npm run check:all

# Bước 2: Chạy local server
npm run local

# Bước 3 (terminal khác): Kiểm tra HTTP
node tools/check-http-assets.mjs http://localhost:8000

# Bước 4: Mở browser
# http://localhost:8000
# DevTools → Network → kiểm tra /app.js, /js/main.js → 200
```

---

## Next Recommended Phase
- **Phase 4.0B-4B:** Runtime Bootstrap Guard + Health Check Classification

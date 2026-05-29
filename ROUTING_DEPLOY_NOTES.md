# ROUTING & DEPLOY NOTES — Quản lý CLB Taekwondo

> Phase 4.0B-4B — Runtime Asset Base Auto-Detection

---

## 1. Cấu hình assetBase

`assetBase` trong `window.__APP_BOOTSTRAP_CONFIG` (index.html) kiểm soát
cách `resolveAppAsset()` tính đường dẫn tuyệt đối của các file JS/asset.

| `assetBase` | Khi dùng |
|-------------|----------|
| `'auto'`    | **Khuyến nghị** — tự detect dựa theo `canonicalSlug` trong URL |
| `'/'`       | Chỉ đúng khi deploy ở root (ví dụ: `example.com/`) |
| `'/quanlytkd/'` | Hardcode subfolder — OK nếu route không bao giờ thay đổi |

**Phase 4.0B-4B đã đổi mặc định từ `'/'` → `'auto'`.**

---

## 2. Cách `assetBase: 'auto'` hoạt động

`resolveAppAsset('js/main.js')` tìm `canonicalSlug` trong `location.pathname`:

| Pathname đang dùng | Base được tính | Kết quả `js/main.js` |
|--------------------|----------------|----------------------|
| `/quanlytkd/`              | `/quanlytkd/`              | `/quanlytkd/js/main.js`              |
| `/quanlyclbtkd/quanlytkd/` | `/quanlyclbtkd/quanlytkd/` | `/quanlyclbtkd/quanlytkd/js/main.js` |
| `/`                        | `/` (allowRootMode)        | `/js/main.js`                        |

---

## 3. Route canonical & redirect

- **Canonical route:** `/quanlytkd/`
- **Legacy bad slugs:** `/quanly`, `/quanly/`

### Server-side redirect (firebase.json):
```
/quanly     → /quanlytkd/  (301)
/quanly/    → /quanlytkd/  (301)
/quanly/**  → /quanlytkd/  (301)
```

### Client-side route guard (index.html, chạy đồng bộ trước khi load bất kỳ asset nào):

| Pathname vào       | Kết quả                       |
|--------------------|-------------------------------|
| `/quanly`          | redirect → `/quanlytkd/`      |
| `/quanly/`         | redirect → `/quanlytkd/`      |
| `/quanlyclbtkd/quanly`  | redirect → `/quanlyclbtkd/quanlytkd/` |
| `/quanlyclbtkd/quanly/` | redirect → `/quanlyclbtkd/quanlytkd/` |
| `/quanlytkd/`      | không redirect ✓              |
| `/quanlyclbtkd/quanlytkd/` | không redirect ✓         |

**Quan trọng:** Route guard chạy TRƯỚC khi load `app.js` hoặc `js/main.js`.
Nếu redirect xảy ra, không có asset nào được request từ path sai.

---

## 4. Candidate list cho asset loading

Thứ tự tìm kiếm `app.js`:
1. `resolveAppAsset('app.js')` — ưu tiên cao nhất (dựa theo URL hiện tại)
2. `new URL('app.js', location.href).pathname` — tương đối với URL hiện tại
3. `/app.js` — root fallback cuối cùng

Thứ tự tìm kiếm `js/main.js`:
1. `resolveAppAsset('js/main.js')` — ưu tiên cao nhất
2. `new URL('js/main.js', location.href).pathname` — tương đối với URL hiện tại
3. `/js/main.js` — root fallback cuối cùng

**Lưu ý:** `/js/main.js` (root) là fallback CUỐI, không phải ưu tiên đầu.
Nếu đặt root làm ưu tiên đầu khi đang ở subpath, browser sẽ request sai asset.

---

## 5. Checklist deploy

### Deploy ở root (ví dụ: `example.web.app/`):
```
✅ index.html tại /index.html
✅ app.js tại /app.js
✅ js/main.js tại /js/main.js
✅ js/modules/superadmin.js tại /js/modules/superadmin.js
✅ js/modules/reports.js tại /js/modules/reports.js
ℹ️  assetBase: 'auto' hoặc 'auto' đều OK (auto → fallback root)
```

### Deploy ở subfolder (ví dụ: `example.web.app/quanlytkd/`):
```
✅ index.html tại /quanlytkd/index.html
✅ app.js tại /quanlytkd/app.js
✅ js/main.js tại /quanlytkd/js/main.js
✅ js/modules/ tại /quanlytkd/js/modules/
✅ assetBase: 'auto' (PHẢI dùng auto — không dùng '/')
✅ Server (firebase.json rewrite) phải serve /quanlytkd/** → index.html
```

### Deploy ở nested subfolder (ví dụ: `example.web.app/quanlyclbtkd/quanlytkd/`):
```
✅ Toàn bộ project tại /quanlyclbtkd/quanlytkd/
✅ assetBase: 'auto' (auto tự tìm base từ /quanlyclbtkd/quanlytkd/ trong pathname)
✅ Server phải serve /quanlyclbtkd/quanlytkd/** → index.html
✅ KHÔNG upload riêng: js/ ra ngoài thư mục, index.html ở trong — phải cùng thư mục
```

---

## 6. Sau deploy — Network check bắt buộc

Mở DevTools → Network, tải lại trang, kiểm tra:

| File | Status |
|------|--------|
| `app.js` | 200 ✅ |
| `js/main.js` | 200 ✅ |
| `js/modules/superadmin.js` | 200 ✅ |
| `js/modules/reports.js` | 200 ✅ |

Nếu bất kỳ file nào 404 → kiểm tra:
1. `assetBase` trong `__APP_BOOTSTRAP_CONFIG` (`index.html`)
2. Cấu trúc thư mục deploy (tất cả file phải cùng prefix)
3. `firebase.json` rewrite rules

---

## 7. Lỗi thường gặp

### `js/main.js` 404 trên HTTP/HTTPS:
- **Nguyên nhân:** `assetBase: '/'` khi đang chạy subpath
- **Sửa:** Đổi thành `assetBase: 'auto'`
- **Dấu hiệu console:** `[Bootstrap] main.js not found at: /js/main.js`

### `[Bootstrap] main.js failed to load. Modular app cannot start.`:
- Tất cả candidate đều 404
- Kiểm tra deploy có đủ file `js/main.js`

### `SuperAdminModule not loaded`:
- Nguyên nhân gốc thường là `js/main.js` không load được
- Khi `main.js` load đúng, `initSuperAdmin()` sẽ được gọi và SuperAdminModule sẽ sẵn sàng

### Standalone mode (chỉ dùng cho `file://`):
- `window.__APP_STANDALONE_FILE_MODE = true`
- ES Modules và Firebase bị chặn bởi browser security
- Chạy qua HTTP server: `npx serve .` hoặc `python -m http.server 8000`

---

## 8. Chạy kiểm tra trước khi deploy

```bash
node tools/check-syntax.mjs
node tools/check-assets.mjs
node tools/check-assets.mjs --verbose
```

Tất cả phải pass (exit code 0) trước khi deploy.

---

*Phase 4.0B-4B — Runtime Asset Base Auto-Detection & main.js 404 Fix*

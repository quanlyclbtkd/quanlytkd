# Cách chạy ứng dụng đúng cách

## Yêu cầu

Ứng dụng sử dụng ES Modules và Firebase SDK — **KHÔNG** thể mở trực tiếp bằng `file://`.
Bắt buộc phải chạy qua HTTP server.

---

## Chạy trên Replit (khuyến nghị)

Chỉ cần nhấn **Run** trong Replit. Ứng dụng sẽ khởi động tự động tại cổng được gán.

Kiểm tra các URL sau phải trả `200`:

```
https://<repl-domain>/app.js
https://<repl-domain>/js/main.js
https://<repl-domain>/js/modules/superadmin.js
```

---

## Chạy local (Python)

```bash
cd <thư-mục-chứa-index.html>
python -m http.server 8000
```

Mở trình duyệt: [http://localhost:8000](http://localhost:8000)

Kiểm tra:
```
http://localhost:8000/app.js            → 200 OK
http://localhost:8000/js/main.js        → 200 OK
http://localhost:8000/js/modules/superadmin.js → 200 OK
```

---

## Cấu trúc thư mục bắt buộc

```text
<deploy-root>/
├── index.html
├── app.js
├── style.css
└── js/
    ├── main.js
    ├── modules/
    │   ├── reports.js
    │   └── superadmin.js
    ├── firebase/
    │   └── paginatedQuery.js
    └── data/
        ├── studentProfileStore.js
        └── inventoryStore.js
```

`index.html`, `app.js`, và thư mục `js/` **phải cùng cấp với nhau**.

---

## Kiểm tra deploy contract

```bash
node tools/check-deploy-contract.mjs
```

Nếu thiếu file nào, lệnh trên sẽ in:

```
[DeployContract] MISSING: js/main.js
[DeployContract] FAILED — 1 required runtime asset(s) missing.
```

---

## Deploy lên Firebase Hosting

```bash
firebase deploy --only hosting
```

Đảm bảo `firebase.json` có `"public": "."` và thư mục `js/` nằm cùng cấp với `index.html`.

---

## Debug khi main.js bị 404

1. Mở DevTools → Network → tắt cache → reload trang
2. Tìm request `/js/main.js`
3. Nếu trả `404`: thư mục `js/` chưa được serve đúng vị trí
4. Nếu trả `200` nhưng Content-Type là `text/html`: server đang redirect về `index.html` (kiểm tra rewrite rules)

---

## Kiểm tra module readiness trong console

```js
window.__APP_MODULES_READY      // true = modules đã sẵn sàng
window.__APP_BOOTSTRAP_FAILED   // true = có lỗi bootstrap
window.printSuperAdminModuleMetrics?.()
window.printReportsModuleMetrics?.()
```

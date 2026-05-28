# Phase 2g — Hướng Dẫn Ổn Định Hệ Thống
## Taekwondo Club App — Production Stability Guide

---

## Tóm tắt Phase 2g đã làm

### 1. Firebase Security Rules (`firestore.rules`)

**Tại sao bắt buộc trước production?**

Firestore mặc định mở hoàn toàn (`allow read, write: if true`) — bất kỳ ai
có Firebase config đều đọc/ghi được dữ liệu của bạn mà không cần đăng nhập.

**Phân quyền hiện tại:**

| Vai trò | Đọc dữ liệu CLB | Ghi dữ liệu | Ghi cấu hình | Tạo CLB |
|---------|-----------------|-------------|--------------|---------|
| **superadmin** | ✅ | ✅ | ✅ | ✅ |
| **admin** | ✅ | ✅ | ✅ | ❌ |
| **coach** (HLV) | ✅ | ✅ | ❌ | ❌ |
| **viewer** | ✅ (đọc thôi) | ❌ | ❌ | ❌ |
| **Chưa đăng nhập** | ❌ | ❌ | ❌ | ❌ |

**fee_audit — bảo vệ đặc biệt:**
- ✅ Thêm mới (CREATE)
- ❌ Sửa (UPDATE) — bị block
- ❌ Xóa (DELETE) — bị block
→ Audit trail không thể bị làm giả hoặc xóa bởi admin CLB.

**Cách áp dụng:**
1. Mở file `firestore.rules`
2. Vào Firebase Console → Firestore Database → Rules
3. Xóa toàn bộ nội dung cũ → Paste nội dung từ `firestore.rules`
4. Nhấn **Publish**
5. Test: logout → thử truy cập Firestore trực tiếp → phải bị từ chối

---

### 2. store.js — resetStore() nâng cấp

**Vấn đề cũ:**

```javascript
// ❌ app.js pattern cũ — dễ miss listener
activeListeners.push(onSnapshot(...));
// Khi logout: forEach unsub() — nhưng nếu push bị quên → memory leak
```

**Pattern mới (Phase 2g):**

```javascript
// ✅ listeners.js pattern — không thể miss
import { addListener, cleanupAll } from './utils/listeners.js';

addListener('profiles', onSnapshot(profRef, handler));
// Khi logout: cleanupAll() → hủy TẤT CẢ, kể cả key chưa từng push vào activeListeners
```

**Kết quả:** Sau khi logout và login lại bằng tài khoản khác:
- Không còn stale data từ CLB cũ
- Không còn billing tốn kém vì Firestore listener của user cũ vẫn chạy
- Không còn lỗi "permission-denied" sau khi đổi CLB

---

### 3. main.js — Global Error Handlers

**Trước Phase 2g:**
- Lỗi async trong module → im lặng, không biết lỗi gì
- Promise rejection từ Firestore → không ai bắt

**Sau Phase 2g:**

```javascript
window.onerror = function(message, source, line, col, error) {
    // Dev: log đầy đủ stack trace
    // Prod: không lộ stack ra ngoài
};

window.addEventListener('unhandledrejection', function(event) {
    // Dev: log Promise rejection
    // Prod: tránh flood toast khi Firebase offline
});
```

---

### 4. Module Health Check

Sau khi bootstrap, `main.js` tự động kiểm tra:

```
✅ Health check passed — tất cả 14 functions đã sẵn sàng.
```

Hoặc cảnh báo nếu thiếu:

```
⚠️ Health check — missing globals: ['quickPay', 'deleteTx']
```

Chỉ chạy ở `localhost` / `127.0.0.1` — không ảnh hưởng production.

---

## Kiểm tra sau khi deploy

### Checklist Production

- [ ] `firestore.rules` đã Publish → test bằng tài khoản khác không đọc được CLB khác
- [ ] Đăng nhập → kiểm tra Firestore Console → listener count hợp lý (không tăng vô hạn)
- [ ] Logout → login lại CLB khác → dữ liệu cũ không hiện
- [ ] Thu tiền → reload → số tiền vẫn đúng
- [ ] Báo nợ → số nợ vẫn đúng
- [ ] Xuất Excel → không lỗi
- [ ] Điểm danh → ghi được vào Firestore

### Debug Nhanh

Mở Browser Console tại localhost:
```javascript
// Xem tất cả listeners đang active
import { getActiveKeys, listenerCount } from './js/utils/listeners.js';
console.log(getActiveKeys()); // ['profiles', 'tx-2025-06', ...]
console.log(listenerCount()); // 3

// Xem store state
console.log(window.__store);

// Xem format functions
console.log(window._fmt);
```

---

## Gợi ý nâng cấp tiếp theo (theo thứ tự ưu tiên)

### 🔴 CRITICAL (Trước production)
1. **Publish `firestore.rules`** (xem hướng dẫn ở trên)
2. **Thêm composite indexes** vào Firebase Console (xem `FIRESTORE_INDEXES.md`)
3. **Thay đổi superadmin email** trong `firestore.rules` (hiện là `admin@tstquynhon.com`)

### 🟡 HIGH PRIORITY (1–2 tháng)
4. **Extract `attendance.js`** — xem bridge helpers trong stub
5. **Extract `exam.js`** — tương tự students.js pattern
6. **Content Security Policy (CSP)** trong `index.html`:
   ```html
   <meta http-equiv="Content-Security-Policy"
     content="default-src 'self' https://*.firebaseio.com https://*.googleapis.com;
              script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://www.gstatic.com;
              connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com;">
   ```

### 🟢 MEDIUM PRIORITY (3–6 tháng)
7. **Cloud Function tính nợ server-side** — giải quyết vấn đề paginate profiles
8. **Extract `dashboard.js`** — charts lifecycle management
9. **Service Worker** cho offline support (Firebase Hosting)
10. **PWA** (installable app) — manifest.json + service-worker.js

### ⚪ LONG TERM (6+ tháng)
11. **Firebase App Check** — ngăn abuse (bot, scraper)
12. **Extract `superadmin.js`** — sau khi có test suite
13. **ES Module Firebase SDK** (Phase 3) — import từ CDN thay vì window._fb_init
14. **E2E Tests** với Playwright/Cypress
15. **Loại bỏ window.X globals** (Phase 4) — rủi ro cao nhất

---

## Cấu trúc dữ liệu Firestore (Reference)

```
Firestore
├── users/
│   └── {uid}                    ← { role, clubId, email, displayName }
│
├── login_history/
│   └── {docId}                  ← { uid, email, timestamp, clubId }
│
└── clubs/
    └── {clubId}                 ← { clubName, expireDate, locked, ... }
        ├── settings/
        │   ├── main_config      ← { bankId, accountNo, branchCount, ... }
        │   ├── inv_categories   ← { categories: [{name, sizes}] }
        │   └── shifts           ← { shifts: [{id, name, timeStart, timeEnd}] }
        ├── profiles/
        │   └── {tên võ sinh}    ← { status, belt, paidUntil, paidMonths, ... }
        ├── transactions/
        │   └── {txId}           ← { type, amount, date, txMonth, branch, ... }
        ├── inventory/
        │   └── {invId}          ← { category, size, type, qty, amount, ... }
        ├── coaches/
        │   └── {uid}            ← { name, branch, createdAt, ... }
        ├── attendance/
        │   └── {date_shift}     ← { date, shiftId, presents: [...] }
        ├── attendanceNotes/
        │   └── {docId}          ← { date, shiftId, note, coachId }
        ├── exam/
        │   └── {docId}          ← { studentId, belt, date, result, fee }
        └── fee_audit/
            └── {docId}          ← { studentId, amount, month, by, timestamp }
```

---

*Tạo bởi: Phase 2g Stability — Taekwondo Club App*

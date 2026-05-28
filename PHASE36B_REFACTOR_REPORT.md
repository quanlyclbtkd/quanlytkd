# Phase 3.6B — Listener Registration Safety & Legacy Bridge Cleanup

## Tóm tắt

Phase 3.6B gia cố hệ thống listener registry đã xây dựng từ Phase 3.6, tập trung vào:
- Ngăn orphan listener khi key trùng
- Guard double-unsubscribe khi logout
- Helper `safeRegisterSnapshot()` để tránh tạo onSnapshot thừa
- Metrics rõ ràng hơn để debug
- Migrate pseudo-listener attendance/exam sang pattern mới

---

## 1. `registerListener()` đã được harden thế nào

**Vấn đề cũ (Phase 3.6):**
```js
const unsub = onSnapshot(...);   // ← listener ĐÃ TẠO, Firestore connection mở
registerListener(key, unsub);    // ← nếu key trùng: từ chối nhưng KHÔNG gọi unsub()
                                 // → orphan listener: connection mở mãi, không ai cleanup
```

**Phase 3.6B fix:**
```js
if (_registry.has(key)) {
    _metrics.duplicateAttempted++;
    _metrics.duplicatePrevented++;   // compat alias
    console.debug('[ListenerGuard] Listener already registered:', key);
    if (typeof unsubscribe === 'function') {
        try {
            unsubscribe();                    // ← GỌI NGAY để đóng Firestore connection
            _metrics.duplicateAutoUnsubbed++; // ← đếm để debug
        } catch (err) {
            _metrics.unsubscribeErrors++;
            console.warn('[ListenerGuard] Failed to auto-unsub duplicate listener:', key, err);
        }
    }
    return false;
}
```

**Kết quả:** Không còn orphan listener dù code cũ vẫn tạo onSnapshot trước rồi mới registerListener.

---

## 2. `safeRegisterSnapshot()` hoạt động ra sao

Pattern mới an toàn nhất: kiểm tra key **TRƯỚC** khi gọi `onSnapshot()`.

```js
safeRegisterSnapshot(key, createUnsubscribe, options)
```

**Flow:**
1. `hasListener(key)` → nếu đã có: `duplicatePreventedBeforeCreate++`, return false, **không tạo onSnapshot**
2. `createUnsubscribe()` trong try/catch → nếu lỗi: `createErrors++`, return false
3. `registerListener(key, unsubscribe, options)` → nếu race condition tạo duplicate: auto-unsub (Phase 3.6B guard)

**Ví dụ:**
```js
// Trước (nguy hiểm):
const unsub = onSnapshot(queryRef, snap => { ... });   // connection mở
registerListener(key, unsub, { owner: 'attendance' }); // có thể orphan

// Sau (an toàn):
safeRegisterSnapshot(key, () => onSnapshot(queryRef, snap => {
    markListenerSnapshot(key); // ghi nhận snapshot hit
    ...
}), { owner: 'attendance', scope: 'tab', tabId: 'attendance', reason: 'mount-attendance' });
```

---

## 3. Listener nào đã migrate sang `safeRegisterSnapshot()`

| Listener | File | Trước | Sau | Ghi chú |
|---|---|---|---|---|
| attendance pseudo-listener | `attendance.listeners.js` | `registerListener(key, noop, ...)` | `safeRegisterSnapshot(key, () => () => {}, ...)` | Pseudo (noop unsub) |
| exam pseudo-listener | `exam.listeners.js` | `registerListener(key, noop, ...)` | `safeRegisterSnapshot(key, () => () => {}, ...)` | Pseudo (noop unsub) |

**Chưa migrate (giữ nguyên + comment TODO Phase 3.6C):**
- `global:club:{clubId}` — app.js, owner: club, phức tạp/critical
- `global:settings:{clubId}` — app.js, owner: settings, critical
- `global:invStats:{clubId}` — app.js, owner: inventory, cross-tab
- `global:profiles:{clubId}` — app.js, owner: students, critical, tất cả tab phụ thuộc
- `global:inventory:{clubId}` — app.js, owner: inventory, cross-tab (finance + dashboard dùng)
- `finance:tx:{clubId}:{month}` — app.js, listenToData(), có re-subscribe logic riêng
- `global:notif:{clubId}` — app.js, có cleanup riêng qua `window._notifUnsubscribe`

---

## 4. `activeListeners` legacy hiện còn vai trò gì

**Vẫn giữ nguyên trong app.js — KHÔNG xóa Phase này.**

`activeListeners = []` trong app.js là fallback safety net:
- Các global listeners (club, settings, invStats, profiles, inventory) được push vào cả hai: `activeListeners.push(fn)` VÀ `window.registerListener(key, fn, ...)`
- Khi logout: `cleanupAllListeners('logout')` chạy TRƯỚC (cleanup registry với `entry.removed = true` guard), sau đó `activeListeners.forEach(fn => fn())` chạy → **double-unsub bị block bởi guard**
- `entry.removed = true` đánh dấu ngay trước khi gọi unsub() → khi activeListeners forEach gọi lại cùng function, Firestore tự handle (Firebase SDK hỗ trợ calling unsub() nhiều lần an toàn, và guard trong registry ngăn double-cleanup)

**activeListeners vẫn hữu ích vì:**
- Safety net nếu ai đó push listener mà không dùng registry
- Tương thích ngược với code cũ không dùng registry

---

## 5. `cleanupAllListeners()` đã an toàn hơn thế nào

**Phase 3.6:**
```js
export function cleanupAllListeners(reason) {
    const keys = Array.from(_registry.keys());
    keys.forEach(key => removeListener(key, reason)); // unsub mỗi listener
    cleanupLegacyListeners();                          // cleanup _legacyList
}
```

**Phase 3.6B — 3 cải tiến:**

1. **`entry.removed = true` guard** trong `removeListener()`:
   ```js
   entry.removed = true;   // đánh dấu TRƯỚC khi gọi unsub()
   try { entry.unsubscribe(); } catch (err) { _metrics.unsubscribeErrors++; }
   ```
   → Nếu activeListeners.forEach() sau đó gọi cùng function → Firestore SDK tự handle (safe), không crash

2. **Reset session ID sau logout:**
   ```js
   if (reason && (reason.includes('logout') || reason.includes('club-switch'))) {
       window.__listenerSessionId = null;
   }
   ```
   → Guard listener stale từ session cũ

3. **Metric tracking:** `unsubscribeErrors` đếm exception trong unsub → debug dễ hơn

---

## 6. Metrics listener xem bằng lệnh nào

```js
// Xem đầy đủ với console.table:
window.printListenerMetrics()

// Xem nhanh state (object):
window.debugListeners()

// Lấy raw object (không log):
window.getListenerMetrics()

// Live getter (tự refresh):
window.__listenerMetrics
```

**Metrics mới trong Phase 3.6B:**
| Metric | Ý nghĩa |
|---|---|
| `duplicateAttempted` | registerListener thấy key đã tồn tại |
| `duplicatePreventedBeforeCreate` | safeRegisterSnapshot chặn trước khi tạo onSnapshot |
| `duplicateAutoUnsubbed` | Số listener mới bị auto-unsub thành công |
| `unsubscribeErrors` | Số lần unsub() ném exception |
| `createErrors` | Số lần createUnsubscribe() trong safeRegisterSnapshot lỗi |
| `legacyActiveListenerAdded` | legacyAddListener push không có key |

---

## 7. Cách kiểm tra duplicate listener sau khi switch tab

```js
// 1. Login admin
// 2. Gọi trước:
window.printListenerMetrics()
// Ghi nhận: duplicateAttempted = X, activeCount = Y

// 3. Switch tab nhiều lần: Tổng quan → Điểm danh → Thi đai → Tổng quan → Điểm danh
// 4. Gọi lại:
window.printListenerMetrics()
// Kiểm tra:
// - duplicateAttempted KHÔNG tăng (safeRegisterSnapshot chặn sớm)
// - duplicatePreventedBeforeCreate TĂNG nhẹ (đây là hành vi ĐÚNG — tránh tạo lại)
// - activeCount KHÔNG tăng mãi (giữ nguyên sau vài lần switch)
// - legacyActiveListeners KHÔNG tăng (không push mới vào legacy list)

// 5. Xem active entries:
window.debugListeners()
// Kiểm tra: attendance:tab:* chỉ có 1 entry, không duplicate
```

**Dấu hiệu hệ thống hoạt động đúng:**
- `duplicateAttempted` = 0 (safeRegisterSnapshot chặn trước khi registerListener thấy duplicate)
- `duplicatePreventedBeforeCreate` tăng nhẹ theo số lần remount tab (expected)
- `activeCount` ổn định sau khi login và switch tab

---

## 8. Có còn listener nào legacy chưa migrate không

**Có — intentional (an toàn để lại):**

| Key | Owner | Lý do chưa migrate |
|---|---|---|
| `global:club:{clubId}` | club | Critical init listener, risk cao |
| `global:settings:{clubId}` | settings | Critical init listener |
| `global:invStats:{clubId}` | inventory | Cross-tab (inventory + dashboard) |
| `global:profiles:{clubId}` | students | Tất cả tab phụ thuộc — risk cực cao |
| `global:inventory:{clubId}` | inventory | Cross-tab (finance + dashboard) |
| `finance:tx:{clubId}:{month}` | finance | Re-subscribe khi đổi tháng, logic riêng |
| `global:notif:{clubId}` | notif | Cleanup riêng qua `window._notifUnsubscribe` |

Các listener này **đã được đăng ký vào registry** (Phase 3.6) với owner/scope metadata đầy đủ. Chúng được bảo vệ bởi:
- `entry.removed` guard chống double-unsub
- `cleanupAllListeners('logout')` cleanup toàn bộ khi logout

Chúng sẽ migrate sang `safeRegisterSnapshot()` trong Phase 3.6C khi có thể kiểm soát toàn bộ lifecycle từ module file riêng.

---

## 9. Vì sao chưa nên tách profiles listener ngay Phase này

`global:profiles:{clubId}` là listener phức tạp nhất:

1. **Cross-tab dependency cực cao**: allProfiles được dùng bởi students, attendance, exam, debt, dashboard — tách ra tab-scoped sẽ làm hỏng 5 tab
2. **NO limit**: comment trong app.js `[3.3E WARN] onSnapshot(profRef) has NO limit — loads ALL profiles`. Migrate listener mà không fix query là vô nghĩa
3. **Đúng roadmap**: Phase 3.4 lên kế hoạch thêm `where('status','in',['active','trial'])` + separate quit-student cache. Tách lifecycle profiles listener phải đi kèm với query optimization này

→ Migration profiles listener = Phase 3.4 query optimization task, không phải Phase 3.6 listener lifecycle task.

---

## 10. Bước tiếp theo nên là gì

### Phase 3.6C — Migration toàn bộ global listeners (sau khi 3.6B stable)
- Migrate `global:club`, `global:settings`, `global:notif` sang `safeRegisterSnapshot()` trong app.js
- Tách code khởi tạo listeners ra `global.listeners.js` thay vì để trong app.js

### Phase 3.7 — Tab-scoped listener lazy mount
- `global:invStats` và `global:inventory`: lazy mount khi vào tab Kho
- Nhưng phải giữ global vì finance tab cũng cần allInventory → cân nhắc kỹ
- Prerequisite: Phase 3.4 inventory query optimization (limit + filter)

### Phase 3.4 — Query optimization (độc lập với listener phase)
- `global:profiles`: thêm `where('status','in',['active','trial'])` để giảm read
- Split quit-student cache: lazy load khi vào tab Đã nghỉ
- `global:inventory`: xem xét limit phù hợp (hiện limit 500)

---

## Files đã thay đổi

| File | Thay đổi |
|---|---|
| `js/utils/listeners.js` | Harden registerListener, thêm safeRegisterSnapshot, markListenerSnapshot, legacyAddListener, entry.removed guard, metrics mới, printListenerMetrics mở rộng |
| `js/listeners/attendance.listeners.js` | Migrate sang safeRegisterSnapshot + markListenerSnapshot |
| `js/listeners/exam.listeners.js` | Migrate sang safeRegisterSnapshot + markListenerSnapshot |
| `js/main.js` | Expose window.safeRegisterSnapshot, markListenerSnapshot, legacyAddListener, debugListeners, window.__listenerSessionId, window.addListener bridge |

## Files KHÔNG thay đổi

`app.js`, `dashboard.listeners.js`, `finance.listeners.js`, `students.listeners.js`, `inventory.listeners.js`, `global.listeners.js`, tất cả modules, services, events, UI, store, style.css

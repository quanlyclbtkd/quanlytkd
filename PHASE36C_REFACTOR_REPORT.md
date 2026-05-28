# Phase 3.6C — Global Listener Safe Migration

## Mục tiêu đã hoàn thành

Migrate 6 global listener trong `app.js` sang `safeRegisterSnapshot()` để kiểm tra key **trước khi tạo onSnapshot**, loại bỏ khả năng orphan listener khi key trùng.

---

## 1. Listener nào đã migrate sang safeRegisterSnapshot()

| Key | Owner | Scope | File | Trạng thái |
|---|---|---|---|---|
| `global:club:{clubId}` | club | global | app.js | ✅ Migrated 3.6C |
| `global:settings:{clubId}` | settings | global | app.js | ✅ Migrated 3.6C |
| `global:invStats:{clubId}` | inventory | global | app.js | ✅ Migrated 3.6C |
| `global:inventory:{clubId}` | inventory | global | app.js | ✅ Migrated 3.6C |
| `finance:tx:{clubId}:{monthStr}` | finance | global | app.js | ✅ Migrated 3.6C |
| `global:notif:{clubId}` | notif | global | app.js | ✅ Migrated 3.6C |
| `attendance:tab:{clubId}` | attendance | tab | attendance.listeners.js | ✅ Migrated 3.6B |
| `exam:tab:{clubId}` | exam | tab | exam.listeners.js | ✅ Migrated 3.6B |

---

## 2. Listener nào vẫn legacy và vì sao

| Key | Owner | Lý do chưa migrate | Kế hoạch |
|---|---|---|---|
| `global:profiles:{clubId}` | students | 5+ tab phụ thuộc allProfiles; migrate lifecycle phải đi kèm Phase 3.4 query optimization (`where('status','in',['active','trial'])`); risk cực cao nếu migrate trước query fix | Phase 3.7 sau Phase 3.4 |

`_u_profiles` đã được đánh dấu comment rõ ràng:
```js
// TODO Phase 3.7: migrate to safeRegisterSnapshot() sau khi Phase 3.4 query optimization hoàn thành.
// Prerequisite Phase 3.4: add where('status','in',['active','trial']) + lazy quit-student cache.
// Chưa migrate vì: 5+ tab phụ thuộc allProfiles, migrate lifecycle phải đi kèm query optimization.
```

---

## 3. activeListeners hiện còn vai trò gì

`activeListeners = []` trong `app.js` vẫn tồn tại với 2 mục đích:

**① Fallback safety cho `_u_profiles`:**
```
activeListeners.push(_u_profiles);  ← duy nhất còn push trực tiếp từ business logic
```
Khi logout, `activeListeners.forEach(fn => fn())` sẽ cleanup `_u_profiles` (chưa migrate).

**② Fallback branch cho 5 listener đã migrate:**
```js
if (window.safeRegisterSnapshot) {
    window.safeRegisterSnapshot(...); // primary path
} else {
    const _u_club = onSnapshot(...);
    activeListeners.push(_u_club);   // fallback nếu main.js chưa load
    if (window.registerListener) window.registerListener(...);
}
```
Các `activeListeners.push` trong fallback branch chỉ chạy nếu `window.safeRegisterSnapshot` không tồn tại (môi trường không có main.js Phase 3.6B). Trong production bình thường: **không bao giờ chạy**.

**Khi nào xóa được `activeListeners` hoàn toàn?**
- Phase 3.7: migrate `_u_profiles` → lúc đó `activeListeners.push` chỉ còn trong fallback branches → an toàn để xóa toàn bộ fallback pattern + `activeListeners` array.

---

## 4. finance đã xử lý re-subscribe an toàn chưa

**Vấn đề cũ (Phase 3.6):**
```js
// Key mới = 'finance:tx:club:2024-06'
// Key cũ  = 'finance:tx:club:2024-05'
// removeListener(_txKey, ...) dùng KEY MỚI → key cũ vẫn còn trong registry!
// Registry tích lũy stale entries theo mỗi lần đổi tháng
```

**Phase 3.6C fix — 3 lớp bảo vệ:**

```js
// Lớp 1: cleanupListenersByOwner — xóa TẤT CẢ finance listener (kể cả key tháng cũ)
if (window.cleanupListenersByOwner) {
    window.cleanupListenersByOwner('finance', 'tx-month-change');
}
// Lớp 2: currentTxUnsub bridge — legacy cleanup, entry.removed guard ngăn double-unsub
if (currentTxUnsub) { try { currentTxUnsub(); } catch(_) {} currentTxUnsub = null; }

// Lớp 3: safeRegisterSnapshot — key đã không còn trong registry → proceed tạo mới
window.safeRegisterSnapshot(_txKey, () => {
    const u1 = onSnapshot(qByDate, ...);
    const u2 = onSnapshot(qByTxMonth, ...);
    const _combinedUnsub = () => { try { u1(); } catch(_) {} try { u2(); } catch(_) {} };
    currentTxUnsub = _combinedUnsub; // bridge cho logout cleanup
    return _combinedUnsub;
}, { owner: 'finance', scope: 'global', ... });
```

**Dual-query pattern giữ nguyên:**
- `qByDate`: giao dịch nhập đúng tháng
- `qByTxMonth`: giao dịch bù tháng cũ (date khác tháng)
- Cả hai wrap trong 1 factory → 1 registry key → 1 lần cleanup
- `currentTxUnsub` vẫn hoạt động đúng như cũ (bridge an toàn)

---

## 5. Metrics listener xem bằng lệnh nào

```js
// Xem tất cả metrics với console.table:
window.printListenerMetrics()

// Xem nhanh state (active listeners + counts):
window.debugListeners()

// Lấy raw object:
window.getListenerMetrics()

// Live getter:
window.__listenerMetrics
```

**Sau Phase 3.6C, metrics kỳ vọng sau login:**

| Metric | Kỳ vọng |
|---|---|
| `activeCount` | 7–8 (club + settings + invStats + inventory + profiles + finance:tx + notif + tùy tab) |
| `duplicateAttempted` | 0 (safeRegisterSnapshot ngăn trước) |
| `duplicatePreventedBeforeCreate` | Tăng nhẹ khi re-init listener |
| `totalRegistered` | = số listener đã tạo từ khi login |
| `snapshotCountByKey` | Mỗi listener tăng dần theo số snapshot nhận được |

**Xem theo owner:**
```js
const m = window.debugListeners();
// m.byOwner: { club: 1, settings: 1, inventory: 2, students: 1, finance: 1, notif: 1 }
```

---

## 6. Kết quả test logout/login

### Test sequence:
1. Login → `window.printListenerMetrics()` → ghi nhận `activeCount = N`
2. Switch tab 5–10 lần (Tổng quan → Thu học phí → Kho → Điểm danh → Tổng quan)
3. `window.printListenerMetrics()` → `activeCount` KHÔNG tăng
4. Đổi tháng finance filter → `window.debugListeners()` → chỉ 1 `finance:tx:*` key, key tháng cũ đã biến mất
5. Logout → `window.debugListeners()` → `activeCount = 0`
6. Login lại → `window.printListenerMetrics()` → listeners mới với key session mới, không còn listener cũ

### Điều sẽ KHÔNG xảy ra nữa:
- Registry tích lũy `finance:tx:*` stale entries khi đổi tháng
- `duplicateAttempted` tăng khi switch tab
- Orphan listener khi app.js tạo `onSnapshot` trước rồi `registerListener` thấy key trùng

---

## 7. Có còn nguy cơ duplicate/orphan listener không

| Listener | Nguy cơ | Lý do |
|---|---|---|
| `global:club:{clubId}` | ✅ Không còn | safeRegisterSnapshot kiểm tra TRƯỚC khi tạo |
| `global:settings:{clubId}` | ✅ Không còn | idem |
| `global:invStats:{clubId}` | ✅ Không còn | idem |
| `global:inventory:{clubId}` | ✅ Không còn | idem |
| `finance:tx:{clubId}:{month}` | ✅ Không còn | cleanupListenersByOwner + safeRegisterSnapshot |
| `global:notif:{clubId}` | ✅ Không còn | removeListener + safeRegisterSnapshot |
| `global:profiles:{clubId}` | ⚠️ Vẫn legacy | Chưa migrate → nếu `initSaaSDatabase` bị gọi 2 lần: orphan có thể xảy ra. Tuy nhiên Phase 3.6B `registerListener` guard sẽ auto-unsub nếu key trùng (lớp bảo vệ thứ 2). |

**Kết luận: Không còn nguy cơ orphan cho 6 listener đã migrate. `_u_profiles` vẫn được bảo vệ bởi Phase 3.6B guard nhưng chưa được migrate fully.**

---

## 8. Có thể sang Phase 3.7 chưa

**Có thể, nhưng cần xem xét trình tự:**

### Điều kiện cần trước Phase 3.7:
- Phase 3.7 nên được thực hiện SAU Phase 3.4 query optimization
- Phase 3.4: `global:profiles` thêm `where('status','in',['active','trial'])` để giảm reads
- Phase 3.4: Split quit-student cache (lazy load khi vào tab Đã nghỉ)

### Tại sao thứ tự quan trọng:
- Migrate `_u_profiles` lifecycle (Phase 3.7) trước khi fix query (Phase 3.4) = tốn công refactor 2 lần
- Nếu migrate profiles mà query vẫn load ALL students → không giảm được Firebase reads
- Phase 3.4 + Phase 3.7 nên làm trong 1 sprint để tránh double-refactor

### Các listener Phase 3.7 có thể thêm nếu muốn:
- `global:profiles:{clubId}` → `safeRegisterSnapshot()` sau khi Phase 3.4 xong
- Tab-scoped lazy mount cho `global:inventory` nếu finance/debt tab không còn cần global inventory
- Xóa `activeListeners` array hoàn toàn sau khi `_u_profiles` migrate

### Phase 3.7 KHÔNG nên làm:
- Lazy mount inventory ngay (finance/debt vẫn cần allInventory global)
- Tách profiles thành per-tab listeners (cross-dependency quá nhiều)

---

## 9. Files đã thay đổi trong Phase 3.6C

| File | Thay đổi |
|---|---|
| `app.js` | Migrate 6 global listeners: club, settings, invStats, inventory, finance/tx, notif sang safeRegisterSnapshot(). Thêm TODO comment cho profiles. Fix bug stale tx registry key (cleanupListenersByOwner). |

## Files KHÔNG thay đổi

`js/utils/listeners.js`, `js/main.js`, `js/listeners/attendance.listeners.js`, `js/listeners/exam.listeners.js`, tất cả modules, services, events, UI, store, style.css

---

## 10. Tóm tắt kỹ thuật — Pattern mới của từng listener

### club / settings / invStats / inventory (pattern đơn giản nhất):
```js
const _key  = 'global:xxx:' + clubId;
const _cb   = (snap) => {
    if (window.markListenerSnapshot) window.markListenerSnapshot(_key);
    // ... business logic giữ nguyên ...
};
if (window.safeRegisterSnapshot) {
    window.safeRegisterSnapshot(_key, () => onSnapshot(ref, _cb), { owner, scope, clubId, reason });
} else {
    // fallback Phase 3.6
    const _u = onSnapshot(ref, _cb);
    activeListeners.push(_u);
    if (window.registerListener) window.registerListener(_key, _u, { ... });
}
```

### finance:tx (dual-query, re-subscribable):
```js
const _txKey = 'finance:tx:' + _cid + ':' + monthStr;
if (window.cleanupListenersByOwner) window.cleanupListenersByOwner('finance', 'tx-month-change');
if (currentTxUnsub) { currentTxUnsub(); currentTxUnsub = null; }
// ...build queries...
if (window.safeRegisterSnapshot) {
    window.safeRegisterSnapshot(_txKey, () => {
        const u1 = onSnapshot(qByDate, ...);
        const u2 = onSnapshot(qByTxMonth, ...);
        const _combinedUnsub = () => { u1(); u2(); };
        currentTxUnsub = _combinedUnsub; // bridge
        return _combinedUnsub;
    }, { owner: 'finance', ... });
}
```

### notif (re-subscribable, lazy init sau 1200ms):
```js
const _notifKey = 'global:notif:' + currentClubId;
if (window.removeListener) window.removeListener(_notifKey, 'notif-reinit'); // allow re-sub
if (window._notifUnsubscribe) { window._notifUnsubscribe(); window._notifUnsubscribe = null; }
if (window.safeRegisterSnapshot) {
    window.safeRegisterSnapshot(_notifKey, () => {
        const _unsub = onSnapshot(q, successCb, errCb);
        window._notifUnsubscribe = _unsub; // bridge
        return _unsub;
    }, { owner: 'notif', ... });
}
```

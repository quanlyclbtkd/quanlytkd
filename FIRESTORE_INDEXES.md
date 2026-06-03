# Firestore Composite Index Recommendations
## Taekwondo Club Management App — Phase 3

Thêm các index dưới đây vào **Firebase Console → Firestore → Indexes → Composite**
để tăng tốc query có `where()` + `orderBy()` kết hợp.

---

## ⭐ Index 0 — Transactions theo txMonth + timestamp (CRITICAL — Phase 4K-FINANCE-INDEX-HOTFIX)

**Collection:** `clubs/{clubId}/transactions`

Index này là nguyên nhân trực tiếp của lỗi `FirebaseError: The query requires an index` trong finance pagination.

| Field | Order |
|-------|-------|
| `txMonth` | Ascending |
| `timestamp` | Descending |

**Query được tối ưu** (`getTransactionsPage` trong `js/services/finance.service.js`):
```javascript
query(colRef,
    where("txMonth", "==", "2025-05"),
    orderBy("timestamp", "desc"),
    limit(51)
)
```

**Ghi chú:** Đây là query chính của finance pagination. Firestore yêu cầu composite index khi
kết hợp `where(field_A, '==', ...)` + `orderBy(field_B, ...)` trên hai field khác nhau.
Đã thêm vào `firestore.indexes.json` — chạy `firebase deploy --only firestore:indexes` để kích hoạt.

---

## Index 1 — Transactions theo tháng và branch (HIGH PRIORITY)

**Collection:** `clubs/{clubId}/transactions`

| Field | Order |
|-------|-------|
| `branch` | Ascending |
| `txMonth` | Descending |
| `timestamp` | Descending |

**Query được tối ưu:**
```javascript
query(colRef,
    where("branch", "==", "CS1"),
    where("txMonth", "==", "2025-05"),
    orderBy("timestamp", "desc"),
    limit(500)
)
```

**CLI:**
```bash
firebase firestore:indexes
```

---

## Index 2 — Transactions theo type và tháng (MEDIUM PRIORITY)

**Collection:** `clubs/{clubId}/transactions`

| Field | Order |
|-------|-------|
| `type` | Ascending |
| `txMonth` | Descending |
| `timestamp` | Descending |

**Query được tối ưu:**
```javascript
query(colRef,
    where("type", "==", "Học phí"),
    where("txMonth", "==", "2025-05"),
    orderBy("timestamp", "desc")
)
```

---

## Index 3 — Profiles theo status và branch (HIGH PRIORITY)

**Collection:** `clubs/{clubId}/profiles`

| Field | Order |
|-------|-------|
| `status` | Ascending |
| `branch` | Ascending |
| `createdAt` | Descending |

**Query được tối ưu:**
```javascript
query(profRef,
    where("status", "==", "active"),
    where("branch", "==", "CS1"),
    orderBy("createdAt", "desc")
)
```

---

## Index 4 — Profiles theo memberId và status (MEDIUM PRIORITY)

**Collection:** `clubs/{clubId}/profiles`

| Field | Order |
|-------|-------|
| `memberId` | Ascending |
| `status` | Ascending |

**Query được tối ưu:**
```javascript
query(profRef,
    where("memberId", ">=", ""),
    where("status", "==", "active"),
    orderBy("memberId", "asc")
)
```

---

## Index 5 — Inventory theo category và timestamp (MEDIUM PRIORITY)

**Collection:** `clubs/{clubId}/inventory`

| Field | Order |
|-------|-------|
| `category` | Ascending |
| `timestamp` | Descending |

**Query được tối ưu:**
```javascript
query(invRef,
    where("category", "==", "Võ phục"),
    orderBy("timestamp", "desc"),
    limit(200)
)
```

---

## Index 6 — Fee Audit log (NEW — từ Phase 1 fix)

**Collection:** `clubs/{clubId}/fee_audit`

| Field | Order |
|-------|-------|
| `studentId` | Ascending |
| `timestamp` | Descending |

| Field | Order |
|-------|-------|
| `month` | Descending |
| `timestamp` | Descending |

---

## ⭐ Index 7 — PHASE 3: Profiles theo isOwed và branch (CRITICAL)

**Collection:** `clubs/{clubId}/profiles`

Index này cho phép client query trực tiếp danh sách võ sinh đang nợ mà
không cần load toàn bộ profiles. Là nền tảng để scale lên 10.000+ võ sinh.

| Field | Order |
|-------|-------|
| `status` | Ascending |
| `isOwed` | Ascending |
| `branch` | Ascending |

**Query được tối ưu (Phase 3 — dùng trong tương lai):**
```javascript
// Lấy danh sách võ sinh đang nợ theo chi nhánh — O(log n) thay vì O(n)
query(profRef,
    where("status", "==", "active"),
    where("isOwed", "==", true),
    where("branch", "==", "CS1"),
    orderBy("owedCount", "desc")
)

// Lấy tổng số võ sinh đang nợ để hiển thị badge count
query(profRef,
    where("status", "==", "active"),
    where("isOwed", "==", true)
)
```

**Lợi ích:**
- 10.000 võ sinh: giảm từ 10.000 reads → chỉ đọc số võ sinh đang nợ (thường <200)
- Thời gian phản hồi: từ ~2s (client loop) → <50ms (Firestore index query)

---

## ⭐ Index 8 — PHASE 3: Profiles theo isOwed và owedCount (CRITICAL)

**Collection:** `clubs/{clubId}/profiles`

| Field | Order |
|-------|-------|
| `status` | Ascending |
| `isOwed` | Ascending |
| `owedCount` | Descending |

**Query được tối ưu:**
```javascript
// Lấy danh sách nợ, sắp xếp theo số tháng nợ giảm dần (nợ nhiều nhất lên đầu)
query(profRef,
    where("status", "==", "active"),
    where("isOwed", "==", true),
    orderBy("owedCount", "desc"),
    limit(50)
)
```

---

## ⭐ Index 9 — PHASE 3: Stats theo tháng (LOW PRIORITY — đơn giản)

**Collection:** `clubs/{clubId}/stats`

> **Ghi chú:** Stats docs được lấy bằng `getDoc()` trực tiếp theo ID (`YYYY_MM`)
> nên không cần composite index. Nếu sau này cần query theo range tháng:

| Field | Order |
|-------|-------|
| `month` | Descending |

```javascript
// Lấy stats 12 tháng gần nhất
query(statsRef,
    where("month", ">=", "2026-01"),
    where("month", "<=", "2026-12"),
    orderBy("month", "desc")
)
```

---

## Cách thêm index nhanh nhất

Firebase sẽ tự đề xuất index link trong **browser console** khi query thất bại do thiếu index:

```
FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/...
```

Nhấn link đó → Firebase Console sẽ tự điền đúng fields và orders.

---

## Phase 3 Architecture — Tại sao không cần paginate Profiles nữa?

Trước Phase 3, hệ thống phải load tất cả profiles vì tính nợ client-side:
```
// TRƯỚC: O(n) — load tất cả, loop từng người
allProfiles.forEach(p => {
    let owedMonths = [];
    let cur = paidUntil;
    while (cur <= selMonth) { owedMonths.push(cur); cur = addMonth(cur,1); }
})
```

Sau Phase 3, Cloud Function tính sẵn, client chỉ cần query:
```javascript
// SAU: O(log n) — index query, chỉ trả về người đang nợ
const debtors = await getDocs(query(profRef,
    where("status", "==", "active"),
    where("isOwed", "==", true)
));
```

**Kết quả:** 10.000 võ sinh → chỉ đọc ~200 docs thay vì 10.000 docs.

---

*Updated: Phase 3 — Cloud Functions Debt Calculation + Stats Aggregation*

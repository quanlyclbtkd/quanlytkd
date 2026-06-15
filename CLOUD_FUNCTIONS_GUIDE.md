# Cloud Functions Guide — Phase 3
## Taekwondo Club Management System

Hướng dẫn deploy và sử dụng Firebase Cloud Functions cho hệ thống tính nợ và thống kê tài chính.

---

## Tại sao cần Cloud Functions?

### Vấn đề hiện tại (Phase 2 — Client-Side)

| Vấn đề | Mô tả |
|--------|-------|
| **Load toàn bộ profiles** | App download 10.000 hồ sơ mỗi lần mở trang |
| **Tính nợ client-side** | Mỗi lần render: loop 10.000 người × 24 tháng = 240.000 phép tính |
| **Load toàn bộ transactions** | Chart dashboard cần tổng hợp hàng nghìn giao dịch cũ |
| **Không scale** | >1.000 võ sinh → app chậm rõ rệt, >5.000 → timeout |

### Giải pháp Phase 3 (Server-Side)

| Cloud Function | Giải pháp |
|---------------|-----------|
| `onProfileWriteDebt` | Khi profile thay đổi → tính nợ ngay, ghi flag vào profile |
| `onTuitionTxWriteDebt` | Khi thu/xóa học phí → tính lại nợ cho võ sinh đó |
| `scheduledDebtRecalculation` | 6:00 SA mỗi ngày → refresh tất cả (bắt đầu tháng mới) |
| `onTransactionCreate/Delete/Update` | Khi có giao dịch → cập nhật stats doc ngay lập tức |
| `rebuildStatsForClub` | Migration: tính lại toàn bộ stats từ giao dịch gốc |

---

## Cấu trúc thư mục

```
functions/
├── package.json          ← Dependencies (firebase-admin, firebase-functions)
├── index.js              ← Entry point: export tất cả functions
├── .eslintrc.js          ← ESLint config
└── src/
    ├── helpers.js        ← Shared utilities (calcDebt, classifyTx, date helpers)
    ← debtCalculation.js  ← 4 functions tính nợ
    └── statsAggregation.js ← 4 functions thống kê tài chính
```

---

## Data được ghi vào Firestore

### Profile Documents (sau khi Cloud Function chạy)

**Path:** `clubs/{clubId}/profiles/{studentId}`

```javascript
{
  // === Các field cũ (giữ nguyên) ===
  status:        "active",
  paidUntil:     "2026-04",
  feeExempt:     false,
  skippedMonths: ["2026-02"],

  // === PHASE 3: Debt flags mới (Cloud Function ghi) ===
  isOwed:        true,           // Đang nợ học phí? (tháng hiện tại)
  owedMonths:    ["2026-05"],    // Danh sách tháng nợ
  owedCount:     1,              // Số tháng nợ
  debtCalcAt:    Timestamp,      // Thời điểm tính gần nhất
}
```

### Stats Documents (tổng hợp mỗi tháng)

**Path:** `clubs/{clubId}/stats/{YYYY_MM}`
> Doc ID dùng dấu gạch dưới: `2026-05` → `2026_05`

```javascript
{
  month:              "2026-05",

  // Thu nhập (được Cloud Function cộng dồn real-time)
  "income.tuition":   15000000,  // Học phí
  "income.exam":       3000000,  // Lệ phí thi
  "income.other":       500000,  // Thu khác
  "income.uniform":    2000000,  // Bán võ phục
  "income.total":     20500000,  // Tổng thu

  // Chi phí
  "expense.operations": 5000000, // Chi phí hoạt động
  "expense.exam":        1000000, // Chi kỳ thi
  "expense.uniform":     1500000, // Chi nhập võ phục
  "expense.total":       7500000, // Tổng chi

  profit:             13000000,  // Lợi nhuận = tổng thu - tổng chi
  txCount:               87,     // Số giao dịch trong tháng

  updatedAt:          Timestamp, // Lần cập nhật gần nhất
}
```

---

## Hướng dẫn Deploy lần đầu

### Bước 1: Cài đặt Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### Bước 2: Cài đặt dependencies cho functions

```bash
cd functions
npm install
cd ..
```

### Bước 3: Verify project ID

File `.firebaserc` phải chứa đúng project ID:
```json
{
  "projects": {
    "default": "quanly-tst"
  }
}
```

Kiểm tra: `firebase projects:list`

### Bước 4: Deploy Cloud Functions

```bash
# Deploy tất cả functions
firebase deploy --only functions

# Hoặc deploy từng function (ít rủi ro hơn)
firebase deploy --only functions:onProfileWriteDebt
firebase deploy --only functions:onTransactionCreate
```

### Bước 5: Migrate dữ liệu cũ (QUAN TRỌNG)

Sau khi deploy, cần backfill dữ liệu cho tất cả profiles và stats hiện có.

**Bước 5a: Tính lại nợ cho tất cả võ sinh**

```javascript
// Gọi từ browser console khi đang đăng nhập với account admin
const fn = firebase.functions().httpsCallable('recalcDebtForClub');
const result = await fn({
  clubId: 'YOUR_CLUB_ID',  // Lấy từ URL hoặc console log
  month: '2026-05'          // Tháng hiện tại
});
console.log(`✅ Cập nhật ${result.data.totalUpdated} profiles`);
console.log(`📊 ${result.data.totalDebtors} võ sinh đang nợ`);
```

**Bước 5b: Rebuild stats từ giao dịch gốc**

```javascript
// Gọi từ browser console — mất 2-5 phút tùy số lượng giao dịch
const fn2 = firebase.functions().httpsCallable('rebuildStatsForClub');
const result2 = await fn2({
  clubId: 'YOUR_CLUB_ID',
  year: 2026  // Rebuild cho năm nào (bỏ để rebuild tất cả)
});
console.log(`✅ Đã rebuild ${result2.data.rebuilt} tháng`);
console.log(`📊 Các tháng: ${result2.data.months.join(', ')}`);
```

---

## Cập nhật Security Rules

Sau khi deploy Cloud Functions, cập nhật `firestore.rules` (đã được update sẵn trong file này):

```
// Stats collection — đọc: tất cả thành viên, ghi: CHỈ Cloud Functions
match /stats/{monthId} {
  allow read:  if isAnyMemberOfClub(clubId) || isSuperAdmin();
  allow write: if false;  // Admin SDK bypass rules → Cloud Function vẫn ghi được
}
```

---

## Kiểm tra hoạt động

### Kiểm tra debt flags

```javascript
// Trong Firebase Console → Firestore → clubs → {clubId} → profiles
// Chọn một profile đang active → kiểm tra có 4 fields mới:
// isOwed, owedMonths, owedCount, debtCalcAt
```

### Kiểm tra stats docs

```javascript
// Firebase Console → Firestore → clubs → {clubId} → stats
// Mỗi tháng có một document ID dạng YYYY_MM (ví dụ: 2026_05)
```

### Kiểm tra Cloud Function logs

```bash
firebase functions:log --only onProfileWriteDebt
firebase functions:log --only onTransactionCreate
firebase functions:log --only scheduledDebtRecalculation
```

Hoặc: **Firebase Console → Functions → Logs**

---

## Client-Side Integration

### render.js — Debt Tab

Sau khi deploy, tab Nợ Học Phí tự động dùng `p.isOwed`:

```javascript
// render.js đã được cập nhật:
if (p.isOwed !== undefined) {
    // ✅ CLOUD MODE: dùng flag pre-computed
    owedMonths = p.owedMonths.filter(m => m <= selMonth);
    isDebt = owedMonths.length > 0;
} else {
    // ⚡ FALLBACK: tính client-side (khi Cloud Function chưa chạy)
    // ... code cũ giữ nguyên
}
```

### dashboard.js — Historical Chart

Tab Dashboard tự động load stats docs cho 5 tháng lịch sử:

```javascript
// dashboard.js export function:
await fetchAndRenderHistoricalCharts(historicalMonths, ...);
// → Đọc clubs/{clubId}/stats/YYYY_MM cho từng tháng
// → Update Chart.js chart sau khi nhận data
```

### Gọi callable functions từ client

```javascript
// Tính lại nợ thủ công (nút trong settings)
const recalc = firebase.functions().httpsCallable('recalcDebtForClub');
const { data } = await recalc({ clubId, month: '2026-05' });

// Rebuild stats (dùng khi import data)
const rebuild = firebase.functions().httpsCallable('rebuildStatsForClub');
const { data: d2 } = await rebuild({ clubId, year: 2026 });
```

---

## Lưu ý khi sử dụng

### 1. Thứ tự tháng trong owedMonths

`owedMonths` luôn được sắp xếp theo thứ tự tăng dần (tháng cũ nhất trước):
```javascript
owedMonths: ["2026-03", "2026-04", "2026-05"]
```

### 2. Xem nợ của tháng lịch sử

render.js lọc `owedMonths` theo `selMonth`:
```javascript
owedMonths = p.owedMonths.filter(m => m <= selMonth);
```
Ví dụ: xem tháng 2026-03 → chỉ hiển thị tháng nợ đến 2026-03.

### 3. Tránh vòng lặp trigger vô hạn

`onProfileWriteDebt` chỉ tính lại khi các field LIÊN QUAN thay đổi:
```javascript
const relevantFields = ['paidUntil', 'paidMonths', 'skippedMonths', 'status', 'feeExempt', 'createdAt'];
```
Khi Cloud Function ghi `isOwed/owedMonths`, trigger kích lại nhưng không có
field nào trong danh sách thay đổi → `return null` ngay.

### 4. Stats doc ID

Doc ID dùng `_` thay `-` vì Firebase Console hiển thị đẹp hơn:
```javascript
// '2026-05' → '2026_05'
const docId = month.replace('-', '_');
```

### 5. Tính nhất quán (Eventual Consistency)

Cloud Function có thể lag 1-2 giây sau khi giao dịch được tạo.
App hiển thị số liệu tháng hiện tại từ `allTransactions` (real-time),
rồi mới update chart history từ stats docs khi load xong.

---

## Chi phí Firebase

| Operation | Cost | Ước tính (1.000 võ sinh/tháng) |
|-----------|------|-------------------------------|
| Profile trigger (mỗi lần thu tiền) | ~1 write | ~300 writes/tháng |
| Transaction trigger (mỗi giao dịch) | ~1 write | ~500 writes/tháng |
| Scheduled job (hàng ngày) | ~1.000 writes | ~30.000 writes/tháng |
| Client đọc stats (mỗi lần mở dashboard) | 6 reads | ~6 × user sessions |

**Tổng:** Vẫn nằm trong **Free Tier (Spark Plan)** cho CLB <1.000 võ sinh.
Với 10.000 võ sinh: cần **Blaze Plan** (~$5-15/tháng).

---

## Troubleshooting

### Functions không trigger

```bash
# Kiểm tra functions đã được deploy
firebase functions:list

# Xem logs lỗi
firebase functions:log
```

### Stats doc không được tạo

```javascript
// Kiểm tra transaction có trường txMonth không
// transactions cũ có thể thiếu txMonth → dùng date thay thế
// helpers.js xử lý: getTxMonth(tx) → fallback về tx.date
```

### isOwed không cập nhật sau khi thu tiền

```javascript
// Kiểm tra Finance.js ghi đúng description (= tên võ sinh)
// Cloud Function dùng description để tìm profile:
const studentName = (data.description || '').trim();
const profRef = db.doc(`clubs/${clubId}/profiles/${studentName}`);
```

### Chart không load dữ liệu lịch sử

```javascript
// Kiểm tra window.__store.clubId có đúng không
console.log(window.__store?.clubId);

// Kiểm tra stats doc tồn tại
// Firebase Console → Firestore → clubs → {clubId} → stats
```

---

*Phase 3 — Cloud Functions for Taekwondo Club Management System*
*Firebase Project: quanly-tst | Region: asia-southeast1*

---

## Phase 4K-6W — Secure Account Provisioning

Từ Phase 4K-6W, trình duyệt không còn dùng `createUserWithEmailAndPassword` để tạo Admin/HLV và không còn ghi mật khẩu vào Firestore. Mọi thao tác đặc quyền chạy qua `functions/src/accountProvisioning.js` bằng Firebase Admin SDK.

Thứ tự triển khai bắt buộc:

1. `cd functions && npm install && npm run lint`
2. `firebase deploy --only functions`
3. Canary tạo Admin/HLV và kiểm tra email thiết lập mật khẩu
4. Chạy `purgeLegacyCredentialFields`
5. `firebase deploy --only firestore:rules`
6. Deploy Hosting/GitHub Pages

Xem `PHASE_4K_6W_DEPLOYMENT_RUNBOOK.md`.

# PHASE 4K-6V5U6E — Production Authority Closure Report

Build:

`4K-6V5U6E-production-authority-closure-20260814`

Kết luận: **PASS**. Runtime production có một policy writer rõ ràng, transaction RAM chỉ được phép ghi financial stats khi coverage được chứng minh hoàn chỉnh, SuperAdmin không tự gọi Functions trong client-only mode, và legacy runtime recovery không còn tham gia normal startup.

## 1. Phạm vi và các boundary được giữ nguyên

- Không thay công thức Học phí, Báo nợ, Kho đồ, Điểm danh, Thi đai.
- Không thay Firestore Rules.
- Không thay source business logic trong `functions/` và không deploy/undeploy Functions.
- Không thêm Firestore reader, listener hoặc polling.
- Dashboard V5U6C2 và Attendance V5U6D giữ nguyên hành vi đã đóng băng.
- Attendance canonical module khớp byte-for-byte với source V5U6D.

## 2. BEFORE / AFTER authority matrix

| Concern | BEFORE V5U6E | AFTER V5U6E |
|---|---|---|
| Transaction RAM | Có limit 1.200 nhưng không công bố completeness | Công bố một `window.__store.transactionCoverage` gắn club/month/read mode/source counts/limit |
| Canonical coverage | Snapshot 1.200 vẫn có thể bị dùng như full data | `size >= limit` luôn là `hitLimit=true`, `complete=false` |
| Legacy coverage | Merged/dedup count có thể che source đã chạm limit | Chỉ complete sau cả `byDate`, `byTxMonth`, `byPackageMonth`; từng source phải `< limit` |
| Root financial cache | Partial RAM có thể ghi revenue/expense/profit/tx count | Các financial field hoàn toàn bị loại khỏi payload nếu coverage không complete |
| `stats/{month}` | Partial totals có thể ghi đè truth | Incomplete chỉ merge member fields + coverage metadata; không ghi financial fields hoặc finance `updatedAt` |
| Member counts | Bị ghép chặt với finance write | Có thể cập nhật độc lập khi finance unknown/incomplete |
| SuperAdmin | Có thể coi cache partial như số thật hoặc tự gọi server refresh | Incomplete finance hiển thị unknown (`--`); không targeted fallback; callable bị policy chặn |
| Stats writer policy | Client/Functions authority mơ hồ | Một immutable policy chọn `mode=client-only`, `statsWriter=client` |
| Default deploy | Generic Firebase config có thể kéo Functions vào | `firebase.json` mặc định chỉ client/Firestore; Functions giữ ở `firebase.functions.json` riêng |
| Runtime recovery | `app:context-ready`/bootstrap có thể chạy detector | Normal startup không gọi recovery; default resolve trả RAM state, zero probe |
| Legacy fallback | Có thể tham gia bootstrap | Chỉ manual diagnostic, cần explicit probe và explicit legacy activation |

## 3. Transaction coverage authority

Coverage được tạo và publish tại chính transaction listener owner:

```text
window.__store.transactionCoverage = {
  clubId,
  month,
  readMode,
  ready,
  complete,
  hitLimit,
  mergedCount,
  sourceCounts,
  limit,
  updatedAt,
  reason
}
```

Coverage reset về unknown khi logout, club switch, month/read-mode listener attach mới, và explicit legacy-root recovery. Callback cũ chỉ được publish nếu club/month/read mode vẫn khớp active listener context.

### Coverage examples đã chạy động

| Mode | Source counts | Limit | Result |
|---|---:|---:|---|
| Canonical | 700 | 1.200 | `ready=true`, `complete=true`, `hitLimit=false` |
| Canonical | 1.200 | 1.200 | `complete=false`, `hitLimit=true` |
| Legacy | date 600 / txMonth 500 / package 200 | 1.200 | `complete=true` sau đủ 3 initial sources |
| Legacy | date 600 / txMonth 500 / package 1.200 | 1.200 | `complete=false`, `hitLimit=true` |
| Legacy hydration chưa đủ 3 source | bất kỳ | 1.200 | `ready=false`, `complete=false` |

Merged dedup count không được dùng để che việc một source đã chạm limit.

## 4. Coverage-safe stats writer

`clubStatsAutoCache` chỉ cho phép finance khi đồng thời thỏa:

```text
policy.statsWriter == client
coverage.clubId == current club
coverage.month == current month
coverage.ready == true
coverage.complete == true
```

### Rejected evidence — high volume/incomplete

Dynamic simulation đưa 1.200 transactions vào RAM với `complete=false`, `hitLimit=true`:

- Root member cache vẫn được cập nhật.
- Root `cacheCoverage.financeComplete=false` được ghi.
- Root financial field write count = **0**.
- `stats/{month}` financial field write count = **0**.
- Không ghi `cachedCurrentMonthRevenue`, `currentMonthRevenue`, keyed revenue maps hoặc `superAdminStats` bằng partial totals.
- Không ghi `income`, `expense`, `profit`, `txCount` hoặc generic finance `updatedAt` vào stats doc.
- Unknown finance không bị ép thành `0`.

### Accepted evidence — complete coverage

Dynamic simulation 900 transactions với coverage complete:

| Field | Accepted value |
|---|---:|
| Income | 449.500.000 |
| Expense | 100.000 |
| Profit | 449.400.000 |
| Tx count | 900 |

Root finance và `stats/{month}` đều được phép ghi. Coverage của Club B không thể authorize write cho Club A.

## 5. SuperAdmin và production writer policy

Policy duy nhất được cài trước runtime writers và expose read-only:

```js
{
  mode: 'client-only',
  statsWriter: 'client',
  superAdminServerRefresh: false,
  legacyRuntimeRecovery: false
}
```

- Policy object được freeze; global property không writable/configurable.
- Viewer không có client write authority như trước.
- SuperAdmin không tự gọi `refreshSuperAdminSummaryForClub`.
- Auto và manual compatibility refresh đều fail closed với `production-policy-client-only`.
- Firebase Functions SDK không còn được load trong default client page.
- Financial coverage explicit incomplete được render là unknown, không dùng preserved partial number và không tạo targeted stats fallback read.

### Client/server authority status

- **Selected normal production runtime authority:** coverage-safe client writer.
- **Functions source:** giữ nguyên trong repository như archive/separate deployment source.
- **Default deployment:** không bao gồm Functions.
- **REMOTE FUNCTIONS DEPLOYMENT STATUS = UNKNOWN**.

Static source không thể chứng minh remote Functions đang tồn tại hay đã bị undeploy. Không có thao tác deploy/undeploy nào được thực hiện trong phase này. Khi cần xác minh, dùng Firebase project/deployment tooling với đúng project và quyền vận hành, tách khỏi client release.

## 6. Normal startup read graphs

### Admin

```text
verified auth context
  -> accepted club root snapshot
  -> canonical domain readers
  -> transaction RAM + coverage
  -> client stats writer only if coverage complete

legacy source detector: 0 probes
SuperAdmin callable: 0
```

### Viewer

```text
verified auth context
  -> accepted club root snapshot
  -> authorized read-only canonical readers
  -> presentation/cache consumption

client stats writes: 0
server callable: 0
legacy source detector: 0 probes
```

### Coach

```text
verified Coach context
  -> club root
  -> assigned-branch profiles
  -> attendance settings + attendance + notes

transactions: 0
inventory: 0
dashboard stats: 0
legacy tst_* probes: 0
SuperAdmin callable: 0
```

Coach explicit diagnostic probe requests are blocked before `_hasDoc`; không cấp thêm Rules cho Coach.

## 7. Legacy runtime recovery isolation

### BEFORE

```text
app:context-ready / late bootstrap replay
  -> runRuntimeDataRecovery()
  -> resolveActiveDataSource()
  -> primary profiles/transactions/inventory probes
  -> legacy tst_profiles/tst_transactions/tst_inventory probes
```

Tối đa 6 source-detector queries có thể tham gia mỗi normal startup.

### AFTER

```text
normal login
  -> verified canonical tenant bootstrap
  -> zero legacy recovery probes

manual diagnostic only
  -> resolveActiveDataSource({ probe: true, includeLegacy: true })
  -> optional runRuntimeDataRecovery(..., {
       probe: true,
       includeLegacy: true,
       activateLegacy: true
     })
```

- No-options `resolveActiveDataSource()` trả canonical runtime state từ RAM.
- `runRuntimeDataRecovery()` không có `probe:true` trả `explicit-probe-required`.
- Legacy activation cần `activateLegacy:true`; normal bootstrap không tự fallback.

## 8. Tenant isolation gate correction

Gate tenant hiện hiểu đúng narrow bootstrap Rules:

- Self-UID bootstrap `get/create` qua `isBootstrapSuperAdminIdentity(uid)` được chấp nhận.
- `list` vẫn chỉ cho canonical `isSuperAdmin()`.
- Gate vẫn fail nếu `super_admins` cho `isClubAdmin(...)`, `isAdminOrViewer(...)`, hoặc public `allow read: if true`.
- Firestore Rules file khớp byte-for-byte với baseline V5U6D; không nới quyền.

## 9. Firestore read/listener budget

| Call site | V5U6D baseline | V5U6E actual | Acceptance |
|---|---:|---:|---:|
| `getDoc` | 31 | 31 | <= 31 |
| `getDocs` | 56 | 56 | <= 56 |
| `onSnapshot` | 16 | 16 | <= 16 |

Normal tenant source-detector probes giảm từ tối đa 6 xuống 0 mà không chuyển reader sang module khác. Không polling hoặc listener/query authority mới được thêm.

## 10. Regression results

| Gate | Result |
|---|---:|
| Syntax | PASS — 245 items |
| Production Authority Closure | PASS — 64/64 |
| Parallel Read Authority | PASS — 42/42 |
| Startup Read Budget | PASS — 8/8 |
| Club Bootstrap | PASS — 20/20 |
| Club Initial Access | PASS — 39/39 |
| Auth Context Single Writer | PASS — 40/40 |
| Notification Single Read Authority | PASS — 17/17 |
| Dashboard Hydration Guard | PASS — 44/44 |
| Dashboard Cache Freshness | PASS — 49/49 |
| Dashboard Single Authority | PASS — 38/38 |
| Attendance Daily Authority | PASS — 73/73 |
| Attendance Canonical Ownership | PASS — 141 assertions |
| Attendance Reliability | PASS — 20 items |
| Attendance Scheduled Accuracy | PASS — 22 items |
| Attendance Offline Shift | PASS — 18 items |
| Attendance Shift Filter | PASS — 10/10 |
| Coach Attendance Boundary | PASS — 30/30 |
| Coach Security Branch | PASS — 35/35 |
| Canonical Transaction | PASS — 27/27 |
| Firestore Read Attribution | PASS — 34/34 |
| Tuition Command Behavior | PASS |
| Debt Authoritative Coverage | PASS — 32/32 |
| Inventory Ledger | PASS — 33/33 |
| Student Given-Name Search | PASS — 43/43 |
| Search Runtime Performance | PASS |
| Quit Single Source | PASS — 16/16 |
| SuperAdmin Cache First | PASS — 17/17 |
| SuperAdmin Aggregation Hard Stop | PASS |
| Tenant Isolation | PASS — 21 patterns |
| Production Stability | PASS — 22/22 |

Full suites:

```text
npm run check              EXIT 0
npm run check:all:critical EXIT 0
npm run check:all          EXIT 0
```

## 11. Root/public synchronization

`npm run build:public` completed successfully.

| Check | Result |
|---|---:|
| Runtime files checked | 123 |
| Missing in `public` | 0 |
| Different hashes | 0 |
| Extra runtime files | 0 |

Compared entries: `index.html`, `app.js`, `style.css`, `.nojekyll`, `js/**`, `css/**`.

Additional freeze evidence:

- `functions/` source diff vs V5U6D: 0.
- `firestore.rules` diff vs V5U6D: 0.
- `js/modules/attendance.js` diff vs V5U6D: 0.

## 12. Known remaining issues / next phase

1. **Attendance explicit shift authority:** nếu đã cấu hình shifts, blank shift vẫn có all-shift semantics mơ hồ. Recommended next phase: **PHASE 4K-6V5U6F — Attendance Explicit Shift Authority + No-Shift Read Guard**.
2. Dashboard truly-empty-profile hydration edge vẫn là technical debt; không reopen Dashboard trong V5U6E.
3. **REMOTE FUNCTIONS DEPLOYMENT STATUS = UNKNOWN**; cần kiểm tra riêng bằng authoritative deployment tooling.
4. Rule-level club account lock/expiry hardening còn pending.

## 13. Definition of Done

- [x] Một production stats-writer policy.
- [x] Partial transaction RAM không thể overwrite financial stats.
- [x] Listener publish explicit coverage; `>= limit` là incomplete.
- [x] Unknown revenue không trở thành zero.
- [x] SuperAdmin không auto invoke Functions trong client-only mode.
- [x] Legacy recovery không auto-run khi login.
- [x] Admin/Viewer/Coach source-probe reads = 0 trong normal startup.
- [x] Coach không probe transaction/inventory/legacy root.
- [x] Legacy fallback chỉ còn explicit/manual recovery.
- [x] Secure narrow SuperAdmin bootstrap Rules được gate hiểu đúng.
- [x] Không reader/listener/polling mới.
- [x] Dashboard, Attendance, Transaction, Tuition, Debt, Inventory, Search, Quit đều PASS.
- [x] Root/public đồng bộ hoàn toàn.


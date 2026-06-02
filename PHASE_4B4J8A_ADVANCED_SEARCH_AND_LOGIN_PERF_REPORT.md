# Phase 4.0B-4J-8A Advanced Search + Remaining 500 Cleanup + Login Performance Report

## Advanced Student Search

- normalizeSearchText: ✅ Thêm vào app.js — bỏ dấu tiếng Việt + lowercase + trim
- normalizePhoneForSearch: ✅ Thêm vào app.js — giữ chỉ số, bỏ ký tự thừa
- buildStudentSearchIndex: ✅ Thêm vào app.js — tổng hợp searchName / searchPhone / searchCode / searchNickname
- searchName: ✅ Ghi khi thêm và sửa hồ sơ võ sinh
- searchPhone: ✅ Ghi khi thêm và sửa hồ sơ võ sinh
- searchCode: ✅ Ghi khi thêm và sửa hồ sơ võ sinh
- searchNickname: ✅ Ghi khi thêm và sửa hồ sơ võ sinh
- server-side search: ✅ StudentService.searchProfilesServerSide() — query theo searchName, searchPhone, searchCode, searchNickname
- fallback for old docs: ✅ Fallback query theo __name__ prefix nếu searchName chưa có; warning nhẹ nếu 0 kết quả

## Backfill Tool

- dry-run default: ✅ Mặc định dry-run, chỉ báo cáo, không ghi
- execute requires confirm: ✅ Cần --execute --confirm "BACKFILL SEARCH INDEX <clubId>"
- batch size: ✅ Đọc 200 docs/batch, ghi 400 docs/batch
- report: ✅ Ghi backfill-search-index-report.json sau mỗi lần chạy

## Remaining 500 Cleanup

- rename student scan: ✅ Thay limit(500) bằng fetchQueryPages — xử lý võ sinh có >500 giao dịch
- paidUntil recalculation: ✅ Thay limit(500) bằng fetchQueryPages — tính đúng paidUntil dù có nhiều tx lịch sử
- batch delete: ✅ Thay getDocs limit(500) đơn bằng vòng lặp paginated — xóa đầy đủ tx cũ
- parent lookup fallback: ⚠️ Giữ limit(500) với warning rõ — fallback client-side hiếm xảy ra; ưu tiên callable parentLookup
- inventory: ✅ limit(500) cho hiển thị lịch sử kho gần đây — đã có comment OK_UI_DISPLAY_LIMIT; công nợ kho dùng _loadAllUnpaidInvDebts() riêng
- attendance: ✅ Thay limit(500) bằng attendanceDailyLimit từ __scaleConfig (mặc định 1200)
- legacy fallback: ✅ Dùng legacyFallbackLimit từ __scaleConfig (mặc định 1200)

## Login Performance

- shell ready: ✅ Dispatch app:shell-ready + markLoginPerf('shellShown') khi initSaaSDatabase
- first tab render: ✅ markLoginPerf('firstTabRendered') — mark khi tab đầu được render
- data hydration: ✅ markLoginPerf('dataHydrated') — mark khi snapshot profiles/inventory load xong
- deferred heavy work: ✅ runIdle (requestIdleCallback || setTimeout(800)) defer diagnostics / audit / non-critical
- mobile target: Giảm cảm giác đơ 2–3s — shell hiện sớm, dữ liệu tải dần

## Debug Commands (DevTools Console)

```js
window.printLoginPerfMetrics()    // Xem login milestones
window.printReadScaleMetrics()    // Xem số reads theo collection
window.printScaleReadiness()      // Xem config limits
window.buildStudentSearchIndex({phone:'0901234567', memberId:'VS001'}, 'Nguyen Van A')
// → {searchName, searchNameTokens, searchPhone, searchCode, searchNickname}
```

## Safety

- Business logic changed: no
- Firestore destructive schema change: no
- Migration auto-run: no
- Deploy executed: no
- Writes added only on add/edit student: yes — buildStudentSearchIndex() trong cùng lần write
- Backfill requires explicit execute: yes — --execute --confirm "BACKFILL SEARCH INDEX <clubId>"

## Tests

- check-scale: node tools/check-scale-readiness.mjs
- check-login-performance: node tools/check-login-performance.mjs
- check:all: npm run check:all

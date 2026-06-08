# Phase 4K-6I-H — SuperAdmin Safe Server Refresh Guide

## Mục tiêu

SuperAdmin không được tự động đếm toàn bộ dữ liệu CLB ở trình duyệt vì sẽ gây `runAggregationQuery 429 / Quota exceeded`.

Bản 4K-6I-H dùng 2 lớp an toàn:

1. **Cloud Functions summary cache** cập nhật `clubs/{clubId}`.
2. **Safe server refresh helper** trong SuperAdmin: nếu CLB thiếu cache, app gọi callable `refreshSuperAdminSummaryForClub` tuần tự từng CLB, có throttle/circuit breaker, không dùng client aggregation.

## Bắt buộc deploy Cloud Functions

```bash
cd functions
npm install
npm run lint
cd ..
firebase deploy --only functions
```

Nếu chưa deploy Functions, SuperAdmin vẫn load được danh sách CLB nhưng các số liệu thiếu cache sẽ hiển thị `--`.

## Debug sau khi upload

```js
debugAppVersion()
debugSuperAdminServerRefresh()
debugSuperAdminLoadState()
debugSuperAdminAggregationHardStop()
debugSuperAdminQuotaGuard()
debugRuntimeSmokeTest()
```

Version đúng:

```text
4K-6I-H-superadmin-safe-server-refresh-20260608
```

## Kỳ vọng

- Không còn spam `runAggregationQuery 429` từ SuperAdmin frontend.
- Nếu Functions đã deploy, SuperAdmin tự gọi refresh nền từng CLB thiếu cache.
- Nếu Functions chưa deploy hoặc quyền sai, hệ thống dừng an toàn và hiển thị cảnh báo nhẹ.
- Không dùng `getCountFromServer` trong trình duyệt SuperAdmin để đếm toàn hệ thống.

## Lưu ý

Lần đầu sau deploy có thể mất vài phút để cache đầy đủ. Các lần sau SuperAdmin chỉ đọc cache ở `clubs/{clubId}` nên nhẹ và ổn định hơn.

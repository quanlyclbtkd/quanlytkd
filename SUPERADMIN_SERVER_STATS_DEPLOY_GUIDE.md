# Phase 4K-6I-G — SuperAdmin Server Summary Cache

## Mục tiêu
SuperAdmin không được tự đếm toàn bộ profiles/transactions bằng client vì dễ gây `runAggregationQuery 429`.
Bản này bổ sung Cloud Functions tự động cập nhật cache thống kê vào `clubs/{clubId}` để SuperAdmin đọc O(1).

## Bắt buộc để số liệu tự động hiện
Sau khi upload source web, cần deploy Cloud Functions:

```bash
cd functions
npm install
npm run lint
cd ..
firebase deploy --only functions
```

## Các function mới
- `onProfileWriteSuperAdminSummary`: tự cập nhật số võ sinh active/profile khi profile tạo/xóa/đổi trạng thái.
- `onTransactionWriteSuperAdminSummary`: tự cập nhật doanh thu tháng hiện tại khi transaction tạo/xóa/sửa.
- `scheduledRefreshSuperAdminSummaries`: tự refresh/backfill toàn bộ CLB mỗi 6 giờ.
- `refreshSuperAdminSummaryForClub`: callable dùng khi cần refresh 1 CLB.

## Vì sao không làm 100% bằng frontend SuperAdmin?
Nếu SuperAdmin frontend tự đếm toàn bộ CLB, hệ thống phải gọi aggregation/scans cho nhiều collection của nhiều CLB, dễ gây quota 429.
Cách an toàn là cập nhật cache server-side rồi SuperAdmin chỉ đọc root docs.

## Sau khi deploy
- Trigger sẽ tự cập nhật dữ liệu mới.
- Scheduled job sẽ backfill dần dữ liệu cũ.
- SuperAdmin sẽ hiện Tổng võ sinh / Doanh thu khi root cache hoặc stats doc đã được ghi.

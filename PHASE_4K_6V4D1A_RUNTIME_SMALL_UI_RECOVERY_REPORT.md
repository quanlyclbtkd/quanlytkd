# Phase 4K-6V4D1A — Runtime Small UI Recovery

## Mục tiêu

Khôi phục chính xác 3 lỗi lặp lại sau khi triển khai V4D1:

1. Tab **Đang tập** không hiện phần **Báo nghỉ tháng** trên web/mobile.
2. Banner/thông báo **sinh nhật** không hiện trên web/mobile.
3. Tab **Đã nghỉ** không hiện đầy đủ danh sách võ sinh đã nghỉ.

Bản này chỉ sửa đúng các luồng render liên quan, không mở rộng sang tính năng khác.

## Nguyên nhân

V4D1 là bản read-only audit, nhưng khi cache-bust và thêm `profileCanonicalStore`, luồng render quay lại cơ chế skip render khi `_dataVersion` không đổi. Việc skip render nặng là đúng, nhưng các khối UI nhỏ phụ thuộc tab/tháng như **Báo nghỉ tháng**, **sinh nhật**, và fallback **Đã nghỉ** cũng bị bỏ qua.

## Sửa chính

- Thêm helper refresh UI nhỏ trong module render để vẫn cập nhật khi `renderApp()` bị skip vì dataVersion không đổi.
- Khôi phục cập nhật `updateSkippedMonthSection()` bằng nguồn profiles local đã có, không thêm query Firestore.
- Khôi phục banner sinh nhật bằng cách gọi lại `_renderHomeBirthdayBanner()` khi render nhẹ.
- Mở rộng nhận diện field ngày sinh: `dob`, `birthDate`, `birthday`, `dateOfBirth`, `ngaySinh`, `ngay_sinh`.
- Tăng fallback tab **Đã nghỉ**: ưu tiên cache authoritative, nếu cache thiếu thì dùng local sources như `studentProfileStore`, `ProfileCanonicalStore.quitProfiles`, `window.allProfiles`, `window.__store.profiles`.
- Đồng bộ root/public và cache-bust sang `profile-canonical-store-mobile-small-ui-20260628-v4d1b`.

## Không thay đổi

- Không thay đổi Firestore Rules.
- Không thêm Firestore listener/query.
- Không dùng aggregation count.
- Không ghi Firestore.
- Không migration.
- Không thay đổi logic Báo nợ/Học phí/Kho đồ.
- Không cutover tab sang Profile Canonical Store; store V4D1 vẫn là read-only audit.

## Kết luận

V4D1A là bản sửa hẹp để phục hồi các UI nhỏ bị bỏ qua do render lifecycle, đồng thời giữ nguyên mục tiêu an toàn của V4D1.

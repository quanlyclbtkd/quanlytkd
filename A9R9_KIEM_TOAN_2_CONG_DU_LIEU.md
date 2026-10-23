# PHASE A9R9 — S01 Server Evidence & Journal Fleet Reconciliation

**Trạng thái: TEST ONLY — RELEASE_HOLD — NO DEPLOY.** Đây là bộ công cụ kiểm toán/đối soát mới, không phải giấy phép bật Điểm danh HLV production.

## Nguồn và phạm vi
- Baseline nguyên vẹn: `QR_V11R6_A9R8_S01_JOURNAL_CLOSURE_TEST_ONLY_FULL_SOURCE.zip`.
- Giữ nguyên mã vận hành (`app.js`, `firestore.rules`, `js/data/attendanceJournal.js`, `js/modules/attendance.js`, `js/services/attendance.service.js`, Auth/ACL, Finance, QR, public tương ứng).
- Chỉ thêm `tools/a9r9/*`, `Run-A9R9-Offline.ps1`, các tệp hướng dẫn và template; không thêm Firestore reader/listener/writer trong app.

## Năm khoảng trống còn mở
1. **S01:** Các ca A9R7 cho thấy marker lịch sử giả được tạo trước cutover vẫn có thể được đọc nếu chỉ dựa `historyAuthority`. Chưa có snapshot **server staging thực** theo `fixed-read-time` và inventory toàn cục với trang cuối rỗng. Không tự đổi marker hay Rules.
2. **Device V1/V2:** Chưa có bản sao lưu, nguồn gốc, xử lý theo từng chủ thể và thiết bị. `offline_att_*` không được tự import/replay; còn bản ghi là HOLD.
3. **Device V3:** Bản ghi `acked` trên máy không tương đương xác nhận dữ liệu trên server. Phải so `attendanceVersion`, scope, quan hệ phiên bản; pending/inflight/conflict/needs-review vẫn là HOLD.
4. **IDB legacy:** `taekwondo_cache/offline_queue` trước đây không được kiểm kê trong backup V11R3. Công cụ mới chỉ kiểm tra `count()` bằng transaction `readonly`, **không truy xuất raw, không mở processor**, trạng thái `NONEMPTY` là HOLD. Kết quả chỉ là snapshot một thời điểm, không chứng minh cả đời thiết bị.
5. **Phủ thiết bị:** Không có danh sách thiết bị/principal/origin được chủ hệ thống ký xác nhận. Thiếu thiết bị hoặc thiếu backup là HOLD. Cần khớp backup hash trong roster đã ký.

## Công cụ bổ sung
- `tools/a9r9/legacy-queue-readonly.mjs`: đọc chỉ số hàng đợi IDB cũ tại **staging độc lập**, fail-closed khi thay đổi inventory, lỗi IDB hay không chứng minh được trạng thái DB/store.
- `tools/a9r9/generate-device-snippet.mjs`: xuất mã kiểm kê một lần cho DevTools tại origin staging đúng, không thực thi tại thời điểm tạo mã.
- `tools/a9r9/evidence-closure.mjs`: sử dụng lại `auditHistoryEvidence` của V11R3 (bản chụp đầy đủ + signed provenance); kiểm kê thiết bị từ roster Ed25519 của chủ hệ thống; đối chiếu ACK/`attendanceVersion`, không xuất raw dữ liệu võ sinh.
- `tools/a9r9/evidence-closure.test.mjs`: 20 ca RED/deny/positive offline.

## Cách thu thập chứng cứ hợp lệ (không chạy trên production)
1. Chủ hệ thống phê duyệt **staging project riêng**, không sử dụng project `quanly-tst`. Mã ứng dụng staging phải được rebinding và phục vụ đúng origin staging; mặc định Rules khóa Điểm danh.
2. Theo đúng quy trình V11R3 hiện có: `tools/v11r3/new-request.mjs` tạo yêu cầu **pending**; người có thẩm quyền kiểm tra page limits, READ costs, club scope và ký `attendance-staging-read-audit`; `server-export.mjs` đọc bản chụp trong thời điểm cố định; `history-audit.mjs` đối chiếu Rules/indexes/runtime, trang cuối rỗng, collection-group toàn cục và nguồn gốc tài liệu ký xác nhận. **Không làm giả evidence, không đổi assertion.**
3. Đối với từng thiết bị/browser-origin thuộc phạm vi, thu bản sao lưu Journal bằng quy trình `tools/v11r3/capture-legacy.mjs` được chủ hệ thống phê duyệt. Thu thêm thống kê IDB cũ bằng `tools/a9r9/generate-device-snippet.mjs` tại staging đúng origin, không tải raw dữ liệu lên chat.
4. Chủ hệ thống lập roster đủ mọi thiết bị có liên quan, ghi pseudonymous `deviceId`, `clubId`, `origin`, `backupSHA256` và `queueInventorySHA256`; ký payload `purpose=attendance-device-fleet`, `environment=staging`, `evidenceScope=STAGING_VERIFIED` qua công cụ Ed25519 `tools/v11r3/sign-envelope.mjs`. Không sử dụng khoá riêng trong chat, ZIP hay source.
5. Chạy `evidence-closure.mjs` từ bằng chứng đã ký. Nếu thiếu snapshot S01, authority cohort không zero, còn hàng đợi, còn intent chưa ACK, ACK chưa chứng minh, thiếu thiết bị, không khớp dự án/sha -> HOLD. Kết quả `STAGING_EVIDENCE_REVIEW_COMPLETE_NOT_RELEASE` (nếu có) vẫn **không phải** quyết định production release; cần phê duyệt và kiểm thử GUI riêng.

## Windows: tự kiểm thử mã A9R9 trước (không cần Firebase)
```powershell
cd D:\A9R9\source
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R9-Offline.ps1
Compress-Archive -Path .\qa_results_a9r9\* -DestinationPath D:\A9R9\A9R9_OFFLINE_RESULTS.zip -Force
```

## Ví dụ template request để tạo công cụ đọc hàng đợi (staging, không phải production)
Lưu JSON riêng, thay `a9r9-staging` và origin staging thật của bạn:
```json
{
  "projectId": "a9r9-staging",
  "clubId": "club-demo-01",
  "expectedOrigin": "https://staging.example.org",
  "environment": "staging"
}
```
Sau đó tạo mã JS **để quản trị viên đọc/duyệt trước**:
```powershell
node tools\a9r9\generate-device-snippet.mjs D:\Evidence\staging-device-request.json D:\Evidence\inspect-legacy-queue.js
```
Lưu ý: chỉ chạy trong DevTools của staging đã kiểm chứng đúng project, không chạy trên `quanlyclb.id.vn` hoặc `localhost` đang gắn project production. Chỉ số hàng đợi `NONEMPTY` không thể tự sửa bằng xóa dữ liệu.

## Đối soát đã ký sau khi nhận được evidence thật
```powershell
node tools\a9r9\evidence-closure.mjs D:\Evidence\a9r9-package.json D:\Evidence\a9r9-report.json D:\Evidence\owner-public.pem <PIN_SHA256_PUBLIC_KEY>
```
Tool sẽ cố ý exit 2 nếu RELEASE_HOLD; không có secret/key trong source. Dữ liệu evidence gốc có thể chứa thông tin cá nhân và phải giữ nội bộ, chỉ gửi kết quả redacted `a9r9-report.json`.

## Các cổng chưa đạt, không được thay đổi
- Chưa có server snapshot fixed-read-time, signed provenance cho staging thật.
- Chưa chứng minh đủ số thiết bị/browser-origin và lịch sử V1/V2/V3 toàn bộ.
- Chưa nghiệm thu Android/iOS CS1/CS2 → ca → võ sinh → ghi → ACK → login lại.
- Chưa phê duyệt cutover/source identity, READS/CAS/retry và rollback.
- Gate `app.js` >700000 byte (tồn đọng A9R8), không được nâng ngưỡng để tạo PASS giả.

**Bảo đảm ranh giới:** `0 production write`, `0 new app Firestore readers`, `NO_DEPLOY`, `NO_S01_MARKER_CHANGE`, `NO_ATTENDANCE_UNLOCK`, `NO_QUEUE_REPLAY`.

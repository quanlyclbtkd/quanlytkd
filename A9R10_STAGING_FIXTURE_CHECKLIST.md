# A9R10R2 — Checklist dữ liệu staging trước nghiệm thu HLV

Chỉ đánh dấu PASS khi thực hiện trên Firebase project staging riêng, không phải `quanly-tst` và không phải `demo-*`.

## Project / Hosting
- [ ] ProjectId staging riêng.
- [ ] Hosting HTTPS staging chạy đúng source hash.
- [ ] Maintenance Rules/indexes đã deploy.
- [ ] `HISTORY_COACH_ACCESS=false` trước cutover.
- [ ] `coachAttendanceCutoverOpen()=false` trước cutover.

## Fixture CLB
- [ ] Có 1 CLB staging test.
- [ ] Có `settings/shifts` với ít nhất 1 ca CS1.
- [ ] Có `settings/shifts` với ít nhất 1 ca CS2.
- [ ] Có ≥2 võ sinh giả CS1.
- [ ] Có ≥2 võ sinh giả CS2.
- [ ] Không dùng dữ liệu cá nhân thật nếu không cần thiết.
- [ ] Attendance collection = 0 trước snapshot S01 (khuyến nghị). Nếu >0: bắt buộc provenance từng row.

## HLV staging
- [ ] Tạo bằng owner `createCoachAccount()` hiện hữu.
- [ ] Auth UID và `clubs/{clubId}/coaches/{uid}` + `users/{uid}` đồng nhất.
- [ ] `allowedBranches` chứa CS1 và CS2.
- [ ] Đăng nhập được khi maintenance khóa.
- [ ] Không xem được Học phí/Báo nợ/Kho theo policy.

## Thiết bị
- [ ] Desktop browser profile staging riêng.
- [ ] Android browser profile staging riêng.
- [ ] iOS browser profile staging riêng nếu iOS nằm trong phạm vi phát hành.
- [ ] Không dùng profile browser đã từng chạy production Attendance nếu chưa kiểm kê Journal.
- [ ] Mỗi device/browser profile có `deviceId` riêng trong signed fleet roster.

## Trước cutover
- [ ] S01 snapshot fixed read time đầy đủ.
- [ ] Candidate historyAuthority cohort = 0 cho mọi club scope.
- [ ] Journal V1/V2 đã reconcile hoặc = 0.
- [ ] Journal V3 pending/inflight/conflict/needs-review = 0.
- [ ] IndexedDB legacy queue = EMPTY/ABSENT.
- [ ] ACK cuối mỗi target khớp server `attendanceVersion`.
- [ ] Old staging clients quiesced; inflight writes settled.
- [ ] Rollback candidate đã được tạo và proof PASS.

## Sau active cutover — acceptance HLV
- [ ] 18/18 cases PASS.
- [ ] CS1 không lẫn CS2.
- [ ] CS2 không lẫn CS1.
- [ ] Branch ngoài quyền bị deny.
- [ ] Finance bị deny.
- [ ] Duplicate intent không duplicate doc.
- [ ] Offline→online không mất intent/không ghi hai lần.
- [ ] Relogin vẫn đọc đúng trạng thái đã chấm.
- [ ] Console không có critical error.

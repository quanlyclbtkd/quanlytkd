# PHASE A9R10 — Staging Evidence Collection & Coach Attendance Acceptance

## Mục tiêu
A9R10 không sửa các hàm Điểm danh đã PASS. Mục tiêu là hoàn thành hai cổng dữ liệu S01 + Journal trên **staging riêng**, sau đó nghiệm thu HLV end-to-end. Không dùng project production `quanly-tst`.

## Gate A — Staging source identity
- [ ] Firebase project staging riêng, projectId không phải `quanly-tst` và không phải `demo-*`.
- [ ] `app.js` và `js/firebase/config.js` đều trỏ đúng project staging.
- [ ] Hosting staging dùng HTTPS và runtime được đối chiếu hash.
- [ ] Firestore Rules ở staging vẫn là maintenance/deny trong giai đoạn thu thập S01.
- [ ] Không có production write, finance write hoặc attendance cutover trong bước này.

## Gate B — S01 server evidence
- [ ] Yêu cầu đọc được owner phê duyệt, có giới hạn số documents/requests.
- [ ] Snapshot dùng fixed-read-time, không cache, không pending writes.
- [ ] Có global collection-group attendance inventory và trang cuối rỗng.
- [ ] Rules/indexes/runtime được đối chiếu đúng staging.
- [ ] Candidate `historyAuthority` cohort trước cutover = 0 cho mọi club trong scope.
- [ ] Mỗi bản ghi lịch sử cần nguồn gốc được owner xác minh; thiếu nguồn gốc => HOLD.

## Gate C — Journal fleet reconciliation
Cho **mọi thiết bị nằm trong roster được owner xác nhận**:
- [ ] localStorage V1/V2 đã chụp read-only.
- [ ] Journal V3 đã chụp read-only.
- [ ] IndexedDB `taekwondo_cache/offline_queue` đã kiểm kê read-only.
- [ ] `pending`, `inflight`, `conflict`, `needs-review` = 0 trước nghiệm thu UI.
- [ ] ACK cuối cùng của mỗi target khớp `attendanceVersion` trên snapshot server.
- [ ] Không có thiết bị thiếu bằng chứng; không có bằng chứng từ thiết bị ngoài roster.
- [ ] Không replay/xóa queue tự động để làm sạch kết quả.

## Gate D — Coach UI acceptance trên staging
Phải PASS đủ 18 ca trong `A9R10_COACH_ACCEPTANCE.template.json`:
1. HLV đăng nhập.
2. Chọn CS1.
3. Ca tập CS1 tải được.
4. Danh sách võ sinh chỉ đúng CS1.
5. Tạo điểm danh CS1.
6. Journal/ACK CS1 hoàn tất.
7. Đăng nhập lại, dữ liệu CS1 vẫn đúng.
8. Chọn CS2.
9. Ca tập CS2 tải được.
10. Danh sách võ sinh chỉ đúng CS2.
11. Tạo điểm danh CS2.
12. Journal/ACK CS2 hoàn tất.
13. Đăng nhập lại, dữ liệu CS2 vẫn đúng.
14. Cơ sở không được cấp bị từ chối.
15. Học phí/Báo nợ/Kho tài chính bị từ chối cho Coach theo policy.
16. Thao tác lặp không tạo attendance duplicate.
17. Offline → online phục hồi không mất intent/không ghi hai lần.
18. Console không có lỗi critical trong chuỗi nghiệm thu.

## Quy tắc bằng chứng
Mỗi ca PASS phải gắn ít nhất một SHA-256 của ảnh/log/report đã ẩn thông tin cá nhân. Không đưa mật khẩu, token, khóa riêng hoặc dữ liệu võ sinh thô vào gói gửi kiểm toán.

## Kết quả hợp lệ
- `STAGING_EVIDENCE_REVIEW_COMPLETE_NOT_RELEASE`: S01 + Journal staging đã đạt, **chưa mở production**.
- `STAGING_COACH_ACCEPTANCE_PASS_NOT_RELEASE`: UI HLV staging đã đạt, **chưa mở production**.
- `A9R10_STAGING_ACCEPTANCE_COMPLETE_NOT_PRODUCTION_RELEASE`: đủ staging gates; bước kế tiếp là review cutover production độc lập.
- Bất kỳ FAIL/BLOCKED/PENDING nào => `A9R10_HOLD`.

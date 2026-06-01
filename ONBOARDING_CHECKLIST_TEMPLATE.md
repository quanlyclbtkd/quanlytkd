# Onboarding Checklist Template

> Phase 4.0B-4I — Taekwondo Club Management SaaS
> Sao chép template này cho mỗi CLB mới trước khi bàn giao.

---

## Club Info

- Club name:
- clubId:
- Admin email:
- Launch date:
- Package/Plan:
- Number of branches:
- Expected student count:

---

## Before Handover

- [ ] Confirm Firebase project (project ID đúng với CLB này)
- [ ] Confirm clubId (không nhầm với CLB khác)
- [ ] Backup/export current Firestore data
- [ ] Run `npm run check:all` — tất cả pass
- [ ] Login bằng tài khoản admin của CLB
- [ ] Chờ app load hoàn tất (không có spinner)

---

## Runtime Verification (DevTools Console)

- [ ] Chạy: `await window.printOnboardingGate({ clubId: "..." })`
- [ ] Confirm `profilesCount > 0`
- [ ] Confirm `tuitionReady = true`
- [ ] Confirm `debtReady = true`
- [ ] Confirm `dashboardReady = true`
- [ ] Confirm `activeDataSource = "primary"` hoặc `"legacy-root"`
- [ ] Confirm `blockers = []` (không có blocker)

---

## Tab Verification (thủ công)

- [ ] Tab Học phí: danh sách hiển thị đúng, số tiền hợp lệ
- [ ] Tab Báo nợ: danh sách nợ hiển thị, không trống
- [ ] Tab Đang tập: danh sách võ sinh active
- [ ] Tab Đã nghỉ: danh sách võ sinh đã nghỉ
- [ ] Tab Kho đồ: tồn kho hiển thị
- [ ] Tab Tổng quan: số liệu tổng hợp đúng
- [ ] Tab Điểm danh: bảng điểm danh load được
- [ ] Tab Thi đai: danh sách load được

---

## Snapshot Export

- [ ] Chạy: `await window.generateOnboardingReportText({ clubId: "..." })`
- [ ] Sao chép output → dán vào `ONBOARDING_REPORT_<clubId>_<date>.md`
- [ ] Lưu file report cùng checklist này

---

## Decision

- [ ] Ready for internal test (`readyForInternalTest = true`)
- [ ] Ready for 1-CLB pilot (`readyForOneClubPilot = true`)
- [ ] Ready for 10-CLB expansion (`readyForTenClubPilot = true`)
- [ ] Not ready — blockers listed (xem phần Notes)

---

## Notes

(Ghi blockers còn lại, issues phát sinh, hoặc điều kiện đặc biệt)

# Onboarding Report

> Phase 4.0B-4I — Taekwondo Club Management SaaS
> Điền đầy đủ cho mỗi CLB mới. Lưu thành `ONBOARDING_REPORT_<clubId>_<date>.md`.

---

## Club

- Club ID:
- Club Name:
- Admin:
- Checked At:

---

## Gate Result

- Active Data Source:
- Profiles Count:
- Transactions Count:
- Inventory Count:
- Tuition Ready:
- Debt Ready:
- Inventory Ready:
- Dashboard Ready:
- Ready For One Club Pilot:
- Ready For Ten Club Pilot:

---

## Blockers

(Paste từ `blockers` array trong kết quả `printOnboardingGate()`)

- ...

---

## Warnings

(Paste từ `warnings` array — không phải blocker chính nhưng cần chú ý)

- ...

---

## Screenshots Required

Chụp màn hình từng tab, đặt tên file rõ ràng:

- Học phí: `screenshot_tuition_<clubId>.png`
- Báo nợ: `screenshot_debt_<clubId>.png`
- Đang tập: `screenshot_students_<clubId>.png`
- Kho đồ: `screenshot_inventory_<clubId>.png`
- Tổng quan: `screenshot_dashboard_<clubId>.png`

---

## Full Snapshot (JSON)

Paste từ `await window.generateOnboardingReportText(...)`:

```
[Paste markdown output ở đây]
```

---

## Final Decision

- [ ] **Pass** — sẵn sàng bàn giao
- [ ] **Conditional Pass** — bàn giao có điều kiện (ghi rõ điều kiện)
- [ ] **Fail** — chưa đạt, blockers cần giải quyết trước

Lý do quyết định:

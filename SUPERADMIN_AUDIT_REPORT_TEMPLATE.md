# SuperAdmin Multi-Club Audit Report

> Phase 4.0B-4J — Taekwondo Club Management SaaS
> Điền đầy đủ sau khi chạy `await window.generateSuperAdminAuditReportText()`.
> Lưu thành `SUPERADMIN_AUDIT_REPORT_<date>.md`.

---

## Audit Info

- Date:
- Firebase Project:
- SuperAdmin:
- Total clubs checked:

---

## Summary

- Ready for pilot:
- Blocked:
- Warnings:

---

## Club Table

| Club ID | Club Name | Data Source | Profiles | Tuition | Debt | Inventory | Dashboard | Ready | Blockers |
|---|---|---|---|---|---|---|---|---|---|

(Paste từ `generateSuperAdminAuditReportText()`)

---

## Common Blockers

Blockers thường gặp khi onboard CLB mới:

- No profiles loaded — CLB chưa có dữ liệu hoặc path sai
- Tuition tab not ready — tab học phí chưa đủ dữ liệu
- Debt tab not ready — tab báo nợ chưa sẵn sàng
- Inventory missing — chưa có dữ liệu kho
- Permission denied — Firestore rules chưa set cho CLB
- Data source unknown — login chưa hoàn tất

---

## Decision

- Ready to add more clubs:
- Need fix before onboarding:
- Notes:

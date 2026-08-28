# PHASE 4K-6V5U6H5 — Exam Full Roster Export Test Matrix

Runtime build: `4K-6V5U6H5-club-root-listener-bootstrap-readiness-exam-full-roster-export-20260827`

`exportExamPaidList()` remains the compatibility/public API. Internally it now builds a full active roster from canonical RAM profiles and joins the existing canonical exam payment ledger.

| Case | Fixture | Expected | Result |
|---|---|---|---|
| E1 | 10 active / 3 paid / 7 unpaid | 10 exported rows; 3 paid; 7 unpaid | PASS |
| E2 | 10 active / 0 paid | 10 rows; no abort; all `Chưa nộp phí` | PASS |
| E3 | 8 active / 2 quit | 8 rows; quit profiles excluded | PASS |
| E4 | `Lệ phí thi`, amount 250,000 | paid=true; exam amount=250,000 | PASS |
| E5 | `Học phí + Lệ phí thi`, total 850,000, `examAmount=250,000` | exam amount=250,000 only | PASS |
| E6 | `examPaidCancelled=true` | unpaid | PASS |
| E7 | CS1=5, CS2=5 | `DS_ToanBo=10`, CS1=5, CS2=5 | PASS |
| E8 | Unpaid profile has current belt | target belt from existing `window.BELT_NEXT` | PASS |
| E9 | Export roster creation | zero new profile Firestore reader/listener | PASS |
| E10 | Existing belt-order comparator | `sortExamExportEntries()` retained | PASS |

Additional assertions verify summary fields (`Tổng võ sinh`, `Đã nộp phí`, `Chưa nộp phí`, `Tổng lệ phí đã thu`, `Ngày xuất`), row-specific fee status, canonical profile status filtering, and lazy XLSX isolation.

Checker: `npm run check:exam-export-full-roster` → **21/21 PASS**.

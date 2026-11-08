# Candidate GREEN

Actual autocomplete: 53/53. Actual Family report/receipt/pixels và pay-boundary checks: 39/39. Same fixed checkers against original baseline produce RED; source/checker SHA are frozen in behavioral-comparison.json.

## Autofill / stale row

| Assertion | Result |
| --- | --- |
| A01 combo1 canonical default | PASS |
| A01 combo1 delegates exact profile/horizon/reason | PASS |
| A01 combo1 zero SDK reads | PASS |
| A02 combo1 canonical default | PASS |
| A02 combo1 delegates exact profile/horizon/reason | PASS |
| A02 combo1 zero SDK reads | PASS |
| A03 combo1 canonical default | PASS |
| A03 combo1 delegates exact profile/horizon/reason | PASS |
| A03 combo1 zero SDK reads | PASS |
| A04 combo1 canonical default | PASS |
| A04 combo1 delegates exact profile/horizon/reason | PASS |
| A04 combo1 zero SDK reads | PASS |
| A05 combo1 canonical default | PASS |
| A05 combo1 delegates exact profile/horizon/reason | PASS |
| A05 combo1 zero SDK reads | PASS |
| A06 combo1 quit not selectable | PASS |
| A06 combo1 quit canonical authority returns no months | PASS |
| A06 combo1 inactive canonical authority returns no months | PASS |
| B01 combo1 editing name clears all dependent state | PASS |
| B02 combo1 zero fee never inherits previous fee | PASS |
| B03 combo1 new month and fee are profile-bound | PASS |
| B04 combo1 focus without edit preserves selected state | PASS |
| B05 combo1 missing fee clears previous state | PASS |
| B06 combo1 total refreshed | PASS |
| A01 combo2 canonical default | PASS |
| A01 combo2 delegates exact profile/horizon/reason | PASS |
| A01 combo2 zero SDK reads | PASS |
| A02 combo2 canonical default | PASS |
| A02 combo2 delegates exact profile/horizon/reason | PASS |
| A02 combo2 zero SDK reads | PASS |
| A03 combo2 canonical default | PASS |
| A03 combo2 delegates exact profile/horizon/reason | PASS |
| A03 combo2 zero SDK reads | PASS |
| A04 combo2 canonical default | PASS |
| A04 combo2 delegates exact profile/horizon/reason | PASS |
| A04 combo2 zero SDK reads | PASS |
| A05 combo2 canonical default | PASS |
| A05 combo2 delegates exact profile/horizon/reason | PASS |
| A05 combo2 zero SDK reads | PASS |
| A06 combo2 quit not selectable | PASS |
| A06 combo2 quit canonical authority returns no months | PASS |
| A06 combo2 inactive canonical authority returns no months | PASS |
| B01 combo2 editing name clears all dependent state | PASS |
| B02 combo2 zero fee never inherits previous fee | PASS |
| B03 combo2 new month and fee are profile-bound | PASS |
| B04 combo2 focus without edit preserves selected state | PASS |
| B05 combo2 missing fee clears previous state | PASS |
| B06 combo2 total refreshed | PASS |
| A09 invalid horizon "" uses local month | PASS |
| A09 invalid horizon "2026-13" uses local month | PASS |
| A09 invalid horizon "not-a-month" uses local month | PASS |
| A10 canonical result order is preserved without local sorting | PASS |
| A11 missing canonical helper does not invent a month | PASS |

## Family QR / pay boundary

| Assertion | Result |
| --- | --- |
| F01 F02 F05 F09 long names / same month / member IDs / same account actual Family handler/receipt succeeds | PASS |
| F17 report reaches zero SDK/business writers | PASS |
| F18 full names and participant-month mapping remain in receipt | PASS |
| F19 F20 canonical memo references everyone and all periods within local cap | PASS |
| single exact memo at addInfo, visible transfer and independently decoded provider/preview pixels | PASS |
| F03 different months actual Family handler/receipt succeeds | PASS |
| F03 both distinct months represented without false range | PASS |
| F04 different years actual Family handler/receipt succeeds | PASS |
| F04 both month/year pairs represented | PASS |
| F06 one member ID missing actual Family handler/receipt succeeds | PASS |
| F07 both IDs missing / longest cross-year periods actual Family handler/receipt succeeds | PASS |
| F07 bounded compact references retain both exact periods | PASS |
| F08 repeated fallback build is deterministic | PASS |
| F10 conflicting receiving accounts DENY | PASS |
| F10 denial occurs before provider | PASS |
| F11 provider tail mutation DENY | PASS |
| F11 exactly one provider response is audited, no financial write | PASS |
| F12 provider head mutation DENY | PASS |
| F12 exactly one provider response is audited, no financial write | PASS |
| F13 provider case mutation DENY | PASS |
| F13 exactly one provider response is audited, no financial write | PASS |
| F14 provider amount mutation DENY | PASS |
| F14 exactly one provider response is audited, no financial write | PASS |
| F15 provider bank mutation DENY | PASS |
| F15 exactly one provider response is audited, no financial write | PASS |
| F16 provider account mutation DENY | PASS |
| F16 exactly one provider response is audited, no financial write | PASS |
| F21 duplicate compact references fail closed | PASS |
| F22 reference collision against current profile cache fails closed | PASS |
| F23 existing memberID/studentId priority actual Family handler/receipt succeeds | PASS |
| F23 first valid compact identifier wins | PASS |
| F24 existing canonical name key fallback actual Family handler/receipt succeeds | PASS |
| F24 fallback never persists or adds an ID to profiles | PASS |
| F25 actual derived-reference hash collision fails closed | PASS |
| F25 hash collision is rejected before provider | PASS |
| PAY01 concurrent settlement PAID blocks entire atomic plan | PASS |
| PAY02 one atomic plan / two transactions / two profile updates | PASS |
| PAY03 pending ACK has no financial success/local promotion/receipt; double tap one writer | PASS |
| PAY04 rejected primary creates no local partial success or receipt | PASS |

F01/F02/F05/F09 share one actual long-name same-month/same-account execution, not four invented transactions. F03/F04/F06/F07/F08/F10 and provider mutations use separate actual source executions. Tests are local fixtures; no real staging acceptance claimed.

Each success Family QR: actual queued receipt ok=true, one provider fetch callback, zero business writes. Same-month sample memo `GD VTF001 VTF002 HP T11 2026`. F07 fallback cross-year keeps both YYYYMM tokens within40. F18 verifies both full names in rendered breakdown. Provider and preview pixels independently decode to the same exact memo payload; the production verifier separately compares expected intent.

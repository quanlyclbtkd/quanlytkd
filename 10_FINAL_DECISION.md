# Final decision — Family QR Human-Readable Memo R1.1

**PASS — scoped R1.1 test-candidate acceptance.**

- Actual image-case memo is GD NGAN KHANH HAI DANG HP T11 2026, length34.
- Same exact string at URL/addInfo, expected intent, visible transfer line, decoded provider and decoded preview.
- Updated Family QR matrix66/66, protected autofill53/53; all12 executed required/new regression commands RC0.
- Finance module and app outside Family builder unchanged; exact EMV/account authority and local40 cap preserved.
- Firestore26/43/16, parity129/129 with0 mismatch, syntax/source/cache integrity verified.

No production deploy. Evidence is actual-source behavioral/pixel fixture execution, not real staging/mobile/provider-HTTP acceptance. Historical aggregate freeze gates from latency phases are not rebaselined or declared PASS here. No financial architecture/latency patch or generic package QR redesign.

## 18 required answers

| # | Question | Exact answer |
| --- | --- | --- |
| 1 | Why M-codes appeared | Baseline Family memo policy selected compact ID first or FNV-1a(participantKey), so canonical memo itself contained opaque codes. |
| 2 | Which function generated them | app.js::_receiptFamilyTuitionMemo(breakdown). |
| 3 | Renderer defect? | NO. Renderer/URL/intent/QR all used the same opaque canonical memo. |
| 4 | Runtime function changed | Only _receiptFamilyTuitionMemo; app outside it identical. Index/main edits are cache URL bookkeeping. |
| 5 | finance.js changed? | NO. Exact baseline SHA f652c2d896180654cf8f1534a916cb7f44ebff3599251070b0ef74eb998c809b. |
| 6 | Exact image-case memo | GD NGAN KHANH HAI DANG HP T11 2026 |
| 7 | Character count | 34 ASCII characters. |
| 8 | Visible Nội dung CK exactly equals addInfo? | YES, direct equality assertion and raw capture. |
| 9 | Decoded provider memo exactly equal? | YES, independent PNG pixel decode plus existing EMV parser. |
| 10 | Decoded preview memo exactly equal? | YES, independent preview PNG decode plus existing EMV parser. |
| 11 | Same-name collisions | Expand human suffix to full normalized name; only identical normalized full names use name+ID or deterministic short suffix; selected/cache suffix collision DENY. |
| 12 | Normal success still hash-only? | NO. Every participant retains a human-readable token derived from studentName. |
| 13 | Increased40 cap? | NO; existing local invariant, not official VietQR maximum. |
| 14 | Relaxed QR verification? | NO; exact verifier/decoder outside changed function are byte-identical. |
| 15 | Generic QR behavior changed? | NO; all required generic QR regressions pass, including known generic long-memo fail-closed behavior. |
| 16 | Family debt/Finance changed? | NO; autofill53/53 and all required Finance/Debt checks GREEN, exact module/core hashes preserved. |
| 17 | Firestore counts changed? | NO; 26 / 43 / 16 both sides. |
| 18 | Root/public exact? | YES; 129 canonical pairs, 0 mismatch. |

## Handoff

Full ZIP contains runtime/mirrors, updated executable Family checker, 10 current reports, patch, raw/parsed evidence and SHA256SUMS.txt. Historical R1 reports/evidence remain under handoff/PARENT_FAMILY_COMBO_R1. Start with this file; do not interpret archived status as current R1.1 acceptance.

Rollback uses exact input ZIP ffd5a5...4447d4 for app/index/main and mirrors; no data migration or persistent memo reference exists to undo. Next testing can use the candidate's new cache token and verified non-production environment; do not treat fixture results as real-device financial latency evidence.

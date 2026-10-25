# A9R15R1 — Release ledger

Quyết định: **RELEASE_BLOCKED**. Runtime A9R15 không đổi. Không deploy, không ghi dữ liệu production.

| Gate | Trạng thái | Bằng chứng / phạm vi |
|---|---|---|
| SOURCE_IDENTITY | PASS | Exact parent ZIP SHA + CRC; 0 changed runtime assets — `baseline/INPUT_IDENTITY.json; A9R15R1_SHA256_MANIFEST.json` |
| QA_HARNESS | PASS | Original harnesses 61/61 and 73/73, native DOM oracle 11/11, NC1–NC5 detected — `A9R15R1_HARNESS_CLOSURE.json` |
| TRAINING_REGISTRATION_RUNTIME | PASS | 25 registration assertions + 27 browser cases + three pre-save races blocked with zero writes — `EXTRA_BROWSER_MATRIX.json; BROWSER_CORE.json` |
| TRAINING_REGISTRATION_REAL_DATA | ENV_BLOCKED | No authorized actual profile/shift dataset; all real counts null, never inferred zero — `A9R15R1_TRAINING_REGISTRATION_AUDIT.json` |
| COACH_AUTHORIZED_HISTORY_RUNTIME | PASS | Exact bounded query, multi-year/branch pagination, offline/server verification, stale drop — `A9R15R1_COACH_HISTORY_MATRIX.json` |
| COACH_HISTORY_INDEX_READINESS | ENV_BLOCKED | INDEX_ENV_BLOCKED; Emulator cannot prove compound index readiness on Cloud — `A9R15R1_FIRESTORE_QUERY_INDEX_RESULT.json` |
| COACH_BRANCH_ISOLATION | PASS | Server-authoritative assignment blocks forged local branch, cross-club and revoked assignment — `EXACT_RUNTIME_QUERY.json; Emulator raw log` |
| LEGACY_HISTORY_PROVENANCE | LIVE_NOT_VERIFIED | Raw legacy DENY tested; actual legacy cohort/Admin attestation completion unknown — `A9R15R1_COACH_HISTORY_MATRIX.json` |
| CAS | PASS | Absent create, update, stale CAS DENY, idempotency and physical legacy collision remain — `CAS_COLLISION.log; SDK10_BROWSER.json` |
| JOURNAL_V4 | PASS | Native IndexedDB, two tabs, legacy quarantine and pending intent preservation pass; no V3 promotion — `JOURNAL_NATIVE.json; NATIVE_BROWSER.json` |
| FIRESTORE_RULES | PASS | Byte-identical rules hash; 74 broad Rules cases and exact history query tests — `A9R15R1_EMULATOR_RESULTS.json` |
| FIRESTORE_INDEXES | PASS | File identity only: unchanged SHA; Cloud readiness is a separate ENV_BLOCKED gate — `A9R15R1_SHA256_MANIFEST.json` |
| FINANCE_SECURITY | PASS | Tuition/Debt/Inventory runtime bytes unchanged; Coach Finance/Inventory DENY gates remain — `regression/RESULTS.json; RUNTIME_PRESERVATION.log` |
| READS | RELEASE_BLOCKED | Measured R1–A15 delta 0, but required owner document-read cost approval absent; live billed reads unknown — `A9R15R1_READS_COMPARISON.json; B7 raw log` |
| LISTENER_BUDGET | PASS | 0 new history onSnapshot; total static 35 unchanged — `A9R15R1_READS_COMPARISON.json` |
| MOBILE | PASS | Actual Chromium mobile-sized DOM/layout + native IndexedDB pass; physical Android/Safari not accepted — `BROWSER_CORE.json; NATIVE_BROWSER.json; A9R14_MOBILE.log` |
| ROOT_PUBLIC | PASS | 129/129; missing 0, extras 0, mismatch 0; all match parent bytes — `A9R15R1_ROOT_PUBLIC_PARITY.json` |
| FULL_REGRESSION | PASS | npm check/check:all exit 0; 156 technical leaves PASS; 3 intentional release-policy leaves remain blocked — `REGRESSION_SUMMARY.json; regression/RESULTS.json` |
| PRODUCTION_ACCEPTANCE | RELEASE_BLOCKED | Real data, Cloud index, actual provenance, READS approval, physical devices and release owner approval incomplete — `A9R15R1_RELEASE_LEDGER.json` |

`FULL_REGRESSION = PASS` chỉ nói phần kiểm tra kỹ thuật đã thực thi. Ba executable policy gates vẫn trả exit 1, giữ nguyên trong package; quyết định release tổng thể vẫn bị chặn. `FIRESTORE_INDEXES = PASS` chỉ xác minh file không đổi, không chứng minh index Cloud đã sẵn sàng.

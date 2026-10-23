# A9R6 — QR memo long-period correction / S01 maintenance protection

**TEST ONLY — RELEASE_HOLD — NO_DEPLOY**.

Input: `QR_V11R6_A9R5R2_AUTH_FIRESTORE_REALM_TEST_ONLY_FULL_SOURCE.zip` (SHA-256 `e8ee883bf6bcbd9972f83cfce131bab687b40d628b4b7d8d61d5549ff2938c27`).

## Root cause and limits

- For `Lê Đào Đình Khôi` with periods `2026-09,2026-10`, original canonical `_receiptPaymentMemo()` returned `Le Dao Dinh Khoi Hoc Phi Thang T9 T10 2026` (exactly **42** ASCII characters), the same length as the reported runtime intent. The actual VietQR pixel audit reported `qrMemoLength=40`. This proves mismatch but **not** which two characters the external provider changed. Do not assert the provider has a 40-character limit; Quick Link documentation says maximum 50 characters.
- A9R6 conservatively compacts **only verbose tuition memos longer than 40 chars**. The specific example becomes `Le Dao Dinh Khoi HP Y2026M9M10` (full normalized name, year, months retained). Other short memos remain byte-identical. Unique period information is preserved, no truncation. Long cases which remain >40 are blocked with `MEMO_TOO_LONG`; invalid/duplicated periods in a needed compact memo are blocked with `MEMO_PERIOD_INVALID`.
- The **one canonical memo** is used both for the Quick Link request and for the immutable EMV-intent comparison and displayed transfer text. Both provider image pixels and final receipt preview pixels are checked; no QR mismatch is accepted.
- Adds PII-free `looksLikeTailTruncation` / `looksLikeHeadTruncation` to diagnostic classification. Neither classification authorizes QR.
- No new banking API, reader, writer, listener, Cloud Function, finance mutation, payment collection, account override, or Rules modification.

## Local tests completed

- A9R6 12/12 focused intent/EMV regression PASS.
- A9R6 2/2 end-to-end synthetic receipt cases PASS (real student name/period fixture and long-name fixture; provider and preview pixels, no financial writer).
- 109/109 V7 actual handler tests PASS; 16/16 V8 network tests PASS; 22/22 rendering/payment tests PASS.
- A9R6 sanitized forensic classifier 7/7 PASS; protected-boundary hash/parity 8/8 PASS.
- Syntax 276/276 PASS. Root/public byte parity 128/128 PASS.
- Coach Auth+ACL: prior user-supplied A9R5R2 Auth+Firestore Emulator result **9/9 PASS** (not re-run in this environment). `coachBranchRuntimeRepair.js` SHA-256 remains `3c5d5d7a95390ce8438552d48947b293a2878dd480c399c4964effce82012068`. `firestore.rules` SHA-256 remains `23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad`.
- Attendance Coach lock (`HISTORY_COACH_ACCESS=false`, Rules cutover=false) remains unchanged. S01/Journal history-level release acceptance is **NOT available** from local source alone.

## Gates still failing or blocked

1. **Real-provider proof:** Cannot fetch and decode original VietQR provider pixels in this environment; original observed mismatch was 42→40. The synthetic fixture verifies logic, not provider behavior. Live provider gate is **BLOCKED**.
2. **S01/Journal:** cannot certify pre-cutover historical records, server-side canonical marker, unresolved V1/V2, role/branch historical integrity, and owner approval from source-only tests. **HOLD** the coach attendance lock.
3. **Inherited app.js size gate:** `app.js` is over 700,000 bytes in the baseline and remains over in this candidate. This isolated QR fix also crosses the 11,300 line threshold. Both checks remain **FAIL**; no limits or assertions were relaxed.
4. **Source identity allowlist:** strict reviewed source pin was made for earlier A9 lineage. It rejects the new A9R6 hash until an independent review generates a new pin and full manifest. Do **not** bypass or change this check without an approved pin.
5. **Firebase Auth/Firestore emulator cannot run in current container without dependencies.** Previous A9R5R2 Emulator 9/9 is the inherited verified evidence, not a newly run A9R6 integration test.

## Windows isolated QA

Extract Full Source into `D:\A9R6\source`; open PowerShell:

```powershell
cd D:\A9R6\source
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R6-Offline.ps1
Compress-Archive -Path .\qa_results_a9r6\* -DestinationPath D:\A9R6\A9R6_OFFLINE_RESULTS.zip -Force
```

The local QA runner performs no production access and does not fetch VietQR. It uses a synthetic QR encoder for pixels; Python tooling used by the existing QR harness must be installed. The modified site is NOT isolated from the real Firebase project by localhost alone. **Do not log in with live credentials, create real HLV accounts, or run financial operations on A9R6 localhost.** A separate, approved Auth+Firestore emulator/staging setup is required for browser acceptance.

Provider-real acceptance: on an isolated, explicitly approved test account, record a sanitized `qrPixelAudit.fieldsMatch`, `memoTransform`, expected vs QR length, HTTP status, browser and exact result from final QR scan. Never share actual payment account, QR raw payload, URLs, credentials or student PII in logs. Check both `REPORT` and `PAID`, normal/multi-month/long-name/noncontiguous months, and provider and final downloaded image. Never silently accept a transformed memo.

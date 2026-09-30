# C1F QuickPay Root Cause Report

## Confirmed causes
1. **Secondary fee_audit on critical path** — `TuitionCommandBoundary.collectTuition()` awaited `addFeeAuditSilent()` after the canonical atomic commit but before local commit/result return. A slow audit could therefore delay the user-visible success and receipt although payment had already committed.
2. **Non-deterministic html2canvas loader** — `app.js::exportReceipt()` injected its own CDN `<script>` with no shared promise and no timeout.
3. **Receipt failure swallowed** — `exportReceipt()` caught errors and returned `undefined`; `quickPay()` could not distinguish receipt success from receipt failure.
4. **Shared receipt template race** — `#receiptTemplate` is mutated before async awaits. Deterministic schedule proof reproduced A→await→B mutation→A render observing B data.
5. **Legacy/canonical modal overlap** — `app.js` exposed a full `openQuickPayModal()` while its `quickPay` was intentionally a not-ready stub in module bootstrap.
6. **Mobile branch UX** — canonical `#filterBranch` existed only inside the mobile filter sheet, forcing an unnecessary “Bộ lọc” trigger.

## What was NOT found
- No evidence of a second primary QuickPay writer.
- No new Firestore read required to confirm a payment.
- No receipt collection/schema is needed.
- No need to modify Debt source-of-truth or paidUntil semantics.

# PHASE 4K-6V5U6H8R2.1C1F1A — Stale Duplicate Closure Report

## Root cause
C1F1 used an existing `inFlight` map plus `completedReplay` with `COMPLETED_REPLAY_TTL_MS = 30000`. That prevents concurrent/immediate replays, but after TTL eviction or a fresh page there was no canonical already-paid precondition before `FinanceService.commitAtomicWritePlan()`.

## Patch
- Kept `completedReplay` inside `TuitionCommandBoundary` as a bounded process-memory replay optimization only.
- Added Layer 2 through the existing canonical tuition/debt owner `TuitionDebtCanonical`:
  - `getTuitionMonthSettlement(profile, month, options)`
  - `areTuitionMonthsSettled(profile, months, options)`
- `collectTuition()` asks this canonical helper before the primary writer.
- If every target month is already canonically paid, the command returns:
  - `ok: true`
  - `alreadySettled: true`
  - `duplicatePrevented: true`
  - `primaryWritePerformed: false`
  - `txId: null` when no completed canonical result remains.
- No Firestore read is added. Current profile state comes from the existing canonical profile store.
- `skippedMonths` is explicitly **not** treated as paid, even when `paidUntil` is later.
- Legacy `paidUntil` without `paidMonths` remains supported by the canonical helper.
- Current custom-amount semantics are unchanged; C1F1A reuses the existing `paidMonths` selection calculated by `collectTuition()`.

## Memory/context safety
The completed replay registry now stores metadata (command key, club, profile, operation, normalized months, amount, txId, completion time), remains TTL/size bounded, and is lazily cleared when the verified auth/club context token changes. The registry is not payment truth.

## Dynamic evidence
- ID01 concurrent exact duplicate: one primary commit total.
- ID02 immediate sequential replay: zero additional commits.
- ID03 >30s replay: zero additional commits through canonical settled-state guard.
- ID04 completed-memory/context eviction: zero additional commits.
- ID05 fresh boundary with paid canonical profile: zero commits.
- ID06 different unpaid month: +1 legitimate commit.
- ID07 different student: +1 legitimate commit.
- ID08 different club: +1 legitimate commit.
- ID09 stale collect after receipt-failure-like scenario: zero additional commits.

Result: stale duplicate correctness no longer depends on the 30-second TTL.

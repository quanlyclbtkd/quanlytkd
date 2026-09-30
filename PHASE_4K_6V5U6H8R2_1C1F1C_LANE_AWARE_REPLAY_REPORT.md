# PHASE 4K-6V5U6H8R2.1C1F1C — LANE-AWARE REPLAY REPORT

## Root cause

Before F1C, `TuitionCommandBoundary._run()` inspected `completedReplay` before it invoked the command task. `collectTuition()` entered `_withProfileMutationLane(profileLaneKey, ...)` only inside that task. Therefore a completed QuickPay result could return immediately while a same-profile delete/reversal was already occupying the lane.

The same source also checked completed replay before exact `inFlight`. This did not create a second writer, but it blurred two distinct states: an identical mutation still executing versus a previously completed result whose validity can change during a later same-profile reversal.

## Patch

- Exact same-command `inFlight` lookup remains a fast path and is now evaluated before non-lane completed replay.
- `_run()` exposes a lane-safe `getCompletedReplay()` callback.
- Tuition collect sets `completedReplayAfterLane: true`.
- `collectTuition()` enters the existing `clubId|profileId` lane first, then checks completed replay, then re-resolves latest local canonical profile state/settlement.
- Completed replay results are not written back into the replay registry (`value.completedReplay !== true`).
- Delete/reversal continues using the same existing profile lane. No second queue/lane owner was created.

## Dynamic race results

| Case | Result | Primary payment delta |
|---|---|---:|
| Exact in-flight duplicate | Coalesced | total +1 |
| LR01 Collect → Delete pending → Collect | second Collect remained unresolved until delete lane released; delete success/unpaid then produced new tx | recollect +1 |
| LR02 Collect → Delete pending/fails → Collect | second Collect waited; after delete failure it reused still-valid tx-1 | +0 additional |
| LR03 Delete SUCCESS + reconcile FAIL + queued Collect | deleted tx replay invalidated; queued collect returned `alreadySettled=true`, `primaryWritePerformed=false`, `txId=null` | +0 additional |
| Different profiles | Allowed to overlap (`maxActive=2`) | independent |

## Scope

Same-runtime concurrency: **CLOSED** for the tested per-profile paths.

Cross-device concurrency: **OUT OF SCOPE / NOT VERIFIED**. The lane is client-process memory and is not a distributed lock.

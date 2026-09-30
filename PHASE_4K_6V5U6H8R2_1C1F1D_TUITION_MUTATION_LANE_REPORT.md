# F1D — TUITION-AFFECTING MUTATION LANE CLOSURE

Existing owner remains `TuitionCommandBoundary.profileMutationLanes`, key `clubId|profileId`.

A narrow coordination API now reuses that exact Map:
- `runInProfileTuitionMutationLane()`
- `runInProfileTuitionMutationLanes()` (sorted unique same-owner lanes for family combo; no global mutex)

Reachable tuition-state mutations coordinated with the lane:
- QuickPay collect — already in lane.
- Pure Tuition delete/reversal — already in lane.
- StudentStatus `addSkippedMonth/removeSkippedMonth` — now in same lane.
- Generic profile update only when payload contains `paidUntil/paidMonths/skippedMonths` — same lane.
- Canonical Finance transaction-form tuition write — same lane.
- Canonical family combo tuition write — same existing lanes for affected profiles.
- Any future allowed generic delete that actually reconciles Tuition — the whole generic delete->reconcile operation is coordinated by the same lane.

Dynamic TM results: collect waits pending same-profile generic mutation; generic mutation waits pending same-profile collect; different profiles overlap; rejected lane operation does not poison the lane. Pure Tuition delete is not externally wrapped, avoiding nested-lane deadlock.

Same-runtime concurrency: CLOSED in tested scope. Cross-device concurrency: OUT OF SCOPE / NOT VERIFIED.

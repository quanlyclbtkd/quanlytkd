# Legacy No-Shift Historical Evidence Contract

For **Admin past-day historical reopen only**, the read remains one logical Firestore query but does not server-filter by `shiftId`. Returned valid historical rows are classified in RAM:

1. `SELECTED_SHIFT_ROW` — explicit `row.shiftId == selectedShift`; may populate the editable historical grid/CAS base.
2. `OTHER_EXPLICIT_SHIFT_ROW` — explicit different shift; not applied to selected grid.
3. `LEGACY_UNASSIGNED_SHIFT_ROW` — missing/empty shift; read-only historical evidence only.

A legacy unassigned row is never guessed into S1/S2, never enters editable maps, CAS base, intent generation, offline queue or bulk mutation. Reading it produces no write. `status=0` tombstones are excluded from the evidence warning.

Today operational attendance and all Coach reads retain the existing exact selected-shift query.

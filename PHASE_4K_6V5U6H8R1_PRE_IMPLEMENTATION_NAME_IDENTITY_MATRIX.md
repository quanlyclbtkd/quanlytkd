# PHASE 4K-6V5U6H8R1 — PRE-IMPLEMENTATION NAME / IDENTITY MATRIX

Scope: referential-safe student display-name edit only. Audit performed before source patching.

| File | Function / use point | Current value | Classification | Planned change | Firestore read impact | Firestore write impact | Listener impact | Regression risk |
|---|---|---|---|---|---:|---:|---:|---|
| `js/modules/students.js` | `openProfile(name)` | `name` is profile map key/doc ID and is copied into both `m_old_name` and `m_name_input` | IDENTITY + DISPLAY mixed | Keep `m_old_name=profileKey`; resolve editable `m_name_input` from canonical display resolver | 0 | 0 | 0 | Medium |
| `js/modules/students.js` | `updateProfile()` | `oldName/newName` are treated as possible document rename | IDENTITY + DISPLAY mixed | Split `profileKey` and `requestedDisplayName`; write `displayName`; canonical command receives same key on both sides | 0 | Same existing profile write | 0 | High |
| `js/modules/students.js` | rename transaction lookup branch | `findTransactionsByStudent(oldName)` + `txUpdates` | LEGACY RENAME | Remove from production update flow; keep legacy service API unreachable from display edit | -1 possible path removed | Removes bulk history rewrite path | 0 | High, improved |
| `js/services/students.service.js` | `updateProfile(name,data)` | `name` is profile document ID | IDENTITY | No semantic change | 0 | Same `setDoc(...,{merge:true})` | 0 | Low |
| `js/services/students.service.js` | `renameWithBatch()` | Creates new profile doc, deletes old, rewrites transaction descriptions | LEGACY IDENTITY RENAME | Retain API for compatibility; assert UI display edit never calls it | 0 | No call from R1 UI | 0 | High if re-enabled |
| `js/core/studentStatusCommandBoundary.js` | `updateProfile({oldName,newName})` | Different keys invoke `renameWithBatch` | IDENTITY | No authority rewrite; R1 caller must pass `oldName===newName===profileKey` | 0 | Same canonical single profile writer | 0 | Low |
| `js/core/profileCanonicalStore.js` | `_displayName(raw,key)` | Prefers `name/fullName/studentName` before `displayName` | DISPLAY | Add one pure `resolveDisplayName(profileKey,profile)` preferring `displayName`; reuse internally | 0 | 0 | 0 | Low |
| `app.js` | `buildStudentSearchIndex(profile,name)` | Uses doc key before profile name | DISPLAY SEARCH | Build `searchName` from displayName → legacy name fields → profileKey | 0 | Same fields in same canonical write | 0 | Medium |
| `js/core/studentSearchIndex.js` | `_studentNameFromEntry(id,profile)` | Prefers legacy name fields; ignores `displayName` | DISPLAY SEARCH | Prefer `displayName`; preserve `id/profileKey` in token blob | 0 | 0 | 0 | Low |
| `js/core/studentSearchIndex.js` | `_buildTokens(id,profile)` | Contains id + legacy fields but not explicit `displayName` | IDENTITY + DISPLAY SEARCH | Include `profile.displayName` and keep `id` token | 0 | 0 | 0 | Low |
| `js/ui/render/computation/studentsRenderer.js` | `renderActiveRow` | Renders `_disp(name)` | DISPLAY | Resolve label from profile; keep `data-student-id` and handlers on profileKey | 0 | 0 | 0 | Low |
| `js/ui/render/computation/studentsRenderer.js` | `renderDebtRow` | Renders `_disp(name)`; actions pass `name` | DISPLAY + IDENTITY | Display resolver for label only; all debt/payment/quit/skip actions retain profileKey | 0 | 0 | 0 | Medium |
| `js/ui/render/computation/studentsRenderer.js` | `renderQuitRow` | Has display helper but precedence is legacy-first | DISPLAY + IDENTITY | Change helper precedence; retain profileKey action args | 0 | 0 | 0 | Low |
| `js/ui/render/renderStudents.js` | direct quit rows | Display helper legacy-first; onclick uses id | DISPLAY + IDENTITY | Prefer `displayName`; keep id for actions | 0 | 0 | 0 | Low |
| `js/modules/attendance.js` | Daily cards / `currentAttendanceData[name]` / `getAttendanceDocId(name,...)` | `name` is profileKey identity, rendered directly with suffix stripping | IDENTITY + DISPLAY | Keep every key/doc/action unchanged; resolve card label only from current RAM profile | 0 | 0 | 0 | High if mixed |
| `js/modules/attendance.js` | Monthly rows / history modal | `r.name` is historical grouping key and visible label | IDENTITY + DISPLAY | Keep grouping/action token as `r.name`; resolve visible label from `_profiles()[r.name]` | 0 | 0 | 0 | Medium |
| `js/services/attendance.service.js` | queries / profileId matching | `profileId` exact identity | IDENTITY | No change | 0 | 0 | 0 | Critical if changed — untouched |
| `js/core/tuitionDebtCanonical.js` | profile/tx matching | Uses profile identity + legacy name fallbacks | IDENTITY MATCHING | No writer/read authority change in R1; exact identity remains strongest path | 0 | 0 | 0 | High if broadened — untouched |
| `js/core/tuitionCommandBoundary.js` | tuition write owner | existing canonical writer | IDENTITY / FINANCE AUTHORITY | No change | 0 | 0 | 0 | Critical — untouched |
| `js/modules/finance.js` | payment/debt UI | current action identities are existing profile key/name | IDENTITY + DISPLAY depending renderer | No new reader/writer; rely on student/debt renderer display boundary for R1 | 0 | 0 | 0 | Medium |
| `js/modules/reports.js` | historical transaction reports | historical labels are transaction snapshots/descriptions | HISTORICAL DISPLAY SNAPSHOT | No migration / no bulk rewrite | 0 | 0 | 0 | Low |
| `js/modules/searchRuntime.js` | student search dispatch | consumes `StudentSearchIndex` | DISPLAY SEARCH + IDENTITY TOKEN | No read-flow change; updated in-memory index supplies new displayName and old key token | 0 | 0 | 0 | Low |
| receipt/export helpers | historical receipts/exports | transaction/profile supplied names | HISTORICAL DISPLAY / IDENTITY | No history rewrite; future profile-driven views may display current displayName only where RAM profile exists | 0 | 0 | 0 | Medium |
| inventory identity store | `profileId -> memberId -> normalized name` | explicit profileId strongest | IDENTITY MATCHING | No change; profileKey remains stable so inventory links survive | 0 | 0 | 0 | Low |

## Audit conclusion

No unresolved ambiguous use requires a stop before implementation. The high-risk mixed sites are `students.updateProfile` and Attendance rendering; both have a safe boundary because the immutable profile map key is already available separately from profile data. H8R1 therefore can be implemented without new Firestore reads/listeners, Rules changes, schema migration, Attendance doc-ID migration, or transaction-history rewrite.

# 05 — Exam search design

One canonical input: #searchInput. No Exam-specific persistent search state, input, autocomplete, matcher engine, debounce subsystem or Firestore path.

When input is blank/whitespace, existing active + selected current belt predicate, per-row payment actions, .exam-check, sorting and newly-upgraded separator stay unchanged. The checker compares full generated blank-roster HTML against the immutable baseline and gets byte equality.

When text is present, the existing window.StudentSearchIndex searches the current hydrated profile set in mode all, without the active-tab pagination/branch filters. Its returned canonical entry IDs form an ephemeral match set. The limit covers the loaded profile count instead of the index's default first 100. The renderer then applies its unchanged canonical active-status decision. Paid and unpaid profiles remain visible; quit/inactive remain excluded.

The index retains its original Vietnamese normalization, phone/parent/contact/guardian fields, member/student/VTF codes, belt fields and scoring. Index code is frozen. Existing studentMatchesSearch is the first unavailable-index fallback, with current display name included through that existing helper; normalizeVNForSearch is the final helper fallback. There is no new normalizer.

Discovery and upgrade authority stay separate. For each displayed row, upgradeEligible is the original current-belt/default-white comparison with exam_filter_belt. Only an eligible row gets .exam-check. Off-belt rows retain identification, current belt, paid/unpaid and existing collect/cancel/profile callbacks, but cannot enter toggleAllExam/selectPaidStudents selection. processBatchUpgrade and its defensive current-belt check remain byte-identical.

Active search suppresses the selected-belt newly-upgraded separator while retaining the row-level ↑ Mới lên badge. Empty search results use a search-specific static message. The untrusted term is never interpolated into HTML, JS handlers or selectors; existing profile-key escaping/encoding stays unchanged.

The existing rAF owner coalesces rapid input and checks the active tab again before DOM work. Render reads current input at execution, so latest text wins. No renderInvalidation or tabs.js changes, server fallback, profile mutation, new Finance writer or extra Firestore call is introduced.

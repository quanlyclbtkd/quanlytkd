# 02 — Exam search current path and proven RED

Canonical #searchInput is bound once by searchRuntime.js. On baseline, `_dispatchSearchV2` has no exam route. The one-character `_runLocalOnlySearch` has no exam route either; clear goes through invalidateCurrentTab. That mapping owns Finance's examExpenseList, not the student roster.

Baseline renderExamList reads allProfiles, selected exam_filter_belt, filterMonth and canonical paid ledger, but never uses searchInput. Actual-source behavioral tests reproduce unchanged roster after entering search and failure to discover a matching active student from another belt.

The repair imports requestExamUiRefresh from the existing exam.listeners.js using exactly the same unversioned module URL as tabs.js. It adds no listener or scheduler. The private `_triggerExamRender` remains byte-identical; search requests explicitly bypass Profile-authority-token dedupe. Three search states now route to this owner: one character, 2+ characters, and clear. Hydrated Exam uses the existing fast delay class; other tabs' timing is unchanged.

Current tab entry already mounts the same Exam owner, so renderExamList consumes an existing populated input without a new keystroke or tabs.js replay. Both tabs.js and renderInvalidation.js are frozen. Module graph audit finds no path from exam.listeners back to searchRuntime and no new import cycle.

Blank search preserves the selected-belt roster and existing alphabetical/newly-upgraded grouping byte-for-byte in the actual-source fixture. Search-active mode uses StudentSearchIndex only as the RAM matcher, renders matching active profiles from every belt, and retains existing presentation ordering. No complex ranking is added.

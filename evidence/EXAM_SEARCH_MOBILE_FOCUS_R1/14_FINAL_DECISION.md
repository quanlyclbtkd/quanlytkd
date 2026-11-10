# 14 — Final decision

**BROWSER_FOCUS_PROOF_ENV_BLOCKED**

Candidate implementation and offline behavior are GREEN; the full phase is not accepted because mandatory native Chromium proof is incomplete. Do not label this PASS_EXAM_SEARCH_MOBILE_FOCUS_R1 or PASS WITH NOTES.

| Area | Result |
|---|---|
| Exact input identity | VERIFIED |
| Baseline protected gates | 16/16 GREEN |
| Baseline phase behavior | RED reproduced on immutable source: 22 PASS / 66 RED |
| Candidate search + focus behavioral checker | 88/88 PASS; synthetic DOM/IO guards |
| Candidate protected gates | 16/16 GREEN |
| Blank roster, paid ledger, callback identity, upgrade guard | PRESERVED |
| Wrong-belt upgrade selectable rows | NONE in search fixtures |
| Canonical/fallback/inline focus ordering | GREEN in actual-source synthetic tests |
| Native Chromium focus and warning absence | NOT VERIFIED — environment blocked |
| Firestore budget | 24/43/16 unchanged |
| Root/public | 129/129; 0 mismatch |
| Finance writer / Exam upgrade implementation | UNCHANGED |

Only the six approved runtime files and their mirrors changed. No Finance/Debt/Inventory/Attendance/QR refactor, new Firestore owner, new package/dependency, production deploy or staging transaction was performed. Search uses one existing input/index/scheduler. Upgrade eligibility stays exclusively with the existing selected-belt predicate and writer guard.

Local Chromium failed at socket() creation. The cloud browser could not load the local fixture and rejected the file: URL by policy; no workaround was attempted. Those are environment limitations, not a Finance/Exam business RED and not evidence that the reported warning is gone.

Next step is narrowly scoped: rerun the included existing-Playwright browser harness in a Chromium-capable test environment. It exercises actual menu source and markup with isolated navigation/action adapters, blocks external requests, checks focus-before-hide/inert/expanded/body state, and captures matching native warnings. It does not initialize Firebase or exercise full SPA/staging navigation.

From source/: `node tools/exam-search-mobile-focus-r1/browser.mjs . evidence/EXAM_SEARCH_MOBILE_FOCUS_R1/browser-rerun.json`. Uses locked Playwright 1.62.1. Optional third/fourth arguments select an already-installed Playwright module directory and Chromium executable. Do not add or upgrade a browser library, weaken browser policy, or rewrite business code for this check.

Review the resulting native evidence before changing phase status. No automatic Finance latency, Inventory smoke, S0 provisioning, R2.3 or unrelated follow-up is started. This ZIP is a full source test candidate with an explicit browser acceptance blocker, not a production-ready release.

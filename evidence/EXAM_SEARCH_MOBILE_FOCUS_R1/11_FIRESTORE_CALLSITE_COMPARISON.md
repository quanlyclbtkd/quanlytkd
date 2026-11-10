# 11 — Firestore call-site and owner comparison

| Production call-site kind | Baseline | Candidate | Delta |
|---|---:|---:|---:|
| getDoc | 24 | 24 | 0 |
| getDocs | 43 | 43 | 0 |
| onSnapshot | 16 | 16 | 0 |

Uses the accepted scoped source-line call-site convention: app.js + js/, excludes mirrors, tools, migrations/diagnostics and comment-only lines. Counts are not billing telemetry.

New search requests the existing Exam rAF scheduler directly; it never mounts a new listener. That scheduler reads current RAM profiles/transactions through the existing renderer and canonical ledger. StudentSearchIndex and its authority/version logic are frozen. Search term is not financial evidence and does not trigger a financial writer.

Actual-source behavioral fixtures guard SDK access with a throwing proxy: no SDK call occurred. Financial action tests use spies to verify existing canonical-key callbacks exactly once; no real payment was executed. All Finance/business implementations outside the Exam presentation assignment are byte-identical. No new read/write/listener/transaction authority was added.

Static topology and read-only call graph support zero new IO for this local search change. No staging/billing/performance benchmark is claimed. FIRESTORE_BILLING_NOT_MEASURED.

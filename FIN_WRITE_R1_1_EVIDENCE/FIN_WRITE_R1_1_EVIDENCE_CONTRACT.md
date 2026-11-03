# FIN_WRITE_R1_1_EVIDENCE_CONTRACT

## Negative evidence contract
`PARTIAL RAM ABSENCE` never authorizes a new tuition/exam write or a tuition profile regression. A negative decision is usable only when either strict current coverage is complete for the captured club/month/readMode/epoch/auth context, or a lazy server-complete evidence request succeeds.

## Server-complete predicate
- every required semantic source paginates to exhaustion;
- every page has metadata;
- every page has `fromCache === false`;
- every page has `hasPendingWrites === false`;
- canonical mode uses `accountingMonths array-contains month`;
- legacy mode covers `txMonth`, date range and `packageMonths`;
- rows are deduplicated by transaction id;
- captured club, uid, auth generation, session epoch, month and readMode remain current;
- UI search, selected branch and table pagination never narrow evidence.

Positive matching RAM evidence may conservatively block a write without a complete read. Complete evidence is single-flight only for the scoped in-flight request; it is not a new cache/ledger authority.

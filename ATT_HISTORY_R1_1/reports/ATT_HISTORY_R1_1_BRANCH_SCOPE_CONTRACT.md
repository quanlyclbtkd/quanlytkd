# R1.1 Branch Scope Contract

Three semantic states are distinct:

- **NO_EXPLICIT_SCOPE** — normal Admin/SuperAdmin member history; all recorded historical branches for that stable profile key.
- **EXPLICIT_BRANCH_SCOPE** — a caller explicitly supplies a historical branch (for example Monthly row); Admin may use canonical historical equivalence such as CS1 ≈ legacy `Mặc định` where the existing contract supports it.
- **ROLE_FORCED_SCOPE** — Coach; canonical assigned branch only, current authority only. Caller arguments cannot broaden it.

Core invariant: `CURRENT DAILY BRANCH != MEMBER LIFETIME HISTORY SCOPE`.

Quarter and all-time history must reuse the same captured scope. Pagination must not consult DOM selectors after modal open. Changing profile, branch scope, authority scope, club, role or session invalidates the old cursor/request context.

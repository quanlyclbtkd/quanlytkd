# Attendance Historical Read Policy R1

Two independent dimensions are now explicit:

- **Consistency**: `SERVER_REQUIRED` vs `CACHE_ALLOWED`.
- **Authority scope**: `RECORDED` vs `CURRENT_AUTHORITY_ONLY`.

Compatibility `verified:true` means only **SERVER_REQUIRED**.

## Role forcing

- Coach: always `SERVER_REQUIRED + CURRENT_AUTHORITY_ONLY + server-authoritative assigned branch`; caller cannot broaden to RECORDED/ALL_BRANCHES.
- Admin/SuperAdmin normal historical business view: `SERVER_REQUIRED + RECORDED`, tenant/current club only.
- Explicit verified-only Admin view: `SERVER_REQUIRED + CURRENT_AUTHORITY_ONLY`.

## Trust

`historyAuthority == attendance-history-1aedda93-9437-4132-9694-35c2e6234d55` => `CURRENT_AUTHORITY`; missing/older/non-current marker => `LEGACY_HISTORY`.
Legacy is visible to Admin but is **not promoted**, persisted, auto-attested, or called verified.

## Server/session invariants

SERVER_REQUIRED retains uid/club/role/session/auth-generation/assignment guards and requires `fromCache == false` and `hasPendingWrites == false` before finality.

# PHASE 4K-6V5U6H8R2.1C1E — FINAL STATUS

## Overall status

**STATIC/UI SOURCE CLOSURE: PASS**  
**AUTHENTICATED RELEASE EVIDENCE: BLOCKED / NOT EXECUTED**  
**PHASE C1E: NOT CLOSED**

C1E must not be labeled FULL PASS because Admin/Coach/SuperAdmin/Access-Blocked authenticated browser acceptance and runtime error measurement were not executed, and Rules Emulator R1–R11 is blocked by environment toolchain/network constraints.

## Required 21 answers

1. **Root cause Search/Icon lệch:** desktop/tablet absolute icon lacked explicit vertical centering; emoji line-box geometry was not deterministic. Fixed with a fixed flex icon box + `top:50%/translateY(-50%)`, normalized input line-height.
2. **Production files changed:** `index.html`, `css/ui-mobile-shell.css`. Tooling: `package.json`, new `tools/check-h8r2-1c1e-ui-precision.mjs`. `public/**` regenerated through the canonical build.
3. **Debt layout:** before `Search/Filter → Debt header/actions`; after `Debt header/actions + KPI → Search/Filter → Debt local filter → list`.
4. **Zalo handler:** preserved exactly as `openBulkZaloModal()`; one existing button, no wrapper listener added.
5. **Group Invoice handler:** preserved exactly as `openComboModal()`; one existing Debt button, no wrapper listener added.
6. **Tuition compact:** reduced panel padding/gap/heading spacing and changed the 3 existing mobile action buttons from three full-width rows to a 3-column compact grid while keeping 44px minimum touch height.
7. **Business logic changed:** **No**. `app.js` and all `js/**` production logic are unchanged.
8. **Firestore budget:** **29/51/16 → 29/51/16**.
9. **`check:all`:** **PASS, exit 0**.
10. **Release gate:** **PASS**, Release 36/36 and wired C1D 16/16, non-recursive.
11. **Root/Public parity:** **PASS 124/124**, 0 missing/extra/hash mismatch.
12. **Rules Emulator R1–R11:** **BLOCKED BY ENVIRONMENT**, not executed. Java exists; Firebase CLI install failed due `EAI_AGAIN` DNS/network and no usable local/global CLI.
13. **Admin authenticated runtime:** **NOT EXECUTED**.
14. **Coach authenticated runtime:** **NOT EXECUTED**.
15. **SuperAdmin authenticated runtime:** **NOT EXECUTED**.
16. **Access Blocked authenticated runtime:** **NOT EXECUTED**.
17. **320/360/390/430/768/1024:** authenticated acceptance **NOT EXECUTED**. Supplementary Chromium CSS/DOM presentation smoke passed search centering/order/overflow at all six widths, with 0px document overflow.
18. **Console/runtime errors:** authenticated count **NOT MEASURED**; must not be reported as zero.
19. **Overflow:** supplementary real-browser presentation smoke measured **0px document overflow** at 320/360/390/430/768/1024. Authenticated runtime overflow remains unverified.
20. **P0/P1 remaining:** no P0/P1 source/static regression was found. Overall runtime P0/P1 cannot be asserted zero until authenticated acceptance is executed.
21. **Enough to CLOSE H8R2.1C1E:** **No**. Static/UI changes are clean, but the phase’s mandatory runtime and Rules evidence is incomplete.

## Release blockers remaining

1. A usable Firebase CLI / emulator environment to execute R1–R11.
2. An actual deployed/local candidate accessible to a browser.
3. Authenticated sessions for Admin, Coach, SuperAdmin and Access-Blocked contexts.
4. Runtime M01–M32 evidence including error budget, direct unauthorized tab attempts, More/scroll-lock cycles and Firestore network observation.

## Next valid action

Run the C1E candidate in an environment with Firebase CLI/network access and real test accounts/sessions, complete R1–R11 and M01–M32, and only then change C1E from NOT CLOSED to FULL PASS. Do not begin C2 before that closure.

# PHASE 4K-6V5U6H8R2.1C1E1 — FINAL STATUS

## Decision

**C1E1 = NOT CLOSED.**

The source/UI/static/release portion is complete and PASS. The phase cannot be declared FULL PASS because authenticated M01–M32 did not execute on a deployed C1E1 candidate. Rules R1–R11 are separately BLOCKED BY ENVIRONMENT with direct CLI evidence.

## Required final answers

1. **Root cause search icon lệch là gì?**  
   Transform-based emoji centering (`top:50% + translateY(-50%)`) left the visible glyph dependent on line-box/font rendering even though the wrapper was correct.

2. **Đã sửa file nào?**  
   Production runtime: `index.html`, `css/ui-mobile-shell.css` only (mirrored to `/public`). Tooling: `package.json`, `tools/check-h8r2-1c1e-ui-precision.mjs`. Reports/hashes added.

3. **Search icon đã được sửa bằng cách nào?**  
   One existing icon is box-anchored inside the relative wrapper with `top:0`, `bottom:0`, `margin-block:auto`, fixed 20×20 geometry; input padding remains 40px. No Search handler/state changed.

4. **Nút menu góc phải mobile được xử lý thế nào?**  
   The app-bar `.mhb-menu-btn` is hidden on <=767px by CSS. Bottom Nav `Khác` remains the sole mobile More presentation trigger.

5. **Tại sao được phép ẩn nó trên mobile?**  
   It calls the same canonical `openMobileMenu()` as `#mobileNavMore`; hiding only the duplicate presentation trigger removes a duplicate path without changing the More owner or desktop logic.

6. **transactionForm blank shell được xử lý thế nào?**  
   The form remains in DOM with all IDs/controls/handlers. A semantic attribute plus conditional `:has()` rule hides only the empty shell when no direct canonical child is visible; any legitimate visible child makes the shell render again.

7. **Có business logic nào thay đổi không?**  
   No. `app.js`, all `js/**`, services/listeners/core, Tuition Command, Debt authority, paidUntil, Quit authority, Rules and Firebase config are unchanged.

8. **Firestore budget trước/sau?**  
   29/51/16 → 29/51/16.

9. **check:all kết quả?**  
   PASS, exit 0. `check` and `check:all:critical` also PASS exit 0.

10. **check:release có chạy C1D + C1E UI gate chưa?**  
    Yes. Release 36/36 PASS, then C1D 16/16 PASS, then C1E UI 23/23 PASS. Each child executed once.

11. **Có recursion không?**  
    No. Neither child gate invokes `check:release`; execution count is exactly 1 each.

12. **root/public parity?**  
    PASS 124/124, missing 0, extra 0, hash mismatch 0.

13. **Admin runtime?**  
    NOT EXECUTED authenticated.

14. **Coach runtime?**  
    NOT EXECUTED authenticated.

15. **SuperAdmin runtime?**  
    NOT EXECUTED authenticated.

16. **Access Blocked runtime?**  
    NOT EXECUTED authenticated.

17. **M01–M32 kết quả?**  
    0 PASS / 0 FAIL / 32 NOT EXECUTED because no deployable/authenticated candidate session is available in this environment.

18. **Rules R1–R11?**  
    BLOCKED BY ENVIRONMENT. Canonical command exits 127 with `firebase: not found`; Java/config exist but Firebase CLI cannot be formed here.

19. **Console/runtime error budget?**  
    NOT MEASURED authenticated; intentionally not reported as zero.

20. **Có P0/P1 nào còn lại không?**  
    No known P0/P1 source/static defect is exposed by the completed gates. Two release-evidence blockers remain: authenticated deployed runtime evidence and Rules Emulator environment availability.

21. **Có đủ điều kiện CLOSE C1E1 không?**  
    **No.** Static/source/release closure is PASS, but authenticated M01–M32 must actually run before CLOSE. Rules R1–R11 may remain BLOCKED only if accepted by the release procedure with the documented environment evidence; they are not PASS.

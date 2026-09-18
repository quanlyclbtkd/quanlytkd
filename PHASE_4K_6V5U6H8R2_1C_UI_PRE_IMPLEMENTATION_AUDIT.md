# PHASE 4K-6V5U6H8R2.1C — UI PRE-IMPLEMENTATION AUDIT

## Baseline

- Input: H8R2.1A Boot + Quick Exam Regression Hotfix.
- Browser-loaded stylesheets, in order: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap`, `./css/tailwind-static.css?v=tailwind-static-build-20260608`. `style.css` exists but is **not loaded** and is therefore not a CSS authority.
- Inline `<style>` blocks: 1. Inline `<style>` `!important` count: 365.
- Inline `style=""` elements: 513.
- DOM IDs: 513 (513 unique); duplicate IDs: none.
- Event attributes: {'onsubmit': 2, 'oninput': 9, 'onclick': 100, 'onchange': 30}.
- Baseline gates before UI edits: Runtime Stability 29/29 PASS; Long-Term/Residual 39/39 PASS; Profile Display Name 28/28 PASS.
- Firestore baseline: getDoc=29, getDocs=51, onSnapshot=16.

## CSS source-of-truth map

1. `css/tailwind-static.css` — local utility layer, loaded first.
2. Inline `<style>` in `index.html` — current dominant custom UI layer. It includes desktop, mobile, modal, card-conversion, and many historical overrides.
3. `style.css` — not browser-loaded; **must not be linked merely because it exists**.
4. H8R2.1C plan: one new presentation-only canonical layer `css/ui-mobile-shell.css`, loaded once after the current inline style. No new `!important`.

## Major defects

| ID | Screen/module | Viewport | Current UI | Problem | Severity | DOM owner | CSS owner | JS interaction owner | Planned UI change | Data-flow / Firestore / business impact | Risk / rollback |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| UI-01 | Global shell | 320–430 | Mobile header + KPI strip + legacy tab strip + filters stack | Excessive vertical chrome; first task content pushed down | U1 | `index.html` `mainApp` | inline style | existing header sync only | compact top app bar, hide KPI strip on mobile, bottom nav | zero / zero / zero | CSS-only rollback |
| UI-02 | Navigation | 320–430 | 9 horizontal pills | horizontal navigation requires scanning/scrolling; touch density | U1 | `mainTabsWrapper` | inline style | `switchTab()` | keep DOM for desktop; hide strip only <=767; add 5-item bottom presentation calling existing `switchTab()` | zero / zero / zero | remove shell markup/CSS |
| UI-03 | More/actions | 320–430 | Existing mobile sheet contains utilities only | secondary modules not reachable from new 5-item nav unless duplicated flow | U1 | `mobileMenuSheet` | inline style | `openMobileMenu/closeMobileMenu`, `switchTab` | reuse existing sheet and add tab buttons that invoke `switchTab` | zero / zero / zero | remove added buttons |
| UI-04 | Global filters | 320–430 | month + branch + search in 2/3 rows | high vertical cost, tiny labels | U1 | `filterArea` | Tailwind + inline | existing change/input handlers | compact search-first row; retain existing controls/IDs and event paths; no duplicate loader | zero / zero / zero | CSS-only presentation rollback |
| UI-05 | Students/Debt/Tx/Quit | 320–430 | legacy table-to-card rules depend heavily on `nth-child`, many 0.60–0.68rem labels/buttons | fragile semantics and undersized text/touch targets | U1 | existing renderers/tables | inline mobile rules | existing row actions | H8R2.1C layer improves card typography/touch targets; semantic classes only where low-risk | zero / zero / zero | CSS/class rollback |
| UI-06 | Modals | 320–430 | mixed `.modal` plus many inline fixed overlays | inconsistent padding/radius/footer; some 28px close targets | U1 | existing modal IDs | inline + inline attributes | existing open/close handlers | standard mobile bottom-sheet visual treatment via selectors/classes, keep IDs/handlers | zero / zero / zero | CSS rollback |
| UI-07 | Accessibility | all mobile | viewport disables zoom; icon buttons lack accessible names in shell/menu | pinch zoom blocked; some touch targets <44px | U0/U1 | `index.html` | meta + CSS | none | viewport-fit only, aria-label shell controls, >=44px targets, inputs >=16px | zero / zero / zero | direct attribute/CSS rollback |
| UI-08 | Safe area | mobile | body has generic bottom padding; no fixed bottom navigation yet | future bottom nav could cover last actions | U1 | `body/mainApp` | inline | none | shell tokenized bottom content padding + safe-area | zero / zero / zero | CSS rollback |
| UI-09 | Desktop preservation | >=768 | current desktop tab/header is functional | mobile redesign must not leak into desktop | U0 | existing desktop DOM | Tailwind/inline | `switchTab` | all shell presentation scoped to `max-width:767px`, desktop nav retained | zero / zero / zero | media-query rollback |
| UI-10 | CSS ownership | all | historical override chains and 372 inline `!important` | hard to reason about touched selectors | U2 | index inline CSS | inline | none | no mass cleanup; H8R2.1C owns only named shell selectors in one file and adds 0 `!important` | zero / zero / zero | delete one stylesheet |

## Viewport baseline risk matrix (static source audit)

| Viewport | Horizontal overflow | Header stack | Touch target | Modal risk | Bottom safe-area |
|---:|---|---|---|---|---|
| 320×568 | high risk from tab strip/table legacy | excessive | multiple <44px | medium/high | incomplete for fixed nav |
| 360×800 | medium | excessive | multiple <44px | medium | incomplete |
| 375×812 | medium | excessive | multiple <44px | medium | incomplete |
| 390×844 | medium | excessive | multiple <44px | medium | incomplete |
| 412×915 | lower but present | excessive | multiple <44px | medium | incomplete |
| 430×932 | lower but present | excessive | multiple <44px | medium | incomplete |
| 768×1024 | desktop/tablet boundary currently stable | normal | acceptable | desktop dialog | n/a |
| 1366×768 | stable baseline | normal | desktop | desktop | n/a |
| 1920×1080 | stable baseline | normal | desktop | desktop | n/a |

Browser screenshot testing is possible with installed Chromium, but authenticated module screenshots require a live authenticated runtime; source-phase screenshots can only validate unauthenticated/static shell unless test state is injected.

## Stop-condition assessment

No audited UI change requires a new Firestore reader/writer/listener, router, business store, cache, scheduler, polling loop, Rules change, Cloud Function, or data migration. Implementation may proceed as presentation-only.

# 06 — Mobile focus design

Canonical module, emergency fallback and inline rollback each keep a private opener reference; no new global manager or dialog library. Only a connected, enabled, outside-sheet trigger matching [aria-controls="mobileMenuSheet"] is captured. Repeated open from inside the sheet retains the actual valid opener. A close clears the stored reference, including missing-sheet or failed-close paths.

Open removes inert before exposing the sheet, preserves existing role/action visibility, expands all current triggers and locks body scroll. It adds no focus trap, heading focus or new key listener.

Close first checks current activeElement. If it is inside, it tries the actual opener, then connected enabled visible/focusable matching triggers. Each attempt verifies that focus actually left. If still inside, it blurs the current descendant and verifies again. If focus cannot leave, it returns false and keeps the dialog exposed rather than applying aria-hidden to focused content.

Only after focus is outside does close remove .open, set aria-hidden=true and inert, reset all aria-expanded and restore body overflow. If focus was already outside, it is preserved. DOM API availability guards retain legacy/test-adapter compatibility without bypassing focus verification in real DOM.

The initial sheet markup now has inert. The inline implementation keeps the existing window.openMobileMenu entry with a private closure shared with window.closeMobileMenu; original Escape binding and action callbacks remain unchanged. The three private release-focus algorithms have equal ASTs, and the same behavior matrix is executed against all three implementations.

No full focus trap, tab-cycle management, modal framework, Escape architecture or tab-navigation redesign. Full native Chromium proof remains environment-blocked and is not inferred from the synthetic matrix.

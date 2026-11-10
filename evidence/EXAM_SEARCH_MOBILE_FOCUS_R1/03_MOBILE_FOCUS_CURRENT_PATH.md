# 03 — Mobile focus current path and proven RED

The baseline canonical, emergency and inline More-menu implementations remove .open and set aria-hidden=true without moving focus. The initial sheet markup also lacks inert. The existing mobile-shell gate still reports 81/81 because its dynamic fixture does not model descendant focus.

The phase checker executes each actual implementation with a focused descendant and intercepts its actual aria-hidden setter. Baseline reproduces focus still inside at the hide boundary for all three paths. Candidate proves that focus leaves before the setter runs, including removed/disabled opener and final blur fallback cases.

This is a DOM/focus defect, independent from Exam search, Finance and belt upgrade. Existing inline close actions call the same closeMobileMenu authority; they retain their original callback strings.

The Chromium warning reported by the user was not reproduced in a running browser here: the installed system Chromium process fails at socket creation. The available cloud browser cannot access the local HTTP fixture and rejects file: navigation by policy. Testing stopped on that browser after the rejection; no workaround was attempted. Native-warning absence remains NOT VERIFIED.

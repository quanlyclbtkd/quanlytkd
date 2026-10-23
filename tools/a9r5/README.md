# A9R5 isolated QA

- `Run-A9R5-Auth-Firestore.ps1`: Windows PowerShell runner for **real local** Firebase Auth+Firestore emulators, project `demo-a9r5-coach-auth`. Fails closed if ports occupied or Rules SHA changed.
- `coach-auth-firestore-emulator.test.mjs`: creates synthetic Auth identities in the emulator; seeds only demo Firestore; loads **exact unchanged** Coach owner with real Firebase Web SDK; tests create, existing Auth, Coach login, CS1/CS2, revoke, CAS repair, orphan recovery, replay, maintenance.
- `qr-evidence-analyzer.mjs`: offline sanitized logs classifier. **Does not generate or accept QR and never reads or writes user data.**
- `qr-evidence-synthetic.test.mjs`: synthetic 5-case smoke suite; never confirms provider behavior.

Run on D:\A9R5\source; see root `A9R5_TEST_ONLY_HANDOFF.md`. Do not run on production or use real account emails.

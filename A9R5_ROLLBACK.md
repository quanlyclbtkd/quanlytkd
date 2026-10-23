# A9R5 rollback / retention

No production deployment and no runtime files changed from A9R4; only new QA scripts, offline fixture classifier, demo config, evidence files and documentation were added.

If A9R5 QA is not required, keep the original `D:\A9R4\source` untouched and delete only the isolated `D:\A9R5\source` folder. Do NOT restore/delete any production Firebase Auth identity, production Firestore document or journal as part of rollback.

For an A9R5 demo Auth+Firestore Emulator run, stop the emulator process after obtaining JSON results. Its synthetic Auth identities and Firestore records belong to `demo-a9r5-coach-auth` and are not live data.

The prior A9R3 Rules remained unchanged. The existing Attendance maintenance remains unchanged. The previously reported real Auth UID which was orphaned must be reviewed only by an authorized operator in the correct Firebase project; do not run automatic deletion or recreation.

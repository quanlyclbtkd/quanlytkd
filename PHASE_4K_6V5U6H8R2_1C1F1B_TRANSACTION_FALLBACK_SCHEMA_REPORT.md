# F1B Transaction Fallback Schema Report

Transaction fallback remains read-only and uses already-loaded transaction arrays only. It performs no Firestore fetch/listener/write.

Supported existing month fields include:
- `packageMonths`
- `accountingMonths`
- `months`
- `tuitionMonths`
- `paidMonths`
- `txMonth`
- `month`
- `tuitionMonth`
- `paymentMonth`
- `primaryAccountingMonth`
- legacy compatible `paidUntil/period/forMonth`

Identity order:
1. stable profile identity (`profileId/id/uid/memberId/memberID/studentId`) vs transaction stable identity (`profileId/studentId/memberId/memberID`);
2. explicit transaction name fields (`studentName/name/profileName/memberName`);
3. `description` as legacy fallback only when stable matching is unavailable.

If both profile and transaction expose stable IDs and they differ, the fallback does **not** fall through to matching description.

Deleted/reversed/void transaction evidence is ignored.

TF01–TF08: **8/8 PASS**.

# Phase 4.0B-4J-3 Multi Bank Account Report

## Summary
Added second bank account configuration and per-branch bank account mapping to the Taekwondo Club Management system.

## Added
- `paymentAccounts.bank1` — wraps existing `bankId`, `accountNo`, `accountName` fields
- `paymentAccounts.bank2` — new second bank account with `enabled` toggle
- `branchPaymentAccountMap` — maps each branch key (CS1, CS2, …) to bank1 or bank2
- `getPaymentAccountForBranch(branchCode, settings)` — helper returns effective bank account for a branch
- `printPaymentAccountMapping()` — debug function (no PII, masks account numbers)
- `maskAccountNumber(num)` — masks all but last 4 digits
- `window.toggleBank2Fields(enabled)` — show/hide bank2 form fields

## Backward Compatibility
- **Old bank config preserved**: `bankId`, `accountNo`, `accountName` remain as top-level fields and are also written into `paymentAccounts.bank1` on save
- **bank1 fallback**: `getPaymentAccountForBranch` always falls back to `bank1` if branch has no mapping
- **disabled bank2 fallback**: if `bank2.enabled === false`, helper falls back to `bank1`
- **branch without mapping**: defaults to `bank1`
- **legacy Firestore data**: if `paymentAccounts` absent, helper reads `bankId`/`accountNo`/`accountName` directly from config object

## UI
- **Bank account 1**: existing `cfg_bankId`, `cfg_accountNo`, `cfg_accountName` fields preserved
- **Bank account 2**: new toggle `cfg_bank2Enabled` + fields `cfg_bank2Id`, `cfg_bank2AccountNo`, `cfg_bank2AccountName`, `cfg_bank2Note`; hidden until toggled on
- **Branch mapping**: `cfg_branchBankMapBlock` section (hidden when single-branch), dynamic selects `cfg_bankMap_CS1`, `cfg_bankMap_CS2`, … populated from `branchCount`

## Affected Outputs
- **Debt notice (parent portal)**: `_effBankId`, `_effAccNo`, `_effAccName` derived from `getPaymentAccountForBranch(_prof.branch, _cfg)` — QR URL and transfer data updated
- **Receipt HTML block**: same effective variables used for bank display in receipt template
- **window._ppTransferData**: populated with effective bank data so transfer sheet shows correct account
- **Export/report**: reads from `_ppTransferData` which now uses branch-resolved account

## Safety
- Business logic changed: **no**
- Firestore schema destructive change: **no** (additive only, merge:true)
- Old data deleted: **no**
- tuitionFee / debt logic modified: **no**
- Deploy executed: **no**
- Firestore rules modified: **no**

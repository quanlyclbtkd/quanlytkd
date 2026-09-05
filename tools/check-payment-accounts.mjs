// tools/check-payment-accounts.mjs
// Phase 4.0B-4J-4: Static analysis check for Multi Bank Account + Branch QR fix
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir   = resolve(__dirname, '..');

const TAG = '[PaymentAccountsCheck]';
let passes = 0; let fails = 0; let warns = 0;

function pass(msg)  { console.log(`${TAG} PASS  ${msg}`); passes++; }
function fail(msg)  { console.error(`${TAG} FAIL  ${msg}`); fails++; }
function warn(msg)  { console.warn(`${TAG} WARN  ${msg}`); warns++; }
function section(s) { console.log(`\n${TAG} ── ${s} ──`); }

const appJs   = readFileSync(resolve(rootDir, 'app.js'),    'utf-8');
const htmlSrc = readFileSync(resolve(rootDir, 'index.html'),'utf-8');
const financeJs = readFileSync(resolve(rootDir, 'js/modules/finance.js'),'utf-8');
const studentsJs = readFileSync(resolve(rootDir, 'js/modules/students.js'),'utf-8');

// ─────────────────────────────────────────────────────────────────────────────
section('1. paymentAccounts data model');
if (/paymentAccounts/.test(appJs))     pass('paymentAccounts present in app.js');
else                                   fail('paymentAccounts MISSING from app.js');
if (/bank1/.test(appJs))               pass('bank1 key present in app.js');
else                                   fail('bank1 key MISSING');
if (/bank2/.test(appJs))               pass('bank2 key present in app.js');
else                                   fail('bank2 key MISSING');

// ─────────────────────────────────────────────────────────────────────────────
section('2. branchPaymentAccountMap');
if (/branchPaymentAccountMap/.test(appJs)) pass('branchPaymentAccountMap present in app.js');
else                                       fail('branchPaymentAccountMap MISSING from app.js');

// ─────────────────────────────────────────────────────────────────────────────
section('3. normalizeBranchKeyForPayment (Phase 4J-4)');
if (/function normalizeBranchKeyForPayment/.test(appJs))
    pass('normalizeBranchKeyForPayment defined');
else
    fail('normalizeBranchKeyForPayment MISSING — Phase 4J-4 not applied');

if (/csMatch\s*=\s*upper\.match/.test(appJs))
    pass('CS\\d+ match logic present');
else
    fail('CS\\d+ match logic MISSING');

if (/co\\s\*so\\s\*:?\\s\*\(\\d\+\)/.test(appJs) || /coSoMatch/.test(appJs))
    pass('coSoMatch (Cơ sở N) normalization present');
else
    fail('coSoMatch MISSING');

if (/branchName.*branchCount|for.*branchCount.*branchName/.test(appJs.replace(/\s+/g,' ')))
    pass('branchNameN lookup loop present in normalizeBranchKeyForPayment');
else
    fail('branchNameN lookup loop MISSING');

// ─────────────────────────────────────────────────────────────────────────────
section('4. getPaymentAccountForBranch helper (Phase 4J-4 robust)');
if (/function getPaymentAccountForBranch/.test(appJs))   pass('getPaymentAccountForBranch defined');
else                                                      fail('getPaymentAccountForBranch MISSING');

if (/normalizedKey\s*=\s*normalizeBranchKeyForPayment/.test(appJs))
    pass('getPaymentAccountForBranch uses normalizeBranchKeyForPayment');
else
    fail('getPaymentAccountForBranch does NOT use normalizeBranchKeyForPayment');

if (/map\[normalizedKey\]\s*\|\|\s*map\[String/.test(appJs.replace(/\s+/g,' ')))
    pass('multi-key map fallback chain present');
else
    fail('multi-key map fallback chain MISSING');

if (/bankKey:\s*selected/.test(appJs))
    pass('getPaymentAccountForBranch returns bankKey field');
else
    fail('getPaymentAccountForBranch missing bankKey field in return');

if (/!account\s*\|\|\s*account\.enabled\s*===\s*false/.test(appJs))
    pass('disabled bank2 fallback to bank1');
else
    fail('disabled bank2 fallback MISSING');

// ─────────────────────────────────────────────────────────────────────────────
section('5. saveClubSettings — alias map for branch names');
if (/_bName4j4/.test(appJs))
    pass('saveClubSettings stores branch name alias (_bName4j4)');
else
    fail('Branch name alias MISSING from saveClubSettings (_bName4j4)');

if (/_bNorm4j4/.test(appJs))
    pass('saveClubSettings stores normalized branch name alias (_bNorm4j4)');
else
    fail('Normalized branch alias MISSING (_bNorm4j4)');

// ─────────────────────────────────────────────────────────────────────────────
section('6. generateVietQR accepts branchOrAccount (Phase 4J-4)');
if (/function generateVietQR\s*\(\s*amount.*branchOrAccount/.test(appJs.replace(/\s+/g,' ')))
    pass('generateVietQR signature includes branchOrAccount');
else
    fail('generateVietQR signature MISSING branchOrAccount param');

if (/typeof branchOrAccount\s*===\s*'object'/.test(appJs))
    pass('generateVietQR handles account object passthrough');
else
    fail('generateVietQR account object passthrough MISSING');

if (/getPaymentAccountForBranch\(branchOrAccount/.test(appJs))
    pass('generateVietQR calls getPaymentAccountForBranch when branch string given');
else
    fail('generateVietQR does not call getPaymentAccountForBranch');

// ─────────────────────────────────────────────────────────────────────────────
section('7. exportReceipt passes branch to generateVietQR (Phase 4J-4)');
if (/generateVietQR\(amount,\s*qrName,\s*paymentContent,\s*branch/.test(appJs.replace(/\s+/g,' ')))
    pass('exportReceipt passes branch to generateVietQR');
else
    fail('exportReceipt DOES NOT pass branch to generateVietQR');

if (/clubConfig\.accountNo.*paymentContent|paymentContent.*clubConfig\.accountNo/.test(appJs))
    warn('exportReceipt may still use clubConfig.accountNo directly — verify manually');

// ─────────────────────────────────────────────────────────────────────────────
section('8. Báo Nợ QR — canonical branch propagation');
const _appFlat = appJs.replace(/\s+/g,' ');
const _studentsFlat = studentsJs.replace(/\s+/g,' ');
if (/generateMultiMonthPaymentRequest\([^)]*safeBranch/.test(_appFlat))
    pass('Debt QR passes canonical safeBranch into generateMultiMonthPaymentRequest');
else
    fail('Debt QR does not pass canonical safeBranch into generateMultiMonthPaymentRequest');

if (/window\.generateMultiMonthPaymentRequest\s*=\s*\([^)]*branch[^)]*\)\s*=>\s*\{[\s\S]*?window\.exportReceipt\([\s\S]*?monthsStr,\s*branch,/.test(studentsJs))
    pass('generateMultiMonthPaymentRequest passes branch into exportReceipt');
else
    fail('generateMultiMonthPaymentRequest does not pass branch into exportReceipt');

// Check no self-reference bug
if (/const _effBankId\s*=.*\|\|\s*_effBankId/.test(_appFlat))
    fail('Self-referencing _effBankId bug still present (4J-3 regression)');
else
    pass('No self-referencing _effBankId bug');

// ─────────────────────────────────────────────────────────────────────────────
section('9. quickPay uses Tuition Command canonical branch for receipt');
const _financeFlat = financeJs.replace(/\s+/g,' ');
if (/TuitionCommandBoundary\.collectTuition\(\{[^}]*branch:\s*branch\s*\|\|\s*'CS1'/.test(_financeFlat))
    pass('quickPay passes requested branch into TuitionCommandBoundary.collectTuition');
else
    fail('quickPay does not pass branch into TuitionCommandBoundary.collectTuition');
if (/window\.exportReceipt\([\s\S]*?result\.branch,/.test(financeJs))
    pass('quickPay receipt uses canonical result.branch returned by Tuition Command');
else
    fail('quickPay receipt does not use canonical result.branch');

// ─────────────────────────────────────────────────────────────────────────────
section('10. processCombo cross-branch warning (Phase 4J-4)');
if (/Combo contains multiple branches/.test(appJs))
    pass('processCombo cross-branch warning present');
else
    fail('processCombo cross-branch warning MISSING');

// ─────────────────────────────────────────────────────────────────────────────
section('11. Debug helpers');
if (/window\.testPaymentAccountForBranch/.test(appJs)) pass('testPaymentAccountForBranch defined');
else                                                    fail('testPaymentAccountForBranch MISSING');
if (/window\.printPaymentAccountMapping/.test(appJs))  pass('printPaymentAccountMapping preserved');
else                                                    fail('printPaymentAccountMapping MISSING');
if (/maskAccountNumber/.test(appJs))                   pass('maskAccountNumber helper present');
else                                                    warn('maskAccountNumber helper missing (optional)');

// ─────────────────────────────────────────────────────────────────────────────
section('12. UI — bank account fields in HTML');
if (/id="cfg_bankId"/.test(htmlSrc))         pass('cfg_bankId field present');
else                                         fail('cfg_bankId MISSING from HTML');
if (/id="cfg_bank2Enabled"/.test(htmlSrc))   pass('cfg_bank2Enabled toggle present');
else                                         fail('cfg_bank2Enabled MISSING from HTML');
if (/cfg_branchBankMapBlock/.test(htmlSrc))  pass('cfg_branchBankMapBlock section present');
else                                         fail('cfg_branchBankMapBlock MISSING from HTML');

// ─────────────────────────────────────────────────────────────────────────────
section('13. Backward compatibility');
if (/bankId.*accountNo.*accountName/.test(appJs.replace(/\s+/g,' ')))
    pass('Legacy bankId/accountNo/accountName fields preserved');
else
    fail('Legacy bank fields MISSING');

// ─────────────────────────────────────────────────────────────────────────────
section('14. Report file');
if (existsSync(resolve(rootDir, 'PHASE_4B4J3_MULTI_BANK_ACCOUNT_REPORT.md')))
    pass('PHASE_4B4J3_MULTI_BANK_ACCOUNT_REPORT.md exists');
else
    warn('Report file missing (non-blocking)');

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${TAG} Checked: ${passes + fails + warns} items`);
if (fails > 0) {
    console.error(`${TAG} ❌ FAILED — ${fails} failure(s), ${warns} warning(s), ${passes} passed.`);
    process.exit(1);
} else {
    console.log(`${TAG} ✅ OK — All payment-accounts checks passed (${warns} warning(s)).`);
}

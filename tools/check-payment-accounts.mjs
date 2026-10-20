// tools/check-payment-accounts.mjs
// Phase 4.0B-4J-4: Static analysis check for Multi Bank Account + Branch QR fix
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

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

if (/selectedKeys\s*=.*aliases/.test(appJs.replace(/\s+/g,' ')) && /selectedValues\.length > 1/.test(appJs))
    pass('resolver checks all branch-map aliases and blocks conflicting mappings');
else fail('resolver does not prove conflict-safe branch map selection');
if (/return \{bankKey, bankId, accountNo, accountName/.test(appJs) && /return deny\('ACCOUNT_DISABLED'\)/.test(appJs))
    pass('resolver returns a complete selected tuple or denies disabled mapped account');
else fail('resolver can return a mixed/incomplete/disabled account');
if (/Object\.keys\(accounts\)\.length > 0\) return deny\('ACCOUNT_MAPPING_MISSING'\)/.test(appJs))
    pass('unmapped multi-account configuration cannot silently select bank1 or bank2');
else fail('unmapped account can silently use another bank');

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
section('7. exportReceipt resolves verified payment account before generateVietQR');
const _qrRoute = appJs.replace(/\s+/g,' ');
if (/const _accounts = _branches\.map/.test(_qrRoute) && /getPaymentAccountForBranch\(b, _paymentSettings\)/.test(_qrRoute) && /generateVietQR\(amount, qrName, paymentContent, _accounts\[0\], 'qr_only'\)/.test(_qrRoute))
    pass('report branch resolves verified account snapshot and passes it to qr_only generator');
else
    fail('report branch did not demonstrate canonical account resolver to QR');

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
section('10. processCombo cross-bank safety in actual finance owner');
if (/branches=intents\.map/.test(financeJs) && /await window\.exportReceipt/.test(financeJs) && /_accounts\.some\(acc => acc\.bankId/.test(appJs))
    pass('family report submits both branches and QR owner rejects mixed accounts');
else
    fail('family cross-account branch validation missing');
try {
    execFileSync(process.execPath, [resolve(rootDir, 'tools/check-qr-report-render-payment-intent.mjs')], { cwd: rootDir, timeout: 15000, stdio: 'pipe' });
    pass('actual-handler QR report payment account/branch negative matrix passes');
} catch (e) { fail('actual-handler QR payment account/branch matrix failed: '+String(e.message).slice(0,160)); }

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

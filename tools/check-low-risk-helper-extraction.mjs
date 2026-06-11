#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const failures = [];
const warnings = [];
const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);

const main = read('js/main.js');
const index = read('index.html');
const app = read('app.js');
const pkg = JSON.parse(read('package.json'));
const fmtPath = 'js/utils/formatters.js';
const fmt = exists(fmtPath) ? read(fmtPath) : '';

if (!exists(fmtPath)) fail('Missing js/utils/formatters.js');
if (!fmt.includes('export const Formatters')) fail('formatters.js must export Formatters');
if (!fmt.includes('export function initFormatters')) fail('formatters.js must export initFormatters');
if (!fmt.includes('window.Formatters')) fail('initFormatters must expose window.Formatters');
for (const name of ['formatCurrency','formatVNDNumber','formatVNDText','parseMoney','formatDate','formatMonth','normalizeText','safeText']) {
  if (!fmt.includes(name)) fail(`formatters.js missing ${name}`);
}
if (!fmt.includes('debugFormatterHealth')) fail('Missing debugFormatterHealth');
if (!fmt.includes('debugLowRiskHelperExtraction')) fail('Missing debugLowRiskHelperExtraction');
if (!main.includes("./utils/formatters.js")) fail('main.js must import formatters.js');
if (!main.includes('initFormatters()')) fail('main.js must call initFormatters()');
if (!main.includes('debugLowRiskHelperExtraction')) fail('debugRuntimeSmokeTest must include debugLowRiskHelperExtraction');
if (!main.includes('debugFormatterHealth')) fail('debugRuntimeSmokeTest must include debugFormatterHealth');
if (!(main.includes("APP_BUILD_VERSION = '4K-6K-A-formatters-extraction-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-B-cross-tab-search-replay-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-C-search-latency-optimization-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-D-multiitem-tuition-package-fix-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-E-unified-student-search-index-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-F-receipt-qr-helper-extraction-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-G-admission-tuition-type-normalization-20260608'"))) fail('APP_BUILD_VERSION missing 4K-6K-A..6K-G marker');
if (!(index.includes('main.js?v=formatters-extraction-20260608') || index.includes('main.js?v=cross-tab-search-replay-20260608') || index.includes('main.js?v=search-latency-optimization-20260608') || index.includes('main.js?v=multiitem-tuition-package-fix-20260608') || index.includes('main.js?v=unified-student-search-index-20260608') || index.includes('main.js?v=receipt-qr-helper-extraction-20260608') || index.includes('main.js?v=admission-tuition-type-normalization-20260608'))) fail('index.html cache bust missing 4K-6K-A..6K-G marker');
if (fmt.includes('firebase') || fmt.includes('updateDoc') || fmt.includes('setDoc') || fmt.includes('addDoc') || fmt.includes('deleteDoc')) {
  fail('formatters.js must stay pure and must not include Firebase write APIs');
}

// Guard dangerous flows remain present in app.js. This is a coarse safety gate.
for (const fn of ['processMultiItem','quickPay','deleteTx','markInvPaid','handleImportExcel','initSaaSDatabase','listenToData','renderApp','scheduleRender']) {
  if (!app.includes(fn)) fail(`Protected legacy flow missing from app.js: ${fn}`);
}

if (!pkg.scripts?.['check:low-risk-helper-extraction']) fail('package.json missing check:low-risk-helper-extraction script');
if (!pkg.scripts?.['check:all']?.includes('check:low-risk-helper-extraction')) fail('check:all must include check:low-risk-helper-extraction');
if (!pkg.scripts?.['check:all:critical']?.includes('check:low-risk-helper-extraction')) fail('check:all:critical must include check:low-risk-helper-extraction');

if (!exists('js/modules/receiptHelpers.js')) fail('Missing js/modules/receiptHelpers.js');
if (!exists('js/modules/qrBankingHelpers.js')) fail('Missing js/modules/qrBankingHelpers.js');
const receipt = exists('js/modules/receiptHelpers.js') ? read('js/modules/receiptHelpers.js') : '';
const qr = exists('js/modules/qrBankingHelpers.js') ? read('js/modules/qrBankingHelpers.js') : '';
if (!receipt.includes('export const ReceiptHelpers')) fail('receiptHelpers.js must export ReceiptHelpers');
if (!receipt.includes('initReceiptHelpers')) fail('receiptHelpers.js must export/init initReceiptHelpers');
if (!receipt.includes('window.ReceiptHelpers')) fail('ReceiptHelpers must expose window.ReceiptHelpers');
if (!receipt.includes('debugReceiptHelperHealth')) fail('Missing debugReceiptHelperHealth');
if (receipt.includes('updateDoc') || receipt.includes('setDoc') || receipt.includes('addDoc') || receipt.includes('deleteDoc')) fail('receiptHelpers.js must not write Firestore');
if (!qr.includes('export const QRBankingHelpers')) fail('qrBankingHelpers.js must export QRBankingHelpers');
if (!qr.includes('initQRBankingHelpers')) fail('qrBankingHelpers.js must export/init initQRBankingHelpers');
if (!qr.includes('window.QRBankingHelpers')) fail('QRBankingHelpers must expose window.QRBankingHelpers');
if (!qr.includes('debugQRBankingHelperHealth')) fail('Missing debugQRBankingHelperHealth');
if (qr.includes('updateDoc') || qr.includes('setDoc') || qr.includes('addDoc') || qr.includes('deleteDoc')) fail('qrBankingHelpers.js must not write Firestore');
if (!main.includes('./modules/receiptHelpers.js')) fail('main.js must import receiptHelpers.js');
if (!main.includes('./modules/qrBankingHelpers.js')) fail('main.js must import qrBankingHelpers.js');
if (!main.includes('initReceiptHelpers()')) fail('main.js must call initReceiptHelpers()');
if (!main.includes('initQRBankingHelpers()')) fail('main.js must call initQRBankingHelpers()');
if (!main.includes('debugReceiptHelperHealth')) fail('debugRuntimeSmokeTest must include debugReceiptHelperHealth');
if (!main.includes('debugQRBankingHelperHealth')) fail('debugRuntimeSmokeTest must include debugQRBankingHelperHealth');

console.log('Phase 4K-6K-A — Low-Risk Formatters Extraction Check');
console.log('Warnings:', warnings.length);
warnings.forEach(w => console.warn('WARN:', w));
if (failures.length) {
  console.error('Failures:', failures.length);
  failures.forEach(f => console.error('FAIL:', f));
  process.exit(1);
}
console.log('✅ check:low-risk-helper-extraction PASS');

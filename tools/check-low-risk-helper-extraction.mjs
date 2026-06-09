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
if (!(main.includes("APP_BUILD_VERSION = '4K-6K-A-formatters-extraction-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-B-cross-tab-search-replay-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-C-search-latency-optimization-20260608'"))) fail('APP_BUILD_VERSION missing 4K-6K-A/6K-B/6K-C marker');
if (!(index.includes('main.js?v=formatters-extraction-20260608') || index.includes('main.js?v=cross-tab-search-replay-20260608') || index.includes('main.js?v=search-latency-optimization-20260608'))) fail('index.html cache bust missing 4K-6K-A/6K-B/6K-C marker');
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

if (!exists('js/modules/receiptHelpers.js')) warn('receiptHelpers.js not created yet — expected for 4K-6K-B, not 4K-6K-A');
if (!exists('js/modules/qrBankingHelpers.js')) warn('qrBankingHelpers.js not created yet — expected for 4K-6K-B, not 4K-6K-A');

console.log('Phase 4K-6K-A — Low-Risk Formatters Extraction Check');
console.log('Warnings:', warnings.length);
warnings.forEach(w => console.warn('WARN:', w));
if (failures.length) {
  console.error('Failures:', failures.length);
  failures.forEach(f => console.error('FAIL:', f));
  process.exit(1);
}
console.log('✅ check:low-risk-helper-extraction PASS');

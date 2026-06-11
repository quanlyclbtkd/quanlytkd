#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
const failures=[];
const fail=m=>failures.push(m);
const main=read('js/main.js');
const index=read('index.html');
const app=read('app.js');
const pkg=JSON.parse(read('package.json'));
const receiptPath='js/modules/receiptHelpers.js';
const qrPath='js/modules/qrBankingHelpers.js';
if(!exists(receiptPath)) fail('Missing js/modules/receiptHelpers.js');
if(!exists(qrPath)) fail('Missing js/modules/qrBankingHelpers.js');
const receipt=exists(receiptPath)?read(receiptPath):'';
const qr=exists(qrPath)?read(qrPath):'';
for (const [name, src, globals] of [
  ['receiptHelpers', receipt, ['export const ReceiptHelpers','initReceiptHelpers','window.ReceiptHelpers','debugReceiptHelperHealth','buildReceiptHtml','calculateReceiptTotal']],
  ['qrBankingHelpers', qr, ['export const QRBankingHelpers','initQRBankingHelpers','window.QRBankingHelpers','debugQRBankingHelperHealth','buildVietQrImageUrl','buildVietQrDeepLink','resolveBankAccountForBranch']],
]) {
  for (const token of globals) if(!src.includes(token)) fail(`${name} missing ${token}`);
  for (const bad of ['updateDoc','setDoc','addDoc','deleteDoc','writeBatch','runTransaction']) {
    if(src.includes(bad)) fail(`${name} must not contain Firebase write API ${bad}`);
  }
}
if(!main.includes("./modules/receiptHelpers.js")) fail('main.js must import receiptHelpers.js');
if(!main.includes("./modules/qrBankingHelpers.js")) fail('main.js must import qrBankingHelpers.js');
if(!main.includes('initReceiptHelpers()')) fail('main.js must init receipt helpers');
if(!main.includes('initQRBankingHelpers()')) fail('main.js must init QR helpers');
if(!main.includes('debugReceiptHelperHealth')) fail('debugRuntimeSmokeTest must include debugReceiptHelperHealth');
if(!main.includes('debugQRBankingHelperHealth')) fail('debugRuntimeSmokeTest must include debugQRBankingHelperHealth');
if(!(main.includes("APP_BUILD_VERSION = '4K-6K-F-receipt-qr-helper-extraction-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-G-admission-tuition-type-normalization-20260608'"))) fail('APP_BUILD_VERSION must be 4K-6K-F or later compatible');
if(!(index.includes('main.js?v=receipt-qr-helper-extraction-20260608') || index.includes('main.js?v=admission-tuition-type-normalization-20260608'))) fail('index.html cache bust must be 4K-6K-F or later compatible');
// Guard protected flows remain in app.js. This phase must not own write flows.
for (const fn of ['processMultiItem','quickPay','deleteTx','markInvPaid','cancelExamPayment','handleImportExcel','initSaaSDatabase','listenToData','renderApp','scheduleRender']) {
  if(!app.includes(fn)) fail(`Protected flow missing from app.js: ${fn}`);
}
if(!pkg.scripts?.['check:receipt-qr-helper-extraction']) fail('package.json missing check:receipt-qr-helper-extraction');
if(!pkg.scripts?.['check:all']?.includes('check:receipt-qr-helper-extraction')) fail('check:all must include check:receipt-qr-helper-extraction');
if(!pkg.scripts?.['check:all:critical']?.includes('check:receipt-qr-helper-extraction')) fail('check:all:critical must include check:receipt-qr-helper-extraction');
if(failures.length){console.error('Phase 4K-6K-F — Receipt / QR Helper Extraction FAIL'); failures.forEach(f=>console.error('FAIL:',f)); process.exit(1)}
console.log('✅ check:receipt-qr-helper-extraction PASS');

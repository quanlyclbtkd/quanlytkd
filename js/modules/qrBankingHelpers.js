/**
 * js/modules/qrBankingHelpers.js
 * ────────────────────────────────────────────────────────────────
 * Phase 4K-6K-F — QR / Banking Helper Extraction Gate
 *
 * Read-only VietQR/banking display helpers. No Firestore writes, no transaction
 * mutations, no payment status changes. Legacy globals remain compatible.
 */
import { Formatters } from '../utils/formatters.js';

const DEFAULT_BANKS = Object.freeze([
  { n:'Vietcombank', s:'VCB',  bin:'970436', aliases:["VCB","Ngân hàng TMCP Ngoại Thương Việt Nam","Vietcombank"], sc:'vietcombank', pkg:'com.VCB', ios:'895961699', dl:true },
  { n:'BIDV',        s:'BIDV', bin:'970418', aliases:["BIDV","Ngân hàng TMCP Đầu tư và Phát triển Việt Nam","BIDV"], sc:'bidv', pkg:'com.bidv.smartbanking', ios:'839817922', dl:true },
  { n:'Techcombank', s:'TCB',  bin:'970407', aliases:["TCB","Ngân hàng TMCP Kỹ thương Việt Nam","Techcombank"], sc:'techcombank', pkg:'vn.techcombank.mobile', ios:'1090449508', dl:true },
  { n:'MB Bank',     s:'MB',   bin:'970422', aliases:["MB","Ngân hàng TMCP Quân đội","MBBank"], sc:'mbmobile', pkg:'com.mbmobile', ios:'671882567', dl:true },
  { n:'VietinBank',  s:'CTG',  bin:'970415', aliases:["ICB","Ngân hàng TMCP Công thương Việt Nam","VietinBank"], sc:'vietinbank', pkg:'com.vietinbank.imobilev2', ios:'938057985', dl:false },
  { n:'Agribank',    s:'AGB',  bin:'970405', aliases:["VBA","Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam","Agribank"], sc:'agribank', pkg:'vn.agribank.mobilebanking', ios:'1028248820', dl:false },
  { n:'VPBank',      s:'VPB',  bin:'970432', aliases:["VPB","Ngân hàng TMCP Việt Nam Thịnh Vượng","VPBank"], sc:'vpbank', pkg:'com.vpbank.vpbankmobile', ios:'940344289', dl:true },
  { n:'TPBank',      s:'TPB',  bin:'970423', aliases:["TPB","Ngân hàng TMCP Tiên Phong","TPBank"], sc:'tpbank', pkg:'vn.tpb.mobilebanking', ios:'1281082726', dl:true },
  { n:'HDBank',      s:'HDB',  bin:'970437', aliases:["HDB","Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh","HDBank"], sc:'hdbank', pkg:'vn.hdbank.mobilebanking', ios:'884122768', dl:true },
  { n:'Sacombank',   s:'STB',  bin:'970403', aliases:["STB","Ngân hàng TMCP Sài Gòn Tài Lộc","Sacombank"], sc:'sacombank', pkg:'vn.com.sacombank.mobilebanking', ios:'1085226588', dl:false },
]);

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanAccountNo(value) {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function parseAmount(value) {
  return window?.Formatters?.parseMoney?.(value) ?? Formatters.parseMoney(value);
}

function getBankList() {
  return DEFAULT_BANKS.map(x => ({ ...x }));
}

function findBank(bankIdOrBin = '') {
  const normalize = x => cleanText(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toUpperCase().replace(/\s/g, '');
  const key = normalize(bankIdOrBin);
  if (!key) return null;
  const matches = getBankList().filter(b => [b.bin, b.s, b.n, ...(b.aliases || [])].some(x => normalize(x) === key));
  return matches.length === 1 ? matches[0] : null;
}

// V7: registry lookup only. The canonical branch resolver in app.js chooses
// the beneficiary. All supplied identities must refer to the same bank.
function normalizeBankAccountStrict(account = {}) {
  const fail = code => { const e = new Error(code); e.code = code; throw e; };
  const identities = ['bankId', 'bankBin', 'bin', 'bankShort', 'bankCode', 'bankName', 'bank']
    .map(k => cleanText(account[k])).filter(Boolean);
  if (!identities.length) fail('ACCOUNT_INCOMPLETE');
  const banks = identities.map(token => {
    const bank = findBank(token);
    if (!bank) fail(/^\d+$/.test(token) && !/^\d{6}$/.test(token) ? 'BANK_BIN_INVALID' : 'BANK_CODE_UNRECOGNIZED');
    return bank;
  });
  if (banks.some(b => b.bin !== banks[0].bin)) fail('BANK_IDENTITY_CONFLICT');
  // Numeric account numbers have already lost leading-zero information.
  if (typeof account.accountNo !== 'string' || !/^[0-9A-Za-z]{3,32}$/.test(account.accountNo.trim()) || /^\d+(?:\.\d+)?e[+-]?\d+$/i.test(account.accountNo.trim()) || !cleanText(account.accountName)) fail('ACCOUNT_INCOMPLETE');
  return Object.freeze({bankId:banks[0].bin,bankBin:banks[0].bin,accountNo:account.accountNo.trim(),accountName:cleanText(account.accountName)});
}

function normalizeBankAccount(account = {}) {
  const bankId = cleanText(account.bankId || account.bankBin || account.bin || account.bank || '');
  const bank = findBank(bankId);
  return {
    bankId: bank?.bin || bankId,
    bankShort: bank?.s || cleanText(account.bankShort || account.bankCode || bankId),
    bankName: bank?.n || cleanText(account.bankName || account.bank || bankId),
    accountNo: cleanAccountNo(account.accountNo || account.accountNumber || account.accNo || ''),
    accountName: cleanText(account.accountName || account.accName || account.owner || ''),
    supportsDeepLink: !!bank?.dl,
    bank,
  };
}

function buildTransferNote(data = {}) {
  const parts = [
    data.prefix || 'HP',
    data.studentName || data.name || '',
    data.month || data.paymentMonth || '',
    data.branch || '',
  ].map(cleanText).filter(Boolean);
  return parts.join(' ').slice(0, 90);
}

function buildVietQrImageUrl(input = {}, options = {}) {
  const account = normalizeBankAccount(input);
  const amount = parseAmount(input.amount || input.total || 0);
  const addInfo = cleanText(input.addInfo || input.note || buildTransferNote(input));
  const template = options.template || input.template || 'compact2';
  if (!account.bankId || !account.accountNo) return '';

  const params = new URLSearchParams();
  if (amount > 0) params.set('amount', String(amount));
  if (addInfo) params.set('addInfo', addInfo);
  if (account.accountName) params.set('accountName', account.accountName);
  return `https://img.vietqr.io/image/${encodeURIComponent(account.bankId)}-${encodeURIComponent(account.accountNo)}-${encodeURIComponent(template)}.png?${params.toString()}`;
}

function buildVietQrOnlyUrl(input = {}) {
  return buildVietQrImageUrl(input, { template: 'qr_only' });
}

function buildVietQrDeepLink(input = {}) {
  const account = normalizeBankAccount(input);
  const amount = parseAmount(input.amount || input.total || 0);
  const addInfo = cleanText(input.addInfo || input.note || buildTransferNote(input));
  const app = account.bank?.sc || account.bankShort || account.bankId;
  if (!account.accountNo || !app) return '';
  const params = new URLSearchParams();
  params.set('app', app);
  params.set('ba', account.accountNo);
  if (amount > 0) params.set('am', String(amount));
  if (addInfo) params.set('tn', addInfo);
  return `https://dl.vietqr.io/pay?${params.toString()}`;
}

function resolveBankAccountForBranch(branch, config = {}) {
  if (typeof window !== 'undefined' && typeof window.resolveEffectiveBankAccountForBranch === 'function') {
    try {
      return normalizeBankAccount(window.resolveEffectiveBankAccountForBranch(branch, config));
    } catch (_) {}
  }
  const cfg = config || window?.clubConfig || {};
  const branchKey = cleanText(branch);
  const accounts = Array.isArray(cfg.bankAccounts) ? cfg.bankAccounts : [];
  const found = accounts.find(acc => cleanText(acc.branch || acc.branchName || '') === branchKey) || accounts[0] || cfg;
  return normalizeBankAccount(found);
}

function buildBankDisplayText(account = {}) {
  const a = normalizeBankAccount(account);
  return [a.bankName || a.bankShort || a.bankId, a.accountNo, a.accountName].filter(Boolean).join(' · ');
}

function renderQrImageHtml(input = {}, options = {}) {
  const url = buildVietQrImageUrl(input, options);
  if (!url) return '';
  const alt = Formatters.escapeForAttr(options.alt || 'VietQR thanh toán');
  const size = Number(options.size || 220) || 220;
  return `<img src="${Formatters.escapeForAttr(url)}" crossorigin="anonymous" alt="${alt}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:12px;border:1px solid #cbd5e1;background:#fff;padding:8px;">`;
}

export const QRBankingHelpers = Object.freeze({
  getBankList,
  findBank,
  normalizeBankAccount,
  normalizeBankAccountStrict,
  resolveBankAccountForBranch,
  buildTransferNote,
  buildVietQrImageUrl,
  buildVietQrOnlyUrl,
  buildVietQrDeepLink,
  buildBankDisplayText,
  renderQrImageHtml,
});

export function initQRBankingHelpers() {
  if (typeof window === 'undefined') return QRBankingHelpers;
  window.QRBankingHelpers = window.QRBankingHelpers || QRBankingHelpers;
  window.buildVietQrImageUrlSafe = window.buildVietQrImageUrlSafe || QRBankingHelpers.buildVietQrImageUrl;
  window.buildVietQrDeepLinkSafe = window.buildVietQrDeepLinkSafe || QRBankingHelpers.buildVietQrDeepLink;
  window.renderQrImageHtmlSafe = window.renderQrImageHtmlSafe || QRBankingHelpers.renderQrImageHtml;

  window.__lowRiskHelperExtraction = Object.assign({}, window.__lowRiskHelperExtraction || {}, {
    phase: '4K-6K-F-receipt-qr-helper-extraction',
    writeSafe: true,
    firestoreWrites: false,
    migrated: Array.from(new Set([...(window.__lowRiskHelperExtraction?.migrated || []), 'qrBankingHelpers'])),
    notMigrated: ['financialActions'],
  });

  window.debugQRBankingHelperHealth = window.debugQRBankingHelperHealth || function debugQRBankingHelperHealth() {
    const sample = {
      bankId: '970405',
      accountNo: '123456789',
      accountName: 'CLB TAEKWONDO',
      amount: 350000,
      studentName: 'Nguyễn Văn A',
      month: '06/2026',
    };
    const result = {
      ok: true,
      phase: '4K-6K-F-receipt-qr-helper-extraction',
      hasQRBankingHelpers: !!window.QRBankingHelpers,
      bankCount: QRBankingHelpers.getBankList().length,
      functions: {
        getBankList: typeof window.QRBankingHelpers?.getBankList === 'function',
        buildVietQrImageUrl: typeof window.QRBankingHelpers?.buildVietQrImageUrl === 'function',
        buildVietQrDeepLink: typeof window.QRBankingHelpers?.buildVietQrDeepLink === 'function',
        resolveBankAccountForBranch: typeof window.QRBankingHelpers?.resolveBankAccountForBranch === 'function',
        renderQrImageHtml: typeof window.QRBankingHelpers?.renderQrImageHtml === 'function',
      },
      sampleQrUrl: QRBankingHelpers.buildVietQrImageUrl(sample),
      sampleDeepLink: QRBankingHelpers.buildVietQrDeepLink(sample),
      writeSafe: true,
    };
    console.log('[debugQRBankingHelperHealth]', result);
    if (console.table) console.table(result.functions);
    return result;
  };

  return QRBankingHelpers;
}

export default QRBankingHelpers;

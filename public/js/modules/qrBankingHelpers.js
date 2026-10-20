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

function qrImageError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Quicklink now redirects .png to .svg. Accept that exact destination only;
// the image bytes and decoded transfer intent are still verified by the owner.
function validateReceiptQrResponseUrl(responseUrl, requestUrl) {
  try {
    const requested = new URL(requestUrl);
    const landed = new URL(responseUrl);
    const query = url => JSON.stringify([...url.searchParams].sort(([ak,av],[bk,bv]) => ak.localeCompare(bk) || av.localeCompare(bv)));
    const allowedPaths = [requested.pathname.replace(/\.(?:png|svg)$/, '.png'), requested.pathname.replace(/\.(?:png|svg)$/, '.svg')];
    if (requested.origin !== 'https://img.vietqr.io' || !/^\/image\/[0-9]{6}-[0-9A-Za-z]+-qr_only\.(?:png|svg)$/.test(requested.pathname) ||
        landed.origin !== requested.origin || landed.username || landed.password || landed.hash ||
        !allowedPaths.includes(landed.pathname) || query(landed) !== query(requested)) throw qrImageError('QR_FETCH_REDIRECT');
    return true;
  } catch (_) {
    throw qrImageError('QR_FETCH_REDIRECT');
  }
}

function pngBytesValid(bytes) {
  if (bytes.length < 128 || bytes.length > 5000000 || ![137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 12000000;
}
function bytesDataUrl(bytes, mime) {
  let binary = '';
  for (let i=0; i<bytes.length; i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
  return 'data:'+mime+';base64,'+btoa(binary);
}
function jpegBytesValid(bytes) {
  if (bytes.length < 128 || bytes.length > 1000000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length-2] !== 255 || bytes[bytes.length-1] !== 217) return false;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 255) return false;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) return false;
    const length = (bytes[offset] << 8) | bytes[offset+1];
    if (length < 2 || offset + length > bytes.length) return false;
    if ([192,193,194].includes(marker)) {
      if (length < 8) return false;
      const height = (bytes[offset+3] << 8) | bytes[offset+4], width = (bytes[offset+5] << 8) | bytes[offset+6];
      return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 12000000;
    }
    offset += length;
  }
  return false;
}

// SVG is parsed as inert XML, checked against a small graphics allowlist, then
// rendered privately to PNG. No scripts, foreign content, CSS or external URLs.
async function prepareReceiptQrImage(bytes, contentType, document) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (mime === 'image/png') {
    if (!pngBytesValid(bytes)) throw qrImageError('QR_BYTES_INVALID');
    return bytesDataUrl(bytes, 'image/png');
  }
  if (mime !== 'image/svg+xml') throw qrImageError('QR_MIME');
  if (!bytes.length || bytes.length > 2000000) throw qrImageError('QR_BYTES_INVALID');
  const fail = () => {throw qrImageError('QR_SVG_UNSAFE');};
  let text;
  try {text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);} catch (_) {fail();}
  if (/<!DOCTYPE|<!ENTITY|<\?/i.test(text)) fail();
  const doc = document || globalThis.document;
  const view = doc?.defaultView || globalThis;
  const xml = new view.DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = xml.documentElement;
  if (xml.doctype || xml.querySelector('parsererror') || svg?.localName !== 'svg' || svg.namespaceURI !== 'http://www.w3.org/2000/svg') fail();
  const attrs = {
    svg:['xmlns','width','height','viewBox','role','version','preserveAspectRatio'],
    title:[],desc:[],g:['transform','fill'],
    rect:['x','y','width','height','rx','ry','fill'],
    path:['d','fill','fill-rule','shape-rendering','transform'],
    image:['x','y','width','height','href','id','preserveAspectRatio'],
  };
  const nodes = [...svg.querySelectorAll('*')];
  if (nodes.length > 10000) fail();
  for (const node of [svg,...nodes]) {
    const tag = node.localName;
    if (node.namespaceURI !== svg.namespaceURI || !Object.prototype.hasOwnProperty.call(attrs,tag) || (node !== svg && tag === 'svg')) fail();
    for (const attr of [...node.attributes]) {
      const key = attr.name, value = attr.value;
      if (!attrs[tag].includes(key) || (attr.namespaceURI && !(key === 'xmlns' && node === svg))) fail();
      if (key === 'xmlns' && value !== 'http://www.w3.org/2000/svg') fail();
      if (key === 'fill' && !/^(?:#[0-9a-f]{3,8}|white|black|none)$/i.test(value)) fail();
      if (key === 'd' && (value.length > 300000 || !/^[MmZzLlHhVvCcSsQqTtAa0-9eE.,+\-\s]+$/.test(value))) fail();
      if (key === 'transform' && !/^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([-+0-9eE.,\s]+\)\s*)+$/.test(value)) fail();
      if (['x','y','width','height','rx','ry'].includes(key) && (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value) || Math.abs(Number(value)) > 100000)) fail();
      if (key === 'preserveAspectRatio' && !/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(value)) fail();
      if (key === 'shape-rendering' && !/^(?:crispEdges|geometricPrecision|auto)$/.test(value)) fail();
      if (key === 'fill-rule' && !/^(?:nonzero|evenodd)$/.test(value)) fail();
      if (key === 'href') {
        if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 1500000) fail();
        let embedded;
        try {embedded = Uint8Array.from(atob(value.slice(value.indexOf(',')+1)), c => c.charCodeAt(0));} catch (_) {fail();}
        if (!(value.startsWith('data:image/png;') ? pngBytesValid(embedded) : jpegBytesValid(embedded))) fail();
      }
    }
    for (const child of [...node.childNodes]) if (![1,3,4,8].includes(child.nodeType)) fail();
  }
  const box = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some(n => !Number.isFinite(n)) || box[0] !== 0 || box[1] !== 0 || box[2] <= 0 || box[2] > 4096 || box[2] !== box[3]) fail();
  const size = Math.max(512, Math.min(1024, Math.ceil(box[2])));
  svg.setAttribute('width',String(size));svg.setAttribute('height',String(size));
  const safe = new view.XMLSerializer().serializeToString(svg);
  const image = doc.createElement('img');
  const loaded = new Promise((resolve,reject) => {image.onload=resolve;image.onerror=()=>reject(qrImageError('QR_DECODE_FAILED'));});
  loaded.catch(()=>{});
  image.src = bytesDataUrl(new TextEncoder().encode(safe), 'image/svg+xml');
  try {if (typeof image.decode === 'function') await image.decode(); else await loaded;}
  catch (_) {throw qrImageError('QR_DECODE_FAILED');}
  // Four modules of white even for the smallest 21-module QR symbol.
  const quiet = Math.ceil(size*4/21);
  const canvas = doc.createElement('canvas');canvas.width=size+quiet*2;canvas.height=size+quiet*2;
  const context = canvas.getContext('2d');
  if (!context) throw qrImageError('QR_DECODE_FAILED');
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,quiet,quiet,size,size);
  return canvas.toDataURL('image/png');
}

// One local decoder for both source and preview pixels on all browsers.
// Loaded only during receipt QR verification; never installs a window polyfill.
let receiptDecoderPromise = null;
async function decodeReceiptQrImage(image) {
  let decode;
  try {
    if (!receiptDecoderPromise) receiptDecoderPromise = import('../vendor/jsqr-1.4.0.esm.js').then(module => {
      if (typeof module.default !== 'function') throw qrImageError('QR_VERIFICATION_UNAVAILABLE');
      return module.default;
    });
    decode = await receiptDecoderPromise;
  } catch (_) {
    receiptDecoderPromise = null;
    throw qrImageError('QR_VERIFICATION_UNAVAILABLE');
  }
  const width = image?.naturalWidth || image?.width;
  const height = image?.naturalHeight || image?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 100 || height < 100 || width * height > 12000000) throw qrImageError('QR_MEDIA_INVALID');
  try {
    const canvas = (image.ownerDocument || globalThis.document).createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    if (!context) throw qrImageError('QR_DECODE_FAILED');
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const first = decode(pixels.data, width, height, {inversionAttempts:'dontInvert'});
    if (!first) return [];
    const result = code => {
      const points = ['topLeftCorner','topRightCorner','bottomRightCorner','bottomLeftCorner'].map(key => code.location[key]);
      const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
      return {rawValue:code.data,boundingBox:{x,y,width:Math.max(...points.map(p => p.x))-x,height:Math.max(...points.map(p => p.y))-y}};
    };
    const found = [result(first)];
    // Preserve the single-QR contract: remove the first symbol from this private
    // pixel buffer and reject a second symbol rather than choosing one silently.
    const box = found[0].boundingBox;
    const left = Math.max(0, Math.floor(box.x)-4), right = Math.min(width, Math.ceil(box.x+box.width)+4);
    const top = Math.max(0, Math.floor(box.y)-4), bottom = Math.min(height, Math.ceil(box.y+box.height)+4);
    for (let row = top; row < bottom; row++) pixels.data.fill(255, (row*width+left)*4, (row*width+right)*4);
    const second = decode(pixels.data, width, height, {inversionAttempts:'dontInvert'});
    if (second) found.push(result(second));
    return found;
  } catch (error) {
    throw qrImageError(error?.code === 'QR_MEDIA_INVALID' ? error.code : 'QR_DECODE_FAILED');
  }
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
  validateReceiptQrResponseUrl,
  decodeReceiptQrImage,
  prepareReceiptQrImage,
  receiptQrVersion: 'qr-v8-redirect-safari-20261020',
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

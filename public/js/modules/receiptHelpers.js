/**
 * js/modules/receiptHelpers.js
 * ────────────────────────────────────────────────────────────────
 * Phase 4K-6K-F — Receipt Helper Extraction Gate
 *
 * Read-only receipt/print/display helpers. This module does not create,
 * update, or delete Firestore documents and must not become the owner of
 * financial write flows. Legacy globals remain compatible.
 */
import { Formatters } from '../utils/formatters.js';

function _fmtMoney(value) {
  const fn = window?.Formatters?.formatCurrency || Formatters.formatCurrency;
  return fn(value || 0);
}

function _escape(value) {
  const fn = window?.Formatters?.escapeHtml || Formatters.escapeHtml;
  return fn(String(value ?? ''));
}

function _attr(value) {
  const fn = window?.Formatters?.escapeForAttr || Formatters.escapeForAttr;
  return fn(String(value ?? ''));
}

function _date(value) {
  const fn = window?.Formatters?.formatDate || Formatters.formatDate;
  return value ? fn(value) : '';
}

function normalizeReceiptLine(line = {}) {
  const amount = Number(line.amount ?? line.value ?? line.price ?? 0) || 0;
  const qty = Number(line.qty ?? line.quantity ?? 1) || 1;
  return {
    label: String(line.label || line.name || line.desc || line.description || 'Khoản thu'),
    note: String(line.note || line.month || line.type || ''),
    qty,
    amount,
    total: Number(line.total ?? amount * qty) || 0,
  };
}

function buildReceiptLinesHtml(lines = [], options = {}) {
  const rows = (Array.isArray(lines) ? lines : [])
    .map(normalizeReceiptLine)
    .map((line, idx) => `
      <tr data-receipt-line="${idx}">
        <td style="padding:6px 4px;border-bottom:1px solid #e2e8f0;">${idx + 1}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #e2e8f0;">
          <strong>${_escape(line.label)}</strong>
          ${line.note ? `<div style="font-size:11px;color:#64748b;">${_escape(line.note)}</div>` : ''}
        </td>
        <td style="padding:6px 4px;border-bottom:1px solid #e2e8f0;text-align:center;">${line.qty}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #e2e8f0;text-align:right;">${_fmtMoney(line.total)}</td>
      </tr>`)
    .join('');

  if (!rows && options.emptyText !== false) {
    return '<tr><td colspan="4" style="padding:10px;text-align:center;color:#94a3b8;">Không có dòng biên lai</td></tr>';
  }
  return rows;
}

function calculateReceiptTotal(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .map(normalizeReceiptLine)
    .reduce((sum, line) => sum + (Number(line.total) || 0), 0);
}

function buildReceiptSummary(data = {}) {
  const lines = Array.isArray(data.lines) ? data.lines.map(normalizeReceiptLine) : [];
  const total = Number(data.total ?? calculateReceiptTotal(lines)) || 0;
  return {
    receiptNo: String(data.receiptNo || data.id || ''),
    studentName: String(data.studentName || data.name || ''),
    date: data.date || data.createdAt || '',
    branch: String(data.branch || ''),
    collector: String(data.collector || data.trainerName || ''),
    clubName: String(data.clubName || window?.clubConfig?.clubName || window?.clubConfig?.name || ''),
    lines,
    total,
    totalText: _fmtMoney(total),
  };
}

function buildReceiptHtml(data = {}, options = {}) {
  const r = buildReceiptSummary(data);
  return `
    <div class="receipt-helper-preview" data-receipt-helper="1" style="font-family:Arial,sans-serif;color:#0f172a;">
      <h2 style="margin:0 0 8px;text-align:center;text-transform:uppercase;">${_escape(options.title || 'Biên lai thu tiền')}</h2>
      ${r.clubName ? `<div style="text-align:center;font-weight:700;margin-bottom:10px;">${_escape(r.clubName)}</div>` : ''}
      <div style="font-size:13px;margin-bottom:10px;line-height:1.5;">
        ${r.receiptNo ? `<div><strong>Số:</strong> ${_escape(r.receiptNo)}</div>` : ''}
        ${r.studentName ? `<div><strong>Võ sinh:</strong> ${_escape(r.studentName)}</div>` : ''}
        ${r.branch ? `<div><strong>Cơ sở:</strong> ${_escape(r.branch)}</div>` : ''}
        ${r.date ? `<div><strong>Ngày:</strong> ${_escape(_date(r.date) || r.date)}</div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:6px 4px;text-align:left;border-bottom:1px solid #cbd5e1;">#</th>
            <th style="padding:6px 4px;text-align:left;border-bottom:1px solid #cbd5e1;">Nội dung</th>
            <th style="padding:6px 4px;text-align:center;border-bottom:1px solid #cbd5e1;">SL</th>
            <th style="padding:6px 4px;text-align:right;border-bottom:1px solid #cbd5e1;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>${buildReceiptLinesHtml(r.lines)}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:8px 4px;text-align:right;font-weight:900;">Tổng cộng</td>
            <td style="padding:8px 4px;text-align:right;font-weight:900;">${_escape(r.totalText)}</td>
          </tr>
        </tfoot>
      </table>
      ${r.collector ? `<div style="margin-top:18px;text-align:right;font-size:12px;"><strong>Người thu:</strong> ${_escape(r.collector)}</div>` : ''}
    </div>`;
}

function setReceiptElementHtml(targetOrId, html) {
  const el = typeof targetOrId === 'string' ? document.getElementById(targetOrId) : targetOrId;
  if (!el) return false;
  el.innerHTML = String(html || '');
  return true;
}

function previewReceipt(data = {}, targetOrId = 'receiptPreview') {
  const html = buildReceiptHtml(data);
  return { ok: setReceiptElementHtml(targetOrId, html), html };
}

function printElementById(id = 'receiptContent') {
  const el = document.getElementById(id);
  if (!el) return { ok: false, reason: 'missing-element', id };
  const old = document.body.innerHTML;
  const html = el.innerHTML;
  try {
    document.body.innerHTML = html;
    window.print();
    return { ok: true, id };
  } finally {
    document.body.innerHTML = old;
    try { window.location.reload(); } catch (_) {}
  }
}

function copyReceiptText(data = {}) {
  const r = buildReceiptSummary(data);
  const text = [
    r.clubName,
    r.receiptNo ? `Biên lai: ${r.receiptNo}` : '',
    r.studentName ? `Võ sinh: ${r.studentName}` : '',
    ...r.lines.map(line => `- ${line.label}${line.note ? ` (${line.note})` : ''}: ${_fmtMoney(line.total)}`),
    `Tổng cộng: ${r.totalText}`,
  ].filter(Boolean).join('\n');
  return text;
}

export const ReceiptHelpers = Object.freeze({
  normalizeReceiptLine,
  buildReceiptLinesHtml,
  calculateReceiptTotal,
  buildReceiptSummary,
  buildReceiptHtml,
  setReceiptElementHtml,
  previewReceipt,
  printElementById,
  copyReceiptText,
});

export function initReceiptHelpers() {
  if (typeof window === 'undefined') return ReceiptHelpers;
  window.ReceiptHelpers = window.ReceiptHelpers || ReceiptHelpers;

  // Compatibility wrappers — no override of existing financial/receipt flows.
  window.buildReceiptHtmlSafe = window.buildReceiptHtmlSafe || ReceiptHelpers.buildReceiptHtml;
  window.buildReceiptLinesHtmlSafe = window.buildReceiptLinesHtmlSafe || ReceiptHelpers.buildReceiptLinesHtml;
  window.calculateReceiptTotalSafe = window.calculateReceiptTotalSafe || ReceiptHelpers.calculateReceiptTotal;
  window.previewReceiptSafe = window.previewReceiptSafe || ReceiptHelpers.previewReceipt;
  window.printElementByIdSafe = window.printElementByIdSafe || ReceiptHelpers.printElementById;

  window.__lowRiskHelperExtraction = Object.assign({}, window.__lowRiskHelperExtraction || {}, {
    phase: '4K-6K-F-receipt-qr-helper-extraction',
    writeSafe: true,
    firestoreWrites: false,
    migrated: Array.from(new Set([...(window.__lowRiskHelperExtraction?.migrated || []), 'receiptHelpers'])),
    notMigrated: ['financialActions'],
  });

  window.debugReceiptHelperHealth = window.debugReceiptHelperHealth || function debugReceiptHelperHealth() {
    const sample = {
      studentName: 'Nguyễn Văn A',
      date: '2026-06-08',
      lines: [
        { label: 'Học phí', note: '06/2026', qty: 1, amount: 350000 },
        { label: 'Lệ phí thi', note: 'Quý II', qty: 1, amount: 250000 },
      ],
    };
    const html = ReceiptHelpers.buildReceiptHtml(sample);
    const result = {
      ok: true,
      phase: '4K-6K-F-receipt-qr-helper-extraction',
      hasReceiptHelpers: !!window.ReceiptHelpers,
      functions: {
        buildReceiptHtml: typeof window.ReceiptHelpers?.buildReceiptHtml === 'function',
        buildReceiptLinesHtml: typeof window.ReceiptHelpers?.buildReceiptLinesHtml === 'function',
        calculateReceiptTotal: typeof window.ReceiptHelpers?.calculateReceiptTotal === 'function',
        previewReceipt: typeof window.ReceiptHelpers?.previewReceipt === 'function',
        printElementById: typeof window.ReceiptHelpers?.printElementById === 'function',
      },
      sampleTotal: ReceiptHelpers.calculateReceiptTotal(sample.lines),
      sampleHtmlLength: html.length,
      writeSafe: true,
    };
    console.log('[debugReceiptHelperHealth]', result);
    if (console.table) console.table(result.functions);
    return result;
  };

  return ReceiptHelpers;
}

export default ReceiptHelpers;

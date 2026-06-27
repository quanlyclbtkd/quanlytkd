/**
 * js/utils/formatters.js
 * ────────────────────────────────────────────────────────────────
 * Phase 4K-6K-A — Low-Risk Formatters Extraction Gate
 *
 * Centralizes pure formatting helpers behind a stable module-level owner.
 * This module is intentionally read-only: no Firebase writes, no DOM mutation,
 * no business-flow changes. Legacy globals are kept as compatibility aliases.
 */
import {
  getLocalToday,
  formatDate as _formatDate,
  formatMonth as _formatMonth,
  addMonthsToYYYYMM,
  normalizeYYYYMM,
  formatMonthCompact as _formatMonthCompact,
  getBeltBadge,
} from './format.js';

import {
  escapeForAttr,
  escapeHtml,
  formatVND as _formatVND,
  parseVND as _parseVND,
} from './helpers.js';

function toFiniteNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const normalized = raw
    .replace(/[₫đ\s]/gi, '')
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function parseMoney(value) {
  return toFiniteNumber(value, 0);
}

function formatVNDNumber(value) {
  const n = parseMoney(value);
  return n > 0 ? n.toLocaleString('vi-VN') : '';
}

function formatVNDText(value) {
  const n = parseMoney(value);
  return n.toLocaleString('vi-VN') + ' ₫';
}

function formatCurrency(value, options = {}) {
  const n = parseMoney(value);
  const suffix = options.suffix === false ? '' : ' ₫';
  const showZero = options.showZero !== false;
  if (!showZero && n === 0) return '';
  return n.toLocaleString('vi-VN') + suffix;
}

function safeText(value, fallback = '') {
  const raw = value === null || typeof value === 'undefined' ? fallback : value;
  return escapeHtml(String(raw));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(value) {
  return _formatDate(value);
}

function formatMonth(value) {
  return _formatMonth(value);
}

function formatMonthCompact(value) {
  return _formatMonthCompact(value);
}

function parseVND(value) {
  return _parseVND(value);
}

function formatVND(value) {
  return _formatVND(value);
}

export const Formatters = Object.freeze({
  getLocalToday,
  formatDate,
  formatMonth,
  addMonthsToYYYYMM,
  normalizeYYYYMM,
  formatMonthCompact,
  getBeltBadge,
  escapeForAttr,
  escapeHtml,
  safeText,
  normalizeText,
  toFiniteNumber,
  parseMoney,
  parseVND,
  formatVND,
  formatVNDNumber,
  formatVNDText,
  formatCurrency,
});

export function initFormatters() {
  if (typeof window === 'undefined') return Formatters;

  window.Formatters = window.Formatters || Formatters;

  // Compatibility aliases. Do not override legacy globals that already exist.
  window.safeText = window.safeText || safeText;
  window.normalizeText = window.normalizeText || normalizeText;
  window.parseMoney = window.parseMoney || parseMoney;
  window.parseVNDNumber = window.parseVNDNumber || parseMoney;
  window.formatCurrency = window.formatCurrency || formatCurrency;
  window.formatVNDNumber = window.formatVNDNumber || formatVNDNumber;
  window.formatVNDText = window.formatVNDText || formatVNDText;
  window.formatDate = window.formatDate || formatDate;
  window.formatMonth = window.formatMonth || formatMonth;
  window.formatMonthCompact = window.formatMonthCompact || formatMonthCompact;

  window.__lowRiskHelperExtraction = window.__lowRiskHelperExtraction || {
    phase: '4K-6K-A-formatters-extraction-only',
    writeSafe: true,
    firestoreWrites: false,
    migrated: ['formatters'],
    notMigrated: ['receiptHelpers', 'qrBankingHelpers', 'financialActions'],
  };

  window.debugFormatterHealth = window.debugFormatterHealth || function debugFormatterHealth() {
    const sampleAmount = 350000;
    const result = {
      ok: true,
      phase: '4K-6K-A-formatters-extraction-only',
      hasFormatters: !!window.Formatters,
      functions: {
        formatCurrency: typeof window.Formatters?.formatCurrency === 'function',
        formatVNDNumber: typeof window.Formatters?.formatVNDNumber === 'function',
        formatVNDText: typeof window.Formatters?.formatVNDText === 'function',
        parseMoney: typeof window.Formatters?.parseMoney === 'function',
        formatDate: typeof window.Formatters?.formatDate === 'function',
        formatMonth: typeof window.Formatters?.formatMonth === 'function',
        normalizeText: typeof window.Formatters?.normalizeText === 'function',
        safeText: typeof window.Formatters?.safeText === 'function',
      },
      samples: {
        amount: sampleAmount,
        formatCurrency: window.Formatters?.formatCurrency?.(sampleAmount),
        formatVNDNumber: window.Formatters?.formatVNDNumber?.(sampleAmount),
        formatVNDText: window.Formatters?.formatVNDText?.(sampleAmount),
        parseMoney: window.Formatters?.parseMoney?.('350.000 ₫'),
        formatDate: window.Formatters?.formatDate?.('2026-06-08'),
        formatMonth: window.Formatters?.formatMonth?.('2026-06'),
        normalizeText: window.Formatters?.normalizeText?.('Trương Tình'),
      },
      compatibility: {
        windowFormatCurrency: typeof window.formatCurrency === 'function',
        windowFormatVNDNumber: typeof window.formatVNDNumber === 'function',
        windowFormatVNDText: typeof window.formatVNDText === 'function',
        windowParseMoney: typeof window.parseMoney === 'function',
      },
    };
    console.log('[debugFormatterHealth]', result);
    if (console.table) console.table(result.functions);
    return result;
  };

  window.debugLowRiskHelperExtraction = window.debugLowRiskHelperExtraction || function debugLowRiskHelperExtraction() {
    const result = {
      ok: true,
      phase: '4K-6K-A-formatters-extraction-only',
      scope: 'formatters-only',
      hasFormatters: !!window.Formatters,
      hasReceiptHelpers: !!window.ReceiptHelpers,
      hasQRBankingHelpers: !!window.QRBankingHelpers,
      compatibility: window.__lowRiskHelperExtraction || null,
      protectedFlows: {
        processMultiItem: typeof window.processMultiItem === 'function',
        quickPay: typeof window.quickPay === 'function',
        deleteTx: typeof window.deleteTx === 'function',
        markInvPaid: typeof window.markInvPaid === 'function',
        handleImportExcel: typeof window.handleImportExcel === 'function',
      },
      formatterHealth: typeof window.debugFormatterHealth === 'function'
        ? window.debugFormatterHealth()
        : { ok: false, missing: true },
    };
    console.log('[debugLowRiskHelperExtraction]', result);
    return result;
  };

  return Formatters;
}

export default Formatters;

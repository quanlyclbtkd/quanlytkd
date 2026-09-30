#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = {
  getBranchNameDisplay: v => v,
  normalizeFinanceTransactionType: tx => tx.type || '',
  getFinanceTransactionDisplayType: tx => tx.type || '',
  getBundleDetailSummary: tx => tx.bundleDetailSummary || 'Học phí + Võ phục',
  getBundleSummaryLine: tx => tx.bundleSummaryLine || 'Nguyễn Văn A — Học phí + Võ phục',
};
const { renderTxRow } = await import('../js/ui/render/computation/financeRenderer.js?d1c3b=' + Date.now());

const cases = [
  { id:'single', date:'2026-09-30', branch:'CS1', description:'Nguyễn Văn A', type:'Học phí', txMonth:'2026-09', amount:400000 },
  { id:'package', date:'2026-09-30', branch:'CS1', description:'Nguyễn Văn B Có Tên Rất Dài', type:'Học phí', txMonth:'2026-11', packageMonths:['2026-09','2026-10','2026-11'], amount:1500000 },
  { id:'bundle', date:'2026-09-30', branch:'CS1', description:'Nguyễn Văn C', type:'Học phí + Võ phục', paymentKind:'bundle', txMonth:'2026-09', components:[{kind:'tuition',amount:400000},{kind:'inventory',amount:500000}], amount:900000 },
];
for (const tx of cases) {
  const html = renderTxRow(tx, {
    isSingleBranch:false,
    isAdmin:true,
    branchTdHTML:'<td class="col-branch">CS1</td>',
    btnDel:'<button class="btn-sm js-delete">Xóa</button>',
  });
  for (const cls of ['tx-date-cell','tx-branch-cell','tx-month-cell','tx-name-cell','tx-type-cell','tx-amount-cell','tx-actions-cell']) {
    assert.ok(html.includes(cls), `${tx.id}: missing ${cls}`);
  }
  assert.ok(html.includes('js-print-tuition-receipt'), `${tx.id}: print action missing`);
  assert.ok(html.includes('js-delete'), `${tx.id}: delete action missing`);
}
console.log('PASS UI01 semantic cells exist for single/package/bundle rows');

const css = fs.readFileSync('style.css','utf8');
const marker = '/* ── D1C3B: tuition mobile semantic card geometry (mobile only)';
const start = css.indexOf(marker);
assert.ok(start >= 0, 'D1C3B mobile semantic block missing');
const nextDesktop = css.indexOf('/* ── Phase 4K-5G:', start);
assert.ok(nextDesktop > start, 'desktop boundary after D1C3B mobile block missing');
const mobile = css.slice(start, nextDesktop);
assert.ok(mobile.includes('@media (max-width: 767px)'), 'mobile block must be <=767 only');
assert.ok(!/nth-(?:child|last-child)\s*\(/.test(mobile), 'D1C3B mobile geometry must not depend on column indices');
assert.ok(/\.tx-amount-cell[\s\S]*display:\s*flex[\s\S]*align-items:\s*center[\s\S]*justify-content:\s*flex-end/.test(mobile), 'amount must be flex vertically centered/right aligned');
assert.ok(/\.tx-actions-cell[\s\S]*grid-row:\s*2\s*\/\s*4/.test(mobile), 'actions must span metadata rows');
assert.ok(/\.tx-actions-cell \.btn-sm[\s\S]*min-height:\s*44px/.test(mobile), 'action touch target must remain >=44px');
assert.ok(/\.tx-name-cell[\s\S]*white-space:\s*normal/.test(mobile), 'long names must wrap safely');
assert.ok(/\.tx-amount-cell[\s\S]*white-space:\s*nowrap/.test(mobile), 'amount must not wrap');
assert.ok(css.includes('@media (min-width: 768px)'), 'desktop geometry block must remain');
console.log('PASS UI02 mobile geometry uses semantic classes, centered amount, safe actions, desktop preserved');
console.log('D1C3B tuition mobile compaction gate PASS 2/2');

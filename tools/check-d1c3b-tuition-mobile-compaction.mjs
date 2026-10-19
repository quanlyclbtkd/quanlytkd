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

// R2: layout belongs to existing INLINE CSS actually shipped by index.html;
// unlinked style.css is intentionally NOT used as runtime evidence.
const index = fs.readFileSync('index.html','utf8');
const style = index.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
assert.ok(style.includes('@media (max-width:767px)'), 'mobile media owner exists inline');
assert.ok(/#tbl_tx tbody td\.tx-amount-cell\{[^}]*display:flex !important;flex-direction:column;align-items:flex-end;justify-content:center/.test(style), 'mobile amount centered flex in loaded source');
assert.ok(/#tbl_tx tbody td\.tx-actions-cell\{[^}]*grid-row:2;display:flex !important/.test(style), 'existing action geometry');
assert.ok(/#tbl_tx tbody td\.tx-name-cell\{[^}]*overflow-wrap:anywhere/.test(style), 'long-name wrapping');
assert.ok(index.includes('css/ui-mobile-shell.css'), 'existing UI shell stylesheet loaded');
assert.ok(!fs.readFileSync('css/ui-mobile-shell.css','utf8').includes('D1C3B: tuition mobile semantic card geometry'), 'no competing geometry block in mobile shell');
assert.ok(fs.readFileSync('style.css','utf8').includes('@media (min-width: 768px)'), 'desktop source unchanged');
console.log('PASS UI02 mobile geometry uses semantic classes, centered amount, safe actions, desktop preserved');
console.log('D1C3B tuition mobile compaction gate PASS 2/2');

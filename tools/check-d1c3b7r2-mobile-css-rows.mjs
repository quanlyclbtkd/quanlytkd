import fs from 'node:fs';
globalThis.window={getBranchNameDisplay:v=>v,normalizeFinanceTransactionType:t=>t.type,getFinanceTransactionDisplayType:t=>t.type,getBundleDetailSummary:t=>t.bundleDetailSummary||'Học phí và trang phục thi đấu — gói nhiều tháng, ghi chú kiểm thử rất dài',getBundleSummaryLine:t=>t.description+' — '+t.type};
const {renderTxRow}=await import('../js/ui/render/computation/financeRenderer.js');
const rows=[
{id:'single',date:'2026-10-14',branch:'CS1',description:'Nguyễn An',type:'Học phí',txMonth:'2026-10',amount:350000},
{id:'package',date:'2026-10-14',branch:'CS1',description:'Nguyễn Thị Phương Bảo Quyên Võ Sinh Tên Rất Dài',type:'Học phí',txMonth:'2026-10',packageMonths:['2026-10','2026-11','2026-12'],amount:19500000},
{id:'bundle',date:'2026-10-14',branch:'CS1',description:'Đặng Trường Tường',type:'Học phí + Võ phục',paymentKind:'bundle',components:[{kind:'tuition',amount:350000},{kind:'inventory',amount:650000}],amount:1000000,bundleDetailSummary:'Học phí tháng 10–12, áo thun và võ phục, ghi chú dài kiểm tra bố cục ở 320px'}
];
const html=rows.map(tx=>renderTxRow(tx,{isSingleBranch:false,isAdmin:true,branchTdHTML:'<td class="tx-branch-cell">CS1</td>',btnDel:'<button type="button" class="btn-sm js-delete">🗑 Xóa</button>'})).join('');
fs.writeFileSync(process.argv[2],html);

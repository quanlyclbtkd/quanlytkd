#!/usr/bin/env node
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
globalThis.window={getBranchNameDisplay:v=>v,normalizeFinanceTransactionType:t=>t.type,getFinanceTransactionDisplayType:t=>t.type,getBundleDetailSummary:t=>t.bundleDetailSummary||'Gói nhiều tháng và võ phục',getBundleSummaryLine:t=>t.description+' — '+t.type};
const {renderTxRow}=await import('../js/ui/render/computation/financeRenderer.js');
const base=process.cwd(),pub=path.join(base,'public');
const src=fs.readFileSync(path.join(pub,'index.html'),'utf8');
assert(src.includes('css/ui-mobile-shell.css')&&src.includes('css/tailwind-static.css'),'actual public CSS links missing');
assert(/#tbl_tx tbody td\.tx-amount-cell\{display:flex !important;flex-direction:column;align-items:flex-end;justify-content:center/.test(src),'loaded amount flex rule missing');
const txs=[{id:'single',date:'2026-10-14',description:'Nguyễn An',type:'Học phí',txMonth:'2026-10',amount:350000},{id:'package',date:'2026-10-14',description:'Nguyễn Thị Phương Bảo Quyên Võ Sinh Tên Rất Dài',type:'Học phí',txMonth:'2026-10',packageMonths:['2026-10','2026-11','2026-12'],amount:19500000},{id:'bundle',date:'2026-10-14',description:'Đặng Trường Tường',type:'Học phí + Võ phục',paymentKind:'bundle',components:[{kind:'tuition',amount:350000},{kind:'inventory',amount:650000}],amount:1000000,bundleDetailSummary:'Tháng 10–12, áo thun, võ phục, phụ phí, ghi chú dài',txMonth:'2026-10'}];
const markup=txs.map(t=>renderTxRow(t,{isSingleBranch:false,isAdmin:true,branchTdHTML:'<td class="tx-branch-cell">CS1</td>',btnDel:'<button type="button" class="btn-sm js-delete">Xóa</button>'})).join('');
assert.equal((markup.match(/class="tx-amount-cell/g)||[]).length,3,'actual renderer semantic amount cells');
assert.equal((markup.match(/js-print-tuition-receipt/g)||[]).length,3,'receipt actions preserved');
const temp=process.env.D1C3B7R2_BROWSER_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'d1c3b7r2-css-'));
fs.mkdirSync(temp,{recursive:true});const rendered=path.join(temp,'real-rendered-tx-rows.html');fs.writeFileSync(rendered,markup);
console.log('SOURCE PASS: actual financeRenderer HTML and /public linked loaded rules',temp);
const py=spawnSync(process.env.PYTHON || process.env.CODEX_PRIMARY_RUNTIME_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),[path.join(base,'tools/check-d1c3b7r2-mobile-css-browser.py'),pub,rendered,temp],{encoding:'utf8',timeout:60000});
process.stdout.write(py.stdout||'');process.stderr.write(py.stderr||'');
if(py.error || py.status!==0){console.error('BROWSER NOT VERIFIED / FAIL: Chromium computed geometry required; exit',py.status??py.error?.message);process.exitCode=1}

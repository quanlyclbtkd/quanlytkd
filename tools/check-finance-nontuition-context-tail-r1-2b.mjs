import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd();let pass=0,fail=0;
function check(name,ok,detail=''){console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`);ok?pass++:fail++}
const cases=[
 ['A-F InventoryService context/ref scope','tools/r1_2b/inventory-service-context.mjs'],
 ['G-H Inventory markPaid context/audit tail','tools/r1_2b/inventory-markpaid-context.mjs'],
 ['G Inventory create/edit RED-proven tails','tools/r1_2b/inventory-form-tail.mjs'],
 ['I-J Exam Cancel post-ACK/audit scope','tools/r1_2b/exam-cancel-context.mjs'],
 ['K-L Generic non-Tuition delete tail/audit','tools/r1_2b/generic-delete-context.mjs'],
 ['M-P RED-first deferred flow probes','tools/r1_2b/deferred-probes.mjs']
];
for(const [name,file] of cases){const r=spawnSync(process.execPath,[file],{cwd:ROOT,env:{...process.env,ROOT},encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');check(name,r.status===0,`rc=${r.status}`)}
const fin=fs.readFileSync(path.join(ROOT,'js/modules/finance.js'),'utf8');
const tuition=fs.readFileSync(path.join(ROOT,'js/core/tuitionCommandBoundary.js'),'utf8');
const inv=fs.readFileSync(path.join(ROOT,'js/services/inventory.service.js'),'utf8');
console.log('INFO finance.js bytes (no correctness ceiling):', Buffer.byteLength(fin));
check('R1.2 month-authority anti-regression remains',!/(?:amount|numericAmount)\s*\/\s*(?:feePerMonth|tuitionFee)[\s\S]{0,160}paidMonths/.test(tuition));
check('Inventory projection scope is private/local-only',inv.includes('_projectionScope')&&inv.includes('_projectionScopeCurrent'));
check('No R1.2B writer V2 introduced',!/(?:InventoryWriterV2|FinanceWriterV2|ContextFinanceWriter|deleteTransactionV2)/.test([fin,inv].join('\n')));
console.log(`\nR1.2B GATE: ${pass} PASS / ${fail} FAIL`);if(fail)process.exitCode=1;

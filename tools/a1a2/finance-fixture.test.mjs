import assert from 'node:assert/strict';
import fs from 'node:fs';
import { financeContract } from '../v10/contracts.mjs';
const results=[];
await financeContract();results.push({name:'actual projection owner + actual _doLoad: index, permission, network, stale principal',status:'PASS'});
const changes=[
 ['index classification removed',s=>s.replace(/const isIndexErr =[^;]+;/,'const isIndexErr = false;')],
 ['loading reset broken',s=>s.replaceAll('pgState.isLoading = false;','pgState.isLoading = true;')],
 ['error path clears old rows',s=>s.replace('pgState._loadError = true;','pgState.currentItems = []; pgState._loadError = true;')],
 ['error path calls processPage',s=>s.replace('pgState._loadError = true;','processPage({}, pgState); pgState._loadError = true;')],
 ['stale context guards removed',s=>s.replace(/if \(!pgState\.isCurrentContext\(\)[^\n]+return \{ stale: true \};/g,'')],
];
for(const [name,change]of changes){const original=fs.readFileSync('js/modules/finance.js','utf8');assert.notEqual(change(original),original,name+' must change a source-copy');await assert.rejects(()=>financeContract(change));results.push({name:'mutation caught: '+name,status:'PASS'});}
fs.mkdirSync('handoff/A1A2/evidence/green',{recursive:true});fs.writeFileSync('handoff/A1A2/evidence/green/finance-fixture.json',JSON.stringify({status:'PASS',scope:'Test-copy mutations; runtime files unchanged',results},null,2));
results.forEach(t=>console.log('PASS '+t.name));

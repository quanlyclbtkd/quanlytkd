import fs from 'node:fs';
import assert from 'node:assert/strict';
import {mutateFinanceErrorResets,financeSuccessContract} from '../check-v10-legacy-mutations.mjs';
import {financeContract} from '../v10/contracts.mjs';
const source=fs.readFileSync('js/modules/finance.js','utf8'),results=[];
const test=async(name,fn)=>{await fn();results.push({name,status:'PASS'});console.log('PASS '+name)};
await test('baseline error contracts and actual successful merged page pass',async()=>{await financeContract();await financeSuccessContract()});
const changed=mutateFinanceErrorResets(source);
await test('targeted catch plus finally mutant is killed by unchanged A1 fixture',async()=>assert.rejects(()=>financeContract(()=>changed)));
await test('successful page remains correct under the error-path mutant',async()=>financeSuccessContract(()=>changed));
await test('old single-reset mutation still demonstrates a surviving mutant',async()=>{
 const assertKilled=async mutate=>assert.rejects(()=>financeContract(mutate), 'Surviving mutant must fail the mutation gate');
 await assert.rejects(()=>assertKilled(s=>s.replace('pgState.isLoading = false;','')),/Surviving mutant/);
});
await test('AST mutation leaves the success reset and unrelated functions unchanged',()=>{
 assert(changed.includes('pgState.isLoading    = false;'));
 const prefix='function unrelated(pgState) { pgState.isLoading = false; }\n';
 assert(mutateFinanceErrorResets(prefix+source).startsWith(prefix));
});
await test('a renamed owner or changed target count fails closed',()=>{
 assert.throws(()=>mutateFinanceErrorResets(source.replace('async function _doLoad','async function renamedOwner')),/exactly one _doLoad/);
 const missing=source.replaceAll('pgState.isLoading = false;','pgState.isLoading = true;');
 assert.throws(()=>mutateFinanceErrorResets(missing),/exactly one loading reset/);
});
fs.mkdirSync('handoff/A3/evidence',{recursive:true});
fs.writeFileSync('handoff/A3/evidence/T01-target-controls.json',JSON.stringify({status:'PASS',runtimeModified:false,results},null,2));

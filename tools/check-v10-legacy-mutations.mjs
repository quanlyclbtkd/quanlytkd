import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {parse} from './v11r2/vendor/acorn.mjs';
import {contract,financeContract,examContract,dailyContract,displayContract,authContract,listenerContract,paginationContract,expression} from './v10/contracts.mjs';

function walk(node,visit) {
 if(!node||typeof node!=='object')return;
 if(node.type)visit(node);
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>walk(child,visit));else if(value&&typeof value==='object')walk(value,visit);
}
export function mutateFinanceErrorResets(source) {
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),owners=[];
 walk(ast,node=>{if(node.type==='FunctionDeclaration'&&node.id?.name==='_doLoad')owners.push(node)});
 assert.equal(owners.length,1,'Expected exactly one _doLoad owner');
 const tries=owners[0].body.body.filter(node=>node.type==='TryStatement');
 assert.equal(tries.length,1,'Expected one page-loading try/catch/finally');
 const targets=[];
 for(const [label,block]of [['catch',tries[0].handler?.body],['finally',tries[0].finalizer]]) {
  const matches=[];
  walk(block,node=>{
   const assignment=node.type==='ExpressionStatement'&&node.expression;
   if(assignment?.type==='AssignmentExpression'&&assignment.operator==='='&&assignment.left.type==='MemberExpression'&&
      assignment.left.object.name==='pgState'&&!assignment.left.computed&&assignment.left.property.name==='isLoading'&&
      assignment.right.type==='Literal'&&assignment.right.value===false)matches.push(node);
  });
  assert.equal(matches.length,1,'Expected exactly one loading reset in '+label);
  targets.push(matches[0]);
 }
 // Catch and finally are redundant on failure; remove both in a source-copy.
 // The successful merged-page reset and every other function remain untouched.
 let mutated=source;
 for(const node of targets.sort((a,b)=>b.start-a.start))mutated=mutated.slice(0,node.start)+mutated.slice(node.end);
 assert.notEqual(mutated,source,'Mutation must change two verified statements');
 return mutated;
}

export async function financeSuccessContract(change=source=>source) {
 const source=change(fs.readFileSync('js/modules/finance.js','utf8'));
 const projection=expression(fs.readFileSync('js/modules/finance/finance.pagination.js','utf8'),'function attachTransactionPageProjection',true);
 const state={isLoading:false,currentItems:[{id:'old'}],_displayContextKey:'2026-10|',_loadError:false};
 const store={clubId:'A',auth:{currentUser:{uid:'admin-A'}},userRole:'admin',pagination:{transactions:state}};
 const window={__store:store,userRole:'admin',__verifiedAuthContextState:{generation:1}};
 let queries=0,projections=0;
 const sandbox={pgState:state,store,window,PAGE_SIZE:30,_injectControls(){},_getCurrentMonth:()=> '2026-10',_getCurrentSearch:()=>'',_currentPaginationContextKey:()=> '2026-10|',
  FinanceService:{async getTransactionsPage(){queries++;assert.equal(state.isLoading,true);return {_mergedItems:[{id:'server-row',date:'2026-10-21',txMonth:'2026-10',amount:500000}],_complete:true,_monthState:{},_hasMore:false}}},
  processPage(){throw Error('Merged page must use the existing merged path')},_ensureLiveContext(){},_seedListenerProjection(){},_projectPage(){projections++},console:{error(){},info(){},warn(){}}};
 vm.createContext(sandbox);
 vm.runInContext(projection,sandbox)({store,pgState:state,pageSize:30,getMonth:()=> '2026-10',getSearch:()=>'',getContext:()=> '2026-10|',renderControls(){}});
 const result=await vm.runInContext(expression(source,'async function _doLoad',true),sandbox)(null,'first');
 assert.equal(result.loaded,true);assert.equal(state.isLoading,false);assert.equal(state._requestPending,false);assert.equal(state._loadError,false);
 assert.equal(queries,1);assert.equal(projections,1);assert.equal(state.currentItems[0].id,'server-row');
 return true;
}
const controls=[
 ['scale',dailyContract,s=>s.replace('if (cursor) constraints.push(startAfter(cursor));','')],
 ['search-bindings',dailyContract,s=>s.replace('if (branchConstraint) baseConstraints.push(branchConstraint);','')],
 ['attendance-shift-filter',dailyContract,s=>s.replace("if (shiftId) baseConstraints.push(where('shiftId', '==', shiftId));",'')],
 ['finance-index-errors',financeContract,mutateFinanceErrorResets],
 ['exam-fee-setting',examContract,s=>s.replace('window.getClubExamFee?.()||','')],
 ['profile-display-name-safe-edit',displayContract,s=>s.replaceAll('const nameToken = _actionToken(name);',"const nameToken = _actionToken('wrong-id');").replace('const nameToken      = _actionToken(name);',"const nameToken = _actionToken('wrong-id');")],
 ['club-context-ready',authContract,s=>s.replace('window.currentClubId = ctx.clubId;','')],
 ['profile-hydration',s=>listenerContract('hydrate',s),s=>s.replace('metadata?.fromCache === false && metadata?.hasPendingWrites === false','true')],
 ['active-zero-fallback',s=>listenerContract('zero',s),s=>s.replace("syncLegacyAllProfiles(fullMap, 'full-profiles:admin-authority', { complete: true });","if (Object.keys(fullMap).length) syncLegacyAllProfiles(fullMap, 'full-profiles:admin-authority', { complete: true });")],
 ['coach-branch-runtime-repair',s=>listenerContract('coach',s),s=>s.replace("fbQuery(profRef, fbWhere('branch', '==', coachBranch))","fbQuery(profRef, fbWhere('branch', '==', coachBranch), fbWhere('status','in',['active','trial']))")],
 ['v5q-quit-single-authoritative-pipeline',paginationContract,s=>s.replace("String(metrics.authorityClubId || '') === ctx.clubId","true")],
 ['v5s-quit-context-behavior',s=>listenerContract('hydrate',s),s=>s.replace('metadata?.fromCache === false && metadata?.hasPendingWrites === false','metadata?.fromCache === false')]
];
export async function runLegacyMutations(){
for(const n of ['scale','search','shift','finance','exam','display','auth','hydrate','zero','coach','partial'])assert.equal(await contract(n),true,n);
await financeSuccessContract();
await financeSuccessContract(mutateFinanceErrorResets);
const results=[];
for(const [name,test,mutate] of controls){
 let caught=false;try{await test(mutate);}catch(e){caught=true;}
 assert.equal(caught,true,'Mutation survived: '+name);results.push({gate:name,mutationCaught:true});console.log('CAUGHT',name);
}
if(process.env.V10_MUTATION_OUTPUT)fs.writeFileSync(process.env.V10_MUTATION_OUTPUT,JSON.stringify({positiveContracts:11,financeSuccessControls:2,negativeControls:results},null,2));
console.log('V10 LEGACY CONTRACTS: 11 PASS; MUTATIONS: 12/12 CAUGHT');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runLegacyMutations();

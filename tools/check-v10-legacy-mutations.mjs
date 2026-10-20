import assert from 'node:assert/strict';
import fs from 'node:fs';
import {contract,financeContract,examContract,dailyContract,displayContract,authContract,listenerContract,paginationContract} from './v10/contracts.mjs';
const controls=[
 ['scale',dailyContract,s=>s.replace('if (cursor) constraints.push(startAfter(cursor));','')],
 ['search-bindings',dailyContract,s=>s.replace('if (branchConstraint) baseConstraints.push(branchConstraint);','')],
 ['attendance-shift-filter',dailyContract,s=>s.replace("if (shiftId) baseConstraints.push(where('shiftId', '==', shiftId));",'')],
 ['finance-index-errors',financeContract,s=>s.replace('pgState.isLoading = false;','')],
 ['exam-fee-setting',examContract,s=>s.replace('window.getClubExamFee?.()||','')],
 ['profile-display-name-safe-edit',displayContract,s=>s.replaceAll('const nameToken = _actionToken(name);',"const nameToken = _actionToken('wrong-id');").replace('const nameToken      = _actionToken(name);',"const nameToken = _actionToken('wrong-id');")],
 ['club-context-ready',authContract,s=>s.replace('window.currentClubId = ctx.clubId;','')],
 ['profile-hydration',s=>listenerContract('hydrate',s),s=>s.replace('metadata?.fromCache === false && metadata?.hasPendingWrites === false','true')],
 ['active-zero-fallback',s=>listenerContract('zero',s),s=>s.replace("syncLegacyAllProfiles(fullMap, 'full-profiles:admin-authority', { complete: true });","if (Object.keys(fullMap).length) syncLegacyAllProfiles(fullMap, 'full-profiles:admin-authority', { complete: true });")],
 ['coach-branch-runtime-repair',s=>listenerContract('coach',s),s=>s.replace("fbQuery(profRef, fbWhere('branch', '==', coachBranch))","fbQuery(profRef, fbWhere('branch', '==', coachBranch), fbWhere('status','in',['active','trial']))")],
 ['v5q-quit-single-authoritative-pipeline',paginationContract,s=>s.replace("String(metrics.authorityClubId || '') === ctx.clubId","true")],
 ['v5s-quit-context-behavior',s=>listenerContract('hydrate',s),s=>s.replace('metadata?.fromCache === false && metadata?.hasPendingWrites === false','metadata?.fromCache === false')]
];
for(const n of ['scale','search','shift','finance','exam','display','auth','hydrate','zero','coach','partial'])assert.equal(await contract(n),true,n);
const results=[];
for(const [name,test,mutate] of controls){
 let caught=false;try{await test(mutate);}catch(e){caught=true;}
 assert.equal(caught,true,'Mutation survived: '+name);results.push({gate:name,mutationCaught:true});console.log('CAUGHT',name);
}
if(process.env.V10_MUTATION_OUTPUT)fs.writeFileSync(process.env.V10_MUTATION_OUTPUT,JSON.stringify({positiveContracts:11,negativeControls:results},null,2));
console.log('V10 LEGACY CONTRACTS: 11 PASS; MUTATIONS: 12/12 CAUGHT');

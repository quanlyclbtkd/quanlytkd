import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const root=process.env.R1_2D_TEST_SOURCE_ROOT || path.resolve(import.meta.dirname,'..');
let pass=0,fail=0;
const check=(name,fn)=>{try{fn();pass++;console.log('PASS',name);}catch(e){fail++;console.error('FAIL',name,e.message);}};

globalThis.window={userRole:'admin',__verifiedAuthContextState:{generation:1},txMatchesSelectedMonth:(tx,m)=>tx.txMonth===m};
const {attachTransactionPageProjection}=await import(pathToFileURL(path.join(root,'js/modules/finance/finance.pagination.js')).href+'?r1_2d='+Date.now());
const row={id:'tx-r1-2d',date:'2026-11-03',txMonth:'2026-11',description:'Học phí + Kho Đồ',type:'Học phí',branch:'CS1',amount:630000,timestamp:1};
const store={clubId:'club-a',userRole:'admin',auth:{currentUser:{uid:'admin-a'}},pagination:{},_activeTxReadMode:'canonical'};
const pg={enabled:true,_displayContextKey:'2026-11|',currentItems:[],_mergedAllItems:[],_serverHasMore:false,_monthComplete:true};store.pagination.transactions=pg;window.__store=store;
let renderControls=0;
attachTransactionPageProjection({store,pgState:pg,pageSize:100,getMonth:()=> '2026-11',getSearch:()=>'',getContext:()=> '2026-11|',renderControls:()=>renderControls++});
pg.reconcile({rows:[row],month:'2026-11',source:'commit'});
const epoch={};
// First metadata evidence establishes page completeness but remains untrusted,
// so the acknowledged row is still awaiting-server. This render is legitimate.
pg.reconcile({rows:[row],month:'2026-11',complete:true,source:'snapshot',evidence:{epoch,mode:'canonical',meta:{canonical:{trusted:false,revision:1}},rows:{canonical:[row]},limit:100},metadataOnly:true});
const revisionBeforeServer=pg.projectionRevision;
assert.equal(pg.reconciliation.byId[row.id].state,'awaiting-server');
// Second callback changes reconciliation metadata only: same business row, same
// complete page, now trusted server evidence.
pg.reconcile({rows:[row],month:'2026-11',complete:true,source:'snapshot',evidence:{epoch,mode:'canonical',meta:{canonical:{trusted:true,revision:2}},rows:{canonical:[row]},limit:100},metadataOnly:true});
const statusOnlyRenderDelta=pg.projectionRevision-revisionBeforeServer;
console.log('STATUS_ONLY_RENDER_BASELINE_OR_CANDIDATE',JSON.stringify({statusOnlyRenderDelta,state:pg.reconciliation?.byId?.[row.id]?.state,renderControls}));
check('internal server reconciliation authority remains server-reconciled',()=>assert.equal(pg.reconciliation.byId[row.id].state,'server-reconciled'));
check('awaiting-server -> server-reconciled causes no full projection when visible DOM is unchanged',()=>assert.equal(statusOnlyRenderDelta,0));
const revisionBeforeReview=pg.projectionRevision;
const conflict={...row,amount:630001};
pg.reconcile({rows:[row],month:'2026-11',complete:true,source:'snapshot',evidence:{epoch,mode:'canonical',meta:{canonical:{trusted:true,revision:3}},rows:{canonical:[conflict]},limit:100},metadataOnly:true});
check('actionable needs-review state remains internal',()=>assert.equal(pg.reconciliation.byId[row.id].state,'needs-review'));
check('server-reconciled -> needs-review triggers projection for visible warning',()=>assert(pg.projectionRevision>revisionBeforeReview));

const renderSource=fs.readFileSync(path.join(root,'js/ui/render/renderFinance.js'),'utf8');
const start=renderSource.indexOf('function _appendReconciliationStatus('), end=renderSource.indexOf('// ─── Island render functions',start);
assert(start>=0&&end>start);
const created=[];
const document={createElement(tag){const el={tag,className:'',dataset:{},style:{},textContent:'',children:[],append(...xs){this.children.push(...xs);}};created.push(el);return el;}};
const ctx={document};vm.createContext(ctx);vm.runInContext(renderSource.slice(start,end),ctx);
function makeTarget(id){const appended=[];const cell={append(x){appended.push(x);}};return {appended,target:{children:[{dataset:{txId:id},querySelector(sel){return sel==='.tx-name-cell'?cell:null;}}]}};}
let a=makeTarget(row.id);ctx._appendReconciliationStatus(a.target,{byId:{[row.id]:{state:'server-reconciled',sources:{canonical:'matched'}}}});
check('successful reconciliation diagnostic is hidden',()=>assert.equal(a.appended.length,0));
a=makeTarget(row.id);ctx._appendReconciliationStatus(a.target,{byId:{[row.id]:{state:'awaiting-server',sources:{canonical:'cache'}}}});
check('non-actionable awaiting-server diagnostic is hidden',()=>assert.equal(a.appended.length,0));
a=makeTarget(row.id);ctx._appendReconciliationStatus(a.target,{byId:{[row.id]:{state:'needs-review',sources:{canonical:'conflict'}}}});
check('needs-review warning remains visible',()=>assert.equal(a.appended.length,1));

console.log(`R1_2D_RECONCILIATION_RESULT ${JSON.stringify({pass,fail,total:pass+fail,statusOnlyRenderDelta})}`);
if(fail)process.exit(1);

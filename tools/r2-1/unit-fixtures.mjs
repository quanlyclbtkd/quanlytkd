// Entirely synthetic clocks, DOM and diagnostics. Never staging evidence.
export function makeUnitWindow() {
  let monotonic=0,wall=1700000000000,visible=true,sequence=0;
  const rows=[],observers=[];
  const elements={filterMonth:{value:'2027-01'},filterBranch:{value:'all'},searchInput:{value:''},debtList:{isConnected:true,getClientRects:()=>visible?[{}]:[]}};
  const w={Promise,Date:{now:()=>wall},performance:{now:()=>monotonic},location:{hostname:'unit.fixture.invalid'},document:{getElementById:id=>elements[id]||null},getComputedStyle:()=>({visibility:visible?'visible':'hidden'}),getDebtOverdueFilterValue:()=>0,userRole:'admin',__verifiedAuthContextState:{ready:true,uid:'private-owner',generation:1,sessionEpoch:1,authGeneration:1},__store:{clubId:'private-club',db:{app:{options:{projectId:'unit-fixture-project'}}},selectedMonth:'2027-01',selectedBranch:'all',profiles:{S:{profileId:'private-profile'}}}};
  const context=()=>({clubId:w.__store.clubId,uid:w.__verifiedAuthContextState.uid,generation:w.__verifiedAuthContextState.generation,sessionEpoch:1,authGeneration:1});
  const contextKey=()=>JSON.stringify([w.__store.clubId,elements.filterMonth.value,elements.filterBranch.value,elements.searchInput.value,'0']);
  const tick=(p=10,d=p)=>{monotonic+=p;wall+=d;};
  const addOperation=()=>{const row={operationId:'sync-unit-'+(++sequence),action:'tuition.collect',club:w.__store.clubId,authGeneration:1,debtContextKey:contextKey(),actionStart:wall,primaryWriteStart:wall,primaryWriteAckAt:null,profileServerFreshAt:null,debtRefreshRequestedAt:null,debtComputeStartAt:null,debtComputeEndAt:null,debtRenderAt:null,syncClearedAt:null};rows.push(row);return row;};
  w.getDebtSyncDiagnostics=()=>({active:rows.map(r=>({...r})),history:[]});
  w.MutationObserver=class {constructor(cb){this.cb=cb;this.disconnected=false;observers.push(this);}observe(el,opts){this.el=el;this.opts=opts;}disconnect(){this.disconnected=true;}};
  const F=w.FinanceService={captureFinancialWriteContext:context,isFinancialWriteContextCurrent:c=>c.clubId===context().clubId&&c.uid===context().uid&&c.generation===context().generation&&w.__verifiedAuthContextState.ready===true,captureWriteEvidenceContext:(month,core=context())=>({...core,month,readMode:'legacy'}),getWriteEvidenceMetrics:()=>({reads:0,singleFlightHits:0,requests:[]}),getCurrentMonthEvidenceForWrite:()=>({strictCurrentCoverageComplete:false,serverComplete:false,contextStillCurrent:true}),getCompleteMonthEvidence:()=>Promise.resolve({serverComplete:true,contextStillCurrent:true,sources:[],pageCount:0,documentCount:0}),commitAtomicWritePlan:()=>{tick();return Promise.resolve({committed:2,primaryCommitted:true});}};
  w._fb_init={getDocs:()=>Promise.resolve({docs:[]})};
  w.showToast=()=>undefined;w.exportReceipt=()=>new Promise(()=>{});
  w.quickPay=async function(name){const row=addOperation();await F.commitAtomicWritePlan({expectedContext:context(),transactions:[{}],profileUpdates:[{studentName:name}]});row.primaryWriteAckAt=wall;tick();w.showToast('✅ '+name+' đóng học phí');w.exportReceipt(name);return true;};
  return{w,F,rows,elements,observers,context,contextKey,tick,addOperation,setVisible:value=>{visible=value;},mutate(){for(const o of observers)if(!o.disconnected)o.cb([{type:'childList',target:elements.debtList}]);},fillSync(row=rows.at(-1)){for(const stage of ['profileServerFreshAt','debtRefreshRequestedAt','debtComputeStartAt','debtComputeEndAt','debtRenderAt']){tick();row[stage]=wall;}return row;}};
}

export function prepareHarnessDOM(w,{visible=true}={}) {
  const observers=[];
  w.getComputedStyle=()=>({visibility:visible?'visible':'hidden'});
  w.document.getElementById('debtList').getClientRects=()=>visible?[{}]:[];
  w.MutationObserver=class {constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
  return{mutate(){for(const o of observers)if(!o.disconnected)o.cb([{type:'childList'}]);}};
}

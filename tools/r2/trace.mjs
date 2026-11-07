// RAM-only diagnostic recorder; never imported by the production application.
const allowed=new Set(['actionStart','handlerEnter','boundaryEnter','validationStart','validationEnd','evidenceStart','evidenceEnd','legacyTxMonthStart','legacyTxMonthEnd','legacyDateRangeStart','legacyDateRangeEnd','legacyPackageMonthsStart','legacyPackageMonthsEnd','canonicalAccountingMonthsStart','canonicalAccountingMonthsEnd','recheckStart','recheckEnd','commitStart','primaryAck','successFeedback','commandReturn','receiptQueued','qrQueued','profileLocalSnapshot','profileServerFresh','debtRefreshRequested','debtComputeStart','debtComputeEnd','debtHtmlRetrieved','debtRender']);
const pairs={T_validation:['validationStart','validationEnd'],T_evidence:['evidenceStart','evidenceEnd'],T_recheck:['recheckStart','recheckEnd'],T_commit:['commitStart','primaryAck'],T_click_to_ack:['actionStart','primaryAck'],T_ack_to_feedback:['primaryAck','successFeedback'],T_ack_to_return:['primaryAck','commandReturn'],T_ack_to_server_fresh:['primaryAck','profileServerFresh'],T_server_fresh_to_debt_compute:['profileServerFresh','debtComputeStart'],T_debt_compute:['debtComputeStart','debtComputeEnd'],T_ack_to_debt_render:['primaryAck','debtRender']};
export function createRecorder({enabled=false,clock=()=>performance.now(),context=()=>({}),level='UNIT_TEST',maxTraces=80,maxEvents=256}={}) {
  const rows=[];let current=null,seq=0,on=enabled===true;
  const salt=globalThis.crypto?.randomUUID?.()||String(performance.now());
  const fingerprint=value=>{let h=2166136261;for(const ch of salt+'|'+String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');};
  const seal=c=>JSON.stringify([c.clubId,c.uid,c.generation,c.sessionEpoch,c.authGeneration,c.profileId,c.ready,c.role]);
  const has=(row,marker)=>row.events.some(e=>e.marker===marker);
  const syncStates=new Set(['SYNC_COMPLETE','SYNC_PENDING','SYNC_NOT_APPLICABLE','SYNC_STALE_CONTEXT','SYNC_NOT_VISIBLE']);
  const evidenceLevel=['STATIC','UNIT_TEST','EMULATOR','STAGING','REAL_DEVICE'].includes(level)?level:'UNIT_TEST';
  let captured='';
  const api={
    enable(value=true){on=value===true;if(!on){current=null;captured='';}},
    begin(meta={}){
      if(!on)return null;
      // Financial completion, not pending synchronization, controls overlap.
      const overlapping=!!current&&!has(current,'commandReturn');
      if(overlapping)current.ambiguous=true;
      const c=context();captured=seal(c);
      current={traceId:'r2-'+fingerprint(salt)+'-'+(++seq),commandType:['QuickPay','DebtCollect','TransactionForm','FamilyCombo'].includes(meta.commandType)?meta.commandType:'QuickPay',monthCount:Number.isInteger(meta.monthCount)?meta.monthCount:0,evidenceMode:['LEGACY','CANONICAL','MIXED'].includes(meta.evidenceMode)?meta.evidenceMode:'UNKNOWN',evidenceLevel,clubContextFingerprint:fingerprint([c.clubId,c.uid,c.generation,c.sessionEpoch,c.authGeneration].join('|')),profileContextFingerprint:fingerprint(c.profileId),events:[],staleDrops:0,financialStale:false,syncStale:false,truncated:false,ambiguous:overlapping,syncVisible:null,externalSyncState:null};
      rows.push(current);while(rows.length>maxTraces)rows.shift();api.mark('actionStart');return current.traceId;
    },
    mark(marker){
      if(!on||!current||!allowed.has(marker)||current.ambiguous)return false;
      if(seal(context())!==captured){current.staleDrops++;if(has(current,'commandReturn'))current.syncStale=true;else current.financialStale=true;return false;}
      if(current.events.length>=maxEvents){current.truncated=true;return false;}
      const at=clock();if(!Number.isFinite(at))return false;current.events.push({marker,at});return true;
    },
    setAmbiguous(){if(on&&current)current.ambiguous=true;},
    setSyncVisibility(value){if(on&&current&&typeof value==='boolean')current.syncVisible=value;},
    setSyncStatus(state){if(on&&current&&syncStates.has(state))current.externalSyncState=state;},
    source(source,end=false){const names={byTxMonth:'legacyTxMonth',byDate:'legacyDateRange',byPackageMonth:'legacyPackageMonths',canonical:'canonicalAccountingMonths'};if(names[source])api.mark(names[source]+(end?'End':'Start'));},
    syncStage(stage){const names={profilePendingSnapshotAt:'profileLocalSnapshot',profileServerFreshAt:'profileServerFresh',debtRefreshRequestedAt:'debtRefreshRequested',debtComputeStartAt:'debtComputeStart',debtComputeEndAt:'debtComputeEnd',debtRenderAt:'debtHtmlRetrieved'};if(names[stage])api.mark(names[stage]);},
    export(){return rows.map(row=>{
      const events=row.events.map(e=>({...e})),metrics={};
      for(const [name,[a,b]]of Object.entries(pairs)){const starts=events.filter(e=>e.marker===a),ends=events.filter(e=>e.marker===b);metrics[name]=starts.length&&ends.length?ends.at(-1).at-starts[0].at:null;}
      const ack=has(row,'primaryAck'),returned=has(row,'commandReturn'),clean=!row.ambiguous&&!row.truncated&&!row.financialStale;
      const primaryWriteClassification=ack?'PRIMARY_WRITE_ACKNOWLEDGED':!clean?'PRIMARY_WRITE_UNKNOWN':returned?(has(row,'commitStart')?'PRIMARY_WRITE_FAILED':'NO_PRIMARY_WRITE'):'PRIMARY_WRITE_PENDING';
      let syncState=row.externalSyncState||'SYNC_PENDING';
      if(row.financialStale||row.syncStale)syncState='SYNC_STALE_CONTEXT';
      else if(returned&&!ack)syncState='SYNC_NOT_APPLICABLE';
      else if(row.syncVisible===false)syncState='SYNC_NOT_VISIBLE';
      else if(has(row,'profileServerFresh')&&has(row,'debtComputeEnd')&&has(row,'debtRender'))syncState='SYNC_COMPLETE';
      const preAckComplete=clean&&has(row,'actionStart')&&ack;
      const postAckComplete=clean&&ack&&returned;
      const syncComplete=clean&&!row.syncStale&&syncState==='SYNC_COMPLETE';
      const fullAttributionComplete=preAckComplete&&postAckComplete&&syncComplete;
      return{...row,events,metrics,primaryWriteClassification,financialCommandComplete:clean&&returned,preAckComplete,postAckComplete,syncState,syncComplete,fullAttributionComplete,completeForAttribution:fullAttributionComplete,metricClock:'performance.now / monotonic; milliseconds at declared evidence level'};
    });},
    clear(){rows.length=0;current=null;captured='';}
  };return Object.freeze(api);
}

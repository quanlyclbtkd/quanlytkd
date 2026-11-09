// Test page only. Every read/write/commit/retry delegates to Browser SDK 10.7.1.
// This file is never imported by the application.
export async function installInventoryClient({projectId,port,clientId,uid,role,clubId}) {
  if(projectId!=='demo-a9r18-inventory-r11'||Number(port)!==8180)throw Error('ISOLATED_DEMO_ENDPOINT_REQUIRED');
  const appSDK=await import('/tools/a9r13/vendor/firebase-10.7.1/firebase-app.js');
  const sdk=await import('/tools/a9r13/vendor/firebase-10.7.1/firebase-firestore.js');
  if(appSDK.SDK_VERSION!=='10.7.1')throw Error('BROWSER_SDK_VERSION_MISMATCH');
  const app=appSDK.initializeApp({projectId,apiKey:'demo-inventory-r11-key',appId:'demo-inventory-r11-app'},clientId);
  const db=sdk.initializeFirestore(app,{experimentalForceLongPolling:true});
  sdk.connectFirestoreEmulator(db,'127.0.0.1',Number(port),uid?{mockUserToken:{sub:uid,user_id:uid}}:undefined);
  sdk.setLogLevel('error');
  const state={clientId,uid,role,clubId,sdkVersion:appSDK.SDK_VERSION,operation:null,serial:0};
  const plain=value=>{
    if(typeof value==='number'&&!Number.isFinite(value))return {nonFinite:String(value)};
    if(Array.isArray(value))return value.map(plain);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v!=='function').map(([k,v])=>[k,plain(v)]));
    return value;
  };
  const errorInfo=error=>({code:error?.code||null,message:error?.message||String(error),cause:error?.cause?errorInfo(error.cause):null});
  function event(kind,extra={}){const row={sequence:state.operation.events.length,kind,performanceNow:performance.now(),dateNow:Date.now(),...plain(extra)};state.operation.events.push(row);return row;}
  function runtime(club=clubId,generation=1){
    window.userRole=role;window.currentClubId=club;
    window.__store={db,clubId:club,invRef:sdk.collection(db,'clubs',club,'inventory'),colRef:sdk.collection(db,'clubs',club,'transactions'),currentUser:uid?{uid}:null,inventory:[],transactions:[]};
    window.__verifiedAuthContextState={uid:uid||'',clubId:club,role,ready:!!uid,generation,sessionEpoch:1,authGeneration:1};
  }
  runtime();
  const projection=(kind,...args)=>{state.operation.projections.push(event(kind,{args,activeClub:window.__store.clubId,generation:window.__verifiedAuthContextState.generation}));};
  window.mergeInventoryIntoRuntimeStore=(...a)=>projection('mergeInventoryIntoRuntimeStore',...a);
  window.removeInventoryFromRuntimeStore=(...a)=>projection('removeInventoryFromRuntimeStore',...a);
  window.mergeTransactionIntoRuntimeStore=(...a)=>projection('mergeTransactionIntoRuntimeStore',...a);
  window.notifyInventoryMutation=(...a)=>projection('notifyInventoryMutation',...a);
  window.getLocalToday=()=> '2026-11-08';
  async function acknowledge(result,transport){
    event('real-sdk-ack',{transport});
    if(state.operation.control.postAckClub){window.__store.clubId=state.operation.control.postAckClub;window.__verifiedAuthContextState.generation++;event('post-ack-context-change',{activeClub:window.__store.clubId});}
    await window.__r11AckHook({clientId,operation:state.operation.name,hold:state.operation.control.holdAfterAck===true});
    event('transport-promise-return',{transport});return result;
  }
  const bridge={...sdk,
    runTransaction:async(database,callback,options)=>{
      const op=state.operation;op.runTransactionCalls++;event('real-runTransaction-start');
      try {
        const result=await sdk.runTransaction(database,async transaction=>{
          const attempt=++op.callbackAttempts;event('sdk-callback-start',{attempt});
          const proxy={
            async get(ref){
              const record={attempt,path:ref.path,status:'STARTED',readStart:performance.now()};op.reads.push(record);
              try {
                const snapshot=await transaction.get(ref);
                Object.assign(record,{status:'RETURNED',exists:snapshot.exists(),data:plain(snapshot.data()),readEnd:performance.now(),metadata:{fromCache:snapshot.metadata.fromCache,hasPendingWrites:snapshot.metadata.hasPendingWrites}});
                event('real-transaction-read-returned',record);
                await window.__r11ReadHook({clientId,operation:op.name,attempt,path:ref.path,data:record.data,exists:record.exists});
                if(op.control.changeGenerationAfterRead){op.control.changeGenerationAfterRead=false;window.__verifiedAuthContextState.generation++;event('pre-commit-context-change');}
                return snapshot;
              } catch(error){record.status='REJECTED';record.error=errorInfo(error);throw error;}
            },
            set(...args){event('transaction-set',{attempt,path:args[0].path});transaction.set(...args);return proxy;},
            update(...args){event('transaction-update',{attempt,path:args[0].path});transaction.update(...args);return proxy;},
            delete(...args){event('transaction-delete',{attempt,path:args[0].path});transaction.delete(...args);return proxy;},
          };
          return callback(proxy);
        },options);
        return await acknowledge(result,'transaction');
      } catch(error){event('real-runTransaction-rejected',{error:errorInfo(error)});throw error;}
    },
    writeBatch:database=>{
      const real=sdk.writeBatch(database);const proxy={
        set(...args){event('batch-set',{path:args[0].path});real.set(...args);return proxy;},
        update(...args){event('batch-update',{path:args[0].path});real.update(...args);return proxy;},
        delete(...args){event('batch-delete',{path:args[0].path});real.delete(...args);return proxy;},
        async commit(){return acknowledge(await real.commit(),'batch');},
      };return proxy;
    },
  };
  window._fb_init=bridge;
  const {InventoryService}=await import('/js/services/inventory.service.js');
  const snapshot=()=>plain({...state,db:undefined});
  async function run(args){
    runtime(args.clubId||clubId);
    state.operation={name:args.name,method:args.method,principal:uid||'unauthenticated',club:args.clubId||clubId,sku:(args.item?.category||'Võ phục')+'|||'+(args.item?.size||'170'),input:plain(args),control:{...(args.control||{})},runTransactionCalls:0,callbackAttempts:0,reads:[],events:[],projections:[],startedAt:performance.now()};
    const op=state.operation;
    try {
      if(args.method==='addItem')op.value=await InventoryService.addItem(args.item);
      else if(args.method==='updateItem')op.value=await InventoryService.updateItem(args.id,args.data,args.options||{});
      else if(args.method==='deleteItem')op.value=await InventoryService.deleteItem(args.id,args.options||{});
      else if(args.method==='envelope'){
        const prepared=InventoryService.prepareAddItemMutation(args.item);
        const batch=InventoryService.createStockMutationBatch({mutations:[{item:prepared.payload,direction:1}],writeClubId:prepared.writeClubId,projectionScope:prepared.projectionScope});
        batch.update(sdk.doc(db,'clubs',op.club,'profiles','P_TEST'),{notes:'accepted transport fixture'});
        batch.set(prepared.itemRef,prepared.payload);
        batch.set(prepared.statsRef,prepared.summaryPatch,{merge:true});
        batch.set(sdk.doc(db,'clubs',op.club,'transactions','tx-envelope'),{type:'Thu Võ phục',amount:100,date:'2026-11-08',relatedInvId:prepared.itemRef.id});
        op.preparedItemId=prepared.itemRef.id;
        await batch.commit();op.value={itemId:prepared.itemRef.id};
      } else throw Error('UNKNOWN_TEST_OPERATION');
      op.ok=true;
    } catch(error){op.ok=false;op.error=errorInfo(error);}
    op.finishedAt=performance.now();op.durationMs=op.finishedAt-op.startedAt;event('service-operation-return',{ok:op.ok});return snapshot().operation;
  }
  window.__r11={run,snapshot,identity:{clientId,uid:uid||null,role,clubId,sdkVersion:appSDK.SDK_VERSION,projectId,moduleUrl:'/js/services/inventory.service.js',moduleFunctions:Object.keys(InventoryService),appName:app.name,hasOwnFirestore:true}};
  return window.__r11.identity;
}

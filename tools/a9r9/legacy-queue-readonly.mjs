// A9R9: single-purpose operator-triggered fingerprint of the *legacy* IndexedDB
// queue, independent of app queue processor. NEVER import offline-queue.js.
// No readwrite transaction, no upgrade, no write, no replay or raw record export.
const stable=v=>JSON.stringify(v&&typeof v==='object'?(Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))]))):v);
async function digest(v,subtle){const bytes=new TextEncoder().encode(stable(v));return [...new Uint8Array(await subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const bad=(reason)=>{throw Object.assign(new Error('A9R9_LOCAL_READ_BLOCKED: '+reason),{code:reason})};
async function listDatabases(idb){if(typeof idb?.databases!=='function')bad('IDB_ENUMERATION_UNAVAILABLE');const arr=await idb.databases();if(!Array.isArray(arr))bad('IDB_ENUMERATION_INVALID');return arr.map(x=>x.name).filter(x=>typeof x==='string').sort();}
async function storeCount(idb,name,store){
 return new Promise((resolve,reject)=>{
  const request=idb.open(name);let finished=false;
  const fail=(err)=>{if(!finished){finished=true;reject(err instanceof Error?err:Error(String(err)))}};
  request.onupgradeneeded=()=>{try{request.transaction?.abort()}catch{}fail(Error('DB_ABSENT_RACE_OR_UPGRADE_FORBIDDEN'))};
  request.onblocked=()=>fail(Error('DB_OPEN_BLOCKED'));
  request.onerror=()=>fail(request.error||Error('DB_OPEN_FAILED'));
  request.onsuccess=()=>{
   const db=request.result;
   if(finished){db.close();return;}
   if(!db.objectStoreNames.contains(store)){db.close();finished=true;resolve({state:'STORE_ABSENT',rowCount:0});return;}
   try{
    const tx=db.transaction(store,'readonly');const count=tx.objectStore(store).count();
    tx.onerror=tx.onabort=()=>{db.close();fail(tx.error||Error('READONLY_TRANSACTION_FAILED'))};
    tx.oncomplete=()=>{const rowCount=count.result;db.close();if(!Number.isSafeInteger(rowCount)||rowCount<0)return fail(Error('INVALID_QUEUE_COUNT'));finished=true;resolve({state:rowCount===0?'EMPTY':'NONEMPTY',rowCount});};
   }catch(e){db.close();fail(e)}
  };
 });
}
export async function inspectLegacyQueue({projectId,clubId,expectedOrigin,environment='staging'}, {idb=globalThis.indexedDB,origin=globalThis.location?.origin,subtle=globalThis.crypto?.subtle}={}){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||'')||projectId==='quanly-tst'||!clubId||clubId.includes('/')||origin!==expectedOrigin||!subtle||environment!=='staging')bad('SCOPE_MUST_BE_SEPARATE_STAGING');
 const before=await listDatabases(idb);
 let result=before.includes('taekwondo_cache')?await storeCount(idb,'taekwondo_cache','offline_queue'):{state:'DB_ABSENT',rowCount:0};
 const after=await listDatabases(idb);
 if(stable(before)!==stable(after))bad('IDB_INVENTORY_CHANGED_DURING_READ');
 const content={kind:'A9R9_READONLY_LEGACY_QUEUE_INVENTORY',schema:1,projectId,clubId,origin,environment,
   capturedAt:new Date().toISOString(),database:'taekwondo_cache',store:'offline_queue',state:result.state,rowCount:result.rowCount,
   complete:true,mutations:0,noRawRecordsExported:true,dbNamesBefore:before,dbNamesAfter:after};
 return {content,sha256:await digest(content,subtle)};
}

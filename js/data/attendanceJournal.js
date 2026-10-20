// Storage component of the existing attendance owner. No SDK, timer or writer.
// IndexedDB transactions serialize enqueue/claim/ACK across real browser tabs.
import {JOURNAL_DATABASE,attendanceIntentId,attendanceIntentTarget} from '../core/attendanceContract.js';
let databasePromise;
const active = item => ['pending','inflight','conflict','needs-review'].includes(item.state);
const maxSequence=rows=>rows.reduce((max,row)=>Math.max(max,Number(row.sequence)||0),0);
const samePrincipal=(row,scope)=>row.principal?.uid===scope.uid && row.principal?.role===scope.role;
const scopeMatches=(row,scope)=>row.record?.clubId===scope.clubId &&
    (scope.role!=='coach'||!row.principal||row.principal.uid===scope.uid) &&
    (scope.role!=='coach'||row.record?.branch===scope.coachBranch||
     scope.coachBranch==='CS1'&&row.record?.branch==='Mặc định');
const openDatabase=()=>{
    if (!globalThis.indexedDB) return Promise.reject(Object.assign(new Error('Trình duyệt chưa cho phép lưu điểm danh trên thiết bị.'),{code:'attendance/journal-unavailable'}));
    if (!databasePromise) databasePromise=new Promise((resolve,reject)=>{
        const request=indexedDB.open(JOURNAL_DATABASE,1);
        request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('intents',{keyPath:'id'});db.createObjectStore('meta',{keyPath:'key'});};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();databasePromise=null;};resolve(db);};
        request.onerror=()=>{databasePromise=null;reject(request.error);};
        request.onblocked=()=>reject(Object.assign(new Error('Cần đóng phiên cũ để mở nhật ký điểm danh.'),{code:'attendance/journal-blocked'}));
    });return databasePromise;
};
async function atomic(operation) {
    const db=await openDatabase();return new Promise((resolve,reject)=>{
        const tx=db.transaction(['intents','meta'],'readwrite'),intents=tx.objectStore('intents'),meta=tx.objectStore('meta');
        let value;tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Không lưu được nhật ký điểm danh.'));
        const all=intents.getAll();all.onsuccess=()=>{try{value=operation({tx,intents,meta,rows:all.result});}catch(error){tx.abort();reject(error);}};
    });
}
export const AttendanceJournal=Object.freeze({
    async enqueue(records,principal) {
        // All input is prepared before opening the transaction (no await inside).
        const entries=records.map(record=>({id:attendanceIntentId(),record:{...record},createdAt:Date.now()}));
        return atomic(({intents,meta,rows})=>{
            const saved=[];
            for(const entry of entries){
                const target=attendanceIntentTarget(entry.record),parents=rows.filter(x=>x.target===target&&!['superseded','kept-server'].includes(x.state));
                const parent=parents.sort((a,b)=>b.sequence-a.sequence)[0];
                const sequence=maxSequence(rows)+1;
                let baseVersion=String(entry.record.baseVersion||'unknown'),dependsOn='';
                if(parent&&active(parent)){baseVersion=parent.id;dependsOn=parent.id;}
                const row={...entry,target,sequence,baseVersion,originalBaseVersion:String(entry.record.baseVersion||'unknown'),dependsOn,
                    principal:{uid:principal.uid,role:principal.role,clubId:principal.clubId,coachBranch:principal.coachBranch||''},
                    state:baseVersion==='unknown'||(parent&&active(parent)&&(!samePrincipal(parent,principal)||['conflict','needs-review'].includes(parent.state)))?'needs-review':'pending'};
                intents.add(row);rows.push(row);saved.push(row);
                meta.put({key:'latest:'+target,id:row.id});
            }return saved;
        });
    },
    async list(scope) {return atomic(({rows})=>rows.filter(x=>scopeMatches(x,scope)).sort((a,b)=>a.sequence-b.sequence));},
    async claim(scope,ownerId,count=10,now=Date.now()) {
        return atomic(({intents,rows})=>{
            const claimed=[],targets=new Set(),byId=new Map(rows.map(r=>[r.id,r]));
            for(const row of rows.sort((a,b)=>a.sequence-b.sequence)){
                if(!scopeMatches(row,scope)||!samePrincipal(row,scope)||targets.has(row.target)||claimed.length>=count)continue;
                const expired=row.state==='inflight'&&row.leaseUntil<=now;
                if(row.state!=='pending'&&!expired)continue;
                if(row.dependsOn&&byId.get(row.dependsOn)?.state!=='acked')continue;
                row.state='inflight';row.ownerId=ownerId;row.claimId=attendanceIntentId();row.leaseUntil=now+60000;
                intents.put(row);claimed.push({...row});targets.add(row.target);
            }return claimed;
        });
    },
    async acknowledge(claims,acknowledgedIds) {
        const ids=new Set(acknowledgedIds);
        return atomic(({intents,rows})=>{
            let count=0;
            for(const claim of claims){const row=rows.find(x=>x.id===claim.id);
                if(ids.has(claim.id)&&row?.state==='inflight'&&row.claimId===claim.claimId){row.state='acked';row.ackedAt=Date.now();delete row.ownerId;delete row.claimId;delete row.leaseUntil;intents.put(row);count++;}
            }
            // Retain recent ACKs for recovery and audit; never prune a parent
            // referenced by a live intent. No deletion of pending/conflict rows.
            const parents=new Set(rows.filter(active).map(r=>r.dependsOn));
            rows.filter(r=>r.state==='acked'&&!r.legacySource&&r.ackedAt<Date.now()-30*86400000&&!parents.has(r.id)).forEach(r=>intents.delete(r.id));
            return count;
        });
    },
    async release(claims,error) {
        return atomic(({intents,rows})=>{
            for(const claim of claims){const row=rows.find(x=>x.id===claim.id);
                if(row?.state!=='inflight'||row.claimId!==claim.claimId)continue;
                const conflict=error?.conflicts?.some(x=>x.id===row.id);
                const review=error?.reviewIds?.includes(row.id)||String(error?.code||'').includes('permission-denied')||String(error?.code||'').includes('intent-reuse');
                row.state=conflict?'conflict':review?'needs-review':'pending';row.lastError=String(error?.code||'unavailable');
                if(error?.conflicts)row.serverConflict=error.conflicts.find(x=>x.id===row.id)||null;
                delete row.ownerId;delete row.claimId;delete row.leaseUntil;intents.put(row);
            }
        });
    },
    async importLegacy(scope,storage=globalThis.localStorage) {
        if(!storage)return 0;
        const candidates=[];
        for(let i=0;i<storage.length;i++){
            const key=storage.key(i);if(!key?.startsWith('offline_att_'))continue;
            const raw=storage.getItem(key);let payload;try{payload=JSON.parse(raw);}catch{continue;}
            if(!payload||payload.clubId!==scope.clubId)continue;
            const list=payload.version===2?[payload]:Object.values(payload.records||{}).map(r=>({...r,clubId:payload.clubId,date:r?.date||payload.date}));
            const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key+'\n'+raw))),b=>b.toString(16).padStart(2,'0')).join('');
            list.forEach((r,i)=>{const shiftId=String(r.shiftId||''),date=String(r.date||''),name=String(r.name||r.profileId||'');
                const record={...r,clubId:scope.clubId,name,profileId:String(r.profileId||name),date,month:date.slice(0,7),shiftId,shiftMode:shiftId?'explicit-shift':'legacy-no-shift',docId:r.docId||(name+'_'+date+(shiftId?'_'+shiftId:'')),operation:Number(r.status)===0?'delete':'set',status:Number(r.status)};
                if(scopeMatches({record},scope))candidates.push({id:'legacy-'+digest+'-'+i,record,legacySource:{key,raw,digest},target:attendanceIntentTarget(record)});
            });
        }
        return atomic(({intents,rows})=>{const known=new Set(rows.map(x=>x.id));let added=0,seq=maxSequence(rows);
            for(const entry of candidates)if(!known.has(entry.id)){intents.add({...entry,sequence:++seq,baseVersion:'unknown',state:'needs-review',createdAt:Date.now()});known.add(entry.id);added++;}
            // Never compare/remove the mutable legacy key. It is migration input,
            // not an active publisher; each distinct raw snapshot is retained once.
            return added;
        });
    },
    async keepServer(id,scope) {return atomic(({intents,rows})=>{
        const row=rows.find(x=>x.id===id);
        if(!row||!scopeMatches(row,scope)||!active(row)||row.state==='inflight')throw new Error('Thao tác đang được xử lý hoặc tài khoản/cơ sở đã thay đổi.');
        row.state='kept-server';row.resolvedAt=Date.now();intents.put(row);
        const children=new Set([id]);
        for(const child of rows.sort((a,b)=>a.sequence-b.sequence))if(active(child)&&children.has(child.dependsOn)){
            if(child.state==='inflight')throw new Error('Thao tác liên quan đang được xử lý.');
            child.state='needs-review';child.lastError='attendance/parent-resolved';intents.put(child);children.add(child.id);
        }
        return true;
    });},
    async rebase(id,serverVersion,principal) {
        const newId=attendanceIntentId();return atomic(({intents,rows})=>{const old=rows.find(x=>x.id===id);if(!old||!scopeMatches(old,principal)||!active(old)||old.state==='inflight'||!serverVersion||serverVersion==='unknown')throw new Error('Trạng thái đã thay đổi.');
            const row={id:newId,record:{...old.record,baseVersion:serverVersion},target:old.target,sequence:maxSequence(rows)+1,baseVersion:serverVersion,originalBaseVersion:serverVersion,dependsOn:'',state:'pending',createdAt:Date.now(),principal:{...principal},reviewedFrom:id};
            old.state='superseded';old.supersededBy=newId;intents.put(old);intents.add(row);
            const parents=new Set([id]);
            for(const child of rows.sort((a,b)=>a.sequence-b.sequence))if(active(child)&&parents.has(child.dependsOn)){
                if(child.state==='inflight')throw new Error('Thao tác liên quan đang được xử lý.');
                child.state='needs-review';child.lastError='attendance/parent-resolved';intents.put(child);parents.add(child.id);
            }
            return row;
        });
    },
});

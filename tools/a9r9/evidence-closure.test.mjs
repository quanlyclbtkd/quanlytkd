import assert from 'node:assert/strict';
import {test} from 'node:test';
import {webcrypto} from 'node:crypto';
import {sha} from '../v11r3/proof.mjs';
import {checkJournalEvidence,evaluateEvidencePackage} from './evidence-closure.mjs';
import {inspectLegacyQueue} from './legacy-queue-readonly.mjs';
import {generate} from './generate-device-snippet.mjs';
const initial={kind:'SCOPED_DEVICE_LEGACY_BACKUP',rawDeleted:false,versionSchemaChanged:false,projectId:'a9r9-staging',clubId:'clb1',origin:'https://staging.example.org',actor:{uid:'u',role:'coach'},localStorage:[],journalRows:[],meta:[],unscopedLegacyCount:0,excludedForeignV3Count:0};
const mk=(over={})=>{const content={...initial,...over};return{content,backupSHA256:sha(content)}};
const qi=(state='EMPTY',rowCount=0)=>{const content={kind:'A9R9_READONLY_LEGACY_QUEUE_INVENTORY',projectId:'a9r9-staging',clubId:'clb1',origin:'https://staging.example.org',state,rowCount,mutations:0,complete:true};return{content,sha256:sha(content)}};
const ack=(id,sequence,originalBaseVersion='legacy')=>({id,state:'acked',sequence,principal:{uid:'u',role:'coach',clubId:'clb1'},record:{clubId:'clb1',docId:'p1_2026-10-23'},originalBaseVersion});
const server=(v)=>new Map([['clubs/clb1/attendance/p1_2026-10-23',{fields:{attendanceVersion:{stringValue:v}}}]]);
const codes=(b,q,s)=>checkJournalEvidence(b,q,s,'device-A').map(x=>x.code);

test('empty verified queue and device without unsettled journal gives no local issues',()=>assert.deepEqual(codes(mk(),qi(),new Map()),[]));
test('missing inventory blocks',()=>assert(codes(mk(),undefined,new Map()).includes('LEGACY_QUEUE_UNVERIFIED_OR_NONEMPTY')));
test('nonempty legacy offline queue blocks',()=>assert(codes(mk(),qi('NONEMPTY',1),new Map()).includes('LEGACY_QUEUE_UNVERIFIED_OR_NONEMPTY')));
test('tampered device hash blocks',()=>{const b=mk();b.content.clubId='wrong';assert(codes(b,qi(),new Map()).includes('DEVICE_BACKUP_HASH_MISMATCH'))});
test('V1/V2 raw legacy demands manual reconciliation',()=>assert(codes(mk({localStorage:[{key:'offline_att_x',raw:'{}'}]}),qi(),new Map()).includes('V1_V2_LEGACY_REQUIRES_MANUAL_RECONCILIATION')));
test('inflight blocks',()=>assert(codes(mk({journalRows:[{...ack('a',1),state:'inflight'}]}),qi(),server('a')).includes('UNRESOLVED_V3_INTENT')));
test('ACK without committed server document blocks',()=>assert(codes(mk({journalRows:[ack('a',1)]}),qi(),new Map()).includes('ACK_SERVER_DOCUMENT_NOT_FOUND')));
test('ACK server version mismatch blocks',()=>assert(codes(mk({journalRows:[ack('a',1)]}),qi(),server('b')).includes('ACK_LAST_SERVER_VERSION_MISMATCH')));
test('last ACK matches server',()=>assert.deepEqual(codes(mk({journalRows:[ack('a',1)]}),qi(),server('a')),[]));
test('ACK chain cannot be inferred solely from date order',()=>assert(codes(mk({journalRows:[ack('a',1),ack('b',2)]}),qi(),server('b')).includes('ACK_CHAIN_NOT_PROVEN')));
test('ACK chain linked by original base version',()=>assert.deepEqual(codes(mk({journalRows:[ack('a',1),ack('b',2,'a')]}),qi(),server('b')),[]));
test('foreign principal blocked',()=>assert(codes(mk({journalRows:[{...ack('a',1),principal:{uid:'hacker',role:'coach',clubId:'clb1'}}]}),qi(),server('a')).includes('JOURNAL_PRINCIPAL_UNVERIFIED')));
test('no server snapshot never yields release approval',()=>{const r=evaluateEvidencePackage({plan:{projectId:'a9r9-staging',clubIds:['clb1']},devices:[]});assert.equal(r.status,'RELEASE_HOLD');assert.equal(r.releaseApproved,false);assert(r.issues.some(x=>x.code==='S01_SERVER_SNAPSHOT_NOT_PROVIDED'))});
test('production project forbidden',()=>{const r=evaluateEvidencePackage({plan:{projectId:'quanly-tst'}});assert.equal(r.status,'RELEASE_HOLD');assert.equal(r.releaseApproved,false)});
test('device snippet refuses production',()=>assert.throws(()=>generate({projectId:'quanly-tst',clubId:'x',expectedOrigin:'https://example.org',environment:'staging'})));
function fakeIdb(db=true,store=true,count=0){return {databases:async()=>db?[{name:'taekwondo_cache'}]:[],open(name){const request={};setImmediate(()=>{
 if(!db){request.transaction?.abort();request.onupgradeneeded?.();return;}
 const result={objectStoreNames:{contains:()=>store},close(){},transaction(name,mode){assert.equal(mode,'readonly');const tx={objectStore(){return {count(){const r={};setImmediate(()=>{r.result=count;tx.oncomplete?.()});return r;}}}};return tx;}};
 request.result=result;request.onsuccess?.();
 });return request;}}}
const inp={projectId:'a9r9-staging',clubId:'clb1',expectedOrigin:'https://staging.example.org',environment:'staging'};
const env=db=>({idb:db,origin:inp.expectedOrigin,subtle:webcrypto.subtle});
test('legacy DB genuinely absent',async()=>{const r=await inspectLegacyQueue(inp,env(fakeIdb(false)));assert.equal(r.content.state,'DB_ABSENT');assert.equal(r.content.mutations,0)});
test('legacy object store genuinely absent',async()=>{const r=await inspectLegacyQueue(inp,env(fakeIdb(true,false)));assert.equal(r.content.state,'STORE_ABSENT')});
test('legacy queue empty',async()=>{const r=await inspectLegacyQueue(inp,env(fakeIdb(true,true,0)));assert.equal(r.content.state,'EMPTY');assert.equal(r.content.rowCount,0)});
test('legacy queue non-empty is observed, not deleted',async()=>{const r=await inspectLegacyQueue(inp,env(fakeIdb(true,true,4)));assert.equal(r.content.state,'NONEMPTY');assert.equal(r.content.rowCount,4);assert.equal(r.content.mutations,0)});
test('untrusted origin blocked',async()=>await assert.rejects(inspectLegacyQueue(inp,{...env(fakeIdb()),origin:'https://unexpected.example'}),/SCOPE_MUST_BE_SEPARATE_STAGING/));
test('manual resolution lacking provenance must hold',()=>assert(codes(mk({journalRows:[{...ack('a',1),state:'kept-server'}]}),qi(),new Map()).includes('MANUAL_RESOLUTION_PROVENANCE_MISSING')));
test('missing signed fleet manifest remains HOLD',()=>{const r=evaluateEvidencePackage({plan:{projectId:'a9r9-staging'},devices:[{deviceId:'d1'}]});assert(r.issues.some(x=>x.code==='SIGNED_DEVICE_FLEET_MISSING'));assert.equal(r.releaseApproved,false)});

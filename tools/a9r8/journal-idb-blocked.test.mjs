import assert from 'node:assert/strict';
import fs from 'node:fs';
const {AttendanceJournal}=await import('../../js/data/attendanceJournal.js');
// Reproduce a real IndexedDB onblocked event with an operator-side, isolated
// fake. This only verifies the promise/connection lifecycle, not browser IDB.
let opens=0,lateClosed=0;
const requests=[];
globalThis.userRole='admin';globalThis.currentClubId='C';
globalThis.__store={clubId:'C',currentClubId:'C',userRole:'admin',currentUser:{uid:'A'}};
globalThis.__verifiedAuthContextState={ready:true,uid:'A',role:'admin',clubId:'C',generation:1,branchGeneration:1};
globalThis.indexedDB={open(){opens++;const req={};requests.push(req);queueMicrotask(()=>req.onblocked?.());return req;}};
await assert.rejects(AttendanceJournal.list(),e=>e.code==='attendance/journal-blocked');
assert.equal(opens,1,'first blocked open made one request');
await assert.rejects(AttendanceJournal.list(),e=>e.code==='attendance/journal-blocked');
assert.equal(opens,2,'retry MUST make a fresh indexedDB.open after blocked');
requests[0].result={close(){lateClosed++;}};
requests[0].onsuccess();
assert.equal(lateClosed,1,'late success of old rejected open MUST close its database connection');
await assert.rejects(AttendanceJournal.list(),e=>e.code==='attendance/journal-blocked');
assert.equal(opens,3,'third explicit retry remains possible');
fs.mkdirSync('qa_results_a9r8',{recursive:true});
fs.writeFileSync('qa_results_a9r8/journal-idb-blocked.json',JSON.stringify({pass:3,fail:0,opens,lateClosed,scope:'Mock IndexedDB lifecycle only; not end-to-end browser evidence'},null,2));
console.log('A9R8 INDEXEDDB BLOCKED RETRY PASS 3/3');

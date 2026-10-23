import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const hash=f=>crypto.createHash('sha256').update(read(f)).digest('hex');
let count=0;
function pass(title,fn){fn();count++;console.log('PASS',title);}
pass('A9R3 exact Firestore Rules hash preserved',()=>assert.equal(hash('firestore.rules'),'23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad'));
pass('A9R5R2 exact Coach ACL owner hash preserved',()=>assert.equal(hash('js/core/coachBranchRuntimeRepair.js'),'3c5d5d7a95390ce8438552d48947b293a2878dd480c399c4964effce82012068'));
pass('Coach attendance contract remains locked',()=>assert.match(read('js/core/attendanceContract.js').toString(),/HISTORY_COACH_ACCESS\s*=\s*false/));
pass('Firestore Coach attendance remains locked',()=>assert.match(read('firestore.rules').toString(),/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;\s*\}/));
pass('Attendance implementation preserved',()=>{
 const base=process.env.A9R6_BASE_SOURCE;
 if(!base)return;assert.equal(hash('js/modules/attendance.js'),crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'js/modules/attendance.js'))).digest('hex'));
});
pass('app.js root/public exact parity',()=>assert.equal(hash('app.js'),hash('public/app.js')));
pass('auth owner root/public exact parity',()=>assert.equal(hash('js/core/coachBranchRuntimeRepair.js'),hash('public/js/core/coachBranchRuntimeRepair.js')));
pass('journal source root/public exact parity',()=>assert.equal(hash('js/data/attendanceJournal.js'),hash('public/js/data/attendanceJournal.js')));
console.log(`A9R6_PROTECTED_BOUNDARIES ${count}/${count} PASS`);

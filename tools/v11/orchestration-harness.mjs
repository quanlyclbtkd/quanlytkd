// Test-only journal port for DAILY/SHIFT orchestration tests, which do not test
// browser storage. Real IndexedDB invariants are tested in journal-mutations.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
export async function orchestrationModule(){
 const rows=[];
 const journal={async enqueue(records,principal){return records.map(record=>{const row={id:crypto.randomUUID(),record:{...record},baseVersion:record.baseVersion,state:record.baseVersion==='unknown'?'needs-review':'pending',principal};rows.push(row);return row})},async list(scope){return rows.filter(r=>r.record.clubId===scope.clubId)},async importLegacy(){return 0},async claim(){return []},async acknowledge(){return 0},async release(){}};
 const key='__testAttendanceJournal_'+crypto.randomUUID().replaceAll('-','');globalThis[key]=journal;
 const file=path.resolve('js/modules/attendance.js');let code=fs.readFileSync(file,'utf8');
 code=code.replace("import { AttendanceJournal } from '../data/attendanceJournal.js';",`const AttendanceJournal=globalThis.${key};`);
 code=code.replace(/from\s+['"]([^'"]+)['"]/g,(all,spec)=>spec.startsWith('.')?"from '"+new URL(spec,pathToFileURL(file)).href+"'":all);
 const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 return {module,rows};
}

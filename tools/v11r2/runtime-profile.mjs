// Source/SDK compatibility verification only. This never approves a release,
// fabricates cutover evidence, or changes application authorization.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runtimeHash} from './cutover.mjs';
import {verifySourceIdentity} from './source-identity.mjs';
import {buildImportGraph,affectedModules,assertCacheGraph,buildTag} from './import-graph.mjs';

export function verifyRuntimeProfile(root=process.cwd()) {
 const fingerprint=runtimeHash(root);
 const identity=verifySourceIdentity(root,fingerprint);
 assert.equal(runtimeHash(path.join(root,'public')),fingerprint,'Root/public runtime parity');
 const main=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
 assert.equal(buildTag(main).tag,identity.buildTag,'Pinned build tag');
 const graph=buildImportGraph(root);
 assertCacheGraph(graph,affectedModules(graph),identity.buildTag);
 const contract=fs.readFileSync(path.join(root,'js/core/attendanceContract.js'),'utf8');
 const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
 const enabled=/export const HISTORY_COACH_ACCESS = (true|false);/.exec(contract);
 const serverGate=/function coachAttendanceCutoverOpen\(\)\s*\{\s*return (true|false);\s*\}/.exec(rules);
 const authority=/export const HISTORY_AUTHORITY = '([^']+)'/.exec(contract)?.[1];
 assert(enabled&&serverGate&&authority,'Explicit client/server attendance profile');
 assert.equal(enabled[1],serverGate[1],'Coach attendance gate alignment');
 assert(rules.includes("data.get('historyAuthority', '') == '"+authority+"'"),'Exact authority alignment');
 return {identity,authority,coachAccess:enabled[1]==='true',scope:'source-integrity-and-sdk-compatibility-only'};
}

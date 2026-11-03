// Source/SDK compatibility verification only. This never approves a release,
// fabricates cutover evidence, or changes application authorization.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runtimeHash} from './cutover.mjs';
import {verifySourceIdentity} from './source-identity.mjs';
import {buildImportGraph,affectedModules,assertCacheGraph,buildTag,cacheToken} from './import-graph.mjs';

export function verifyRuntimeProfile(root=process.cwd()) {
 const fingerprint=runtimeHash(root);
 const identity=verifySourceIdentity(root,fingerprint);
 assert.equal(runtimeHash(path.join(root,'public')),fingerprint,'Root/public runtime parity');
 const main=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
 assert.equal(buildTag(main).tag,identity.buildTag,'Pinned build tag');
 const graph=buildImportGraph(root);
 if (Array.isArray(identity.cacheLineageScopes)) {
  const scopedTokens = new Map();
  for (const lineage of identity.cacheLineageScopes) {
   assert(lineage && typeof lineage.token === 'string' && Array.isArray(lineage.edges), 'Invalid cache-lineage scope');
   for (const [from,to] of lineage.edges) {
    const key = from + '->' + to;
    assert(!scopedTokens.has(key), 'Duplicate cache-lineage edge: ' + key);
    scopedTokens.set(key, lineage.token);
    const edge = graph.edges.find(item => item.from === from && item.to === to);
    assert(edge, 'Scoped cache-lineage edge missing: ' + from + ' -> ' + to);
    assert.equal(cacheToken(edge.url), lineage.token, 'Scoped cache-lineage token mismatch: ' + from + ' -> ' + to);
   }
  }
  const scope = affectedModules(graph);
  const scoped = new Set(scope);
  for (const edge of graph.edges.filter(item => scoped.has(item.to))) {
   const key = edge.from + '->' + edge.to;
   if (scopedTokens.has(key)) continue;
   assert.equal(cacheToken(edge.url), identity.buildTag, 'Unchanged authority edge token drift: ' + key);
  }
  assert(scope.every(file => graph.files.includes(file)), 'Authority module unreachable');
 } else if (identity.cacheLineageToken && Array.isArray(identity.cacheLineageEdges)) {
  const scopedKeys = new Set(identity.cacheLineageEdges.map(([from,to]) => from + '->' + to));
  for (const [from,to] of identity.cacheLineageEdges) {
   const edge = graph.edges.find(item => item.from === from && item.to === to);
   assert(edge, 'Scoped cache-lineage edge missing: ' + from + ' -> ' + to);
   assert.equal(cacheToken(edge.url), identity.cacheLineageToken, 'Scoped cache-lineage token mismatch: ' + from + ' -> ' + to);
  }
  const scope = affectedModules(graph);
  const scoped = new Set(scope);
  for (const edge of graph.edges.filter(item => scoped.has(item.to))) {
   const key = edge.from + '->' + edge.to;
   if (scopedKeys.has(key)) continue;
   assert.equal(cacheToken(edge.url), identity.buildTag, 'Unchanged authority edge token drift: ' + key);
  }
  assert(scope.every(file => graph.files.includes(file)), 'Authority module unreachable');
 } else {
  assertCacheGraph(graph,affectedModules(graph),identity.buildTag);
 }
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

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from './v11r2/vendor/acorn.mjs';
import { runtimeHash } from './v11r2/cutover.mjs';
import { verifySourceIdentity } from './v11r2/source-identity.mjs';
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
export function describeFinanceWriteApp(source){
 const tree=parse(source,{ecmaVersion:'latest',sourceType:'script'}),bodies={},globals=[];
 function clean(n){
  if(!n||typeof n!=='object')return n;
  if(Array.isArray(n))return n.map(clean);
  if(n.type==='AssignmentExpression'&&n.left?.type==='MemberExpression'&&n.left.object?.name==='window'){
   const name=n.left.property?.name;if(name)globals.push(name);
   if(name==='processMultiItem'){assert(!bodies[name]);bodies[name]=sha(source.slice(n.right.start,n.right.end));return{type:'ApprovedFinanceWriteOwner',name};}
  }
  return Object.fromEntries(Object.entries(n).filter(([k])=>!['start','end','raw','loc'].includes(k)).map(([k,v])=>[k,clean(v)]));
 }
 const outside=clean(tree);assert.deepEqual(Object.keys(bodies),['processMultiItem']);
 return{bytes:Buffer.byteLength(source),SHA256:sha(source),outsideProcessMultiItemAST_SHA256:sha(JSON.stringify(outside)),ownerBodySHA256:bodies,windowAssignments:globals.sort()};
}
export function verifyFinanceWriteAppWaiver(root=process.cwd()){
 try{
  const m=JSON.parse(fs.readFileSync(path.join(root,'tools/v11r2/manifests/FIN_WRITE_R1_1_APP_CORE_GUARD.json'),'utf8'));
  assert.equal(m.baseline.SHA256,'c3b240ac9c7e9fd28403926f09b8ab71043774d8b0ada7e886da6ce9adf4eb13');
  assert.equal(m.baseline.bytes,702900);
  assert.equal(m.baseline.outsideProcessMultiItemAST_SHA256,m.approved.outsideProcessMultiItemAST_SHA256);
  assert.deepEqual(m.baseline.windowAssignments,m.approved.windowAssignments);
  const actual=describeFinanceWriteApp(fs.readFileSync(path.join(root,'app.js'),'utf8'));
  assert.deepEqual(actual,m.approved,'Exact approved processMultiItem correctness hunk required');
  assert(actual.bytes-m.baseline.bytes>0&&actual.bytes-m.baseline.bytes<=4096);
  const pin=verifySourceIdentity(root,runtimeHash(root));assert.equal(pin.id,'V11R6_A9R18_FINANCE_WRITE_EVIDENCE_R1_1');
  return{ok:true,byteDelta:actual.bytes-m.baseline.bytes,unchangedOutsideProcessMultiItem:true};
 }catch(e){return{ok:false,reason:e.message};}
}

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { describeFinanceWriteApp } from './check-fin-write-r1-1-app-guard.mjs';
import { runtimeHash } from './v11r2/cutover.mjs';
import { verifySourceIdentity } from './v11r2/source-identity.mjs';
export function verifyTuitionIntentContextAppWaiver(root=process.cwd()){
  try{
    const pin=verifySourceIdentity(root,runtimeHash(root));
    const isR1_2A1=pin.id==='V11R6_A9R18_FINANCE_DELETE_CONTEXT_TAIL_R1_2A1';
    const isR1_2A=pin.id==='V11R6_A9R18_FINANCE_TUITION_INTENT_CONTEXT_R1_2A';
    assert(isR1_2A1||isR1_2A,'Approved R1.2A/R1.2A1 source identity required');
    const manifestName=isR1_2A1
      ? 'DELETE_CONTEXT_TAIL_R1_2A1_APP_CORE_GUARD.json'
      : 'TUITION_INTENT_CONTEXT_R1_2A_APP_CORE_GUARD.json';
    const m=JSON.parse(fs.readFileSync(path.join(root,'tools/v11r2/manifests',manifestName),'utf8'));
    if(isR1_2A1){
      assert.equal(m.baseline.SHA256,'7f2b65a8d54d76abf8003c4c84d23afd7848b8d7cc2b744735be66d17c8df341');
      assert.equal(m.baseline.bytes,707510);
    }else{
      assert.equal(m.baseline.SHA256,'15e70cd7d7ba5239b476f52e7a467148284b102858ebeeaca373d53fbff5b33b');
      assert.equal(m.baseline.bytes,704778);
    }
    assert.equal(m.baseline.outsideProcessMultiItemAST_SHA256,m.approved.outsideProcessMultiItemAST_SHA256);
    assert.deepEqual(m.baseline.windowAssignments,m.approved.windowAssignments);
    const actual=describeFinanceWriteApp(fs.readFileSync(path.join(root,'app.js'),'utf8'));
    assert.deepEqual(actual,m.approved,'Exact approved processMultiItem correctness hunk required');
    assert(actual.bytes-m.baseline.bytes>0&&actual.bytes-m.baseline.bytes<=4096);
    return{ok:true,phase:pin.id,byteDelta:actual.bytes-m.baseline.bytes,unchangedOutsideProcessMultiItem:true};
  }catch(e){return{ok:false,reason:e.message};}
}

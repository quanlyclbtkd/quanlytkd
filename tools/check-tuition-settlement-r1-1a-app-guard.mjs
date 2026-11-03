import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { describeFinanceWriteApp } from './check-fin-write-r1-1-app-guard.mjs';
import { runtimeHash } from './v11r2/cutover.mjs';
import { verifySourceIdentity } from './v11r2/source-identity.mjs';
export function verifyTuitionSettlementAppWaiver(root=process.cwd()){
  try{
    const m=JSON.parse(fs.readFileSync(path.join(root,'tools/v11r2/manifests/TUITION_SETTLEMENT_R1_1A_APP_CORE_GUARD.json'),'utf8'));
    assert.equal(m.baseline.SHA256,'5bb96e3c2beeca629f595108ce7ca948869e7a7317f5fed505a5a8c10b79401d');
    assert.equal(m.baseline.bytes,703994);
    assert.equal(m.baseline.outsideProcessMultiItemAST_SHA256,m.approved.outsideProcessMultiItemAST_SHA256);
    assert.deepEqual(m.baseline.windowAssignments,m.approved.windowAssignments);
    const actual=describeFinanceWriteApp(fs.readFileSync(path.join(root,'app.js'),'utf8'));
    assert.deepEqual(actual,m.approved,'Exact approved R1.1A processMultiItem correctness hunk required');
    assert(actual.bytes-m.baseline.bytes>0&&actual.bytes-m.baseline.bytes<=2048);
    const pin=verifySourceIdentity(root,runtimeHash(root));
    assert.ok([
      'V11R6_A9R18_FINANCE_TUITION_SETTLEMENT_R1_1A',
      'V11R6_A9R18_FINANCE_TUITION_QUICKPAY_MONTH_AUTHORITY_R1_2',
    ].includes(pin.id), `R1.1A app correctness proof must remain attached to an accepted descendant source identity, got ${pin.id}`);
    return{ok:true,byteDelta:actual.bytes-m.baseline.bytes,unchangedOutsideProcessMultiItem:true};
  }catch(e){return{ok:false,reason:e.message};}
}

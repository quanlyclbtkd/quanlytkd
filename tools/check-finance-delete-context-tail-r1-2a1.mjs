#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const root = process.cwd();
let pass = 0, fail = 0;
const ok = (name, cond, detail='') => { if (cond) { pass++; console.log('✅ '+name); } else { fail++; console.error('❌ '+name+(detail?' — '+detail:'')); } };
const run = (label, rel) => {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(process.execPath, [path.resolve(root, rel), root], { cwd: root, stdio: 'inherit' });
  ok(label+' behavioral group exits 0', r.status === 0, `rc=${r.status}`);
};
run('A-G Delete Context / Reconcile', 'tools/r1_2a1/check-delete-context.mjs');
run('H-K Post-ACK Final Tail', 'tools/r1_2a1/check-post-ack-tail.mjs');
run('L-N Financial Audit Original Intent', 'tools/r1_2a1/check-audit-context.mjs');

const read = f => fs.readFileSync(path.resolve(root,f),'utf8');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,f))).digest('hex');
const tcb=read('js/core/tuitionCommandBoundary.js'), svc=read('js/services/finance.service.js'), fin=read('js/modules/finance.js'), app=read('app.js'), audit=read('js/core/financialActionAuditGuard.js'), pkg=JSON.parse(read('package.json'));
ok('P1 R1.2 month authority remains selected/canonical months',/const paidMonths = monthsList\.slice\(\)/.test(tcb)&&!/Math\.(floor|round|ceil)\s*\([^)]*numericAmount\s*\//.test(tcb));
ok('P2 delete captures financial operation context before deferred _run',tcb.indexOf('captureFinancialWriteContext?.()')<tcb.indexOf("_run('tuition.deleteTransaction'"));
ok('P3 delete single-flight identity includes financial context token',tcb.includes('financialWriteContextToken?.(operationContext)')&&tcb.includes('const deleteIdentity = `${operationToken}|${id}`'));
ok('P4 delete evidence derives per-month context from original operation context',tcb.includes('captureWriteEvidenceContext?.(month, operationContext)')&&tcb.includes('expectedContext: evidenceContext'));
ok('P5 delete/profile service APIs remain backward compatible with optional expectedContext',svc.includes('async deleteTransaction(txId, { expectedContext = null } = {})')&&svc.includes('async updateProfileAfterTxDelete(studentName, newPaidUntil, deletedMonths, { expectedContext = null } = {})'));
ok('P6 context-bound delete/profile refs use original club',svc.includes("const clubId = expectedContext?.clubId || _clubId()")&&svc.includes("doc(_db(), 'clubs', clubId, 'transactions', id)")&&svc.includes("doc(_db(), 'clubs', clubId, 'profiles', studentName)"));
ok('P7 QuickPay/Form/Combo final tail recheck original context',fin.includes('!_finCtxCurrent(intent.financialContext)')&&fin.includes('!_finCtxCurrent(expectedContext)'));
ok('P8 MultiItem pay final tail rechecks original context',app.includes("if(action==='pay'&&!_miContextCurrent())"));
ok('P9 trusted explicit audit intent controls original club/user snapshot',audit.includes('trustedExplicitIntent ? trustedExplicitIntent.clubId : _getClubId()')&&audit.includes('trustedExplicitIntent ? trustedExplicitIntent.user : _getUserInfo()'));
ok('P10 untrusted explicit audit intent is not persisted',audit.includes('if (!explicitIntent || trustedExplicitIntent)')&&audit.includes('audit-untrusted-intent'));
ok('P11 Tuition collect/delete and MultiItem pass same audit intent through stages',tcb.includes("_audit('tuition.quickPay', 'before', auditPayload, auditIntent)")&&tcb.includes("_audit('transaction.delete', 'before', auditPayload, auditIntent)")&&app.includes("{ intent: _miAuditIntent }"));
ok('P12 Debt canonical helper unchanged from protected R1.2A hash',sha('js/core/tuitionDebtCanonical.js')==='3755b877d8e0be7cc72aa986eca3b3e723d493717fa6631de4fe1d367327e92e');
ok('P13 Rules unchanged from protected R1.2A hash',sha('firestore.rules')==='1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3');
ok('P14 Indexes unchanged from protected R1.2A hash',sha('firestore.indexes.json')==='72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2');
ok('P15 new phase gate is included in default check',String(pkg.scripts?.check||'').includes('check:finance-delete-context-tail-r1-2a1'));
ok('P16 new phase gate is included in check:all',String(pkg.scripts?.['check:all']||'').includes('check:finance-delete-context-tail-r1-2a1'));
console.log(`\nFINANCE-DELETE-CONTEXT-TAIL-R1.2A1: ${fail?`FAIL ${fail}`:`PASS ${pass}/${pass}`}`);
if(fail)process.exit(1);

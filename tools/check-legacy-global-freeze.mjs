/**
 * Phase 4K-6V5U5 — Legacy Global Freeze Gate
 * This phase does not try to remove all globals; it prevents new global debt and
 * freezes ownership of protected high-risk flows.
 */
import { readFileSync, statSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';

const root=process.cwd();
const read=rel=>readFileSync(path.join(root,rel),'utf8');
const baseline=JSON.parse(read('tools/v5u5-legacy-global-baseline.json'));
const app=read('app.js');
const sha=rel=>createHash('sha256').update(readFileSync(path.join(root,rel))).digest('hex');
let pass=0,fail=0;
const check=(label,cond,hint='')=>{if(cond){console.log('✅ PASS ',label);pass++;}else{console.error('❌ FAIL ',label);if(hint)console.error('       💡',hint);fail++;}};

const appGlobals=new Set((app.match(/window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g)||[]).map(m=>m.replace(/^window\./,'').replace(/\s*=$/,'')));
let modules='';
import { readdirSync } from 'fs';
function walk(dir){for(const ent of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()&&ent.name.endsWith('.js'))modules+=readFileSync(p,'utf8')+'\n';}}
walk(path.join(root,'js'));
const moduleGlobals=new Set((modules.match(/window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g)||[]).map(m=>m.replace(/^window\./,'').replace(/\s*=$/,'')));
const duplicate=[...appGlobals].filter(x=>moduleGlobals.has(x));
const metrics={
  appSizeBytes:statSync(path.join(root,'app.js')).size,
  appLines:app.split('\n').length,
  windowAssignments:(app.match(/window\.[A-Za-z_$][A-Za-z0-9_$]*\s*=/g)||[]).length,
  duplicateGlobals:duplicate.length,
};

console.log('\n🧊 Phase 4K-6V5U5 — Legacy Global Freeze Gate\n');
console.log('BEFORE:', baseline);
console.log('AFTER :', metrics);
check('Baseline được ghi nhận từ Phase V5U4 source thật', baseline.baselineSource?.includes('V5U4'));
check(`window assignment count không tăng (${metrics.windowAssignments} <= ${baseline.windowAssignments})`, metrics.windowAssignments <= baseline.windowAssignments);
check(`duplicate global count không tăng (${metrics.duplicateGlobals} <= ${baseline.duplicateGlobals})`, metrics.duplicateGlobals <= baseline.duplicateGlobals);
check('GlobalOwnershipRegistry không bị sửa trong phase', sha('js/core/globalOwnershipRegistry.js')===baseline.globalOwnershipRegistrySha256);
check('legacyAppAudit không bị sửa trong phase', sha('js/core/legacyAppAudit.js')===baseline.legacyAppAuditSha256);

const protectedFlows=[
  'renderApp','scheduleRender','switchTab','initSaaSDatabase','listenToData',
  'processMultiItem','quickPay','deleteTx','markInvPaid','cancelExamPayment',
  'getChargeableTuitionMonths','computeTuitionDebtCanonical'
];
for(const name of protectedFlows) check(`Protected flow vẫn hiện diện trong app.js: ${name}`, app.includes(name));

const sa=read('js/modules/superadmin.js');
check('Maintenance API được gắn vào SuperAdminModule thay vì window global mới', /cleanupLegacyAdminCredentials:\s*_cleanupLegacyAdminCredentials/.test(sa) && !/window\.cleanupLegacyAdminCredentials\s*=/.test(sa));
check('Không Proxy toàn bộ window', !/new\s+Proxy\s*\(\s*window/.test(app+modules));
check('Không thêm setInterval auth/recovery loop trong vùng V5U5', !/Phase 4K-6V5U5[\s\S]{0,4000}setInterval\s*\(/.test(app));

console.log(`\n📊 Metrics V5U5\n  app.js: ${baseline.appSizeBytes} -> ${metrics.appSizeBytes} bytes\n  lines: ${baseline.appLines} -> ${metrics.appLines}\n  window assignments: ${baseline.windowAssignments} -> ${metrics.windowAssignments}\n  duplicate globals: ${baseline.duplicateGlobals} -> ${metrics.duplicateGlobals}`);
console.log(`\n📊 Kết quả: ${pass} PASS / ${fail} FAIL`);
if(fail) process.exit(1);
console.log('✅ Legacy Global Freeze Gate PASS.\n');

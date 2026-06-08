#!/usr/bin/env node
import fs from 'fs';

const main = fs.readFileSync('js/main.js', 'utf8');
const modPath = 'js/core/productionStabilityGate.js';
const mod = fs.existsSync(modPath) ? fs.readFileSync(modPath, 'utf8') : '';
const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });

add('has productionStabilityGate module', fs.existsSync(modPath));
add('exports ProductionStabilityGate', mod.includes('export const ProductionStabilityGate'));
add('exports initProductionStabilityGate', mod.includes('export function initProductionStabilityGate'));
add('defines debugProductionStabilityGate', mod.includes('debugProductionStabilityGate'));
add('defines debugFinancialSafetySnapshot', mod.includes('debugFinancialSafetySnapshot'));
add('defines debugSuperAdminStatsReadiness', mod.includes('debugSuperAdminStatsReadiness'));
add('defines debugExcelImportVtfReadiness', mod.includes('debugExcelImportVtfReadiness'));
add('module is read-only: no updateDoc/setDoc/addDoc/deleteDoc', !/\b(updateDoc|setDoc|addDoc|deleteDoc|writeBatch)\b/.test(mod));
add('main imports initProductionStabilityGate', main.includes("./core/productionStabilityGate.js") && main.includes('initProductionStabilityGate'));
add('main initializes production stability gate', main.includes('initProductionStabilityGate()'));
add('runtime smoke includes production gate', main.includes('debugProductionStabilityGate') && main.includes('productionStabilityGateOk'));
add('runtime smoke includes financial snapshot', main.includes('debugFinancialSafetySnapshot') && main.includes('financialSafetySnapshotOk'));
add('runtime smoke includes SuperAdmin readiness', main.includes('debugSuperAdminStatsReadiness') && main.includes('superAdminStatsReadinessOk'));
add('runtime smoke includes Excel VTF readiness', main.includes('debugExcelImportVtfReadiness') && main.includes('excelImportVtfReadinessOk'));
add('SuperAdmin client aggregation hard stop still present', main.includes('debugSuperAdminAggregationHardStop') && fs.readFileSync('js/modules/superadmin.js','utf8').includes('__saDisableBackgroundCountRefresh'));
add('Excel VTF protections still present', app.includes('debugExcelImportVtfUpsert') && app.includes('Không cập nhật paidUntil cho võ sinh đã tồn tại'));
add('processMultiItem still present in app.js', app.includes('window.processMultiItem'));
add('APP_BUILD_VERSION updated', main.includes("4K-6J-production-stability-gate-20260608"));
add('index cache bust updated', index.includes('production-stability-gate-20260608'));
add('package script registered', !!pkg.scripts?.['check:production-stability-gate']);
add('check:all includes production gate', pkg.scripts?.['check:all']?.includes('check:production-stability-gate'));
add('check:all:critical includes production gate', pkg.scripts?.['check:all:critical']?.includes('check:production-stability-gate'));

console.log('Phase 4K-6J Production Stability Gate Check');
for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
const fail = checks.filter(c => !c.ok);
if (fail.length) {
  console.error(`\nFAILED: ${fail.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`\nPASS: ${checks.length}/${checks.length} checks passed`);

#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const checks = [
  'check-h8r2-1c1f1d1c1-financial-entry.mjs',
  'check-h8r2-1c1f1d1c1-inventory-atomic.mjs',
  'check-h8r2-1c1f1d1c-final-production-correctness.mjs',
  'check-startup-read-budget-freeze.mjs',
  'check-root-public-parity.mjs',
  'check-d1c2-data-report.mjs',
  'check-d1c2-month-page-isolation.mjs',
  'check-d1c2-export-failclosed.mjs',
  'check-d1c2-debt-span.mjs',
  'check-d1c2-inventory-boot.mjs'
];
let failed = false;
for (const name of checks) {
  const result = spawnSync(process.execPath, ['tools/' + name], { stdio: 'inherit' });
  if (result.status !== 0) { failed = true; console.error('D1C1 gate FAILED:', name); }
}
const admissionGate = 'tools/check-h8r2-1c1f1d1c1-admission-atomic.mjs';
const partialAdmissionGate = spawnSync(process.execPath, ['tools/check-d1c2-admission-partial.mjs'], { stdio: 'inherit' });
if (partialAdmissionGate.status !== 0) failed = true;
if (fs.existsSync(admissionGate)) {
  const result = spawnSync(process.execPath, [admissionGate], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
} else {
  failed = true;
  console.error('D1C1 BLOCKED: fee=0 admission policy and full F01–F15/authenticated Rules closure unverified.');
  console.error('Paid admission uses one batch in the local handler test; cross-device uniqueness and receipt reload remain unverified.');
}
if (failed) process.exit(1);
console.log('D1C1 financial authority gate PASS.');

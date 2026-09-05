/**
 * PHASE 4K-6V5U6H6 — Canonical Release Gate
 *
 * ONE tooling authority answering: "Source có đủ điều kiện release không?"
 * It orchestrates existing canonical checkers; it contains no business logic.
 */
import { spawnSync } from 'child_process';

const releaseChecks = [
  'check:syntax',
  'check:production-authority-closure',
  'check:production-security-trust-boundary',
  'check:auth-context-single-writer',
  'check:club-bootstrap-single-read-authority',
  'check:club-initial-snapshot-access-gate',
  'check:club-listener-bootstrap-readiness',
  'check:club-root-field-authority',
  'check:parallel-read-authority',
  'check:startup-read-budget-freeze',
  'check:dashboard-single-read-authority',
  'check:dashboard-cache-freshness-guard',
  'check:dashboard-hydration-mutation-guard',
  'check:attendance-explicit-shift-authority',
  'check:attendance-daily-single-refresh-authority',
  'check:attendance-offline-canonical-sync-guard',
  'check:attendance-canonical-ownership',
  'check:canonical-transaction-safe-cutover',
  'check:debt-authoritative-tuition-coverage',
  'check:inventory-ledger-reconciliation',
  'check:coach-attendance-only-read-boundary',
  'check:security-coach-branch-boundary',
  'check:coach-sensitive-config-closure',
  'check:exam-upgrade-finance-separation',
  'check:exam-export-belt-sort',
  'check:exam-export-download',
  'check:exam-export-full-roster',
  'check:exam-export-state-purity',
  'check:reports-module-syntax',
  'check:report-export-lazy-isolation',
  'check:stored-xss-trust-boundary',
  'check:profile-rename-referential-guard',
  'check:production-residual-defect-closure',
  'check:db-ready-guards',
  'check:runtime-month-admission-hydration',
  'check:deploy-package',
];

console.log('\n=== PHASE 4K-6V5U6H6 — CANONICAL RELEASE GATE ===\n');
for (const script of releaseChecks) {
  console.log(`\n>>> npm run ${script}`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(`\nRELEASE GATE ERROR: ${script}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\nRELEASE GATE FAIL: ${script} exited ${result.status}`);
    process.exit(result.status || 1);
  }
}
console.log(`\nRELEASE GATE PASS — ${releaseChecks.length}/${releaseChecks.length} canonical checks passed.`);

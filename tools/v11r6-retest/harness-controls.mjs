// Test the actual parent try/catch with real child exits and a bounded timeout.
// Short timeout is supplied only for the sleeping test fixture below.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const source = fs.readFileSync('tools/check-payment-accounts.mjs', 'utf8');
const begin = source.indexOf('const qrMatrixProcessBudgetMs =');
const end = source.indexOf("section('11. Debug helpers')", begin);
assert.ok(begin > 0 && end > begin);
const body = source.slice(begin, end).replace(/section\('11\. Debug helpers'\).*$/s, '');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payment-harness-'));
const file = path.join(dir, 'tools/check-qr-report-render-payment-intent.mjs'); fs.mkdirSync(path.dirname(file));
const tests = [];
function run(name, text, kind, expected) {
 fs.writeFileSync(file, text);
 const pass = [], fail = [], diagnostics = [], budgets = [];
 const invoke = (executable, args, options) => {
  budgets.push(options.timeout);
  if (kind === 'timeout') return execFileSync(executable, args, { ...options, timeout: 75 });
  if (kind === 'missing') return execFileSync(path.join(dir, 'missing-node'), args, options);
  return execFileSync(executable, args, options);
 };
 vm.runInNewContext(body, { process, resolve: path.resolve, rootDir: dir, execFileSync: invoke, Date, TAG: '[HarnessControl]', pass: x => pass.push(x), fail: x => fail.push(x), console: { log: x => diagnostics.push(x), error: x => diagnostics.push(x) } });
 assert.deepEqual(budgets, [60000]);
 if (expected === 'PASS') { assert.equal(pass.length, 1); assert.equal(fail.length, 0); }
 else { assert.equal(pass.length, 0); assert.equal(fail.length, 1); assert.match(fail[0], expected); }
 tests.push({ name, status: 'PASS', childBudgetMs: budgets[0], parentPass: pass, parentFailure: fail });
}
try {
 run('successful child is required for parent PASS', 'process.exitCode = 0;', 'success', 'PASS');
 run('nonzero child still fails the parent', 'console.error("negative oracle"); process.exitCode = 17;', 'nonzero', /CHILD_FAILURE/);
 run('hung child still fails with explicit timeout classification', 'setTimeout(() => {}, 10000);', 'timeout', /CHILD_TIMEOUT/);
 run('missing executable cannot become PASS', '', 'missing', /CHILD_FAILURE/);
 fs.mkdirSync('handoff/V11R6_RETEST/evidence', { recursive: true });
 fs.writeFileSync('handoff/V11R6_RETEST/evidence/harness-controls.json', JSON.stringify({ status: 'PASS', scope: 'Actual parent block; synthetic child fixtures, not QR business cases', tests }, null, 2));
 tests.forEach(t => console.log('PASS ' + t.name));
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

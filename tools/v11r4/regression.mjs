import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const pkg = JSON.parse(fs.readFileSync('package.json'));
const canonical = [...fs.readFileSync('tools/check-release.mjs', 'utf8').matchAll(/'((?:check:)[a-z0-9-]+)'/g)].map(m => m[1]);
const financial = Object.keys(pkg.scripts).filter(k => /^check:(h8r2|tuition-|transaction-|financial-|payment-)/.test(k));
const extras = ['check:root-public-parity', 'check:payment-accounts', 'check:v5u2-tuition-command-cutover', 'check:v5u2-tuition-command-behavior', 'check:legacy-global-freeze', 'check:long-term-production-stability', 'check:coach-attendance-only-read-boundary', 'check:qr-v4-payment-account-authority'];
const scripts = [...new Set([...canonical, ...financial, ...extras])];
const out = 'handoff/V11R4/evidence/regression';
fs.mkdirSync(out, { recursive: true });
const results = [];
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const script of scripts) {
  const cmd = pkg.scripts[script]; if (!cmd) throw Error('Missing script ' + script);
  const begin = Date.now();
  const r = spawnSync('npm', ['run', script], { encoding: 'utf8', timeout: 120000, maxBuffer: 16000000, env: process.env });
  const log = `${out}/${script.replace('check:', '')}.log`;
  fs.writeFileSync(log, (r.stdout || '') + (r.stderr || '') + (r.error ? '\n' + r.error.stack : ''));
  const result = { script, command: ['npm', 'run', script], expectedExit: 0, actualExit: r.status, status: r.status === 0 ? 'PASS' : 'FAIL', elapsedMs: Date.now() - begin, log, rulesSHA: hash('firestore.rules') };
  results.push(result); console.log(result.status + ' ' + script);
  fs.writeFileSync(`${out}/SUMMARY.json`, JSON.stringify({ status: results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', results }, null, 2));
}
console.log(`SUITES ${results.length}; PASS ${results.filter(r => r.status === 'PASS').length}; FAIL ${results.filter(r => r.status !== 'PASS').length}`);
if (results.some(r => r.status !== 'PASS')) process.exitCode = 1;

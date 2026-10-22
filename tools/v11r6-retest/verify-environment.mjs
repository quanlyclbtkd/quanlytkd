// Validate prerequisites without installing, signing in, or connecting to Firebase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadPlaywright, browserExecutable } from '../test-runtime.mjs';
assert.ok(!process.env.QR_BASELINE_FAST, 'QR_BASELINE_FAST must be disabled for acceptance');
const lock = JSON.parse(fs.readFileSync('package-lock.json'));
const versions = {};
for (const name of ['playwright', 'firebase', '@firebase/rules-unit-testing']) {
 const version = JSON.parse(fs.readFileSync('node_modules/' + name + '/package.json')).version;
 const expected = lock.packages['node_modules/' + name].version;
 assert.equal(version, expected, name + ' must match the lockfile'); versions[name] = version;
}
const java = process.env.JAVA21_EXECUTABLE;
const jar = process.env.FIRESTORE_EMULATOR_JAR;
assert.ok(java && jar, 'Set JAVA21_EXECUTABLE and FIRESTORE_EMULATOR_JAR');
const jarSHA256 = createHash('sha256').update(fs.readFileSync(jar)).digest('hex');
assert.equal(jarSHA256, 'c3d3680a89d946a90a027365ea14c26c6472a162bcf37f099bbb1ebd66d25e8e');
const javaVersion = execFileSync(java, ['--version'], { stdio: 'pipe', encoding: 'utf8' });
assert.match(javaVersion, /\b21\./, 'Use Java 21 for the pinned Emulator');
const pw = loadPlaywright(), executable = browserExecutable(pw);
const browser = await pw.chromium.launch({ executablePath: executable, args: ['--no-sandbox'] });
let browserVersion;
try { browserVersion = await browser.version(); } finally { await browser.close(); }
const result = { status: 'PASS', node: process.version, versions, chromium: browserVersion, chromiumExecutable: executable, javaExecutable: java, javaVersion, emulatorJAR_SHA256: jarSHA256, lockSHA256: createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex'), fastTimerOverride: false, scope: 'Local dependencies and process launch only; Firebase CLI is not required or used' };
fs.mkdirSync('handoff/V11R6_RETEST/evidence', { recursive: true });
fs.writeFileSync('handoff/V11R6_RETEST/evidence/environment.json', JSON.stringify(result, null, 2));
console.log('PASS dependency lockfile, Chromium launch, Emulator artifact, and normal timers');

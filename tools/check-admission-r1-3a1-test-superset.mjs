import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const mapPath = path.join(ROOT, 'tools/r1_3a1/coverage-map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const pkg = JSON.parse(read('package.json'));
const r13 = read('tools/check-admission-ui-draft-r1-3.mjs');
const r13a = read('tools/check-admission-draft-snapshot-r1-3a.mjs');

// Canonical IDs are derived from the actual behavioral/static gate source, not
// from coverage-map text. This prevents the map from authorizing itself.
const literalCheckIds = source => {
  const ids = new Set();
  const re = /\bcheck\(\s*(['"])(.*?)\1\s*,/gs;
  let m;
  while ((m = re.exec(source))) ids.add(m[2]);
  return ids;
};
const historicalIds = literalCheckIds(r13);
const canonicalIds = literalCheckIds(r13a);
// One canonical assertion used by R1.3A is produced by a second explicit Save
// after stale-abort; it is still a literal check ID and therefore parsed above.

const allowed = new Set([
  'IDENTICAL',
  'R1_3A_STRONGER',
  'R1_3_ONLY_MISSING',
  'OBSOLETE_BY_STRONGER_INVARIANT',
  'NON_BEHAVIORAL_METADATA_ONLY',
]);
const strictAccepted = new Set([
  'IDENTICAL',
  'R1_3A_STRONGER',
  'OBSOLETE_BY_STRONGER_INVARIANT',
  'NON_BEHAVIORAL_METADATA_ONLY',
]);

check('Coverage map phase identity', map.phase === 'A9R18-ADMISSION-R1.3A1');
check('Historical assertion registry parsed from actual R1.3 gate', historicalIds.size === 14, `count=${historicalIds.size}`);
check('Canonical assertion registry parsed from actual R1.3A gate', canonicalIds.size >= 30, `literalCount=${canonicalIds.size}`);

const rows = Array.isArray(map.rows) ? map.rows : [];
const rowsByHistorical = new Map(rows.map(row => [row.historicalAssertion, row]));
const missingHistoricalRows = [...historicalIds].filter(id => !rowsByHistorical.has(id));
const extraHistoricalRows = rows.filter(row => !historicalIds.has(row.historicalAssertion)).map(row => row.historicalAssertion);
check('Coverage map contains every actual historical assertion', missingHistoricalRows.length === 0, JSON.stringify(missingHistoricalRows));
check('Coverage map contains no invented historical assertion', extraHistoricalRows.length === 0, JSON.stringify(extraHistoricalRows));
check('Coverage map has exactly one row per historical assertion', rows.length === historicalIds.size && rowsByHistorical.size === rows.length, `rows=${rows.length} unique=${rowsByHistorical.size}`);
check('Every coverage classification is known', rows.every(row => allowed.has(row.classification)));

const unresolvedCanonical = [];
const invalidRows = [];
for (const row of rows) {
  const refs = Array.isArray(row.canonicalAssertionIds) ? row.canonicalAssertionIds : [];
  const needsCanonical = row.classification !== 'R1_3_ONLY_MISSING';
  if (needsCanonical && refs.length === 0) invalidRows.push(`${row.historicalAssertion}:missing canonicalAssertionIds`);
  for (const id of refs) if (!canonicalIds.has(id)) unresolvedCanonical.push({ historicalAssertion: row.historicalAssertion, canonicalAssertionId: id });
  if (!allowed.has(row.classification)) invalidRows.push(`${row.historicalAssertion}:unknown classification`);
  if (row.classification === 'R1_3A_STRONGER' && !String(row.reason || '').trim()) invalidRows.push(`${row.historicalAssertion}:stronger requires reason`);
  if (row.classification === 'OBSOLETE_BY_STRONGER_INVARIANT' && (!String(row.reason || '').trim() || refs.length === 0)) invalidRows.push(`${row.historicalAssertion}:obsolete requires named replacement + reason`);
  if (row.classification === 'IDENTICAL' && refs.length === 0) invalidRows.push(`${row.historicalAssertion}:identical requires canonical assertion`);
}
check('Every mapped canonical assertion resolves to an actual R1.3A check ID', unresolvedCanonical.length === 0, JSON.stringify(unresolvedCanonical));
check('Classification-specific replacement requirements are valid', invalidRows.length === 0, JSON.stringify(invalidRows));

const missingRows = rows.filter(row => row.classification === 'R1_3_ONLY_MISSING');
check('R1_3_ONLY_MISSING count = 0', missingRows.length === 0, `count=${missingRows.length}`);
check('Every useful historical assertion has an accepted strict-superset classification', rows.every(row => strictAccepted.has(row.classification)), JSON.stringify(rows.filter(row => !strictAccepted.has(row.classification)).map(row => row.historicalAssertion)));

const computed = {
  historicalAssertionCount: historicalIds.size,
  mappedAssertionCount: rows.length,
  IDENTICAL: rows.filter(r => r.classification === 'IDENTICAL').length,
  R1_3A_STRONGER: rows.filter(r => r.classification === 'R1_3A_STRONGER').length,
  OBSOLETE_BY_STRONGER_INVARIANT: rows.filter(r => r.classification === 'OBSOLETE_BY_STRONGER_INVARIANT').length,
  NON_BEHAVIORAL_METADATA_ONLY: rows.filter(r => r.classification === 'NON_BEHAVIORAL_METADATA_ONLY').length,
  R1_3_ONLY_MISSING: missingRows.length,
  unresolvedCanonicalReferences: unresolvedCanonical.length,
};
check('Coverage summary is mechanically consistent', Object.entries(computed).every(([k,v]) => map.summary?.[k] === v), JSON.stringify({ expected: computed, actual: map.summary }));

check('Historical R1.3 script alias retained', typeof pkg.scripts?.['check:admission-ui-draft-r1-3'] === 'string');
check('Historical R1.3 test file retained', r13.includes('R1.3 ADMISSION UI DRAFT GATE'));
check('R1.2C script retained', typeof pkg.scripts?.['check:admission-postcommit-context-r1-2c'] === 'string');
check('Canonical R1.3A script retained', typeof pkg.scripts?.['check:admission-draft-snapshot-r1-3a'] === 'string');

// Script topology is traversed recursively so a nested alias cannot silently
// reintroduce historical R1.3 into default/aggregate chains.
const npmRefs = value => {
  const refs = [];
  const re = /(?:^|&&|;)\s*npm\s+run\s+([^\s;&]+)/g;
  let m;
  while ((m = re.exec(String(value || '')))) refs.push(m[1]);
  return refs;
};
const walk = root => {
  const counts = new Map();
  const stack = [];
  const visit = name => {
    counts.set(name, (counts.get(name) || 0) + 1);
    if (stack.includes(name)) throw new Error(`script recursion: ${[...stack,name].join(' -> ')}`);
    const body = pkg.scripts?.[name];
    if (typeof body !== 'string') return;
    stack.push(name);
    for (const ref of npmRefs(body)) visit(ref);
    stack.pop();
  };
  visit(root);
  return counts;
};
const defaultRoots = ['check','check:all'].filter(name => typeof pkg.scripts?.[name] === 'string');
for (const root of defaultRoots) {
  let counts;
  try { counts = walk(root); check(`${root} script graph has no recursion`, true); }
  catch (err) { check(`${root} script graph has no recursion`, false, err.message); continue; }
  check(`${root} R1.2C default invocation = 1`, (counts.get('check:admission-postcommit-context-r1-2c') || 0) === 1, `count=${counts.get('check:admission-postcommit-context-r1-2c') || 0}`);
  check(`${root} historical R1.3 default invocation = 0`, (counts.get('check:admission-ui-draft-r1-3') || 0) === 0, `count=${counts.get('check:admission-ui-draft-r1-3') || 0}`);
  check(`${root} canonical R1.3A default invocation = 1`, (counts.get('check:admission-draft-snapshot-r1-3a') || 0) === 1, `count=${counts.get('check:admission-draft-snapshot-r1-3a') || 0}`);
  check(`${root} R1.3A1 superset gate invocation = 1`, (counts.get('check:admission-r1-3a1-test-superset') || 0) === 1, `count=${counts.get('check:admission-r1-3a1-test-superset') || 0}`);
}
for (const root of ['check:all:critical','check:release'].filter(name => typeof pkg.scripts?.[name] === 'string')) {
  try {
    const counts = walk(root);
    check(`${root} does not indirectly invoke historical R1.3`, (counts.get('check:admission-ui-draft-r1-3') || 0) === 0, `count=${counts.get('check:admission-ui-draft-r1-3') || 0}`);
  } catch (err) {
    check(`${root} script graph has no recursion`, false, err.message);
  }
}

check('Post-ACK A domain-tail canonical assertion resolves', canonicalIds.has('C01_EDIT_DURING_COMMIT_DOMAIN_TAIL_CONTINUES') && r13a.includes("x.kind === 'financeMerge' && x.club === 'A'"));
check('Post-ACK Draft B canonical assertion resolves', canonicalIds.has('C01_EDIT_DURING_COMMIT_DRAFT_PRESERVED'));
check('One-primary-batch canonical assertion resolves', canonicalIds.has('C01_EDIT_DURING_COMMIT_ONE_A_COMMIT'));

console.log(`\nR1.3A1 FINAL SELF-VALIDATING SUPERSET GATE: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exitCode = 1;

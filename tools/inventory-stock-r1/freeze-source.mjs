// Freeze this isolated stock candidate and its reverse import-cache closure.
// Usage: node tools/inventory-stock-r1/freeze-source.mjs /path/to/exact-parent
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildImportGraph, buildTag} from '../v11r2/import-graph.mjs';
import {runtimeHash} from '../v11r2/cutover.mjs';

const root = process.cwd();
const baseline = path.resolve(process.argv[2] || '../baseline');
const pin = 'V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1';
const parentPin = 'V11R6_A9R18_FAMILY_QR_HUMAN_READABLE_MEMO_R1_1';
const token = 'a9r18-inventory-stock-authority-r1-20261108';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const read = (file, dir = root) => fs.readFileSync(path.join(dir, file), 'utf8');
const write = (file, text) => fs.writeFileSync(path.join(root, file), text);
const parent = JSON.parse(read(`tools/v11r2/manifests/${parentPin}.json`, baseline));
if (runtimeHash(baseline) !== parent.runtimeSHA256) throw Error('EXACT_PARENT_REQUIRED');

const graph = buildImportGraph(root);
const scope = new Set(['app.js', 'js/services/inventory.service.js', 'js/modules/inventory.js', 'js/modules/students.js']);
let changed;
do {
  changed = false;
  for (const edge of graph.edges) if (scope.has(edge.to) && !scope.has(edge.from)) { scope.add(edge.from); changed = true; }
} while (changed);
const edges = graph.edges.filter(edge => scope.has(edge.to));
function version(url) {
  const [base, fragment] = url.split('#');
  const i = base.indexOf('?'), pathname = i < 0 ? base : base.slice(0, i);
  const params = new URLSearchParams(i < 0 ? '' : base.slice(i + 1));
  params.set('v', token);
  return pathname + '?' + params + (fragment === undefined ? '' : '#' + fragment);
}
for (const from of new Set(edges.map(edge => edge.from))) {
  let source = read(from);
  for (const edge of edges.filter(edge => edge.from === from).sort((a, b) => b.start - a.start))
    source = source.slice(0, edge.start) + (edge.quoted ? JSON.stringify(version(edge.url)) : version(edge.url)) + source.slice(edge.end);
  write(from, source);
}
const canonicalRuntimeFiles = Object.fromEntries(Object.keys(parent.canonicalRuntimeFiles).map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
const runtimeChangedFiles = Object.keys(canonicalRuntimeFiles).filter(file => canonicalRuntimeFiles[file] !== parent.canonicalRuntimeFiles[file]);
for (const file of runtimeChangedFiles) {
  const mirrored = path.join(root, 'public', file);
  if (fs.existsSync(mirrored)) fs.writeFileSync(mirrored, fs.readFileSync(path.join(root, file)));
}
const edgeKeys = new Set(edges.map(edge => JSON.stringify([edge.from, edge.to])));
const scopedEdges = [...new Set(edges.map(edge => JSON.stringify([edge.from, edge.to])))].map(key => JSON.parse(key));
const cacheLineageScopes = [
  {token, edges: scopedEdges},
  ...parent.cacheLineageScopes.map(group => ({...group, edges: group.edges.filter(edge => !edgeKeys.has(JSON.stringify(edge)))})).filter(group => group.edges.length),
];
const runtimeSHA256 = runtimeHash(root);
const rulesSHA256 = sha(fs.readFileSync(path.join(root, 'firestore.rules')));
const indexesSHA256 = sha(fs.readFileSync(path.join(root, 'firestore.indexes.json')));
if (rulesSHA256 !== parent.rulesSHA256 || indexesSHA256 !== parent.indexesSHA256) throw Error('PROTECTED_RULES_OR_INDEX_DRIFT');
const manifestFile = `tools/v11r2/manifests/${pin}.json`;
const manifest = {
  kind: 'A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1_FULL_SOURCE_TEST_CANDIDATE',
  phaseStatus: 'TEST_CANDIDATE_NOT_DEPLOYED', parentPin, parentRuntimeSHA256: parent.runtimeSHA256,
  sourceBaselineZIPSHA256: 'dbb1f6c042a139baa3606a0ca78a0472959acd624ab4fceb6ba69ed4b6a40a90',
  newPin: pin, buildTag: buildTag(read('js/main.js')).tag,
  runtimeSHA256, rulesSHA256, indexesSHA256, appJsSHA256: canonicalRuntimeFiles['app.js'],
  runtimeChangedFilesSinceParent: runtimeChangedFiles, cacheLineageScopes, canonicalRuntimeFiles,
};
write(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
const identity = {
  id: pin, canonicalFileCount: Object.keys(canonicalRuntimeFiles).length,
  coachAssignmentContract: 'server-verified-multi-branch-v1', inputZIP_SHA256: manifest.sourceBaselineZIPSHA256,
  manifest: manifestFile, manifestSHA256: sha(read(manifestFile)), runtimeSHA256, rulesSHA256, indexesSHA256,
  buildTag: manifest.buildTag, cacheLineageScopes,
};
let identities = read('tools/v11r2/source-identity.mjs');
const startMarker = '// INVENTORY_STOCK_R1_PIN_START';
const endMarker = '// INVENTORY_STOCK_R1_PIN_END';
if (identities.includes(startMarker)) {
  const a = identities.indexOf(startMarker), b = identities.indexOf(endMarker, a) + endMarker.length;
  identities = identities.slice(0, a) + identities.slice(b).replace(/^\n\n/, '');
}
const block = `${startMarker}\n// Isolated stock-correctness candidate identity; no deployment approval.\nconst ${pin} = Object.freeze(${JSON.stringify(identity, null, 2)});\n${endMarker}\n\n`;
identities = identities.replace('export function verifySourceIdentity(', block + 'export function verifySourceIdentity(');
if (!identities.includes(`const pinned=[${pin},`)) identities = identities.replace('const pinned=[', `const pinned=[${pin},`);
write('tools/v11r2/source-identity.mjs', identities);

let guard = read('tools/check-qr-multiitem-memo-r1-2d-app-guard.mjs');
const appEntry = `  ${pin}:'${canonicalRuntimeFiles['app.js']}',`;
const entryPattern = new RegExp(`  ${pin}:'[^']*',?`);
guard = entryPattern.test(guard) ? guard.replace(entryPattern, appEntry) : guard.replace('const acceptedApp=Object.freeze({', 'const acceptedApp=Object.freeze({\n' + appEntry);
if (!guard.includes(`if(['${pin}',`)) guard = guard.replace("if(['V11R6_A9R18_FAMILY_QR_HUMAN_READABLE_MEMO_R1_1'", `if(['${pin}','V11R6_A9R18_FAMILY_QR_HUMAN_READABLE_MEMO_R1_1'`);
write('tools/check-qr-multiitem-memo-r1-2d-app-guard.mjs', guard);
console.log(JSON.stringify({pin, runtimeSHA256, runtimeChangedFiles, cacheEdges: scopedEdges.length, canonicalFiles: Object.keys(canonicalRuntimeFiles).length}, null, 2));

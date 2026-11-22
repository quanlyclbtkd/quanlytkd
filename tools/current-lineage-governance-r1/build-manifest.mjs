import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runtimeHash } from '../v11r2/cutover.mjs';
import { affectedModules, buildImportGraph, buildTag, cacheToken } from '../v11r2/import-graph.mjs';
import { parse } from '../v11r2/vendor/acorn.mjs';

export const pinId = 'V11R6_A9R18_CURRENT_LINEAGE_GOVERNANCE_R1';
export const manifestPath = 'tools/v11r2/manifests/' + pinId + '.json';
export const identityPath = 'tools/v11r2/source-identity.mjs';
export const expectedRuntime = '8388c9bf5c9cb1d47d29526d7191bae5bb9ab3a07fad4b51de8f6be95db8ac59';
export const sourceZip = '66dcd3141954646ad0c2853bca46d6e1614f4ef3fdb89a3e70058a1b7575dbda';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const legacyPinName = 'V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1';
const expectedBuildTag = 'qr-v11r6-a9r18-usability-perf-r2r4-r6-20261029';
const runtimeEntries = ['app.js', 'index.html', 'style.css', '.nojekyll', 'js', 'css'];

export function runtimeFiles(root) {
  const walk = relative => {
    const info = fs.lstatSync(path.join(root, relative));
    assert.ok(info.isFile() || info.isDirectory(), 'Unsupported runtime entry: ' + relative);
    return info.isDirectory()
      ? fs.readdirSync(path.join(root, relative)).flatMap(name => walk(relative + '/' + name))
      : [relative];
  };
  return runtimeEntries.flatMap(walk).sort();
}

function reviewedCacheAuthority(read, graph, tag) {
  const identitySource = read(identityPath).toString('utf8');
  const ast = parse(identitySource, { ecmaVersion: 'latest', sourceType: 'module' });
  const oldDeclaration = ast.body.flatMap(node => node.declarations ?? [])
    .find(node => node.id.name === legacyPinName);
  assert.ok(oldDeclaration);
  const objectNode = oldDeclaration.init.arguments[0];
  const oldPin = JSON.parse(identitySource.slice(objectNode.start, objectNode.end));
  const parentBytes = read(oldPin.manifest);
  assert.equal(sha(parentBytes), oldPin.manifestSHA256);
  const parent = JSON.parse(parentBytes);
  assert.equal(oldPin.buildTag, tag);
  assert.equal(parent.buildTag, tag);
  assert.equal(parent.runtimeSHA256, oldPin.runtimeSHA256);
  assert.deepEqual(oldPin.cacheLineageScopes, parent.cacheLineageScopes);
  const allowances = new Map();
  for (const lineage of parent.cacheLineageScopes) {
    for (const [from, to] of lineage.edges) {
      const key = from + ' -> ' + to;
      assert.ok(!allowances.has(key), key);
      allowances.set(key, lineage.token);
      const occurrences = graph.edges.filter(edge => edge.from === from && edge.to === to);
      assert.ok(occurrences.length > 0 && occurrences.every(edge => cacheToken(edge.url) === lineage.token), key);
    }
  }
  const authorityScope = new Set(affectedModules(graph));
  for (const edge of graph.edges.filter(edge => authorityScope.has(edge.to))) {
    const key = edge.from + ' -> ' + edge.to;
    assert.equal(cacheToken(edge.url), allowances.get(key) ?? tag, key);
  }
  return {
    cacheLineageScopes: parent.cacheLineageScopes,
    cachePolicyProvenance: {
      pinId: oldPin.id, path: oldPin.manifest, manifestSHA256: oldPin.manifestSHA256,
      verifiedScopedEdges: allowances.size, authorityScope: [...authorityScope],
      relationship: 'The existing cache policy is inherited by exact edge/token match.',
    },
  };
}

export function buildManifest(root) {
  const read = name => fs.readFileSync(path.join(root, name));
  const files = runtimeFiles(root);
  assert.equal(files.length, 129);
  const canonicalRuntimeFiles = Object.fromEntries(files.map(file => {
    const bytes = read(file);
    assert.ok(Buffer.from(bytes.toString('utf8')).equals(bytes), 'Runtime byte and UTF-8 hash must agree: ' + file);
    return [file, sha(bytes)];
  }));
  const runtimeSHA256 = runtimeHash(root);
  assert.equal(runtimeSHA256, expectedRuntime);
  assert.equal(sha(JSON.stringify(Object.entries(canonicalRuntimeFiles))), runtimeSHA256);
  const rulesSHA256 = sha(read('firestore.rules'));
  assert.equal(rulesSHA256, '1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3');
  const indexesSHA256 = sha(read('firestore.indexes.json'));
  assert.equal(indexesSHA256, '72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2');
  const tag = buildTag(read('js/main.js').toString('utf8')).tag;
  assert.equal(tag, expectedBuildTag);
  const graph = buildImportGraph(root);
  const canonicalModuleURLs = {};
  const edges = [];
  for (const { from, to, kind, url } of graph.edges) {
    if (!to) continue;
    assert.ok(Object.hasOwn(canonicalRuntimeFiles, to), to);
    const base = new URL(kind === 'script-loader' ? 'index.html' : from, 'https://cutover.invalid/');
    const normalized = new URL(url, base);
    const normalizedUrl = normalized.pathname + normalized.search + normalized.hash;
    assert.ok(normalized.pathname === '/' + to);
    canonicalModuleURLs[to] ??= [];
    if (!canonicalModuleURLs[to].includes(normalizedUrl)) canonicalModuleURLs[to].push(normalizedUrl);
    edges.push({ from, to, kind, url: normalizedUrl });
  }
  for (const urls of Object.values(canonicalModuleURLs)) urls.sort();
  return {
    kind: 'CURRENT_LINEAGE_SOURCE_IDENTITY_MANIFEST',
    pinId, inputZIP_SHA256: sourceZip, buildTag: tag, runtimeSHA256, rulesSHA256, indexesSHA256,
    canonicalRuntimeFiles,
    canonicalModuleURLs: Object.fromEntries(Object.entries(canonicalModuleURLs).sort(([a], [b]) => a < b ? -1 : a === b ? 0 : 1)),
    localModuleEdges: edges,
    ...reviewedCacheAuthority(read, graph, tag),
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const manifest = buildManifest(root);
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(root, manifestPath), bytes, { flag: 'wx' });
  console.log(JSON.stringify({
    path: manifestPath, manifestSHA256: sha(bytes), runtimeSHA256: manifest.runtimeSHA256,
    canonicalRuntimeFiles: Object.keys(manifest.canonicalRuntimeFiles).length,
    reachableLocalModuleTargets: Object.keys(manifest.canonicalModuleURLs).length,
    localImportEdgeCount: manifest.localModuleEdges.length,
    inheritedCacheEdgesVerified: manifest.cachePolicyProvenance.verifiedScopedEdges,
  }, null, 2));
}

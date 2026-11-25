import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runtimeFiles, sha } from '../current-lineage-governance-r1/build-manifest.mjs';
import { runtimeHash } from '../v11r2/cutover.mjs';
import { buildImportGraph, buildTag, cacheToken } from '../v11r2/import-graph.mjs';
import { QR_GENERIC_NON_TUITION_REPORT_MEMO_R1_SOURCE as parent } from '../v11r2/source-identity.mjs';
import { APP_SHA256, APP_LOADER, INPUT_SHA256, MANIFEST_PATH, OLD_APP_LOADER, RELEASE_ID, RELEASE_KIND,
    releaseCacheLineage, verifyActiveAppCache } from './release-policy.mjs';

export function buildReleaseManifest(root) {
    const read = name => fs.readFileSync(path.join(root, name));
    const parentBytes = read(parent.manifest);
    assert.equal(sha(parentBytes), parent.manifestSHA256);
    assert.equal(parent.testOnly, true);
    const parentManifest = JSON.parse(parentBytes);
    assert.equal(parentManifest.pinId, parent.id);
    assert.equal(parentManifest.runtimeSHA256, parent.runtimeSHA256);
    const paths = runtimeFiles(root);
    assert.deepEqual(paths, runtimeFiles(path.join(root, 'public')));
    assert.deepEqual(paths, Object.keys(parentManifest.canonicalRuntimeFiles).sort());
    assert.equal(paths.length, 129);
    const canonicalRuntimeFiles = Object.fromEntries(paths.map(name => {
        const bytes = read(name);
        assert.ok(bytes.equals(read('public/' + name)), 'Root/public mismatch: ' + name);
        assert.ok(bytes.equals(Buffer.from(bytes.toString('utf8'))), 'Runtime bytes are not UTF-8: ' + name);
        return [name, sha(bytes)];
    }));
    const changed = paths.filter(name => canonicalRuntimeFiles[name] !== parentManifest.canonicalRuntimeFiles[name]);
    assert.deepEqual(changed, ['index.html']);
    assert.equal(canonicalRuntimeFiles['app.js'], APP_SHA256);
    const html = read('index.html').toString('utf8');
    assert.equal(html.split(APP_LOADER).length, 2);
    assert.equal(sha(html.replace(APP_LOADER, OLD_APP_LOADER)), parentManifest.canonicalRuntimeFiles['index.html']);
    const runtimeSHA256 = runtimeHash(root);
    assert.notEqual(runtimeSHA256, parent.runtimeSHA256);
    assert.equal(runtimeSHA256, runtimeHash(path.join(root, 'public')));
    assert.equal(runtimeSHA256, sha(JSON.stringify(Object.entries(canonicalRuntimeFiles))));
    const rulesSHA256 = sha(read('firestore.rules'));
    const indexesSHA256 = sha(read('firestore.indexes.json'));
    const tag = buildTag(read('js/main.js').toString('utf8')).tag;
    assert.equal(rulesSHA256, parent.rulesSHA256);
    assert.equal(indexesSHA256, parent.indexesSHA256);
    assert.equal(tag, parent.buildTag);
    const graph = buildImportGraph(root);
    verifyActiveAppCache(root, graph);
    const cacheLineageScopes = releaseCacheLineage(parent.cacheLineageScopes);
    for (const {token, edges} of cacheLineageScopes) {
        for (const [from, to] of edges) {
            const edge = graph.edges.filter(edge => edge.from === from && edge.to === to);
            assert.ok(edge.length > 0, from + ' -> ' + to);
            assert.ok(edge.every(ref => cacheToken(ref.url) === token), from + ' -> ' + to);
        }
    }
    return {
        kind:RELEASE_KIND, pinId:RELEASE_ID, inputZIP_SHA256:INPUT_SHA256,
        parentSourceIdentity:parent.id, parentRuntimeSHA256:parent.runtimeSHA256,
        buildTag:tag, runtimeSHA256, rulesSHA256, indexesSHA256, canonicalRuntimeFiles,
        coachAssignmentContract:parent.coachAssignmentContract, cacheLineageScopes,
    };
}

export function manifestBytes(root) {
    return Buffer.from(JSON.stringify(buildReleaseManifest(root), null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const root = path.resolve(process.argv[2] ?? process.cwd());
    const bytes = manifestBytes(root);
    fs.writeFileSync(path.join(root, MANIFEST_PATH), bytes, {flag:'wx'});
    console.log(JSON.stringify({path:MANIFEST_PATH, manifestSHA256:sha(bytes), manifest:JSON.parse(bytes)}, null, 2));
}

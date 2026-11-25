import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveCheckerAuthority } from '../current-lineage-governance-r1-1/checker-authority.mjs';
import { sha } from '../current-lineage-governance-r1/build-manifest.mjs';
import { verifyQrMultiitemMemoR1_2DAppWaiver } from '../check-qr-multiitem-memo-r1-2d-app-guard.mjs';
import { runtimeHash } from '../v11r2/cutover.mjs';
import { verifyRuntimeProfile } from '../v11r2/runtime-profile.mjs';
import {
    QR_GENERIC_NON_TUITION_REPORT_MEMO_R1_SOURCE as parent,
    QR_REPORT_RELEASE_CLOSURE_R1_1_SOURCE as exact,
    verifySourceIdentity,
} from '../v11r2/source-identity.mjs';
import { demoFirebaseConfig, prepareStagingSource } from '../v11r3/staging-source.mjs';
import { manifestBytes } from './build-manifest.mjs';
import { historicalFingerprints } from './historical-fingerprints.mjs';
import {
    APP_LOADER, APP_SHA256, MANIFEST_PATH, OLD_APP_LOADER, RELEASE_ID, RELEASE_KIND,
    requireRelease, verifyActiveAppCache,
} from './release-policy.mjs';

const CHECKER = 'tools/qr-report-release-closure-r1-1/check-governance.mjs';
const SOURCE_IDENTITY = 'tools/v11r2/source-identity.mjs';
const HISTORICAL_PIN_SHA = 'a3dfc4c0ac21c7a9b694d5dfb6ef594ba9cd19cfd00a3d150124c75cda5b1bf5';
const HISTORICAL_MANIFEST_SHA = 'e1b62a1e47628c96f2704a5b2e2a40df496df0b2c7793b24ca3db1744952c42c';

export function verifyRelease(root) {
    const read = file => fs.readFileSync(path.join(root, file));
    const runtime = runtimeHash(root);
    const identity = verifySourceIdentity(root, runtime);
    requireRelease(!identity.derivedFrom, 'QR_RELEASE_DERIVED_STAGING_NOT_ACCEPTED');
    requireRelease(identity.testOnly !== true, 'QR_RELEASE_TEST_ONLY_CANDIDATE');
    requireRelease(identity.id === RELEASE_ID && identity.runtimeSHA256 === exact.runtimeSHA256,
        'QR_RELEASE_EXACT_IDENTITY_REQUIRED');
    const {identity:checkerIdentity, currentManifest:manifest} = resolveCheckerAuthority(root);
    assert.deepEqual(checkerIdentity, identity);
    requireRelease(runtimeHash(path.join(root, 'public')) === runtime, 'QR_RELEASE_ROOT_PUBLIC_RUNTIME_MISMATCH');
    requireRelease(sha(read('app.js')) === APP_SHA256 && sha(read('public/app.js')) === APP_SHA256,
        'QR_RELEASE_FROZEN_APP_SHA_MISMATCH');
    const cache = verifyActiveAppCache(root);
    const profile = verifyRuntimeProfile(root);
    assert.deepEqual(profile.identity, identity);
    requireRelease(manifest.kind === RELEASE_KIND && manifest.pinId === exact.id &&
        manifest.parentSourceIdentity === parent.id && manifest.parentRuntimeSHA256 === parent.runtimeSHA256,
        'QR_RELEASE_PARENT_AUTHORITY_INVALID');
    const saved = read(MANIFEST_PATH);
    requireRelease(saved.equals(manifestBytes(root)), 'QR_RELEASE_MANIFEST_NOT_REPRODUCIBLE');
    const guard = verifyQrMultiitemMemoR1_2DAppWaiver(root);
    requireRelease(guard.ok && guard.pin === identity.id && guard.testOnly === false && guard.appSHA256 === APP_SHA256,
        'QR_RELEASE_QR_SOURCE_GUARD_FAILED');
    const history = historicalFingerprints(root);
    requireRelease(history.pinsSHA256 === HISTORICAL_PIN_SHA && history.manifestsSHA256 === HISTORICAL_MANIFEST_SHA &&
        history.newReleasePins === 1, 'QR_RELEASE_HISTORICAL_PINS_DRIFT');
    return {
        status:'PASS', CURRENT_RELEASE_IDENTITY:identity.id,
        EXACT_RUNTIME_ACCEPTED:true, EXACT_MANIFEST_ACCEPTED:true, EXACT_BUILD_TAG_ACCEPTED:true,
        RULES_ACCEPTED:true, INDEXES_ACCEPTED:true, COACH_ASSIGNMENT_CONTRACT_ACCEPTED:true,
        ROOT_PUBLIC_RUNTIME_MATCH:true, ACTIVE_APP_CACHE_TOKEN_ACCEPTED:true, FROZEN_APP_JS_SHA_ACCEPTED:true,
        TEST_ONLY:false, DERIVED_STAGING:false,
        identity, cache, guard, historical:{pinCount:history.pinCount, manifestCount:history.manifestCount,
            pinsSHA256:history.pinsSHA256, manifestsSHA256:history.manifestsSHA256, newReleasePins:history.newReleasePins},
        parent:{id:parent.id, runtimeSHA256:parent.runtimeSHA256, testOnly:parent.testOnly, manifestSHA256:parent.manifestSHA256},
    };
}

const negativeControls = [
    ['N1_RUNTIME_DRIFT','append a source comment to root app.js','SOURCE_RUNTIME_NOT_ACCEPTED','canonical runtime'],
    ['N2_MANIFEST_HASH_DRIFT','append whitespace to the release manifest bytes','SOURCE_MANIFEST_NOT_ACCEPTED','manifest SHA-256'],
    ['N3_RULES_DRIFT','append whitespace to firestore.rules','SOURCE_RULES_NOT_ACCEPTED','Rules SHA-256'],
    ['N4_INDEXES_DRIFT','append whitespace to firestore.indexes.json','SOURCE_INDEXES_NOT_ACCEPTED','indexes SHA-256'],
    ['N5_CANONICAL_FILE_MANIFEST_DRIFT','replace the style.css digest and update the outer pin SHA in the disposable verifier','SOURCE_MANIFEST_FILE_MISMATCH','canonical file digest'],
    ['N6_PUBLIC_MIRROR_DRIFT','append whitespace only to public/index.html','QR_RELEASE_ROOT_PUBLIC_RUNTIME_MISMATCH','public runtime mirror'],
    ['N7_COACH_CONTRACT_METADATA_MISSING','omit coachAssignmentContract from the release pin in the disposable verifier','CURRENT_LINEAGE_COACH_CONTRACT_INVALID','checker authority metadata'],
    ['N8_WRONG_ACTIVE_APP_CACHE_TOKEN','set another active app token and invoke the semantic cache policy directly','QR_RELEASE_APP_CACHE_TOKEN_MISMATCH','semantic active script token'],
    ['N9_TEST_ONLY_CANDIDATE_AS_RELEASE','reconstruct the exact parent HTML on both mirrors and verify its historical source authority','QR_RELEASE_TEST_ONLY_CANDIDATE','release-only source status'],
    ['N10_DERIVED_OR_UNRECOGNIZED_LINEAGE_AS_RELEASE','produce and authenticate an offline demo staging derivative with the existing builder','QR_RELEASE_DERIVED_STAGING_NOT_ACCEPTED','release-only source lineage'],
];

function replaceOnce(data, before, after) {
    assert.equal(data.split(before).length, 2, before);
    return data.replace(before, after);
}

function amend(root, step) {
    const file = name => path.join(root, name);
    const rewrite = (name, patch) => fs.writeFileSync(file(name), patch(fs.readFileSync(file(name), 'utf8')));
    switch (step) {
        case 1: fs.appendFileSync(file('app.js'), '\n// Release-control runtime drift\n'); break;
        case 2: fs.appendFileSync(file(MANIFEST_PATH), '\n'); break;
        case 3: fs.appendFileSync(file('firestore.rules'), '\n'); break;
        case 4: fs.appendFileSync(file('firestore.indexes.json'), '\n'); break;
        case 5: {
            const damaged = JSON.parse(fs.readFileSync(file(MANIFEST_PATH)));
            damaged.canonicalRuntimeFiles['style.css'] = '0'.repeat(64);
            const bytes = JSON.stringify(damaged, null, 2) + '\n';
            fs.writeFileSync(file(MANIFEST_PATH), bytes);
            rewrite(SOURCE_IDENTITY, text => replaceOnce(text, exact.manifestSHA256, sha(bytes)));
            break;
        }
        case 6: fs.appendFileSync(file('public/index.html'), '\n'); break;
        case 7: rewrite(SOURCE_IDENTITY, text => replaceOnce(text,
            " coachAssignmentContract: 'server-verified-multi-branch-v1',\n", '')); break;
        case 8: rewrite('index.html', text => replaceOnce(text, APP_LOADER,
            '<script defer src="app.js?v=a9r18-qr-report-r1-1-invalid"></script>')); break;
        case 9:
            for (const name of ['index.html', 'public/index.html']) {
                rewrite(name, text => replaceOnce(text, APP_LOADER, OLD_APP_LOADER));
            }
            break;
        default: throw Error('UNKNOWN_QR_RELEASE_NEGATIVE_CONTROL');
    }
}

function probe(root, kind) {
    let prior = null;
    try {
        if (kind === 'cache') {
            verifyActiveAppCache(root);
        } else {
            if (kind === 'parent' || kind === 'derived') {
                const runtime = runtimeHash(root);
                const identity = verifySourceIdentity(root, runtime);
                const checker = kind === 'parent' ? resolveCheckerAuthority(root) : null;
                prior = {verified:true, id:identity.id, runtime, testOnly:identity.testOnly === true,
                    derivedFrom:identity.derivedFrom ?? null, checkerManifest:checker?.currentManifest?.pinId ?? null};
                if (kind === 'parent') {
                    verifyRuntimeProfile(root);
                    assert.equal(identity.id, parent.id);
                    assert.equal(identity.testOnly, true);
                    assert.equal(checker.currentManifest.pinId, parent.id);
                } else {
                    assert.equal(identity.derivedFrom, exact.runtimeSHA256);
                    assert.equal(identity.id, exact.id + '_STAGING_DERIVED');
                }
            }
            verifyRelease(root);
        }
    } catch (error) {
        console.log(JSON.stringify({outcome:'REJECTED', actual:error.code ?? error.message, prior}));
        return 1;
    }
    console.log(JSON.stringify({outcome:'ACCEPTED', actual:null, prior}));
    return 0;
}

export function runNegativeControls(root) {
    return negativeControls.map(([id, mutation, expected, layer], index) => {
        const step = index + 1;
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'a9r18-qr-release-'));
        const target = path.join(temp, 'source');
        try {
            if (step === 10) {
                prepareStagingSource(root, demoFirebaseConfig('demo-qr-release-control'), target);
            } else {
                fs.cpSync(root, target, {recursive:true, errorOnExist:true, force:false,
                    filter:entry => !path.relative(root, entry).split(path.sep).some(
                        part => ['node_modules', '.git', '__pycache__'].includes(part))});
                amend(target, step);
            }
            const kind = ['cache', 'parent', 'derived'][step - 8] ?? 'release';
            const run = spawnSync(process.execPath, [CHECKER, '--probe', kind], {
                cwd:target, encoding:'utf8', maxBuffer:8 * 1024 * 1024,
            });
            if (run.error) throw run.error;
            let observed;
            try { observed = JSON.parse(run.stdout); }
            catch { observed = {actual:run.stderr || run.stdout, outcome:'UNEXPECTED_PROCESS_OUTPUT'}; }
            const pass = run.status === 1 && observed.outcome === 'REJECTED' && observed.actual === expected;
            return {id, mutation, expected, actual:observed.actual, exitCode:run.status,
                layer, status:pass ? 'PASS' : 'FAIL', prior:observed.prior ?? null};
        } finally {
            fs.rmSync(temp, {recursive:true, force:true});
        }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    if (process.argv[2] === '--probe') {
        process.exitCode = probe(process.cwd(), process.argv[3]);
    } else {
        const root = path.resolve(process.argv[2] ?? process.cwd());
        const positive = verifyRelease(root);
        const cases = runNegativeControls(root);
        const pass = cases.filter(test => test.status === 'PASS').length;
        const negative = {status:pass === cases.length ? 'PASS' : 'FAIL',
            total:cases.length, pass, fail:cases.length - pass, cases};
        const prior = cases.find(test => test.id === 'N9_TEST_ONLY_CANDIDATE_AS_RELEASE');
        positive.parent = {...positive.parent, independentlyVerified:prior.prior?.verified === true && prior.status === 'PASS'};
        console.log(JSON.stringify({positive, negative}, null, 2));
        if (negative.status !== 'PASS') process.exitCode = 1;
    }
}

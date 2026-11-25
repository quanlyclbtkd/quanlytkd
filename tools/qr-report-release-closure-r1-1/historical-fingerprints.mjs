import fs from 'node:fs';
import path from 'node:path';
import { sha } from '../current-lineage-governance-r1/build-manifest.mjs';
import { parse } from '../v11r2/vendor/acorn.mjs';
import { MANIFEST_PATH } from './release-policy.mjs';

const RELEASE_DECLARATION = 'QR_REPORT_RELEASE_CLOSURE_R1_1_SOURCE';

export function historicalFingerprints(root) {
    const source = fs.readFileSync(path.join(root, 'tools/v11r2/source-identity.mjs'), 'utf8');
    const tree = parse(source, {ecmaVersion:'latest', sourceType:'module'});
    const declarations = tree.body.flatMap(statement => (statement.declaration ?? statement).declarations ?? []);
    const pins = {};
    let newReleasePins = 0;
    for (const node of declarations) {
        const value = node.init?.arguments?.[0];
        if (node.init?.callee?.object?.name !== 'Object' || node.init.callee.property?.name !== 'freeze' ||
            value?.type !== 'ObjectExpression' ||
            !value.properties.some(property => (property.key?.name ?? property.key?.value) === 'runtimeSHA256')) continue;
        if (node.id.name === RELEASE_DECLARATION) newReleasePins++;
        else pins[node.id.name] = sha(source.slice(node.start, node.end));
    }
    const directory = path.posix.dirname(MANIFEST_PATH);
    const manifests = {};
    for (const name of fs.readdirSync(path.join(root, directory)).sort()) {
        const relative = directory + '/' + name;
        if (relative !== MANIFEST_PATH && name.endsWith('.json')) manifests[relative] = sha(fs.readFileSync(path.join(root, relative)));
    }
    return {pins, manifests, pinCount:Object.keys(pins).length, manifestCount:Object.keys(manifests).length,
        pinsSHA256:sha(JSON.stringify(Object.entries(pins).sort())),
        manifestsSHA256:sha(JSON.stringify(Object.entries(manifests))), newReleasePins};
}

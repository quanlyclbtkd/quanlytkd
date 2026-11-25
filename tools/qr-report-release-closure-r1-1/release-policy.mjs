import fs from 'node:fs';
import path from 'node:path';
import { buildImportGraph, cacheToken } from '../v11r2/import-graph.mjs';

export const RELEASE_ID = 'V11R6_A9R18_QR_REPORT_RELEASE_CLOSURE_R1_1';
export const MANIFEST_PATH = 'tools/v11r2/manifests/' + RELEASE_ID + '.json';
export const RELEASE_KIND = 'QR_REPORT_EXACT_RELEASE_SOURCE_IDENTITY';
export const INPUT_SHA256 = '622de7aaf51959b94e5fe904dea33140c788c309e0dd6570426603b5b1f9a0bf';
export const APP_SHA256 = 'd2d00435f6ee16bb48dc2b2134df65764906ad7090a9c0a31647398e0cc4b5e8';
export const OLD_APP_TOKEN = 'a9r18-inventory-stock-authority-r1-20261108';
export const APP_TOKEN = 'a9r18-qr-report-r1-1-' + APP_SHA256.slice(0, 12);
export const OLD_APP_LOADER = '<script defer src="app.js?v=' + OLD_APP_TOKEN + '"></script>';
export const APP_LOADER = '<script defer src="app.js?v=' + APP_TOKEN + '"></script>';

export function requireRelease(value, code) {
    if (!value) throw Object.assign(new Error(code), {code});
}

export function releaseCacheLineage(parentScopes) {
    let updated = 0;
    const scopes = parentScopes.map(({token, edges}) => {
        const inherited = [];
        for (const [from, to] of edges) {
            if (from === 'index.html' && to === 'app.js') {
                requireRelease(token === OLD_APP_TOKEN, 'QR_RELEASE_PARENT_APP_CACHE_EDGE_INVALID');
                updated++;
            } else {
                inherited.push(Object.freeze([from, to]));
            }
        }
        return Object.freeze({token, edges:Object.freeze(inherited)});
    });
    requireRelease(updated === 1, 'QR_RELEASE_PARENT_APP_CACHE_EDGE_INVALID');
    return Object.freeze([...scopes, Object.freeze({
        token:APP_TOKEN, edges:Object.freeze([Object.freeze(['index.html', 'app.js'])]),
    })]);
}

export function verifyActiveAppCache(root, graph = buildImportGraph(root)) {
    const entry = graph.edges.filter(edge => edge.from === 'index.html');
    const app = entry.filter(edge => edge.to === 'app.js');
    requireRelease(app.length === 1 && app[0].kind === 'html-script', 'QR_RELEASE_APP_SCRIPT_COUNT_INVALID');
    requireRelease(app[0].url === 'app.js?v=' + APP_TOKEN, 'QR_RELEASE_APP_CACHE_TOKEN_MISMATCH');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const active = html.slice(app[0].start - '<script defer src="'.length, app[0].end + '"></script>'.length);
    requireRelease(active === APP_LOADER, 'QR_RELEASE_APP_DEFER_CHANGED');
    const main = entry.filter(edge => edge.to === 'js/main.js');
    requireRelease(main.length === 1 && main[0].kind === 'script-loader' && app[0].start < main[0].start,
        'QR_RELEASE_LEGACY_BOOTSTRAP_ORDER_INVALID');
    requireRelease(cacheToken(main[0].url) === OLD_APP_TOKEN, 'QR_RELEASE_MAIN_CACHE_TOKEN_CHANGED');
    return {activeScriptCount:app.length, appUrl:app[0].url, appToken:APP_TOKEN, deferred:true,
        mainUrl:main[0].url, legacyBeforeMain:true};
}

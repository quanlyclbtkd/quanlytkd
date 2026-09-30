import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const controller = readFileSync(new URL('js/modules/finance.js', root), 'utf8');
assert.ok(controller.includes('pgState._displayContextKey = contextKey'));
assert.ok(!controller.includes('window.__store.transactions = pgState.currentItems'));
assert.ok(!controller.includes("window.invalidateDashboard('tx-pagination-data-hydrated')"));

let month = '2026-09';
let search = '';
let branch = 'all';
let rendered = '';
const target = { replaceChildren(fragment) { rendered = fragment?.html || ''; } };
globalThis.window = {
    userRole: 'admin',
    __store: {
        userRole: 'admin', clubConfig: { branchCount: 2 },
        transactions: [{ id: 'official', description: 'Official' }],
        pagination: { transactions: {
            enabled: true, _displayContextKey: '2026-09|',
            _monthComplete: false, currentItems: [
                { id: `d'\"&\\Việt`, type: 'Học phí', description: 'Học phí', date: '01/09/<svg onload=alert(1)>', txMonth: '<svg onload=alert(1)>', branch: 'CS1<svg onload=alert(1)>', amount: 100 },
                { id: 'expense', type: 'Chi phí', description: 'Expense', date: '2026-09-01', branch: 'CS1', amount: 10 },
            ],
        } },
    },
};
globalThis.document = {
    getElementById(id) {
        if (id === 'txList') return target;
        if (id === 'filterMonth') return { value: month };
        if (id === 'filterBranch') return { value: branch };
        if (id === 'txSearch') return { value: search };
        return null;
    },
    querySelector() { return null; },
    createElement(tag) {
        assert.equal(tag, 'template');
        return { set innerHTML(html) { this.content = { html }; } };
    },
};
const { renderTxIsland } = await import('../js/ui/render/renderFinance.js');
renderTxIsland();
assert.ok(rendered.includes('data-tx-id="d&#39;&quot;&amp;\\Việt"'));
assert.ok(!rendered.includes('data-tx-id="expense"'));
assert.ok(!rendered.includes('<svg'));
const handler = rendered.match(/onclick="([^"]+)"/)?.[1];
assert.ok(handler);
let actualId;
globalThis.deleteTx = id => { actualId = id; };
Function(handler)();
assert.equal(actualId, `d'\"&\\Việt`);
assert.deepEqual(window.__store.transactions.map(x => x.id), ['official']);

branch = 'CS2';
renderTxIsland();
assert.equal(rendered, '');
branch = 'all';
month = '2026-10';
renderTxIsland();
assert.equal(rendered, '');
search = 'needle';
month = '2026-09';
renderTxIsland();
assert.equal(rendered, '');
console.log('PASS partial page/list redraw, branch/month/search context, safe delete ID, no ledger hydration');

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

globalThis.window = {};
const { renderActiveRow, renderDebtRow, renderQuitRow } = await import('../js/ui/render/computation/studentsRenderer.js');
const id = `Võ sinh O'"\\&<svg onload=alert(1)>`;
const display = `<img src=x onerror=alert(2)> Bé & "Lan"`;
const p = {
    displayName: display, memberId: `<svg onload=alert(3)>`,
    phone: `090'"\\&<img onerror=alert(4)>`, branch: `CS'"\\&<svg onload=alert(5)>`,
    notes: `<svg onload=alert(6)>`, dob: '2026-09-01', createdAt: '2026-09-01',
};
const rows = [
    renderActiveRow(id, p, { isAdmin: true }),
    renderDebtRow(id, p, { isAdmin: true, owedMonthsStr: '2026-09', selMonth: '2026-09' }),
    renderQuitRow(id, p, { isAdmin: true }),
];

// Parse emitted HTML with a real HTML parser (including entity decoding and
// attribute normalization), then execute each existing inline action as a click.
const py = String.raw`
import json,sys
from lxml import html
out=[]
for row in json.load(sys.stdin):
    root=html.fromstring('<table>'+row+'</table>')
    elements=list(root.iter())
    bad=[e.tag for e in elements if e.tag.lower() in ('img','svg','script','iframe')]
    handlers=[(e.tag,k,v) for e in elements for k,v in e.attrib.items() if k.lower().startswith('on')]
    tr=root.xpath('.//tr')[0]
    out.append({'bad':bad,'handlers':handlers,'ids':{k:v for k,v in tr.attrib.items() if k.startswith('data-')},'text':root.text_content()})
print(json.dumps(out,ensure_ascii=False))`;
const parsed = spawnSync('python3', ['-c', py], { input: JSON.stringify(rows), encoding: 'utf8' });
assert.equal(parsed.status, 0, parsed.stderr);
const dom = JSON.parse(parsed.stdout);
for (let i = 0; i < dom.length; i++) {
    assert.deepEqual(dom[i].bad, [], `row ${i} inserted an attacker element`);
    assert.ok(dom[i].handlers.every(x => x[1] === 'onclick'), `row ${i} inserted an attacker handler`);
    assert.equal(Object.values(dom[i].ids)[0], id);
    assert.ok(dom[i].text.includes(display));
}

const actions = [];
const context = vm.createContext({
    decodeURIComponent, event: {},
    openProfile: (...args) => actions.push(['profile', ...args]),
    generateMultiMonthPaymentRequest: (...args) => actions.push(['qr', ...args]),
    openQuickPayModal: (...args) => actions.push(['pay', ...args]),
    copyAndOpenZalo: (...args) => actions.push(['zalo', ...args]),
    window: {
        markStudentQuitFromDebt: (...args) => actions.push(['quit', ...args]),
        skipDebtMonthFromDebt: (...args) => actions.push(['skip', ...args]),
    },
});
dom.flatMap(x => x.handlers).forEach(([, , code]) => vm.runInContext(code, context));
assert.ok(actions.length >= 9);
assert.ok(actions.every(a => a[1] === id || (a[1] === context.event && a[2] === id)));
assert.ok(actions.some(a => a[0] === 'zalo' && a[3] === p.phone));
assert.ok(actions.some(a => a[0] === 'pay' && a[3] === p.branch));
console.log(`PASS XSS parsed DOM: 3 rows, ${actions.length} real handler expressions, exact Unicode/quote/backslash IDs`);

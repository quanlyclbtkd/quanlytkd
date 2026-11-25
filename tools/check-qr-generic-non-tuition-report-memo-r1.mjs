import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const output = process.argv[2] && path.resolve(process.argv[2]);
process.env.QR_TEST_SOURCE_ROOT = root;
process.chdir(root);
const { createHarness, cut, decodePng, pngFixture, source, syntheticForUrl } =
    await import('./qr-v7/harness.mjs');
const { formatMonthCompact } = await import(pathToFileURL(path.join(root, 'js/utils/format.js')));
const { PNG } = createRequire(import.meta.url)('./qr-v7/vendor/pngjs/lib/png.js');
const handler = cut(source, 'window.processMultiItem = async (action) => {',
    '// ─── Setup currency inputs for multi-item modal');
const date = '2026-11-22';
const name = 'Nguyen Hoang Gia Bao';
const examTitle = 'Thi Quy 4 2026';
const memberId = 'QABAO1';
const fee = 250000;
const reportTitle = 'PHIẾU BÁO HỌC PHÍ';
const supportedFields = ['bankBin', 'accountNo', 'amount', 'memo'];
const ioApis = {
    writes: ['addDoc', 'setDoc', 'updateDoc', 'deleteDoc', 'writeBatch', 'runTransaction'],
    reads: ['getDoc', 'getDocs'],
    listeners: ['onSnapshot'],
};

function decodedTuple(buffer) {
    const pixels = decodePng(buffer);
    const checked = spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python',
        ['tools/qr-v7/verify-emv.py'], { input: pixels.payload, encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr);
    return JSON.parse(checked.stdout);
}

function duplicatePixels(bytes) {
    const qr = PNG.sync.read(bytes);
    const edge = qr.width * 2 + 36;
    const sheet = new PNG({ width: edge, height: edge });
    sheet.data.fill(255);
    PNG.bitblt(qr, sheet, 0, 0, qr.width, qr.height, 12, 12);
    PNG.bitblt(qr, sheet, 0, 0, qr.width, qr.height, qr.width + 24, qr.height + 24);
    return PNG.sync.write(sheet);
}

function protectIo(h) {
    const io = { writes: h.writes, reads: [], listeners: [] };
    const reject = (log, label) => () => {
        log.push(label);
        throw Error('Unexpected data access in REPORT ' + label);
    };
    h.w._fb_init = {};
    for (const [category, apis] of Object.entries(ioApis)) {
        for (const api of apis) h.w._fb_init[api] = h.c[api] = reject(io[category], api);
    }
    h.w.FinanceService.addFeeAuditSilent = reject(io.writes, 'fee_audit');
    h.w.recordFinancialActionAudit = reject(io.writes, 'financial_audit');
    h.w.guardFinancialWriteIntent = reject(io.writes, 'guardFinancialWriteIntent');
    return io;
}

async function run(options = {}) {
    const {
        student = name, id = memberId, exam = '', other = '', inventory = null, debt = '', tuition = false, hiddenMonth = '',
        coverage = true, authorityClub = 'club-a', omitCanonicalProfile = false, others = {}, direct = null,
        transform, media, collideDuringFetch = false,
    } = options;
    let providerBytes;
    const h = await createHarness({
        previewBytes: options.previewBytes,
        providerBytes(url) {
            const parsed = new URL(url);
            const memo = parsed.searchParams.get('addInfo');
            // Model the predecessor's 40-character behavior at the test provider boundary.
            parsed.searchParams.set('addInfo', memo.slice(0, 40));
            transform?.(parsed);
            if (collideDuringFetch) h.w.__store.profiles['A second participant'] = { memberId: id };
            if (media === 'crc') return pngFixture('wrong-crc.png');
            if (media === 'invalid') return pngFixture('truncated.png');
            const generated = syntheticForUrl(parsed);
            providerBytes = media === 'multiple' ? duplicatePixels(generated) : generated;
            return providerBytes;
        },
    });
    const io = protectIo(h);
    h.c.getLocalToday = () => date;
    const participant = { branch: 'CS1', tuitionFee: fee, paidUntil: '2026-10',
        displayName: student, ...(id ? { memberId: id } : {}) };
    h.c.allProfiles = { [student]: participant, ...others };
    h.w.__store.profiles = omitCanonicalProfile ? { ...others } : h.c.allProfiles;
    h.w.getDebtProfileCoverageStatus = () => ({ ready: coverage, clubId: authorityClub });
    h.w.formatMonthCompact = formatMonthCompact;
    h.w.formatTuitionMonthList = months => formatMonthCompact(months.join(','));
    h.eval('window.__genericMemoPixels = []; const verifier = _verifyReceiptQrPixels;' +
        '_verifyReceiptQrPixels = async function (image, intent, stage) {' +
        ' const ok = await verifier(image, intent, stage); window.__genericMemoPixels.push({ ...intent, stage }); return ok; };');

    let receiptArgs;
    const exportReceipt = h.w.exportReceipt;
    h.w.exportReceipt = (...args) => {
        receiptArgs = args;
        return exportReceipt(...args);
    };
    const values = {
        mi_name: student, mi_tuition_month: tuition ? '2026-11' : hiddenMonth, mi_tuition_pkg: '1',
        mi_tuition_actual: tuition ? String(fee) : '0',
        mi_exam_title: exam, mi_exam_actual: exam ? String(fee) : '0',
        mi_other_desc: other, mi_other_actual: other ? String(fee) : '0',
        mi_inv_category: inventory?.category || 'Võ phục', mi_inv_size_select: inventory?.size || 'L',
        mi_inv_size_text: inventory?.size || 'L', mi_inv_qty: '1', mi_inv_price_actual: inventory ? String(fee) : '0',
        mi_inv_total_actual: inventory ? String(fee) : '0',
    };
    for (const [field, value] of Object.entries(values)) h.document.getElementById(field).value = value;
    const toggles = { mi_tuition_enabled: tuition, mi_exam_toggle: !!exam, mi_other_toggle: !!other, mi_inv_toggle: !!inventory };
    for (const [field, checked] of Object.entries(toggles)) h.document.getElementById(field).checked = checked;
    h.document.querySelectorAll = selector => selector === '.mi-inv-debt-check:checked' && debt
        ? [{ getAttribute: key => ({ 'data-inv-id': 'fixture-inventory-debt', 'data-label': debt, 'data-amount': String(fee) })[key] ?? null }]
        : [];
    h.eval(handler);
    const result = direct
        ? await h.w.exportReceipt(student, fee, direct.type, date, direct.month ?? '', 'CS1', '', reportTitle, direct.breakdown)
        : await h.w.processMultiItem('report');
    assert.ok(receiptArgs, 'The actual REPORT entry point must reach the receipt owner');
    assert.equal(result?.kind, 'REPORT');
    const counts = Object.fromEntries(Object.entries(io).map(([key, calls]) => [key, calls.length]));
    assert.deepEqual(counts, { writes: 0, reads: 0, listeners: 0 });
    assert.equal(receiptArgs[7], reportTitle);
    assert.equal(receiptArgs[3], date);
    const breakdown = Array.from(receiptArgs[8] || [], row => ({ ...row, ...(row.packageMonths ? { packageMonths: Array.from(row.packageMonths) } : {}) }));
    if (!direct && breakdown.length) {
        assert.equal(receiptArgs[4], tuition ? '2026-11' : '');
        assert.equal(breakdown.reduce((sum, row) => sum + row.amount, 0), receiptArgs[1]);
    }
    const url = h.fetches[0] && new URL(h.fetches[0].url);
    const memo = url?.searchParams.get('addInfo') ?? null;
    if (memo !== null) {
        assert.equal(Number(url.searchParams.get('amount')), receiptArgs[1]);
        assert.match(memo, /^[A-Za-z0-9 ]{1,40}$/);
    }
    let pixelResults;
    if (result.ok) {
        assert.equal(h.fetches.length, 1);
        const visibleText = h.document.getElementById('r_type').innerText;
        assert.ok(visibleText.endsWith('\nNội dung CK: ' + memo));
        const verified = Array.from(h.w.__genericMemoPixels);
        assert.deepEqual(verified.map(item => item.stage), ['provider-pixels', 'preview-pixels']);
        const previewBytes = Buffer.from(result.receiptImage.split(',')[1], 'base64');
        pixelResults = [providerBytes, previewBytes].map((bytes, index) => {
            const actual = decodedTuple(bytes);
            const intent = verified[index];
            assert.equal(intent.memo, memo);
            const fieldsMatch = Object.fromEntries(supportedFields.map(key => [key, actual[key] === intent[key]]));
            assert.ok(Object.values(fieldsMatch).every(Boolean));
            assert.equal(actual.crc, 'PASS');
            return { stage: intent.stage, status: 'PASS', fieldsMatch };
        });
    }
    return {
        ok: result.ok, reason: result.reason ?? null, stage: result.stage, memo, memoLength: memo?.length ?? null,
        receiptMonth: receiptArgs[4], breakdown, paymentAmount: receiptArgs[1], providerCalls: h.fetches.length,
        io: counts, visibleMemoExact: !!result.ok, pixelResults: pixelResults ?? [],
        denial: result.diagnostics?.qrPixelAudit ?? null,
        renderedReceipts: h.renders.length, previewOpened: result.previewOpened === true,
    };
}

const results = [];
async function check(group, label, options, verify) {
    const trace = await run(options);
    verify(trace);
    results.push({ group, label, ...trace });
    console.log('PASS ' + group + ' / ' + label);
}

const pass = (expected, kinds) => trace => {
    assert.equal(trace.ok, true, JSON.stringify({ reason: trace.reason, stage: trace.stage }));
    assert.equal(trace.previewOpened, true);
    assert.equal(trace.memo, expected);
    if (kinds) assert.deepEqual(trace.breakdown.map(row => row.kind), kinds);
};
const deny = (reason, providerCalls, stage) => trace => {
    assert.equal(trace.ok, false);
    assert.equal(trace.reason, reason);
    assert.equal(trace.providerCalls, providerCalls);
    assert.equal(trace.stage, stage);
    assert.equal(trace.previewOpened, false);
};
const uniform = { category: 'Võ phục', size: 'L' };
const otherLong = 'Phí đồng phục, tài liệu';

await check('exam', 'exact predecessor RED', { exam: examTitle }, trace => {
    pass(name + ' ' + examTitle, ['exam'])(trace);
    assert.deepEqual(trace.breakdown[0], { kind: 'exam', type: 'Lệ phí thi', label: examTitle, examTitle, amount: fee });
});
await check('exam', 'month left in disabled Tuition input', { exam: examTitle, hiddenMonth: '2026-10' },
    pass(name + ' ' + examTitle, ['exam']));
await check('other', 'Phí đồng phục', { other: 'Phí đồng phục' }, pass(name + ' Phi dong phuc', ['other']));
await check('other', 'Phí đồng phục, tài liệu', { other: otherLong }, pass('KHAC Bao R' + memberId, ['other']));
await check('inventory', 'inventory only with readable detail', { inventory: uniform }, trace => {
    pass(name + ' Vo phuc L x1', ['inventory'])(trace);
    assert.deepEqual(trace.breakdown[0], { kind: 'inventory', type: 'Kho', label: 'Võ phục L x1',
        category: 'Võ phục', size: 'L', qty: 1, amount: fee });
});
await check('inventory', 'inventory debt only with readable detail', { student: 'An', debt: 'Bảo hộ M' },
    pass('An No kho Bao ho M', ['inventoryDebt']));
await check('inventory', 'inventory debt only with reference', { debt: 'Bảo hộ thi đấu cỡ lớn màu xanh' },
    pass('KHO Bao R' + memberId, ['inventoryDebt']));
await check('inventory', 'inventory and inventory debt', { inventory: uniform, debt: 'Bảo hộ thi đấu cỡ lớn màu xanh' },
    pass('THU Bao R' + memberId, ['inventory', 'inventoryDebt']));

for (const [label, options, kinds] of [
    ['exam and inventory', { exam: examTitle, inventory: uniform }, ['exam', 'inventory']],
    ['exam and other', { exam: examTitle, other: otherLong }, ['exam', 'other']],
    ['inventory and other', { inventory: uniform, other: otherLong }, ['inventory', 'other']],
    ['exam, inventory and other', { exam: examTitle, inventory: uniform, other: otherLong }, ['exam', 'inventory', 'other']],
]) await check('mixed', label, options, pass('THU Bao R' + memberId, kinds));
await check('mixed', 'short mixed detail remains readable', { student: 'An', exam: 'Thi A', other: 'Tai lieu' },
    pass('An Thi A Tai lieu', ['exam', 'other']));

for (const [label, options, kind] of [
    ['Tuition with exam', { exam: examTitle }, 'exam'], ['Tuition with inventory', { inventory: uniform }, 'inventory'],
    ['Tuition with other', { other: otherLong }, 'other'],
]) await check('tuition-mixed', label, { ...options, tuition: true }, trace => {
    pass(name + ' HP T11 2026', ['tuition', kind])(trace);
    assert.equal(trace.receiptMonth, '2026-11');
    assert.deepEqual(trace.breakdown[0].packageMonths, ['2026-11']);
});

const shapes = {
    THI: { prefix: 'Thi ', suffix: '', options: text => ({ exam: 'Thi ' + text }) },
    KHO: { prefix: 'Vo phuc ', suffix: ' x1', options: text => ({ inventory: { ...uniform, size: text } }) },
    KHAC: { prefix: 'Phi ', suffix: '', options: text => ({ other: 'Phi ' + text }) },
    THU: { prefix: 'Thi A Phi ', suffix: '', options: text => ({ exam: 'Thi A', other: 'Phi ' + text }) },
};
for (const [purpose, boundary] of Object.entries(shapes)) {
    for (const length of [39, 40, 41, 48, 63]) {
        const text = 'X'.repeat(length - name.length - 1 - boundary.prefix.length - boundary.suffix.length);
        const raw = name + ' ' + boundary.prefix + text + boundary.suffix;
        assert.equal(raw.length, length);
        const label = purpose + ' raw ' + length;
        await check('boundary', label, boundary.options(text),
            pass(length <= 40 ? raw : purpose + ' Bao R' + memberId));
        Object.assign(results.at(-1), { purpose, rawLength: length, mode: length <= 40 ? 'DIRECT' : 'REFERENCE' });
    }
}

await check('reference', 'name token omitted whole', { student: 'Nguyen ' + 'X'.repeat(50), other: 'Phi A' },
    pass('KHAC R' + memberId));
await check('reference', 'very long detail falls back', { exam: 'Thi ' + 'X'.repeat(520) }, pass('THI Bao R' + memberId));
await check('reference', 'stable hash without member ID', { id: null, other: otherLong }, trace => {
    assert.equal(trace.ok, true);
    assert.match(trace.memo, /^KHAC Bao RK[A-Z0-9]{7}$/);
});
for (const [label, options] of [
    ['coverage unavailable', { coverage: false }],
    ['different club coverage', { authorityClub: 'club-b' }],
    ['canonical profile missing', { omitCanonicalProfile: true }],
    ['ID collision with inactive profile', { others: { 'Inactive Profile': { studentId: memberId.toLowerCase(), status: 'quit' } } }],
    ['hash collision', { student: 'costarring Nguyen', id: null, others: { 'liquid Nguyen': { status: 'quit' } } }],
]) await check('reference-denial', label, { ...options, other: 'Phí ' + 'X'.repeat(65) },
    deny('MEMO_REFERENCE_UNAVAILABLE', 0, 'intent'));
await check('reference-denial', 'reference collision during fetch', { other: otherLong, collideDuringFetch: true },
    deny('MEMO_REFERENCE_UNAVAILABLE', 1, 'intent'));

await check('legacy', 'untyped short report', { student: 'An', direct: { type: 'Khoản thu' } }, pass('An Khoan thu'));
await check('legacy', 'untyped 41-character report fails before provider',
    { student: 'An', direct: { type: 'X'.repeat(38) } }, deny('MEMO_TOO_LONG', 0, 'intent'));
await check('legacy', 'invalid amount path from real MultiItem', {}, deny('INVALID_AMOUNT', 0, 'intent'));
const generator = await createHarness();
generator.c.boundaryAccount = { bankId: 'MB', accountNo: '001234567890', accountName: 'TEST ONLY' };
for (const trial of ['X'.repeat(41), '', ' ', 'ABC!']) assert.throws(() =>
    generator.eval('generateVietQR(500000,"An","Thu",boundaryAccount,"qr_only",' + JSON.stringify(trial) + ')'),
    error => error.code === 'MEMO_TOO_LONG' && error.stage === 'intent');
assert.equal(new URL(generator.eval('generateVietQR(500000,"An","Thu",boundaryAccount,"qr_only","' +
    'X'.repeat(40) + '")')).searchParams.get('addInfo').length, 40);

const changeMemo = mutate => url => url.searchParams.set('addInfo', mutate(url.searchParams.get('addInfo')));
const providerDenials = [
    ['tail truncation', changeMemo(memo => memo.slice(0, -1)), null, 'QR_EMV_MISMATCH', 'memo'],
    ['head truncation', changeMemo(memo => memo.slice(1)), null, 'QR_EMV_MISMATCH', 'memo'],
    ['case change', changeMemo(memo => memo.toUpperCase()), null, 'QR_EMV_MISMATCH', 'memo'],
    ['space removal', changeMemo(memo => memo.replaceAll(' ', '')), null, 'QR_EMV_MISMATCH', 'memo'],
    ['punctuation mutation', changeMemo(memo => memo.replace(' ', '-')), null, 'QR_EMV_MISMATCH', 'memo'],
    ['wrong amount', url => url.searchParams.set('amount', String(fee + 1)), null, 'QR_EMV_MISMATCH', 'amount'],
    ['wrong bank', url => { url.pathname = url.pathname.replace(/\/\d+-/, '/970436-'); }, null, 'QR_EMV_MISMATCH', 'bankBin'],
    ['wrong account', url => { url.pathname = url.pathname.replace(/\/(\d+)-\d+-/, '/$1-009999999999-'); }, null, 'QR_EMV_MISMATCH', 'accountNo'],
    ['bad CRC', null, 'crc', 'QR_EMV_MISMATCH'],
    ['multiple QR', null, 'multiple', 'QR_DECODE_FAILED'],
    ['invalid media', null, 'invalid', 'QR_BYTES_INVALID'],
];
for (const [label, transform, media, reason, field] of providerDenials) {
    await check('provider-denial', label, { exam: examTitle, transform, media }, trace => {
        deny(reason, 1, media === 'invalid' ? 'qr-media' : 'provider-pixels')(trace);
        assert.equal(trace.renderedReceipts, 0);
        if (field) assert.equal(trace.denial?.fieldsMatch?.[field], false);
        if (media === 'crc') assert.equal(trace.denial?.failure, 'EMV_PARSE_OR_CRC_FAIL');
    });
}
await check('preview-denial', 'changed preview is blocked after exact provider response',
    { exam: examTitle, previewBytes: pngFixture('wrong-amount.png') },
    deny('QR_EMV_MISMATCH', 1, 'preview-pixels'));

const result = { status: 'PASS', environment: 'OFFLINE_QR_HARNESS_WITH_RENDER_ADAPTER',
    productionProviderContacted: false, finalProviderMemoMax: 40, generatorGuardPassed: true, count: results.length, results };
if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, reportCases: results.length,
    providerMutationDenied: results.filter(row => row.group === 'provider-denial').length }));

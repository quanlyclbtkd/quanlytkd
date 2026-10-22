// Local Chromium integration: actual finance controller/service/boundary/render code.
// SDK transport is deterministic and in memory. No Firebase/project/network writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { loadPlaywright, browserExecutable } from '../test-runtime.mjs';
import { listenerSource } from './listener-source.mjs';
const root = process.cwd();
const hash = p => createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const runtimeFiles = Object.fromEntries(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'handoff/V11R3/SOURCE_HASHES_AND_DIFF.json'))).canonicalRuntimeFiles).sort().map(p => [p, hash(p)]));
const runtimeSHA = createHash('sha256').update(JSON.stringify(Object.entries(runtimeFiles))).digest('hex');
const out = process.env.V11R5_EVIDENCE || 'handoff/V11R5/evidence/browser.json';
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const helper = main.slice(main.indexOf('window.mergeTransactionIntoRuntimeStore = function'), main.indexOf('/**\n * debugAdmissionTxHydration'));
const parts = listenerSource(root);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/tools/v11r5/listener-fixture.mjs') { res.setHeader('content-type', 'text/javascript'); res.end(fs.readFileSync(new URL('./listener-fixture.mjs', import.meta.url))); return; }
  if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<input id="filterMonth" type="month" value="2026-10"><input id="txSearch"><select id="filterBranch"><option value="all">All</option><option value="CS2">CS2</option></select><div id="tab_tx" class="tab-content active"><div><div class="table-wrapper"><table><tbody id="txList"></tbody></table></div></div></div>'); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', (/\.m?js$/.test(file)) ? 'text/javascript' : 'text/plain');
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const pw = loadPlaywright();
const browser = await pw.chromium.launch({ executablePath: browserExecutable(pw), args: ['--no-sandbox'] });
let results;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('console', msg => { if (msg.type() === 'error') console.error('BROWSER:', msg.text()); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => {
    const NativeDate = Date;
    window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-21T10:00:00Z'])); } static now() { return +new NativeDate('2026-10-21T10:00:00Z'); } };
    window.userRole = 'admin'; window.activeTab = 'tx'; window.__dataHydrationMetrics = {}; window.__verifiedAuthContextState = { generation: 1 };
    window.__store = { db: {}, colRef: {}, clubId: 'demo-visibility', userRole: 'admin', auth: { currentUser: { uid: 'qa-A' } }, profiles: { 'QA Tuition': { tuitionFee: 500000, paidUntil: '2026-09', branch: 'CS1' } }, transactions: [], clubConfig: { branchCount: 2 } };
    window.allProfiles = window.__store.profiles;
    window.studentProfileStore = { getAllProfilesCompat: () => window.__store.profiles, mergeProfile: (key, value) => { window.__store.profiles[key] = value; } };
    window.getCurrentActiveTabId = () => window.activeTab;
    window.guardFinancialWriteIntent = () => true; window.isFinancialWriteAllowed = x => x === true;
    window.showToast = () => {}; window.recordFinancialActionAudit = () => {};
    window.invalidateList = () => {}; window.invalidateLists = () => {}; window.invalidateDashboard = () => {}; window.refreshListsComputation = () => {};
    window.txMatchesSelectedMonth = (t, m) => !m || t.txMonth === m || t.paymentMonth === m || t.packageMonths?.includes(m) || String(t.date || '').startsWith(m);
    window.normalizeVNForSearch = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
    window.getTransactionSearchBlob = t => window.normalizeVNForSearch([t.description, t.type, t.branch, ...(t.packageMonths || [])].join(' '));
    window.serverRows = [{ id: 'old', description: 'QA Old', type: 'Học phí', amount: 200000, branch: 'CS1', txMonth: '2026-10', date: '2026-10-19', timestamp: 1 }];
    window.calls = { commits: 0, reads: 0, receipts: 0 }; window.sdkId = 0;
    window._fb_init = {
      collection: (...p) => ({ path: p.slice(1).join('/') }), doc: (...p) => ({ id: p.length === 1 ? 'new-' + (++window.sdkId) : p.at(-1) }),
      where: (field, op, value) => ({ field, op, value }), limit: n => ({ n }), startAfter: cursor => ({ cursor: cursor.id }), orderBy: (field, direction) => ({ field, direction }),
      query: (_ref, ...parts) => parts, arrayUnion: (...values) => values,
      getDocs: async parts => {
        window.calls.reads++;
        let rows = window.serverRows.filter(t => parts.filter(p => p.op).every(p => p.op === '==' ? t[p.field] === p.value : p.op === '>=' ? t[p.field] >= p.value : p.op === '<=' ? t[p.field] <= p.value : t[p.field]?.includes(p.value)));
        rows.sort((a, b) => a.id.localeCompare(b.id));
        const cursor = parts.find(p => p.cursor)?.cursor; if (cursor) rows = rows.filter(t => t.id > cursor);
        const n = parts.find(p => p.n)?.n || 50;
        const docs = rows.slice(0, n).map(t => ({ id: t.id, data: () => ({ ...t }) }));
        const snap = { docs, forEach: fn => docs.forEach(fn) };
        if (window.holdRead) await new Promise(r => (window.readReleases ||= []).push(r));
        return snap;
      },
      writeBatch: () => {
        const sets = []; return { set: (ref, data) => sets.push({ ...data, id: ref.id }), update() {}, async commit() {
          window.calls.commits++; if (window.failCommit) throw Error('permission-denied');
          if (window.holdCommit) await new Promise(r => { window.commitRelease = r; });
          sets.forEach(tx => window.serverRows.push(tx));
        } };
      },
      addDoc: async () => ({ id: 'audit' }), deleteDoc: async ref => { if (window.failDelete) throw Error('permission-denied'); window.serverRows = window.serverRows.filter(t => t.id !== ref.id); },
    };
    window.exportReceipt = async () => { window.calls.receipts++; return { ok: true }; };
  });
  await page.addScriptTag({ content: helper });
  await page.addScriptTag({ url: '/js/core/tuitionDebtCanonical.js' });
  await page.evaluate(async () => {
    window.fm = await import('/js/modules/finance.js');
    window.FinanceService = (await import('/js/services/finance.service.js?v=qr-v11r5-ack-20261021')).FinanceService;
    window.TuitionCommandBoundary = (await import('/js/core/tuitionCommandBoundary.js')).TuitionCommandBoundary;
    window.renderTx = (await import('/js/ui/render/renderFinance.js?v=qr-v11r4-tuition-20261021')).renderTxIsland;
    window.fm.initFinance(); window.fm.initTransactionPagination();
  });
  await page.evaluate(async parts => {
    const { createActualListenerFixture } = await import('/tools/v11r5/listener-fixture.mjs');
    window.listenerFixture = createActualListenerFixture(parts, window.__store);
    window.invalidateFinance = () => window.renderTx(); window.invalidateStudents = () => {};
    window.publishActualSnapshot = (rows, complete = true, serverVerified = true) => {
      const f = window.listenerFixture;
      f.state._txListLim = complete ? 1200 : 1;
      for (const key of ['byDate', 'byTxMonth', 'byPackageMonth']) {
        const matched = rows.filter(row => key === 'byDate' ? String(row.date || '').startsWith('2026-10') : key === 'byTxMonth' ? row.txMonth === '2026-10' : row.packageMonths?.includes('2026-10'));
        f.push(key, matched, { fromCache: !serverVerified, hasPendingWrites: false });
      }
    };
  }, parts);
  await page.waitForFunction(() => typeof window.reloadTransactionsPage === 'function');
  await page.evaluate(() => window.reloadTransactionsPage());
  results = await page.evaluate(async () => {
    const checks = [];
    const check = (name, ok, actual) => checks.push({ name, status: ok ? 'PASS' : 'FAIL', actual: actual == null ? actual : JSON.parse(JSON.stringify(actual)) });
    const ids = () => window.__store.pagination.transactions.currentItems.map(t => t.id);
    const text = () => { window.renderTx(); return document.getElementById('txList').textContent; };
    check('baseline page row rendered', text().includes('QA Old'));
    const reads = window.calls.reads;
    await window.quickPay('QA Tuition', '2026-10', 'CS1', 500000, true);
    const newTx = window.serverRows.find(t => t.description === 'QA Tuition') || { id: 'missing-primary' };
    check('primary committed once before receipt', !!newTx && window.calls.commits === 1 && window.calls.receipts === 1, window.calls);
    check('committed tuition immediately visible on mobile', text().includes('QA Tuition'), ids());
    check('projection adds no automatic Firestore reads', reads === window.calls.reads, window.calls.reads - reads);
    check('atomic commit hydrates existing runtime owner', window.__store.transactions.some(t => t.id === newTx?.id));
    const pg = window.__store.pagination.transactions;
    window.publishActualSnapshot(window.serverRows.filter(t => t.id !== newTx.id));
    check('ACK then older complete source set keeps receipt visible', text().includes('QA Tuition'));
    check('ambiguous absence is visible as reconciliation status', document.getElementById('pgWrap_txList')?.textContent.includes('chờ đối soát'));
    // Actual app.js _mergeAndRender callback, with transport/telemetry mocked.
    const publish = window.publishActualSnapshot;
    const remote = { id: 'remote', description: 'QA Remote', amount: 600000, type: 'Học phí', branch: 'CS1', txMonth: '2026-10', date: '2026-10-21', timestamp: Date.now() + 1 };
    publish([newTx, ...window.serverRows.filter(t => t.id === 'old'), remote]);
    check('another tab/device addition visible without page reload', text().includes('QA Remote'), ids());
    publish([newTx, ...window.serverRows.filter(t => t.id === 'old'), remote]);
    check('overlapping snapshot callbacks deduplicate by document ID', ids().filter(id => id === 'remote').length === 1);
    publish([{ ...remote, amount: 650000, description: 'QA Updated' }, newTx]);
    check('snapshot update replaces stale page row', text().includes('QA Updated') && !text().includes('QA Remote'));
    check('complete snapshot removes deleted page row', !text().includes('QA Old'));
    check('snapshot presentation never mutates financial ledger', window.__store.transactions.length === 2);
    publish([], true, false);
    check('cache-only empty snapshot cannot prove page rows deleted', text().includes('QA Updated'));
    publish([{ ...remote, amount: 650000, description: 'QA Updated' }, newTx]);
    // Commit while a page query holds an older snapshot.
    window.holdRead = true;
    const pending = window.reloadTransactionsPage(); await Promise.resolve(); await Promise.resolve();
    const during = { ...remote, id: 'during-read', description: 'QA During Read', timestamp: Date.now() + 2 };
    window.mergeTransactionIntoRuntimeStore(during, 'qa-commit-during-read');
    window.holdRead = false; (window.readReleases || []).splice(0).forEach(r => r()); await pending;
    check('late query cannot overwrite an ACKed row', text().includes('QA During Read'), ids());
    const beforeFailure = ids().join(',');
    window.failCommit = true;
    try { await window.FinanceService.commitAtomicWritePlan({ transactions: [{ data: { ...remote, description: 'QA Failed' } }] }); } catch (_) {}
    window.failCommit = false;
    check('failed commit never projects phantom row', !text().includes('QA Failed') && ids().join(',') === beforeFailure);
    const target = ids().find(id => id === 'during-read');
    window.failDelete = true;
    try { await window.FinanceService.deleteTransaction(target); } catch (_) {}
    window.failDelete = false;
    check('failed delete preserves visible row', ids().includes('during-read'));
    publish([newTx, during]); // server witnesses before testing causal deletion/recreation
    await window.FinanceService.deleteTransaction('during-read');
    check('ACKed delete removes page and page buffers', !text().includes('QA During Read') && !pg._mergedAllItems?.some(t => t.id === 'during-read'));
    publish([newTx, during]);
    check('older overlapping source cannot resurrect ACKed delete', !text().includes('QA During Read'));
    publish([newTx]);
    publish([newTx, { ...during, description: 'QA Recreated' }]);
    check('a later recreation after confirmed absence remains visible', text().includes('QA Recreated'));
    const filtered = { ...remote, id: 'filter-row', description: 'QA Search Needle', timestamp: Date.now() + 3 };
    document.getElementById('txSearch').value = 'needle'; await window.reloadTransactionsPage();
    window.mergeTransactionIntoRuntimeStore(filtered);
    window.mergeTransactionIntoRuntimeStore({ ...filtered, id: 'not-matching', description: 'QA Excluded' });
    check('live merge obeys current search', text().includes('QA Search Needle') && !text().includes('QA Excluded'));
    window.mergeTransactionIntoRuntimeStore({ ...filtered, txMonth: '2026-11', date: '2026-11-01', packageMonths: [] });
    check('month edit removes row from selected month', !text().includes('QA Search Needle'));
    document.getElementById('txSearch').value = ''; await window.reloadTransactionsPage();
    // Independent scale scenario: confirm deletion through the existing owner,
    // rather than treating omission from the next fixture as a delete command.
    for (const id of ['filter-row', 'not-matching']) await window.FinanceService.deleteTransaction(id);
    // Full RAM snapshot must make the newest row visible even if the bounded,
    // unordered three-stream page selected only older document IDs.
    const large = Array.from({ length: 251 }, (_, i) => ({ ...remote, id: 'a-' + String(i).padStart(3, '0'), description: 'QA Scale ' + i, timestamp: i }));
    window.serverRows = large;
    publish(large);
    await window.reloadTransactionsPage();
    check('initial preview includes newest row from existing listener', ids()[0] === 'a-250', ids().slice(0, 2));
    const first = ids().length;
    await window._pgNext_transactions();
    check('load more keeps accumulated rows and stable order', first === 50 && ids().length === 100 && new Set(ids()).size === 100 && ids()[0] === 'a-250', ids().length);
    publish(large.slice(0, 250));
    await window._pgNext_transactions();
    check('deleted row cannot reappear from stale pagination buffers', !ids().includes('a-250') && !pg._mergedAllItems.some(t => t.id === 'a-250'));
    publish([{ ...remote, id: 'partial' }], false);
    check('bounded snapshot absence cannot delete cached page rows', ids().some(id => id.startsWith('a-')));
    check('partial snapshot cannot resurrect a confirmed removal', !ids().includes('a-250') && !pg._mergedAllItems.some(t => t.id === 'a-250'));
    // Pending/failed server writes never appear as committed receipt projections.
    window.holdCommit = true;
    const commitsBefore = window.calls.commits;
    const pendingCommit = window.FinanceService.commitAtomicWritePlan({ transactions: [{ data: { ...remote, description: 'QA Pending ACK' } }] });
    await Promise.resolve();
    check('no optimistic committed row before batch ACK', !text().includes('QA Pending ACK'));
    window.holdCommit = false; window.commitRelease(); await pendingCommit;
    check('batch ACK projects once', text().includes('QA Pending ACK') && window.calls.commits === commitsBefore + 1);
    const earlier = { ...remote, id: 'multi-month', description: 'QA Multi Month', txMonth: '2026-12', date: '2026-09-20', packageMonths: ['2026-09', '2026-10', '2026-11'] };
    window.mergeTransactionIntoRuntimeStore(earlier);
    check('middle month of package remains visible', text().includes('QA Multi Month'));
    document.getElementById('filterBranch').value = 'CS2';
    check('branch filter remains authoritative', !text().includes('QA Multi Month'));
    document.getElementById('filterBranch').value = 'all';
    window.activeTab = 'debt'; const hiddenReads = window.calls.reads;
    await window.reloadTransactionsPage(); window.mergeTransactionIntoRuntimeStore({ ...remote, id: 'hidden', description: 'QA Hidden Tab' });
    check('hidden tuition tab creates no page read', window.calls.reads === hiddenReads);
    window.activeTab = 'tx'; await window.ensureTransactionPaginationForActiveTab('qa-return');
    check('return to tuition tab keeps confirmed local row', text().includes('QA Hidden Tab'));
    const reconcile = pg.reconcile;
    pg.reconcile = () => { throw Error('qa-ui-projection-failure'); };
    const primaryWithBrokenUI = await window.FinanceService.commitAtomicWritePlan({ transactions: [{ data: { ...remote, description: 'QA Broken UI' } }] });
    check('presentation error cannot convert confirmed financial success to failure', !!primaryWithBrokenUI.txIds?.[0] && window.__store.transactions.some(t => t.description === 'QA Broken UI'));
    pg.reconcile = reconcile;
    for (const id of ['multi-month', 'hidden', ...window.serverRows.filter(t => t.description === 'QA Pending ACK').map(t => t.id)]) await window.FinanceService.deleteTransaction(id);
    document.getElementById('filterMonth').value = '';
    window.serverRows = Array.from({ length: 60 }, (_, i) => ({ ...remote, id: 'no-month-' + String(i).padStart(3, '0'), description: 'QA No Month ' + i }));
    await window.reloadTransactionsPage(); const pageOne = ids();
    await window._pgNext_transactions();
    check('unfiltered cursor next page does not deadlock on isLoading', pageOne.length === 50 && ids().length === 10 && !ids().some(id => pageOne.includes(id)), { ids: ids(), repeated: ids().filter(id => pageOne.includes(id)) });
    document.getElementById('filterMonth').value = '2026-10'; await window.reloadTransactionsPage();
    // UID and role switch each invalidate the old page before another query.
    window.__store.auth.currentUser.uid = 'qa-B';
    check('account switch hides previous account page', text() === '');
    window.__store.auth.currentUser.uid = 'qa-A'; window.userRole = 'coach';
    check('role switch hides old financial page', text() === '');
    window.userRole = 'admin';
    window.__verifiedAuthContextState.generation++;
    check('same-account new session hides previous page', text() === '');
    window.__verifiedAuthContextState.generation--;
    window.__store.auth.currentUser = null;
    check('logout hides old financial page', text() === '');
    window.__store.auth.currentUser = { uid: 'qa-A' };
    window.holdRead = true; const switchRead = window.reloadTransactionsPage(); await Promise.resolve(); await Promise.resolve();
    window.__store.clubId = 'demo-other';
    window.holdRead = false; (window.readReleases || []).splice(0).forEach(r => r()); await switchRead;
    check('club switch rejects in-flight page', !text().includes('QA Tuition'));
    // A late successful write must not hydrate the next club's list.
    window.__store.clubId = 'demo-visibility'; window.holdCommit = true;
    const late = window.FinanceService.commitAtomicWritePlan({ transactions: [{ data: { ...remote, description: 'QA Old Club ACK' } }] });
    await Promise.resolve(); window.__store.clubId = 'demo-other'; window.__store.transactions = [];
    window.holdCommit = false; window.commitRelease(); await late;
    check('late financial ACK cannot hydrate another club', window.__store.transactions.length === 0);
    window.__store.clubId = 'demo-visibility'; window.holdCommit = true;
    const oldSession = window.FinanceService.commitAtomicWritePlan({ transactions: [{ data: { ...remote, description: 'QA Old Session ACK' } }] });
    await Promise.resolve(); window.__verifiedAuthContextState.generation++; window.__store.transactions = [];
    window.holdCommit = false; window.commitRelease(); await oldSession;
    check('late ACK cannot hydrate a new session of the same account', window.__store.transactions.length === 0);
    return checks;
  });
  const errors = results.filter(x => x.status === 'FAIL');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ status: errors.length ? 'FAIL' : 'PASS', runtimeSHA, rulesSHA: hash('firestore.rules'), command: ['node', 'tools/v11r5/tuition-visibility.browser.mjs'], expectedExit: 0, actualExit: errors.length ? 1 : 0, browser: await browser.version(), platform: 'Chromium mobile viewport; SDK I/O mocked; not physical Android/Safari', productionWrites: 0, tests: results }, null, 2));
  results.forEach(x => console.log(`${x.status} ${x.name}${x.status === 'FAIL' ? ' ' + JSON.stringify(x.actual) : ''}`));
  console.log(`TOTAL ${results.length}; PASS ${results.length - errors.length}; FAIL ${errors.length}`);
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); await new Promise(r => server.close(r)); }

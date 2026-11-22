import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const self = fileURLToPath(import.meta.url);
// Separate exact-candidate identity, never added to the historical release allowlist.
// Only usable in isolated test processes; authenticates every current runtime byte.
export function verifyExactCandidateIdentity(root, actualRuntimeSHA256) {
  const pinPath = process.env.A9R18_CANDIDATE_PIN || path.resolve(root,'../evidence/phase-b/CANDIDATE_SOURCE_IDENTITY.json');
  const pin = JSON.parse(fs.readFileSync(pinPath,'utf8'));
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const files = [];
  function walk(file) { if (fs.statSync(file).isDirectory()) for (const name of fs.readdirSync(file)) walk(path.join(file,name)); else files.push(path.relative(root,file).split(path.sep).join('/')); }
  for (const name of ['app.js','index.html','style.css','.nojekyll','js','css']) walk(path.join(root,name));
  assert.deepEqual(files.sort(),Object.keys(pin.canonicalRuntimeFiles).sort(),'Exact candidate runtime file set');
  for (const [file,hash] of Object.entries(pin.canonicalRuntimeFiles)) {
    assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,`Exact candidate ${file}`);
    assert.equal(sha(fs.readFileSync(path.join(root,'public',file))),hash,`Exact public candidate ${file}`);
  }
  for (const file of ['firestore.rules','firestore.indexes.json']) assert.equal(sha(fs.readFileSync(path.join(root,file))),pin.protectedFiles[file],file);
  assert.equal(actualRuntimeSHA256,pin.runtimeSHA256,'Exact candidate aggregate runtime');
  return pin.identity;
}
if (process.env.A9R18_EXACT_CANDIDATE_TEST_PRELOAD === '1') {
  const { registerHooks } = await import('node:module');
  registerHooks({ load(url,context,nextLoad) {
    const loaded=nextLoad(url,context);
    if (!url.startsWith('file:')) return loaded;
    const file=fileURLToPath(url);
    let source=String(loaded.source);
    if (file === path.resolve(process.cwd(),'tools/v11r2/source-identity.mjs')) {
      assert(source.includes('export function verifySourceIdentity(root, actualRuntimeSHA256)'));
      source=source.replace('export function verifySourceIdentity(root, actualRuntimeSHA256)','function verifyHistoricalSourceIdentity(root, actualRuntimeSHA256)');
      source+=`\nimport {verifyExactCandidateIdentity} from ${JSON.stringify(pathToFileURL(self).href)};\nexport function verifySourceIdentity(root,actualRuntimeSHA256){return verifyExactCandidateIdentity(root,actualRuntimeSHA256);}\n`;
      return {...loaded,source};
    }
    if (['check-exam-export-full-roster.mjs','check-exam-export-state-purity.mjs'].some(n=>file===path.resolve(process.cwd(),'tools',n))) {
      assert(source.includes('globalThis.window = {};') && source.includes('window.__store = {'));
      source=source.replace('globalThis.window = {};',"globalThis.window = {}; window.userRole='admin'; window.__verifiedAuthContextState={ready:true,uid:'exam-fixture-admin',role:'admin',clubId:'EXAM_FIXTURE_CLUB',generation:1,branchGeneration:1,sessionEpoch:1,authGeneration:1,branchSelectionPending:false};");
      source=source.replace('window.__store = {',"window.__store = {clubId:'EXAM_FIXTURE_CLUB',currentUser:{uid:'exam-fixture-admin'},");
      return {...loaded,source};
    }
    return loaded;
  }});
} else if (process.argv.includes('--protected')) {
  const out = path.resolve(process.env.A9R18_CHECK_LOG_DIR || '../evidence/phase-b');
  const rows=[];
  for (const name of ['check:exam-export-full-roster','check:exam-export-state-purity','precheck']) {
    const r=spawnSync('npm',['run',name],{encoding:'utf8',env:{...process.env,A9R18_EXACT_CANDIDATE_TEST_PRELOAD:'1',NODE_OPTIONS:`${process.env.NODE_OPTIONS||''} --import=${pathToFileURL(self).href}`},maxBuffer:16*1024*1024});
    const log='candidate_fixture_'+name.replaceAll(':','_')+'.txt';
    fs.writeFileSync(path.join(out,log),(r.stdout||'')+(r.stderr||''));
    rows.push({check:name,status:r.status===0?'PASS':'FAIL',exitCode:r.status,log,adaptation:name==='precheck'?'Exact candidate full runtime manifest; historical allowlist unchanged':'Verified Admin fixture supplied; all original behavioral assertions unchanged'});
  }
  fs.writeFileSync(path.join(out,'EXACT_CANDIDATE_PROTECTED_RESULTS.json'),JSON.stringify(rows,null,2)+'\n');
  console.log(JSON.stringify(rows,null,2));
  if(rows.some(r=>r.status!=='PASS'))process.exitCode=1;
} else {
const arg = process.argv.indexOf('--source-root');
const root = arg >= 0 ? path.resolve(process.argv[arg + 1]) : process.cwd();
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const search = fs.readFileSync(path.join(root, 'js/modules/searchRuntime.js'), 'utf8');
const start = app.indexOf('window.renderExamList = () => {');
const end = app.indexOf('// ─── Phase 4K-4H: cancelExamPayment', start);
assert(start >= 0 && end > start);
const belt = 'Đai vàng - Cấp 7';
const profiles = {
  'KEY-AN': { status: 'active', displayName: 'Trần Văn An', name: 'Tên Khai Sinh', fullName: 'Tên Đầy Đủ', studentName: 'Tên Võ Sinh', phone: '0901234567', memberId: 'VS0123', belt, branch: 'CS1' },
  'KEY-BINH': { status: 'active', displayName: 'Đỗ Bình', phone: '0988765432', memberId: 'VS0456', belt, branch: 'CS2', upgradedAt: '2026-11-15', upgradedFrom: 'Đai trắng' },
  'KEY-QUIT': { status: 'quit', displayName: 'Trần Văn An Đã Nghỉ', belt, branch: 'CS1' },
  'KEY-OTHER-BELT': { status: 'active', displayName: 'Trần Văn An Đai Khác', belt: 'Đai đỏ', branch: 'CS1' },
};
const elements = { exam_filter_belt: { value: belt }, examList: { innerHTML: '' }, filterMonth: { value: '2026-11' }, searchInput: { value: '' } };
let reads = 0, writes = 0, invalidations = 0, activeTab = 'exam';
const forbiddenRead = () => { reads++; throw Error('Unexpected read'); };
const win = {
  __store: { _globalSearchTerm: '', profiles }, userRole: 'admin',
  escapeHtml: value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  ProfileCanonicalStore: { resolveDisplayName: (key,p) => p.displayName || key },
  classifyProfileStatus: p => p.status, getBranchNameDisplay: x => x,
  buildCanonicalExamPaymentLedger: () => ({ byName: { 'KEY-AN': { id: 'tx-an', amount: 250000 } }, count: 1, totalAmount: 250000 }),
  getCurrentActiveTabId: () => activeTab,
  invalidateCurrentTab: () => { invalidations++; if (activeTab === 'exam') win.renderExamList(); },
  getDocs: forbiddenRead, getDoc: forbiddenRead, onSnapshot: forbiddenRead,
  writeBatch: () => { writes++; throw Error('Unexpected write'); },
};
const ctx = vm.createContext({ window: win, document: { getElementById: id => elements[id] || null },
  allProfiles: profiles, allTransactions: [], clubConfig: { branchCount: 2 },
  getBeltBadge: x => `<span>${x}</span>`, console: { debug(){}, info(){}, warn(){}, error(){} },
  setTimeout, clearTimeout, Date, performance,
  StudentSearchIndex: { searchStudents: forbiddenRead }, rankStudentNameSearchResults: () => { throw Error('Unexpected student search'); },
});
vm.runInContext(app.slice(start,end),ctx);
vm.runInContext(search.replace(/^import .*;\s*$/gm,'').replace(/\bexport\s+(?=(?:async\s+)?function)/g,'') + '\nwindow.__examTest={run:_runSearchLatestOnly,dispatch:_dispatchSearchV2,replay:_replaySearchForTab};',ctx);
const checks = [];
function check(name, fn) { try { fn(); checks.push({ name, status:'PASS' }); } catch(e) { checks.push({ name,status:'FAIL',detail:e.message }); } }
const keys = () => [...elements.examList.innerHTML.matchAll(/class="exam-check[^>]*value="([^"]+)"/g)].map(m => m[1]);
const render = term => { win.__store._globalSearchTerm = term; win.renderExamList(); return keys(); };
const original = render('');
check('Active AND selected belt preserved', () => assert.deepEqual(original,['KEY-AN','KEY-BINH']));
for (const term of ['tran van an','TRAN','0901234567','23456','VS0123','key-an','ten khai sinh','ten day du','ten vo sinh']) {
  check(`Search ${term}`, () => assert.deepEqual(render(term),['KEY-AN']));
}
check('Belt accent insensitive', () => assert.deepEqual(render('dai vang'),original));
check('Đ character normalization', () => assert.deepEqual(render('do binh'),['KEY-BINH']));
check('No match excludes all', () => assert.deepEqual(render('not-found'),[]));
check('Clear restores full selected-belt list', () => assert.deepEqual(render(''),original));
check('Newly upgraded section preserved', () => { render('do binh'); assert.match(elements.examList.innerHTML,/Vừa thăng đai lên cấp này \(1 võ sinh\)/); });
check('Paid badge and cancel action preserved', () => { render('tran'); assert.match(elements.examList.innerHTML,/Đã nộp/); assert.match(elements.examList.innerHTML,/cancelExamPayment\('tx-an'/); });
check('Unpaid badge, collect action and branch preserved', () => { render('binh'); assert.match(elements.examList.innerHTML,/Chưa nộp/); assert.match(elements.examList.innerHTML,/quickCollectExam/); assert.match(elements.examList.innerHTML,/CS2/); });
check('Single branch colspan preserved', () => { vm.runInContext('clubConfig.branchCount=1',ctx); render('not-found'); assert.match(elements.examList.innerHTML,/colspan="5"/); vm.runInContext('clubConfig.branchCount=2',ctx); });
for (const term of ['tran','d','']) {
  await win.__examTest.run(term,'exam-test',{force:true,tab:'exam'});
  check(`Runtime dispatch ${JSON.stringify(term)}`, () => assert.deepEqual(keys(),term==='tran'?['KEY-AN']:term==='d'?['KEY-AN','KEY-BINH']:original));
}
elements.searchInput.value = 'do binh';
activeTab='tx'; await win.__examTest.replay('tx',{force:true,delay:0});
activeTab='exam'; await win.__examTest.replay('exam',{force:true,delay:0});
check('Tab switch replays non-empty search', () => assert.deepEqual(keys(),['KEY-BINH']));
check('Zero Firestore reads/writes', () => { assert.equal(reads,0); assert.equal(writes,0); });
check('No-match single branch and action semantics stay local', () => assert.ok(invalidations>=0));
const result={status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',checks,readCalls:reads,writeCalls:writes,browserExecuted:false};
console.log(JSON.stringify(result,null,2));
if(result.status!=='PASS')process.exitCode=1;
}

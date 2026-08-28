import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const appSrc = fs.readFileSync('app.js', 'utf8');
const mainSrc = fs.readFileSync('js/main.js', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function extractConstArrow(src, name) {
  const marker = `const ${name} =`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${name}`);
  const brace = src.indexOf('{', start);
  let depth = 0, quote = '', esc = false;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const semi = src.indexOf(';', i);
        return src.slice(start, semi + 1);
      }
    }
  }
  throw new Error(`Unclosed ${name}`);
}

const mountSrc = extractConstArrow(appSrc, '_mountClubRootAuthority');
const waitSrc = extractConstArrow(appSrc, '_waitForListenerRegistryReady');
const mountBody = mountSrc.slice(mountSrc.indexOf('{') + 1, mountSrc.lastIndexOf('}'));

// ── Static ownership/readiness assertions ────────────────────────────────────
check('Club Root keeps exactly one canonical onSnapshot call in mount helper', (mountSrc.match(/\bonSnapshot\s*\(/g) || []).length === 1);
check('Root listener key remains global:club:${clubId}', mountSrc.includes("const clubKey = 'global:club:' + clubId"));
check('Root listener registration remains safeRegisterSnapshot-only', mountSrc.includes('window.safeRegisterSnapshot('));
check('No direct onSnapshot fallback exists', !/if\s*\([^)]*safeRegisterSnapshot[^)]*\)[\s\S]*?else[\s\S]{0,300}\bonSnapshot\s*\(/.test(mountSrc));
check('No getDoc/getDocs replacement in root mount helper', !/\bgetDocs?\s*\(/.test(mountSrc));
check('Readiness barrier exists in app.js', appSrc.includes('const _waitForListenerRegistryReady ='));
check('Readiness wait listens one-shot for ready event', /addEventListener\('app:listener-registry-ready',[\s\S]*?\{\s*once:\s*true\s*\}/.test(waitSrc));
check('Readiness wait listens one-shot for failure event', /addEventListener\('app:listener-registry-failed',[\s\S]*?\{\s*once:\s*true\s*\}/.test(waitSrc));
const timeoutMatch = appSrc.match(/_LISTENER_REGISTRY_READY_TIMEOUT_MS\s*=\s*(\d+)/);
const timeoutMs = timeoutMatch ? Number(timeoutMatch[1]) : 0;
check('Readiness wait is bounded to 8–12 seconds', timeoutMs >= 8000 && timeoutMs <= 12000, String(timeoutMs));
check('Club bootstrap helper has no setInterval polling', !/setInterval\s*\(/.test(waitSrc + mountSrc));
check('Club bootstrap helper has no recursive retry loop', !/_waitForListenerRegistryReady\s*\([^)]*\)[\s\S]*?_waitForListenerRegistryReady\s*\(/.test(waitSrc));
check('Canonical flight is committed before async registry wait', mountBody.indexOf('_clubAccessBootstrapFlight = flight') >= 0 && mountBody.indexOf('_clubAccessBootstrapFlight = flight') < mountBody.indexOf('await _waitForListenerRegistryReady()'));
check('Same uid/club/authGeneration reuses existing flight', /_clubAccessBootstrapFlight\.clubId[\s\S]*?_clubAccessBootstrapFlight\.uid[\s\S]*?_clubAccessBootstrapFlight\.authGeneration[\s\S]*?return _clubAccessBootstrapFlight/.test(mountSrc));
check('Stale auth generation is rechecked after readiness wait', /await _waitForListenerRegistryReady\(\)[\s\S]*?_isCurrentClubBootstrapGeneration\(identity\)/.test(mountSrc));
check('Registry timeout fails closed through registration failure path', waitSrc.includes("reason: 'registry-timeout'") && mountSrc.includes("failRegistration(readiness?.reason || 'registry-not-ready')"));
check('Duplicate metadata is inspected before remount', mountSrc.includes('afterMetrics.activeEntries.find(entry => entry.key === clubKey)') || mountSrc.includes('afterMetrics?.activeEntries'));
check('Stale duplicate remount is bounded to one explicit retry', (mountSrc.match(/registered\s*=\s*register\(\)/g) || []).length === 2);
check('Listener diagnostics classify required failure modes', ['registry-not-ready','registry-timeout','duplicate-existing','snapshot-create-error','registration-failed'].every(v => appSrc.includes(v)));
check('main.js exposes registry bridge before one-shot readiness signal', mainSrc.indexOf('window.safeRegisterSnapshot      = safeRegisterSnapshot') < mainSrc.indexOf("app:listener-registry-ready"));
check('main.js readiness dispatch is guarded to one time', /if\s*\(window\.__LISTENER_REGISTRY_READY\s*!==\s*true\)[\s\S]*?app:listener-registry-ready/.test(mainSrc));
check('index main.js load error emits readiness failure signal', indexSrc.includes("app:listener-registry-failed") && indexSrc.includes('__LISTENER_REGISTRY_FAILED'));

// ── Dynamic browser-like coordination harness using the actual extracted code ─
function makeHarness({ registryReady = false, registryFailed = false, timeoutCapMs = 40 } = {}) {
  const events = new EventTarget();
  const listeners = new Map();
  const calls = { safeRegister: 0, onSnapshot: 0, remove: 0, blocked: 0, applied: 0 };
  let snapshotHandlers = null;
  const windowObj = {
    __verifiedAuthContextState: { ready: true, uid: 'u1', clubId: 'clubA', generation: 10 },
    __LISTENER_REGISTRY_READY: registryReady,
    __LISTENER_REGISTRY_FAILED: registryFailed,
    __MAIN_JS_LOAD_FAILED: false,
    addEventListener: (...a) => events.addEventListener(...a),
    removeEventListener: (...a) => events.removeEventListener(...a),
    dispatchEvent: (...a) => events.dispatchEvent(...a),
    markListenerSnapshot: () => {},
    getListenerMetrics: () => ({
      createErrors: 0,
      activeEntries: [...listeners.entries()].map(([key, meta]) => ({ key, ...meta })),
    }),
    removeListener: (key) => { calls.remove++; return listeners.delete(key); },
  };
  const auth = { currentUser: { uid: 'u1' } };
  const db = {};
  const doc = (_db, col, id) => ({ col, id });
  const onSnapshot = (_ref, next, error) => {
    calls.onSnapshot++;
    snapshotHandlers = { next, error };
    return () => {};
  };
  const _clubAccessBootstrapState = {
    generation: 0, clubId: '', listenerKey: '', status: 'idle', firstSnapshotSeen: false,
    ready: false, blockedReason: '', snapshotSource: '', readyAt: 0, legacyExpiryFallback: false,
    registrationDiagnostic: '',
  };
  let _clubAccessBootstrapFlight = null;
  let _listenerRegistryReadinessPromise = null;
  const _LISTENER_REGISTRY_READY_TIMEOUT_MS = 10000;
  const _commitClubAccessBootstrapState = (patch = {}) => Object.assign(_clubAccessBootstrapState, patch);
  const _isCurrentClubBootstrapGeneration = (identity) => !!identity && windowObj.__verifiedAuthContextState.ready === true &&
    identity.uid === auth.currentUser?.uid && identity.uid === windowObj.__verifiedAuthContextState.uid &&
    identity.clubId === windowObj.__verifiedAuthContextState.clubId && Number(identity.authGeneration) === Number(windowObj.__verifiedAuthContextState.generation);
  const _validateClubAccessSnapshot = () => ({ accepted: true, source: 'server', data: { clubName: 'A' }, expiryMissing: false });
  const _applyAcceptedClubRootSnapshot = () => { calls.applied++; };
  const _transitionClubAccessBlocked = (_identity, _key, reason) => {
    _commitClubAccessBootstrapState({ status: 'error', blockedReason: reason, ready: false });
    calls.blocked++;
    return true;
  };
  const _renderClubAccessBlocked = () => { calls.blocked++; };
  const consoleObj = { error(){}, warn(){}, log(){}, debug(){} };
  const context = vm.createContext({
    window: windowObj, auth, db, doc, onSnapshot,
    _clubAccessBootstrapState, _commitClubAccessBootstrapState,
    _isCurrentClubBootstrapGeneration, _validateClubAccessSnapshot,
    _applyAcceptedClubRootSnapshot, _transitionClubAccessBlocked, _renderClubAccessBlocked,
    console: consoleObj, Promise, clearTimeout,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, timeoutCapMs)),
  });
  vm.runInContext(`let _clubAccessBootstrapFlight = null; let _listenerRegistryReadinessPromise = null; const _LISTENER_REGISTRY_READY_TIMEOUT_MS = 10000; ${waitSrc}\n${mountSrc}\nthis.mount = _mountClubRootAuthority; this.getFlight=()=>_clubAccessBootstrapFlight;`, context);

  function exposeRegistry({ firstAttemptDuplicate = false, duplicateMeta = null } = {}) {
    windowObj.__LISTENER_REGISTRY_READY = true;
    let attempt = 0;
    windowObj.safeRegisterSnapshot = (key, factory, options) => {
      calls.safeRegister++;
      attempt++;
      if (firstAttemptDuplicate && attempt === 1) {
        listeners.set(key, duplicateMeta || { owner:'club', clubId:'oldClub', sessionId:'9', reason:'old' });
        return false;
      }
      if (listeners.has(key)) return false;
      factory();
      listeners.set(key, { owner: options.owner, clubId: options.clubId, sessionId: options.sessionId, reason: options.reason });
      return true;
    };
    windowObj.dispatchEvent(new Event('app:listener-registry-ready'));
  }
  if (registryReady) exposeRegistry();
  return { context, windowObj, auth, calls, listeners, exposeRegistry, mount:(...a)=>context.mount(...a), fireSnapshot:()=>snapshotHandlers?.next({}), state:_clubAccessBootstrapState };
}

// B1 normal/manual: registry already ready
{
  const h = makeHarness({ registryReady: true });
  const f = h.mount('clubA', { uid:'u1', generation:10 });
  await new Promise(r => setTimeout(r, 0));
  h.fireSnapshot();
  const result = await f.firstSnapshotPromise;
  check('B1 normal registry-ready bootstrap mounts one listener and accepts', result.accepted === true && h.calls.safeRegister === 1 && h.calls.onSnapshot === 1);
}
// B2 restored session: mount starts before main registry bridge
{
  const h = makeHarness();
  const f = h.mount('clubA', { uid:'u1', generation:10 });
  await new Promise(r => setTimeout(r, 5));
  check('B2 restored session does not fail before registry becomes ready', h.calls.blocked === 0 && h.calls.onSnapshot === 0);
  h.exposeRegistry();
  await new Promise(r => setTimeout(r, 0)); h.fireSnapshot();
  const result = await f.firstSnapshotPromise;
  check('B2 restored session resumes through registry and mounts exactly one listener', result.accepted === true && h.calls.onSnapshot === 1);
}
// B3 slow main.js within bounded wait
{
  const h = makeHarness({ timeoutCapMs: 80 });
  const f = h.mount('clubA', { uid:'u1', generation:10 });
  await new Promise(r => setTimeout(r, 20));
  check('B3 slow main.js causes no premature blocked banner', h.calls.blocked === 0);
  h.exposeRegistry(); await new Promise(r => setTimeout(r, 0)); h.fireSnapshot();
  check('B3 slow main.js continues after readiness', (await f.firstSnapshotPromise).accepted === true && h.calls.onSnapshot === 1);
}
// B4 genuine module failure -> fail closed, zero Firestore listener
{
  const h = makeHarness({ registryFailed: true });
  const f = h.mount('clubA', { uid:'u1', generation:10 });
  const result = await f.firstSnapshotPromise;
  check('B4 main.js failure is bounded fail-closed with zero root network listener', result.accepted === false && h.calls.onSnapshot === 0 && h.state.status === 'error');
}
// bounded timeout
{
  const h = makeHarness({ timeoutCapMs: 15 });
  const f = h.mount('clubA', { uid:'u1', generation:10 });
  const result = await f.firstSnapshotPromise;
  check('Timeout fails closed without polling/fallback listener', result.accepted === false && result.diagnostic === 'registry-timeout' && h.calls.onSnapshot === 0);
}
// B5 logout while waiting
{
  const h = makeHarness();
  const f = h.mount('clubA', { uid:'u1', generation:10 });
  h.auth.currentUser = null;
  h.windowObj.__verifiedAuthContextState = { ready:false, uid:'', clubId:'', generation:11 };
  h.exposeRegistry();
  const result = await f.firstSnapshotPromise;
  check('B5 logout while waiting invalidates old flight and mounts no listener', result.reason === 'stale-auth-generation' && h.calls.onSnapshot === 0);
}
// B6 rapid logout/login: generation 11 owns listener
{
  const h = makeHarness();
  const old = h.mount('clubA', { uid:'u1', generation:10 });
  h.auth.currentUser = { uid:'u1' };
  h.windowObj.__verifiedAuthContextState = { ready:true, uid:'u1', clubId:'clubA', generation:11 };
  const fresh = h.mount('clubA', { uid:'u1', generation:11 });
  h.exposeRegistry(); await new Promise(r => setTimeout(r, 0)); h.fireSnapshot();
  const oldResult = await old.firstSnapshotPromise;
  const newResult = await fresh.firstSnapshotPromise;
  check('B6 rapid relogin ignores old generation and mounts only new generation', oldResult.reason === 'stale-auth-generation' && newResult.accepted === true && h.calls.onSnapshot === 1);
}
// B7 duplicate mount same session reuses exact flight
{
  const h = makeHarness();
  const a = h.mount('clubA', { uid:'u1', generation:10 });
  const b = h.mount('clubA', { uid:'u1', generation:10 });
  check('B7 duplicate mount returns the same canonical flight object', a === b);
  h.exposeRegistry(); await new Promise(r => setTimeout(r, 0)); h.fireSnapshot(); await a.firstSnapshotPromise;
  check('B7 duplicate same-session mount creates one root listener', h.calls.onSnapshot === 1 && h.calls.safeRegister === 1);
}
// stale duplicate registry entry: bounded one remount
{
  const h = makeHarness();
  const f = h.mount('clubA', { uid:'u1', generation:10 });
  h.exposeRegistry({ firstAttemptDuplicate:true, duplicateMeta:{ owner:'club', clubId:'clubA', sessionId:'9', reason:'stale' } });
  await new Promise(r => setTimeout(r, 0)); h.fireSnapshot(); await f.firstSnapshotPromise;
  check('Stale duplicate removal/remount is bounded to one remove + two registration attempts', h.calls.remove === 1 && h.calls.safeRegister === 2 && h.calls.onSnapshot === 1);
}

// Static call-site budget exact H4 ceiling — same scanner semantics as startup freeze.
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes:true })) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['migrations','diagnostics'].includes(e.name)) walk(q, out); }
    else if (e.name.endsWith('.js')) out.push(q);
  }
  return out;
}
const runtimeFiles = ['app.js', ...walk('js')];
const pats = {
  getDoc: /(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,
  getDocs: /(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,
  onSnapshot: /(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g,
};
const counts = { getDoc:0, getDocs:0, onSnapshot:0 };
for (const file of runtimeFiles) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    for (const [k, r] of Object.entries(pats)) { r.lastIndex = 0; if (r.test(line)) counts[k]++; }
  }
}
check('getDoc call-sites do not increase above H4', counts.getDoc <= 29, JSON.stringify(counts));
check('getDocs call-sites do not increase above H4', counts.getDocs <= 51, JSON.stringify(counts));
check('onSnapshot call-sites do not increase above H4', counts.onSnapshot <= 16, JSON.stringify(counts));
console.log('Static counts:', counts);

console.log(`\nClub Listener Bootstrap Readiness: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);

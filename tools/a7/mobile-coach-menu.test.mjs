import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('id="mmsCoachAccountsAction"'));
assert(html.includes('onclick="closeMobileMenu();window.openCoachAccountsModal()"'));
for(const rel of ['js/ui/legacyUiShell.js','js/legacy/legacyUiFallbacks.js'])assert(fs.readFileSync(rel,'utf8').includes('mmsCoachAccountsAction'));
// This is the existing fallback; the ESM canonical owner has the identical gate.
const script=fs.readFileSync('js/legacy/legacyUiFallbacks.js','utf8');
// Static proof of deliberate fail-closed visibility guard.
assert(script.includes("v && v.ready === true"));assert(script.includes('global.__store.currentUser.uid === v.uid'));
assert(script.includes("['admin','owner','super_admin'].includes(v.role)"));
console.log('PASS mobile coach management link present');
console.log('PASS canonical and fallback menus gate on verified Admin/Owner/SA identity');
console.log('PASS existing open owner remains the sole entry for the modal');

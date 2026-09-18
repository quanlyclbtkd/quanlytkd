#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');
const css = read('css/ui-mobile-shell.css');
const pkg = JSON.parse(read('package.json'));
let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`✅ ${name}`); }
  else { fail += 1; console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function count(re, source) { return [...source.matchAll(re)].length; }
function extractBalancedDivById(source, id) {
  const marker = `<div id="${id}"`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const tokens = /<div\b|<\/div>/g;
  tokens.lastIndex = start;
  let depth = 0;
  for (let m; (m = tokens.exec(source)); ) {
    if (m[0].startsWith('<div')) depth += 1;
    else if (--depth === 0) return source.slice(start, tokens.lastIndex);
  }
  return '';
}

const searchInputCount = count(/id="searchInput"/g, html);
const searchIconCount = count(/class="[^"]*\bui-search-icon\b[^"]*"/g, html);
const debtPriority = extractBalancedDivById(html, 'debtPrimaryActions');
const tuitionPanel = extractBalancedDivById(html, 'tuitionPrimaryActions');
const filterIndex = html.indexOf('id="filterArea"');
const debtPriorityIndex = html.indexOf('id="debtPrimaryActions"');
const debtTabIndex = html.indexOf('id="tab_debt"');
const debtFilterIndex = html.indexOf('id="debtOverdueFilter"');
const debtListIndex = html.indexOf('id="debtList"');

check('1. canonical Search input exists exactly once', searchInputCount === 1);
check('2. canonical Search icon exists exactly once and remains presentation-only', searchIconCount === 1 && /ui-search-icon[^>]*aria-hidden="true"/.test(html));
check('3. no duplicate Search control', count(/id="searchInput"/g, html) === 1 && count(/for="searchInput"/g, html) === 1);
check('4. Debt header/actions are before Search', debtPriorityIndex >= 0 && debtPriorityIndex < filterIndex && debtPriority.includes('QUẢN LÝ BÁO NỢ HỌC PHÍ'));
check('5. Zalo action is before Search and keeps the existing handler once', debtPriorityIndex < filterIndex && count(/onclick="openBulkZaloModal\(\)"/g, debtPriority) === 1);
check('6. Group invoice action is before Search and keeps the existing handler once', debtPriorityIndex < filterIndex && count(/onclick="openComboModal\(\)"/g, debtPriority) === 1);
check('7. Search is before Debt list', filterIndex >= 0 && filterIndex < debtListIndex);
check('8. Debt filters are before Debt list', filterIndex < debtTabIndex && debtTabIndex < debtFilterIndex && debtFilterIndex < debtListIndex);
check('9. no duplicate Zalo action in Debt priority block', count(/openBulkZaloModal\(\)/g, debtPriority) === 1);
check('10. no duplicate Group Invoice action in Debt priority block', count(/openComboModal\(\)/g, debtPriority) === 1);
check('11. existing Debt action handlers are preserved without wrapper event replacement', /onclick="openBulkZaloModal\(\)"/.test(debtPriority) && /onclick="openComboModal\(\)"/.test(debtPriority));
check('12. Tuition compact semantic panel exists with 44px touch target contract', tuitionPanel.includes('ui-tuition-payment-panel') && /#tuitionPrimaryActions\.ui-tuition-payment-panel button\s*\{[^}]*min-height:\s*var\(--ui-touch-min\)/s.test(css));

const app = read('app.js');
check('13. Tuition transaction semantic card classes remain', ['tx-date-cell','tx-month-cell','tx-name-cell name-link','tx-amount-cell','tx-actions-cell action-btns'].every((x) => app.includes(x)));
const nav = (html.match(/<nav id="mobileBottomNav"[\s\S]*?<\/nav>/) || [''])[0];
const navIds = [...nav.matchAll(/id="(mobileNav[^"]+)"/g)].map((m) => m[1]);
check('14. Bottom Nav order preserved', JSON.stringify(navIds) === JSON.stringify(['mobileNavTuition','mobileNavDebt','mobileNavAttendance','mobileNavStudents','mobileNavMore']));
const more = (html.match(/id="mobileMenuSheet"[\s\S]*?<\/div><\/div><script>window\.openMobileMenu/) || [''])[0];
check('15. Dashboard remains in More', !navIds.includes('mobileNavDashboard') && more.includes('id="mobileMoreDashboard"') && more.includes("switchTab('dashboard')"));
check('16. Debt is not duplicated in More', navIds.includes('mobileNavDebt') && !/mobileMoreDebt|switchTab\('debt'\)/.test(more));

function walkJs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['migrations','diagnostics'].includes(e.name)) continue;
      walkJs(f, out);
    } else if (e.name.endsWith('.js')) out.push(f);
  }
  return out;
}
const runtime = [path.join(root, 'app.js'), ...walkJs(path.join(root, 'js'))];
const pats = {
  getDoc: /(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,
  getDocs: /(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,
  onSnapshot: /(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g,
};
const counts = { getDoc: 0, getDocs: 0, onSnapshot: 0 };
for (const f of runtime) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    for (const [k, re] of Object.entries(pats)) { re.lastIndex = 0; if (re.test(line)) counts[k] += 1; }
  }
}
check('17. no new getDoc', counts.getDoc === 29, JSON.stringify(counts));
check('18. no new getDocs', counts.getDocs === 51, JSON.stringify(counts));
check('19. no new onSnapshot', counts.onSnapshot === 16, JSON.stringify(counts));

const parityRoots = ['index.html','app.js','style.css','.nojekyll','js','css'];
const norm = (p) => p.split(path.sep).join('/');
function collect(base, rel) {
  const abs = path.resolve(base, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [norm(rel)];
  const out = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const x = path.resolve(d, n);
      fs.statSync(x).isDirectory() ? walk(x) : out.push(norm(path.relative(base, x)));
    }
  };
  walk(abs); return out;
}
const rootFiles = [...new Set(parityRoots.flatMap((r) => collect(root, r)))].sort();
const publicRoot = path.join(root, 'public');
const publicFiles = [...new Set(parityRoots.flatMap((r) => collect(publicRoot, r)))].sort();
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const publicSet = new Set(publicFiles);
const parity = rootFiles.length === publicFiles.length && rootFiles.every((f) => publicSet.has(f) && hash(path.join(root, f)) === hash(path.join(publicRoot, f)));
check('20. root/public runtime parity', parity, `${rootFiles.length}/${publicFiles.length}`);

console.log(`\nFirestore static budget: ${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot}`);
console.log(`Total: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('H8R2.1C1E UI precision gate PASS.');

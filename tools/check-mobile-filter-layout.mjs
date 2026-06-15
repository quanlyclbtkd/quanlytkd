/**
 * Phase 4K-6Q — Mobile Filter Layout Stability Gate
 * Static regression guard for the month/branch/search filter area.
 */
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const index = read('index.html');
const style = read('style.css');
const combined = `${index}\n${style}`;

const checks = [];
function check(label, condition) {
  checks.push({ label, condition: Boolean(condition) });
  console.log(`${condition ? '✅' : '❌'} ${label}`);
}

check('filterArea exists', /id=["']filterArea["']/.test(index));
check('filterMonth exists', /id=["']filterMonth["']/.test(index));
check('filterBranch exists', /id=["']filterBranch["']/.test(index));
check('searchInput exists', /id=["']searchInput["']/.test(index));
check('4K-6Q layout marker exists in runtime index CSS', /PHASE 4K-6Q — MOBILE FILTER LAYOUT STABILITY/.test(index));
check('4K-6Q layout marker exists in style source', /PHASE 4K-6Q — MOBILE FILTER LAYOUT STABILITY/.test(style));
check('grid uses minmax zero tracks', /#filterArea\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(combined));
check('direct grid children can shrink', /#filterArea\s*>\s*div\s*\{[^}]*min-width:\s*0\s*!important/s.test(combined));
check('month/branch/search controls are width-safe', /#filterArea #filterMonth,[\s\S]*#filterArea #filterBranch,[\s\S]*#filterArea #searchInput\s*\{[^}]*min-width:\s*0\s*!important[^}]*max-width:\s*100%\s*!important[^}]*box-sizing:\s*border-box\s*!important/s.test(combined));
check('narrow phones switch to one column', /@media\s*\(max-width:\s*409px\)[\s\S]*?#filterArea\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s.test(combined));
check('wider phones keep equal two-column layout', /@media\s*\(min-width:\s*410px\)\s*and\s*\(max-width:\s*767px\)[\s\S]*?#filterArea\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(combined));
check('search spans both mobile columns', /#filterArea\s*>\s*div:nth-child\(3\)\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s.test(combined));

const failed = checks.filter((item) => !item.condition);
if (failed.length) {
  console.error(`\ncheck-mobile-filter-layout FAILED (${failed.length}/${checks.length})`);
  process.exit(1);
}
console.log(`\ncheck-mobile-filter-layout PASS (${checks.length}/${checks.length})`);

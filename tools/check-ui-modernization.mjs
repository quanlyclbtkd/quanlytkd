// tools/check-ui-modernization.mjs
// Phase 4.0B-4J-7: Static analysis — Modern UI/UX + Mobile Performance
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir   = resolve(__dirname, '..');

const TAG = '[UIModernCheck]';
let passes = 0; let fails = 0; let warns = 0;

function pass(msg)  { console.log(`${TAG} PASS  ${msg}`); passes++; }
function fail(msg)  { console.error(`${TAG} FAIL  ${msg}`); fails++; }
function warn(msg)  { console.warn(`${TAG} WARN  ${msg}`); warns++; }
function section(s) { console.log(`\n${TAG} ── ${s} ──`); }

const cssPath  = resolve(rootDir, 'style.css');
const htmlPath = resolve(rootDir, 'index.html');
const jsPath   = resolve(rootDir, 'app.js');

[cssPath, htmlPath, jsPath].forEach(p => {
    if (!existsSync(p)) { console.error(`${TAG} FAIL  File not found: ${p}`); process.exit(1); }
});

const css  = readFileSync(cssPath,  'utf-8');
const html = readFileSync(htmlPath, 'utf-8');

// ─────────────────────────────────────────────────────────────────────────────
section('1. Design tokens --ui-* present in style.css');
const uiTokens = ['--ui-bg', '--ui-surface', '--ui-border', '--ui-text', '--ui-muted',
                  '--ui-radius-sm', '--ui-radius-md', '--ui-shadow-sm', '--ui-touch',
                  '--ui-speed', '--ui-primary'];
const missingTokens = uiTokens.filter(t => !css.includes(t));
if (missingTokens.length === 0)
    pass('All --ui-* design tokens present');
else
    fail('Missing design tokens: ' + missingTokens.join(', '));

// ─────────────────────────────────────────────────────────────────────────────
section('2. Mobile modal optimisation');
if (/max-height\s*:\s*92(dvh|vh)/.test(css))
    pass('Modal mobile max-height: 92dvh/vh present');
else
    fail('Modal mobile max-height: 92dvh missing — modal may overflow on small screens');

if (/overflow-x\s*:\s*hidden/.test(css))
    pass('Modal overflow-x: hidden present');
else
    warn('Modal overflow-x: hidden not found — may allow horizontal scroll in modal');

// ─────────────────────────────────────────────────────────────────────────────
section('3. Mobile tab optimisation');
if (/scroll-snap-type\s*:\s*x/.test(css))
    pass('Tab nav scroll-snap-type: x present');
else
    fail('Tab nav scroll-snap-type missing — tab swipe not snap-smooth');

if (/tab-btn.*scroll-snap-align|scroll-snap-align.*start/.test(css))
    pass('Tab button scroll-snap-align: start present');
else
    fail('Tab button scroll-snap-align missing');

// ─────────────────────────────────────────────────────────────────────────────
section('4. Touch target CSS (min-height >= 40px)');
if (/--ui-touch\s*:\s*44px/.test(css))
    pass('--ui-touch: 44px defined');
else
    fail('--ui-touch: 44px not found in CSS');

if (/min-height\s*:\s*var\(--ui-touch\)/.test(css))
    pass('min-height: var(--ui-touch) applied for touch targets');
else
    fail('min-height: var(--ui-touch) not applied anywhere');

// ─────────────────────────────────────────────────────────────────────────────
section('5. prefers-reduced-motion');
if (/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(css))
    pass('prefers-reduced-motion: reduce media query present');
else
    fail('prefers-reduced-motion missing — users with vestibular issues affected');

if (/animation-duration\s*:\s*0\.001ms/.test(css))
    pass('Animations disabled to 0.001ms under prefers-reduced-motion');
else
    fail('Animations not suppressed under prefers-reduced-motion');

// ─────────────────────────────────────────────────────────────────────────────
section('6. Empty state and skeleton classes');
if (/\.ui-empty-state/.test(css))
    pass('.ui-empty-state class defined');
else
    fail('.ui-empty-state class missing');

if (/\.ui-skeleton/.test(css))
    pass('.ui-skeleton class defined');
else
    fail('.ui-skeleton class missing');

if (/uiSkeleton|@keyframes.*[Ss]keleton/.test(css))
    pass('Skeleton shimmer keyframes defined');
else
    fail('Skeleton keyframes missing');

// ─────────────────────────────────────────────────────────────────────────────
section('7. Critical IDs not changed in HTML');
// Note: .app-container is a CSS class, not an HTML id — excluded from this list
const criticalIds = [
    'loginOverlay', 'att_date', 'att_shift', 'att_branch',
    'tbl_att_monthly', 'attendanceGrid',
    'tbl_tx', 'tbl_debt', 'tbl_active', 'tbl_quit',
    'addModal', 'mobileMenuSheet'
];
const missingIds = criticalIds.filter(id => !html.includes(`id="${id}"`));
if (missingIds.length === 0)
    pass('All critical IDs present in index.html');
else
    fail('Missing critical IDs: ' + missingIds.join(', '));

// ─────────────────────────────────────────────────────────────────────────────
section('8. No .tab-content.active incorrectly hidden');
// Should NOT have .tab-content.active { display: none }
if (/tab-content\.active\s*\{[^}]*display\s*:\s*none/.test(css))
    fail('.tab-content.active has display:none — active tab will be invisible!');
else
    pass('.tab-content.active does not have display:none — correct');

// ─────────────────────────────────────────────────────────────────────────────
section('9. No global overflow-x: scroll on body');
if (/body\s*\{[^}]*overflow-x\s*:\s*scroll/.test(css))
    fail('body has overflow-x: scroll — will cause full-page horizontal scroll');
else
    pass('No overflow-x: scroll on body');

// ─────────────────────────────────────────────────────────────────────────────
section('10. No 100vw on modal-content');
// width: 100vw inside .modal-content is safe (we actually use 100% not 100vw)
if (/modal-content\s*\{[^}]*width\s*:\s*100vw/.test(css))
    warn('.modal-content uses 100vw — may cause horizontal overflow on iOS');
else
    pass('.modal-content does not use 100vw — uses 100% safely');

// ─────────────────────────────────────────────────────────────────────────────
section('11. No new heavy framework libraries added to index.html');
const heavyLibs = ['react.js', 'vue.js', 'angular.js', 'bootstrap.min.js',
                   'tailwind.min.js', 'material-ui', 'ant-design'];
const foundHeavy = heavyLibs.filter(lib => html.toLowerCase().includes(lib));
if (foundHeavy.length === 0)
    pass('No heavy UI framework libraries added to index.html');
else
    fail('Heavy libraries found in HTML: ' + foundHeavy.join(', '));

// ─────────────────────────────────────────────────────────────────────────────
section('12. loading-soft utility class present');
if (/\.loading-soft/.test(css))
    pass('.loading-soft glass overlay utility present');
else
    fail('.loading-soft missing — loading overlay cannot use glass effect');

// ─────────────────────────────────────────────────────────────────────────────
section('13. Tab active animation uses CSS keyframes');
if (/@keyframes\s+(tabSlideIn|uiFadeIn)/.test(css))
    pass('Tab animation keyframes (tabSlideIn or uiFadeIn) present');
else
    fail('Tab animation keyframes missing');

// ─────────────────────────────────────────────────────────────────────────────
section('14. content-visibility: auto for performance');
if (/content-visibility\s*:\s*auto/.test(css))
    pass('content-visibility: auto applied for off-screen rendering performance');
else
    warn('content-visibility: auto not found — browser may render all content eagerly');

// ─────────────────────────────────────────────────────────────────────────────
section('15. uiFadeIn / uiSkeleton keyframes named properly');
if (/@keyframes\s+uiFadeIn/.test(css))
    pass('@keyframes uiFadeIn present');
else
    warn('@keyframes uiFadeIn not found (may have been named differently)');

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${TAG} Checked: ${passes + fails + warns} items`);
if (fails > 0) {
    console.error(`${TAG} ❌ FAILED — ${fails} failure(s), ${warns} warning(s), ${passes} passed.`);
    process.exit(1);
} else {
    console.log(`${TAG} ✅ OK — All UI modernization checks passed (${warns} warning(s)).`);
}

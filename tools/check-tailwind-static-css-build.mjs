#!/usr/bin/env node
import fs from 'node:fs';

const fail = [];
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const has = (p) => fs.existsSync(p);
const index = read('index.html');
const css = read('css/tailwind-static.css');
const main = read('js/main.js');
const health = read('js/core/staticCssBuildHealth.js');
const app = read('app.js');
const pkg = JSON.parse(read('package.json'));
function assert(cond, msg) { if (!cond) fail.push(msg); }

assert(has('css/tailwind-static.css'), 'Missing css/tailwind-static.css');
assert(has('js/core/staticCssBuildHealth.js'), 'Missing js/core/staticCssBuildHealth.js');
assert(!/cdn\.tailwindcss\.com/.test(index), 'index.html still loads Tailwind CDN');
assert(!/tailwind\.config\s*=/.test(index), 'index.html still contains Tailwind runtime config block');
assert(/tailwind-static\.css\?v=tailwind-static-build-20260608/.test(index), 'index.html must load local tailwind-static.css with 4K-6P cache bust');
assert(/main\.js\?v=tailwind-static-build-20260608/.test(index), 'index.html main.js cache bust must be 4K-6P');
assert(/APP_BUILD_VERSION\s*=\s*'4K-6P-tailwind-static-css-build-20260608'/.test(main), 'main.js APP_BUILD_VERSION must be 4K-6P');
assert(/initStaticCssBuildHealth/.test(main), 'main.js must init static CSS build health module');
assert(/debugRuntimeSmokeTest[\s\S]*debugStaticCssBuild/.test(main), 'debugRuntimeSmokeTest must include debugStaticCssBuild');
assert(/debugRuntimeSmokeTest[\s\S]*debugTailwindCdnRemoval/.test(main), 'debugRuntimeSmokeTest must include debugTailwindCdnRemoval');
assert(/debugStaticCssBuild/.test(health), 'staticCssBuildHealth must expose debugStaticCssBuild');
assert(/debugTailwindCdnRemoval/.test(health), 'staticCssBuildHealth must expose debugTailwindCdnRemoval');
assert(/Phase 4K-6P/.test(css), 'tailwind-static.css must include Phase 4K-6P marker');
assert(/\.bg-primary\{background-color:#0033A0/.test(css), 'tailwind-static.css missing bg-primary utility');
assert(/\.text-primary\{color:#0033A0/.test(css), 'tailwind-static.css missing text-primary utility');
assert(/\.md\\\\:hidden\{display:none/.test(css) || /\.md\\:hidden\{display:none/.test(css), 'tailwind-static.css missing md:hidden utility');
assert(/\.hover\\\\:bg-blue-600:hover/.test(css) || /\.hover\\:bg-blue-600:hover/.test(css), 'tailwind-static.css missing hover:bg-blue-600 utility');
assert(css.length < 90000, 'tailwind-static.css should remain a small static subset, not a full generated megabyte build');
assert(/function\s+processMultiItem|processMultiItem\s*=\s*async|window\.processMultiItem/.test(app), 'app.js processMultiItem missing unexpectedly');
assert(/function\s+quickPay|window\.quickPay/.test(app), 'app.js quickPay missing unexpectedly');
assert(/function\s+deleteTx|window\.deleteTx/.test(app), 'app.js deleteTx missing unexpectedly');
assert(pkg.scripts['check:tailwind-static-css-build'], 'package.json missing check:tailwind-static-css-build');
assert(/check:tailwind-static-css-build/.test(pkg.scripts.check || ''), 'npm run check must include tailwind static CSS check');
assert(/check:tailwind-static-css-build/.test(pkg.scripts['check:all'] || ''), 'npm run check:all must include tailwind static CSS check');
assert(/check:tailwind-static-css-build/.test(pkg.scripts['check:all:critical'] || ''), 'npm run check:all:critical must include tailwind static CSS check');

if (fail.length) {
  console.error('❌ check-tailwind-static-css-build failed:');
  fail.forEach((f, i) => console.error(`${i + 1}. ${f}`));
  process.exit(1);
}
console.log('✅ check-tailwind-static-css-build passed');

#!/usr/bin/env node
import fs from 'node:fs';

const fail = [];
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const has = (p) => fs.existsSync(p);
const index = read('index.html');
const main = read('js/main.js');
const bootstrap = read('js/core/lazyAssetsBootstrap.js');
const perf = read('js/core/mobileStartupPerformance.js');

function assert(cond, msg) { if (!cond) fail.push(msg); }

assert(has('js/core/lazyAssetsBootstrap.js'), 'Missing js/core/lazyAssetsBootstrap.js');
assert(has('js/core/mobileStartupPerformance.js'), 'Missing js/core/mobileStartupPerformance.js');
assert(/lazyAssetsBootstrap\.js\?v=(?:mobile-startup-lazy-assets|tailwind-static-build)-20260608/.test(index), 'index.html must load lazyAssetsBootstrap before app.js');
assert(!/<script\s+src=["'][^"']*xlsx\.bundle\.js/i.test(index), 'index.html still eagerly loads xlsx.bundle.js');
assert(!/<script\s+src=["'][^"']*chart\.js/i.test(index), 'index.html still eagerly loads chart.js');
assert(/window\.ensureXlsxReady/.test(bootstrap), 'lazyAssetsBootstrap must expose window.ensureXlsxReady');
assert(/window\.ensureChartJsReady/.test(bootstrap), 'lazyAssetsBootstrap must expose window.ensureChartJsReady');
assert(/window\.markMobileStartup/.test(bootstrap), 'lazyAssetsBootstrap must expose markMobileStartup');
assert(/debugMobileStartupPerformance/.test(bootstrap) || /debugMobileStartupPerformance/.test(perf), 'Missing debugMobileStartupPerformance');
assert(/debugStartupTimeline/.test(bootstrap) || /debugStartupTimeline/.test(perf), 'Missing debugStartupTimeline');
assert(/debugStartupBottlenecks/.test(bootstrap) || /debugStartupBottlenecks/.test(perf), 'Missing debugStartupBottlenecks');
assert(/initMobileStartupPerformance/.test(main), 'main.js must init mobile startup performance module');
assert(/APP_BUILD_VERSION\s*=\s*'4K-6P-tailwind-static-css-build-20260608'/.test(main), 'APP_BUILD_VERSION must be 4K-6P after Tailwind static CSS build');
assert(/debugRuntimeSmokeTest[\s\S]*debugMobileStartupPerformance/.test(main), 'debugRuntimeSmokeTest must include debugMobileStartupPerformance');
assert(/debugRuntimeSmokeTest[\s\S]*debugStartupBottlenecks/.test(main), 'debugRuntimeSmokeTest must include debugStartupBottlenecks');
assert(/main\.js\?v=tailwind-static-build-20260608/.test(index), 'index.html main.js cache bust must be 4K-6P');

if (fail.length) {
  console.error('❌ check-mobile-startup-performance failed:');
  fail.forEach((f, i) => console.error(`${i + 1}. ${f}`));
  process.exit(1);
}
console.log('✅ check-mobile-startup-performance passed');

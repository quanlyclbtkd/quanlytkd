import fs from 'fs';
const app = fs.readFileSync('app.js','utf8');
const main = fs.readFileSync('js/main.js','utf8');
const html = fs.readFileSync('index.html','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
let fails=[];
function has(s, pat, label){ if(!s.includes(pat)) fails.push(label); }
has(app, 'buildMultiItemTuitionPackageMonths', 'missing buildMultiItemTuitionPackageMonths');
has(app, 'bindMultiItemTuitionPackageGuard', 'missing capture guard binding');
has(app, "data-manual-package", 'missing manual package marker');
has(app, 'debugMultiItemTuitionPackageCoverage', 'missing debugMultiItemTuitionPackageCoverage');
has(app, 'expectedExample_3_from_2026_06', 'missing example coverage debug');
has(app, "window.__miManualTuitionPackage", 'missing manual package state');
has(app, 'select-change-capture', 'missing capture-phase manual package mark');
has(app, "_coverage = typeof window.buildMultiItemTuitionPackageMonths", 'processMultiItem does not use coverage helper');
has(app, "paidMonths: arrayUnion(...packageMonths)", 'paidMonths arrayUnion packageMonths missing');
has(app, "paidUntil: lastMonth", 'paidUntil lastMonth missing');
has(app, "packageMonths: packageMonths", 'bundle packageMonths missing');
has(app, "window.resetMultiItemTuitionPackageManualState && window.resetMultiItemTuitionPackageManualState('open-modal')", 'modal reset missing');
if(app.includes("const rawMonths = pkgSelect ? pkgSelect.getAttribute('data-months') : '';\n        chargeMonths")) fails.push('updateMultiItemAutoFee still reads data-months without debt-option guard');
if(app.includes("pkgSelect.value = '1';\n        }\n    } else {\n        paidUntilBadge.textContent") || app.includes("pkgSelect.value = '1';\n    }\n    // Phase 4K-5M")) fails.push('refresh badges may still reset package to 1 without manual guard');
has(main, "4K-6K-D-multiitem-tuition-package-fix-20260608", 'main version missing');
has(html, 'main.js?v=multiitem-tuition-package-fix-20260608', 'html cache bust missing');
if(!pkg.scripts['check:multiitem-tuition-package-fix']) fails.push('package script missing');
if(!pkg.scripts['check:all'].includes('check:multiitem-tuition-package-fix')) fails.push('check:all missing multiitem tuition package fix');
if(!pkg.scripts['check:all:critical'].includes('check:multiitem-tuition-package-fix')) fails.push('check:all:critical missing multiitem tuition package fix');
if(fails.length){ console.error('❌ check:multiitem-tuition-package-fix failed'); fails.forEach(f=>console.error(' - '+f)); process.exit(1); }
console.log('✅ check:multiitem-tuition-package-fix PASS');

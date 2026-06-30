#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const files = {
  index: read('index.html'),
  main: read('js/main.js'),
  app: read('app.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  renderInvalidation: read('js/ui/render/renderInvalidation.js'),
  rules: read('firestore.rules'),
  publicMain: fs.existsSync(path.join(root,'public/js/main.js')) ? read('public/js/main.js') : '',
  publicProfiles: fs.existsSync(path.join(root,'public/js/listeners/profiles.listeners.js')) ? read('public/js/listeners/profiles.listeners.js') : '',
  publicRenderInvalidation: fs.existsSync(path.join(root,'public/js/ui/render/renderInvalidation.js')) ? read('public/js/ui/render/renderInvalidation.js') : '',
};
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name); } }
console.log('\n=== Phase 4K-6V4D9 — Coach Warning Cleanup ===\n');
const build = 'attendance-excel-tx-delete-reconcile-20260630-v4d11';
check('Entrypoints and module cache bust use V4D9', files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`) && files.main.includes(build));
check('Finance lazy module variables use var to avoid TDZ before global ownership adoption', files.main.includes('var __financeModulePromise = null;') && files.main.includes('var __financeModule = null;'));
check('Finance bootstrap remains lazy and coach attendance-only skips finance', files.main.includes('ensureFinanceModuleLoaded') && files.main.includes('Skip finance module for Coach attendance-only session'));
check('Login history writes include uid for self-audit rules', files.app.includes('uid: user.uid ||') && files.rules.includes('request.resource.data.uid == request.auth.uid'));
check('Login history permission-denied no longer emits console.warn', files.app.includes("console.info('[login_history] Bỏ qua ghi lịch sử đăng nhập do quyền hiện tại:'") && files.app.includes('permission-denied|Missing or insufficient permissions'));
check('Rules contain scoped login_history create rule', files.rules.includes('match /login_history/{docId}') && files.rules.includes("'uid', 'email', 'clubId', 'role'"));
check('Coach live branch-field sweep is replaced by one-shot fallback', files.profiles.includes('coach-branch-legacy-one-shot-after-canonical') && !files.profiles.includes('activeCoachBranchAliasListener'));
check('Coach broad legacy recovery keeps all branch fields available for one-shot fallback', files.profiles.includes('COACH_PROFILE_BRANCH_FIELDS') && files.profiles.includes("'trainingBase'") && files.profiles.includes("'diaDiemTap'"));
check('Coach fallback permission-denied is debug-only instead of warning spam', files.profiles.includes('Optional coach branch-field denied') && files.profiles.includes("indexOf('permission-denied')"));
check('Coach invalidations are coalesced before attendance repaint', files.profiles.includes('coachInvalidateTimer') && files.profiles.includes('setTimeout(() => {') && files.profiles.includes('coachPendingInvalidateReason'));
check('Render storm guard warns once per one-second window', files.renderInvalidation.includes('warned: false') && files.renderInvalidation.includes('s.warned = true') && files.renderInvalidation.includes('&& !s.warned'));
check('Public mirror main/profiles/render invalidation are synced', files.publicMain.includes('var __financeModulePromise = null;') && files.publicProfiles.includes('coach-branch-legacy-one-shot-after-canonical') && files.publicRenderInvalidation.includes('s.warned = true'));
console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D9 coach warning cleanup checks passed.\n');

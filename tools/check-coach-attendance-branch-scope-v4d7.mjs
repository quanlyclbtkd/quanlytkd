#!/usr/bin/env node
/** Phase 4K-6V4D7 — Coach Attendance Branch Scope Completeness */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const branchIdentity = read('js/core/branchIdentity.js');
const profiles = read('js/listeners/profiles.listeners.js');
const attendance = read('js/modules/attendance.js');
const app = read('app.js');
const main = read('js/main.js');
const rules = read('firestore.rules');
const index = read('index.html');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4D7 — Coach Attendance Branch Scope Completeness ===\n');

check('Runtime cache marker bumped to V4D7 across entrypoints',
  (index.match(/coach-attendance-branch-scope-20260630-v4d7/g) || []).length >= 5 &&
  main.includes('profiles.listeners.js?v=coach-attendance-branch-scope-20260630-v4d7'));
check('BranchIdentity supports dynamic configured branch names',
  branchIdentity.includes('_configuredBranchName') &&
  branchIdentity.includes('_configuredNameMatches') &&
  branchIdentity.includes("'Cơ sở ' + name"));
check('Coach listener uses branch, branchCode and coachBranch, not branch only',
  profiles.includes('const fields = options && options.includeMirrorFields') &&
  profiles.includes("? ['branch', 'branchCode', 'coachBranch']") &&
  profiles.includes('_coachProfileQuerySpecs(context, { includeMirrorFields: true })'));
check('Coach listener has a settings-ready reconciliation path',
  profiles.includes('export async function ensureCoachBranchProfilesHydrated') &&
  profiles.includes('profiles.coachBranchHydrationReconcile') &&
  main.includes('window.ensureCoachBranchProfilesHydrated = ensureCoachBranchProfilesHydrated') &&
  app.includes("ensureCoachBranchProfilesHydrated('settings-ready-branch-aliases')"));
check('Attendance client filter compares dynamic aliases/display names',
  attendance.includes('Phase 4K-6V4D7') &&
  attendance.includes('window.BranchIdentity?.aliases') &&
  attendance.includes('window.getBranchNameDisplay'));
check('Firestore Rules allow only assigned branch aliases and configured names',
  rules.includes('function isNumberedBranchAlias') &&
  rules.includes('function configuredBranchNameMatches') &&
  rules.includes('branchNameForCode') &&
  rules.includes('branchValue == code + \' - \' + name') &&
  rules.includes('resourceBranchMatchesCoach()'));
const coachFallbackBody = (profiles.match(/export async function loadCoachBranchProfilesFallback[\s\S]*?\n}\n\n\/\//) || [''])[0];
check('No full-club profiles read is introduced for Coach',
  profiles.includes("return loadCoachBranchProfilesFallback('redirected-from-full:") &&
  !coachFallbackBody.includes('fbGetDocs(ctx.profRef)') &&
  coachFallbackBody.includes("fbGetDocs(fbQuery(ctx.profRef, fbWhere(spec.field, '==', spec.value)))"));

// Dynamic BranchIdentity contract with settings-configured names.
{
  const context = { window: { __store: { clubConfig: { branchName2: 'Nguyễn Trãi' } } }, console, String, Object, Array, Set };
  vm.createContext(context);
  vm.runInContext(branchIdentity, context, { filename: 'branchIdentity.js' });
  const api = context.window.BranchIdentity;
  check('Dynamic: configured branch name maps back to assigned CS code',
    api.normalize('Nguyễn Trãi', { fallback: '' }) === 'CS2' &&
    api.normalize('Cơ sở Nguyễn Trãi', { fallback: '' }) === 'CS2' &&
    api.isSameBranch('CS2', 'Nguyễn Trãi') === true);
  const aliases = api.aliases('CS2');
  check('Dynamic: CS2 aliases include code, numeric, and configured display values',
    aliases.includes('CS2') && aliases.includes('CS02') && aliases.includes('Cơ sở 2') && aliases.includes('Nguyễn Trãi') && aliases.includes('Cơ sở Nguyễn Trãi'));
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D7 coach attendance branch scope checks passed.\n');

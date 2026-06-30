#!/usr/bin/env node
/** Phase 4K-6V4D9 — Coach Attendance Render Scope Completeness */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('app.js');
const main = read('js/main.js');
const profiles = read('js/listeners/profiles.listeners.js');
const attendance = read('js/modules/attendance.js');
const rules = read('firestore.rules');
const publicAttendance = read('public/js/modules/attendance.js');

let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4D9 — Coach Attendance Render Scope Completeness ===\n');

check('Runtime cache marker bumped to V4D9 on entrypoints',
  index.includes('coach-attendance-render-scope-20260630-v4d9') &&
  app.includes('Coach scoped probe skipped denied aliases') &&
  main.includes('coach-attendance-render-scope-20260630-v4d9'));

check('Attendance render checks all profile branch mirrors, not p.branch only',
  attendance.includes('function _profileBranchValues') &&
  attendance.includes('p.branch, p.branchCode, p.coachBranch') &&
  attendance.includes('function _profileMatchesBranch') &&
  attendance.includes('.filter(([, p]) => _profileMatchesBranch(p, selBranch))') &&
  !attendance.includes(".filter(([, p]) => selBranch === 'all' || _sameBranch(p.branch, selBranch))"));

check('Attendance save/display uses resolved profile branch mirror',
  attendance.includes('function _profileDisplayBranch') &&
  attendance.includes("branch: _profileDisplayBranch(p, '')") &&
  attendance.includes("const branch = _profileDisplayBranch(p, 'Chung')"));

check('Coach live listeners are canonical-only to avoid denied alias watch errors',
  profiles.includes("canonicalOnly") &&
  profiles.includes("_coachProfileQuerySpecs(context, { includeMirrorFields: true, canonicalOnly: true })"));

check('Coach fallback/hydration uses safe per-spec reads and cannot fail all on one denied alias',
  profiles.includes('async function _safeReadCoachProfileSpec') &&
  profiles.includes('specs.map(spec => _safeReadCoachProfileSpec(spec, ctx))') &&
  profiles.includes('_warnCoachSpecDenied') &&
  !profiles.includes("console.error('[ProfilesFallback] Coach branch load failed:"));

check('Coach resolveActiveDataSource does not convert denied alias probes into runtime permission-error',
  app.includes('Coach scoped probe skipped denied aliases') &&
  app.includes('const permDenied   = isCoachRuntime ? false') &&
  !app.includes("return 'permission-denied'; }\n            }\n            return false;\n        }\n        const isCoachRuntime"));

check('Firestore Rules keep Coach scoped but tolerate legacy branch names in user mirror',
  rules.includes('Phase 4K-6V4D9') &&
  rules.includes('&& myBranch() !=') &&
  rules.includes('resourceBranchMatchesCoach()') &&
  rules.includes('branchEquivalentInClub') &&
  !rules.includes('allow read, write: if true'));

check('Public build mirrors patched attendance module',
  publicAttendance.includes('function _profileBranchValues') &&
  publicAttendance.includes('_profileMatchesBranch(p, selBranch)'));

// Dynamic proof for the render-side bug: p.branch wrong/missing but branchCode or coachBranch matches.
{
  const snippet = attendance.match(/function _sameBranch[\s\S]*?\/\*\* @deprecated/)[0].replace('/** @deprecated', '');
  const context = {
    window: {
      userRole: 'coach', coachBranch: 'CS2',
      BranchIdentity: {
        isSameBranch(a,b){ return this.normalize(a,{fallback:''}) === this.normalize(b,{fallback:''}); },
        normalize(v,{fallback='' }={}){
          const s=String(v||'').trim().toLowerCase();
          if (!s) return fallback;
          if (['cs2','cs02','cs 2','cơ sở 2','co so 2','2','nguyễn trãi','co so nguyen trai','cơ sở nguyễn trãi'].includes(s)) return 'CS2';
          if (['cs1','mặc định'].includes(s)) return 'CS1';
          return fallback;
        },
        aliases(){ return ['CS2','CS02','Cơ sở 2','Nguyễn Trãi','Cơ sở Nguyễn Trãi']; }
      },
      getBranchNameDisplay(v){ return v; }
    }, console, String, Object, Array, Set
  };
  vm.createContext(context);
  vm.runInContext(snippet + '\nwindow._profileMatchesBranch = _profileMatchesBranch;', context);
  check('Dynamic: render keeps profile when branchCode matches assigned branch',
    context.window._profileMatchesBranch({ branch: '', branchCode: 'CS2' }, 'CS2') === true &&
    context.window._profileMatchesBranch({ branch: 'CS1', coachBranch: 'Nguyễn Trãi' }, 'CS2') === true &&
    context.window._profileMatchesBranch({ branch: 'CS1' }, 'CS2') === false);
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D9 coach attendance render-scope checks passed.\n');

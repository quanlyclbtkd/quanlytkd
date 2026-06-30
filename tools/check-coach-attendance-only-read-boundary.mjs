#!/usr/bin/env node
/** Phase 4K-6V4A — Coach Attendance-Only Read Boundary */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('app.js');
const main = read('js/main.js');
const boundary = read('js/core/roleReadBoundary.js');
const profiles = read('js/listeners/profiles.listeners.js');
const attendanceService = read('js/services/attendance.service.js');
const attendanceModule = read('js/modules/attendance.js');
const tabs = read('js/ui/tabs.js');
const txBoundary = read('js/core/transactionCanonicalBoundary.js');
const statsCache = read('js/core/clubStatsAutoCache.js');
const debtBoundary = read('js/core/debtProfileReadBoundary.js');
const studentModule = read('js/modules/students.js');
const financeModule = read('js/modules/finance.js');
const indexes = JSON.parse(read('firestore.indexes.json'));

let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — '+detail : '')); }
}
function hasIndex(group, fields) {
  return indexes.indexes.some(i => i.collectionGroup === group &&
    fields.every((field, idx) => i.fields[idx] && i.fields[idx].fieldPath === field));
}

console.log('\n=== Phase 4K-6V4A compatibility — Coach Attendance-Only Read Boundary ===\n');

const rolePos = index.lastIndexOf('./js/core/roleReadBoundary.js?v=');
const txPos = index.lastIndexOf('./js/core/transactionCanonicalBoundary.js?v=');
const appPos = index.lastIndexOf('app.js?v=');
check('Role read boundary loads before transaction boundary and app.js',
  rolePos >= 0 && txPos >= 0 && appPos >= 0 && rolePos < txPos && rolePos < appPos);
check('Coach UI exposes only Attendance and hides full Add Student controls',
  app.includes("(btn.id === 'btn_attendance')") &&
  app.includes("'btnAddStudent'") &&
  app.includes("_coachAddWrap.style.display = 'none'"));
check('Role/branch context is stored before app context-ready events',
  app.includes('window.__store.userRole') && app.includes('window.__store.coachBranch') &&
  app.indexOf('RoleReadBoundary.setContext') < app.indexOf("dispatchAppContextReady('initSaaSDatabase-store-synced')"));
check('Coach bootstrap blocks inventory stats, active debts and transactions',
  app.includes("canMount?.('inventory.stats'") &&
  app.includes("canMount?.('inventory.active-debts'") &&
  app.includes("canMount?.('transactions.month'") &&
  app.includes("blocked-coach-attendance-only"));
check('Admin financial/Kho listener implementations remain present',
  app.includes('onSnapshot(invStatsRef, _invStatsCb)') &&
  app.includes("query(invRef, where('unpaid', '==', true))") &&
  app.includes('startTransactionListenerAfterSettings(lMonth)'));
check('Settings callback does not start finance/inventory/debt consumers for Coach',
  app.includes('const _coachAttendanceOnly') &&
  app.includes('!_coachAttendanceOnly && typeof window.syncCanonicalTransactionReadModeFromConfig') &&
  app.includes('!_coachAttendanceOnly && window.RoleReadBoundary?.canMount?.(\'inventory.categories\'') &&
  app.includes("isCoachAttendanceOnly?.() !== true && typeof window.scheduleAutomaticDebtProfileCoverage"));
check('Direct listenToData calls are defensively blocked for Coach',
  app.includes("canMount?.('transactions.month', { month: monthStr, reason: 'listenToData' }) === false"));
check('Canonical transaction settings gate is defensively blocked for Coach',
  txBoundary.includes("canMount?.('transactions.month', { month, reason: 'settings-gate' })") &&
  txBoundary.includes("canMount?.('transactions.month', { reason: reason || 'settings-sync' })"));
check('Main bootstrap skips Coach pagination, exam setting and club stats cache',
  main.includes("canMount?.('students.pagination'") &&
  main.includes("canMount?.('transactions.pagination'") &&
  main.includes("canMount?.('exam.settings'") &&
  main.includes("canMount?.('club.stats-cache'"));
check('Pagination modules have internal Coach guards',
  studentModule.includes("canMount?.('students.pagination'") &&
  financeModule.includes("canMount?.('transactions.pagination'"));
check('Programmatic tab switching is forced back to Attendance in all controllers',
  app.includes('tabId = window.enforceRoleTab ? window.enforceRoleTab(tabId) : tabId') &&
  main.includes('tabId = window.enforceRoleTab ? window.enforceRoleTab(tabId) : tabId') &&
  tabs.includes('tabId = window.enforceRoleTab ? window.enforceRoleTab(tabId) : tabId'));
check('Coach profile listener key contains role and branch',
  profiles.includes("':coach:' + coachBranch") && profiles.includes("':admin'"));
check('Coach profile query is server-scoped by status + branch',
  profiles.includes("fbQuery(profRef, statusConstraint, fbWhere('branch', '==', coachBranch))"));
check('Coach zero probe and fallback are branch-scoped',
  profiles.includes("fbWhere('branch', '==', coachBranch), _pL4k(1)") &&
  profiles.includes("fbQuery(ctx.profRef, fbWhere('branch', '==', alias))") &&
  profiles.includes('_coachBranchAliases(ctx)'));
check('Coach never executes full-club profiles fallback, quit load or export load',
  profiles.includes("return loadCoachBranchProfilesFallback('redirected-from-full:'") &&
  profiles.includes("canMount?.('profiles.quit'") && profiles.includes("canMount?.('profiles.export-all'"));
check('Coach profile snapshot does not start debt coverage',
  profiles.includes("if (!isCoach && typeof window.scheduleAutomaticDebtProfileCoverage"));
check('Debt boundary refuses Coach coverage audit/full fallback',
  debtBoundary.includes("isCoachAttendanceOnly?.() === true") && debtBoundary.includes("source: 'coach-attendance-only'"));
check('Club stats cache sync has a runtime Coach guard',
  statsCache.includes("canMount?.('club.stats-cache'") && statsCache.includes("reason: 'coach-attendance-only'"));
check('Attendance daily query supports branch and fails closed when Coach branch is missing',
  attendanceService.includes('_branchConstraint(where, branch, isCoach)') &&
  attendanceService.includes("where('branch', 'in', aliases)") &&
  attendanceService.includes('attendance/coach-branch-required'));
check('Attendance monthly and member-history queries support branch scope',
  attendanceService.includes("canMount?.('attendance.monthly'") &&
  attendanceService.includes("canMount?.('attendance.member-history'") &&
  attendanceService.includes("constraints.push(where('branch', '==', alias))"));
check('Attendance UI passes selected/assigned branch into daily and monthly services',
  attendanceModule.includes('branch: _dailyBranch') &&
  attendanceModule.includes("branch: selBranch === 'all' ? '' : selBranch"));
check('Required Firestore indexes are declared',
  hasIndex('profiles',['status','branch']) &&
  hasIndex('attendance',['date','branch']) &&
  hasIndex('attendance',['date','branch','shiftId']) &&
  hasIndex('attendance',['month','branch']) &&
  hasIndex('attendance',['profileId','month','branch']) &&
  hasIndex('attendanceNotes',['date','branch']));

// Dynamic RoleReadBoundary contract.
{
  const logs=[];
  const context={
    window: {}, Date, String, Object, Array, Set,
    console: { info(...a){logs.push(a)}, log(){}, group(){}, groupEnd(){}, table(){} }
  };
  context.window.console=context.console;
  vm.createContext(context);
  vm.runInContext(boundary, context, {filename:'roleReadBoundary.js'});
  const api=context.window.RoleReadBoundary;
  api.setContext({role:'coach',coachBranch:'CS2',clubId:'club-a'});
  check('Dynamic: Coach may mount Attendance but not transactions/Kho',
    api.canMount('attendance.daily') === true &&
    api.canMount('transactions.month') === false &&
    api.canMount('inventory.active-debts') === false);
  check('Dynamic: Coach is redirected to Attendance tab', api.enforceTab('finance') === 'attendance' && api.enforceTab('attendance') === 'attendance');
  check('Dynamic: Coach profile listener requires an assigned branch',
    api.canMount('profiles.active') === true &&
    (api.setContext({coachBranch:''}), api.canMount('profiles.active') === false));
  api.setContext({role:'admin',coachBranch:'',clubId:'club-a'});
  check('Dynamic: Admin financial/Kho sources remain allowed',
    api.canMount('transactions.month') === true && api.canMount('inventory.active-debts') === true);
}

// Dynamic AttendanceService query contract.
{
  const calls=[];
  let snapshots=[];
  const fakeSnap = () => ({ size:0, empty:true, docs:[], forEach(){}, docChanges(){return[]} });
  const context={
    window: {
      userRole:'coach', coachBranch:'CS3',
      __store:{db:{},clubId:'club-a'}, __scaleConfig:{},
      RoleReadBoundary:{ isCoachAttendanceOnly(){return true}, canMount(){return true} },
      _fb_init:{
        collection(...parts){return {kind:'collection',parts}},
        where(field,op,value){return {kind:'where',field,op,value}},
        limit(value){return {kind:'limit',value}},
        startAfter(value){return {kind:'startAfter',value}},
        query(ref,...constraints){return {ref,constraints}},
        async getDocs(q){calls.push(q); return snapshots.shift() || fakeSnap()},
      }
    }, console, Date, String, Number, Object, Array, Math, Error, Promise
  };
  vm.createContext(context);
  vm.runInContext(attendanceService.replace('export const AttendanceService =','window.AttendanceService ='), context, {filename:'attendance.service.js'});
  await context.window.AttendanceService.loadByDate('2026-06-19',{shiftId:'shift-a'});
  const dailyWheres=calls[0].constraints.filter(x=>x.kind==='where');
  check('Dynamic: Coach daily Firestore query contains date + branch + shift',
    dailyWheres.some(x=>x.field==='date'&&x.value==='2026-06-19') &&
    dailyWheres.some(x=>x.field==='branch'&&x.value==='CS3') &&
    dailyWheres.some(x=>x.field==='shiftId'&&x.value==='shift-a'));
  calls.length=0;
  await context.window.AttendanceService.loadByMonth('2026-06',{pageSize:100,maxPages:1});
  const monthWheres=calls[0].constraints.filter(x=>x.kind==='where');
  check('Dynamic: Coach monthly Firestore query contains month + branch',
    monthWheres.some(x=>x.field==='month'&&x.value==='2026-06') && monthWheres.some(x=>x.field==='branch'&&x.value==='CS3'));
  calls.length=0;
  await context.window.AttendanceService.loadMemberHistory('Võ Sinh A',['2026-05','2026-06']);
  const historyWheres=calls[0].constraints.filter(x=>x.kind==='where');
  check('Dynamic: Coach member history contains profileId + month + branch',
    historyWheres.some(x=>x.field==='profileId'&&x.value==='Võ Sinh A') &&
    historyWheres.some(x=>x.field==='month'&&x.op==='in') &&
    historyWheres.some(x=>x.field==='branch'&&x.value==='CS3'));
  context.window.coachBranch='';
  let blocked=false;
  try { await context.window.AttendanceService.loadByDate('2026-06-19'); } catch(e) { blocked=e.code==='attendance/coach-branch-required'; }
  check('Dynamic: Missing Coach branch causes zero-query fail-closed behavior', blocked && calls.length===1);
}

console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4A compatibility checks passed.\n');

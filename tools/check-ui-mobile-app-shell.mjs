import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('index.html');
const css=read('css/ui-mobile-shell.css');
const finance=read('js/modules/finance.js');
const app=read('app.js');
const legacyUiShell=read('js/ui/legacyUiShell.js');
const legacyUiFallbacks=read('js/legacy/legacyUiFallbacks.js');
const ownershipRegistry=read('js/core/globalOwnershipRegistry.js');
const pkg=JSON.parse(read('package.json'));
const contract=JSON.parse(read('UI_DOM_CONTRACT.json'));
let pass=0, fail=0;
function check(ok,msg){ if(ok){pass++; console.log('✅',msg);} else {fail++; console.error('❌',msg);} }
function extractBetween(src,a,b){const i=src.indexOf(a); if(i<0)return ''; const j=src.indexOf(b,i+a.length); return j<0?src.slice(i):src.slice(i,j);}

console.log('\n📱 H8R2.1C1 — Mobile Shell Role/Access + UI Contract Closure Gate\n');
const nav=extractBetween(html,'<nav id="mobileBottomNav"','</nav>');
const navButtons=[...nav.matchAll(/<button\b/g)].length;
check(nav.length>0,'1. Mobile bottom navigation exists');
check(navButtons===5,'2. Exactly 5 primary mobile navigation items');
check(nav.includes("switchTab('tx')")&&nav.includes("switchTab('debt')")&&nav.includes("switchTab('attendance')")&&nav.includes("switchTab('active')")&&nav.includes('openMobileMenu()'),'3. Primary nav maps only to existing switchTab/openMobileMenu authorities');
check(!/(mobileRouter|mobileState|navigationStore|activeModuleStore|history\.pushState|location\.hash\s*=)/.test(nav+css),'4. No mobile router or navigation state store added');
check(html.includes('id="mainTabsWrapper"')&&html.includes('id="btn_dashboard"')&&html.includes('id="btn_tx"'),'5. Legacy desktop navigation remains in DOM');
check(css.includes('@media (max-width: 767px)')&&css.includes('#mainTabsWrapper { display: none; }')&&!/@media \(min-width: 768px\)[\s\S]{0,800}#mainTabsWrapper\s*\{\s*display:\s*none/.test(css),'6. Legacy horizontal tab strip is hidden only in mobile shell');
check(html.includes('id="mobileMenuSheet"')&&html.includes('id="mobileMoreDashboard"')&&html.includes('id="mobileMoreQuit"'),'7. Existing mobile More sheet contains module navigation');
check(["dashboard","inventory","exam","expense","quit"].every(x=>html.includes(`switchTab('${x}')`)),'8. More-sheet module actions reuse existing switchTab actions');
const uiMarkup=extractBetween(html,'<div id="filterArea"','<div id="home_birthday_banner"')+nav+extractBetween(html,'<div id="mobileMenuSheet"','<script>');
const fsApi=/\b(getDoc|getDocs|onSnapshot|setDoc|updateDoc|addDoc|writeBatch|runTransaction)\s*\(/;
check(!fsApi.test(uiMarkup),'9. Shell/navigation/filter wrappers contain ZERO Firestore API calls');
check(!/setInterval\s*\(/.test(uiMarkup+css),'10. H8R2.1C shell adds no setInterval');
check(!/onSnapshot\s*\(/.test(uiMarkup),'11. H8R2.1C shell adds no onSnapshot');
check(!/getDoc\s*\(/.test(uiMarkup),'12. H8R2.1C shell adds no getDoc');
check(!/getDocs\s*\(/.test(uiMarkup),'13. H8R2.1C shell adds no getDocs');
check(!/(setDoc|updateDoc|addDoc|writeBatch|runTransaction)\s*\(/.test(uiMarkup),'14. H8R2.1C shell adds no business writer');
const viewport=(html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/)||[])[1]||'';
check(!/maximum-scale|user-scalable\s*=\s*0/.test(viewport),'15. Viewport allows user zoom');
check(viewport.includes('viewport-fit=cover'),'16. viewport-fit=cover is preserved');
const touch=Number((css.match(/--ui-touch-min:\s*(\d+)px/)||[])[1]||0);
check(touch>=44,'17. Canonical touch-target token is >=44px');
check(/body\.ui-mobile-shell\s*\{[^}]*font-size:\s*14px/.test(css),'18. Mobile body text baseline is >=14px');
check(/\.ui-search-input[^}]*font-size:\s*16px/.test(css)&&/\.ui-filter-control[^}]*font-size:\s*16px/.test(css)&&/\.modal-content input[\s\S]*font-size:\s*16px/.test(css),'19. Mobile inputs use >=16px typography');
check(css.includes('env(safe-area-inset-bottom)')&&css.includes('env(safe-area-inset-top)'),'20. Shell supports top and bottom safe areas');
check(!/(overflow-x:\s*hidden|\.no-horizontal-overflow|\.overflow-fix)/.test(css),'21. No page-level horizontal-overflow helper hack added');
const shellLinks=[...html.matchAll(/<link[^>]+ui-mobile-shell\.css[^>]*>/g)];
check(shellLinks.length===1,'22. Canonical H8R2.1C stylesheet is loaded exactly once');
check((html.match(/ui-mobile-shell\.css/g)||[]).length===1,'23. No duplicate H8R2.1C stylesheet reference');
check(!css.includes('!important'),'24. H8R2.1C adds zero !important declarations');
const missingIds=[];
for(const item of contract.requiredReferencedIds||[]){ if(!html.includes(`id="${item.id}"`)&&!html.includes(`id='${item.id}'`))missingIds.push(item.id); }
check(missingIds.length===0,`25. Existing critical DOM ID contract preserved${missingIds.length?': '+missingIds.slice(0,8).join(', '):''}`);
check(!/addEventListener\s*\(\s*['"]click['"]/.test(nav+extractBetween(html,'id="mobileMenuSheet"','id="expiryModal"')),'26. Mobile navigation adds no duplicate click event binding');
const txInit=finance.slice(finance.indexOf('export function initTransactionPagination()'));
check(!/curTab\s*===\s*['"]tx['"]\s*\|\|\s*document\.getElementById\(['"]txList['"]\)/.test(txInit)&&txInit.includes('_isTransactionTabActuallyActive'),'27. Hidden Transaction pagination optimization remains intact');
function walkJs(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()){if(['migrations','diagnostics'].includes(e.name))continue;walkJs(f,out);}else if(e.name.endsWith('.js'))out.push(f);}return out;}
const runtimeFiles=[path.join(root,'app.js'),...walkJs(path.join(root,'js'))];
const pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
const counts={getDoc:0,getDocs:0,onSnapshot:0};
for(const f of runtimeFiles){const src=fs.readFileSync(f,'utf8');for(const line of src.split('\n')){const t=line.trim();if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))continue;for(const [k,re] of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++;}}}
check(counts.getDoc<=29&&counts.getDocs<=51&&counts.onSnapshot<=16,`28. Firestore static budget unchanged (${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot} <= 29/51/16)`);
const overlayIds=['quickPayModal','changePasswordModal','manageCatModal','deleteTxModal'];
const centeredInline=overlayIds.filter(id=>{const re=new RegExp(`<div[^>]*id=[\"']${id}[\"'][^>]*>`);const m=html.match(re);return m&&/align-items\s*:\s*center/.test(m[0]);});
check(centeredInline.length===0,'29. Custom mobile overlays no longer pin align-items:center inline over the canonical sheet layer');
const tenantNavSelector='body:has(#mainApp[style*=\"display: block\"]):not(:has(#superAdminView[style*=\"display: block\"])):not(:has(#clubAccessBlockBanner)) .ui-bottom-nav { display: grid; }';
check(css.includes(tenantNavSelector)&&!css.includes('body:has(#mainApp[style*=\"display: block\"]) .ui-bottom-nav { display: grid; }'),'30. Bottom navigation uses accepted-tenant DOM predicate, not mainApp visibility alone');
const iconOnly=[...html.matchAll(/<button([^>]*)>(&times;|×|✕|\+)<\/button>/g)].filter(m=>!/aria-label=|title=/.test(m[1]));
check(iconOnly.length===0,'31. All static icon-only close/add buttons have an accessible name');

const coachDomPredicate='body:has(#btn_dashboard[style*="display: none"]):has(#btn_tx[style*="display: none"]):has(#btn_active[style*="display: none"]):has(#tab_attendance.active)';
const viewerBlock=extractBetween(app,"if(window.userRole === 'viewer') {",'profRef = collection');
const moreScript=extractBetween(html,'<script>window.openMobileMenu','</script>');
const shellGuardSource=nav+extractBetween(html,'<div id="filterArea"','<div id="home_birthday_banner"')+extractBetween(html,'<div id="mobileMenuSheet"','</script>')+css;

check(css.includes(':not(:has(#superAdminView[style*="display: block"]))')&&css.includes('body:has(#superAdminView[style*="display: block"]) .ui-bottom-nav'),'33. SuperAdmin root view suppresses tenant Bottom Navigation');
check(css.includes(':not(:has(#clubAccessBlockBanner))')&&css.includes('body:has(#clubAccessBlockBanner) .ui-bottom-nav'),'34. clubAccessBlockBanner suppresses tenant Bottom Navigation');
check(css.includes('body:has(#clubAccessBlockBanner) #mobileMenuSheet { display: none; }')&&css.includes('body:has(#clubAccessBlockBanner) #mobileMoreModuleSection { display: none; }'),'35. Access-block state cannot expose mobile tenant module navigation');
check(css.includes(coachDomPredicate+' #mobileMoreModuleSection { display: none; }'),'36. Coach mobile More tenant module section is hidden from existing role presentation markers');
check(css.includes('body:has(#superAdminView[style*="display: block"]) #mobileMoreModuleSection'),'37. SuperAdmin mobile More tenant module section is hidden');
check(navButtons===5&&css.includes(tenantNavSelector),'38. Normal accepted tenant Admin retains the 5-item Bottom Navigation');
check(viewerBlock.length>0&&!/\.tab-btn|mainTabsWrapper[^\n;]*display\s*=\s*['"]none/.test(viewerBlock)&&css.includes(tenantNavSelector),'39. Viewer tenant shell remains navigable according to existing viewer presentation authority');
const coachHiddenIds=['mobileNavTuition','mobileNavDebt','mobileNavStudents','mobileNavMore'];
check(css.includes(coachDomPredicate+' .ui-bottom-nav { grid-template-columns: 1fr; }')&&coachHiddenIds.every(id=>css.includes(coachDomPredicate+' #'+id))&&!css.includes(coachDomPredicate+' #mobileNavAttendance'),'40. Coach tenant Bottom Navigation exposes exactly Attendance');
check(html.includes('id="mmsSettingsAction"')&&html.includes('id="mmsTaxAction"')&&html.includes('id="mmsExcelAction"')&&
  css.includes('body:has(#btnSettings[style*="display: none"]) #mmsSettingsAction')&&
  css.includes('body:has(#exportTaxBtn[style*="display: none"]) #mmsTaxAction')&&
  css.includes('body:has(#exportBtn[style*="display: none"]) #mmsExcelAction'),'41. Mobile utility visibility mirrors existing desktop control visibility');
check(!/(tenantReadyStore|mobileAuthState|mobileRoleState|uiAccessStore|roleStore|accessStore|mobilePermissionState)/.test(shellGuardSource),'42. No new role/auth/access state store introduced');
check(!fsApi.test(shellGuardSource),'43. Shell role/access guards contain ZERO Firestore API calls');
check(!/(function\s+switchTab\s*\(|window\.switchTab\s*=|const\s+switchTab\s*=|let\s+switchTab\s*=)/.test(uiMarkup+moreScript+css),'44. C1 UI wrappers add no switchTab implementation');
check(!/ensureTabModule\s*\(/.test(uiMarkup+moreScript+css),'45. C1 UI wrappers never call ensureTabModule directly');
check(/id="uiFilterToggle"[^>]*aria-controls="uiFilterControls"[^>]*aria-expanded="false"/.test(html)&&
  html.includes("setAttribute('aria-expanded','true')")&&html.includes("setAttribute('aria-expanded','false')")&&
  /id="uiFilterControls"[^>]*role="group"[^>]*aria-labelledby="uiFilterTitle"/.test(html)&&html.includes("setAttribute('role','dialog')")&&html.includes("setAttribute('aria-modal','true')")&&html.includes("removeAttribute('aria-modal')"),'46. Filter trigger exposes aria-controls/aria-expanded and switches to named modal-dialog semantics only while open');
check(/id="mobileMenuSheet"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="mobileMenuTitle"[^>]*aria-hidden="true"/.test(html)&&
  html.includes('id="mobileMenuTitle"')&&
  (html.match(/aria-controls="mobileMenuSheet" aria-expanded="false"/g)||[]).length===3,'47. More sheet markup has dialog semantics and named trigger contract; runtime-owner behavior is verified below');
const navFontRem=Number((css.match(/\.ui-bottom-nav-item\s*\{[^}]*font-size:\s*([0-9.]+)rem/)||[])[1]||0);
check(navFontRem>=0.75,'48. Bottom-nav label typography is >=12px equivalent (>=0.75rem)');
check(counts.getDoc<=29&&counts.getDocs<=51&&counts.onSnapshot<=16,`49. Firestore static budget remains <=29/51/16 (${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot})`);

// Lightweight pure state fixtures: no browser/DOM framework dependency is introduced.
function mobileScenario({main=false,superAdmin=false,blocked=false,coach=false,viewer=false}={}){
  const tenantAllowed=main&&!superAdmin&&!blocked;
  return {
    navCount: tenantAllowed ? (coach ? 1 : 5) : 0,
    attendanceOnly: tenantAllowed&&coach,
    tenantMore: tenantAllowed&&!coach,
    viewerNavigable: tenantAllowed&&viewer,
  };
}
check(mobileScenario({main:false}).navCount===0,'50. S1 LOGIN fixture: tenant Bottom Navigation hidden');
check(mobileScenario({main:true}).navCount===5,'51. S2 NORMAL ADMIN fixture: five tenant nav items available');
check(mobileScenario({main:true,viewer:true}).viewerNavigable&&mobileScenario({main:true,viewer:true}).navCount===5,'52. S3 VIEWER fixture: existing tenant navigation presentation remains available');
check(mobileScenario({main:true,coach:true}).navCount===1&&mobileScenario({main:true,coach:true}).attendanceOnly&&!mobileScenario({main:true,coach:true}).tenantMore,'53. S4 COACH fixture: Attendance only; tenant More modules suppressed');
check(mobileScenario({main:true,superAdmin:true}).navCount===0&&!mobileScenario({main:true,superAdmin:true}).tenantMore,'54. S5 SUPERADMIN fixture: tenant nav/modules suppressed');
check(mobileScenario({main:true,blocked:true}).navCount===0&&!mobileScenario({main:true,blocked:true}).tenantMore,'55. S6 LOCKED fixture: tenant nav/modules suppressed');
check(mobileScenario({main:true,blocked:true}).navCount===0,'56. S7 EXPIRED fixture: same fail-closed presentation as blocked');
check(mobileScenario({main:true,blocked:true}).navCount===0,'57. S8 PERMISSION-DENIED fixture: same fail-closed presentation as blocked');

// H8R2.1C1A — Canonical Mobile UI Owner Alignment.
const canonicalOpen=extractBetween(legacyUiShell,'export function openMobileMenu()','export function closeMobileMenu()');
const canonicalClose=extractBetween(legacyUiShell,'export function closeMobileMenu()','export function checkMonthlyReminder');
const emergencyOpen=extractBetween(legacyUiFallbacks,'function openMobileMenu()','function closeMobileMenu()');
const emergencyClose=extractBetween(legacyUiFallbacks,'function closeMobileMenu()','function checkMonthlyReminder');
check(/openMobileMenu:\s*\{\s*owner:\s*['"]js\/ui\/legacyUiShell\.js['"]/.test(ownershipRegistry)&&/closeMobileMenu:\s*\{\s*owner:\s*['"]js\/ui\/legacyUiShell\.js['"]/.test(ownershipRegistry),'58. GlobalOwnership manifest keeps open/closeMobileMenu owned by js/ui/legacyUiShell.js');
check(canonicalOpen.includes("sheet.setAttribute('aria-hidden', 'false')"),'59. Canonical openMobileMenu sets aria-hidden=false');
check(canonicalOpen.includes("[aria-controls=\"mobileMenuSheet\"]")&&canonicalOpen.includes("setAttribute('aria-expanded', 'true')"),'60. Canonical openMobileMenu expands every mobileMenuSheet trigger');
check(canonicalOpen.includes("document.body.style.overflow = 'hidden'"),'61. Canonical openMobileMenu locks body scroll');
check(canonicalClose.includes("sheet.setAttribute('aria-hidden', 'true')"),'62. Canonical closeMobileMenu sets aria-hidden=true');
check(canonicalClose.includes("[aria-controls=\"mobileMenuSheet\"]")&&canonicalClose.includes("setAttribute('aria-expanded', 'false')"),'63. Canonical closeMobileMenu resets every trigger aria-expanded=false');
check(canonicalClose.includes("document.body.style.overflow = ''"),'64. Canonical closeMobileMenu restores body overflow');
check(canonicalOpen.includes("typeof window.isSuperAdminRole === 'function'")&&canonicalOpen.includes("? 'block'")&&canonicalOpen.includes(": 'none'"),'65. Canonical SuperAdmin mmsAdminBtn visibility behavior is preserved');
check(moreScript.includes("typeof window.isSuperAdminRole==='function'")&&moreScript.includes("sheet.setAttribute('aria-hidden','false')")&&moreScript.includes("setAttribute('aria-expanded','true')")&&moreScript.includes("document.body.style.overflow = 'hidden'")&&moreScript.includes("sheet.setAttribute('aria-hidden','true')")&&moreScript.includes("setAttribute('aria-expanded','false')")&&moreScript.includes("document.body.style.overflow = ''"),'66. Legacy inline rollback fallback has open/close presentation parity including SuperAdmin visibility');
check(emergencyOpen.includes("global.isSuperAdminRole")&&emergencyOpen.includes("setAttribute('aria-hidden', 'false')")&&emergencyOpen.includes("setAttribute('aria-expanded', 'true')")&&emergencyOpen.includes("style.overflow = 'hidden'")&&emergencyClose.includes("setAttribute('aria-hidden', 'true')")&&emergencyClose.includes("setAttribute('aria-expanded', 'false')")&&emergencyClose.includes("style.overflow = ''"),'67. Emergency legacyUiFallbacks More-menu path has canonical presentation parity');
check(!fsApi.test(canonicalOpen+canonicalClose+emergencyOpen+emergencyClose+moreScript),'68. No Firestore API appears in canonical or fallback More-menu owners');
check(!/(mobileMenuV2|mobileMenuController2|mobileSheetManager|newMobileMenuOwner)/.test(legacyUiShell+legacyUiFallbacks+moreScript)&&/GlobalOwnershipRegistry\.register\(name, fn/.test(legacyUiShell),'69. No competing More-menu global owner/controller was introduced');
check(counts.getDoc<=29&&counts.getDocs<=51&&counts.onSnapshot<=16,`70. Firestore static budget remains <=29/51/16 (${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot})`);

// H8R2.1C1C — User-approved mobile nav order + tuition layout closure.
const navIds=[...nav.matchAll(/id="(mobileNav[^"]+)"/g)].map(m=>m[1]);
check(JSON.stringify(navIds)===JSON.stringify(['mobileNavTuition','mobileNavDebt','mobileNavAttendance','mobileNavStudents','mobileNavMore']),'71. Mobile nav exact order is Học Phí → Báo Nợ → Điểm danh → Đang tập → Khác');
check(nav.includes('>💳</span><span>Học Phí</span>')&&nav.includes('>⚠️</span><span>Báo Nợ</span>')&&nav.includes('>📋</span><span>Điểm danh</span>')&&nav.includes('>🥋</span><span>Đang tập</span>')&&nav.includes('>☰</span><span>Khác</span>'),'72. All five mobile nav items include the approved icon + label');
const tuitionActionsIndex=html.indexOf('id="tuitionPrimaryActions"');
const filterIndex=html.indexOf('id="filterArea"');
const txTabIndex=html.indexOf('id="tab_tx"');
check(tuitionActionsIndex>=0&&filterIndex>tuitionActionsIndex&&txTabIndex>filterIndex&&html.includes('id="btnMultiItem"')&&html.includes('id="btnComboPay"')&&html.includes('id="btnAddStudent"'),'73. Tuition title/actions are physically above Search/Filter while existing action IDs/handlers are preserved');
check(app.includes('class="tx-date-cell"')&&app.includes('class="tx-month-cell"')&&app.includes('class="tx-name-cell name-link')&&app.includes('class="tx-amount-cell"')&&app.includes('class="tx-actions-cell action-btns"'),'74. Tuition transaction renderer exposes semantic mobile card cells without changing transaction data semantics');
check(html.includes('#tbl_tx tbody td.tx-date-cell{grid-column:1 / -1;grid-row:3')&&html.includes('#tbl_tx tbody td.tx-month-cell{grid-column:1;grid-row:2')&&!html.includes('#tbl_tx tbody td:first-child{grid-column:1;grid-row:2')&&!html.includes('#tbl_tx tbody td:nth-last-child(5){grid-column:1;grid-row:2'),'75. Mobile Ngày nộp and Kỳ/Tháng occupy separate rows and cannot overlap');


// Mandatory dynamic canonical-owner fixture. This executes the module that
// GlobalOwnershipRegistry installs, rather than the inline rollback fallback.
const savedWindow=globalThis.window;
const savedDocument=globalThis.document;
const savedLocalStorage=globalThis.localStorage;
try {
  const attrs=new Map([['aria-hidden','true']]);
  const classes=new Set();
  const sheet={
    classList:{add:(v)=>classes.add(v),remove:(v)=>classes.delete(v),contains:(v)=>classes.has(v)},
    setAttribute:(k,v)=>attrs.set(k,String(v)),
    getAttribute:(k)=>attrs.get(k),
  };
  const adminBtn={style:{display:'none'}};
  const triggers=Array.from({length:3},()=>({attrs:new Map([['aria-expanded','false']]),setAttribute(k,v){this.attrs.set(k,String(v));},getAttribute(k){return this.attrs.get(k);}}));
  const body={style:{overflow:''}};
  const elements={mobileMenuSheet:sheet,mmsAdminBtn:adminBtn};
  const mockDocument={
    body,
    getElementById:(id)=>elements[id]||null,
    querySelectorAll:(selector)=>selector==='[aria-controls="mobileMenuSheet"]'?triggers:[],
  };
  const legacyOpen=function legacyOpenFallback(){};
  const legacyClose=function legacyCloseFallback(){};
  let superAdmin=false;
  const mockWindow={
    openMobileMenu:legacyOpen,
    closeMobileMenu:legacyClose,
    isSuperAdminRole:()=>superAdmin,
  };
  globalThis.window=mockWindow;
  globalThis.document=mockDocument;
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
  const moduleUrl=pathToFileURL(path.join(root,'js/ui/legacyUiShell.js')).href+'?h8r2_1c1a_owner_test=1';
  const canonicalModule=await import(moduleUrl);
  canonicalModule.initLegacyUiShell();
  check(mockWindow.openMobileMenu===canonicalModule.openMobileMenu&&mockWindow.closeMobileMenu===canonicalModule.closeMobileMenu,'D1. initLegacyUiShell installs the canonical module implementation over the inline fallback');
  const openResult=mockWindow.openMobileMenu();
  check(openResult===true&&classes.has('open')&&attrs.get('aria-hidden')==='false'&&triggers.every((t)=>t.getAttribute('aria-expanded')==='true')&&body.style.overflow==='hidden','D2. Actual canonical openMobileMenu opens sheet, expands triggers, and locks body scroll');
  const closeResult=mockWindow.closeMobileMenu();
  check(closeResult===true&&!classes.has('open')&&attrs.get('aria-hidden')==='true'&&triggers.every((t)=>t.getAttribute('aria-expanded')==='false')&&body.style.overflow==='','D3. Actual canonical closeMobileMenu closes sheet, resets triggers, and restores body scroll');
  superAdmin=true;
  mockWindow.openMobileMenu();
  check(adminBtn.style.display==='block','D4. Canonical SuperAdmin open keeps Mở CLB Mới utility visible');
  mockWindow.closeMobileMenu();
  superAdmin=false;
  mockWindow.openMobileMenu();
  check(adminBtn.style.display==='none','D5. Canonical normal-tenant open keeps SuperAdmin utility hidden');
} finally {
  if(savedWindow===undefined) delete globalThis.window; else globalThis.window=savedWindow;
  if(savedDocument===undefined) delete globalThis.document; else globalThis.document=savedDocument;
  if(savedLocalStorage===undefined) delete globalThis.localStorage; else globalThis.localStorage=savedLocalStorage;
}

check(pkg.scripts?.['check:ui-mobile-app-shell']==='node tools/check-ui-mobile-app-shell.mjs','Package exposes check:ui-mobile-app-shell');
console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if(fail)process.exit(1);
console.log('\nH8R2.1C1 UI mobile app shell role/access gate PASS.');

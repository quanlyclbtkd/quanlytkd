// Existing Playwright dependency only. Local, isolated menu fixture; no SPA
// bootstrap, Firebase initialization, real student data or external network.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {browserFixture} from './harness.mjs';
const [rootArg='.',outputArg='evidence/EXAM_SEARCH_MOBILE_FOCUS_R1/browser-rerun.json',moduleArg='',executableArg='']=process.argv.slice(2);
const root=path.resolve(rootArg),output=path.resolve(outputArg),require=createRequire(import.meta.url);
const result={phase:'A9R18-EXAM-SEARCH-MOBILE-FOCUS-R1',scope:'REAL_CHROMIUM_LOCAL_ACTUAL_SOURCE_MENU_FIXTURE; navigation adapter only; no full SPA/Firebase',status:'BROWSER_FOCUS_PROOF_ENV_BLOCKED',browserVersion:null,libraryVersion:null,rows:[],networkAttempts:[],warningAbsent:null,error:null};
let browser;
try{
 const library=moduleArg?require(path.resolve(moduleArg)):require('playwright');
 const pkg=moduleArg?require(path.join(path.resolve(moduleArg),'package.json')):require('playwright/package.json');
 const expected=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).devDependencies.playwright;
 if(pkg.version!==expected)throw Error('PLAYWRIGHT_VERSION_MISMATCH');result.libraryVersion=pkg.version;
 browser=await library.chromium.launch({headless:true,...(executableArg?{executablePath:path.resolve(executableArg)}:{})});result.browserVersion=browser.version();
 for(const width of [320,390,430])for(const mode of ['canonical','fallback','inline'])for(const action of ['exam','close-X','escape','backdrop']){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),warnings=[];
  await page.route('**/*',route=>{result.networkAttempts.push({url:new URL(route.request().url()).origin,action:'ABORTED'});return route.abort();});
  page.on('console',m=>{if(/Blocked aria-hidden|descendant retained focus/i.test(m.text()))warnings.push(m.text());});
  await page.setContent(browserFixture(root,mode),{waitUntil:'domcontentloaded'});
  const initial=await page.locator('#mobileMenuSheet').evaluate(el=>({ariaHidden:el.getAttribute('aria-hidden'),inert:el.inert===true}));
  await page.locator('#openerB').click();
  const opened=await page.locator('#mobileMenuSheet').evaluate(el=>({ariaHidden:el.getAttribute('aria-hidden'),inert:el.inert===true}));
  if(action==='exam')await page.locator('#mobileMoreExam').click();
  else if(action==='close-X')await page.locator('[aria-label="Đóng menu khác"]').click();
  else if(action==='escape'){await page.locator('#mobileMoreExam').focus();await page.keyboard.press('Escape');}
  else {await page.locator('#mobileMoreExam').focus();await page.locator('#mobileMenuSheet').click({position:{x:2,y:2}});}
  const end=await page.evaluate(()=>{const el=document.getElementById('mobileMenuSheet');return {ariaHidden:el.getAttribute('aria-hidden'),inert:el.inert===true,focusInside:el.contains(document.activeElement),activeElementId:document.activeElement?.id||null,allExpandedFalse:[...document.querySelectorAll('[aria-controls="mobileMenuSheet"]')].every(t=>t.getAttribute('aria-expanded')==='false'),bodyOverflow:document.body.style.overflow,focusOrderViolations:window.__focusTransitions.filter(t=>t.focusInside).length,examActive:document.getElementById('tab_exam').classList.contains('active')};});
  const passed=initial.ariaHidden==='true'&&initial.inert&&opened.ariaHidden==='false'&&!opened.inert&&end.ariaHidden==='true'&&end.inert&&!end.focusInside&&end.allExpandedFalse&&end.bodyOverflow===''&&end.focusOrderViolations===0&&warnings.length===0&&(action!=='exam'||end.examActive);
  result.rows.push({width,height:900,mode,action,initial,opened,end,matchingWarnings:warnings,status:passed?'PASS':'RED'});await context.close();
 }
 result.warningAbsent=result.rows.every(r=>r.matchingWarnings.length===0);
 result.status=result.rows.every(r=>r.status==='PASS')&&result.networkAttempts.length===0?'PASS_REAL_CHROMIUM_FOCUS_FIXTURE':'RED_REAL_CHROMIUM_FOCUS_FIXTURE';
}catch(error){result.error=String(error.message||error);result.status='BROWSER_FOCUS_PROOF_ENV_BLOCKED';}
finally{await browser?.close();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({status:result.status,rows:result.rows.length,browserVersion:result.browserVersion}));if(result.status!=='PASS_REAL_CHROMIUM_FOCUS_FIXTURE')process.exitCode=2;

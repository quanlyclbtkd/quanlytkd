import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const output=path.resolve(process.argv[2]||'evidence/AUTH_STARTUP_R1A/browser-preflight.json');
let browser;
const result={appNavigationAttempted:false,productionFirebaseTraffic:0,realStartupTraces:0};
try {
  const require=createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd(),'playwright/package.json'));
  const {chromium}=require('playwright');
  browser=await chromium.launch({headless:true,executablePath:process.env.R1A_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();await page.setContent('<p>R1A offline preflight</p>');
  result.status='BROWSER_AVAILABLE';result.fixtureText=await page.textContent('p');
} catch(error) {
  const message=String(error);
  result.status='BROWSER_STARTUP_BLOCKED';
  result.reason=message.includes('Operation not permitted')?'SOCKET_OPERATION_NOT_PERMITTED':message.includes('MODULE_NOT_FOUND')?'PLAYWRIGHT_NOT_INSTALLED':'BROWSER_LAUNCH_FAILED';
  result.diagnosticLines=message.split('\n').filter(l=>/socket\(|Operation not permitted|FATAL|permission denied|MODULE_NOT_FOUND/.test(l)).map(l=>l.replace(/pid=\d+/g,'pid=REDACTED'));
  if(!result.diagnosticLines.length)result.diagnosticLines=[message.split('\n')[0]];
} finally {if(browser)await browser.close();}
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));

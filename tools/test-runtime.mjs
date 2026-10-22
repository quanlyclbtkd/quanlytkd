// Test dependencies only. No network, install, application auth or runtime mutation.
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
export function loadPlaywright() {
 const attempts=[createRequire(import.meta.url)];
 if(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)attempts.push(createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'__test_entry.cjs')));
 for(const require of attempts)try{return require('playwright')}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error}
 throw Object.assign(Error('TEST_DEPENDENCY_MISSING: install the declared Playwright dev dependency and its Chromium browser, or set a valid test dependency path.'),{code:'TEST_DEPENDENCY_MISSING'});
}
export function browserExecutable(pw=loadPlaywright()) {
 const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||pw.chromium.executablePath();
 if(!fs.existsSync(executable))throw Object.assign(Error('TEST_BROWSER_MISSING: install Chromium for Playwright or set PLAYWRIGHT_CHROMIUM_EXECUTABLE to an installed executable.'),{code:'TEST_BROWSER_MISSING'});
 return executable;
}

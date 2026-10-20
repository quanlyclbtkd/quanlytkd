// V11 contract migration: legacy V1/V2 source test is preserved in
// tools/v11/legacy-v10/. Unsafe raw deletion/blind replay is no longer expected.
import {casContract} from './v11/cas-contract.mjs';
import {spawnSync} from 'node:child_process';
const result=await casContract();
console.log('Versioned service/ACK/identity/context contracts PASS',result.results.length);
const browser=spawnSync(process.execPath,['tools/v11/journal-mutations.mjs'],{env:process.env,encoding:'utf8',timeout:45000});
process.stdout.write(browser.stdout||'');process.stderr.write(browser.stderr||'');
if(browser.status!==0)process.exit(browser.status||1);
console.log('Native journal migration contract PASS');

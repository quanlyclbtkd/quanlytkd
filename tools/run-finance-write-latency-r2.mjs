import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const flags=process.execArgv.includes('--experimental-vm-modules')?process.execArgv:[...process.execArgv,'--experimental-vm-modules'];
const result=spawnSync(process.execPath,[...flags,fileURLToPath(new URL('./check-finance-write-latency-r2.mjs',import.meta.url)),...process.argv.slice(2)],{cwd:root,env:process.env,stdio:'inherit'});
if(result.error){console.error(result.error.message);process.exitCode=1;}else process.exitCode=result.status??1;

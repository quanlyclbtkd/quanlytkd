// Read-only RED reproduction of the existing main.js lazy-load await contract.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
import {parse} from '../v11r2/vendor/acorn.mjs';
const root=path.resolve(process.env.A9R16_SOURCE_ROOT||process.cwd()),source=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),fn=ast.body.find(x=>x.type==='FunctionDeclaration'&&x.id.name==='lazyLoad'),state=ast.body.find(x=>x.type==='VariableDeclaration'&&x.declarations.some(d=>d.id.name==='_lazyLoaded'));
if(!fn||!state)throw Error('CANONICAL_LOADER_NOT_FOUND');
let release;const pending=new Promise(resolve=>release=resolve),metrics={imports:0,initializations:0,loadingCalls:0};
const context=vm.createContext({console,showLoading(){metrics.loadingCalls++},hideLoading(){}});
const flights=ast.body.find(x=>x.type==='VariableDeclaration'&&x.declarations.some(d=>d.id.name==='_lazyInFlight'));
vm.runInContext(source.slice(state.start,state.end)+'\n'+(flights?source.slice(flights.start,flights.end):'')+'\n'+source.slice(fn.start,fn.end)+'\nthis.load=lazyLoad;',context);
const importer=()=>{metrics.imports++;return pending};
const first=context.load('same-module',importer,'init');let secondSettled=false;
const second=context.load('same-module',importer,'init').then(()=>{secondSettled=true});
await Promise.resolve();await Promise.resolve();const settledBeforeImport=secondSettled;
release({init:async()=>{metrics.initializations++}});await Promise.all([first,second]);
const report={phase:'A9R16A',classification:settledBeforeImport?'FAIL_RUNTIME':'PASS',scope:'Existing loader await contract only; no application runtime mutation',
 mainSha256:crypto.createHash('sha256').update(source).digest('hex'),
 functionSha256:crypto.createHash('sha256').update(source.slice(fn.start,fn.end)).digest('hex'),
 expected:'Concurrent callers must both await import and explicit initialization; import/init execute once',
 actual:{secondCallerSettlesBeforeImport:settledBeforeImport,...metrics},
 diagnosis:'The current Set marks loaded before importer resolves; another caller returns undefined immediately. This is not Promise single-flight.',
 phaseBImplemented:false};
const out=path.resolve(process.env.A9R16_EVIDENCE_ROOT||'evidence/A9R16');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'A9R16A_EXISTING_LOADER_RED.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(report.classification!=='PASS')process.exitCode=1;

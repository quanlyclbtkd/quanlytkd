import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse} from '../v11r2/vendor/acorn.mjs';
const source=fs.readFileSync('js/main.js','utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const body=(name)=>{const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return source.slice(n.start,n.end);};
const state=['_lazyLoaded','_lazyInFlight'].map(name=>{const n=ast.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name===name));return n?source.slice(n.start,n.end):'';}).join('\n');
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
const rows=[];
function fixture(){
 const metrics={imports:0,init:0,show:0,hide:0,errors:0},registry={};
 const ctx=vm.createContext({console:{error(){metrics.errors++},warn(){}},showLoading(){metrics.show++},hideLoading(){metrics.hide++},_isDev:true,LAZY_TAB_MODULES:registry});
 vm.runInContext(state+'\n'+body('lazyLoad')+'\n'+body('ensureTabModule')+'\nthis.load=lazyLoad;this.ensure=ensureTabModule;',ctx);
 return {ctx,metrics,registry};
}
for(const count of [2,10]){
 const {ctx,metrics}=fixture(),imp=deferred(),init=deferred();
 const mod={async init(){metrics.init++;await init.promise;}};
 const importer=()=>{metrics.imports++;return imp.promise;};
 let settled=0;const calls=Array.from({length:count},()=>ctx.load('same',importer,'init').then(v=>{settled++;return v;}));
 await tick();assert.equal(settled,0);assert.equal(metrics.imports,1);
 imp.resolve(mod);await tick();assert.equal(settled,0);assert.equal(metrics.init,1);
 init.resolve();const values=await Promise.all(calls);assert(values.every(v=>v===mod));assert.equal(settled,count);
 assert.deepEqual(metrics,{imports:1,init:1,show:1,hide:1,errors:0});
 assert.equal(await ctx.load('same',importer,'init'),undefined,'already-loaded contract');
 assert.equal(metrics.imports,1);
 rows.push({case:count+' concurrent; slow import; async init; after-loaded',...metrics,status:'PASS'});
}
for(const phase of ['import','init']){
 const {ctx,metrics}=fixture(),gate=deferred(),failure=Error(phase+' rejected');
 const mod={async init(){metrics.init++;await gate.promise;}};
 const importer=()=>{metrics.imports++;return phase==='import'?gate.promise:Promise.resolve(mod);};
 const calls=Array.from({length:10},()=>ctx.load('retry',importer,'init'));
 const all=Promise.allSettled(calls);await tick();gate.reject(failure);
 const results=await all;assert(results.every(r=>r.status==='rejected'&&r.reason===failure));
 assert.equal(metrics.imports,1);assert.equal(metrics.init,phase==='import'?0:1);
 const good={init(){metrics.init++;}};
 assert.equal(await ctx.load('retry',async()=>{metrics.imports++;return good;},'init'),good);
 assert.equal(metrics.imports,2);assert.equal(metrics.init,phase==='import'?1:2);
 assert.equal(metrics.show,2);assert.equal(metrics.hide,2);
 rows.push({case:phase+' rejection to all; rejected flight cleared; retry',...metrics,status:'PASS'});
}
{
 const {ctx,metrics,registry}=fixture();
 registry.exam={key:'exam',import:async()=>{metrics.imports++;return{init:async()=>{metrics.init++;}};},init:'init'};
 await Promise.all(Array.from({length:10},()=>ctx.ensure('exam')));
 await ctx.ensure('exam');assert.equal(metrics.imports,1);assert.equal(metrics.init,1);
 assert.equal(await ctx.ensure('unknown'),undefined);
 registry.fail={key:'fail',import:async()=>{throw Error('expected');}};
 assert.equal(await ctx.ensure('fail'),undefined,'ensureTabModule keeps existing error contract');
 rows.push({case:'repeated tab open; unknown tab; existing swallowed tab error',...metrics,status:'PASS'});
}
{
 const {ctx,metrics}=fixture();let second;
 const mod={init(){metrics.init++;second=ctx.load('reentry',()=>{metrics.imports++;return mod;},'init');}};
 await ctx.load('reentry',()=>{metrics.imports++;return mod;},'init');await second;
 assert.equal(metrics.imports,1);assert.equal(metrics.init,1);
 rows.push({case:'reentrant caller during init shares existing operation',...metrics,status:'PASS'});
}
const result={status:'PASS',rows,roleSplit:false,loaderFirestoreCalls:0,loaderListeners:0};
if(process.env.A9R16_EVIDENCE_ROOT){fs.mkdirSync(process.env.A9R16_EVIDENCE_ROOT,{recursive:true});fs.writeFileSync(path.join(process.env.A9R16_EVIDENCE_ROOT,'SINGLE_FLIGHT_MATRIX.json'),JSON.stringify(result,null,2));}
console.log(JSON.stringify(result,null,2));

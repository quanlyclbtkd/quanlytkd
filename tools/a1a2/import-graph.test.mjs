import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {buildImportGraph,cacheToken} from '../v11r2/import-graph.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a12-imports-')),results=[];
const put=(f,text)=>{fs.mkdirSync(path.dirname(path.join(tmp,f)),{recursive:true});fs.writeFileSync(path.join(tmp,f),text)};
const test=(name,fn)=>{fn();results.push({name,status:'PASS'});console.log('PASS '+name)};
try {
 put('index.html',`<!-- <script src="missing-comment.js"></script> -->
 <script src="app.js?v=old"></script><script>const s=document.createElement('script');s.src='./js/main.js?v=old';</script>`);
 put('app.js','');put('js/dependency.js','export const x=1;');
 put('js/main.js',`// import './missing-comment.js';
 const prose="import('./missing-string.js')";
 import './dependency.js?mode=test&v=old#fragment';
 export {x} from './dependency.js?v=export';
 const dynamic=()=>import(\`./dependency.js?v=dynamic\`);
 const fallback=document.createElement('script');fallback.src='app.js';`);
 const graph=buildImportGraph(tmp);
 test('static, re-export and dynamic template imports are traversed',()=>{
  assert.equal(graph.edges.filter(e=>e.kind==='static').length,2);assert.equal(graph.edges.filter(e=>e.kind==='dynamic').length,1);
  assert(graph.files.includes('js/dependency.js'));
 });
 test('comments and string examples do not become graph edges',()=>assert(!graph.edges.some(e=>e.url.includes('missing'))));
 test('DOM script loader resolves relative to document, ESM to module',()=>{
  assert(graph.edges.some(e=>e.from==='js/main.js'&&e.kind==='script-loader'&&e.to==='app.js'));
  assert(!graph.files.includes('js/app.js'));
 });
 test('query parameters and fragment do not change resolved file identity',()=>{
  const edge=graph.edges.find(e=>e.url.includes('mode=test'));assert.equal(edge.to,'js/dependency.js');assert.equal(cacheToken(edge.url),'old');
 });
 test('nonliteral dynamic import fails closed',()=>{
  put('js/main.js','const name="./dependency.js"; import(name);');assert.throws(()=>buildImportGraph(tmp),e=>e.code==='NON_LITERAL_MODULE_IMPORT');
 });
 test('missing import target fails closed',()=>{
  put('js/main.js',"import './missing.js';");assert.throws(()=>buildImportGraph(tmp),e=>e.code==='IMPORT_TARGET_MISSING');
 });
} finally {
 fs.rmSync(tmp,{recursive:true,force:true});fs.mkdirSync('handoff/A1A2/evidence/green',{recursive:true});
 fs.writeFileSync('handoff/A1A2/evidence/green/import-parser.json',JSON.stringify({results},null,2));
}

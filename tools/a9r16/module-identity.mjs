import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildImportGraph,rewriteCacheGraph,buildTag} from '../v11r2/import-graph.mjs';
export const root=path.resolve(process.env.A9R16_SOURCE_ROOT||process.cwd());
export const tag='qr-v11r6-a9r16a-r2-sequential-closure-20261025';
export const canonicalJS=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'tools/v11r2/manifests/V11R6_A9R15_TRAINING_HISTORY.json'),'utf8')).canonicalRuntimeFiles).filter(f=>f.endsWith('.js'));
export function fullGraph(){return buildImportGraph(root,{},canonicalJS);}
export function inventory(graph=fullGraph()){
 const groups=new Map();
 for(const e of graph.edges.filter(e=>e.to)){
  const u=new URL(e.url,new URL(e.kind==='script-loader'?'index.html':e.from,'https://cutover.invalid/'));
  const effective=u.pathname+u.search+u.hash,urls=groups.get(e.to)||new Map();
  const refs=urls.get(effective)||[];refs.push({from:e.from,kind:e.kind});urls.set(effective,refs);groups.set(e.to,urls);
 }
 return [...groups].map(([physicalPath,urls])=>({physicalPath,identities:[...urls].map(([url,importers])=>({url,importers}))}));
}
if(process.argv[2]==='normalize'){
 const physical=process.argv[3],token=process.argv[4];assert(physical&&token);
 const graph=fullGraph(),overrides={};
 const importers=new Set(graph.edges.filter(e=>e.to===physical).map(e=>e.from));
 for(const from of importers){
  let text=fs.readFileSync(path.join(root,from),'utf8');
  const replacements=graph.edges.filter(e=>e.from===from&&e.to===physical).map(e=>{
   const u=new URL(e.url,'https://cutover.invalid/');u.searchParams.set('v',token);
   const value=e.url.split('?')[0].split('#')[0]+'?'+u.searchParams.toString()+u.hash;
   return{...e,value:e.quoted?JSON.stringify(value):value};
  });
  for(const e of replacements.sort((a,b)=>b.start-a.start))text=text.slice(0,e.start)+e.value+text.slice(e.end);
  if(text!==fs.readFileSync(path.join(root,from),'utf8'))overrides[from]=text;
 }
 const result=rewriteCacheGraph(root,overrides,tag);
 for(const [file,text] of Object.entries(result.overrides)){
  fs.writeFileSync(path.join(root,file),text);
  fs.writeFileSync(path.join(root,'public',file),text);
 }
 const group=inventory().find(x=>x.physicalPath===physical);assert.equal(group.identities.length,1);
 console.log(JSON.stringify({physicalPath:physical,canonicalURL:group.identities[0].url,changed:Object.keys(result.overrides)},null,2));
}else if(process.argv[2]==='assert'){
 const duplicates=inventory().filter(x=>x.identities.length>1);assert.deepEqual(duplicates,[]);
 assert.equal(buildTag(fs.readFileSync(path.join(root,'js/main.js'),'utf8')).tag,tag);
 console.log('PASS: every reachable physical module has one effective URL; canonical build tag matches.');
}

import fs from 'node:fs';
import path from 'node:path';
import {buildImportGraph,buildTag} from './v11r2/import-graph.mjs';
const token='a9r18-fin-write-r1-1-20261101';
const scope=new Set(['index.html','app.js','js/main.js','js/modules/students.js','js/modules/finance.js','js/core/tuitionCommandBoundary.js','js/services/finance.service.js']);
const g=buildImportGraph(process.cwd());
function withToken(url){const [base,frag]=url.split('#'),i=base.indexOf('?'),pn=i<0?base:base.slice(0,i),params=new URLSearchParams(i<0?'':base.slice(i+1));params.set('v',token);return pn+'?'+params.toString()+(frag===undefined?'':'#'+frag)}
const byFile=new Map();for(const e of g.edges){if(scope.has(e.from)&&e.to&&scope.has(e.to)){const arr=byFile.get(e.from)||[];arr.push(e);byFile.set(e.from,arr)}}
for(const file of scope){if(file==='app.js'||file==='js/services/finance.service.js')continue;let text=fs.readFileSync(file,'utf8'),repls=[];for(const e of byFile.get(file)||[])repls.push({start:e.start,end:e.end,value:e.quoted?JSON.stringify(withToken(e.url)):withToken(e.url)});if(file==='js/main.js'){const b=buildTag(text);repls.push({start:b.start,end:b.end,value:JSON.stringify(token)})}for(const r of repls.sort((a,b)=>b.start-a.start))text=text.slice(0,r.start)+r.value+text.slice(r.end);fs.writeFileSync(file,text)}
for(const file of scope){const pub=path.join('public',file);if(fs.existsSync(pub))fs.copyFileSync(file,pub)}
console.log(JSON.stringify({token,scope:[...scope]}));

import fs from 'node:fs';
import path from 'node:path';
import {parse} from '../v11r2/vendor/acorn.mjs';
const root=path.resolve(process.argv[2]||process.cwd());
const files=['js/modules/finance.js','js/core/tuitionCommandBoundary.js','js/services/finance.service.js','js/listeners/profiles.listeners.js','js/core/debtProfileReadBoundary.js','js/ui/render/listComputationRefresh.js','js/ui/render/computation/studentsRenderer.js','js/ui/render/renderStudents.js'];
const awaited=[],functions=[],counts=Object.fromEntries(['getDoc','getDocs','onSnapshot','runTransaction','writeBatch','commit','setDoc','updateDoc','addDoc','deleteDoc'].map(k=>[k,0]));
const short=n=>n?.type==='Identifier'?n.name:n?.type==='MemberExpression'?(short(n.object)+'.'+(n.property.name||n.property.value)):n?.name||n?.value||'';
function inspect(file,inventory=true){const source=fs.readFileSync(path.join(root,file),'utf8');const ast=parse(source,{ecmaVersion:'latest',sourceType:file==='app.js'?'script':'module',locations:true});
 function walk(n,parent,stack=[]){if(!n||typeof n!=='object')return;
  let name=n.id?.name;
  if(/Function|ArrowFunction/.test(n.type)){name=name||short(parent?.key)||short(parent?.left)||short(parent?.id)||'<callback>';stack=stack.concat(name);if(inventory)functions.push({file,function:stack.join(' → '),line:n.loc.start.line,endLine:n.loc.end.line});}
  if(n.type==='CallExpression'){const k=n.callee?.type==='Identifier'?n.callee.name:n.callee?.property?.name;if(Object.hasOwn(counts,k))counts[k]++;}
  if(inventory&&n.type==='AwaitExpression')awaited.push({file,line:n.loc.start.line,function:stack.join(' → '),target:source.slice(n.argument.start,n.argument.end).replace(/\s+/g,' ').slice(0,240)});
  for(const v of Object.values(n))if(Array.isArray(v))v.forEach(x=>walk(x,n,stack));else if(v&&typeof v==='object'&&v.type)walk(v,n,stack);
 }walk(ast);
}
for(const file of files)inspect(file);
// Separate scanner definition: all CallExpressions in canonical app.js + js/**.
for(const k of Object.keys(counts))counts[k]=0;
inspect('app.js',false);function walkDir(dir){for(const n of fs.readdirSync(path.join(root,dir))){const file=dir+'/'+n;if(fs.statSync(path.join(root,file)).isDirectory())walkDir(file);else if(file.endsWith('.js'))inspect(file,false);}}walkDir('js');
console.log(JSON.stringify({evidenceLevel:'STATIC',scannerDefinition:'AST CallExpressions in canonical app.js and js/**/*.js; not the official budget scanner',counts,awaited,functions},null,2));

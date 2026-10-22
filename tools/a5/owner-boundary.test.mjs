import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '../v11r2/vendor/acorn.mjs';
import {verifySourceIdentity,ACCEPTED_SOURCE} from '../v11r2/source-identity.mjs';
import {runtimeHash} from '../v11r2/cutover.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function protectedSyntax(text,name){
 const ast=parse(text,{ecmaVersion:'latest',sourceType:'module'});
 if(name){const node=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);assert(node,'Protected owner missing: '+name);return text.slice(node.start,node.end)}
 const replacements=[];
 function walk(node){
  if(!node||typeof node!=='object')return;
  if(['ImportDeclaration','ImportExpression'].includes(node.type)){
   const source=node.source;assert.equal(typeof source.value,'string');
   const [pathname,query='']=source.value.split('?'),params=new URLSearchParams(query);params.delete('v');
   replacements.push({start:source.start,end:source.end,text:JSON.stringify(pathname+(params.size?'?'+params.toString():''))});
  }
  for(const child of Object.values(node))if(Array.isArray(child))child.forEach(walk);else if(child&&typeof child==='object')walk(child);
 }
 walk(ast);let result=text;for(const replacement of replacements.sort((a,b)=>b.start-a.start))result=result.slice(0,replacement.start)+replacement.text+result.slice(replacement.end);return result;
}
function verifyProtected(manifest,overrides={}){
 for(const [file,wanted]of Object.entries(manifest.protectedFilesFromA4))assert.equal(sha(Object.hasOwn(overrides,file)?overrides[file]:fs.readFileSync(file)),wanted,file+' changed outside attendance patch scope');
 for(const [key,wanted]of Object.entries(manifest.protectedSyntaxFromA4)){
  const [file,name]=key.split('#'),text=Object.hasOwn(overrides,file)?overrides[file]:fs.readFileSync(file,'utf8');assert.equal(sha(protectedSyntax(text,name)),wanted,key+' canonical owner changed');
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 verifySourceIdentity(process.cwd(),runtimeHash(process.cwd()));
 const manifest=JSON.parse(fs.readFileSync(ACCEPTED_SOURCE.manifest));verifyProtected(manifest);console.log('PASS pinned source, '+Object.keys(manifest.protectedFilesFromA4).length+' protected files and '+Object.keys(manifest.protectedSyntaxFromA4).length+' protected owner bodies');
 const service='js/services/attendance.service.js',journal='js/data/attendanceJournal.js',finance='js/services/finance.service.js';
 for(const [file,mutate]of [[service,text=>text.replace('maxAttempts:3','maxAttempts:4')],[journal,text=>text.replace("row.state='acked'","row.state='pending'")],[finance,text=>text+'\n//unauthorized mutation']]){
  const original=fs.readFileSync(file,'utf8'),changed=mutate(original);assert.notEqual(changed,original);assert.throws(()=>verifyProtected(manifest,{[file]:changed}));console.log('PASS negative control rejects protected mutation '+file);
 }
 console.log('A5 OWNER BOUNDARY PASS 4');
}

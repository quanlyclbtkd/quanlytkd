import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readJsonFile} from './common.mjs';

const results=[];
const test=(name,fn)=>{try{fn();results.push({name,status:'PASS'});console.log('PASS',name)}catch(error){results.push({name,status:'FAIL',error:String(error?.message||error)});console.error('FAIL',name,error?.message||error)}};

const root=path.resolve(new URL('../..',import.meta.url).pathname);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'a9r10-win-'));

try {
  test('BOM JSON input is accepted by A9R10 tooling',()=>{
    const file=path.join(temp,'bom.json');
    fs.writeFileSync(file,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{"ok":true,"n":10}','utf8')]));
    assert.deepEqual(readJsonFile(file),{ok:true,n:10});
  });

  test('all A9R10 PowerShell runners are UTF-8 BOM for Windows PowerShell 5.1',()=>{
    const files=fs.readdirSync(root).filter(x=>/^Run-A9R10.*\.ps1$/.test(x));
    assert.ok(files.length>=10);
    for(const name of files){const b=fs.readFileSync(path.join(root,name));assert.deepEqual([...b.subarray(0,3)],[0xef,0xbb,0xbf],name+' missing UTF-8 BOM');}
  });

  test('A9R10 PowerShell runners do not emit UTF-8 BOM JSON through Set-Content -Encoding UTF8',()=>{
    const files=fs.readdirSync(root).filter(x=>/^Run-A9R10.*\.ps1$/.test(x));
    for(const name of files){const text=fs.readFileSync(path.join(root,name),'utf8');assert.equal(/Set-Content\s+-Encoding\s+UTF8/i.test(text),false,name+' still emits BOM JSON');}
  });

  test('every runner using Utf8NoBom defines it',()=>{
    const files=fs.readdirSync(root).filter(x=>/^Run-A9R10.*\.ps1$/.test(x));
    for(const name of files){const text=fs.readFileSync(path.join(root,name),'utf8');if(text.includes('$Utf8NoBom'))assert.match(text,/New-Object\s+System\.Text\.UTF8Encoding\(\$false\)/,name+' missing Utf8NoBom definition');}
  });
} finally { fs.rmSync(temp,{recursive:true,force:true}); }

const pass=results.filter(x=>x.status==='PASS').length,fail=results.length-pass;
console.log('A9R10_WINDOWS_INTEROP_RESULT',JSON.stringify({pass,fail,total:results.length}));
if(fail) process.exitCode=1;

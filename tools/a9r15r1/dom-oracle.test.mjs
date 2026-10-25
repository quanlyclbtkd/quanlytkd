import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
const root=process.cwd(),results=[];
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><body></body>');return;}const file=path.join(root,'tools/a9r15r1/dom-harness.mjs');res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await loadPlaywright().chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const observations=await page.evaluate(async()=>{
  const {TestOption,TestSelect}=await import('/dom-harness.mjs');
  const run=(OptionType,select)=>{
   const rows=[],capture=label=>rows.push({label,value:select.value,selectedIndex:select.selectedIndex,options:Array.from(select.options).map(o=>({text:o.text,value:o.value,defaultSelected:o.defaultSelected,selected:o.selected}))});
   const text=new OptionType('plain text');rows.push({label:'constructor omitted value',text:text.text,value:text.value,defaultSelected:text.defaultSelected,selected:text.selected});
   const literal=new OptionType('<b>literal</b>','KEY',true,true);rows.push({label:'constructor explicit flags/literal',text:literal.text,value:literal.value,defaultSelected:literal.defaultSelected,selected:literal.selected});
   select.add(new OptionType('Choose',''));select.add(new OptionType('One','ID1'));capture('insert options selects first');
   select.value='ID1';capture('select by immutable value');select.value='missing';capture('missing value clears selection');
   select.selectedIndex=1;capture('selectedIndex');select.add(new OptionType('Before','ID0'),0);capture('insert before preserves selected option');
   select.replaceChildren(new OptionType('A','A'),new OptionType('B','B',true,true));capture('replaceChildren with selected option');
   select.options[0].selected=true;capture('option selected is exclusive');select.options[0].text='New label';capture('label does not remap ID');
   select.options[0].value='A2';capture('value tracks selected option identity');
   return rows;
  };
  return {native:run(Option,document.createElement('select')),shim:run(TestOption,new TestSelect('test'))};
 });
 for(let i=0;i<observations.native.length;i++){
  const actual=observations.shim[i],expected=observations.native[i];
  try{assert.deepEqual(actual,expected);results.push({case:expected.label,classification:'PASS',native:expected,shim:actual});console.log('PASS',expected.label);}
  catch(error){results.push({case:expected.label,classification:'FAIL_TEST_HARNESS',native:expected,shim:actual,message:error.message});console.error('FAIL',expected.label);}
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
fs.mkdirSync('evidence/A9R15R1',{recursive:true});fs.writeFileSync('evidence/A9R15R1/DOM_ORACLE.json',JSON.stringify({classification:results.every(r=>r.classification==='PASS')?'PASS':'FAIL_TEST_HARNESS',oracle:'Actual Chromium native Option/HTMLSelectElement; expectations are not generated from the shim',results},null,2));if(results.some(r=>r.classification!=='PASS'))process.exitCode=1;

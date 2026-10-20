import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
const req=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/../package.json');const {chromium}=req('playwright');
const root=path.resolve('.'),out=path.resolve(process.env.QR_SVG_EVIDENCE || '../../evidence/svg-security');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((q,r)=>{const u=new URL(q.url,'http://localhost');if(u.pathname==='/'){r.setHeader('content-type','text/html');r.end('<!doctype html><title>QR security QA</title>');return;}const p=path.resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')){r.writeHead(403);r.end();return;}try{r.setHeader('content-type','text/javascript');r.end(fs.readFileSync(p));}catch(_){r.writeHead(404);r.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.QR_CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--no-zygote','--single-process']});
const page=await browser.newPage(),rows=[],external=[];let failed=0;
page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')external.push(r.url());});
const wrap=body=>'<svg xmlns="http://www.w3.org/2000/svg" width="490" height="490" viewBox="0 0 490 490">'+body+'</svg>';
const unsafe=[
 ['script',wrap('<script>globalThis.__svgExecuted=1</script>')],
 ['event handler',wrap('<rect width="490" height="490" onload="globalThis.__svgExecuted=1"/>')],
 ['foreignObject',wrap('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">bad</div></foreignObject>')],
 ['external image',wrap('<image width="490" height="490" href="https://other.invalid/x.png"/>')],
 ['javascript URI',wrap('<image width="490" height="490" href="javascript:alert(1)"/>')],
 ['embedded SVG',wrap('<image width="490" height="490" href="data:image/svg+xml;base64,PHN2Zy8+"/>')],
 ['CSS URL',wrap('<rect width="490" height="490" fill="url(https://other.invalid/x)"/>')],
 ['style',wrap('<style>@import "https://other.invalid/x";</style>')],
 ['style attribute',wrap('<rect width="490" height="490" style="fill:red"/>')],
 ['animation',wrap('<animate attributeName="href" values="https://other.invalid/x"/>')],
 ['use reference',wrap('<use href="https://other.invalid/x.svg#id"/>')],
 ['DTD','<!DOCTYPE svg SYSTEM "https://other.invalid/x">'+wrap('')],
 ['entity','<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+wrap('&x;')],
 ['processing instruction','<?xml-stylesheet href="https://other.invalid/x"?>'+wrap('')],
 ['nested SVG',wrap(wrap(''))],
 ['wrong namespace',wrap('').replace('http://www.w3.org/2000/svg','http://www.w3.org/1999/xhtml')],
 ['non-square',wrap('').replace('0 0 490 490','0 0 490 100')],
 ['oversized viewBox',wrap('').replace('0 0 490 490','0 0 9000 9000')],
 ['broken embedded PNG',wrap('<image width="490" height="490" href="data:image/png;base64,AAAA"/>')],
 ['broken embedded JPEG',wrap('<image width="490" height="490" href="data:image/jpeg;base64,AAAA"/>')],
 ['unknown namespace attr',wrap('<path xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="https://other.invalid/x"/>')],
 ['malformed XML','<svg><broken>'],
];
async function check(name,fn){try{await fn();rows.push({name,status:'PASS'});console.log('PASS',name);}catch(e){failed++;rows.push({name,status:'FAIL',reason:e.message});console.log('FAIL',name,e.message);}}
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{window.__qaHelpers=(await import('/js/modules/qrBankingHelpers.js')).QRBankingHelpers;});
 for(const [name,text] of unsafe)await check('SVG reject '+name,async()=>{const code=await page.evaluate(async text=>{try{await window.__qaHelpers.prepareReceiptQrImage(new TextEncoder().encode(text),'image/svg+xml',document);return 'ACCEPTED';}catch(e){return e.code;}},text);assert.equal(code,'QR_SVG_UNSAFE');});
 const svg=fs.readFileSync('tools/qr-v8/fixtures/provider-synthetic.svg','utf8');
 await check('Actual provider SVG with embedded PNG/JPEG rasterizes and decodes',async()=>{
  const data=await page.evaluate(async text=>window.__qaHelpers.prepareReceiptQrImage(new TextEncoder().encode(text),'image/svg+xml; charset=utf-8',document),svg);
  assert.ok(data.startsWith('data:image/png;base64,'));const p=path.join(out,'provider-rasterized.png');fs.writeFileSync(p,Buffer.from(data.split(',')[1],'base64'));
  const result=spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',['tools/qr-v8/verify-export.py',p],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const pixels=JSON.parse(result.stdout);
  const emv=spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',['tools/qr-v7/verify-emv.py'],{input:pixels.payload,encoding:'utf8'});assert.equal(emv.status,0,emv.stderr);assert.deepEqual(JSON.parse(emv.stdout),{bankBin:'970422',accountNo:'001234567890',amount:500000,memo:'TEST VDV Hoc Phi Thang 10 2026',crc:'PASS'});
 });
 await check('No injected code or global decoder polyfill',async()=>{const state=await page.evaluate(()=>({ran:window.__svgExecuted,globalJsQR:typeof window.jsQR,native:typeof window.BarcodeDetector}));assert.equal(state.ran,undefined);assert.equal(state.globalJsQR,'undefined');assert.equal(state.native,'undefined');});
 await check('No external resource requests from SVG processing',async()=>assert.equal(external.length,0));
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({layer:'REAL CHROMIUM DOMParser/Image/canvas + independent ZXing verifier',pass:rows.length-failed,fail:failed,externalRequests:external.length,rows},null,2));console.log(JSON.stringify({pass:rows.length-failed,fail:failed}));process.exitCode=failed?1:0;}

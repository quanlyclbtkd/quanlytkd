// Sequential paired replay. Requires an explicit independent baseline folder.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const candidate=path.resolve(process.env.A9R17_CANDIDATE_ROOT||process.cwd()),baseline=path.resolve(process.env.A9R17_BASELINE_ROOT||'../baseline'),out=path.resolve(process.env.A9R17_EVIDENCE||'evidence/A9R17/PAIRED_QR');
assert(candidate!==baseline,'Independent roots required');assert(!fs.existsSync(out),'Fresh evidence directory required');fs.mkdirSync(out,{recursive:true});
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),script=fileURLToPath(new URL('./qr.browser.mjs',import.meta.url)),roots={A:baseline,B:candidate},identities={};
for(const[k,root]of Object.entries(roots)){const{runtimeHash}=await import(pathToFileURL(path.join(root,'tools/v11r2/cutover.mjs'))),{verifySourceIdentity}=await import(pathToFileURL(path.join(root,'tools/v11r2/source-identity.mjs')));identities[k]=verifySourceIdentity(root,runtimeHash(root));}
for(const f of['tools/qr-v7/fixtures/valid.png','tools/qr-v8/fixtures/provider-synthetic.svg','tools/qr-v7/vendor/html2canvas.min.js'])assert.equal(sha(path.join(baseline,f)),sha(path.join(candidate,f)),f);
const protocol={id:'A9R17_PAIRED_QR_PNG_SVG_V1',pairsPerCell:5,cpus:[1,4],formats:['png','svg'],entries:['debt','multiitem'],cache:['cold','warm'],order:'Alternating AB/BA by pair, offset by cell',providerFixtureDelayMs:200,assetFixtureDelayMs:500,scope:'Native Chromium component; actual receipt/render/decoder, synthetic authority and provider/CDN; not physical mobile or live provider',noRetriesOrSampleSubstitution:true,identities,harnessSHA256:sha(script)};
fs.writeFileSync(path.join(out,'PROTOCOL.json'),JSON.stringify(protocol,null,2));const records=[];let cell=0;
for(const format of protocol.formats)for(const cpu of protocol.cpus)for(const entry of protocol.entries){
 for(let pair=1;pair<=protocol.pairsPerCell;pair++)for(const variant of (pair+cell)%2?['A','B']:['B','A']){
  const directory=path.join(out,`${format}_${cpu}_${entry}_${pair}_${variant}`);fs.mkdirSync(directory);const log=fs.openSync(path.join(directory,'console.log'),'w');
  const env={...process.env,QR_TEST_SOURCE_ROOT:roots[variant],A9R17_EVIDENCE:directory,A9R17_CPU:String(cpu),A9R17_ENTRY:entry,A9R17_PROVIDER_FORMAT:format,A9R17_REPEATS:'1'};
  const exitCode=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[script],{cwd:candidate,env,stdio:['ignore',log,log]});p.on('error',reject);p.on('exit',(code,signal)=>resolve(signal?'SIGNAL:'+signal:code))});fs.closeSync(log);
  const file=path.join(directory,'QR_COMPONENT_PROBE.json'),data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
  const valid=exitCode===0&&data?.status==='PASS'&&data.format===format&&data.harnessSHA256===protocol.harnessSHA256&&data.sourceSHA256===sha(path.join(roots[variant],'app.js'))&&data.rows.length===2&&JSON.stringify(data.rows.map(r=>r.cache))===JSON.stringify(protocol.cache)&&data.errors.length===0&&data.rows.every(r=>r.ok&&r.cpu===cpu&&r.entry===entry&&r.writes===0&&r.observed.scans.length===2);
  const row={format,cpu,entry,pair,variant,exitCode,classification:valid?'PASS':'FAIL_TEST_HARNESS',actualRows:data?.rows?.length||0,directory};records.push(row);fs.writeFileSync(path.join(out,'CAMPAIGN.json'),JSON.stringify({protocol,records},null,2));console.log(JSON.stringify(row));assert(valid,'Incomplete or failed replay; stop and preserve evidence');
 }cell++;
}
assert.equal(records.length,80);console.log('COMPLETE: 160 valid cold/warm observations');

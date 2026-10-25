import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';
import {buildImportGraph} from '../v11r2/import-graph.mjs';
import {parse} from '../v11r2/vendor/acorn.mjs';
const root=path.resolve(process.env.A9R16_SOURCE_ROOT||process.cwd());
const output=path.resolve(process.env.A9R16_EVIDENCE_ROOT||'evidence/A9R16');fs.mkdirSync(output,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>fs.readFileSync(path.join(root,f));
const identity=verifyRuntimeProfile(root),manifest=JSON.parse(read(identity.identity.manifest)),graph=buildImportGraph(root);
const html=read('index.html').toString();const classic=[];
for(const m of html.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 const src=/\bsrc\s*=\s*['"]([^'"]+)/.exec(m[1])?.[1];if(src&&!/\btype=['"]module/.test(m[1]))classic.push(new URL(src,'https://a.invalid/').pathname.slice(1));
}
const closure=(entry)=>{const q=[entry],seen=new Set();while(q.length){const f=q.shift();if(seen.has(f))continue;seen.add(f);for(const e of graph.edges)if(e.from===f&&e.to&&e.kind==='static')q.push(e.to);}return [...seen].sort();};
const esm=closure('js/main.js');
const bytes=list=>({fileCount:list.length,rawBytes:list.reduce((n,f)=>n+read(f).length,0),gzipEstimatedBytes:list.reduce((n,f)=>n+zlib.gzipSync(read(f),{level:9}).length,0)});
const urls={};for(const e of graph.edges){if(!e.to)continue;(urls[e.to]||=new Set()).add(new URL(e.url,'https://a.invalid/'+(e.kind==='script-loader'?'index.html':e.from)).pathname+new URL(e.url,'https://a.invalid/'+e.from).search);}
const duplicates=Object.entries(urls).filter(([,v])=>v.size>1).map(([file,v])=>({file,urls:[...v]}));
const classify=f=>f==='js/main.js'?'BOOT_CRITICAL':/attendance|branch|listeners\/profiles|studentProfileStore|listeners\.js|event-guard|store\.js|toast|loading|\/tabs\.|roleRead|firebase\/config/.test(f)?'ROLE_CRITICAL':/superadmin|superAdmin|exam|export|reports|qrBanking/.test(f)?'ON_DEMAND':/finance|inventory|dashboard|students/.test(f)?'FIRST_TAB_CRITICAL':'LEGACY_COMPATIBILITY';
const members=graph.files.filter(f=>f.endsWith('.js')).map(file=>({file,...bytes([file]),classification:classify(file),classificationMethod:'Preliminary path-based triage; per-role semantic necessity not certified',classificationStatus:'ENV_BLOCKED',initialESM:esm.includes(file),classic:classic.includes(file)}));
const allRuntime=Object.keys(manifest.canonicalRuntimeFiles);const js=allRuntime.filter(f=>f.endsWith('.js'));
const sdkCounts=Object.fromEntries(['getDoc','getDocs','onSnapshot'].map(k=>[k,js.reduce((n,f)=>n+(read(f).toString().match(new RegExp('\\b'+k+'\\s*\\(','g'))||[]).length,0)]));
const record={phase:'A9R16A',classification:'PASS',timestamp:new Date().toISOString(),parentZipSha256:'0033e1e93d76da98c6c786f4c27235c1e3fdf921ef9234af11e0c7ef5d7e61cb',
 identity:identity.identity,historyAuthority:identity.authority,journalDatabase:'tst-attendance-journal-v4',journalSchema:1,
 hashes:Object.fromEntries(['app.js','js/main.js','index.html','firestore.rules','firestore.indexes.json'].map(f=>[f,hash(read(f))])),
 canonicalRuntimeFileCount:allRuntime.length,rootPublic:{root:allRuntime.length,public:allRuntime.length,mismatches:allRuntime.filter(f=>!read(f).equals(read('public/'+f)))},
 js:bytes(js),htmlBytes:read('index.html').length,cssBytes:allRuntime.filter(f=>f.endsWith('.css')).reduce((n,f)=>n+read(f).length,0),
 classicStartup:bytes(classic),classicFiles:classic,initialStaticESM:bytes(esm),initialStaticESMFiles:esm,
 initialLocalJS:bytes([...new Set([...classic,...esm])]),gzipMethod:'Sum of independently gzipped UTF-8 resource bytes, compression level 9; estimate, not CDN telemetry',sdkStaticCallSites:sdkCounts,
 transitiveModules:members,moduleURLDuplicates:duplicates,graph,scope:'Source graph identity. Runtime FUS/authority performance must be measured separately; no runtime patch made.'};
fs.writeFileSync(path.join(output,'A9R16A_SOURCE_IDENTITY.json'),JSON.stringify(record,null,2)+'\n');
fs.writeFileSync(path.join(output,'A9R16_IMPORT_GRAPH_BEFORE.json'),JSON.stringify({entry:'index.html',...graph,initialStaticESMFiles:esm,moduleURLDuplicates:duplicates,modules:members},null,2)+'\n');
console.log(JSON.stringify({runtimeSHA256:identity.identity.runtimeSHA256,canonical:allRuntime.length,classic:record.classicStartup,esm:record.initialStaticESM,js:record.js,sdkCounts,duplicateIdentities:duplicates.length}));

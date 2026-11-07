import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildImportGraph } from '../v11r2/import-graph.mjs';
const ROOT=process.cwd();
const bytes=p=>fs.statSync(path.join(ROOT,p)).size;
const gzip=p=>zlib.gzipSync(fs.readFileSync(path.join(ROOT,p)),{level:9}).length;
let browserDependency='MISSING';
try { await import('playwright'); browserDependency='AVAILABLE'; } catch {}
const graph=buildImportGraph(ROOT);
const mainReachable=new Set(['js/main.js']);
let changed=true; while(changed){changed=false; for(const e of graph.edges){if(mainReachable.has(e.from)&&e.to&&e.kind==='static'&&!mainReachable.has(e.to)){mainReachable.add(e.to);changed=true;}}}
const mainFiles=[...mainReachable].filter(f=>fs.existsSync(path.join(ROOT,f)));
const result={
  status: browserDependency==='AVAILABLE'?'BROWSER_DEPENDENCY_AVAILABLE_MEASUREMENT_REQUIRES_REAL_AUTH_FIXTURE':'TEST_DEPENDENCY_MISSING',
  browserDependency,
  app:{rawBytes:bytes('app.js'),gzipBytes:gzip('app.js')},
  main:{rawBytes:bytes('js/main.js'),gzipBytes:gzip('js/main.js')},
  staticMainGraph:{moduleCount:mainFiles.length,rawBytes:mainFiles.reduce((n,f)=>n+bytes(f),0),gzipBytes:mainFiles.reduce((n,f)=>n+gzip(f),0)},
  coldStartup:'NOT VERIFIED — ENVIRONMENT',
  warmStartup:'NOT VERIFIED — ENVIRONMENT',
  profileHydrationWallClock:'NOT VERIFIED — ENVIRONMENT',
  roles:{Admin:'NOT VERIFIED',Coach:'NOT VERIFIED',SuperAdmin:'NOT VERIFIED'},
  networks:{normal:'NOT VERIFIED',fast4g:'NOT VERIFIED',slow4g:'NOT VERIFIED'}
};
console.log(JSON.stringify(result,null,2));
if(browserDependency==='MISSING') console.log('TEST_DEPENDENCY_MISSING');

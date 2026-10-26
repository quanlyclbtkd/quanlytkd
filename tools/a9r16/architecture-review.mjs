// Read-only QA inventory. Categories never authorize an automatic defer.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';import {pathToFileURL,fileURLToPath} from 'node:url';
import {buildImportGraph} from '../v11r2/import-graph.mjs';import {runtimeHash} from '../v11r2/cutover.mjs';import {parse} from '../v11r2/vendor/acorn.mjs';
export function normalizeCacheURL(value) {
    const hashAt=value.indexOf('#'),fragment=hashAt<0?'':value.slice(hashAt),base=hashAt<0?value:value.slice(0,hashAt),at=base.indexOf('?');
    if(at<0)return value;
    const params=new URLSearchParams(base.slice(at+1));params.delete('v');
    return base.slice(0,at)+(params.toString()?'?'+params.toString():'')+fragment;
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(node,visit){if(!node||typeof node!=='object')return;if(node.type)visit(node);for(const[k,v]of Object.entries(node)){if(['start','end','loc'].includes(k))continue;if(Array.isArray(v))v.forEach(x=>walk(x,visit));else if(v&&typeof v==='object')walk(v,visit)}}
const literal=n=>n?.type==='Literal'&&typeof n.value==='string'?n.value:null;
function globalPath(n){if(n?.type==='ChainExpression')return globalPath(n.expression);if(n?.type==='Identifier')return n.name==='window'?'window':null;if(n?.type!=='MemberExpression')return null;const parent=globalPath(n.object),key=n.computed?literal(n.property):n.property.name;return parent&&key?parent+'.'+key:null}
function isWindowMember(n){if(n?.type==='ChainExpression')return isWindowMember(n.expression);return n?.type==='MemberExpression'&&(globalPath(n.object)||isWindowMember(n.object))}
function clean(n){if(!n||typeof n!=='object')return n;if(Array.isArray(n))return n.map(clean);return Object.fromEntries(Object.entries(n).filter(([k])=>!['start','end','loc','raw'].includes(k)).map(([k,v])=>[k,clean(v)]))}
function normalizedAST(root,file,graph){let text=fs.readFileSync(path.join(root,file),'utf8');for(const e of graph.edges.filter(e=>e.from===file&&e.to).sort((a,b)=>b.start-a.start)){const value=normalizeCacheURL(e.url);text=text.slice(0,e.start)+(e.quoted?JSON.stringify(value):value)+text.slice(e.end)}return clean(parse(text,{ecmaVersion:'latest',sourceType:'module'}))}
function category(file){
    if(file==='js/firebase/paginatedQuery.js')return'DATA_AUTHORITY';
    if(file==='js/core/inventoryMultiItemReadOnlyUI.js')return'INVENTORY_ONLY';
    if(file==='js/core/productionStabilityGate.js')return'CORE_BOOT';
    if(file==='js/utils/listeners.js'||file==='js/core/studentSearchIndex.js'||/\/data\/|\/listeners\/|\/services\//.test(file))return'DATA_AUTHORITY';
    if(/\/modules\/superadmin\.js$/.test(file))return'SUPERADMIN_ONLY';
    if(/\/modules\/reports\/|\/modules\/reports\.js$/.test(file))return'EXPORT_ONLY';
    if(/\/modules\/finance(?:\/|\.js)|\/events\/finance|\/renderFinance\.js$|\/financeRenderer\.js$|\/receiptHelpers\.js$|\/qrBankingHelpers\.js$/.test(file))return'FINANCE_ONLY';
    if(/\/modules\/inventory\.js$|\/renderInventory\.js$|\/inventoryRenderer\.js$/.test(file))return'INVENTORY_ONLY';
    if(/\/modules\/(students(?:\/|\.js)|dashboard\.js|searchRuntime\.js)|\/events\/students|\/renderStudents\.js$|\/studentsRenderer\.js$|\/renderDashboard\.js$|\/dashboardRenderer\.js$/.test(file))return'UI_ONLY_ADMIN';
    if(/attendance|Attendance/.test(file))return'ATTENDANCE_REQUIRED';
    if(/Boundary|Guard|Authority|Policy|Security|security|Posture|Ownership|coachBranch|branchIdentity|trainingRegistration|Safety|Integrity|firestore-guard/.test(file))return'SECURITY_AUTHORITY';
    if(['js/utils/format.js','js/utils/date.js'].includes(file))return'PURE_HELPER';
    if(file==='js/main.js'||file==='app.js'||file==='js/store.js'||/\/ui\/|\/utils\/|\/firebase\/config\.js$|\/core\/(performanceMonitor|mobileStartupPerformance|staticCssBuildHealth|financialFlowMap|legacyAppAudit|legacyRenderEntrypoints|inlineHandlerAudit|superAdmin|clubStatsAutoCache)|\/diagnostics\//i.test(file))return'CORE_BOOT';
    return'UNKNOWN';
}
export async function runArchitectureReview(root,out,compareRoot=null){
 root=path.resolve(root);out=path.resolve(out);fs.mkdirSync(out,{recursive:true});
 const {verifySourceIdentity}=await import(pathToFileURL(path.join(root,'tools/v11r2/source-identity.mjs'))),pin=verifySourceIdentity(root,runtimeHash(root)),manifest=JSON.parse(fs.readFileSync(path.join(root,pin.manifest))),canonical=Object.keys(manifest.canonicalRuntimeFiles),graph=buildImportGraph(root,{},canonical.filter(f=>f.endsWith('.js')));
 const edges=graph.edges.filter(e=>e.to),found=new Set(['js/main.js']),queue=['js/main.js'];while(queue.length){const f=queue.shift();for(const e of edges.filter(e=>e.from===f&&e.kind==='static'))if(!found.has(e.to)){found.add(e.to);queue.push(e.to)}}
 const urls=new Map();for(const e of edges){const u=new URL(e.url,new URL(e.kind==='script-loader'?'index.html':e.from,'https://qa.invalid/'));const s=urls.get(e.to)||new Set();s.add(u.pathname+u.search+u.hash);urls.set(e.to,s)}
 const bindings=[],calls=[],dynamicBindings=[],effects=[];
 for(const file of graph.files.filter(f=>f.endsWith('.js'))){const text=fs.readFileSync(path.join(root,file),'utf8'),ast=parse(text,{ecmaVersion:'latest',sourceType:'module',locations:true});
  walk(ast,n=>{if(n.type==='AssignmentExpression'&&isWindowMember(n.left)){const api=globalPath(n.left);(api?bindings:dynamicBindings).push({api,file,line:n.loc.start.line,kind:'assignment',source:text.slice(n.start,Math.min(n.end,n.start+180))})}
   if(n.type==='CallExpression'){const p=globalPath(n.callee);if(p)calls.push({api:p,file,line:n.loc.start.line});const c=n.callee;if(c?.type==='MemberExpression'&&c.object?.name==='Object'&&['defineProperty','assign'].includes(c.property?.name)&&n.arguments[0]?.name==='window'){
    if(c.property.name==='defineProperty'){const key=literal(n.arguments[1]);(key?bindings:dynamicBindings).push({api:key?'window.'+key:null,file,line:n.loc.start.line,kind:'Object.defineProperty',source:text.slice(n.start,Math.min(n.end,n.start+180))})}
    else for(const arg of n.arguments.slice(1)){if(arg.type==='ObjectExpression')for(const prop of arg.properties){const key=prop.computed?literal(prop.key):prop.key?.name||literal(prop.key);(key?bindings:dynamicBindings).push({api:key?'window.'+key:null,file,line:n.loc.start.line,kind:'Object.assign'})}else dynamicBindings.push({api:null,file,line:n.loc.start.line,kind:'Object.assign dynamic source',source:text.slice(arg.start,arg.end)})}
   }}
  });
  const mutableTopLevel=ast.body.filter(n=>n.type==='VariableDeclaration'&&(n.kind!=='const'||n.declarations.some(d=>d.init?.type==='NewExpression'))).map(n=>({line:n.loc.start.line,source:text.slice(n.start,Math.min(n.end,n.start+180))}));
  effects.push({file,category:category(file),mutableTopLevel,globalBindings:bindings.filter(b=>b.file===file),unresolvedDynamicBindings:dynamicBindings.filter(b=>b.file===file),pureExtractionCertified:false});
 }
 const rows=[...found].sort().map(file=>{const b=fs.readFileSync(path.join(root,file));return{physicalPath:file,effectiveURLs:[...(urls.get(file)||[])],importers:[...new Set(edges.filter(e=>e.to===file&&e.kind==='static').map(e=>e.from))],rawBytes:b.length,gzipEstimate:zlib.gzipSync(b).length,category:category(file),automaticDeferralAllowed:false}});
 const apis=[...new Set(bindings.map(b=>b.api))].sort().map(api=>({api,owners:bindings.filter(b=>b.api===api),callers:calls.filter(c=>c.api===api),loadingRoleReview:'Existing policy preserved; unresolved role/call-path analysis blocks automatic deferral'}));
 const result={classification:'PASS',inventoryCoverage:'RELEASE_BLOCKED',coverageReason:'Computed global bindings remain explicit unresolved evidence; no claim of exhaustive runtime API/role compatibility',sourceIdentity:pin,staticESM:{files:rows.length,rawBytes:rows.reduce((n,r)=>n+r.rawBytes,0),gzipEstimate:rows.reduce((n,r)=>n+r.gzipEstimate,0)},modules:rows,unknown:rows.filter(r=>r.category==='UNKNOWN').map(r=>r.physicalPath),duplicateURLs:[...urls].filter(([,s])=>s.size>1).map(([file,s])=>({file,urls:[...s]})),literalBindings:bindings.length,uniqueAPIs:apis.length,unresolvedDynamicBindings:dynamicBindings,apis,sideEffects:effects};
 if(compareRoot){compareRoot=path.resolve(compareRoot);const {verifySourceIdentity:verifyOther}=await import(pathToFileURL(path.join(compareRoot,'tools/v11r2/source-identity.mjs'))),otherPin=verifyOther(compareRoot,runtimeHash(compareRoot)),otherManifest=JSON.parse(fs.readFileSync(path.join(compareRoot,otherPin.manifest))),otherGraph=buildImportGraph(compareRoot,{},Object.keys(otherManifest.canonicalRuntimeFiles).filter(f=>f.endsWith('.js')));
  result.protectedComparison={otherIdentity:otherPin,normalization:'Only v cache parameter on AST-proven local import/script edges; every other query parameter/hash/string is preserved',files:canonical.filter(f=>f.endsWith('.js')&&!['js/main.js','js/modules/superadmin.js'].includes(f)).map(file=>({file,beforeSHA256:sha(fs.readFileSync(path.join(root,file))),afterSHA256:sha(fs.readFileSync(path.join(compareRoot,file))),semanticUnchanged:JSON.stringify(normalizedAST(root,file,graph))===JSON.stringify(normalizedAST(compareRoot,file,otherGraph))}))};
  if(result.protectedComparison.files.some(r=>!r.semanticUnchanged))result.protectedComparison.classification='SCOPE_VIOLATION';else result.protectedComparison.classification='PASS';
 }
 fs.writeFileSync(path.join(out,'ARCHITECTURE_REVIEW.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({classification:result.classification,coverage:result.inventoryCoverage,staticESM:result.staticESM,unknown:result.unknown,literalBindings:result.literalBindings,uniqueAPIs:result.uniqueAPIs,unresolvedDynamicBindings:dynamicBindings.length,protectedComparison:result.protectedComparison?.classification}));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await runArchitectureReview(process.argv[2]||process.cwd(),process.argv[3]||'evidence/A9R16_REVIEW',process.argv[4]||null);

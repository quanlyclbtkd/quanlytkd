// Static read-only inventory. UNKNOWN remains UNKNOWN until runtime validation.
import fs from 'node:fs';import path from 'node:path';import {parse} from '../v11r2/vendor/acorn.mjs';
const root=path.resolve(process.env.A9R16_SOURCE_ROOT||process.cwd()),out=path.resolve(process.env.A9R16_EVIDENCE_ROOT||'evidence/A9R16');fs.mkdirSync(out,{recursive:true});
const baseline=JSON.parse(fs.readFileSync(path.join(out,'A9R16A_SOURCE_IDENTITY.json'))),graph=baseline.graph;
const texts=Object.fromEntries(graph.files.filter(f=>f.endsWith('.js')).map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));texts['index.html']=fs.readFileSync(path.join(root,'index.html'),'utf8');
const audits=[],apis=[];
function name(node){if(!node)return '';if(node.type==='Identifier')return node.name;if(node.type==='MemberExpression')return name(node.object)+'.'+(node.computed?(node.property.value??'?'):node.property.name);return node.type;}
for(const [file,source] of Object.entries(texts)){
 if(file==='index.html')continue;const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),calls=[],exports=[];
 function walk(node,insideFunction=false,owner='top-level'){
  if(!node||typeof node!=='object')return;
  const isFn=/Function(Expression|Declaration)$/.test(node.type)||node.type==='ArrowFunctionExpression';
  const localOwner=isFn?(node.id?.name||'anonymous function'):owner;
  if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&node.left.object.name==='window'){
   const global=node.left.computed?node.left.property.value:node.left.property.name;
   if(typeof global==='string'){exports.push({global,owner:localOwner,importTime:!insideFunction});apis.push({global,ownerModule:file,definitionScope:owner,importTime:!insideFunction,caller:Object.entries(texts).filter(([f,t])=>f!==file&&(t.includes('window.'+global)||t.includes(global+'('))).map(([f])=>f),startupRequired:null,bridgeRequired:null,returnContract:'NOT_AUDITED: no module was converted to lazy in A9R16A',bridgeCreated:false,tested:false});}
  }
  if(node.type==='CallExpression'&&!insideFunction){const callee=name(node.callee);calls.push({callee,line:source.slice(0,node.start).split('\n').length});if(/FunctionExpression|ArrowFunctionExpression/.test(node.callee.type))walk(node.callee.body,false,'import-time IIFE');}
  for(const [key,v]of Object.entries(node)){if(['start','end','loc'].includes(key))continue;if(node.type==='CallExpression'&&key==='callee'&&/FunctionExpression|ArrowFunctionExpression/.test(node.callee.type))continue;if(Array.isArray(v))for(const child of v)walk(child,insideFunction||isFn,localOwner);else if(v&&typeof v==='object')walk(v,insideFunction||isFn,localOwner);}
 }
 walk(ast);
 const reads=calls.filter(x=>/(?:^|\.)(getDoc|getDocs|onSnapshot)$/.test(x.callee)),listeners=calls.filter(x=>/(?:^|\.)(addEventListener|onSnapshot|setInterval)$/.test(x.callee)),dom=calls.filter(x=>/(appendChild|replaceChildren|insertAdjacentHTML|addEventListener)$/.test(x.callee)),inits=calls.filter(x=>/(?:^|\.)(init[A-Z]|register[A-Z])/.test(x.callee));
 let classification=reads.length?'BUSINESS_SIDE_EFFECT':listeners.length?'LISTENER_SIDE_EFFECT':dom.length?'DOM_SIDE_EFFECT':inits.length?'BUSINESS_SIDE_EFFECT':calls.length?'UNKNOWN':exports.some(x=>x.importTime)?'SAFE_GLOBAL_EXPORT':'PURE_DEFINITION';
 audits.push({module:file,classification,topLevelReads:reads,topLevelListeners:listeners,topLevelDOMBinding:dom,topLevelInitializationCalls:inits,allTopLevelCalls:calls,explicitInit:[...source.matchAll(/export\s+(?:async\s+)?function\s+(init\w*)/g)].map(x=>x[1]),explicitDispose:[...source.matchAll(/export\s+(?:async\s+)?function\s+((?:dispose|reset|cleanup)\w*)/g)].map(x=>x[1]),globalExports:exports,
  safeToImport:null,actionTaken:'NO_RUNTIME_CHANGE; Phase B not entered',limitation:'Static own-module scan only. Calls through helpers and transitive import effects require manual/runtime audit before lazy conversion.'});
}
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
write('A9R16_LAZY_MODULE_SIDE_EFFECT_AUDIT.json',{classification:'ENV_BLOCKED',scope:'Preliminary static inventory; not a safe-to-import certification',newLazyModules:0,modules:audits});
write('A9R16_GLOBAL_API_BRIDGE_MAP.json',{classification:'ENV_BLOCKED',scope:'Static call-site inventory; return/bridge contracts must be reviewed before any lazy implementation',newBridges:0,apis});
write('A9R16_ROLE_MODULE_MATRIX.json',{classification:'PASS',scope:'BEFORE only; all roles use the same baseline main.js static graph. This is not an A9R16 role split.',modules:baseline.transitiveModules.map(m=>({module:m.file,coachInitial:m.initialESM||m.classic,adminInitial:m.initialESM||m.classic,superAdminInitial:m.initialESM||m.classic,tabLazy:!m.initialESM&&!m.classic,deferred:!m.initialESM&&!m.classic,classification:m.classification,classificationStatus:'ENV_BLOCKED',classificationMethod:'Preliminary path-based triage, not per-role necessity proof',reason:m.initialESM?'Transitive static dependency of shared main.js':m.classic?'Classic script tag in production HTML':'Reachable through existing dynamic/script-loader graph; no new deferral applied'}))});
console.log(JSON.stringify({modules:audits.length,apiDefinitions:apis.length,newBridges:0,newLazyModules:0}));

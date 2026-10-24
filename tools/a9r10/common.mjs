import fs from 'node:fs';
import crypto from 'node:crypto';
export const canonical=v=>JSON.stringify(v&&typeof v==='object'?(Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))]))):v);
export const sha=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
export const need=(ok,code)=>{if(!ok)throw Object.assign(new Error('A9R10_BLOCKED: '+code),{code});};
export const simple=s=>typeof s==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(s);
export function safeStagingProject(projectId){need(typeof projectId==='string'&&/^[a-z][a-z0-9-]{4,62}$/.test(projectId),'PROJECT_INVALID');need(projectId!=='quanly-tst','PRODUCTION_PROJECT_FORBIDDEN');need(!projectId.startsWith('demo-'),'REAL_STAGING_PROJECT_REQUIRED');return projectId;}
export function safeBaseURL(url){const u=new URL(url);need(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.endsWith('/'),'STAGING_BASE_URL_INVALID');return u.href;}
export function requiredPass(value,code){need(value==='PASS',code);}

export const readJsonFile=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));

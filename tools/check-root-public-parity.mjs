/** PHASE 4K-6V5U6H6 — audit-only root/public SHA-256 parity checker. */
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = resolve(root, 'public');
const roots = ['index.html','app.js','style.css','.nojekyll','js','css','assets'];
const norm = p => p.split(sep).join('/');
function collect(base, rel) {
  const abs=resolve(base,rel); if(!existsSync(abs)) return [];
  if(statSync(abs).isFile()) return [norm(rel)];
  const out=[]; const walk=(dir)=>{ for(const n of readdirSync(dir)){ const a=resolve(dir,n); if(statSync(a).isDirectory()) walk(a); else out.push(norm(relative(base,a))); } }; walk(abs); return out;
}
const rootFiles=[...new Set(roots.flatMap(r=>collect(root,r)))].sort();
const publicFiles=[...new Set(roots.flatMap(r=>collect(pub,r)))].sort();
const setR=new Set(rootFiles), setP=new Set(publicFiles);
const missing=rootFiles.filter(f=>!setP.has(f));
const extra=publicFiles.filter(f=>!setR.has(f));
const hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const mismatch=rootFiles.filter(f=>setP.has(f) && hash(resolve(root,f))!==hash(resolve(pub,f)));
console.log(JSON.stringify({algorithm:'SHA-256',rootFileCount:rootFiles.length,publicFileCount:publicFiles.length,missingPublic:missing,extraPublic:extra,hashMismatches:mismatch,status:(!missing.length&&!extra.length&&!mismatch.length)?'PASS':'FAIL'},null,2));
if(missing.length||extra.length||mismatch.length) process.exit(1);

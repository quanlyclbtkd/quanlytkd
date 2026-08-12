/**
 * tools/check-syntax.mjs — syntax checker
 * Phase 4K-6V5U6B harness optimization: same node --check semantics as before,
 * but checked with bounded parallelism so the production regression gate does not
 * timeout on slower filesystems. Assertions/coverage are unchanged.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { tmpdir } from 'os';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const VERBOSE = process.argv.includes('--verbose');
const TMP = tmpdir();
const CONCURRENCY = Math.max(2, Math.min(24, Number(process.env.SYNTAX_CHECK_CONCURRENCY || 12)));
const SKIP_DIRS = new Set(['node_modules','dist','build','.git']);
const SKIP_FIRST_SEGS = new Set(['functions','.git']);

function collectJsFiles(dir, result = []) {
  let entries; try { entries = readdirSync(dir); } catch { return result; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const rel = relative(ROOT, fullPath);
    const firstSeg = rel.split(/[\\/]/)[0];
    if (SKIP_FIRST_SEGS.has(firstSeg)) continue;
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) collectJsFiles(fullPath, result);
      else if (extname(entry) === '.js') result.push(fullPath);
    } catch {}
  }
  return result;
}

function runNodeCheck(filePath) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--check', filePath], { stdio: ['ignore','pipe','pipe'] });
    let out='', err='';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 10_000);
    child.on('error', e => { clearTimeout(timer); resolve({ok:false,error:String(e)}); });
    child.on('close', code => { clearTimeout(timer); resolve(code === 0 ? {ok:true} : {ok:false,error:(err||out||`exit ${code}`).trim()}); });
  });
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length); let next = 0;
  async function runner() {
    while (true) {
      const i = next++; if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length || 1)}, runner));
  return results;
}

function extractInlineScripts(htmlPath) {
  let html; try { html = readFileSync(htmlPath,'utf8'); } catch { return []; }
  const results=[]; const re=/<script([^>]*)>([\s\S]*?)<\/script>/gi; let m, idx=0;
  while ((m=re.exec(html)) !== null) {
    const attrs=m[1]||'', code=m[2]||'';
    if (/\bsrc\s*=/.test(attrs) || !code.trim()) continue;
    idx++; results.push({label:`index.html <script#${idx}${/type\s*=\s*["']module["']/.test(attrs)?' type=module':''}>`,code,isModule:/type\s*=\s*["']module["']/.test(attrs)});
  }
  return results;
}

let tmpIdx=0;
async function checkInlineCode(code,isModule) {
  const path=join(TMP,`_syntax_check_${process.pid}_${++tmpIdx}.js`);
  const src=isModule?code:`(function(){\n${code}\n})();`;
  try { writeFileSync(path,src,'utf8'); return await runNodeCheck(path); }
  finally { try { unlinkSync(path); } catch {} }
}

console.log('[SyntaxCheck] Scanning project JS files and index.html inline scripts...');
if (VERBOSE) console.log('[SyntaxCheck] Root:',ROOT,'concurrency:',CONCURRENCY);
console.log('');
const jsFiles=collectJsFiles(ROOT);
const fileResults=await mapLimit(jsFiles,CONCURRENCY,async filePath=>({filePath,result:await runNodeCheck(filePath)}));
const inlineScripts=extractInlineScripts(join(ROOT,'index.html'));
const inlineResults=await mapLimit(inlineScripts,CONCURRENCY,async item=>({item,result:await checkInlineCode(item.code,item.isModule)}));
let errors=0;
for (const {filePath,result} of fileResults) {
  const rel=relative(ROOT,filePath);
  if (!result.ok) { errors++; console.error(`❌ SYNTAX ERROR — ${rel}`); console.error(`   ${result.error}`); }
  else if (VERBOSE) console.log(`   ✅ ${rel}`);
}
for (const {item,result} of inlineResults) {
  if (!result.ok) { errors++; console.error(`❌ SYNTAX ERROR — ${item.label}`); console.error(`   ${result.error}`); }
  else if (VERBOSE) console.log(`   ✅ ${item.label}`);
}
const checked=jsFiles.length+inlineScripts.length;
console.log('');
console.log(`[SyntaxCheck] Checked: ${checked} items`);
console.log(`              JS files: ${jsFiles.length}`);
console.log(`              Inline scripts in index.html: ${inlineScripts.length}`);
console.log('');
if (errors) { console.error(`[SyntaxCheck] ❌ FAILED — ${errors} syntax error(s) found.`); process.exit(1); }
console.log('[SyntaxCheck] OK — JS files and inline scripts are valid.');

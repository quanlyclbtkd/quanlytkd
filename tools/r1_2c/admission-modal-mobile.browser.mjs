import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadPlaywright, browserExecutable } from '../test-runtime.mjs';

const root = process.cwd();
const results = [];
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403); res.end(); return; }
  try {
    if (rel === 'index.html') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); return; }
    if (file.endsWith('.css')) res.setHeader('content-type', 'text/css; charset=utf-8');
    else res.setHeader('content-type', 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await loadPlaywright().chromium.launch({ headless: true, executablePath: browserExecutable(), args: ['--no-sandbox'] });
const sizes = [[360,800],[390,844],[430,932],[568,320],[768,1024]];

try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'vi-VN' });
    const page = await context.newPage();
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    try {
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        const main = document.getElementById('mainApp'); if (main) main.style.display = 'block';
        const login = document.getElementById('loginOverlay'); if (login) login.style.display = 'none';
        const modal = document.getElementById('addModal'); modal.style.display = 'flex';
      });
      const before = await page.evaluate(() => {
        const modal = document.getElementById('addModal');
        const content = modal.querySelector('.modal-content');
        const save = modal.querySelector('button[onclick="addNewStudent()"]');
        const nav = document.querySelector('.ui-bottom-nav');
        const rect = x => { const r=x.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
        return {
          viewport: { width: innerWidth, height: innerHeight }, modalDisplay: getComputedStyle(modal).display,
          content: rect(content), contentClientHeight: content.clientHeight, contentScrollHeight: content.scrollHeight,
          contentClientWidth: content.clientWidth, contentScrollWidth: content.scrollWidth,
          save: rect(save), nav: nav ? rect(nav) : null, docScrollWidth: document.documentElement.scrollWidth,
          contentOverflowY: getComputedStyle(content).overflowY,
        };
      });
      assert.equal(before.modalDisplay, 'flex');
      assert(before.content.width > 0 && before.content.height > 0, 'Add Student modal content must be visible');
      assert(before.content.x >= -0.5 && before.content.right <= width + 0.5, 'Modal content must remain inside viewport horizontally');
      assert(before.contentScrollWidth <= before.contentClientWidth + 1, 'Modal content must not have horizontal overflow');
      assert(before.docScrollWidth <= width + 1, 'Document must not overflow horizontally');
      assert(['auto','scroll'].includes(before.contentOverflowY), 'Modal content must remain vertically scrollable');
      await page.evaluate(() => { const c=document.querySelector('#addModal .modal-content'); c.scrollTop=c.scrollHeight; });
      await page.locator('#addModal button[onclick="addNewStudent()"]') .scrollIntoViewIfNeeded();
      const after = await page.evaluate(() => {
        const save = document.querySelector('#addModal button[onclick="addNewStudent()"]');
        const r=save.getBoundingClientRect(); const x=r.x+r.width/2, y=r.y+r.height/2;
        const hit=document.elementFromPoint(x,y);
        return { rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}, hitIsSave: hit===save || save.contains(hit) };
      });
      assert(after.rect.y >= -0.5 && after.rect.bottom <= height + 0.5, 'Save button must be reachable in viewport after scroll');
      assert(after.rect.x >= -0.5 && after.rect.right <= width + 0.5, 'Save button must fit viewport');
      assert(after.hitIsSave, 'Bottom navigation/overlay must not cover Save button');
      results.push({ size: `${width}x${height}`, result: 'PASS', before, after });
      console.log(`PASS Admission modal ${width}x${height}: visible, scrollable, no horizontal overflow, save usable`);
    } catch (error) {
      results.push({ size: `${width}x${height}`, result: 'FAIL', error: error.message });
      console.error(`FAIL Admission modal ${width}x${height}: ${error.message}`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
const failures = results.filter(x => x.result === 'FAIL');
fs.mkdirSync(path.join(root, 'evidence', 'R1_2C'), { recursive: true });
fs.writeFileSync(path.join(root, 'evidence', 'R1_2C', 'ADMISSION_MODAL_MOBILE.json'), JSON.stringify({ results }, null, 2));
console.log(`R1.2C ADMISSION MOBILE: ${results.length - failures.length} PASS / ${failures.length} FAIL`);
if (failures.length) process.exitCode = 1;

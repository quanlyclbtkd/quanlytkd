/**
 * tools/local-server.mjs — Phase 4.0B-4A Local HTTP Server
 * ──────────────────────────────────────────────────────────
 * Chạy static HTTP server tại project root để test app qua HTTP.
 * ES modules CORS policy yêu cầu HTTP — không thể dùng file://.
 *
 * Dùng:
 *   node tools/local-server.mjs           # mặc định port 8000
 *   node tools/local-server.mjs 3000      # port tùy chỉnh
 *
 * Sau đó mở: http://localhost:8000
 */

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');
const PORT  = parseInt(process.argv[2] || process.env.PORT || '8000', 10);

// MIME types map
const MIME_TYPES = {
    '.html':  'text/html; charset=utf-8',
    '.css':   'text/css; charset=utf-8',
    '.js':    'application/javascript; charset=utf-8',
    '.mjs':   'application/javascript; charset=utf-8',
    '.json':  'application/json; charset=utf-8',
    '.png':   'image/png',
    '.jpg':   'image/jpeg',
    '.jpeg':  'image/jpeg',
    '.gif':   'image/gif',
    '.svg':   'image/svg+xml',
    '.ico':   'image/x-icon',
    '.woff':  'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':   'font/ttf',
    '.txt':   'text/plain; charset=utf-8',
    '.map':   'application/json; charset=utf-8',
};

function getMime(filePath) {
    return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

const server = createServer((req, res) => {
    // CORS headers — cần thiết cho ES module imports
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
    }

    // Parse URL — bỏ query string
    let urlPath = req.url.split('?')[0].split('#')[0];

    // Decode URL
    try { urlPath = decodeURIComponent(urlPath); } catch { /* keep as-is */ }

    // Ngăn path traversal
    const absPath = resolve(ROOT, '.' + urlPath);
    if (!absPath.startsWith(ROOT)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    // Tìm file để serve
    let filePath = absPath;

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        // Thư mục → thử index.html
        filePath = join(filePath, 'index.html');
    }

    if (!existsSync(filePath)) {
        // SPA fallback: trả về index.html
        const indexFallback = join(ROOT, 'index.html');
        if (existsSync(indexFallback)) {
            filePath = indexFallback;
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`404 Not Found: ${urlPath}`);
            return;
        }
    }

    try {
        const content  = readFileSync(filePath);
        const mimeType = getMime(filePath);
        res.writeHead(200, {
            'Content-Type':   mimeType,
            'Content-Length': content.length,
        });
        if (req.method === 'HEAD') { res.end(); return; }
        res.end(content);
        console.log(`  [200] ${req.method} ${urlPath}`);
    } catch (e) {
        console.error(`  [500] ${urlPath} — ${e.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log(`║  Local server running at http://localhost:${PORT}  ║`);
    console.log('║                                                  ║');
    console.log('║  Phục vụ:  app.js, js/main.js, style.css        ║');
    console.log('║  Root:     ' + ROOT.padEnd(38) + '║');
    console.log('║                                                  ║');
    console.log('║  Ctrl+C để dừng server                          ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`[LocalServer] ❌ Port ${PORT} đã bị dùng.`);
        console.error(`              Thử port khác: node tools/local-server.mjs 8001`);
    } else {
        console.error('[LocalServer] ❌ Lỗi server:', e.message);
    }
    process.exit(1);
});

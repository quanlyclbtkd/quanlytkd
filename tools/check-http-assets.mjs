/**
 * tools/check-http-assets.mjs — Phase 4.0B-4A HTTP Asset Checker
 * ────────────────────────────────────────────────────────────────
 * Kiểm tra các asset quan trọng qua HTTP — đảm bảo không có 404.
 * Cần chạy local server trước: npm run local
 *
 * Dùng:
 *   node tools/check-http-assets.mjs http://localhost:8000
 *   node tools/check-http-assets.mjs https://your-app.web.app
 *
 * Exit code:
 *   0 — tất cả asset trả 200
 *   1 — có asset trả 404 hoặc lỗi kết nối
 */

import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';

const baseUrl = process.argv[2];

if (!baseUrl) {
    console.error('[HttpAssetCheck] Dùng: node tools/check-http-assets.mjs http://localhost:8000');
    process.exit(1);
}

// Loại bỏ trailing slash
const BASE = baseUrl.replace(/\/$/, '');

// Danh sách asset cần kiểm tra
const ASSETS = [
    { path: '/app.js',                      required: true,  desc: 'Legacy core' },
    { path: '/js/main.js',                  required: true,  desc: 'ES module layer' },
    { path: '/js/modules/superadmin.js',    required: true,  desc: 'SuperAdmin module' },
    { path: '/js/modules/reports.js',       required: true,  desc: 'Reports module' },
    { path: '/js/modules/students.js',      required: true,  desc: 'Students module' },
    { path: '/js/modules/finance.js',       required: true,  desc: 'Finance module' },
    { path: '/js/modules/inventory.js',     required: true,  desc: 'Inventory module' },
    { path: '/js/modules/attendance.js',    required: true,  desc: 'Attendance module' },
    { path: '/js/modules/dashboard.js',     required: true,  desc: 'Dashboard module' },
    { path: '/style.css',                   required: true,  desc: 'Stylesheet' },
    { path: '/',                            required: true,  desc: 'index.html (root)' },
];

let errors  = 0;
let checked = 0;

// ── HTTP/HTTPS request helper ────────────────────────────────────
function fetchStatus(url) {
    return new Promise((resolve, reject) => {
        const parsed   = new URL(url);
        const reqFn    = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
        const options  = {
            hostname: parsed.hostname,
            port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path:     parsed.pathname + parsed.search,
            method:   'HEAD',
            timeout:  8000,
        };
        const req = reqFn(options, (res) => {
            // Drain response
            res.resume();
            resolve(res.statusCode);
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout sau 8 giây'));
        });
        req.on('error', reject);
        req.end();
    });
}

// ── Main ─────────────────────────────────────────────────────────
console.log(`[HttpAssetCheck] Kiểm tra assets tại: ${BASE}`);
console.log('');

for (const asset of ASSETS) {
    const url = BASE + asset.path;
    checked++;
    try {
        const status = await fetchStatus(url);
        if (status === 200 || status === 204) {
            console.log(`[HttpAssetCheck] ✅ ${status}  ${asset.path}  (${asset.desc})`);
        } else if (status === 301 || status === 302 || status === 308) {
            console.log(`[HttpAssetCheck] ↪️  ${status}  ${asset.path}  (redirect — OK cho SPA)`);
        } else if (status === 404) {
            if (asset.required) {
                console.error(`[HttpAssetCheck] ❌ 404  ${asset.path}  ← ${asset.desc} NOT FOUND`);
                if (asset.path === '/js/main.js') {
                    console.error('                 main.js not found — check Firebase Hosting public root or local server root.');
                }
                errors++;
            } else {
                console.warn(`[HttpAssetCheck] ⚠️  404  ${asset.path}  (optional — không bắt buộc)`);
            }
        } else {
            if (asset.required) {
                console.error(`[HttpAssetCheck] ❌ ${status}  ${asset.path}  ← unexpected status`);
                errors++;
            } else {
                console.warn(`[HttpAssetCheck] ⚠️  ${status}  ${asset.path}  (unexpected)`);
            }
        }
    } catch (e) {
        if (asset.required) {
            console.error(`[HttpAssetCheck] ❌ ERR  ${asset.path}  ← ${e.message}`);
            if (e.message.includes('ECONNREFUSED')) {
                console.error(`                 Kết nối bị từ chối — server chưa chạy? Thử: npm run local`);
            }
            errors++;
        } else {
            console.warn(`[HttpAssetCheck] ⚠️  ERR  ${asset.path}  (${e.message})`);
        }
    }
}

// ── Kết quả ──────────────────────────────────────────────────────
console.log('');
console.log(`[HttpAssetCheck] Đã kiểm tra: ${checked} assets tại ${BASE}`);

if (errors > 0) {
    console.error(`[HttpAssetCheck] ❌ FAILED — ${errors} asset(s) trả lỗi.`);
    process.exit(1);
} else {
    console.log('[HttpAssetCheck] ✅ OK — Tất cả assets đều accessible qua HTTP.');
    process.exit(0);
}

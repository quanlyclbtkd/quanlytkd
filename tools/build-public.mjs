#!/usr/bin/env node
/**
 * Phase 4K-6V4B — Build a minimal Firebase Hosting public directory.
 * Prevents internal reports, tools, rules and package metadata from being published.
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');
const entries = ['index.html', 'app.js', 'style.css', '.nojekyll', 'js', 'css'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const entry of entries) {
  const src = join(root, entry);
  const dest = join(out, entry);
  if (!existsSync(src)) throw new Error(`Missing runtime asset: ${entry}`);
  cpSync(src, dest, { recursive: statSync(src).isDirectory() });
}

console.log(`[BuildPublic] Built ${out}`);
console.log(`[BuildPublic] Included only: ${entries.join(', ')}`);

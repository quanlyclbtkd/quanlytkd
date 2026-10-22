// Offline cache graph. Parse code; never replace comments or arbitrary strings.
import fs from 'node:fs';
import path from 'node:path';
import {parse} from './vendor/acorn.mjs';

const origin = 'https://cutover.invalid/';
const need = (ok, code) => { if (!ok) throw Object.assign(Error(code), {code}); };
function walk(node, visit) {
 if (!node || typeof node !== 'object') return;
 if (typeof node.type === 'string') visit(node);
 for (const [key, value] of Object.entries(node)) {
  if (key === 'start' || key === 'end') continue;
  if (Array.isArray(value)) value.forEach(child => walk(child, visit));
  else if (value && typeof value === 'object') walk(value, visit);
 }
}
function literal(node) {
 if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
 if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
 return null;
}
function codeReferences(text, offset = 0, sourceType = 'module') {
 const refs = [], ast = parse(text, {ecmaVersion:'latest', sourceType});
 const add = (node, kind) => {
  const url = literal(node);
  need(url !== null, 'NON_LITERAL_MODULE_IMPORT');
  refs.push({url, kind, start:node.start + offset, end:node.end + offset, quoted:true});
 };
 walk(ast, node => {
  if (['ImportDeclaration','ExportAllDeclaration','ExportNamedDeclaration'].includes(node.type) && node.source) add(node.source, 'static');
  if (node.type === 'ImportExpression') add(node.source, 'dynamic');
  if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' &&
      ((!node.left.computed && node.left.property.name === 'src') || literal(node.left.property) === 'src')) {
   const value = literal(node.right);
   if (value && /\.m?js(?:[?#]|$)/i.test(value)) add(node.right, 'script-loader');
  }
 });
 return refs;
}
function htmlReferences(text) {
 const refs = [];
 const visible = text.replace(/<!--[\s\S]*?-->/g, comment => ' '.repeat(comment.length));
 // The pinned HTML entry uses script elements and literal script-loader assignments.
 for (const match of visible.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  const attrs = match[1], src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(attrs);
  if (src) {
   const start = match.index + match[0].indexOf(attrs) + src.index + src[0].indexOf(src[2]);
   refs.push({url:src[2], kind:'html-script', start, end:start + src[2].length, quoted:false});
  } else if (match[2].trim() && !/\btype\s*=\s*["'](?:application\/ld\+json|importmap)["']/i.test(attrs)) {
   const offset = match.index + match[0].indexOf('>') + 1;
   refs.push(...codeReferences(match[2], offset, /\btype\s*=\s*["']module["']/i.test(attrs) ? 'module' : 'script'));
  }
 }
 return refs;
}
function resolveTarget(from, url) {
 if (/^(?:https?:|data:|blob:|\/\/)/i.test(url)) return null;
 need(!/^[a-z]+:/i.test(url), 'UNSUPPORTED_IMPORT_PROTOCOL');
 const parsed = new URL(url, new URL(from, origin));
 need(parsed.origin === new URL(origin).origin, 'IMPORT_OUTSIDE_ROOT');
 const target = decodeURIComponent(parsed.pathname.slice(1));
 need(target && !target.split('/').includes('..') && !target.includes('\\'), 'IMPORT_OUTSIDE_ROOT');
 return target;
}
export function buildImportGraph(root, overrides = {}) {
 const read = file => Object.hasOwn(overrides, file) ? overrides[file] : fs.readFileSync(path.join(root,file), 'utf8');
 const queue = ['index.html'], visited = new Set(), edges = [];
 while (queue.length) {
  const file = queue.shift();
  if (visited.has(file)) continue;
  if (!Object.hasOwn(overrides,file) && !fs.existsSync(path.join(root,file))) throw Object.assign(Error('IMPORT_TARGET_MISSING: ' + file),{code:'IMPORT_TARGET_MISSING'});
  visited.add(file);
  const text = read(file), refs = file === 'index.html' ? htmlReferences(text) : codeReferences(text);
  for (const ref of refs) {
   // DOM script.src is relative to the document, while ESM specifiers are
   // relative to the importing module (including its cache query).
   const target = resolveTarget(ref.kind === 'script-loader' ? 'index.html' : file, ref.url);
   edges.push({from:file, to:target, ...ref});
   if (target) queue.push(target);
  }
 }
 return {entry:'index.html', files:[...visited].sort(), edges};
}
export const AUTHORITY_SEEDS = Object.freeze([
 'app.js','js/firebase/config.js','js/core/attendanceContract.js','js/data/attendanceJournal.js',
 'js/core/coachBranchRuntimeRepair.js','js/core/roleReadBoundary.js',
 'js/listeners/profiles.listeners.js','js/services/students.service.js','js/events/attendance.events.js',
 'js/modules/attendance.js','js/services/attendance.service.js',
 'js/modules/reports/reportExportFacade.js','js/modules/reports/attendanceExcelReport.js'
]);
export function affectedModules(graph) {
 const scope = new Set(AUTHORITY_SEEDS);
 need(AUTHORITY_SEEDS.every(file => graph.files.includes(file)), 'AUTHORITY_MODULE_UNREACHABLE');
 let changed;
 do {
  changed = false;
  for (const edge of graph.edges) if (scope.has(edge.to) && !scope.has(edge.from)) {
   scope.add(edge.from); changed = true;
  }
 } while (changed);
 return [...scope].sort();
}
function withToken(url, tag) {
 const [base, fragment] = url.split('#'), index = base.indexOf('?');
 const pathname = index < 0 ? base : base.slice(0,index);
 const params = new URLSearchParams(index < 0 ? '' : base.slice(index + 1));
 params.set('v',tag);
 return pathname + '?' + params.toString() + (fragment === undefined ? '' : '#' + fragment);
}
export function cacheToken(url) { return new URL(url,origin).searchParams.get('v'); }
export function buildTag(text) {
 const matches = [];
 walk(parse(text,{ecmaVersion:'latest',sourceType:'module'}), node => {
  if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' &&
      node.left.object.name === 'window' && !node.left.computed && node.left.property.name === 'APP_BUILD_VERSION') matches.push(node.right);
 });
 need(matches.length === 1 && literal(matches[0]), 'SOURCE_BUILD_TAG_INVALID');
 return {tag:literal(matches[0]), start:matches[0].start, end:matches[0].end};
}
export function rewriteCacheGraph(root, initialOverrides, tag) {
 const before = buildImportGraph(root), scope = affectedModules(before), scoped = new Set(scope);
 const overrides = {...initialOverrides};
 // Re-parse after config/contract edits so every replacement uses current offsets.
 const working = buildImportGraph(root,overrides);
 for (const file of scope) {
  const text = Object.hasOwn(overrides,file) ? overrides[file] : fs.readFileSync(path.join(root,file),'utf8');
  const replacements = working.edges.filter(edge => edge.from === file && scoped.has(edge.to)).map(edge => ({
   start:edge.start, end:edge.end,
   value:edge.quoted ? JSON.stringify(withToken(edge.url,tag)) : withToken(edge.url,tag)
  }));
  if (file === 'js/main.js') {
   const identity = buildTag(text);
   replacements.push({start:identity.start,end:identity.end,value:JSON.stringify(tag)});
  }
  let next = text;
  for (const replacement of replacements.sort((a,b) => b.start - a.start)) next = next.slice(0,replacement.start) + replacement.value + next.slice(replacement.end);
  if (next !== fs.readFileSync(path.join(root,file),'utf8')) overrides[file] = next;
  else delete overrides[file]; // Drop an input override when the derived bytes already equal disk.
 }
 const after = buildImportGraph(root,overrides);
 assertCacheGraph(after,scope,tag);
 return {overrides,graph:{before,after,scope,token:tag}};
}
export function assertCacheGraph(graph, scope, token) {
 const scoped = new Set(scope), relevant = graph.edges.filter(edge => scoped.has(edge.to));
 need(relevant.length > 0 && relevant.every(edge => cacheToken(edge.url) === token), 'STALE_AUTHORITY_IMPORT');
 need(scope.every(file => graph.files.includes(file)), 'AUTHORITY_MODULE_UNREACHABLE');
 return true;
}

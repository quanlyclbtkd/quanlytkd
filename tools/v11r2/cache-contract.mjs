import fs from 'node:fs';
import path from 'node:path';
import {buildImportGraph,affectedModules,assertCacheGraph,buildTag} from './import-graph.mjs';
export function attendanceCacheChain(root=process.cwd()) {
 try {
  const tag=buildTag(fs.readFileSync(path.join(root,'js/main.js'),'utf8')).tag;
  if (!/^qr-v11r6-active-20261022-[0-9a-f]{12}(?:-hold)?$/.test(tag)) return false;
  const graph=buildImportGraph(root);
  return assertCacheGraph(graph,affectedModules(graph),tag);
 } catch { return false; }
}

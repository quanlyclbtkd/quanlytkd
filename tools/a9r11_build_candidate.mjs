import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { rewriteCacheGraph } from './v11r2/import-graph.mjs';

const root = process.cwd();
const contractPath = path.join(root,'js/core/attendanceContract.js');
const rulesPath = path.join(root,'firestore.rules');
const oldContract = fs.readFileSync(contractPath,'utf8');
const oldRules = fs.readFileSync(rulesPath,'utf8');
const oldAuthority = oldContract.match(/export const HISTORY_AUTHORITY = '([^']+)'/)?.[1];
if (!oldAuthority) throw new Error('old authority missing');
const authority = 'attendance-history-' + crypto.randomUUID();
const tag = 'qr-v11r6-a9r11-coach-attendance-operational-20261024';
let contract = oldContract
  .replace("// One persisted attendance contract. Keep this authority ID stable after deploy.\n// Default TEST ONLY build stays in maintenance until the signed cutover gate is satisfied.\n", "// A9R11 forward-only Coach Attendance authority. Keep this ID stable after deployment.\n// Historical rows from earlier builds remain Admin-visible but are not promoted into Coach authority.\n")
  .replace(oldAuthority, authority)
  .replace('export const HISTORY_COACH_ACCESS = false;', 'export const HISTORY_COACH_ACCESS = true;')
  .replace("export const JOURNAL_DATABASE = 'tst-attendance-journal-v3';", "export const JOURNAL_DATABASE = 'tst-attendance-journal-v4';");
if (contract === oldContract) throw new Error('contract unchanged');
let rules = oldRules
  .replace(/(function coachAttendanceCutoverOpen\(\)\s*\{\s*return )false(;\s*\})/, '$1true$2')
  .replaceAll(oldAuthority, authority)
  .replace('// V11R2 default maintenance profile. The offline cutover gate alone\n        // may generate an active candidate after owner approval + zero cohort.', '// A9R11 forward-only Coach Attendance activation. Old authority rows remain\n        // outside Coach visibility; only rows written with the new authority are mutable by Coach.');
if (rules === oldRules) throw new Error('rules unchanged');
const {overrides, graph} = rewriteCacheGraph(root, {'js/core/attendanceContract.js':contract}, tag);
for (const [file,text] of Object.entries(overrides)) {
  fs.writeFileSync(path.join(root,file),text,'utf8');
}
fs.writeFileSync(rulesPath,rules,'utf8');
const publicRoot = path.join(root,'public');
for (const file of Object.keys(overrides)) {
  const src=path.join(root,file), dst=path.join(publicRoot,file);
  if (fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.copyFileSync(src,dst); }
}
// firestore.rules is deployment config, not public runtime.
const manifest={authority,oldAuthority,journal:'tst-attendance-journal-v4',tag,changedRuntimeFiles:Object.keys(overrides).sort(),cacheScope:graph.scope};
fs.mkdirSync(path.join(root,'evidence/A9R11'),{recursive:true});
fs.writeFileSync(path.join(root,'evidence/A9R11/A9R11_BUILD_MANIFEST.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));

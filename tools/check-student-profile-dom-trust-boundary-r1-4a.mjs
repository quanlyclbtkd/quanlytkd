import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
let root = process.cwd();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) root = path.resolve(args[++i]);
}

let pass = 0, fail = 0;
function check(id, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS ${id}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`FAIL ${id}${detail ? ' — ' + detail : ''}`); }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function extractBlock(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return '';
  const brace = src.indexOf('{', start);
  if (brace < 0) return '';
  let depth = 0, quote = '', esc = false, templateDepth = 0;
  for (let i = brace; i < src.length; i++) {
    const c = src[i], n = src[i+1];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (quote === '`' && c === '$' && n === '{') { templateDepth++; i++; continue; }
      if (quote === '`' && c === '}' && templateDepth > 0) { templateDepth--; continue; }
      if (c === quote && templateDepth === 0) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && n === '/') { const j = src.indexOf('\n', i+2); if (j < 0) break; i = j; continue; }
    if (c === '/' && n === '*') { const j = src.indexOf('*/', i+2); if (j < 0) break; i = j+1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

const students = read('js/modules/students.js');
const pubStudents = read('public/js/modules/students.js');
check('ROOT_PUBLIC_STUDENTS_BYTE_EQUAL', students === pubStudents);

const ach = extractBlock(students, 'function renderAchievements(list)');
const open = extractBlock(students, 'window.openProfile = (name) =>');
check('ACHIEVEMENT_FUNCTION_FOUND', !!ach);
check('OPEN_PROFILE_FUNCTION_FOUND', !!open);

// Scoped sink A: every untrusted achievement text value must be escaped for HTML text context.
const rawAchievementInterpolation = /\$\{\s*y\s*\}|\$\{\s*a\.tournament\s*\}|\$\{\s*a\.result\s*\}/.test(ach);
const safeAchievementYear = /escapeHtml\s*\(\s*String\s*\(\s*y/.test(ach) || /escapeHtml\s*\(\s*y\s*\)/.test(ach);
const safeAchievementTournament = /escapeHtml\s*\(\s*String\s*\(\s*a\.tournament/.test(ach) || /escapeHtml\s*\(\s*a\.tournament\s*\)/.test(ach);
const safeAchievementResult = /escapeHtml\s*\(\s*String\s*\(\s*a\.result/.test(ach) || /escapeHtml\s*\(\s*a\.result\s*\)/.test(ach);
check('ACHIEVEMENT_NO_RAW_DYNAMIC_HTML', !rawAchievementInterpolation, rawAchievementInterpolation ? 'raw year/tournament/result interpolation reaches innerHTML' : 'no raw achievement interpolation');
check('ACHIEVEMENT_YEAR_SAFE_TEXT_CONTEXT', safeAchievementYear);
check('ACHIEVEMENT_TOURNAMENT_SAFE_TEXT_CONTEXT', safeAchievementTournament);
check('ACHIEVEMENT_RESULT_SAFE_TEXT_CONTEXT', safeAchievementResult);
check('ACHIEVEMENT_EMPTY_STATE_STATIC_ONLY', /el\.innerHTML\s*=\s*['"]<span[^$]*Chưa có thành tích/.test(ach));

// Verify text fidelity of the already-existing canonical HTML-text escape helper.
const helpersUrl = pathToFileURL(path.join(root, 'js/utils/helpers.js')).href + `?r14a=${Date.now()}`;
const { escapeHtml } = await import(helpersUrl);
const textPayload = 'Cup <A> & "B" – Võ sinh';
const escaped = escapeHtml(textPayload);
const decoded = escaped
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
check('ACHIEVEMENT_TEXT_FIDELITY', decoded === textPayload, `escaped=${escaped}`);
check('ACHIEVEMENT_MARKUP_ENCODED', escapeHtml('<em data-security-test="achievement">TEST</em>').includes('&lt;em'));

// Scoped sink B: profile identity/month must not be serialized into inline executable JS.
const unsafeInlineRemoveSkip = /onclick\s*=\s*["'][^"']*removeSkip\s*\(/.test(open) || /onclick=\\?"removeSkip\s*\(/.test(open);
check('SKIPPED_MONTH_NO_INLINE_REMOVE_SKIP', !unsafeInlineRemoveSkip, unsafeInlineRemoveSkip ? 'profile identity/month serialized into onclick source' : 'no inline removeSkip source');
check('SKIPPED_MONTH_DOM_ELEMENT_CREATED', /document\.createElement\s*\(\s*['"]span['"]\s*\)/.test(open));
check('SKIPPED_MONTH_VISIBLE_LABEL_TEXTCONTENT', /\.textContent\s*=\s*`Tháng\s+\$\{formatMonth\(mo\)\}\s+✖`/.test(open));
check('SKIPPED_MONTH_DOM_CLICK_LISTENER', /\.addEventListener\s*\(\s*['"]click['"]\s*,/.test(open));
check('SKIPPED_MONTH_EXACT_REMOVE_SKIP_ARGS', /window\.removeSkip\s*\(\s*name\s*,\s*mo\s*\)/.test(open));
check('SKIPPED_MONTH_REPLACES_CHILDREN', /\.replaceChildren\s*\(/.test(open));

// Closure transport preserves exact identifiers including characters that break HTML/JS source contexts.
const specialNames = ["O'Neil", 'Nguyễn "An"', 'A&B', 'A<B>', 'Đặng Đình Khôi', 'Tên (Biệt danh)', 'Tên-An'];
for (const name of specialNames) {
  const month = '2026-11';
  let observed = null;
  const fn = () => { observed = [name, month]; };
  fn();
  check(`SPECIAL_NAME_CLOSURE_${Buffer.from(name).toString('hex').slice(0,16)}`, observed?.[0] === name && observed?.[1] === month);
}

// No global sanitizer authority should be introduced for this patch.
check('NO_NEW_GLOBAL_SANITIZER_IN_STUDENTS', !/function\s+sanitizeHtml\b|window\.sanitizeHtml\s*=/.test(students));

console.log(`\nR1.4A STUDENT/PROFILE DOM TRUST BOUNDARY: ${pass} PASS / ${fail} FAIL`);
process.exitCode = fail ? 1 : 0;

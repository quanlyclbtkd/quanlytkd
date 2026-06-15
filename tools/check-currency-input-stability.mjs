/**
 * Phase 4K-6Q — Currency Input Stability Gate
 * Verifies caret-safe pure helpers and binding guards in legacy app.js.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const checks = [];
function check(label, condition) {
  checks.push({ label, condition: Boolean(condition) });
  console.log(`${condition ? '✅' : '❌'} ${label}`);
}

check('4K-6Q currency marker exists', /Phase 4K-6Q — Currency Input Stability/.test(app));
check('duplicate listener binding is guarded', /dataset\.currencyInputBound\s*===\s*['"]1['"]/.test(app));
check('numeric input mode is assigned', /inputMode\s*=\s*['"]numeric['"]/.test(app));
check('caret digit count is captured', /digitsBeforeCaret/.test(app));
check('selection is restored safely', /setSelectionRange\(nextCaret,\s*nextCaret\)/.test(app));
check('IME composition is guarded', /compositionstart/.test(app) && /compositionend/.test(app));
check('hidden actual value receives normalized digits', /a\.value\s*=\s*digits/.test(app));

const pureBlockMatch = app.match(/const _normalizeCurrencyDigits[\s\S]*?const _currencyCaretFromDigitCount[\s\S]*?\n    };/);
check('pure currency helper block can be extracted', Boolean(pureBlockMatch));

if (pureBlockMatch) {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${pureBlockMatch[0]}\nthis.normalize=_normalizeCurrencyDigits;this.format=_formatCurrencyDigits;this.caret=_currencyCaretFromDigitCount;`, sandbox);
  check('300000 formats as 300.000', sandbox.format(sandbox.normalize('300000')) === '300.000');
  check('formatted paste normalizes correctly', sandbox.normalize('1.250.000 đ') === '1250000');
  check('leading zero normalization is stable', sandbox.normalize('000300000') === '300000');
  check('caret after third digit is preserved', sandbox.caret('3.050.000', 3) === 4);
}

const failed = checks.filter((item) => !item.condition);
if (failed.length) {
  console.error(`\ncheck-currency-input-stability FAILED (${failed.length}/${checks.length})`);
  process.exit(1);
}
console.log(`\ncheck-currency-input-stability PASS (${checks.length}/${checks.length})`);

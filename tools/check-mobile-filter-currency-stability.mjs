import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const index = readFileSync('index.html', 'utf8');
const app = readFileSync('app.js', 'utf8');
const style = readFileSync('style.css', 'utf8');

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`✅ ${label}`);
  else {
    failures++;
    console.error(`❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n🔎 Phase 4K-6Q — Mobile Filter + Currency Stability Check\n');

check('index has 4K-6Q responsive filter patch', index.includes('Phase 4K-6Q: Mobile Filter Responsive Stability'));
check('style.css mirrors responsive filter patch', style.includes('Phase 4K-6Q: Mobile Filter Responsive Stability'));
check('filter grid uses minmax(0, 1fr)', /#filterArea\s*\{[^}]*minmax\(0,\s*1fr\)[^}]*minmax\(0,\s*1fr\)/s.test(index));
check('filter children can shrink', /#filterArea\s*>\s*div\s*\{[^}]*min-width:\s*0/s.test(index));
check('filter controls are explicitly border-box and width constrained', /#filterArea input,[\s\S]*#filterArea select\s*\{[^}]*box-sizing:\s*border-box[^}]*min-width:\s*0[^}]*max-width:\s*100%/s.test(index));
check('very narrow phones collapse filter to one column', /@media\s*\(max-width:\s*359px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s.test(index));
check('default tuition input requests numeric keyboard', /id="add_fee_default_display"[^>]*inputmode="numeric"/.test(index));
check('default tuition input disables autocomplete', /id="add_fee_default_display"[^>]*autocomplete="off"/.test(index));

check('app has currency stability marker', app.includes('Phase 4K-6Q — Currency Input Stability'));
check('currency formatting avoids Number/parseInt round-trip', app.includes("normalized.replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.')"));
check('currency binding has duplicate-listener guard', app.includes('const _currencyInputBindings = new WeakSet()') && app.includes('_currencyInputBindings.has(d)'));
check('currency input preserves caret', app.includes('_countDigitsBeforeCaret') && app.includes('_caretAfterDigitCount') && app.includes('setSelectionRange'));
check('currency input is composition-safe', app.includes("addEventListener('compositionstart'") && app.includes("addEventListener('compositionend'"));
check('patch version marker exists', app.includes("APP_PATCH_VERSION = '4K-6Q-mobile-filter-currency-stability-20260615'"));

// Runtime behavior test: execute only the currency helper block with a tiny fake DOM.
const start = app.indexOf('/* Phase 4K-6Q — Currency Input Stability');
const end = app.indexOf('window.calcInv =', start);
check('currency helper block can be extracted', start >= 0 && end > start);

if (start >= 0 && end > start) {
  class FakeInput {
    constructor(value = '') {
      this.value = value;
      this.selectionStart = value.length;
      this.selectionEnd = value.length;
      this.attrs = new Map();
      this.listeners = new Map();
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    dispatch(type) {
      for (const fn of this.listeners.get(type) || []) fn({ target: this, type });
    }
    setSelectionRange(startPos, endPos) {
      this.selectionStart = startPos;
      this.selectionEnd = endPos;
    }
  }

  const display = new FakeInput('');
  const actual = new FakeInput('');
  const elements = { display, actual };
  const document = {
    activeElement: display,
    getElementById(id) { return elements[id] || null; }
  };
  let callbackCount = 0;
  const context = { document, WeakSet, String, Number, Math, console };
  vm.createContext(context);
  const helperSource = app.slice(start, end) + '\n' +
    'globalThis.__bind = formatCurrencyInput; globalThis.__fmt = _formatCurrencyDigits;';
  vm.runInContext(helperSource, context);
  context.__bind('display', 'actual', () => { callbackCount++; });
  context.__bind('display', 'actual', () => { callbackCount += 1000; }); // must be ignored

  function insertChar(ch) {
    const pos = display.selectionStart;
    display.value = display.value.slice(0, pos) + ch + display.value.slice(pos);
    display.selectionStart = display.selectionEnd = pos + ch.length;
    display.dispatch('input');
  }

  for (const ch of '300000') insertChar(ch);
  check('typing 300000 renders 300.000', display.value === '300.000', `got ${display.value}`);
  check('hidden raw tuition stays 300000', actual.value === '300000', `got ${actual.value}`);
  check('caret remains at logical end', display.selectionStart === display.value.length, `caret ${display.selectionStart}`);
  check('duplicate binding did not duplicate callback', callbackCount === 6, `callbacks ${callbackCount}`);

  display.selectionStart = display.selectionEnd = 1;
  insertChar('5');
  check('middle edit keeps correct formatted value', display.value === '3.500.000', `got ${display.value}`);
  check('middle edit does not jump caret to end', display.selectionStart === 3, `caret ${display.selectionStart}, length ${display.value.length}`);

  const initialDisplay = new FakeInput('');
  const initialActual = new FakeInput('250000');
  elements.display2 = initialDisplay;
  elements.actual2 = initialActual;
  context.__bind('display2', 'actual2');
  check('stored raw value initializes display safely', initialDisplay.value === '250.000', `got ${initialDisplay.value}`);
  check('large digit strings format without floating-point conversion', context.__fmt('999999999999999999') === '999.999.999.999.999.999');
}

if (failures) {
  console.error(`\n❌ ${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('\n✅ Mobile filter and currency stability checks passed.\n');

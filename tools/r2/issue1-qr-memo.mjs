import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness, syntheticForUrl, decodePng} from '../qr-v7/harness.mjs';

const rows = [];
const h = await createHarness({providerBytes: syntheticForUrl});
const cases = [
  ['Vo Tan Hung','2026-09,2026-10,2026-11','Vo Tan Hung HP T9 T10 T11 2026'],
  ['VÕ TẤN HƯNG','2026-09,2026-10,2026-11','VO TAN HUNG HP T9 T10 T11 2026'],
  ['Vo Tan Hung','2026-11,2026-12,2027-01','Vo Tan Hung HP T11 T12 2026 T1 2027'],
  ['Vo Tan Hung','2026-09,2026-11','Vo Tan Hung HP T9 T11 2026'],
  ['Nguyễn Văn Khải Dương Tuấn','2026-09,2026-10','Nguyen Van Khai Duong Tuan HP T9T10 2026'],
];
for (const [name, months, expected] of cases) {
  const before = JSON.stringify(h.c.allProfiles);
  const result = await h.run('PHIẾU BÁO HỌC PHÍ','CS1',900000,months,name);
  assert.equal(result.ok,true,JSON.stringify(result));
  const memo = new URL(h.fetches.at(-1).url).searchParams.get('addInfo');
  assert.equal(memo, expected);
  assert(memo.length <= 40);
  const decoded = decodePng(Buffer.from(result.receiptImage.split(',')[1],'base64'));
  const emv = h.eval('_receiptDecodeEMV('+JSON.stringify(decoded.payload)+')');
  assert.equal(emv.memo,expected);
  assert.equal(emv.bankBin,'970422');
  assert.equal(emv.accountNo,'001234567890');
  assert.equal(Number(emv.amount),900000);
  assert(h.document.getElementById('r_type').innerText.includes('Nội dung CK: '+memo));
  assert.equal(h.writes.length,0);
  assert.equal(JSON.stringify(h.c.allProfiles),before);
  rows.push({nameCase:name === name.toUpperCase()?'uppercase':'preserve-input-case',months,memo,emv,financialWrites:0,status:'PASS'});
}
for (const months of ['2026-13','2026-09,2026-09','9/2026','garbage']) {
  assert.throws(()=>h.eval('_receiptTuitionMemo("Vo Tan Hung",'+JSON.stringify(months)+','+JSON.stringify('X'.repeat(41))+')'),e=>e.code==='MEMO_PERIOD_INVALID');
  rows.push({months,status:'PASS',result:'MEMO_PERIOD_INVALID'});
}
assert.equal(h.eval('_receiptTuitionMemo("A","2026-10","A HP 10 2026")'),'A HP 10 2026');
assert.throws(()=>h.eval('_receiptTuitionMemo("LONG TEST STUDENT WITH MANY NAMES EXTRA WORDS","2026-09,2026-10",'+JSON.stringify('X'.repeat(41))+')'),e=>e.code==='MEMO_TOO_LONG');
rows.push({case:'short unchanged; over-limit fails closed',status:'PASS'});
const report={status:'PASS',rows,independentPixelDecoder:'vendored jsQR',emvVerifier:'actual _receiptDecodeEMV CRC+TLV',transport:'synthetic bank QR fixture, no live bank service',financialWrites:h.writes.length};
if (process.env.R2_EVIDENCE) fs.writeFileSync(process.env.R2_EVIDENCE,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

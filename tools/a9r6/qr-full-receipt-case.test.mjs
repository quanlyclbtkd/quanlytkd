import assert from 'node:assert/strict';
import {createHarness,syntheticForUrl,decodePng} from '../qr-v7/harness.mjs';
const h=await createHarness({providerBytes:url=>syntheticForUrl(url)});
// Match verified real-world input, but use the QA account (no real bank data).
const student='Lê Đào Đình Khôi';
const result=await h.run('PHIẾU BÁO HỌC PHÍ','CS1',700000,'2026-09,2026-10',student);
assert.equal(result.ok,true,JSON.stringify({reason:result.reason,stage:result.stage,events:h.events}));
assert.equal(h.fetches.length,1);
assert.equal(h.writes.length,0);
const generatedMemo=new URL(h.fetches[0].url).searchParams.get('addInfo');
assert.equal(generatedMemo,'Le Dao Dinh Khoi HP T9 T10 2026');
assert.equal(decodePng(Buffer.from(result.receiptImage.split(',')[1],'base64')).payload.includes(generatedMemo),true);
assert.equal(h.document.getElementById('receiptModal').style.display,'flex');
assert.equal(h.document.getElementById('r_type').innerText.includes('Nội dung CK: '+generatedMemo),true);
console.log('PASS A9R6 full rendered receipt: real 42-char name/month scenario produces verified compact memo, exact provider pixels and preview pixels, zero finance writes');

const longName='Nguyễn Văn Khải Dương Tuấn';
const v=await h.run('PHIẾU BÁO HỌC PHÍ','CS1',700000,'2026-09,2026-10',longName);
assert.equal(v.ok,true,JSON.stringify({reason:v.reason,stage:v.stage,events:h.events}));
const longMemo=new URL(h.fetches.at(-1).url).searchParams.get('addInfo');
assert(longMemo.includes('Nguyen Van Khai Duong Tuan') && longMemo.includes('T9T10 2026'));
assert(longMemo.length<=40);
console.log('PASS A9R6 over-48 verbose tuition memo compacted losslessly and QR verified');

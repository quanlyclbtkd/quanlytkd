# A9R16A-R3 — Rollback độc lập

Không có migration hoặc thay đổi production data; rollback chỉ thay source. Không xóa attendance, profile, shift, IndexedDB hoặc Journal. Những bước dưới được kiểm tra trên bản sao độc lập, không deploy.

## Toàn bộ R3

Khôi phục đúng ZIP R2 SHA `b96b7e5fc9a77b119a8e696babddd5bbd87f0dda59bbaf8c1a0baf86f4699804`, hoặc reverse master patch trên source candidate sạch. Parent runtime phải về `93030b1d396b5c257b60d11a2c8a12f981cd967639fcc67603c90131c763e5fa`. Việc phát hành rollback trong một môi trường thật phải dùng cache identity mới, không reuse asset URL đã phục vụ nội dung khác.

## Chỉ rollback Issue2, giữ Issue1

Từ bản sao final sạch, ở root project:

```bash
git apply --reverse --check A9R16A_R3_ISSUE2_HISTORY_MOBILE.patch
git apply --reverse A9R16A_R3_ISSUE2_HISTORY_MOBILE.patch
```

Các source/tool trở lại checkpoint Issue1, runtime `aad301052815eb7968164fc2b2923e376580e0f39104dc48d45c8d99a45f417b`. Legacy-global compatibility vẫn còn. Modal trở lại UI cũ có lỗi đã biết.

Trước khi dùng bản rollback ở môi trường đã cache R3, đổi duy nhất `export const tag` trong `tools/a9r16r3/build.mjs` thành `qr-v11r6-a9r16a-r3-rollback-issue2-20261025`, rồi chạy canonical builder:

```bash
node tools/a9r16r3/build.mjs
node --input-type=module -e "import {verifyRuntimeProfile} from './tools/v11r2/runtime-profile.mjs'; console.log(verifyRuntimeProfile())"
```

Đã kiểm tra source pin/root-public/cache của bản sao đó; runtime `7c99c20f9136ae664c880e725fbe03a3a726e6d9de00d6573907823c86f6d6c4`. Đây không phải chứng nhận full regression/deploy của rollback.

## Chỉ rollback Issue1, giữ Issue2

Từ bản sao final sạch. Reverse đúng ba owner và public mirrors cùng hai expectation contract thuộc Issue1; giữ builder/lineage R3 và toàn bộ presentation Issue2:

```bash
git apply --reverse --check   --include=js/core/trainingRegistration.js   --include=public/js/core/trainingRegistration.js   --include=js/modules/students.js   --include=public/js/modules/students.js   --include=js/modules/attendance.js   --include=public/js/modules/attendance.js   --include=tools/a9r15/registration.test.mjs   --include=tools/check-attendance-explicit-shift-authority.mjs   A9R16A_R3_ISSUE1_SHIFT_COMPATIBILITY.patch
```

Sau khi `--check` đạt, chạy lại cùng lệnh bỏ riêng `--check`. Patch reverse đã được xác minh áp dụng được trên final dù attendance.js cũng có Issue2. Phần modal body mount, action slot, close chrome và synchronous open scroll reset vẫn còn; legacy-global read trở lại strict R2.

Đổi `export const tag` trong canonical builder thành `qr-v11r6-a9r16a-r3-rollback-issue1-20261025`, chạy builder và verifyRuntimeProfile như trên. Builder chuẩn hóa lại import graph/root-public và pin runtime thay đổi; không giữ manifest final trên bytes rollback. Runtime của bản sao đã kiểm tra: `a547a593f25003219a67d91ebeda97dbba9ae56108b811e9136ec095ab995c78`.

Rollback Issue1 chủ động tái lập lỗi tương thích ca cũ của R2; các positive legacy-global tests R3 không còn là acceptance expectation của bản rollback đó. Không sửa chúng để tuyên bố rollback đã giải quyết lỗi R3.

## Xác minh sau lựa chọn rollback

Chạy syntax, source identity, root/public, module identity, npm check/check:all và các test của issue còn giữ; kiểm tra Rules/indexes vẫn bằng parent và Journal/CAS/Finance guard còn nguyên. Chưa thực hiện một campaign full regression riêng cho hai bản rollback. `PATCH_AND_ROLLBACK_VALIDATION.json` trong RAW_LOGS ghi 15 kiểm tra apply/check/identity và việc giữ issue còn lại. Không deploy tự động.

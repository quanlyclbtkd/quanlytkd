# Rollback A9R16A-R3R1

Không xóa Firestore, profile, attendance, shift, IndexedDB, pending intents hoặc JournalV4. Không có migration trong phase này.

Trên bản sao source sạch, ở root project:

```bash
git apply --reverse --check A9R16A_R3_TO_R3R1.patch
git apply --reverse A9R16A_R3_TO_R3R1.patch
node --input-type=module -e "import{verifyRuntimeProfile}from'./tools/v11r2/runtime-profile.mjs';console.log(verifyRuntimeProfile())"
```

Đã kiểm tra toàn bộ file hashes về exact R3 runtime 950dde369575bd099170b86d6923063bf11ddf4f9ae6376c759a2ec680d1ea2d. Các thiếu sót R3 đã biết trở lại theo mục đích rollback.

Apply tuần tự LIFECYCLE → OPTIONAL_DAYS → CLUB_GATE, reverse theo thứ tự ngược, cũng đã được kiểm tra:

- Reverse CLUB_GATE: runtime a0aee3010f4bdcca9f8f47aefe3ff72dcec4cd7a45e61b06d6864e8cbd01f0ac.
- Reverse tiếp OPTIONAL_DAYS: runtime e9e3cf37550e360d4e6914dafeab1d85ffed09c8370699e510390a221077cb06.
- Reverse tiếp LIFECYCLE: exact R3 parent.

Mỗi bước chạy --check trước apply. Checkpoint giữa phase dùng cùng tag R3R1 vì chưa từng phát hành; một candidate rollback một phần phải dùng tag mới trong canonical builder, build lại pin/import graph/public và kiểm tra lại. Không phục vụ bytes checkpoint khác dưới URL final R3R1 đã cache.

PATCH_VALIDATION.json trong RAW_LOGS có24 check apply/reverse/identity/full file hashes. Đây là source verification, không phải acceptance/deploy mới cho rollback. Không deploy tự động.

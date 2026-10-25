# A9R15R1 — Cách kiểm chứng và đóng blocker còn lại

Trạng thái hiện tại: **RELEASE_BLOCKED**. Không deploy. Runtime giữ nguyên A9R15; R1 chỉ sửa harness, bổ sung test/audit ngoại tuyến và evidence.

## Chạy QA trên bản sao độc lập

Xác minh SHA và CRC ZIP trước. Giải nén sao cho `index.html`, `app.js`, `package.json` nằm ngay ở root. Không chạy build/cache-bust vì không có runtime thay đổi.

```powershell
npm.cmd ci --no-audit --no-fund
npm run check
npm run check:all
npm run check:a9r15-registration
npm run check:a9r15-source
node tools/a9r15r1/runtime-preservation.mjs
node tools/a9r15r1/login-read-counts.mjs
node tools/a9r15r1/registration-audit.mjs
```

Các browser gates cần Chromium do Playwright quản lý hoặc executable chỉ định trong `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Dùng `npx playwright install chromium` nếu máy chưa có browser. `node tools/a9r15r1/dom-oracle.test.mjs` đối chiếu shim với native browser. `npm run qa:a9r15-ui` chạy DOM thật. Với env `A9R15R1_EXTRA_OUTPUT=evidence/A9R15R1/EXTRA_BROWSER_MATRIX.json`, cùng browser harness chạy thêm race và page boundary controls.

Chạy Emulator bằng config demo có sẵn; chỉ dùng project `demo-*`, không trỏ production:

```powershell
npx firebase emulators:exec --only firestore --project demo-a9r15r1 --config firebase.a9r5.demo.json "npm run test:a9r15-emulator"
npx firebase emulators:exec --only firestore --project demo-a9r15r1 --config firebase.a9r5.demo.json "node tools/a9r15r1/negative-controls.mjs"
```

Giữ nguyên `check:all:critical`. B7/B6 và V10 có thể exit 1 vì hồ sơ phê duyệt chưa có; không đổi `pending` thành `approved`, không bỏ test. Evidence riêng ghi kết quả cả 159 leaf commands để gate chặn sớm không che kiểm tra sau.

## Audit dữ liệu thật: chưa thực hiện

Chỉ dùng export do Admin/owner cung cấp trong CLB test hoặc scope đã cho phép. Không lấy dữ liệu production trong audit này. Export phải lấy toàn bộ profile của scope, giữ canonical profile ID làm key, cùng **canonical settings/shifts.list** của đúng CLB. Nếu xuất qua ứng dụng, reuse canonical profile pagination và shifts loader hiện hữu; không thêm collection reader, listener hoặc writer. Không xuất theo roster đang lọc vì có thể bỏ sót inactive/nghỉ/orphan.

Đầu vào tối thiểu, không cần tên/SĐT/email/tài khoản ngân hàng:

```json
{
  "clubId": "AUTHORIZED_TEST_CLUB",
  "complete": true,
  "profiles": {
    "immutableProfileKey": {"branch":"CS1","trainingShiftId":"S01","trainingDays":[1,3,5]}
  },
  "shifts": [{"id":"S01","branch":"CS1"}]
}
```

Giữ nguyên format ngày canonical JS 0..6; không normalize trước audit. `complete:true` chỉ là khai báo bên xuất, phải kèm project/club/timestamp/phạm vi, số page/profile, query owner, xác nhận server snapshot và hash export để chứng minh completeness. Không dùng khai báo này thay bằng chứng live.

```powershell
node tools/a9r15r1/registration-audit.mjs --input authorized_export.json --club-id AUTHORIZED_TEST_CLUB --output real_audit.json
```

Công cụ import đúng validator runtime, chỉ đọc file; không có Firebase SDK/reader/writer/listener. Output tách fixture/real data, lưu input SHA và pseudonym P00001…, kiểm input không bị thay đổi. `reviewList` để Admin sửa thủ công qua form canonical sau review; công cụ không tạo migration. Giữ bản mapping profile ID riêng ở owner nếu cần đối soát pseudonym; output không chứa tên. Một export được audit không tự chứng minh toàn bộ production sạch.

## Query/index Cloud: chưa xác minh

Trong session Coach trên **môi trường test được cấp**, xác minh project, club, uid, assignment server và runtime hash trước. Mở UI hiện hữu, chọn branch được cấp, mở lịch sử, bấm `Tải thêm`. Quan sát chính `AttendanceService.loadMemberHistory(profileId, null, {page:true, branch, pageSize:40, cursor})` qua canonical owner; không tạo reader khác.

Shape bắt buộc: path `clubs/<club>/attendance`; `profileId == canonicalId`, `historyAuthority == attendance-history-1aedda93-9437-4132-9694-35c2e6234d55`, `branch == authorizedBranch`, `orderBy(documentId(),'asc')`, `limit(40)`, `startAfter(lastRawId)` ở page sau. Thực hiện riêng CS1 và CS2 bằng quyền hợp lệ; đo query/document counts và stale/revoke bằng test assignment được phép.

Ghi project/club/time, SDK version, exact constraints/cursor, success/error code, thông số index/link Firebase trả về (nếu có), và index readiness của **đúng project đó**. Chỉ khi Cloud trả `failed-precondition`/index specification mới chuẩn bị index tối thiểu. Không deploy hoặc tạo index trong phase này. Không sửa Rules để xử lý index. Emulator không track compound indexes: https://firebase.google.com/docs/emulator-suite/connect_firestore#how_the_cloud_firestore_emulator_differs_from_production

## Điều kiện xét release tiếp

1. Audit dataset thật đủ scope và Admin review các lỗi phát hiện.
2. Exact Cloud query/index readiness của đúng environment, cùng assignment/authority evidence.
3. Xác minh provenance của legacy nếu cần; raw legacy vẫn không Coach-visible, không tự promote authority.
4. Owner phê duyệt READS/cost bằng cơ chế hồ sơ hiện hữu; không sửa approval trong test.
5. Nghiệm thu Android/iOS vật lý, reload/offline/relogin, production-specific checks và release owner approval ở công việc riêng.

Các mục trên hiện chưa có bằng chứng; không được gọi R1 là staging/production candidate.

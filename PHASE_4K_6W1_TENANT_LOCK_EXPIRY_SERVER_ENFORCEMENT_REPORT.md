# Phase 4K-6W1 — Tenant Lock/Expiry Server Enforcement + Rules Emulator + Deployment Safety Gate

## 1. Mục tiêu

Phase 4K-6W1 hoàn thiện phần còn thiếu của 4K-6W: trạng thái khóa hoặc hết hạn của CLB phải được thực thi tại tầng Cloud Functions và Firestore Rules, không chỉ ở giao diện.

Phạm vi được giữ hẹp để tránh hồi quy:

- Không đổi schema giao dịch, học phí, Thu gộp khoản, Thi Đai, Kho đồ hoặc Điểm danh.
- Không di chuyển `renderApp`, `scheduleRender`, `listenToData` hoặc bootstrap Auth.
- Không sửa các write flow tài chính như `processMultiItem`, `quickPay`, `deleteTx`, `markInvPaid`, `cancelExamPayment`, `processBatchUpgrade`.

## 2. Mô hình tenant mới

Document `clubs/{clubId}` dùng hai trường server-owned:

- `accountStatus`: `active` hoặc `locked`.
- `expiryAt`: Firestore `Timestamp`, là nguồn quyết định bảo mật.

`expiryDate` dạng `YYYY-MM-DD` tiếp tục được giữ để hiển thị. Quyết định cho phép truy cập không dựa trên đồng hồ trình duyệt mà dùng `request.time` trong Firestore Rules.

Một tenant chỉ hoạt động khi đồng thời:

1. `accountStatus == "active"`;
2. `expiryAt` là timestamp hợp lệ;
3. `expiryAt > request.time`.

Thiếu `expiryAt`, trạng thái không hợp lệ, tenant bị khóa hoặc đã hết hạn đều fail-closed đối với dữ liệu nghiệp vụ.

## 3. Cloud Functions đã nâng cấp

File chính: `functions/src/accountProvisioning.js`.

### 3.1 Chuẩn hóa ngày hết hạn

Bổ sung parser ngày nghiêm ngặt:

- Chỉ nhận `YYYY-MM-DD`.
- Từ chối ngày không tồn tại như `2026-02-30`.
- Hỗ trợ ngày nhuận.
- Chuyển sang Firestore `Timestamp` tại cuối ngày theo múi giờ Việt Nam (UTC+07).

Ví dụ ngày `2026-06-30` còn hiệu lực hết ngày 30/06 tại Việt Nam và hết hạn tại `2026-06-30T17:00:00.000Z`.

### 3.2 Khóa/mở khóa tenant

`setClubAccountStatus` hiện:

- Chỉ SuperAdmin được gọi.
- Dùng transaction để cập nhật trạng thái nhất quán.
- Khóa ghi `lockReason`, `lockedAt`, `lockedBy`.
- Mở khóa chỉ được phép khi `expiryAt` vẫn còn hiệu lực.
- Mở khóa xóa metadata khóa và ghi `unlockedAt`, `unlockedBy`.
- Thu hồi refresh token của toàn bộ thành viên CLB bằng truy vấn phân trang.
- Firestore Rules vẫn là lớp bảo vệ chính; lỗi thu hồi token được trả về rõ ràng nhưng không làm mất hiệu lực khóa ở Rules.

Không disable toàn bộ Auth user khi khóa tenant. Cách này tránh làm mất trạng thái disable riêng của từng tài khoản. Có compatibility guard giới hạn việc re-enable Admin cũ chỉ cho dữ liệu khóa trước 6W1.

### 3.3 Gia hạn tách biệt với mở khóa

`updateClubSubscription` chỉ cập nhật:

- `expiryDate`;
- `expiryAt`;
- `updatedAt`.

Hàm không tự đổi `accountStatus` thành `active`. Vì vậy gia hạn một CLB đang bị khóa quản trị không tự mở khóa CLB đó.

### 3.4 Migration `expiryAt`

Bổ sung callable `backfillClubExpiryTimestamp`:

- Chỉ SuperAdmin được gọi.
- Dry-run mặc định.
- Cursor pagination theo document ID.
- Không có giới hạn cứng 500 CLB.
- Batch write giới hạn an toàn.
- Idempotent: CLB đã có `expiryAt` đúng sẽ được bỏ qua.
- Phân loại `invalidExpiry` và `invalidStatus`.
- Chỉ trả sample ID lỗi, không trả dữ liệu nhạy cảm.
- Có `complete` và `readyForRules` để chặn deploy Rules khi migration chưa hoàn tất.
- Dừng bằng lỗi rõ ràng nếu chạm safety ceiling; không âm thầm bỏ sót CLB.

Callable đã được export từ `functions/index.js` và có facade tương ứng trong `js/services/accountProvisioningService.js`.

## 4. Firestore Rules đã khóa tenant ở tầng dữ liệu

File: `firestore.rules`.

Các helper mới:

- `clubExists(clubId)`
- `clubData(clubId)`
- `clubHasOperationalFields(clubId)`
- `clubIsOperational(clubId)`

Các business collection chỉ cho phép truy cập khi tenant hoạt động. Quy tắc áp dụng cho Admin và HLV, bao gồm profiles, transactions, inventory, attendance và các dữ liệu nghiệp vụ khác.

Khi CLB locked/expired:

- Thành viên vẫn có thể đọc root `clubs/{clubId}` để giao diện hiển thị trạng thái/lý do khóa.
- Người dùng vẫn có thể đọc `users/{uid}` của chính mình.
- Không được đọc/ghi dữ liệu nghiệp vụ.
- Không được cập nhật self-profile kể cả field an toàn trong thời gian tenant không hoạt động.
- SuperAdmin vẫn có quyền xử lý tenant.

Club Admin không thể tự thay đổi:

- `accountStatus`;
- `expiryDate`, `expiryAt`;
- metadata khóa/mở khóa;
- các field SaaS nhạy cảm khác.

Deny-by-default và tenant isolation được giữ nguyên.

## 5. Rules Emulator và kiểm thử chính sách

Đã bổ sung:

- `rules-tests/tenant-access.test.mjs`: 19 trường hợp dùng `@firebase/rules-unit-testing`.
- `firebase.json`: Firestore Emulator tại `127.0.0.1:8181`, UI tắt.
- `eslint.config.js`: parser/plugin chính thức cho Firebase Security Rules.
- `tools/check-tenant-policy-matrix.mjs`: policy matrix offline 16 trường hợp.
- `tools/check-tenant-operational-enforcement.mjs`: 89 assertions kiểm tra source contract, rules contract, migration, UI wiring và syntax.
- `functions/test/tenantOperational.test.js`: 4 runtime tests cho date boundary và timestamp.

Lệnh chính thức:

```bash
npm run test:rules
```

Trong môi trường đóng gói hiện tại, lệnh này đã được gọi nhưng Firebase CLI không tải được file Firestore Emulator JAR từ Google Storage do giới hạn mạng/DNS. Đây là lỗi hạ tầng tải emulator, không phải test assertion thất bại. File test và cấu hình emulator đã được đóng gói đầy đủ, nhưng **bắt buộc chạy lại `npm run test:rules` trên máy có Internet trước khi deploy Rules production**.

Các lớp kiểm tra có thể chạy offline đều đã PASS:

- Firebase Rules grammar lint bằng parser chính thức.
- Policy matrix 16/16.
- Tenant enforcement source/runtime gate 89/89.
- Functions tenant runtime test 4/4.

Các kiểm tra này bổ sung nhưng không thay thế Rules Emulator.

## 6. Giao diện và service

- SuperAdmin được cảnh báo rõ khóa CLB sẽ chặn toàn bộ tenant, không chỉ Admin chính.
- Lock gửi `lockReason` rõ ràng.
- Thông báo gia hạn nêu rõ không làm thay đổi trạng thái khóa/mở khóa.
- Client service có facade cho migration và normalize lỗi callable.
- Build marker: `4K-6W1-tenant-lock-expiry-server-enforcement-20260616`.

## 7. Kết quả kiểm tra cuối

### 7.1 Kiểm tra mặc định

- `npm run check`: PASS.
- 17 nhóm kiểm tra.
- Syntax: 114 file JavaScript + 8 inline scripts, tổng 122 mục PASS.

### 7.2 Toàn hệ thống

- `npm run check:all`: 64/64 nhóm lệnh PASS.
- `npm run check:all:critical`: 86/86 nhóm lệnh PASS.
- Không xuất hiện `npm ERR`, `SyntaxError`, `ReferenceError`, `TypeError` hoặc `Command failed` trong hai log cuối.

### 7.3 Gate 6W1 offline

- `npm run check:6w1:offline`: PASS.
- Tenant enforcement: 89/89 PASS.
- Rules syntax lint: PASS.
- Policy matrix: 16/16 PASS.
- Functions syntax/source: PASS.
- Functions tenant runtime: 4/4 PASS.
- Tenant isolation: PASS.
- Deploy contract: PASS.
- Deploy package structure: 12/12 PASS.

### 7.4 Kiểm tra triển khai bổ sung

- GitHub Pages relative paths: 18/18 PASS.
- Cloud Functions lint/syntax: PASS.
- Firebase Hosting deploy contract: PASS.

### 7.5 Rules Emulator

- Test suite đã được tạo và lệnh đã được gọi.
- Chưa thể hoàn tất trong môi trường này vì Firebase Emulator JAR không tải được từ `storage.googleapis.com`.
- Log lỗi hạ tầng được giữ cùng gói bàn giao.


### 7.5 Dependency audit

- Root project `npm audit --omit=dev`: 0 production vulnerabilities (root dependencies are test/build tooling).
- Cloud Functions `npm audit --omit=dev`: 8 moderate transitive advisories in the Firebase Admin / Google Cloud dependency tree; không có high hoặc critical. Không tự động chạy `npm audit fix --force` trong phase này vì có thể nâng major dependency và gây hồi quy Cloud Functions. Hạng mục này cần một phase dependency-upgrade riêng, kiểm thử trên Node.js 20 trước khi deploy.
- Môi trường kiểm tra hiện dùng Node.js 22 nên `npm ci` của Functions có cảnh báo engine; target production trong `functions/package.json` vẫn là Node.js 20 và các syntax/runtime tests đã PASS.

## 8. Ảnh hưởng kích thước

| Thành phần | Phase 4K-6W | Phase 4K-6W1 | Thay đổi |
|---|---:|---:|---:|
| `app.js` | 639.631 B | 639.674 B | +43 B |
| Dòng `app.js` | 10.245 | 10.245 | Không đổi |
| `firestore.rules` | 7.800 B | 10.018 B | +2.218 B |
| `accountProvisioning.js` | 28.447 B | 39.345 B | +10.898 B |

Mức tăng nằm ở backend/rules và các guard bảo mật. Phase này không nhằm giảm `app.js`; mục tiêu là thực thi tenant lock/expiry đúng tại server.

## 9. Trình tự triển khai bắt buộc

1. Backup Firestore.
2. Deploy Cloud Functions 6W1.
3. Chạy `backfillClubExpiryTimestamp` dry-run.
4. Sửa toàn bộ `invalidExpiry`/`invalidStatus`.
5. Chạy migration thật.
6. Chạy lại dry-run, yêu cầu `wouldUpdate === 0` và `readyForRules === true`.
7. Chạy `npm run test:rules` trên máy có Internet và yêu cầu PASS.
8. Canary một CLB active/locked/expired.
9. Deploy Firestore Rules.
10. Deploy frontend.
11. Theo dõi `permission-denied`, audit logs và token revocation.

Không deploy Rules 6W1 trước migration, vì missing `expiryAt` được thiết kế fail-closed và có thể khóa nhầm CLB cũ.

## 10. Kết luận

Phase 4K-6W1 đã chuyển tenant lock/expiry từ cơ chế giao diện sang cơ chế server-authoritative:

- Rules dùng `request.time`.
- Khóa tenant chặn dữ liệu nghiệp vụ cho toàn bộ thành viên.
- Gia hạn không tự mở khóa.
- Mở khóa yêu cầu còn hạn.
- Migration có dry-run và deployment gate.
- Các luồng tài chính/Thi Đai/Điểm danh không bị thay đổi.

Gói chỉ được phép deploy Rules production sau khi Rules Emulator chạy PASS trên môi trường có thể tải emulator.

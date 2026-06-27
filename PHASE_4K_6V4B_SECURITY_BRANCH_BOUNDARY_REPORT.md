# PHASE 4K-6V4B — SECURITY-ENFORCED COACH BOUNDARY + CANONICAL BRANCH IDENTITY

**Ngày hoàn thành mã nguồn:** 25/06/2026  
**Nền tảng:** Vanilla JavaScript, Firebase Auth, Firestore, Firebase Hosting, Cloud Functions  
**Bản xuất phát:** Phase 4K-6V4A — Coach Attendance Only Read Boundary

---

## 1. Tóm tắt điều hành

Phase 6V4A đã giảm Firestore Reads cho tài khoản HLV bằng cách chỉ khởi tạo luồng Điểm danh. Tuy nhiên, giới hạn đó chủ yếu nằm ở phía JavaScript: Firestore Rules vẫn cho thành viên cùng CLB đọc dữ liệu rộng, user có thể tự cập nhật document `users/{uid}`, dữ liệu cơ sở dùng lẫn `CS1`, `Mặc định` và chuỗi rỗng, còn cache đăng nhập có thể giữ role/branch cũ.

Phase 6V4B lựa chọn phương án **hardening tăng dần, tương thích ngược, không migration phá vỡ**:

1. Biến Coach boundary thành security boundary ở Firestore Rules.
2. Chuẩn hóa dữ liệu mới về `CS1…CS10`.
3. Chỉ giữ `Mặc định` làm alias tạm thời của `CS1`.
4. Bắt buộc HLV có đúng một cơ sở, không dùng branch rỗng như “tất cả cơ sở”.
5. Khi quyền/CLB/cơ sở thay đổi, runtime tháo listener và rebind phiên thay vì tiếp tục dùng cache cũ.
6. Khóa callable thao tác toàn CLB bằng kiểm tra Admin server-side.
7. Chỉ deploy thư mục build `public/`, không công khai tài liệu và công cụ nội bộ.

Không thay đổi cấu trúc nghiệp vụ Học phí, Báo nợ, Kho đồ hoặc Thi đai. Không thực hiện migration dữ liệu production và không deploy Firebase trong quá trình tạo bản này.

---

## 2. Phương án đã chọn và lý do

### Phương án A — Migration toàn bộ branch ngay lập tức

Ưu điểm: dữ liệu sạch ngay.  
Nhược điểm: rủi ro cao với hệ thống đang chạy, cần quét/ghi nhiều document, tăng chi phí, khó rollback và trái với yêu cầu tránh migration phức tạp.

### Phương án B — Chỉ sửa JavaScript phía client

Ưu điểm: nhanh, ít tác động.  
Nhược điểm: không giải quyết bảo mật; người dùng vẫn có thể gọi Firebase SDK trực tiếp để đọc dữ liệu bị ẩn khỏi UI.

### Phương án C — Rules-first + compatibility alias + canonical write

Ưu điểm:

- Khóa được lỗ hổng quyền ngay tại server boundary.
- Không cần migration hàng loạt.
- Dữ liệu cũ `Mặc định` vẫn hoạt động với Coach CS1.
- Mọi dữ liệu mới dần hội tụ về chuẩn `CSx`.
- Có thể rollout và rollback theo từng lớp.

**Phương án C được thực hiện.** Đây là lựa chọn cân bằng tốt nhất giữa bảo mật, ổn định production, chi phí Reads và khả năng vận hành của người dùng.

---

## 3. Các thay đổi đã thực hiện

### 3.1. Canonical Branch Identity

Tạo `js/core/branchIdentity.js` làm nguồn chuẩn hóa branch:

- Hỗ trợ mã chuẩn `CS1` đến `CS10`.
- Quy đổi `Mặc định`, `default`, `CS01`, `Cơ sở 1` về `CS1`.
- Branch rỗng được coi là không hợp lệ đối với Coach.
- Expose API dùng chung qua `window.BranchIdentity` để legacy và module cùng dùng một quy tắc.

`index.html` tải module này trước `roleReadBoundary.js`.

### 3.2. Coach read boundary phía client

Cập nhật:

- `js/core/roleReadBoundary.js`
- `js/listeners/profiles.listeners.js`
- `js/services/attendance.service.js`
- `js/modules/students.js`
- `app.js`

Kết quả:

- Coach chỉ mount nguồn dữ liệu Điểm danh.
- Profiles query theo đúng branch được gán.
- Coach CS1 có query tương thích riêng cho dữ liệu cũ `Mặc định`, không quét toàn CLB.
- Query ngày, tháng, ghi chú và lịch sử attendance đều bị branch-scope.
- Ghi mới chuẩn hóa branch về `CSx`.
- Thiếu branch sẽ fail-closed với lỗi rõ ràng.
- Luồng tạo tài khoản Coach không còn lựa chọn “Tất cả cơ sở”.

### 3.3. Firestore Rules security boundary

`firestore.rules` được viết lại theo mô hình deny-by-default:

- User chỉ hoạt động khi có document `users/{uid}` hợp lệ và không bị khóa.
- Coach chỉ đọc profile/student đúng `coachBranch`.
- Coach chỉ đọc/ghi attendance đúng branch; update kiểm tra cả dữ liệu cũ và mới.
- Coach không được đọc transaction, inventory, stats, exam, cost hoặc audit.
- User tự cập nhật chỉ được thay đổi whitelist field hồ sơ cá nhân.
- User không thể tự đổi `role`, `clubId`, `coachBranch`, `status` hoặc quyền hệ thống.
- Admin chỉ quản lý Coach trong chính CLB của mình và phải gán branch hợp lệ.
- Collection không khai báo bị từ chối.
- SuperAdmin vẫn có đường quản trị server-authoritative.

### 3.4. Session rebind và cache đăng nhập

Cache được nâng phiên bản và giảm thời hạn. Cache chỉ là gợi ý để hiển thị nhanh, không phải nguồn cấp quyền.

Khi Firestore trả về role/club/branch khác cache, runtime thực hiện rebind:

1. Khóa tạm luồng cũ.
2. Tháo listener.
3. Xóa state tenant/branch cũ.
4. Cập nhật context đã xác thực.
5. Reload để mount đúng boundary mới.

Fallback cũ quét tối đa 200 CLB để tìm tài khoản đã bị loại bỏ. Nếu thiếu `users/{uid}`, hệ thống dừng an toàn và yêu cầu Admin đồng bộ tài khoản.

### 3.5. Cloud Functions authorization

Tạo `functions/src/authz.js` và áp dụng cho:

- `recalcDebtForClub`
- `rebuildStatsForClub`
- `refreshSuperAdminSummaryForClub`

Các callable này chỉ cho phép Admin/Owner cùng CLB hoặc SuperAdmin. Không tin role/clubId do client gửi lên và không dùng hardcoded email làm quyền server-side.

### 3.6. Hosting isolation

Trước đây Firebase Hosting dùng `public: "."`, có nguy cơ xuất bản tools, báo cáo, rules và tài liệu nội bộ.

Phase 6V4B:

- Thêm `tools/build-public.mjs`.
- Tạo thư mục `public/` tối thiểu gồm app runtime và assets cần thiết.
- `firebase.json` đổi sang `hosting.public = "public"`.
- Script `deploy:hosting` luôn chạy checker và build trước deploy.

### 3.7. Chất lượng checker

- Thêm gate `check:security-coach-branch-boundary` — 35/35 tiêu chí.
- Giữ gate Phase 6V4A — 30/30 tiêu chí.
- Sửa `check:assets` để bỏ query/hash (`?v=...`) trước khi kiểm tra đường dẫn, chấm dứt cảnh báo thiếu asset giả.
- Cập nhật checker hydration và debt boundary để kiểm tra contract hiện tại thay vì marker cũ.
- Viết `tools/firestore-rules-6v4b.test.mjs` cho kiểm thử quyền bằng Firestore Emulator.

---

## 4. Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `npm run check` — 24 cổng mặc định | Đạt, exit code 0 |
| Phase 6V4A compatibility gate | 30/30 đạt |
| Phase 6V4B security gate | 35/35 đạt |
| Asset/import integrity | 65 asset/import đạt |
| Runtime smoke test | 12/12 đạt |
| Attendance scheduled accuracy | 22 tiêu chí đạt |
| Attendance offline/shift | 18 tiêu chí đạt |
| Login performance contract | 28 tiêu chí đạt |
| Firestore indexes contract | 16 tiêu chí đạt |
| Functions lint | Đạt |
| Functions static contract | Đạt |
| Runtime bootstrap | Đạt; còn một cảnh báo optional không chặn release |
| Data hydration | 33 tiêu chí đạt |
| Tenant structural isolation | Đạt |
| Deploy contract | Đạt |
| Build thư mục `public/` | Đạt |
| Firestore Rules Emulator | Test suite đã viết; chưa chạy hoàn tất trong môi trường hiện tại |

### Lý do Emulator chưa chạy hoàn tất

Firebase CLI cần tải Firestore Emulator JAR từ hạ tầng Google. Môi trường thực thi hiện tại không thể tải Firestore Emulator JAR từ `storage.googleapis.com`, nên emulator bị dừng trước bước biên dịch Rules. Đây là hạn chế môi trường, không phải kết quả pass của Rules.

**Vì vậy, `npm run check:rules:emulator` vẫn là release gate bắt buộc trước production deploy.**

---

## 5. Đánh giá tác động tổng thể

### Bảo mật

Trước Phase: khoảng **3/10** — quyền Coach chủ yếu bị ẩn ở UI; user có thể tự sửa field quyền.  
Sau thay đổi mã nguồn: khoảng **7/10 có điều kiện** — Rules, Functions và field-level protection đã được áp dụng; cần Emulator + canary để xác nhận production.

### Tối ưu Reads

- Coach không tải các tab tài chính/kho/dashboard.
- Không còn full-club fallback khi thiếu branch hoặc thiếu user mapping.
- CS1 tạm thời có thêm một query nhỏ cho alias `Mặc định`.
- Sau khi chuẩn hóa hết dữ liệu về `CS1`, có thể bỏ query legacy để giảm thêm Reads.

Đánh giá: **7.5/10** ở tầng thiết kế client/query; cần đo Firebase Usage thực tế sau canary.

### Tính toàn vẹn dữ liệu

- Ghi mới đã có canonical branch.
- Không migration phá vỡ dữ liệu cũ.
- Quyền thay đổi role/club/branch được khóa.

Đánh giá tăng từ khoảng **5.5/10 lên 7/10**, nhưng name-based identity ở các nghiệp vụ cũ vẫn còn.

### Kiến trúc và bảo trì

- Có thêm một nguồn chuẩn branch và server authorization dùng chung.
- Hosting boundary rõ ràng hơn.
- Tuy nhiên `app.js`, `main.js`, global bridge và inline handlers vẫn lớn.

Đánh giá chỉ tăng nhẹ, khoảng **5.5/10**; chưa nên refactor monolith trong cùng phase bảo mật này.

### Mức sẵn sàng production

Trước Phase: khoảng **5.5–6/10**.  
Bản mã nguồn sau hardening: khoảng **7.5/10 có điều kiện**.

Nhãn phù hợp: **Release Candidate cho canary**, chưa phải bản nên deploy mù cho toàn bộ CLB.

---

## 6. Trình tự triển khai bắt buộc

### Bước 1 — Backup và kiểm kê

- Backup Firestore/Rules hiện tại theo phương thức đang dùng.
- Xuất danh sách Auth UID, email, role, clubId và coachBranch để đối chiếu.
- Không deploy Rules mới khi còn Coach thiếu `users/{uid}` hoặc thiếu branch.

### Bước 2 — Preflight tài khoản trước thời gian bảo trì

- Xác nhận tài khoản Admin triển khai đã có `users/{uid}` với `role = admin/owner`, đúng `clubId` và trạng thái active.
- Thống kê danh sách Coach trong `clubs/{clubId}/coaches` và xác định branch dự kiến cho từng tài khoản.
- Không thông báo Coach đăng nhập trong cửa sổ cutover cho đến khi bước đồng bộ hoàn tất.
- Nếu có công cụ Admin SDK đáng tin cậy, có thể seed `users/{uid}` trước. Nếu Rules hiện hành không cho Admin ghi user khác, không nới Rules tạm thời bằng `allow read/write: if true`.

### Bước 3 — Chạy release gates trên máy có Internet

```bash
npm install
npm run check
npm run check:assets
npm run check:runtime-smoke-test
npm run check:rules:emulator
npm run build:public
```

Trong thư mục Functions:

```bash
cd functions
npm install
npm run lint
```

### Bước 4 — Deploy Rules, đồng bộ ngay và canary

Thực hiện trong cửa sổ bảo trì ngắn:

1. Deploy Firestore Rules/indexes.
2. Admin đăng nhập và bấm **“Đồng bộ tài khoản HLV cũ”**. Chức năng phải báo `Không đồng bộ được: 0`.
3. Xác nhận mỗi Coach có `users/{uid}` với `role = coach`, đúng `clubId`, `branch = CS1…CS10`.
4. Test một Admin, một Coach CS1 và một Coach ở cơ sở khác, ví dụ CS2.
5. Dùng DevTools/Firebase SDK kiểm tra trực tiếp rằng Coach không đọc được transaction, inventory hoặc cơ sở khác.
6. Chuyển một Coach từ CS1 sang CS2 và xác nhận phiên cũ được rebind, không giữ dữ liệu CS1.

Coach thiếu user document sẽ bị fail-closed trong khoảng từ lúc deploy Rules đến khi đồng bộ xong; đây là hành vi bảo vệ có chủ đích, vì vậy không triển khai vào giờ CLB đang điểm danh.

### Bước 5 — Deploy Hosting và Functions

Chỉ khi canary Rules đạt:

```bash
npm run deploy:hosting
firebase deploy --only functions
```

Không upload toàn bộ thư mục gốc lên Hosting. Chỉ deploy `public/` được build.

### Bước 6 — Theo dõi sau deploy

Trong 24–72 giờ đầu:

- Theo dõi lỗi `permission-denied` theo role/branch.
- Đếm listener và Reads từ login đến ổn định.
- So sánh Coach với Admin cùng CLB.
- Theo dõi trường hợp Coach không thấy võ sinh.
- Không mở rộng CLB mới cho đến khi canary ổn định.

---

## 7. Rollback

### Hosting

Rollback về Firebase Hosting release trước đó hoặc redeploy gói Phase 6V4A đã lưu.

### Firestore Rules

- Luôn lưu bản Rules trước deploy.
- Nếu cần rollback, dùng một bản Rules an toàn đã được kiểm tra; không quay lại rule đọc rộng hoặc `allow read: if true`.
- Giữ alias `Mặc định` trong giai đoạn rollback để không làm mất dữ liệu Coach CS1.

### Functions

Redeploy phiên bản Functions trước. Việc rollback Functions không được mở lại quyền cho Coach gọi tác vụ toàn CLB.

### Dữ liệu

Phase này không chạy migration hàng loạt nên rollback không cần hoàn nguyên dữ liệu. Các bản ghi mới dùng `CSx` vẫn được hệ thống tương thích xử lý.

---

## 8. Rủi ro còn lại

1. **Rules Emulator chưa được chạy thành công trong môi trường tạo bản.** Đây là cổng chặn deployment.
2. Coach vẫn đọc `settings/main_config` để giữ tương thích; document này nên được tách nếu chứa ngân hàng/tài chính.
3. Alias `Mặc định` làm Coach CS1 có thêm query cho đến khi migration branch hoàn tất.
4. Name-based identity vẫn tồn tại trong một số giao dịch/điểm danh cũ.
5. Attendance daily query vẫn có giới hạn cứng; cần pagination/fail-stop rõ hơn ở phase riêng.
6. UI còn hardcoded đường SuperAdmin cũ; Rules và Functions không tin đường này, nhưng nên loại dần để tránh nhầm quyền.
7. Monolith `app.js`/global bridge chưa được xử lý trong phase bảo mật.
8. Parent portal cũ không thể mở bằng Rules public rộng; cần public projection hoặc API/token riêng.

---

## 9. Phase tiếp theo đề xuất

Sau khi 6V4B vượt Emulator và canary, phase tốt nhất là:

### Phase 4K-6V4C — Attendance Public Config Split + Branch Reconciliation Telemetry

Phạm vi:

- Tách `settings/attendance_public` khỏi `main_config`.
- Dry-run thống kê toàn bộ branch rỗng/`Mặc định`/không hợp lệ.
- Công cụ reconcile có preview, idempotency và rollback log.
- Dashboard đo Reads/listeners theo role.
- Bỏ query alias chỉ khi dữ liệu đã sạch và có xác nhận.

Không nên tách lớn `app.js` trước khi security rollout và dữ liệu branch ổn định.

---

## 10. Kết luận

Phase 6V4B đã xử lý đúng các rủi ro quan trọng nhất của bản 6V4A bằng cách chuyển từ “ẩn dữ liệu ở giao diện” sang “thực thi quyền tại Firestore/Functions”, đồng thời giữ tương thích dữ liệu cũ và không buộc migration production.

Bản này đã vượt toàn bộ checker tĩnh và runtime mục tiêu đã chạy. Tuy nhiên, do Firestore Rules Emulator chưa chạy được trong môi trường hiện tại, trạng thái chính xác là:

> **Hoàn thành mã nguồn và kiểm thử tĩnh/runtime — sẵn sàng cho Emulator + canary, chưa nên deploy toàn bộ ngay.**

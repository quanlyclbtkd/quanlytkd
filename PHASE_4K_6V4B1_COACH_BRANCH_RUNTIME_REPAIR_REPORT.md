# Phase 4K-6V4B1 — Coach Branch Assignment + Runtime Repair

## 1. Sự cố được xử lý

Tài khoản HLV đăng nhập được vào tab Điểm danh nhưng không tải danh sách võ sinh. Console ghi:

```text
[ProfilesListener] Coach missing branch — fail closed, no profiles query
```

Đây không phải lỗi Firestore index hay lỗi listener. Listener đã dừng đúng cơ chế an toàn vì `coachBranch` truyền vào là chuỗi rỗng.

## 2. Nguồn gốc lỗi

Chuỗi lỗi cũ gồm nhiều điểm nối tiếp:

1. Giao diện V4A từng cho phép tạo HLV với lựa chọn `Tất cả cơ sở`, được lưu dưới dạng branch rỗng.
2. Phân quyền của HLV được lưu tại hai nơi:
   - `clubs/{clubId}/coaches/{uid}`
   - `users/{uid}`
   Hai document có thể thiếu hoặc lệch `branch/coachBranch`.
3. Khi đăng nhập, runtime đọc branch rỗng từ `users/{uid}` và truyền vào profiles listener.
4. Profiles listener fail-closed, không chạy query để tránh vô tình tải toàn CLB.
5. Giao diện cũ không có chức năng sửa cơ sở cho HLV đã tồn tại.
6. Với cơ sở chính, profiles cũ có thể dùng `Mặc định` trong khi quyền HLV dùng `CS1`; lọc UI bằng phép so sánh chuỗi tuyệt đối có thể tiếp tục loại nhầm võ sinh dù listener đã tải được.
7. URL import vẫn mang cache marker V4A, khiến trình duyệt có thể tiếp tục dùng asset cũ sau khi cập nhật.

## 3. Thiết kế sửa lỗi

### Nguồn gán quyền

- `clubs/{clubId}/coaches/{uid}` là nguồn gán cơ sở do Admin quản lý.
- `users/{uid}` là authorization mirror dùng cho Firestore Rules.
- Khi hai document lệch nhau, runtime chỉ đọc đúng một đường dẫn Coach theo `clubId + uid`; không quét collection CLB hoặc profiles.

### Nguyên tắc an toàn

- Coach bắt buộc có một branch cụ thể `CS1...CS10`.
- Không có lựa chọn `Tất cả cơ sở` cho Coach.
- Không có fallback đọc toàn CLB.
- Branch thiếu vẫn fail-closed.
- Cache Coach không được dùng để mount listener trước khi quyền được xác minh.
- Admin cập nhật Coach document và user mirror trong cùng một Firestore batch.

## 4. Thay đổi đã thực hiện

### `js/core/coachBranchRuntimeRepair.js`

Module mới chịu trách nhiệm:

- Xác minh branch theo exact Coach assignment.
- Sửa `users/{uid}` mirror khi branch cũ rỗng/sai nhưng Coach assignment hợp lệ.
- Hiển thị cảnh báo các HLV chưa được gán cơ sở.
- Cho Admin chọn và lưu lại cơ sở của tài khoản đã tồn tại.
- Tạo HLV mới với branch bắt buộc.
- Đồng bộ tài khoản cũ mà không tự suy đoán `CS1` khi dữ liệu rỗng.
- Không tạo lại Firebase Auth nếu Auth đã tồn tại nhưng user mirror ghi thất bại.

### `app.js`

- Coach không còn đi qua fast-path cache trước khi xác minh branch.
- Slow path gọi exact assignment repair trước khi `initSaaSDatabase()`.
- Coach thiếu branch vẫn dừng an toàn và báo Admin gán cơ sở.
- Không quét toàn bộ `clubs` để suy đoán quyền.
- Phần logic mới được tách khỏi monolith, giữ `app.js` trong giới hạn kiến trúc.

### `js/listeners/profiles.listeners.js`

Giữ nguyên nguyên tắc:

```text
Coach branch hợp lệ → query status + branch
Coach branch thiếu   → zero query, fail closed
```

CS1 có listener phụ chỉ cho alias cũ `Mặc định`, không mở rộng sang cơ sở khác.

### `js/modules/attendance.js`

- Thay so sánh branch tuyệt đối bằng canonical equality.
- `CS1` và `Mặc định` được coi là cùng cơ sở chính.
- CS1 không bao giờ khớp CS2.
- Áp dụng cho danh sách ngày, ca tập, sinh nhật và thống kê tháng.

### `firestore.rules`

- Coach được đọc đúng Coach assignment document của chính mình để sửa mirror.
- Coach chỉ được tạo/sửa `users/{uid}` mirror khi role, clubId và branch khớp tuyệt đối assignment do Admin ghi.
- Không thể tự nâng role, đổi tenant hoặc tự chọn branch khác.
- Các giới hạn đọc profiles, attendance, tài chính và kho của V4B vẫn được giữ nguyên.

### Cache bust

Các entrypoint quan trọng đã chuyển sang:

```text
coach-branch-runtime-repair-20260627-v4b1
```

để trình duyệt không dùng lại `profiles.listeners.js`/`attendance.js` V4A.

## 5. Hành vi sau sửa

### Coach đã được Admin gán branch đúng

- Đăng nhập xác minh exact assignment.
- `window.coachBranch` nhận branch đã giao.
- Bộ lọc Điểm danh chỉ có đúng một cơ sở và bị khóa.
- Profiles listener query đúng branch.
- Không tải học phí, kho đồ, tài chính hoặc cơ sở khác.

### Coach document có branch nhưng `users/{uid}` thiếu/sai

- Runtime đọc đúng `clubs/{clubId}/coaches/{uid}`.
- Mirror được sửa theo Rules V4B1.
- Listener chỉ mount sau khi branch hợp lệ.

### Cả hai document đều không có branch

- Hệ thống không đoán branch.
- Coach không tải dữ liệu.
- Admin phải chọn đúng cơ sở và bấm `Lưu cơ sở`.

## 6. Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---:|
| Default regression suite | PASS, exit code 0 |
| JavaScript + inline syntax | 231/231 |
| V4A Coach attendance boundary | 30/30 |
| V4B security/branch boundary | 35/35 |
| V4B1 runtime repair | 25/25 |
| Static assets/imports | 65/65 |
| Runtime smoke | 12/12 |
| Attendance scheduled accuracy | 22/22 |
| Attendance offline/shift | 18/18 |
| Login performance | 28/28 |
| Firestore indexes | 16/16 |
| Data hydration | 33/33 |
| Hosting deploy contract | PASS |
| Functions source/syntax | PASS; cảnh báo chưa cài `functions/node_modules` |
| Public build | PASS |

### Firestore Rules Emulator

Ma trận Emulator đã được mở rộng để kiểm tra:

- Coach đọc assignment của chính mình nhưng không đọc Coach khác.
- Coach branch cũ có thể sửa mirror về đúng branch Admin giao.
- Coach thiếu `users/{uid}` chỉ được tạo mirror khớp exact assignment.
- Coach không có assignment không thể tự tạo quyền.
- Coach không thể tự chọn branch khác.

Lệnh Emulator đã được chạy nhưng môi trường kiểm tra không tải được:

```text
cloud-firestore-emulator-v1.21.0.jar
```

trừ Google Storage. Vì vậy Emulator chưa thể hoàn tất trong môi trường này. Không deploy Rules production trước khi chạy thành công `npm run check:rules:emulator` trên máy có Internet đầy đủ.

## 7. Trình tự triển khai bắt buộc

1. Backup Firestore Rules và dữ liệu.
2. Trên máy có Internet:

```bash
npm install
npm run check
npm run check:rules:emulator
npm run build:public
```

3. Deploy Rules trước:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

4. Deploy Hosting:

```bash
firebase deploy --only hosting
```

5. Admin vào `Quản lý tài khoản HLV`:
   - Chọn đúng cơ sở cho từng tài khoản có cảnh báo.
   - Bấm `Lưu cơ sở`.
   - Chạy `Đồng bộ tài khoản HLV cũ`.
   - Chỉ hoàn tất khi `Chưa được Admin gán cơ sở = 0` và `Không đồng bộ được = 0`.
6. HLV đăng xuất, tải lại trang và đăng nhập lại.
7. Canary bằng ít nhất Coach CS1 và Coach CS2; xác nhận không thấy chéo dữ liệu.

## 8. Tiêu chí canary

- Coach CS1 chỉ thấy CS1 và dữ liệu cũ `Mặc định` của cơ sở chính.
- Coach CS2 chỉ thấy CS2.
- Bộ lọc Coach không còn `Tất cả cơ sở`.
- Console không còn `Coach missing branch` đối với tài khoản đã được gán đúng.
- Coach không đọc được transactions, inventory hoặc profiles cơ sở khác.
- Reload và đăng nhập lại không đổi branch ngoài ý muốn.

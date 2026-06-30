# Phase 4K-6V4D7 — Coach + Quit Attendance Full Recovery

## Mục tiêu
Sửa dứt điểm 2 lỗi còn lại sau V4D4:

1. Tab **Đã nghỉ** trên web/mobile đã có danh sách nhưng vẫn chưa đầy đủ toàn bộ võ sinh nghỉ.
2. Tài khoản **HLV điểm danh** đăng nhập được nhưng danh sách võ sinh tại cơ sở được giao vẫn không load đầy đủ; console có lỗi:
   - `finance.service.js?... 503 Service Unavailable`
   - `[RoleReadBoundary] Coach profiles module unavailable — blocked full-club fallback`

## Nguyên nhân kỹ thuật đã xác định

### A. Luồng Đã nghỉ vẫn có thể dùng cache/page-limit cũ
Trong V4D4, module `renderQuitIsland()` đã có nguồn authoritative, nhưng nhánh web vẫn có trường hợp giữ lại HTML cache cũ nếu cache tồn tại. Cache này có thể là cache tính toán theo trang hoặc cache sinh trước khi full reconciliation hoàn tất. Vì vậy web/mobile đều có khả năng hiện ít hơn nguồn `quitProfiles` thật.

### B. Khi main.js/module layer lỗi hoặc chậm, legacy app thiếu classifier đủ mạnh
Nếu module layer chưa kịp nạp hoặc bị abort do một import con lỗi, legacy `app.js` vẫn chạy. Nhưng nếu `window.classifyProfileStatus` chưa có, một số nhánh legacy chỉ nhận `status === 'quit'`, làm sót hồ sơ nghỉ cũ có dạng `Đã nghỉ`, `Nghỉ tập`, `active=false`, `quitDate`, `ngayNghi`, v.v.

### C. Log HLV cho thấy main module chưa sẵn ở thời điểm initSaaSDatabase
Console báo:

`Coach profiles module unavailable — blocked full-club fallback`

Điều này nghĩa là tại thời điểm HLV đăng nhập, `window.mountActiveProfilesListener` chưa có. Trước V4D5, app fail-closed bằng cách xóa `allProfiles`, vì không được phép full-read toàn CLB cho HLV. Kết quả: HLV không thấy hoặc thấy thiếu danh sách điểm danh.

### D. HLV query bị thiếu vì lọc `status + branch` ở server
Nhiều hồ sơ võ sinh cũ có thể thiếu `status`, hoặc dùng trạng thái cũ không nằm trong `activeQueryValues`. Query kiểu `where(status in active) + where(branch == assigned)` sẽ bỏ sót các võ sinh này, dù họ vẫn là võ sinh đang tập tại cơ sở của HLV.

### E. finance.service.js 503 có thể abort module graph
`js/modules/finance.js` import tĩnh `../services/finance.service.js?v=firestore-read-attribution...v3a`. Khi URL này bị 503/stale cache trên hosting, toàn bộ module graph của `main.js` có thể không hoàn tất, kéo theo `mountActiveProfilesListener` không được expose kịp. Đây là nguyên nhân trực tiếp phù hợp với log console bạn gửi.

## Sửa đổi chính

### 1. Tab Đã nghỉ — web/mobile luôn ưu tiên authoritative full union
`renderQuitIsland()` giờ so sánh số row cache với nguồn authoritative và ưu tiên render full union khi authoritative >= cache. Nguồn authoritative gồm:

- `studentProfileStore.quitProfiles`
- `_localQuitProfiles`
- `studentProfileStore.getAllProfilesCompat()`
- `window.allProfiles`
- `window.__store.profiles`
- canonical profile store nếu có

Điều này tránh giữ lại cache/page-limit cũ.

### 2. Legacy app có classifier đủ mạnh trước khi module nạp
Thêm fallback `window.classifyProfileStatus` ngay trong `app.js`, nhận diện:

- `status` chứa nghỉ/quit/inactive/stop/left
- `active === false`, `isActive === false`
- `quit === true`, `isQuit === true`, `stopped === true`
- `quitDate`, `ngayNghi`, `inactiveDate`, `stoppedDate`, `leftDate`, `nghiDate`

Nhờ vậy nếu main module chậm/lỗi, legacy render vẫn phân tách Đang tập/Đã nghỉ đúng hơn.

### 3. HLV không còn bị trắng danh sách khi module profile chưa sẵn
Trong `app.js`, thay vì fail-closed bằng danh sách rỗng, thêm fallback an toàn cho HLV:

- Chỉ query `branch == coachBranch` và các alias của cơ sở được giao.
- Không đọc full club.
- Lọc bỏ võ sinh đã nghỉ bằng classifier local.
- Repaint lại Attendance ngay khi snapshot về.

Đây là fallback an toàn khi `main.js` hoặc module `profiles.listeners.js` chưa sẵn do lỗi tải module.

### 4. HLV active listener chính chuyển sang branch-only query
Trong `profiles.listeners.js`, HLV không còn dùng `status + branch` query. Luồng mới:

- Query theo `branch == assignedBranch` / alias.
- Lọc `quit` ở client bằng `classifyProfileStatus`.

Cách này vẫn giữ giới hạn theo cơ sở của HLV, nhưng không bỏ sót võ sinh active legacy thiếu status.

### 5. Sửa cache-bust finance service để tránh stale 503 làm abort main module
Cập nhật import trong `finance.js`:

- `finance.service.js?v=coach-quit-attendance-full-recovery-20260630-v4d5`
- `students.service.js?v=coach-quit-attendance-full-recovery-20260630-v4d5`

Đồng thời bump entrypoint:

- `app.js?v=coach-quit-attendance-full-recovery-20260630-v4d5`
- `main.js?v=coach-quit-attendance-full-recovery-20260630-v4d5`

## File đã sửa

- `index.html`
- `app.js`
- `package.json`
- `js/main.js`
- `js/listeners/profiles.listeners.js`
- `js/ui/render/renderStudents.js`
- `js/modules/finance.js`
- Các file mirror trong `public/`
- `tools/check-v4d5-coach-quit-attendance-full-recovery.mjs`
- Cập nhật các regression gate liên quan để phản ánh V4D5.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:v4d1a-runtime-recovery` — PASS 22/22
- `npm run check:v4d4-coach-quit-authoritative-fix` — PASS 17/17
- `npm run check:v4d5-coach-quit-attendance-full-recovery` — PASS 12/12
- `npm run check` — PASS toàn bộ pipeline

## Ghi chú triển khai

Bản này tiếp tục dựa trên Rules V4D4 đã có. Khi deploy cần upload source/hosting đầy đủ, đặc biệt các file:

- `app.js`
- `index.html`
- `js/main.js`
- `js/modules/finance.js`
- `js/services/finance.service.js`
- `js/listeners/profiles.listeners.js`
- `js/ui/render/renderStudents.js`

Nếu sau deploy điện thoại hoặc máy HLV vẫn dùng cache cũ, hãy mở tab ẩn danh hoặc xóa cache site một lần.

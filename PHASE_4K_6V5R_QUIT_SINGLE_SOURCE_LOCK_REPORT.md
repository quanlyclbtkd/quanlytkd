# Phase 4K-6V5R — Quit Single Source Lock + Completeness Gate

## Mục tiêu

Giải quyết tận gốc lỗi tab **🛑 Đã Nghỉ** bị thiếu võ sinh hoặc giữ lại hồ sơ đã khôi phục do có quá nhiều nguồn dữ liệu, cache và renderer cùng tham gia.

V5R khóa lại nguyên tắc:

> Sau khi đối chiếu hoàn tất, tab Đã nghỉ chỉ được phép lấy dữ liệu từ một nguồn duy nhất: `studentProfileStore.quitProfiles`.

Các nguồn legacy chỉ được dùng làm preview tạm thời trong lúc full snapshot đang tải. Chúng không còn được phép bổ sung hoặc ghi đè danh sách hoàn chỉnh.

## Nguyên nhân gốc đã phát hiện

### 1. Nhiều nguồn dữ liệu chạy chồng lên nhau

Tab Đã nghỉ từng có thể lấy hồ sơ từ:

- `window.allProfiles`
- `window.__store.profiles`
- `studentProfileStore.getAllProfilesCompat()`
- `studentProfileStore.quitProfiles`
- `ProfileCanonicalStore.quitProfiles`
- pagination `currentItems`
- computation cache `quitRows`
- legacy `_tabHtmlCache`
- direct renderer/mobile renderer

Một nguồn có dữ liệu cũ hoặc active-only có thể làm danh sách bị thiếu; ngược lại, một nguồn stale có thể đưa người đã khôi phục quay lại tab Đã nghỉ.

### 2. Trạng thái “đã load” chưa đồng nghĩa “đã đủ”

Các bản trước có thể đánh dấu quit data đã load sau targeted query hoặc partial pagination, dù collection chưa được đối chiếu đầy đủ. Vì vậy hệ thống bỏ qua full reconcile và không tìm thấy một số võ sinh nghỉ legacy.

### 3. Hồ sơ đã khôi phục vẫn còn trong cache nghỉ

Khi một võ sinh được chuyển lại Active từ trình duyệt khác hoặc từ thao tác rename/restore, active listener cập nhật danh sách active nhưng quit bucket cũ chưa chắc được xóa ngay. Broad legacy union sau đó có thể đưa hồ sơ cũ trở lại tab Đã nghỉ.

### 4. Renderer và search không dùng cùng một authority

Search có thể dùng `allProfiles`, renderer dùng cached HTML, mobile dùng direct rows. Vì vậy kết quả tìm kiếm, số lượng và danh sách hiển thị có thể không đồng nhất.

### 5. Completeness chưa được khóa theo CLB và độ mới

Nếu chuyển CLB hoặc dữ liệu bị chỉnh từ phiên đăng nhập khác, snapshot quit cũ có thể vẫn được xem là hoàn chỉnh. Điều này gây thiếu danh sách hoặc giữ dữ liệu đã lỗi thời.

## Thay đổi chính

### 1. Một nguồn duy nhất sau khi complete

Trong `js/data/quitProfileBoundary.js`:

- Complete mode chỉ đọc `studentProfileStore.getQuitProfiles()`.
- Không union `window.allProfiles`, `window.__store.profiles` hoặc canonical broad store sau khi complete.
- Preview mode trong lúc tải mới được dùng union legacy tạm thời.
- Preview được dedupe theo profileId/memberId/tên chuẩn hóa.

### 2. Bucket active/quit loại trừ lẫn nhau

Trong `js/data/studentProfileStore.js`:

- `setActiveProfiles()` tự xóa cùng ID khỏi quit/other.
- `setQuitProfiles()` tự xóa cùng ID khỏi active/other.
- `setOtherProfiles()` tự xóa cùng ID khỏi active/quit.

Điều này ngăn hồ sơ vừa active vừa quit trong local canonical store.

### 3. Full authoritative snapshot được khóa theo CLB

Trong `js/listeners/profiles.listeners.js`:

- Một full `getDocs(profiles collection)` được dùng để phân loại local thành active/quit/other.
- Completeness gắn với `clubId`.
- Chuyển CLB sẽ reset quit authority cũ.
- Snapshot có freshness gate 60 giây khi mở tab Đã nghỉ.
- Active query có document bị removed sẽ đánh dấu quit authority dirty và yêu cầu đối chiếu lại.
- Coach vẫn không được phép full-read quit collection.

### 4. Renderer chỉ dùng QuitProfileBoundary

Trong `js/ui/render/renderStudents.js`:

- Khi `QuitProfileBoundary` có mặt, `renderQuitIsland()` không đọc `quitRows` cache hoặc legacy HTML.
- Desktop/mobile/search/filter đều xây rows từ cùng boundary.
- Trong lúc chưa complete, chỉ hiển thị preview hoặc trạng thái “Đang đối chiếu toàn bộ danh sách đã nghỉ…”.
- Sau complete, render trực tiếp từ dedicated quit store.

### 5. Legacy tab cache không được phục hồi Đã nghỉ

Trong `app.js`:

- `_legacySwitchTab` không còn đưa `_tabHtmlCache.quitList` trở lại DOM.
- Khi mở Đã nghỉ, hệ thống đảm bảo authority rồi mới render qua boundary.

### 6. Rename/restore cập nhật local store ngay

Trong `js/modules/students.js`:

- Sau rename hoặc khôi phục, old ID được remove khỏi store.
- New profile được merge vào đúng bucket ngay.
- Active/quit/debt được invalidate đồng bộ.

Điều này tránh võ sinh đã tập lại còn treo ở tab Đã nghỉ và giảm nguy cơ dùng trạng thái cũ khi thu học phí.

## Luồng dữ liệu mới

```text
Mở tab Đã nghỉ
        ↓
Kiểm tra clubId + completeness + dirty + freshness
        ↓
Nếu chưa đủ/cũ → 1 full profiles snapshot
        ↓
Classify local bằng canonical status
        ↓
studentProfileStore.quitProfiles
        ↓
QuitProfileBoundary
        ↓
Search + branch filter + renderer desktop/mobile
```

Không còn các đường riêng biệt cho search, pagination, mobile và legacy cache sau khi authority complete.

## Kiểm tra đã chạy

### Full pipeline

```text
npm run check — PASS hoàn toàn (exit code 0)
```

### V5R chuyên biệt

```text
check:v5r-quit-single-source-lock — PASS 16/16
check:v5r-quit-source-behavior — PASS 5/5
```

### Tab Đã nghỉ và dữ liệu liên quan

```text
check:v5q-quit-single-authoritative-pipeline — PASS 21/21
check:v5q-quit-store-behavior — PASS 5/5
check:quit-tab-completeness — PASS
check:quit-tab-authoritative-completeness — PASS 9/9
check:quit-tab-mobile-parity — PASS 17/17
check:student-pagination-status-filter — PASS 11/11
check:student-quit-separation — PASS 14/14
check:student-quit-hard-separation — PASS 10/10
check:v4d1a-runtime-recovery — PASS 22/22
```

### Search / học phí / trạng thái

```text
check:search-runtime-v2 — PASS
check:search-runtime-performance — PASS 28/28
check:search-runtime-real-cache — PASS 14/14
check:student-search-index — PASS
check:tuition-debt-source-of-truth — PASS
check:debt-authoritative-tuition-coverage — PASS 32/32
check:active-skipped-month-section — PASS 11/11
check:profile-canonical-store — PASS 27/27
```

### Quyền và các vai trò

```text
check:coach-attendance-only-read-boundary — PASS 30/30
check:security-coach-branch-boundary — PASS 35/35
check:superadmin-monthstats — PASS 8/8
```

### Runtime / deploy

```text
check:runtime-stability-gate — PASS 17/17
check:performance-stability-gate — PASS 27/27
check:render-warning-coalescing — PASS 14/14
check:github-pages-paths — PASS 18/18
check:deploy-package — PASS 12/12
```

## Cache-bust

```text
quit-single-source-lock-20260721-v5r
```

APP patch:

```text
4K-6V5R-quit-single-source-lock-20260721
```

## Deploy

V5R chủ yếu sửa Hosting/source. Nếu production đã dùng Firestore Rules từ V5K/V5H/V5C thì không cần thay Rules riêng cho V5R.

Sau deploy cần hard refresh/xóa cache site và xác nhận console/network đang tải build V5R.

## Kết luận

Nguyên nhân chính không còn là thiếu thêm một alias trạng thái, mà là **nhiều nguồn không đồng bộ cùng được quyền quyết định danh sách**. V5R giải quyết bằng single-source lock, club-scoped completeness, freshness revalidation, dirty detection và renderer/search dùng chung một boundary.

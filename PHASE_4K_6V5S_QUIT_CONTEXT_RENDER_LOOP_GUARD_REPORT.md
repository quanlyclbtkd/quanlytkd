# Phase 4K-6V5S — Quit Context + Render Loop Guard

## Vấn đề thực tế từ console V5R

File log production ghi nhận:

- `Quit authority missing context — cannot guarantee full list`: **1.785 lần**.
- `login_history ... Missing or insufficient permissions`: **1 lần**.
- `Slow render "students.quitList": 20.4ms`: **1 lần**.
- Không có `LargeListWarning` hoặc `RenderStormWarning` trong log được cung cấp.

Cảnh báo chính lặp theo chuỗi:

```text
renderQuitIsland
  → QuitProfileBoundary.ensureComplete
  → ensureQuitProfilesComplete
  → loadQuitProfilesIfNeeded
  → missing context / false
  → invalidate students.quitList
  → renderQuitIsland lặp lại
```

## Nguyên nhân gốc

### 1. Quit authority phụ thuộc `_ctx` được tạo quá muộn

V5R chỉ có đủ `profRef`, `db`, `clubId` sau khi `mountActiveProfilesListener()` chạy. Khi người dùng mở tab Đã nghỉ trước thời điểm đó, quit authority không có context để thực hiện full reconciliation.

### 2. Renderer tự invalidate dù authority chưa tải được

`renderQuitIsland()` gọi `ensureComplete()`, nhưng luồng cũ vẫn invalidate `students.quitList` sau khi Promise hoàn tất, kể cả kết quả `false`. Điều này tạo render loop liên tục.

### 3. Nhiều nơi cùng yêu cầu ensure authority

Tab switch legacy, render island, render invalidation và scheduler có thể đồng thời gọi `ensureQuitAuthority()`. V5R chưa có single-flight/backoff đủ mạnh cho trường hợp thiếu context.

### 4. `login_history` chưa có rule tương ứng trên production

Login audit là chức năng phụ, nhưng mỗi lần ghi bị permission denied đã tạo cảnh báo console. Lỗi này không liên quan dữ liệu võ sinh, nhưng cần xử lý riêng và an toàn.

## Thay đổi V5S

### A. Context recovery không tạo thêm Firestore reads

Trong `profiles.listeners.js` đã thêm `_resolveProfilesContext()` để khôi phục context từ các nguồn runtime đã tồn tại:

- context truyền trực tiếp;
- `_ctx` của profiles listener;
- `window.getAppContext()`;
- `window.__store`;
- `db + clubId` để dựng lại `profRef` bằng SDK `collection()`.

Đây chỉ là phục hồi reference, không gọi `getDocs`, `getDoc` hoặc `onSnapshot` mới.

### B. Chờ context có giới hạn

Khi context chưa sẵn sàng:

- trạng thái chuyển thành `waiting-context`;
- không ghi `console.warn` liên tục;
- tối đa 5 retry với backoff;
- thức dậy khi có `app:context-ready` hoặc `app:db-ready`;
- retry timer/listener được cleanup khi reset/đổi CLB.

### C. Single-flight + backoff tại QuitProfileBoundary

- Mọi yêu cầu ensure đồng thời dùng chung một Promise.
- Kết quả false/failure bị backoff 1.200ms.
- Không phát sinh chuỗi ensure song song.

### D. Cắt render loop

`renderQuitIsland()` không còn gọi `invalidateList('students.quitList')` sau `ensure(false)`.

Chỉ render lại một lần khi:

```text
ok === true
và QuitProfileBoundary.isComplete() === true
```

Tab switch legacy cũng áp dụng điều kiện tương tự.

### E. Giữ nguyên single-source của tab Đã nghỉ

V5S không thay đổi logic V5R:

- Khi complete, nguồn duy nhất vẫn là `studentProfileStore.quitProfiles`.
- Preview legacy chỉ dùng trong lúc authority chưa complete.
- Không khôi phục HTML cache cũ.
- Không đổi classifier active/quit.
- Không đổi search, branch filter, mobile renderer hoặc hành động khôi phục võ sinh.

### F. `login_history` an toàn hơn

Runtime:

- Sau một permission denial, ghi cờ block cho session hiện tại.
- Không retry ở mỗi auth callback.
- Không cảnh báo production; chỉ hiện khi bật `loginHistoryDebug=1`.

Firestore Rules:

- User đăng nhập chỉ được tạo bản ghi có email của chính họ.
- Chỉ cho phép đúng danh sách field audit.
- Chỉ SuperAdmin được đọc/xóa.
- Không có public read/write.
- Không thay đổi Rules của `clubs/{clubId}/profiles`.

## Kết quả kiểm tra

### Kiểm tra chuyên biệt V5S

```text
check:v5s-quit-context-render-loop-guard — PASS 16/16
check:v5s-quit-context-behavior — PASS 6/6
```

Behavior test xác nhận:

- nhiều ensure đồng thời chỉ gọi một loader;
- false result được backoff;
- context được khôi phục từ runtime store dù active listener chưa mount;
- full snapshot vẫn phân loại đúng quit bucket;
- context recovery được ghi metrics, không spam console.

### Regression tab Đã nghỉ

```text
check:v5r-quit-single-source-lock — PASS 16/16
check:v5r-quit-source-behavior — PASS 5/5
check:v5q-quit-single-authoritative-pipeline — PASS 21/21
check:v5q-quit-store-behavior — PASS 5/5
check:quit-tab-completeness — PASS 10/10
check:quit-tab-authoritative-completeness — PASS 9/9
check:quit-tab-mobile-parity — PASS 17/17
check:student-pagination-status-filter — PASS 11/11
check:student-quit-separation — PASS 14/14
check:student-quit-hard-separation — PASS 10/10
check:v4d1a-runtime-recovery — PASS 22/22
```

### Luồng ổn định liên quan

```text
check:security-coach-branch-boundary — PASS 35/35
check:coach-attendance-only-read-boundary — PASS 30/30
check:attendance-canonical-ownership — PASS 141 assertions
check:attendance-shift-filter — PASS 10/10
check:superadmin-hotfix — PASS 27/27
check:superadmin-monthstats — PASS 8/8
check:superadmin-audit — PASS
check:performance-stability-gate — PASS 27/27
check:runtime-stability-gate — PASS 17/17
check:production-stability-gate — PASS 22/22
check:github-pages-paths — PASS 18/18
check:deploy-package — PASS 12/12
```

### Kiểm tra toàn bộ mặc định

```text
npm run check — PASS hoàn toàn
Exit code: 0
```

Trong quá trình chạy full check, một regression gate cũ (`check:v4d1a-runtime-recovery`) còn tìm trực tiếp lời gọi `ensureComplete()` trong renderer. V5S đã đưa lời gọi này vào helper single-flight `_requestQuitAuthorityForRender()`, nên test cũ báo fail giả. Gate đã được cập nhật để chấp nhận helper an toàn mới và sau đó PASS 22/22.

## Deploy

Để xử lý đầy đủ cần deploy:

1. Hosting/source V5S.
2. Firestore Rules V5S để `login_history` ghi đúng quyền.

Nếu chỉ deploy Hosting, render loop và spam `Quit authority missing context` vẫn được xử lý; tuy nhiên login history sẽ tiếp tục không được lưu cho tới khi Rules được deploy.

Sau deploy cần hard refresh/xóa cache. Build đúng:

```text
quit-context-render-loop-guard-20260722-v5s
```

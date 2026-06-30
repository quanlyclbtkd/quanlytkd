# Phase 4K-6V4D9 — Coach Warning Cleanup

## Mục tiêu
Đọc log console khi đăng nhập tài khoản HLV, phân loại từng nhóm warning/error, và sửa đúng nguyên nhân thay vì chỉ ẩn cảnh báo.

## Nhóm cảnh báo trong log

### 1. Finance lazy module TDZ
Log:
`[BOOT] 4K-6S global ownership adoption failed: ReferenceError: Cannot access '__financeModule' before initialization`

Nguyên nhân: `registerFinanceUiGlobals()` được gọi trong block global ownership adoption trước khi biến lazy finance `let __financeModule` được khởi tạo. Đây là lỗi TDZ của ES module.

Sửa: đổi lazy finance module state sang `var __financeModulePromise` và `var __financeModule`, để hàm bootstrap sớm không crash do TDZ. Finance vẫn lazy-load và vẫn bị skip trong phiên Coach attendance-only.

### 2. login_history permission-denied
Log:
`[login_history] Không thể ghi lịch sử đăng nhập: Missing or insufficient permissions.`

Nguyên nhân: `login_history` là audit phụ trợ nhưng rules chưa có create rule phù hợp cho self login record, trong khi client log bằng `console.warn`, khiến HLV tưởng là lỗi đăng nhập/điểm danh.

Sửa:
- Ghi thêm `uid` vào login history payload.
- Thêm Firestore Rules cho phép user đã đăng nhập tạo đúng record của chính mình, read/update/delete vẫn SuperAdmin-only.
- Nếu production rules cũ chưa deploy và vẫn permission-denied, client chỉ `console.info` và không retry cảnh báo trong cùng session.

### 3. RenderStormWarning attendance tăng liên tục
Log:
`[RenderStormWarning] domain="attendance" — 11/12/13... invalidations/sec.`

Nguyên nhân: V4D8 mở quá nhiều `onSnapshot` theo từng field/alias cơ sở legacy cho HLV. Mỗi snapshot gọi `_invalidateAll()` và render lại điểm danh, làm vượt ngưỡng storm.

Sửa:
- Không mở live `onSnapshot` cho mọi field legacy nữa.
- Chỉ giữ listener chính branch-scoped; legacy field recovery chuyển sang one-shot fallback.
- `_invalidateAll()` cho Coach được debounce/coalesce 80ms trước khi repaint attendance.
- Render storm guard chỉ warn một lần mỗi cửa sổ 1 giây, không spam liên tục.

### 4. Permission-denied từ các branch-field query legacy
Log:
`[ProfilesListener] Coach branch field query failed: trainingBase=... permission-denied` và các field như `trainingLocation`, `co_so`, `coSoTap`, `site`, `campusName`, `noiTap`, `diaDiemTap`.

Nguyên nhân: V4D8 dùng `onSnapshot` trực tiếp cho nhiều field cơ sở legacy. Nếu Firestore Rules production chưa deploy đúng, hoặc tên cơ sở trong settings không khớp tuyệt đối, mỗi listener bị permission-denied và tạo warning/storm.

Sửa:
- Không đăng ký live listener cho các field legacy dễ bị deny.
- One-shot fallback vẫn branch-scoped, vẫn thử đọc legacy fields để cứu roster cũ, nhưng permission-denied trên field tùy chọn chỉ ghi debug, không cảnh báo người dùng.
- Không mở full-club cho HLV.

## File chính đã sửa
- `js/main.js`
- `app.js`
- `js/listeners/profiles.listeners.js`
- `js/ui/render/renderInvalidation.js`
- `firestore.rules`
- `package.json`
- `tools/check-v4d9-coach-warning-cleanup.mjs`
- Đồng bộ các file tương ứng trong `public/`

## Kiểm tra đã chạy
- `npm run check:syntax` — PASS
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:v4d4-coach-quit-authoritative-fix` — PASS 17/17
- `npm run check:v4d5-coach-quit-attendance-full-recovery` — PASS 12/12
- `npm run check:v4d6-coach-attendance-root-cause-recovery` — PASS 12/12
- `npm run check:v4d7-coach-attendance-deep-branch-recovery` — PASS 13/13
- `npm run check:v4d8-coach-attendance-auth-roster-final-recovery` — PASS 18/18
- `npm run check:v4d9-coach-warning-cleanup` — PASS 12/12
- `npm run check` — PASS toàn bộ pipeline

## Ghi chú deploy
Bản này có sửa `firestore.rules`. Cần deploy cả Hosting/source và Firestore Rules. Nếu chỉ upload source, warning `login_history permission-denied` sẽ được hạ xuống `console.info`, nhưng rules mới chưa có tác dụng cho audit self-create.

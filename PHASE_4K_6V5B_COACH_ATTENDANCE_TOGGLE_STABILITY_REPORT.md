# Phase 4K-6V5B — Coach Attendance Toggle Stability

## Mục tiêu
Sửa lỗi riêng trên tài khoản HLV khi điểm danh web/mobile: bấm nhiều lần để chuyển trạng thái `✅ Có mặt → ❌ Nghỉ không phép → 📝 Nghỉ có phép` nhưng trạng thái lại nhảy/hoàn về `✅ Có mặt`.

## Nguyên nhân kỹ thuật

Lỗi không nằm ở quyền Firestore hay danh sách HLV rỗng. Danh sách HLV vẫn phải được load branch-scoped. Lỗi nằm ở interaction state trong tab Điểm danh:

1. Card điểm danh dùng inline `onclick` trên toàn thẻ.
2. Trên mobile/coach, render/invalidation có thể xảy ra giữa các lần tap do profile listener/attendance render lifecycle.
3. `renderAttendanceList()` gọi `loadByDate()`, reset `_attendanceCache = {}` rồi render lại từ dữ liệu Firestore hiện có.
4. Nếu lần ghi đầu tiên chưa ack hoặc snapshot/render lấy dữ liệu cũ, lần tap thứ hai có thể đọc lại trạng thái cũ `0`, nên lại tính `0 + 1 = ✅ Có mặt` thay vì `1 + 1 = ❌ Nghỉ không phép`.
5. HLV dễ gặp hơn Admin vì luồng HLV có nhiều branch/profile recovery + render attendance hơn; các log cũ cũng cho thấy attendance từng bị `RenderStormWarning` ở HLV.

## Phương án đã chọn

Không thay đổi Rules và không đổi model dữ liệu. Sửa đúng tại boundary tương tác Điểm danh:

- Thêm pending write guard theo `docId`.
- Giữ optimistic state local khi render reload xảy ra.
- Tính lần tap tiếp theo từ optimistic status nếu Firestore write trước đó chưa hoàn tất.
- Chặn duplicate tap event sinh đôi trên mobile trong khoảng rất ngắn.
- Không bỏ các thao tác click hợp lệ của HLV; nếu HLV bấm lần 2 bình thường, hệ thống vẫn chuyển sang `❌ Nghỉ không phép`.
- Branch filter danh sách HLV ưu tiên `profileBranchMatchesFilter()` nếu có, fallback về `_sameBranch()`.
- Save attendance branch ưu tiên `branchCode` trước `branch` để phù hợp dữ liệu canonical mới.

## File đã sửa

- `js/modules/attendance.js`
- `public/js/modules/attendance.js`
- `js/main.js`
- `public/js/main.js`
- `index.html`
- `public/index.html`
- `app.js`
- `public/app.js`
- `tools/check-v5b-coach-attendance-toggle-stability.mjs`
- `tools/check-security-coach-branch-boundary.mjs`
- `tools/check-coach-branch-runtime-repair.mjs`
- `package.json`
- `public/package.json`

## Kiểm tra đã chạy

- `node -c js/modules/attendance.js` — PASS
- `node -c public/js/modules/attendance.js` — PASS
- `node -c js/main.js` — PASS
- `node -c app.js` — PASS
- Node syntax check toàn bộ JS nguồn chính — PASS
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:v5b-coach-attendance-toggle-stability` — PASS 13/13

`npm run check` đầy đủ bị timeout ở `check:syntax` trong môi trường hiện tại, nên tôi đã chạy kiểm tra cú pháp JS trực tiếp và các nhóm test trọng yếu liên quan Điểm danh/HLV/Branch/Rules. Không có lỗi ở các nhóm đã chạy.

## Kết quả kỳ vọng sau deploy

- HLV vẫn load danh sách võ sinh theo cơ sở được giao.
- Bấm lần 1: `✅ Có mặt`.
- Bấm lần 2: `❌ Nghỉ không phép`.
- Bấm lần 3: `📝 Nghỉ có phép`.
- Render reload hoặc Firestore snapshot cũ không kéo trạng thái về `✅ Có mặt` trong lúc write đang pending.
- Admin không bị ảnh hưởng vì vẫn dùng cùng module attendance canonical, các test ownership/attendance đều PASS.

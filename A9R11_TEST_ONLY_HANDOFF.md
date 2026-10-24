# A9R11 — COACH ATTENDANCE OPERATIONAL · TEST ONLY

## Mục tiêu
Mở lại đúng luồng Điểm danh cho tài khoản HLV, không tạo writer mới và không nới quyền tài chính.

## Nguyên nhân gốc
1. Client chặn Coach bằng `HISTORY_COACH_ACCESS=false`, nên `_requestAttendanceDailyRefresh()` dừng trước bước tải Ca tập và roster.
2. Firestore Rules chặn Coach bằng `coachAttendanceCutoverOpen() = false`, nên chỉ mở UI vẫn không thể ghi.
3. Nếu bật lại ngay trên Journal V3, intent cũ còn trên thiết bị có thể được replay sau nâng bản.

## Sửa A9R11
- `HISTORY_COACH_ACCESS=true`.
- `coachAttendanceCutoverOpen()=true`.
- Fresh forward-only authority: `attendance-history-1aedda93-9437-4132-9694-35c2e6234d55`.
- Journal mới: `tst-attendance-journal-v4`; V3 được giữ nguyên, không replay/xóa tự động.
- Legacy localStorage import vẫn `needs-review`, không auto-claim.
- Giữ nguyên writer/CAS, canonical profile-branch check, `allowedBranches`, cấm delete, cấm tài chính.
- Root/Public 128/128.

## Hành vi
- HLV thấy Ca tập từ `settings/shifts`.
- HLV thấy võ sinh thuộc các cơ sở trong `allowedBranches` và có thể đổi giữa CS1/CS2 nếu được cấp.
- HLV tạo/cập nhật attendance mới dùng A9R11 authority + CAS.
- Attendance lịch sử authority cũ không hiển thị/không sửa được bởi HLV; Admin vẫn đọc được.
- Không tự migrate hoặc promote lịch sử cũ.

## Kiểm thử
Xem `evidence/A9R11/A9R11_FINAL_QA_SUMMARY.json`. Emulator runner: `Run-A9R11-Coach-Attendance-Emulator.ps1`.

## Rollback server
`firestore.rules.a9r11.rollback` giữ nguyên authority nhưng trả `coachAttendanceCutoverOpen()=false`. Không xóa attendance/Journal.

## Trạng thái
TEST ONLY. Chưa deploy tự động. Nếu test trên project thật, source A9R11 và Rules A9R11 phải tương thích; production web cũ vẫn có client maintenance guard.

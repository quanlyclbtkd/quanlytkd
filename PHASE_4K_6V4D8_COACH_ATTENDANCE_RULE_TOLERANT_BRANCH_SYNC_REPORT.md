# Phase 4K-6V4D8 — Coach Attendance Rule-Tolerant Branch Sync Repair

## Mục tiêu
Sửa lỗi tài khoản HLV đăng nhập được nhưng tab Điểm danh không load đầy đủ võ sinh trong cơ sở được giao, đồng thời xử lý lỗi Console:

```txt
[ProfilesFallback] Coach branch load failed: permission-denied
```

## Nguyên nhân gốc
Bản V4D7 đã mở rộng query theo `branch`, `branchCode`, `coachBranch` và alias cơ sở. Tuy nhiên vẫn còn 2 lỗi:

1. **Firestore Rules vẫn dùng `isAllowedCoachBranch(myBranch())` quá cứng**
   - Nếu `users/{uid}` của HLV cũ đang lưu branch bằng tên cơ sở như `Nguyễn Trãi` hoặc `Cơ sở Nguyễn Trãi`, Rules không xem đây là Coach hợp lệ.
   - Khi client query hồ sơ theo alias/tên cơ sở, Rules có thể từ chối một số query bằng `permission-denied`.

2. **Fallback dùng `Promise.all()` nên một query alias bị từ chối làm hỏng toàn bộ fallback**
   - Chỉ cần một spec như `branchCode == Nguyễn Trãi` bị Rules từ chối, `loadCoachBranchProfilesFallback()` thất bại hoàn toàn.
   - Kết quả là danh sách Điểm danh chỉ còn phần dữ liệu từ các listener/query đã chạy thành công trước đó.

## Đã sửa

### Runtime
- `loadCoachBranchProfilesFallback()` chuyển sang xử lý từng query spec độc lập.
- Một alias bị `permission-denied` không còn làm hỏng toàn bộ fallback.
- Fallback giữ lại dữ liệu đã load thành công từ listener/query trước đó và chỉ merge thêm dữ liệu hợp lệ.
- `ensureCoachBranchProfilesHydrated()` cũng bỏ qua từng spec bị từ chối thay vì ghi đè danh sách bằng rỗng.
- Listener HLV khi gặp `permission-denied` ở một alias sẽ không xóa toàn bộ danh sách đã có.

### Firestore Rules
- Thêm `branchValueMatchesCode()`.
- Thêm `branchValueIsKnownInClub()`.
- Thêm `branchPairMatchesCode()`.
- Thêm `branchEquivalentInClub()`.
- `isCoach()` không còn chỉ chấp nhận `CS1...CS10`, mà chấp nhận cả branch legacy hợp lệ theo cấu hình cơ sở.
- `branchMatchesAssigned()` so khớp theo tương đương cơ sở trong CLB, thay vì so trực tiếp một chiều.

## Không thay đổi
- Không mở public rules.
- Không cho HLV đọc toàn bộ CLB.
- Không cho HLV đọc tài chính, kho đồ, báo nợ, thống kê.
- Không thêm query full-club cho HLV.

## Cache bust
Đã bump runtime marker:

```txt
coach-attendance-branch-rule-tolerant-20260630-v4d8
```

## Kiểm tra đã chạy
- `npm run check:syntax` — PASS
- `npm run check:coach-attendance-branch-scope` — PASS
- `npm run check:security-coach-branch-boundary` — PASS
- `npm run check:coach-attendance-only-read-boundary` — PASS
- `npm run check:coach-branch-runtime-repair` — PASS

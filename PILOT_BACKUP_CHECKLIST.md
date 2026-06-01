# Pilot Backup Checklist

> Phase 4.0B-4G — Taekwondo Club Management SaaS
> Thực hiện checklist này TRƯỚC KHI giao CLB dùng thật.

---

## Thông tin CLB

- [ ] Xác định Firebase project (`firebase use --list`)
- [ ] Xác định `clubId` của CLB
- [ ] Ghi lại admin email của CLB
- [ ] Ghi lại ngày giờ bàn giao

---

## Backup dữ liệu

- [ ] Export dữ liệu Firestore hiện tại (dùng Firebase Console → Import/Export hoặc gcloud CLI)
- [ ] Lưu file export ra Google Cloud Storage hoặc local
- [ ] Ghi lại số lượng documents: profiles, transactions, inventory

---

## Xác định Data Source

Chạy trong browser console sau khi login:

```js
await window.resolveActiveDataSource()
```

- [ ] Ghi lại `source`:
  - `primary` → dùng `clubs/{clubId}/...`
  - `legacy-root` → dùng `tst_profiles`, `tst_transactions`, `tst_inventory`
  - `empty` → chưa có dữ liệu
  - `permission-error` → lỗi quyền truy cập

---

## Chụp kết quả runtime

Chạy từng lệnh trong browser console và lưu kết quả:

```js
// 1. Kiểm tra data đã load
window.printDataHydrationStatus()

// 2. Kiểm tra các tab sẵn sàng
window.printPilotTabReadiness()

// 3. Kiểm tra trạng thái pilot
window.printTenClubPilotReadiness()
```

- [ ] `printDataHydrationStatus()` — lưu kết quả
- [ ] `printPilotTabReadiness()` — lưu kết quả
- [ ] `printTenClubPilotReadiness()` — lưu kết quả
- [ ] `readyForTenClubPilot` = true (nếu false → xem `blockers`)

---

## Kiểm tra tabs chính

- [ ] Tab **Học phí** hiển thị đúng
- [ ] Tab **Báo nợ** hiển thị đúng
- [ ] Tab **Đang tập** hiển thị đúng
- [ ] Tab **Đã nghỉ** hiển thị đúng
- [ ] Tab **Kho đồ** hiển thị đúng
- [ ] Tab **Tổng quan** hiển thị đúng

---

## Ràng buộc bắt buộc

- [ ] KHÔNG migration tự động
- [ ] Nếu cần migration, tạo dry-run report riêng trước khi thực hiện
- [ ] KHÔNG ghi Firestore trong recovery/fallback
- [ ] KHÔNG mở Firestore Rules public

---

## Xác nhận bàn giao

- Ngày giờ bàn giao: _______________
- Người thực hiện: _______________
- CLB: _______________
- clubId: _______________
- activeDataSource: _______________
- readyForTenClubPilot: _______________
- Ghi chú: _______________

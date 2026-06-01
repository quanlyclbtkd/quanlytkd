# Pilot Issue Report

> Phase 4.0B-4H — Taekwondo Club Management SaaS
> Sao chép template này cho mỗi issue phát sinh trong quá trình pilot.
> Điền đầy đủ trước khi báo cáo hoặc escalate.

---

## Thông tin cơ bản

- **Ngày giờ phát hiện**: 
- **CLB (Club name)**: 
- **clubId**: 
- **Người phát hiện**: 
- **Môi trường**: ☐ Local  ☐ Production
- **Browser**: 
- **Bước trong Runbook**: 

---

## Tab bị lỗi

- [ ] Học phí
- [ ] Báo nợ
- [ ] Đang tập
- [ ] Đã nghỉ
- [ ] Kho đồ
- [ ] Tổng quan
- [ ] Điểm danh
- [ ] Thi đai
- [ ] Login / Xác thực
- [ ] Khác: _______________

---

## Mô tả lỗi

Mô tả ngắn gọn triệu chứng:

```
[Điền mô tả lỗi ở đây]
```

---

## Output printOneClubPilotGate()

Chạy trong console và paste kết quả:

```js
window.printOneClubPilotGate()
```

```
[Paste output ở đây]
```

---

## Output generatePilotLaunchSnapshot()

Chạy trong console và paste JSON:

```js
const snap = await window.generatePilotLaunchSnapshot()
console.log(JSON.stringify(snap, null, 2))
```

```json
[Paste JSON ở đây]
```

---

## Console errors

Paste tất cả error/warning màu đỏ từ DevTools Console:

```
[Paste console errors ở đây]
```

Ảnh chụp màn hình console (nếu có): _______________

---

## Network errors (nếu có)

Mở tab **Network** trong DevTools, lọc theo `Status: 4xx / 5xx`:

```
[Paste network errors ở đây]
```

---

## Bước tái hiện lỗi

1. 
2. 
3. 

---

## Mức độ ảnh hưởng

- [ ] **Blocker** — không thể dùng app
- [ ] **Critical** — tab chính bị lỗi
- [ ] **Major** — tính năng phụ bị lỗi
- [ ] **Minor** — hiển thị sai nhưng dữ liệu đúng

---

## Cách xử lý đề xuất

```
[Điền đề xuất xử lý hoặc để trống nếu chưa rõ]
```

---

## Trạng thái

- [ ] Mới phát hiện
- [ ] Đang điều tra
- [ ] Đã có fix
- [ ] Đã verify fix
- [ ] Đóng

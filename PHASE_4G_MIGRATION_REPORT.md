# PHASE_4G_MIGRATION_REPORT.md

**Phase:** 4.0B-4G — Safe Legacy-to-Primary Migration Tool  
**Ngày:** 2026-05-31  
**Trạng thái:** Sẵn sàng — cần chạy thủ công khi CLB đồng ý

---

## Mục tiêu

Di chuyển dữ liệu từ legacy root collections (`tst_*`) sang primary SaaS path (`clubs/{clubId}/*`) một cách an toàn, có dry-run và rollback guard.

---

## File mới

| File | Mô tả |
|------|-------|
| `js/migrations/migrate-legacy-to-primary.js` | Migration tool — load vào HTML hoặc chạy trong console |

---

## Cách sử dụng

### Bước 1 — Thêm script vào index.html (chỉ môi trường dev/admin)

```html
<!-- Chỉ load cho admin — KHÔNG đưa vào production build -->
<script src="js/migrations/migrate-legacy-to-primary.js"></script>
```

Hoặc paste toàn bộ nội dung file vào browser console.

### Bước 2 — Dry-run (bắt buộc trước khi migrate thật)

```js
// Xem báo cáo — KHÔNG ghi gì
const report = await window.MigrationTool.dryRun()
```

Kết quả báo cáo gồm:
- Số lượng docs ở legacy (`tst_profiles`, `tst_transactions`, `tst_inventory`)
- Trạng thái primary path (có data chưa)
- `safeToMigrate: true/false`
- `rollbackGuard: true/false`
- `warning` và `nextStep`

### Bước 3 — Migrate thật (chỉ khi dryRun OK)

```js
// Chỉ chạy sau khi dryRun() trả về safeToMigrate: true
await window.MigrationTool.run({ confirm: true })
```

### Bước 4 — Kiểm tra kết quả

```js
window.MigrationTool.getStatus()
```

---

## Tính năng an toàn

| Tính năng | Chi tiết |
|-----------|---------|
| DRY-RUN mặc định | Không ghi gì cho đến khi `run({ confirm: true })` |
| Rollback guard | Không migrate nếu primary đã có data |
| Không xóa legacy | `tst_*` collections được giữ nguyên sau migrate |
| Không overwrite | `merge: false` với guard kiểm tra trước |
| Batch commit | 400 docs/batch — tránh vượt Firestore 500 ops limit |
| Traceability | Mỗi doc được đánh dấu `_migratedFrom` và `_migratedAt` |
| Không log PII | Chỉ log count và ID |

---

## Sau khi migrate

1. Reload app — dữ liệu sẽ tự load từ primary path.
2. `resolveActiveDataSource()` sẽ trả về `source: 'primary'`.
3. `runRuntimeDataRecovery()` sẽ KHÔNG kích hoạt fallback nữa.
4. Legacy data (`tst_*`) vẫn còn — có thể xóa thủ công khi CLB xác nhận OK.

---

## Blocker trước khi migrate

- Cần xác nhận Firestore Rules cho phép write vào `clubs/{clubId}/profiles|transactions|inventory`
- Cần backup thủ công (export Firestore) trước khi chạy
- Cần ít nhất 1 người kỹ thuật xem xét kết quả dryRun() trước khi confirm

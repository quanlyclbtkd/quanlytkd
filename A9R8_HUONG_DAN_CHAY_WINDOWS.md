# Hướng dẫn Windows — A9R8 (chỉ kiểm thử offline)

1. Giữ A9R7 cũ nguyên vẹn. Giải nén A9R8 Full Source vào `D:\A9R8\source`.
2. Mở PowerShell:

```powershell
cd D:\A9R8\source
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R8-Offline.ps1
```

3. Nén log kiểm thử:

```powershell
Compress-Archive -Path .\qa_results_a9r8\* -DestinationPath D:\A9R8\A9R8_OFFLINE_RESULTS.zip -Force
```

4. Không triển khai bản A9R8 lên GitHub Pages/Firebase. Không bật `HISTORY_COACH_ACCESS`; không sửa `coachAttendanceCutoverOpen()` hoặc cấp marker cho lịch sử bằng tay.

5. Khi chủ hệ thống đã có bản sao lưu **đọc-only, được phê duyệt** theo quy trình `tools/v11r3/capture-legacy.mjs`, có thể chạy bộ phân loại bên dưới từ tệp `device-backup.json` (không gửi dữ liệu RAW lên chat):

```powershell
node tools\a9r8\journal-readonly-audit.mjs device D:\Evidence\device-backup.json D:\Evidence\device-review.json demo-project clubId
```

Kết quả luôn là `RELEASE_HOLD_EVIDENCE_INCOMPLETE`, ngay cả khi một thiết bị trống, bởi công cụ không chứng minh được toàn bộ thiết bị và nguồn gốc dữ liệu server.

6. Gửi file `A9R8_OFFLINE_RESULTS.zip` và **chỉ báo cáo tổng hợp đã ẩn danh**; không gửi token Firebase, mật khẩu, danh sách võ sinh, nhật ký chứa PII hoặc dữ liệu thô về tài chính.

Lưu ý: source identity của A9R8 có thay đổi do sửa IndexedDB. Các script cutover đòi source pin mới được kiểm duyệt. FAIL `SOURCE_RUNTIME_NOT_ACCEPTED` không được bỏ qua.

7. Khi đối soát tất cả trình duyệt/thiết bị, cần lập danh mục cả IndexedDB `taekwondo_cache/offline_queue` (một module legacy trong nguồn cũ) dưới quyết định kiểm toán riêng. Công cụ device backup hiện hữu chỉ thu localStorage và Journal V3, vì vậy không được suy luận hàng đợi legacy khác đã trống. Không chạy `startQueueProcessor()` để thử.

# R2.2 — Đo staging thật, giữ nguyên production

Trạng thái handoff: **R2_2_BLOCKED_STAGING_IDENTITY**. Tooling có kiểm thử UNIT_TEST; chưa có số đo staging thật. Không mở R2.3 từ kết quả này.

## 1. Xác minh source trước khi chạy

Input ZIP SHA-256: `047190212d0b0c0647b461d46018d9e9ef76fa83d2848f064c4fa887a738641c`.

Runtime SHA-256: `3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da`.

Toàn bộ production, Rules, indexes, Firebase config, package.json và package-lock.json được giữ nguyên. Source trong handoff không chứa node_modules; lockfile gốc được giữ lại. Các lệnh kiểm tra dưới đây dùng Node và các thành phần vendored đã có, không cần đổi dependencies.

Tại thư mục `source`, chạy:

```sh
node tools/check-finance-sync-write-latency-r2-2.mjs
```

Gate tự bật VM Modules nếu Node yêu cầu. Kết quả chi tiết ở `evidence/FINANCE_LATENCY_R2_2/06_OBSERVER_OFF_ON_INVARIANCE.json`.

Nếu sửa tooling có chủ đích trong phase này, build lại bằng `node tools/r2-2/build-observer.mjs`, rồi chạy lại gate. Không sửa các file production để đo.

## 2. Điều kiện staging bắt buộc

Phải có URL staging, projectId staging đã xác minh không phải production, phiên Admin hiện hành, và fixture tài chính thử an toàn. Source hiện cấu hình `quanly-tst`; source này không chứng minh một runtime staging tồn tại.

Observer phải dùng runtime staging **đã được ứng dụng khởi tạo sẵn**, trên source lineage tương ứng. Không sửa config production trong handoff, không khởi tạo Firebase mới bằng observer, không dùng Emulator thay cho số đo staging. Nếu chưa có runtime đáp ứng điều kiện này, dừng tại trạng thái hiện tại.

Kiểm tra trong phiên staging bằng thao tác đọc:

```js
window.__store?.db?.app?.options?.projectId
location.hostname
typeof window.quickPay
typeof window.FinanceService?.getCompleteMonthEvidence
typeof window.FinanceService?.commitAtomicWritePlan
```

Không đưa UID, clubId, tên võ sinh hoặc search/filter vào bản ghi xuất ra. Xác minh quyền, CLB thử, fixture và source bằng quy trình Admin/DevTools hiện có. Không tạo reader phụ để xác minh.

## 3. Nạp observer ngoài production

Chép nguyên nội dung `tools/r2-2/finance-latency-observer.staging.js` vào DevTools Snippet của **trang staging đã xác minh**. File chỉ tạo factory, không tự install. Không thêm vào index.html, app.js, main.js hoặc service worker.

Nếu R2.1 hoặc R2.2 đang được cài, gọi handle cũ `.restore()` trước. Không cài hai observer cùng lúc.

Chạy trên staging, thay hai placeholder bằng giá trị đã xác minh:

```js
window.r22 = window.FinanceLatencyObserverR22.install({
  environment: 'STAGING',
  expectedProjectId: 'REPLACE_WITH_VERIFIED_STAGING_PROJECT_ID',
  allowedHosts: ['REPLACE_WITH_EXACT_STAGING_HOSTNAME'],
  browserFamily: 'Chromium',
  sessionState: 'warm session',
  networkProfile: 'NORMAL',
  sampleGetDocs: true
});
```

ProjectId thực phải trùng expectedProjectId; hostname phải có trong allowlist chính xác. `quanly-tst` bị từ chối trước khi wrap owner. Các placeholder cũng không thể vượt qua kiểm tra danh tính.

Browser/session/network là thông tin operator khai báo, phải đối chiếu với nhật ký test. Viewport lấy từ runtime. `warm session` và `fresh reload` không đồng nghĩa với “cold cache”.

## 4. Chạy flow bằng UI hiện có

Mỗi lần thu dùng fixture/kỳ chưa thu riêng. Không thu lại cùng kỳ để benchmark, không chỉnh paidUntil/paidMonths/history bằng console. Cleanup chỉ qua workflow Admin được hỗ trợ hoặc quy trình reset disposable dataset đã được chấp thuận sẵn. Hết fixture an toàn thì dừng.

| Scenario | Entry point thực | Gói | Mục tiêu mẫu hợp lệ |
|---|---|---:|---:|
| T01 | Tab Học phí → QuickPay | 1 | ≥3 |
| T03 | Tab Học phí → QuickPay | 3 | ≥3 |
| T06 | Tab Học phí → QuickPay | 6 | ≥3 |
| T12 | Tab Học phí → QuickPay | 12 | ≥3 |
| D01 | Tab Báo nợ → Thu trên mobile | 1 | ≥3 |
| D03 | Tab Báo nợ → Thu nhiều tháng trên mobile | 3 hoặc gói reachable đại diện | ≥3 |

Không gọi quickPay bằng console để giả lập entry point Debt. Observer quan sát active tab tại lúc QuickPay bắt đầu, không chứng minh nút click ban đầu. Ghi riêng entry point thật đã dùng.

Chạy normal network trước. Chỉ chạy slow network khi cấu hình DevTools xác định. Với `networkProfile: 'CONTROLLED_THROTTLE'`, ghi rõ `network: {latencyMs, downloadBytesPerSecond, uploadBytesPerSecond, packetLossPercent}` trong options và nhật ký cấu hình; để null nếu không biết. Không gắn nhãn “3G/4G” thay cho các thông số.

Đo canonical mode chỉ khi staging vốn có coverage tương ứng. Không bật hidden flag/backfill/sửa accountingMonths. Nếu không có: `CANONICAL_REAL_STAGING_NOT_AVAILABLE`.

## 5. Xuất trace, không ghi nghiệp vụ bằng observer

Sau khi thao tác và các tail đã quan sát xong, dùng `window.r22.snapshot()` để xem trạng thái, `window.r22.exportJSON()` để lấy JSON. Trên Chromium DevTools có thể dùng `copy(window.r22.exportJSON())`; clipboard helper này không phải code production.

Không polling snapshot, không fixed timeout, không gọi refresh để ép Debt hoàn tất. Nếu tail chưa đến, giữ nguyên null và ghi pending. Có thể xuất lại theo thao tác thủ công khi UI thay đổi. Xuất dữ liệu trước khi reload hoặc restore nếu còn muốn quan sát tail; restore dừng theo dõi các phản hồi sau đó.

Kết thúc dùng `window.r22.restore()`. Restore idempotent và chỉ khôi phục hook còn thuộc observer; không ghi đè owner mới do ứng dụng thay thế.

## 6. Các giới hạn cần giữ nguyên trong báo cáo

- `quickPayInvocationAt`: mốc action được xác nhận; `uiActionAt = null`, không đo dwell trong modal.
- `primaryAckAt`: reaction fulfillment của Promise `batch.commit()` gốc. Phân biệt `serviceCommitResolvedAt` sau local projection.
- `commandReturnAt = null`: object TuitionCommandBoundary đang frozen; không thay object để wrap. Recorder R2.1 được reuse nhưng marker return được xuất lại dưới tên `quickPayReturn`, không giả làm TCB return.
- Evidence start/end là cửa sổ gọi owner evidence công khai, không phải toàn bộ hàm settlement private.
- Profile/server-fresh/compute/HTML timestamps từ Debt diagnostics dùng Date.now. Raw ACK cũng lấy Date.now cùng reaction để tính các delta cùng domain. Không trừ Date.now với performance.now.
- `debtDomMutationAt`: MutationObserver callback delivery trong Debt island, sau markers của operation khớp. Không phải physical paint hoặc bằng chứng tự động rằng từng row đã đúng.
- Debt stage diagnostics không có đủ counters để chứng minh số invalidation/recompute/render; các trường count đó giữ null. Không suy ra “1 lần” từ một timestamp.
- `coverageStateSamples` chỉ là các trạng thái RAM đọc tại các hook/snapshot; không khẳng định quan sát được mọi transition ở giữa. Xác minh last verified rows và kết quả cuối qua UI hiện có.
- `FIRESTORE_BILLING_NOT_MEASURED` luôn áp dụng.

## 7. Kiểm tra trace trước attribution

Loại khỏi thống kê, nhưng giữ và giải thích trace có overlap, stale owner/session/club, DIAGNOSTIC_FAILURE, reset counter, UNKNOWN source sampling hoặc thiếu raw batch ACK. Không bỏ mẫu chậm hợp lệ. `VALID_PRE_ACK_ATTRIBUTION` chỉ là tính đầy đủ phần pre-ACK; cần thêm Debt/UI evidence riêng.

Các marker thiếu giữ null. Residual chỉ dùng khi owner/page accounting đủ, không overlap và cùng clock. Không ép residual âm về 0. Không suy nguyên nhân network từ riêng thời gian batch ACK; interval đó còn bao gồm SDK/server và scheduling.

Không gộp flow, monthCount, readMode, warm/fresh, network hoặc viewport khác nhau vào một median. Chỉ báo min/max/median khi có ≥3 valid traces cùng nhóm; 1–2 mẫu ghi LOW_SAMPLE_COUNT, không p95/p99.

Thực hiện UI_SMOKE riêng ở 320/375/390/430 px. Phân biệt viewport emulation với physical-device acceptance. Timing observer không tự chứng minh layout, touch target, focus hoặc paint.

## 8. Correctness stop và đóng phase

Nếu xuất hiện duplicate write, sai tháng/số tiền/profile/CLB, paidUntil regression, paidMonths mismatch, partial commit, success trước failed write, permission inconsistency hoặc projection sang context khác: dừng performance phase, lưu evidence đã masking và phân loại correctness RED. Không tiếp tục benchmark, không sửa production trong R2.2.

Sau khi có staging thật, cập nhật 07–15 bằng dữ liệu thật; không trộn sample UNIT_TEST trong file raw staging. Chỉ mở đề xuất R2.3 khi bottleneck có runtime evidence đủ và lặp lại. Không chạy R2.3 optimization trong phase này.

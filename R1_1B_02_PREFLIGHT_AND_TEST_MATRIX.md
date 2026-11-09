# R1.1B — Preflight and mandatory matrix

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1B. Evidence handoff; no new business candidate.

| Component | Observed |
| --- | --- |
| Execution OS | Linux 6.18.57; no Windows execution claimed |
| Node | 24.22.1 |
| npm | 11.9.0 |
| Firebase CLI | 15.22.3 |
| Playwright | 1.62.1 |
| Java | OpenJDK21.0.13 |
| npm ci | exit0;723 packages installed from unchanged lockfile |
| Playwright browser install | failed: downloaded Chrome archive invalid |
| Declared Playwright Chromium | not installed |
| System Chromium selected | /usr/bin/chromium exists; selected through supported executable override |
| Minimal smoke | launch failed; blank page never opened |
| Existing R1.1 suite | not invoked after failed preflight |
| Emulator/Rules in R1.1B | NOT_RUN; previous R1.1 startup is historical |
| Final | BLOCKED_TEST_DEPENDENCY |

Actual error from this retest:

```text
FATAL: chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
```

Đã thực hiện smoke tối thiểu bằng Playwright, nhưng môi trường hiện tại vẫn không đáp ứng yêu cầu Chromium-capable. Theo mục8/42 của yêu cầu, dừng trước Emulator acceptance; không chạy thêm business test và không đánh business FAIL. Node/npm/Firebase/Playwright/Java version commands đều exit0; vấn đề nằm ở khả năng khởi động browser trong môi trường này, không phải bằng chứng Inventory defect.

`npx --no-install playwright install chromium` dùng đúng Playwright khai báo, không update versions; download thất bại với `End of central directory record signature not found`. System Chromium có sẵn cũng không vượt qua launch smoke. Raw install/launch logs giữ nguyên. Không nới môi trường bảo vệ hoặc production Rules để tạo PASS.

| Mandatory row | Result | Reason |
| --- | --- | --- |
| SDK01 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| RULE01 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| RULE02 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| RULE03 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| RULE04 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| RULE05 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| C01 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| C02 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| C03 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| C04 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| R01 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| R02 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| R03 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| R04 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| R05 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| E01 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| E02 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| E03 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| E04 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| E05 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| D01 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| D02 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| D03 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| D04 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| X01 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| X02 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| P01 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| P02 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| P03 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |
| P04 | NOT_RUN | Chromium preflight blocked; existing suite not invoked |

30 rows là **NOT_RUN**, không phải30 FAIL và không phải PASS. SDK_VERSION10.7.1, actual InventoryService browser import, real Rules allow/deny, transaction conflict/retry/read-back và cross-domain atomicity đều chưa được quan sát ở R1.1B. Browser business request count không được dùng để suy ra Firestore read cost bằng0; transaction attempts/authority reads là NOT_OBSERVED.

Tệp evidence của phase cũ evidence/INVENTORY_R1_1/ được giữ nguyên. Emulator DID start / Rules DID load ở đó là lịch sử R1.1, không được tính vào lần R1.1B đã dừng ở preflight.

Máy chạy tiếp theo phải qua launch → blank page → close trước khi gọi alias. Trên Windows có thể chạy các lệnh hiện hữu sau, kiểm tra exit code mỗi bước:

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED_TEST_DEPENDENCY: npm ci' }
npx playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED_TEST_DEPENDENCY: browser install' }
node -e "const {chromium}=require('playwright'); (async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('about:blank');await b.close()})().catch(e=>{console.error(e);process.exit(1)})"
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED_TEST_DEPENDENCY: Chromium smoke' }
npm run check:inventory-stock-authority-r1
if ($LASTEXITCODE -ne 0) { throw 'R1_REGRESSION' }
npm run test:inventory-stock-emulator-r1-1
if ($LASTEXITCODE -ne 0) { throw 'Acceptance incomplete: inspect classification/evidence' }
```

Giữ cấu hình127.0.0.1:8180 và demo-a9r18-inventory-r11 trong launcher hiện hữu. Nếu browser đủ điều kiện mà real Rules/runtime RED xuất hiện, dừng và thu evidence, không sửa production trong retest. Không cần thay đổi app để giải quyết blocker preflight này.

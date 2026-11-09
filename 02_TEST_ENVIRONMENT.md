# 02 — Test environment and exact blocker

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.

| Component | Observed state |
| --- | --- |
| Project | demo-a9r18-inventory-r11; production project never used |
| Config | existing firebase.json,127.0.0.1:8180, unchanged |
| Node | 24.22.1 |
| Java | OpenJDK21.0.13 |
| Firebase CLI / Emulator | 15.22.3 / Firestore1.21.0 |
| Node Firebase / Rules test SDK | 12.15.0 /5.0.0 |
| Playwright | 1.62.1; declared dependencies installed with npm ci |
| System Chromium | 156.0.8078.79 binary present, launch failed |
| Browser SDK | vendored10.7.1 files present; browser execution NOT RUN |
| Emulator | actually started and reached by test process |
| Actual Rules | uploaded via initializeTestEnvironment; SHA verified |
| Browser clients | 0 initialized |
| Full SPA | not started |
| Final classification | BLOCKED_TEST_DEPENDENCY |

Exact browser failure:

```text
FATAL: chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
```

Đây là thiếu khả năng chạy Chromium với IPC socket tiêu chuẩn trong môi trường thực thi, không phải thiếu file executable. Chưa có Inventory business call trong browser. Không có bằng chứng `BLOCKED_RUNTIME_RED` hoặc `BLOCKED_RULES_RED`.

Đã thử dependency fallback chuẩn `playwright install chromium-headless-shell`: archive tải về không hợp lệ (`End of central directory record signature not found`). Gói Debian headless cũng không có trong local package catalog. Không đổi Rules, app source hay sandbox để biến kết quả thành PASS.

Lần đầu Emulator và checker chạy ở process namespace khác nhau nên localhost8180 bị ECONNREFUSED. Launcher mới dùng `emulators:exec` để cùng process tree: Emulator kết nối/nạp Rules thành công, sau đó dừng ở Chromium. Raw attempts giữ lại nguyên vẹn, canonical là `evidence/INVENTORY_R1_1/final/ACCEPTANCE.json`. Không coi các attempt môi trường là mẫu performance hoặc business failure.

Phiên bản CLI/Emulator ở trên là bản thực cài từ lockfile hiện hữu; không thêm Firebase SDK dependency mới. Node Firebase12 chỉ dùng cho môi trường test/admin; không được tính thay Browser SDK10 acceptance.

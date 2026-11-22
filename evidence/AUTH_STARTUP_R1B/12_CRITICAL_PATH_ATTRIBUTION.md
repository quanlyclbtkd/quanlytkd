# 12 — Critical-path attribution

**Chưa có số đo; primary candidate = null.** Không chọn `NO_SINGLE_DOMINANT` để thay cho việc chưa chạy. Không chọn main graph hoặc registry chỉ từ quan hệ source.

| Interval bắt buộc | Kết quả hiện tại |
|---|---|
| verifiedAuthCommit → mainJsRequestStart | null / NOT_RUN |
| mainJsRequestStart → mainJsRequestEnd | null / NOT_RUN |
| mainJsRequestEnd → mainJsExecuted | null / NOT_RUN |
| mainJsExecuted → listenerRegistryReady | null / NOT_RUN |
| listenerRegistryReady → clubListenerRegistered | null / NOT_RUN |
| clubListenerRegistered → clubAuthorityAccepted | null / NOT_RUN |

Không cộng các interval có thể chồng lấp. Một interval âm (ví dụ main request đã bắt đầu trước auth commit) mô tả overlap, không phải thời gian tiết kiệm hoặc dữ liệu để ép về 0. Giữ fetch, module graph dependency wait và CPU evaluation riêng.

Source cho thấy registry bridge nằm trong main initialization, được expose trước canonical profile function về vị trí text trong cùng bootstrap. Điều này chưa chứng minh một frame/race lỗi hoặc latency winner. Cần kiểm native event loop, successful main completion và profile owner thật trước khi bàn thay đổi thứ tự.

Registry wait hiện tại 10000 ms. Legacy bootstrap deadline 15000 ms chỉ bảo vệ chờ `_fb_init`, `__appLoaded` và `scheduleRender` **trước main injection**; không được gọi nó là timeout tải main.js sau khi request đã bắt đầu. R1B không thay cả hai giá trị.

First-safe readiness cần đúng UID/users/role/club/Coach branch, accepted club authority, main runtime/default-tab handler, canonical profile owner, overlay đã tắt và một tương tác native thành công. `shellShown` không thay thế được.

Login history vẫn giữ nguyên. Network/CPU contention trước first-safe-ready chưa quan sát được, không đủ căn cứ defer.

Khi có trace hợp lệ mới chọn một trong các candidate được prompt cho phép: FIREBASE_SDK_BOOTSTRAP, APP_JS_DOWNLOAD_EVALUATION, AUTH_RESTORE, USER_AUTHORITY_READ, COACH_AUTHORITY, MAIN_JS_FETCH, MAIN_MODULE_EVALUATION, LISTENER_REGISTRY_WAIT, CLUB_AUTHORITY_NETWORK, DEFAULT_TAB_RUNTIME, POST_SHELL_HYDRATION, NO_SINGLE_DOMINANT.

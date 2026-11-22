# 15 — R1C recommendation

```text
MORE_MEASUREMENT_REQUIRED
```

Lý do: real Auth acceptance và startup matrix chưa chạy. Không đủ căn cứ chọn modulepreload, optional-work defer, role-aware module defer, club-authority overlap hoặc auth-kernel extraction.

Cần một browser automation environment chạy Chrome/Chromium và truy cập được Auth+Firestore Emulator, hoặc một isolated staging đã xác minh project/config/hostname/fixture. Browser thay thế hiện có không truy cập được endpoint thử local; không có staging được xác minh trong input.

Sau khi có môi trường: thực hiện 14 ca native Auth gồm same-UID reentry; xác minh frame DOM và actual listener detach; khóa CANONICAL_ACTIVE cho normal Admin; chạy main failure/slow-main và bridge-order cold loads; chỉ sau đó chạy OFF/ON equivalence và matrix A1–C2, mục tiêu 5 valid traces cho mobile restored cold. Giữ Auth persistence khi cold HTTP-cache, không đổi restored thành manual login. Manual latency bắt đầu ở loginSubmit và thống kê riêng.

Delay/failure injection của acceptance phải nằm ở native network/runtime operation trong môi trường thử. Không gọi callback/commit bằng tay rồi gọi đó là real Firebase transition. Trace fault-injected không được trộn vào median normal startup.

Không có R1C implementation trong gói này. Production code tiếp tục đóng băng.

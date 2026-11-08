# Image fixture — GREEN

Header giữ nguyên:

```text
LÊ HOÀNG NGÂN KHÁNH & LÊ HOÀNG HẢI ĐĂNG
```

Canonical transfer memo:

```text
GD NGAN KHANH HAI DANG HP T11 2026
```

ASCII characters = **34**; ≤40; không memberId/hash primary. Actual queued receipt ok=true, provider fetch callback=1, business writes=0.

| Observed surface | Exact string |
| --- | --- |
| URL addInfo | GD NGAN KHANH HAI DANG HP T11 2026 |
| intent.memo at provider verifier | GD NGAN KHANH HAI DANG HP T11 2026 |
| Visible Nội dung CK | GD NGAN KHANH HAI DANG HP T11 2026 |
| Decoded provider QR memo | GD NGAN KHANH HAI DANG HP T11 2026 |
| Decoded preview QR memo | GD NGAN KHANH HAI DANG HP T11 2026 |
| intent.memo at preview verifier | GD NGAN KHANH HAI DANG HP T11 2026 |

`image-fixture-exactness.json` giữ baseline/candidate snapshots, input names/months, checker/source SHA và các giá trị trên. Intent capture chỉ delegate vào unchanged production verifier; independent jsQR đọc PNG pixels, sau đó existing EMV parser lấy memo. Không chỉ tìm substring trong payload.

Actual rendered breakdown giữ `Học phí Lê Hoàng Ngân Khánh — T11/2026` và `Học phí Lê Hoàng Hải Đăng — T11/2026`. Header/breakdown không dùng compact labels thay tên đầy đủ. DOM/canvas là test doubles; chưa xác minh ảnh receipt thực trên mobile/live provider.

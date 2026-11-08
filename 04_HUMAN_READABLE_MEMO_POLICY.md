# Deterministic Family memo policy

Chỉ Family tuition REPORT có structured breakdown hiện có. `studentName` → existing removeVietnameseTonesForQR → uppercase → mọi non A-Z0-9 thành space → collapse/trim. Hai token cuối là preferred label; mỗi participant luôn có ít nhất một token từ tên. Tên không còn token hợp lệ thì fail closed.

1. LAST2 labels + readable periods; dùng ngay nếu ≤40.
2. Nếu dài, thử shortest suffix bắt đầu LAST1. Khi labels trùng, mở rộng dần bằng token đầy đủ tới lúc phân biệt được. Không dùng ID/hash nếu full normalized names khác nhau.
3. Nếu vẫn dài, giữ cùng labels và dùng existing exact YYYYMM period tokens.
4. Chỉ khi full normalized names trùng, thêm suffix sau human label: first valid ASCII alphanumeric ID1–8 theo memberId/memberID/studentId; thiếu ID thì deterministic 4-base36-character suffix từ existing participantKey (FNV-1a mod36^4). Có thể LAST2+suffix hoặc LAST1+suffix tùy độ dài, nhưng không được chỉ còn suffix.
5. Nếu duplicate suffix, cùng canonical key, cùng normalized full name/current-cache suffix collision hoặc vẫn >40, FAMILY_MEMO_REFERENCE_UNAVAILABLE trước fetch. Không cắt chuỗi tùy ý, không bỏ người/kỳ, không opaque-only fallback.

Không tuyên bố hash không có collision. Collision check áp dụng cho participants đang chọn và các profile cùng normalized full name trong cache CLB hiện tại. Suffix là presentation data, không persist/mapping/identity authority. Actual known FNV collision costarring/liquid được test DENY khi cùng normalized names cần suffix. Normal names fit thì member IDs kể cả trùng nhau không được chiếm vị trí primary.

Period behavior giữ nguyên: T11 2026; T10 T11 2026; T11 2026 T1 2027; nếu cần thì 202611 202701. Không tạo continuous range từ sparse months. Receipt breakdown giữ exact participant↔month mapping.

40 vẫn là application safety invariant, KHÔNG phải tuyên bố official VietQR maximum. Same input → same ASCII memo. Tên đầy đủ trên header và breakdown không bị compact; chỉ canonical transfer memo dùng labels ngắn.

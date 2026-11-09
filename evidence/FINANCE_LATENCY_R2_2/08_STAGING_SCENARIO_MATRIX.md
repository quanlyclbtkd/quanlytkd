# 08 — Real staging scenario matrix

REAL_STAGING_EVIDENCE_NOT_RUN. Normal-network evidence là bước đầu; chưa đủ dữ liệu để yêu cầu slow-network benchmark.

| ID | Flow | Months | Valid samples | Target | Result |
|---|---|---:|---:|---|---|
| T01 | Tuition | 1 | 0 | ≥3 nếu có fixture an toàn | NOT_RUN |
| T03 | Tuition | 3 | 0 | ≥3 nếu có fixture an toàn | NOT_RUN |
| T06 | Tuition | 6 | 0 | ≥3 nếu có fixture an toàn | NOT_RUN |
| T12 | Tuition | 12 | 0 | ≥3 nếu có fixture an toàn | NOT_RUN |
| D01 | Actual Debt mobile | 1 | 0 | ≥3 nếu có fixture an toàn | NOT_RUN |
| D03 | Actual Debt mobile | 3 | 0 | ≥3 nếu có fixture an toàn | NOT_RUN |

Debt multi-month 3 tháng là kế hoạch đại diện, chỉ chạy nếu UI reachable. Có thể ghi package reachable khác; không fake package. 9 tháng optional. Canonical/legacy đều UNKNOWN trên staging; CANONICAL_REAL_STAGING_NOT_AVAILABLE chưa được xác minh, không tự thay data policy.

Tất cả fields browser, network, session, strict-current coverage, readMode, timing ở staging đang null/UNKNOWN. Mỗi lần successful payment cần fixture/kỳ riêng; không charge lại cùng tháng.

| Viewport px | Tuition UI_SMOKE | Actual Debt UI_SMOKE | Pending/success/Debt rows | Physical device |
|---:|---|---|---|---|
| 320 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 375 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 390 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 430 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |

Không dùng synthetic DOM để PASS mobile, không dùng Emulator result để PASS latency staging.

# 12 — Read invocation evidence

**FIRESTORE_BILLING_NOT_MEASURED**

Staging getDocs/page/document/single-flight counters: null, vì chưa chạy. Không được diễn giải là billed reads bằng 0.

Các quan sát sau chỉ thuộc actual-source fake-SDK fixtures (06), giữ nguyên OFF/ON query semantics và thứ tự:

| Months trong fixture unpaid | Legacy getDocs invocations | Canonical getDocs invocations |
|---:|---:|---:|
| 1 | 3 | 1 |
| 3 | 9 | 3 |
| 6 | 18 | 6 |
| 9 | 27 | 9 |
| 12 | 36 | 12 |

Legacy sử dụng byTxMonth/byDate/byPackageMonth. Canonical dùng accountingMonths. Đây không phải kế hoạch tối ưu, không thay đổi runtime read policy. RAM-paid hoặc strict-current coverage vẫn có các path zero-query đã được kiểm thử; không lấy RAM absence làm unpaid.

Pagination fixture 501 matching documents: 2 pages/source, legacy 6 invocations / 1.503 returned page-documents, canonical 2 / 501. Returned page-documents có thể trùng giữa source; không phải unique docs hoặc billing.

Existing single-flight được giữ nguyên; overlap với caller khác làm attribution UNKNOWN thay vì tự gán owner counter. Counter reset/read-only SDK/disabled sampling giữ null cho count không biết. Page sequence và month ordinal chỉ xuất nếu có ownership rõ.

Static production scoped call-site counts before = after: getDoc 24, getDocs 43, onSnapshot 16. Tooling không được tính vào production budget. Định nghĩa thống kê theo convention accepted audit (mỗi kind trên mỗi source line, loại mirror/migrations/diagnostics), không phải SDK invocation count hay cost measurement.

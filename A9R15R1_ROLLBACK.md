# A9R15R1 — Rollback

Bản R1 chỉ sửa công cụ QA và tài liệu. Runtime, build tag, Rules, indexes, Journal V4, CAS và dữ liệu không đổi; không có deployment để rollback trong phiên kiểm toán này.

Baseline dùng để quay lại: ZIP A9R15 `(1)`, SHA-256 `f5e249bc0428204ef1c026cefa77eb527dc365994116c23c2c016cc8d9f4562f`. Chỉ chấp nhận đúng checksum đó.

1. Giữ nguyên ZIP và evidence R1 để truy vết.
2. Dùng bản sao sạch của ZIP A9R15; hoặc trên một bản sao R1 sạch, kiểm tra rồi reverse patch: `git apply --check --reverse A9R15_TO_A9R15R1.patch`, sau đó `git apply --reverse A9R15_TO_A9R15R1.patch`.
3. Kiểm lại runtime SHA `f112c0aea086cb3e7684d03ddfe1897d82bcb159086b0a8fd895c71e9208fb67`, Rules SHA `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3`, indexes SHA `72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2`, root/public 129/129. Build phải vẫn là `qr-v11r6-a9r15-training-history-closure-20261025`.
4. Chạy lại kiểm tra theo mức QA cần dùng. Hai harness legacy sẽ trở về lỗi đã ghi ở baseline; đây là rollback test infrastructure, không phải runtime fix.

Không clear IndexedDB/localStorage, không xóa pending intent, không replay legacy, không sửa profile/attendance và không xóa index. Không cần rollback dữ liệu hay migrate Journal. Nếu môi trường đã có thay đổi ngoài R1, dừng reverse patch và review conflict; không dùng force.

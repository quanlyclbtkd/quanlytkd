# 01 — Baseline identity

Input: `A9R18_R2_2_FINANCE_LATENCY_BASELINE_FULL_SOURCE.zip`.

Outer SHA-256 verified: `047190212d0b0c0647b461d46018d9e9ef76fa83d2848f064c4fa887a738641c`.

Source pin: `V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1`.

Runtime SHA-256: `3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da`.

| File | SHA-256 before = after |
|---|---|
| `app.js` | `922c86bab2b085b36ec8eeb23f4d0bdc3652cf1eb131ac466939a2a5bf5a9619` |
| `js/core/debtProfileReadBoundary.js` | `92d22f373d6598afac786418f1a26e2f8514c2a4a589b24a38e8c2856356fa08` |
| `js/core/tuitionCommandBoundary.js` | `d0721d2d772797760b7c139b226c9b982d40c8bdd659b047d369d4da16752277` |
| `js/listeners/profiles.listeners.js` | `a63cac438c0dbe94fee97e8f828baab8ee7abce0a5420eda593b043a14d8bac5` |
| `js/modules/finance.js` | `3db110afa06b6b69614973ad96c24eef2cc4a6c293e05ae84d0c3b2617bb4c16` |
| `js/services/finance.service.js` | `a4e671e9ced4c4ab94c668530d334634f8beab7426d55afe38c6aeb0dc2fc6fc` |
| `js/ui/render/computation/studentsRenderer.js` | `43c26234d2eca584b02b5c2e51a3d651a526e4d4bada81316d8ca773c22b58db` |
| `firestore.rules` | `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3` |
| `firestore.indexes.json` | `72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2` |
| `package.json` | `6fa1a032c18e7ab4a477819c7b79785207950e899b4ffb35cb3b75557d400bdd` |
| `package-lock.json` | `c1030ff5e36f49acfa7ea0bbe05d7229d71c97129af9158a9e91fa6c8dc1785a` |

Các file root/public production gồm 129 cặp; hashes đầy đủ ở 02. Không có byte production/package/lockfile nào thay đổi.

Archive đầu vào chứa `source/`, gồm 30.568 file entries; 28.641 file entries thuộc node_modules. Đã giữ nguyên toàn bộ 1.927 file còn lại khi giải nén vào baseline và working copy. Handoff không đóng gói lại node_modules; dependencies và lockfile không được nâng phiên bản.

Đã đọc bằng chứng có sẵn `evidence/INVENTORY_R1_1/ACCEPTANCE.json`: PASS_EMULATOR_ACCEPTED, 30 PASS / 0 FAIL / 0 NOT_RUN, SDK 10.7.1, externalAttempts 0. Đây là bằng chứng input từ lần chạy trước, không phải chạy Emulator lại trong R2.2. Gate Inventory actual-source deterministic hiện tại đã chạy lại 49/49 PASS.

Environment kiểm thử R2.2: Linux, Node v24.22.1, VM Modules, actual-source fake SDK/DOM harness được reuse. Không có staging browser/viewport/network được xác minh. Ngày evidence: 2026-11-09 UTC.

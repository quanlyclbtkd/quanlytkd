# 03 — Baseline RED matrix

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.


Trước khi patch production runtime, bản checker 35 ca đã thu **14 PASS / 21 FAIL** (`baseline-stock-final.log/json`). Sau khi bổ sung các ca SKU, ACK, context, quà tặng, chạy **cùng một checker cuối cùng** trên baseline nguyên vẹn và candidate: **baseline 19/49 PASS, candidate 49/49 PASS**.

30 assertion không đạt ở baseline **không đồng nghĩa 30 bug**. Các ca yêu cầu transaction instrumentation mới, hay hook async chưa tồn tại, được tách rõ bên dưới. RED stock thật là giá trị/side effect vi phạm business invariant, không phải thiếu một từ khóa source.

| Sample | Baseline balance | Baseline commits | Candidate balance | Candidate commits |
| --- | --- | --- | --- | --- |
| C03 | -1 | 1 | 5 | 0 |
| R01 | -3 | 2 | 1 | 1 |
| R03 | -1 | 2 | 2 | 1 |
| E02 | -3 | 1 | 2 | 0 |
| E04 | -6 | 1 | 2 | 0 |
| E07 | -8 | 1 | 2 | 0 |
| E08 | -8 | 1 | 2 | 0 |
| E09 | 11 | 2 | 8 | 1 |
| A02 | -1 | 1 | 0 | 0 |
| A03 | -1 | 2 | 0 | 1 |
| A05 | -1 | 1 | 0 | 0 |
| M02_M04 | -2 | 1 | 1 | 0 |
| M03 | -3 | 2 | 1 | 1 |
| REACHABLE_FALLBACK | -1 | 3 | 5 | 0 |

Admission baseline vẫn là một commit atomic; defect là commit được chấp nhận khi tồn không đủ, không phải Admission bị tách partial writes. MultiItem baseline cũng atomic nhưng dùng precheck memory không đủ authority. Legacy form fallback riêng có ba commit rời.

| Case | Baseline assertion | Candidate | Interpretation |
| --- | --- | --- | --- |
| C01 create outbound stock authority | PASS | PASS | Giữ GREEN |
| C02 create outbound stock authority | PASS | PASS | Giữ GREEN |
| C03 create outbound stock authority | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C04 create outbound stock authority | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C05 create outbound stock authority | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C06 create outbound stock authority | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C07 create outbound stock authority | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C08 inbound recovery of historical negative is permitted without a stock read | PASS | PASS | Giữ GREEN |
| C09 stock decrease on historical negative DENY | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C10 Inventory form insufficient stock leaves no Finance/history writes | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C11 Inventory form double tap one logical commit | PASS | PASS | Giữ GREEN |
| R01 independent clients share initial version and retry/revalidate | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| R02 independent clients share initial version and retry/revalidate | FAIL | PASS | Baseline arithmetic GREEN (final=0); FAIL chỉ vì không có tx-read/conflict evidence của cơ chế mới. Không phải một defect riêng. |
| R03 independent clients share initial version and retry/revalidate | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| R04 concurrent inbound and too-large outbound is serializable and never negative | PASS | PASS | Giữ GREEN |
| R04B inbound ACK before outbound read allows exactly covered sale | PASS | PASS | Giữ GREEN |
| E01 edit validates net delta and preserves related Finance atomicity | PASS | PASS | Giữ GREEN |
| E02 edit validates net delta and preserves related Finance atomicity | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| E03 edit validates net delta and preserves related Finance atomicity | PASS | PASS | Giữ GREEN |
| E04 edit validates net delta and preserves related Finance atomicity | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| E05 delete uses current item and stock; zero partial Finance effect | PASS | PASS | Giữ GREEN |
| E06 delete uses current item and stock; zero partial Finance effect | PASS | PASS | Giữ GREEN |
| E07 delete uses current item and stock; zero partial Finance effect | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| E08 stale UI previous cannot reverse the wrong quantity | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| E09 two deletes cannot apply a ledger reversal twice | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| E10 stale edit cannot apply cached reverse delta to a newer item | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| A01 actual Admission profile/Finance/uniform one atomic outcome | PASS | PASS | Giữ GREEN |
| A02 actual Admission profile/Finance/uniform one atomic outcome | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| A03 concurrent actual admissions consume last uniform only once | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| A04 admission rejected primary has zero persisted profile/bundle/item | PASS | PASS | Giữ GREEN |
| M01 actual MultiItem sufficient stock commits one bundle | PASS | PASS | Giữ GREEN |
| M02 M04 stale-high UI cannot partially commit tuition, bundle or debt | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| M03 actual MultiItem and Inventory form contend on same stock version | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| FALLBACK legacy form cannot bypass canonical stock/Finance atomicity | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| CTX no projection from committed A into newly active B | PASS | PASS | Giữ GREEN |
| E11 outbound SKU move checks the negatively affected destination | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| E12 covered SKU move updates both canonical ledger keys exactly | PASS | PASS | Giữ GREEN |
| R06 disjoint SKUs may contend on one stats doc but both revalidate and commit | FAIL | PASS | Baseline disjoint-SKU arithmetic không RED; FAIL do assertion đòi retry của transaction mới. Candidate đo contention, không coi đây là bug cũ. |
| P01 unresolved primary ACK produces no early Inventory/Finance projection | PASS | PASS | Giữ GREEN |
| P02 SDK rejection yields no writes/projection and a human unconfirmed error | FAIL | PASS | Assertion typed service error mới; baseline UI có generic failure handling. Không dùng để kết luận stock oversell. |
| CTX02 Admission draft edit during new stock read aborts entire uncommitted envelope | FAIL | PASS | Hook transaction-read không tồn tại trên baseline; draft không bị thay đổi trong sample baseline. Chỉ là regression của async boundary mới, không phải RED auth/draft cũ. |
| CTX03 MultiItem session invalidated during stock read has zero business writes | FAIL | PASS | Hook transaction-read không tồn tại trên baseline; session không bị đổi trong sample baseline. Chỉ là regression boundary mới. |
| C12 invalid authoritative numeric field never becomes local unpaid/zero evidence | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C13 actual zero-price gift preserves stock authority and one atomic Finance effect | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C14 actual zero-price gift preserves stock authority and one atomic Finance effect | PASS | PASS | Giữ GREEN |
| C15 actual unpaid outbound cannot bypass insufficient stock | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| C16 actual inbound with missing stock field stays one cheap atomic item/Finance commit | PASS | PASS | Giữ GREEN |
| A05 actual Admission gift and tuition remain one all-or-nothing stock command | FAIL | PASS | Không đạt behavioral invariant; xem raw sample và nhóm root cause. |
| A06 actual Admission gift and tuition remain one all-or-nothing stock command | PASS | PASS | Giữ GREEN |

Raw: `evidence/INVENTORY_STOCK_R1/baseline-stock-frozen.json`, `candidate-stock-frozen.json`, hai `.log` tương ứng. Checker SHA-256 `73ece598ad661b02df0de6a15c90380e93aac8193ce228fa41c14b026575fb84`; harness SHA-256 `b5d44bfb9a86ea55d4069d5cae137c0359e778da64a6ffb78d6ed48180687db0`. `CHECKER_AND_SOURCE_IDENTITY.json` khóa cùng checker với hai runtime chính xác.

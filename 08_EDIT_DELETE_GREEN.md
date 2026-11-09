# 08 — Edit/delete GREEN

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.

| Case | Result |
| --- | --- |
| E01 edit validates net delta and preserves related Finance atomicity | PASS |
| E02 edit validates net delta and preserves related Finance atomicity | PASS |
| E03 edit validates net delta and preserves related Finance atomicity | PASS |
| E04 edit validates net delta and preserves related Finance atomicity | PASS |
| E05 delete uses current item and stock; zero partial Finance effect | PASS |
| E06 delete uses current item and stock; zero partial Finance effect | PASS |
| E07 delete uses current item and stock; zero partial Finance effect | PASS |
| E08 stale UI previous cannot reverse the wrong quantity | PASS |
| E09 two deletes cannot apply a ledger reversal twice | PASS |
| E10 stale edit cannot apply cached reverse delta to a newer item | PASS |
| E11 outbound SKU move checks the negatively affected destination | PASS |
| E12 covered SKU move updates both canonical ledger keys exactly | PASS |

E01: tăng outbound 3→4 đủ stock, item/stats/related Finance cùng commit. E02: 3→8 với available2 bị từ chối, item và Finance cũ giữ nguyên. E03/E04: giảm inbound chỉ được phép khi phần stock giảm còn được cover. E05 delete outbound tăng stock; E06 delete inbound đủ cover thành0; E07 thiếu cover không xóa cả item lẫn linked Finance.

E08 cached inbound10 nhưng server6 không được reverse10. E09 hai client delete cùng item: chỉ một ledger reversal; retry thấy item đã thiếu và không lặp write. E10 stale edit không được dùng cached reverse delta. E11 move outbound sang SKU thiếu stock DENY, cả hai key giữ nguyên; E12 destination đủ stock thì reverse source và consume destination chính xác.

Mỗi update/delete đọc current item trong transaction để khóa chính dữ liệu được reverse. Negative delta đọc thêm một stats doc. Increasing edit/delete vẫn cần item CAS vì baseline E09/E10 chứng minh stale/double reversal; không có stock authority read thừa ở các ca chỉ tăng stock. Không mở cross-type/paid-state edit.

Human failure được form/edit catch xử lý; không reset form/đóng edit modal theo nhánh success khi transaction bị từ chối. Các regression context hiện hành tiếp tục kiểm tra stale tail sau ACK.

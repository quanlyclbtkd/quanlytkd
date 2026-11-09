# 14 — Next phase

Tiếp tục **R2.2 real staging measurement**, chưa mở R2.3.

Cần URL + hostname và projectId staging riêng đã xác minh, Admin/test club, fixture/kỳ chưa thu và cleanup được hỗ trợ, browser source identity, normal-network configuration. Làm theo R2_2_STAGING_RUNBOOK.md, thao tác qua Học phí và actual Báo nợ mobile.

Sau khi có ≥3 valid traces cùng scenario nếu fixture cho phép, phân loại interval dựa trên số đo. Evidence dominant chỉ khi lặp lại và chiếm phần lớn đáng kể; phải phân biệt month/source serialization, pagination, network response, single-flight. Commit dominant, post-ACK UI tail và Debt sync phải route riêng. Không chọn Promise.all từ source alone.

Chưa có bottleneck proven nên chưa có repair proposal hoặc phạm vi R2.3 được phê duyệt. Correctness RED nếu gặp sẽ dừng performance phase. Không patch production để lấp observability gap của TCB frozen.

# Rollback A9R4 TEST ONLY

- Không có thay đổi production hoặc GitHub; không cần rollback live.
- Khi thử trên demo/staging: dừng phiên kiểm thử A9R4, khôi phục file runtime `app.js`, `index.html`, `js/core/coachBranchRuntimeRepair.js`, `js/modules/attendance.js` và `public/` từ ZIP baseline A9R3 SHA đã ghim; xác minh root/public 128/128 và cache token cũ.
- Firestore Rules A9R4 byte-identical A9R3 nên không có Rules rollback.
- Không xóa Firebase Auth UID, Coach/User mirror, Journal hoặc giao dịch tài chính; nếu có tạo dở phải lưu lại và đối soát bằng quyền được ủy quyền.
- Tiếp tục `RELEASE_HOLD — NO_DEPLOY` đến khi staging được ký nghiệm thu.

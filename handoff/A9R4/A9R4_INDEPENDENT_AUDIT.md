# PHASE QR V11R6 A9R4 — kiểm toán độc lập / TEST ONLY / NO DEPLOY

Ngày: 23/10/2026. Nguồn duy nhất: `QR_V11R6_A9R3_MIRROR_VERSION_CAS_TEST_ONLY_FULL_SOURCE.zip` SHA-256 `e37a67e4c6ea97890fa0ee8734ecceb07fec0831800ea46c34df652d2c5e87b8`.

## 1. Phạm vi, ba nhóm độc lập

| Nhóm | Kết luận mã nguồn | Kết luận môi trường thật |
|---|---|---|
| Coach Auth tạo dở | **FIX SOURCE** ở `savePair(creating:true)`: không đọc `users/{uid}` chưa có trước khi batch. Readback server sau ghi giữ nguyên. Có nút khôi phục Auth riêng về **UI/identity check**, nhưng **writer vẫn duy nhất `savePair()`** | **ENV_BLOCKED**: phải chạy 5 ca Firestore Emulator onboarding trên Windows và xác minh Rules đang deploy; tuyệt đối không thử trên production |
| QR Báo nợ / Thu gộp | **DIAGNOSTICS ONLY**: phân loại `memoTransform` (không ghi chuỗi/thông tin tài chính), giữ EMV/CRC/4-field checks và chặn ảnh sai | **RELEASE_BLOCKED**: mới có `expectedMemoLength=42`, `qrMemoLength=40` của một ca trong log; chưa có hai chuỗi so sánh ẩn danh hoặc pixel provider cuối / đủ `fieldsMatch` để sửa memo canonical. Không giả vờ đã sửa QR |
| Attendance Coach | **UI MAINTENANCE FIX**: nút "đánh dấu tất cả" ẩn khi Coach đang bị khóa, các control nhập điểm danh được disabled, giải thích rõ vì sao không có shift/roster | **RELEASE_BLOCKED**: S01, historical provenance, Journal V1/V2/V3, CAS/READS, staging/mobile chưa phê duyệt. `HISTORY_COACH_ACCESS=false`, `coachAttendanceCutoverOpen()=false` giữ nguyên |

## 2. Nguyên nhân lỗi Coach Auth (đã chứng minh từ code)

- Trước sửa: `createCoachAccount()` gọi Firebase `createUserWithEmailAndPassword()`; nhận UID mới; sau đó `savePair()` luôn `readVerified('users', uid)`, ngay khi cả Coach và User chưa được tạo.
- Trong Rules A9R3, `match /users/{uid}: allow get` cấp cho Admin khi `resource` là Coach cùng CLB, hoặc khi `resource=null` nhưng *canonical Coach đã tồn tại*. Với UID tạo mới, cả hai chưa tồn tại: preflight `getDoc(users/uid)` bị từ chối theo hợp đồng Rules. Bộ A9R3 Emulator 34/34 tập trung batch, chưa kiểm tra preflight trước batch.
- Sau sửa: riêng `creating:true`, không đọc User mirror chưa tồn tại; dùng version `'absent'` cho hai hồ sơ và ghi atomically *cùng batch ba tài liệu hiện hữu*. Rules A9R3 vẫn bắt buộc create-version `'absent'`, canonical/mirror match, `coachAclEpoch` +1. `readVerified` sau commit giữ nguyên.
- Không thêm reader, không thay `firestore.rules` và không mở quyền đọc User tồn tại ở CLB khác.

### Khôi phục tài khoản đã tạo dở

- Giao diện mới tại `index.html`: nhập tên/email/mật khẩu (ô password), chọn cơ sở; nút `Khôi phục Auth đã tạo dở`.
- Quy trình chỉ Admin/SuperAdmin đã xác minh; yêu cầu Admin tự đối chiếu UID trong Firebase Console; xác thực Auth qua **secondaryAuth với email/mật khẩu**, so UID + email, đọc canonical Coach server-confirmed và **từ chối nếu đã có**. Chỉ khi chưa có canonical và sau hai lần xác nhận, gọi chính `savePair(..., {creating:true})`.
- Nếu User mirror đã tồn tại dù canonical chưa có, `assignmentPreviousVersion='absent'` bị A9R3 Rules **DENY khi update**, không tự chiếm quyền hay ghi đè hồ sơ.
- Không tra UID từ email phía client; không sử dụng Admin SDK/Cloud Functions, không copy password sang storage và không thêm writer.
- **Hạn chế còn lại:** Không có transaction xuyên Firebase Authentication + Firestore; nếu server Rules đang deploy không phải A9R3, hoặc Auth đã có cặp hồ sơ một phần/mâu thuẫn, Admin vẫn phải dừng và đối soát. Không có cơ chế khôi phục tự động/rollback Auth.

## 3. QR diagnostics và lý do chưa sửa memo

Các tệp `app.js` trong `_verifyReceiptQrPixels` chỉ thêm `memoTransform` gồm các cờ tương đương bỏ qua hoa/thường, khoảng trắng, dấu câu, trim và `lengthDelta`. Chỉ xuất khi sai field; vẫn throw `QR_EMV_MISMATCH / INTENT_FIELD_MISMATCH`. Chưa thay `_receiptPaymentMemo()`, provider account, bank, amount, memo hoặc EMV-CRC.

Chỉ từ độ dài 42→40 **không chứng minh** provider cắt hai ký tự cuối; cũng có thể loại bỏ hai ký tự bất kỳ, và `fieldsMatch` chưa mở đủ. Phải đối chiếu kết quả của một ca PASS và một ca FAIL, cùng account, lấy bốn cờ bankBin/accountNo/amount/memo và `memoTransform`, rồi kiểm tra QR pixel cuối. Không được tự cắt chuỗi theo 25/40 hay thay bằng QR không được kiểm tra.

## 4. Attendance maintenance

Chỉ sửa presentation tại đầu `_requestAttendanceDailyRefresh()` trong `js/modules/attendance.js`. Nếu Coach và `!HISTORY_COACH_ACCESS`, dừng trước `_loadClubShifts`, không load roster, không viết điểm danh, ẩn nút đánh dấu tất cả và vô hiệu hóa control để không gợi nhầm tính năng đã mở. Các quyền branch vẫn dựa vào owner hiện hữu; không thêm Firestore listener/getDoc/getDocs.

## 5. Chứng cứ kiểm thử

| Gate | Trạng thái |
|---|---|
| ZIP baseline SHA / CRC | PASS |
| Firestore Rules SHA | `23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad` — byte-identical A9R3 |
| Coach new Auth / manual recovery mock | 6/6 PASS, **MOCK ONLY** |
| Auth login negative control | 10/10 PASS |
| Repair CAS | 14/14 PASS |
| Coach assignment | 16/16 PASS |
| Admin assignment | 14/14 PASS |
| ACL preflight | 14/14 PASS |
| Security Coach branch | 35/35 PASS |
| A9R3 version payload | 3/3 PASS |
| QR race | 6/6 PASS |
| QR synthetic pixel | 6/6 PASS |
| QR synthetic memo | 9/9 PASS |
| QR A9R4 diagnostics | 3/3 PASS, **NO REAL PROVIDER** |
| Attendance A9R4 UI guard | 5/5 SOURCE PASS, **NO CUTOVER** |
| `npm run check` — 54 gates individually | **53 PASS / 1 FAIL** (`app.js` bytes 701232 > 700000) |
| Root→public parity | 128/128 PASS |
| `check:release` | **ENV_BLOCKED**: thiếu declared Playwright Chromium |
| Firestore Emulator A9R3 stale-mirror CAS | 34/34 PASS trước đây trên máy Windows user; Rules vẫn nguyên |
| A9R4 Auth onboarding Emulator | **ENV_BLOCKED** tại container; đã có `Run-A9R4-Coach-Emulator.ps1` + 5 ca thật để chạy Windows |
| Android/iPhone + Auth thật trên staging | **RELEASE_BLOCKED** |
| QR provider PASS/FAIL pixel cuối | **RELEASE_BLOCKED** |

Không đổi expected nghiệp vụ để tạo PASS giả. Chỉ có manifest/harness lineage A9R4 được cập nhật để nhận hash/timestamp thực tế. Không coi các test synthetic là production acceptance.

## 6. Tác động READS / CAS / writer

- Coach normal update/repair: không thay đường đọc hoặc ghi so với A9R3; Mirror CAS `assignmentPreviousVersion`, version mới, club epoch giữ nguyên.
- Coach create mới: **giảm tối đa 1** `getDoc(users/{uid})` server-confirmed *trước* batch. **Không thay** ba server readback *sau* batch.
- Coach manual orphan recovery: thêm một lần `getDoc` canonical Coach **chỉ khi người quản trị bấm nút phục hồi**, không chạy khi login/attendance. Có xác minh danh tính Auth phụ. Không có listener mới.
- QR: chỉ thay local string comparisons trong đường lỗi, **ZERO financial writes**.
- Attendance: không thêm đọc/ghi, giữ bảo trì. Không có owner song song.

## 7. Quyết định

**RELEASE_HOLD — NO_DEPLOY.** A9R4 là bản source candidate dành cho thử nghiệm cô lập, chưa phải bản sửa hoàn tất QR/Coach attendance, và chưa xác nhận Rules đang deploy trên website thật. Không đăng nhập production bằng localhost TEST ONLY. Không upload `A9R4` lên nhánh GitHub Pages đang vận hành.

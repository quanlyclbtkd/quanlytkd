# A9R16A-R3R1 — Đọc trước

FULL_SOURCE từ R3 ZIP da9aad90e3b70d50203f153832012016a66f27452f8b023a7b0a4b849ab58624.
Bổ sung cleanup history khi Auth reset/đổi tab/khóa CLB và hiển thị ca/giờ khi ngày tập trống. Không migration, production access/write, Cloud Functions hoặc deploy.
Build: qr-v11r6-a9r16a-r3r1-reviewed-history-20261026
Runtime SHA: 3b5f042637f7449c07fd3efdf69980d2d15d60071d12f673bda3d8387b50ed84
Root/public129/129.

Báo cáo hiện hành: A9R16A_R3R1_BAO_CAO_KIEM_TRA_LAI.md và A9R16A_R3R1_RELEASE_GATES.json. Các báo cáo A9R16A_R3/A15 kế thừa là tài liệu lịch sử.
Canonical build từ root: node tools/a9r16r3r1/build.mjs. Không build bằng script phase cũ hoặc sửa public riêng. Project có package-lock/vendor fixtures; node_modules không đóng gói. Browser/Emulator tests cần dependencies/Chromium/Java tương ứng.
SHA ZIP nằm trong manifest sidecar ngoài archive, tránh self-reference. Trạng thái RELEASE_BLOCKED do QA debt/môi trường thật/owner chưa hoàn tất; không tự mở A9R16B.

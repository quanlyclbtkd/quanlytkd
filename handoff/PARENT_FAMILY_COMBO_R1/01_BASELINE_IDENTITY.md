# Exact baseline — Family Combo R1

Ngày: 07/11/2026 (Asia/Saigon). Scope: đúng ba defect Family A/B/C; không tối ưu latency và không deploy.

| Input | SHA-256 |
|---|---|
| A9R18_R2_1_STAGING_OBSERVER_HANDOFF(2).zip | 22aee27f49a12824d39d8e120e4257d91241e6d02c86737c15638e4c7df0a222 |
| A9R18_R2_1_FULL_SOURCE_TEST_CANDIDATE.zip | 30219f10ba062d38b10f97fc60562dab8089916a2de2827e263fb54178514fc0 |
| app.js trước patch | a1a9990664a261fd0aaf343e9fb14c75c854530c6052d8b80882335b608c0ab4 |
| js/modules/finance.js trước patch | 9868715dcde7e82bfb7499f87f56ffab0a40744df5ddb77ac4dd79192b4b6f26 |
| index.html trước patch | de7ab11450ce128fb7cc2b4fd3bb0dd4d9c058ae88c699fedec34f4cc8e9a9dc |

Đã đối chiếu byte/SHA của hai ZIP và ba file trước sửa. Trích xuất candidate độc lập; không sửa baseline gốc. Baseline có 1457 file, canonical runtime 129 file và 129 cặp root/public. Static production call-sites trước patch: 26 getDoc / 43 getDocs / 16 onSnapshot.

Candidate app SHA: `34eabb10a15e7b5261c489df8c3d6a20fa4f592e2268852bd330f8c185c196bf`. Finance adapter SHA: `f652c2d896180654cf8f1534a916cb7f44ebff3599251070b0ef74eb998c809b`. Runtime: `245bb80f1c4a77fe5013f4f5ad3873c61a83fe25873ee7046e00baf8d98f348f`. New source pin: `V11R6_A9R18_FAMILY_COMBO_CORRECTNESS_QR_R1`.

`APP_BUILD_VERSION` cũ được giữ để không thay cache lineage của các authority khác; bốn URL thực tới app/main/finance dùng token `a9r18-family-combo-correctness-qr-r1-20261107`. Pin mới và scoped cache graph phân biệt chính xác source candidate. Dữ liệu gốc/project Firebase không bị đổi.

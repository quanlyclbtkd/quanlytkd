# Phase 4K-6V5D — Coach Runtime Recovery + Login History Cache Guard

## Mục tiêu
Sửa lỗi tài khoản HLV điểm danh vẫn thấy console chạy bundle cũ và phát sinh:

- `[resolveActiveDataSource] Permission denied — không mở Firestore Rules public`
- `[RuntimeRecovery] source=permission-error reason=Firestore Rules denied read`
- `[login_history] Không thể ghi lịch sử đăng nhập: Missing or insufficient permissions`

## Nguyên nhân

### 1. Production/browser vẫn đang chạy bundle cũ V4D1A
Log user gửi cho thấy URL đang là:

```text
app.js?v=profile-canonical-store-runtime-recovery-20260628-v4d1a
main.js?v=profile-canonical-store-runtime-recovery-20260628-v4d1a
```

V4D1A là runtime cũ trước các bản sửa HLV V4D6/V4D8/V5B/V5C, nên vẫn có thể chạy data-source recovery probe vào full-club collections.

### 2. HLV không được phép probe full-club
HLV chỉ nên đọc branch-scoped attendance/profiles. Runtime recovery cũ probe:

- `clubs/{clubId}/profiles`
- `clubs/{clubId}/transactions`
- `clubs/{clubId}/inventory`

Rules chặn các collection này với HLV là đúng. Lỗi không phải là mở Rules public; lỗi là runtime HLV không được chạy probe full-club.

### 3. login_history là audit phụ nhưng bị warn đỏ
Rules cũ thiếu hoặc payload thiếu `uid`, nên HLV có thể không ghi được `login_history`. Đây không nên làm hỏng Điểm danh hoặc gây warning đỏ lặp lại.

## Sửa đổi chính

### app.js

- Thêm `_isCoachScopedRuntimeSession()`.
- `resolveActiveDataSource()` nếu là Coach/HLV trả về `source: 'coach-scoped'` trước khi đụng full-club probes.
- `runRuntimeDataRecovery()` hard-skip ngay cho Coach/HLV, không gọi `resolveActiveDataSource()` full probe.
- Khi skip, vẫn kích hoạt `loadCoachBranchProfilesFallback()` hoặc `mountActiveProfilesListenerIfNeeded()` để roster HLV được hydrate lại theo branch.
- `login_history` payload thêm `uid`.
- `login_history` permission-denied chuyển thành `console.info` và de-spam bằng `sessionStorage`, không còn warning đỏ.

### firestore.rules

- Thêm rule `login_history`:
  - signed-in user chỉ được `create` bản ghi của chính mình (`uid == request.auth.uid`).
  - SuperAdmin mới được read/update/delete.
- Mở rộng helper nhận diện SuperAdmin alias để đọc audit không bị lỗi.
- Không mở public read/write.

### Cache bust

- Cập nhật entrypoint sang:

```text
coach-runtime-recovery-login-history-cache-guard-20260703-v5d
```

Sau deploy, console bắt buộc phải thấy V5D. Nếu vẫn thấy V4D1A, nghĩa là hosting/browser vẫn đang dùng bản cũ.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:debt-profile-read-boundary` — PASS 23/23
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:render-warning-coalescing` — PASS 14/14
- `npm run check:tuition-debt-source-of-truth` — PASS
- `npm run check:active-skipped-month-section` — PASS 11/11
- `npm run check:profile-canonical-store` — PASS 27/27
- `npm run check:v4d1a-runtime-recovery` — PASS 22/22
- `npm run check:coach-attendance-status-cycle-v5b` — PASS 7/7
- `npm run check:v5c-coach-profiles-bootstrap-datasource-recovery` — PASS 11/11
- `npm run check:v5d-coach-runtime-recovery-login-history-cache-guard` — PASS 13/13

`npm run check` đã chạy qua nhiều nhóm lớn và không thấy fail trước khi timeout; các nhóm còn lại liên quan đến HLV/attendance/rules/runtime đã chạy riêng và PASS.

## Deploy bắt buộc

Deploy cả:

1. Hosting/source
2. Firestore Rules

Sau deploy, mở DevTools Console và kiểm tra URL phải là:

```text
app.js?v=coach-runtime-recovery-login-history-cache-guard-20260703-v5d
main.js?v=coach-runtime-recovery-login-history-cache-guard-20260703-v5d
```

Nếu còn `profile-canonical-store-runtime-recovery-20260628-v4d1a`, lỗi không nằm ở code mới mà nằm ở deploy/cache/hosting đang phục vụ bản cũ.

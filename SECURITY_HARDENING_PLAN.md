# Security Hardening Plan — Taekwondo Club Management SaaS

> Phiên bản: Phase 4.0B-3 | Tháng 5/2026
> Mục tiêu: Nâng bảo mật từ "demo app" lên "production SaaS" đúng cách.
> Đây là plan — không phải implementation checklist đã hoàn thành.

---

## 1. Tại sao Obfuscator KHÔNG phải là bảo mật chính

Obfuscator (minify, mangle, rename biến) chỉ làm code khó đọc hơn với người thường.
Nó **KHÔNG bảo vệ** được:

- Dữ liệu Firestore nếu Rules không chặt
- API key Firebase nếu không giới hạn domain
- Logic nghiệp vụ nếu chạy hoàn toàn trên client
- Ai đó dùng DevTools → Network tab để xem request/response
- Ai đó fork app và trỏ vào Firebase project của họ

**Kết luận**: Bảo mật thật sự đến từ backend (Firestore Rules + Cloud Functions), không từ frontend.
Obfuscator nhẹ chỉ dùng để **chống copy thô** (screenshot, view-source), không phải bảo mật dữ liệu.

---

## 2. Firebase App Check — BẮT BUỘC cho production

App Check đảm bảo chỉ **app hợp lệ** (không phải script tự động) mới gọi được Firestore/Auth.

```
Firebase Console → App Check → Register App → reCAPTCHA Enterprise (web)
```

Sau khi bật App Check:
- Firestore từ chối request không có App Check token
- Giảm nguy cơ bị abuse API key

**Trạng thái**: ❌ Chưa bật — TODO Phase 4.1

---

## 3. Giới hạn API Key theo domain — Google Cloud Console

Firebase API Key được phép public (không phải secret). Nhưng cần giới hạn:

```
Google Cloud Console → APIs & Services → Credentials
→ Chọn Browser key của Firebase
→ Application restrictions: HTTP referrers
→ Thêm: yourdomain.com/*, *.replit.app/*
```

Nếu không giới hạn: bất kỳ ai copy API key đều có thể gọi Firebase API từ app của họ.

**Trạng thái**: ❌ Chưa giới hạn — TODO ngay sau Phase 4.0B-3

---

## 4. Firestore Rules chặt — đã tạo baseline

File: `firestore.rules`

Nguyên tắc:
- **Deny by default**: mọi collection chưa khai báo đều bị từ chối
- **Multi-tenant**: user chỉ đọc/ghi dữ liệu CLB mình
- **SuperAdmin**: có full access qua `super_admins/{uid}` collection
- Không dùng `allow read, write: if request.auth != null` — quá rộng

**Trạng thái**: ✅ Baseline tạo xong — ❌ Chưa test emulator — ❌ Chưa deploy

---

## 5. Privileged Actions → Cloud Functions

Các thao tác đặc quyền của SuperAdmin hiện đang ghi trực tiếp từ client:

| Action | Rủi ro nếu chỉ ở client | Giải pháp |
|---|---|---|
| `createClub` | Client tự tạo doc club bất kỳ | Cloud Function + validate license |
| `resetAdminPassword` | sendPasswordResetEmail từ client | Cloud Function + ghi audit log |
| `forceReplaceAdmin` | Ghi trực tiếp `users/{uid}` | Cloud Function + verify SuperAdmin |
| `deleteTransactions` (hàng loạt) | Không có audit trail | Cloud Function + dry-run mode |
| `lockClubAccount` | Cập nhật `clubs/{clubId}.status` | Cloud Function + ghi thời điểm lock |

```javascript
// SECURITY TODO: move privileged action to Cloud Function
// Hiện đang ghi trực tiếp từ client — cần chuyển sang callable function
```

**Trạng thái**: ❌ Tất cả vẫn ở client — TODO Phase 4.1+

---

## 6. License Check theo Club — server-side

Hiện tại app kiểm tra `clubs/{clubId}.status` và `expiresAt` ở **client**.
Client có thể bị bypass bằng DevTools.

Cần bổ sung:
- **Firestore Rules**: từ chối ghi nếu `clubs/{clubId}.status == 'locked'`
- **Cloud Function**: trả về 403 nếu club hết hạn
- **Tương lai**: `allowedDomains` field để lock theo domain

```
clubs/{clubId}: {
  status: 'active' | 'locked' | 'expired',
  expiresAt: Timestamp,
  allowedDomains: ['yourdomain.com']   // TODO Phase 4.2
}
```

---

## 7. XSS / innerHTML Audit

App có 123+ vị trí dùng `innerHTML`. Phần lớn là static HTML/icon.
Các vị trí **nguy hiểm** (render dữ liệu user-generated):

| File | Dòng | Dữ liệu nguy hiểm | Trạng thái |
|---|---|---|---|
| app.js | ~1094 | `clubName` từ Firestore | ⚠️ TODO: escape |
| app.js | ~1099 | `e.message` từ Error | ⚠️ TODO: escape |
| app.js | ~1301 | `_branchName` từ Firestore | ⚠️ TODO: escape |
| app.js | ~2087 | `name` (bank name) từ config | ⚠️ TODO: escape |
| app.js | ~2141 | `b.n` (bank name) từ config | ⚠️ TODO: escape |

Có helper sẵn: `window.escapeHtml(str)` — cần dùng cho tất cả dữ liệu user-generated.

**Kế hoạch**:
- Phase 4.0B-3: Đánh dấu TODO tại các điểm nguy hiểm (không rewrite)
- Phase 4.1: Audit toàn bộ + patch từng vị trí

---

## 8. Source Map — KHÔNG publish lên production

```javascript
// vite.config.js / esbuild config
build: {
  sourcemap: false  // production
}
```

Source map expose toàn bộ source code gốc, kể cả sau khi minify.

---

## 9. Lộ trình tương lai

| Phase | Việc cần làm |
|---|---|
| 4.0B-3 (hiện tại) | Baseline rules, cache headers, syntax check, XSS audit TODOs |
| 4.1 | Bật App Check, giới hạn API key domain, patch XSS hotspots |
| 4.2 | Move 3-5 privileged actions sang Cloud Functions |
| 4.3 | CSP header, remove inline onclick, sanitize innerHTML |
| 4.4 | License check server-side, allowedDomains, audit log |
| 5.x | Minify + light obfuscation (SAU khi runtime ổn định) |

---

## 10. Checklist Không Lưu Secret trong Frontend

- [x] Firebase apiKey public — được phép (không phải secret)
- [x] Không lưu service account key trong frontend
- [x] Không lưu Firestore admin SDK key trong frontend
- [ ] **TODO**: Giới hạn API key theo domain (Google Cloud Console)
- [ ] **TODO**: Bật App Check
- [ ] **TODO**: Không commit `.env` hay `serviceAccountKey.json` lên git

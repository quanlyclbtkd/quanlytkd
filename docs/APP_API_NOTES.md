# Ghi chú API chuyển từ app.js

Chỉ chuyển phần JSDoc; mã thực thi giữ nguyên. Mốc dòng tham chiếu theo A9R13.

## Dòng 346

```javascript
/**
     * Ghi một read event vào __readScaleMetrics.
     * @param {string} collection — tên collection
     * @param {number} docCount   — số docs đã đọc
     * @param {string} reason     — ngữ cảnh (listener name, export, v.v.)
     */
```

## Dòng 409

```javascript
/**
     * Đọc toàn bộ một collection lớn qua cursor pagination (dùng cho export/báo cáo).
     * Tránh limit(500) hard cap — lấy TẤT CẢ docs qua nhiều trang nhỏ.
     *
     * @param {Function} fetchPage — async (opts) => QuerySnapshot
     *   opts: { pageSize, cursor, direction: 'first'|'next' }
     * @param {Object}   options
     *   options.pageSize    — docs per page (default exportBatchSize)
     *   options.maxPages    — giới hạn vòng lặp an toàn (default 50)
     *   options.collection  — tên collection (cho metrics)
     * @returns {Array<{id, ...data}>}
     */
```

## Dòng 4817

```javascript
/**
     * Bỏ dấu tiếng Việt + lowercase + trim để tạo search key nhất quán.
     * Đồng bộ với normalize helper trong students.service.js (searchProfilesServerSide).
     * @param {string} value — raw text
     * @returns {string} normalized text (no diacritics, lowercase, single-space)
     */
```

## Dòng 4842

```javascript
/**
     * Xây dựng search index fields cho hồ sơ võ sinh.
     * Ghi cùng lúc với setDoc/update để search luôn nhất quán.
     *
     * @param {Object} profile — {phone, memberId, nickname, …}
     * @param {string} name    — tên võ sinh (doc ID)
     * @returns {{searchName, searchNameTokens, searchPhone, searchCode, searchNickname}}
     */
```

## Dòng 4866

```javascript
/**
     * Lấy tất cả trang của một query Firestore theo cursor pagination.
     * Dùng để thay thế getDocs với limit(500) hard-cap.
     *
     * @param {Function} makeQuery — (opts: {cursor, pageSize}) => Firestore Query
     * @param {Object}   options
     * @param {number}   options.pageSize — số docs mỗi trang (default 200)
     * @param {string}   options.reason   — ghi vào readMetric (optional)
     * @param {string}   options.domain   — collection name cho metric (optional)
     * @param {number}   options.maxPages — số trang tối đa (default 50 → 10.000 docs)
     * @returns {Promise<Array>} — mảng tất cả docs (DocumentSnapshot)
     */
```

## Dòng 10558

```javascript
/**
     * activateLegacyRootFallback() — Phase 4.0B-4F (updated from 4E).
     * Read-only. Không ghi Firestore. Không migration.
     * Sync vào: window.__store + closure allProfiles/allTransactions/allInventory
     *           + studentProfileStore + inventoryStore nếu có.
     * Bump dataVersion + invalidate tabs + scheduleRender.
     */
```

## Dòng 10772

```javascript
/**
     * generatePilotLaunchSnapshot() — Phase 4.0B-4H.
     * Gom kết quả tất cả diagnostic functions thành một snapshot duy nhất.
     * Dùng để chụp trạng thái đầy đủ tại một thời điểm. Không log PII.
     *
     * Cách dùng:
     *   const snap = await window.generatePilotLaunchSnapshot();
     *   console.log(JSON.stringify(snap, null, 2));
     */
```

## Dòng 10782

```javascript
/**
     * printOneClubPilotGate() — Phase 4.0B-4H.
     * Tổng hợp go/no-go gate cho 1-CLB pilot. Không log PII.
     *
     * Cách dùng:
     *   const gate = window.printOneClubPilotGate();
     *   // gate.readyForOneClubPilot === true  →  GO
     *   // gate.blockers.length > 0            →  NO-GO, xem gate.blockers
     */
```

## Dòng 10796

```javascript
/**
     * runOnboardingGate(clubIdOrOptions) — Phase 4.0B-4I.
     * Chạy kiểm tra tự động cho một CLB mới trước khi bàn giao.
     * Read-only. Không ghi Firestore. Không migration. Không log PII.
     *
     * Cách dùng:
     *   await window.runOnboardingGate()
     *   await window.runOnboardingGate('clubId123')
     *   await window.runOnboardingGate({ clubId: 'clubId123', mode: 'pilot' })
     */
```

## Dòng 10807

```javascript
/**
     * printOnboardingGate(clubIdOrOptions) — Phase 4.0B-4I.
     * Wrapper hiển thị kết quả bằng console.table. Read-only. Không log PII.
     *
     * Cách dùng:
     *   await window.printOnboardingGate()
     *   await window.printOnboardingGate({ clubId: window.__store?.clubId })
     */
```

## Dòng 10816

```javascript
/**
     * generateOnboardingReportText(options) — Phase 4.0B-4I.
     * Tạo markdown text để người dùng copy vào ONBOARDING_REPORT_TEMPLATE.
     * Không tự download. Không ghi Firestore. Chỉ return string.
     *
     * Cách dùng:
     *   const text = await window.generateOnboardingReportText({ clubId: '...' });
     *   console.log(text);
     */
```

## Dòng 10837

```javascript
/**
     * runSuperAdminAudit(options) — Phase 4.0B-4J.
     * Audit read-only nhiều CLB cùng lúc. Chỉ dành cho SuperAdmin.
     * Không ghi Firestore. Không đổi context. Không log PII.
     *
     * Cách dùng:
     *   await window.runSuperAdminAudit({ limit: 5 })
     *   await window.runSuperAdminAudit({ clubIds: ['clb1','clb2'] })
     */
```

## Dòng 10855

```javascript
/**
     * generateSuperAdminAuditReportText(options) — Phase 4.0B-4J.
     * Tạo markdown text báo cáo audit để SuperAdmin copy. Không ghi Firestore.
     *
     * Cách dùng:
     *   const text = await window.generateSuperAdminAuditReportText({ limit: 10 });
     *   console.log(text);
     */
```

## Dòng 11193

```javascript
/**
     * Tính số lượng võ sinh đã đăng ký thi (đã nộp lệ phí) trong kỳ thi hiện tại.
     * Đếm unique student names từ transactions type='Lệ phí thi' hoặc 'Học phí + Lệ phí thi'
     * đã có examAmount > 0 và chưa bị cancel.
     *
     * @returns {{ registeredCount: number, paidNames: string[] }}
     */
```

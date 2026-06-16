# Hướng dẫn triển khai Phase 4K-6V1 trên gói Spark

Bản này không cần Blaze, Cloud Functions, migration hoặc thay đổi Firestore Rules.

1. Chờ quota Firestore ngày hiện tại được reset.
2. Sao lưu thư mục GitHub repository hiện tại trên máy.
3. Giải nén ZIP 4K-6V1.
4. Copy toàn bộ file đã giải nén vào repository, giữ nguyên thư mục `.git`.
5. Không copy `node_modules`, `.env`, private key hoặc file debug log.
6. GitHub Desktop: commit và Push origin.
7. Chờ GitHub Pages deploy.
8. Mở trang bằng cửa sổ ẩn danh hoặc Ctrl+F5.
9. Kiểm tra Học phí, Báo nợ, Điểm danh, Thi Đai và Kho đồ.
10. Sau 24 giờ mở Firebase Usage để so sánh document reads.

Không chạy:

- `firebase deploy --only functions`
- migration `expiryAt`
- `firebase deploy --only firestore:rules`

Diagnostics sau deploy:

```js
window.printSparkReadMetrics()
window.printListenerMetrics?.()
```

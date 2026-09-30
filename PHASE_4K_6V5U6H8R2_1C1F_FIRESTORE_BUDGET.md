# C1F Firestore Static Budget

| API | Before | After | Delta |
|---|---:|---:|---:|
| getDoc | 29 | 29 | 0 |
| getDocs | 51 | 51 | 0 |
| onSnapshot | 16 | 16 | 0 |

Evidence: C1D gate 16/16, C1E UI gate 28/28, C1F QuickPay gate 24/24 all independently report **29/51/16**.

No new reader/listener was added. No read-back was added after payment.

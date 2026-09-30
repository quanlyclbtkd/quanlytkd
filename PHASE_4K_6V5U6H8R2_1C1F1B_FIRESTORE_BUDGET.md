# F1B Firestore Static Budget

Static runtime call-site budget:

| Primitive | Before | After | Delta |
|---|---:|---:|---:|
| getDoc | 29 | 29 | 0 |
| getDocs | 51 | 51 | 0 |
| onSnapshot | 16 | 16 | 0 |

Result: **PASS — 29 / 51 / 16**.

F1B adds no Firestore import to `TuitionCommandBoundary`, no reader, writer authority, listener, polling, scheduler or persistent lock.

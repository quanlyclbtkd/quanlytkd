# 01 — Baseline identity

Phase: A9R18-EXAM-SEARCH-MOBILE-FOCUS-R1.

Exact input: `A9R18_R2_2_S0_FULL_SOURCE_COMPLETE(1).zip`.

Expected = measured outer SHA-256: `399cfde10d6e9fa929728188095fa5d477e77b66a7fc3a1a400989c0927f16f1`.

Input ZIP CRC: PASS. Source files extracted independently to baseline/source and candidate/source: 1,988. Baseline remains byte-identical after all checks. No production Firebase connection/deploy.

| Protected baseline file | Measured SHA-256 |
|---|---|
| `app.js` | `922c86bab2b085b36ec8eeb23f4d0bdc3652cf1eb131ac466939a2a5bf5a9619` |
| `js/modules/searchRuntime.js` | `489cfce41aafe0147cfebf37e3e879830549465b8cae444e062cdf727ae813d8` |
| `js/listeners/exam.listeners.js` | `eae546eb6a369ff652c4f3abb0dc69e56cf80604a405a7d575e660c0ed911009` |
| `js/ui/legacyUiShell.js` | `0f5dfcc8e11ce115bd7c123b0fe9d37766ba786e50cd49787cfea902522cd2df` |
| `js/legacy/legacyUiFallbacks.js` | `4a1773ae305467bbf057cabc0ffda7e36cccc0d6525520f96416ee3b695fc852` |
| `index.html` | `18590383bef971e26b297118ee19d9032f16ccd3614bd613e66a6999a4685d13` |
| `firestore.rules` | `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3` |
| `firestore.indexes.json` | `72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2` |
| `firebase.json` | `5a7aa67432f9601838edfc7e162e06fb7f9a9916b0109e3330b575b8d3b55814` |
| `package.json` | `6fa1a032c18e7ab4a477819c7b79785207950e899b4ffb35cb3b75557d400bdd` |
| `package-lock.json` | `c1030ff5e36f49acfa7ea0bbe05d7229d71c97129af9158a9e91fa6c8dc1785a` |

Baseline production call-site budget: 24 getDoc / 43 getDocs / 16 onSnapshot. Root/public: 129 pairs, 0 mismatch. All 16 requested protected gates GREEN before patch; logs preserved under logs/protected-baseline.

Baseline phase-specific behavioral proof: 22 PASS / 66 RED on the expanded actual-source synthetic DOM matrix. The initial 71-case proof was captured before production patch, then expanded to 88 cases against the same immutable baseline. These REDs are the disconnected Exam search and unsafe focus/inert contract; they are not Finance business REDs.

Environment: Linux, Node v24.22.1; existing Playwright 1.62.1. Local Chromium cannot start because socket() is denied. Cloud-browser fixture access was also blocked; no native-warning reproduction claimed.

Accepted baseline runtime SHA-256: `3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da`.

Candidate runtime SHA-256: `bf5e80f9ce680662c9540b195f23008202cfc794255a532c5d1369587d256346`. Candidate is not added to or substituted into the old accepted source manifests/tooling pins. Historical reports retained in source describe their original phases.

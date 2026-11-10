# 07 — Exact changed files

Only six approved runtime files and their six byte-identical public mirrors changed. All 1,976 other pre-existing source files remain exact. package.json/package-lock.json, Finance/Inventory/Students/Attendance/StudentSearchIndex, Rules/indexes/firebase.json, tabs.js/renderInvalidation.js and R2.2/S0 tooling are frozen.

| File | Baseline SHA-256 | Candidate SHA-256 |
|---|---|---|
| `app.js` | `922c86bab2b085b36ec8eeb23f4d0bdc3652cf1eb131ac466939a2a5bf5a9619` | `87f21cb01f826fcf8a3836b9efe36232ae8fe4c7c7009796fb925559a2d208dc` |
| `index.html` | `18590383bef971e26b297118ee19d9032f16ccd3614bd613e66a6999a4685d13` | `37043dae42853df95f53eb968d87550d15a338b11499df137dbd6c3ed8d3b25d` |
| `js/legacy/legacyUiFallbacks.js` | `4a1773ae305467bbf057cabc0ffda7e36cccc0d6525520f96416ee3b695fc852` | `d30f013a16e880b2106a14fcbb70108bdc18536146671608e680ee4200840966` |
| `js/listeners/exam.listeners.js` | `eae546eb6a369ff652c4f3abb0dc69e56cf80604a405a7d575e660c0ed911009` | `82b3c47a0d2ec88853635327196bc8662cfbcb61f26fa7641adc0e6464457ac3` |
| `js/modules/searchRuntime.js` | `489cfce41aafe0147cfebf37e3e879830549465b8cae444e062cdf727ae813d8` | `e57d669b02697fedeca7e8b72a4a9d1e16801b66d79ee148d6bf5d8c6a076edf` |
| `js/ui/legacyUiShell.js` | `0f5dfcc8e11ce115bd7c123b0fe9d37766ba786e50cd49787cfea902522cd2df` | `75ae9f7145e707133bbd11a46774039f58f5069c301e4d0ca6017491d41356d8` |
| `public/app.js` | `922c86bab2b085b36ec8eeb23f4d0bdc3652cf1eb131ac466939a2a5bf5a9619` | `87f21cb01f826fcf8a3836b9efe36232ae8fe4c7c7009796fb925559a2d208dc` |
| `public/index.html` | `18590383bef971e26b297118ee19d9032f16ccd3614bd613e66a6999a4685d13` | `37043dae42853df95f53eb968d87550d15a338b11499df137dbd6c3ed8d3b25d` |
| `public/js/legacy/legacyUiFallbacks.js` | `4a1773ae305467bbf057cabc0ffda7e36cccc0d6525520f96416ee3b695fc852` | `d30f013a16e880b2106a14fcbb70108bdc18536146671608e680ee4200840966` |
| `public/js/listeners/exam.listeners.js` | `eae546eb6a369ff652c4f3abb0dc69e56cf80604a405a7d575e660c0ed911009` | `82b3c47a0d2ec88853635327196bc8662cfbcb61f26fa7641adc0e6464457ac3` |
| `public/js/modules/searchRuntime.js` | `489cfce41aafe0147cfebf37e3e879830549465b8cae444e062cdf727ae813d8` | `e57d669b02697fedeca7e8b72a4a9d1e16801b66d79ee148d6bf5d8c6a076edf` |
| `public/js/ui/legacyUiShell.js` | `0f5dfcc8e11ce115bd7c123b0fe9d37766ba786e50cd49787cfea902522cd2df` | `75ae9f7145e707133bbd11a46774039f58f5069c301e4d0ca6017491d41356d8` |

app.js bytes outside the renderExamList assignment are identical. Normalized protected outside-render SHA-256: `2773acff75dbd36d873e40336f4b433c9dbe54dd6422887285a4b06f9c032978`.

index.html bytes outside the existing menu fallback script and the one inert attribute are identical. Outside-menu SHA-256: `2598ae3696f0d5d3b3db292856c810fb10da3edcbe396abe348d561368140885`.

All original exam.listeners functions, including `_triggerExamRender`, remain byte-identical. SearchRuntime functions outside its four allowed routing/delay functions remain byte-identical. Existing UI functions outside open/close are unchanged. GlobalOwnershipRegistry is unchanged.

New test-only files are tools/check-exam-search-mobile-focus-r1.mjs and the phase harness/browser files under tools/exam-search-mobile-focus-r1/. New evidence stays under this phase folder. Historical checker expected values are untouched. Complete runtime diff is RUNTIME_PATCH.diff; hashes, graph and budget proof are in SOURCE_SCOPE_AND_BUDGET.json.

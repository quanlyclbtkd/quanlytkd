# PHASE_4K_6V5U6H8R2_1C1F1D1A — Changed Production Files

Before/after hash set covers **135 production/runtime/config files**.

- expected changed: **5**
- unexpected changed: **0**
- missing: **0**
- unchanged: **130**

| File | Before SHA-256 | After SHA-256 | Classification |
|---|---|---|---|
| `app.js` | `25428e68bb28a8bdf5bc216e5e6a1359dc0b98edaf92c1dda8b666ac67bc215c` | `08b5cb7f60b92a433de59d85c082b384a4ae4651e68b28b3aeb677a9e55f0550` | expected |
| `js/core/transactionDeleteIntegrity.js` | `bbbc3b9db0c524f75b60e21335dc1dd6df601e7cbf386ac642de9ba375fe6914` | `d14af9c353371a1aee97d5ff835308869771ec28a4b3155c4746688d9299c3b3` | expected |
| `js/modules/finance.js` | `75fb799ac8ed00ba621939b58a1f5390626961ea11543b8f5a5d05b4a25cab21` | `6a0eb0687cfb60fed07481ee26575e543a67cef1c1a913ea1ea882e50bd6342d` | expected |
| `js/services/finance.service.js` | `55cbc2c2cb54f6c5357f0d6393f3601fe28e08b187cdf63318bde5afcbf5e4ea` | `27b2bc47a8ad10c15a259db1e897a91e5197e3edc0bda212f12280f10aff015c` | expected |
| `js/ui/render/computation/inventoryRenderer.js` | `5d44c5abe8295d70069d74e36926c659e51dd170e892c138f78974c903a6d044` | `19a5a34ed3e2a43ddba9e3e4b031b96517b3022a12dbe66d6a229b4200ef0490` | expected |

Production changes are limited to the proven D1A root causes: MultiItem binding/runtime behavior, canonical transaction↔Inventory relationship/validation, one delete coordinator routing, defensive transaction ID guard, and renderer relation consumption.

Tool/report/package-script changes are not counted as production runtime files in this 135-file proof.

---
"@emdash-commerce/compat-woocommerce": patch
---

Serialize bridge response headers through the standard Headers.forEach contract,
keeping the host HTTP bridge usable with DOM types that omit iterable extensions.

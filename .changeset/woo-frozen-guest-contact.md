---
"@emdash-commerce/compat-woocommerce": patch
---

Preserve a guest order's frozen email in Woo billing projections when the billing address has no contact email. Explicit billing contacts and snapshot overrides retain priority; opaque buyer claims are never exported as email. The projection uses no current customer data and does not mutate the native order.

---
"@otta-sh/payments-stripe": patch
---

Acknowledge signature-verified Stripe refund events without a native refund reservation before requiring native order metadata. Bound refunds still require valid settlement fields, and invalid signatures remain rejected.

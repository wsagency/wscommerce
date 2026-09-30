---
"@otta-sh/site-staging": patch
---

Use a same-origin checkout referrer policy so browser form submissions retain
their origin and pass the existing CSRF guard. Coupon-bearing URLs remain hidden
from external links. Preserve real-browser coverage of both behaviors.

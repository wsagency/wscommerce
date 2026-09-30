---
"@otta-sh/plugin": patch
"@otta-sh/admin-react": patch
"@otta-sh/store-emdash": patch
---

Give parent and variant stock movements one command identity per confirmed intent. Distinct add/remove/add movements apply even when counts return to an earlier value. Retain unanswered commands across transport retries and tab reloads, recover native durable receipts before stale-count refusal, and reject changed SKU, quantity or operation under an existing command.

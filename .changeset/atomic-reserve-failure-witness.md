---
"@otta-sh/domain": patch
"@otta-sh/store-emdash": patch
---

Make a claimed reserve's successful hold and failed outcome mutually exclusive
in the same SKU inventory CAS. Retain failed decisions in the existing bounded
movement ring and promote their original durable key/index outcome before any
writer can evict them. Replays and interrupted completion now preserve one
answer without stranding held units. Upgrade all inventory writers together;
there is no schema migration or background-healer dependency.

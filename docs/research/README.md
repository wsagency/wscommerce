# Research and source comparison

WSCommerce is based on Otta's MIT-licensed domain/store/plugin foundation. The source review compared specific revisions of Otta, DashCommerce, WooCommerce and EmDash, including relevant development branches. It selected Otta's native conditional-storage model and development changes, then added independently implemented retail/accounting and HTTP compatibility features.

- [Historical comparison, 2026-09-30](2026-09-30-codebase-audit.md): audited commits, upstream feature coverage, local reproductions and the original development recommendations. Findings describe those revisions before this fork's fixes, not the current state of each upstream project.
- [Archived Otta introduction](upstream-otta-readme.md): original upstream README, preserved for context.
- [Source provenance](../../NOTICE.md): selected imported commits, copyright retention and licensing boundaries.
- [Current WSCommerce validation](../validation.md): implemented foundation, regression coverage and remaining production/vendor acceptance.

Otta source/history is preserved. DashCommerce is a design reference without copied implementation source. WooCommerce and the inspected vendor PHP plugin are functional/protocol references; their implementation source is not redistributed. Historical scratch probes and local audit logs are not shipped in this repository. Public source links in the comparison point to the exact audited commits.

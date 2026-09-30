# Source and third-party notices

WSCommerce (Websolutions Commerce) is an independent MIT fork of [Otta](https://github.com/UrumiAI/otta.sh), copyright 2026 Vedanshu. The original copyright notice, MIT permission text and upstream Git history are preserved. Websolutions additions are copyright 2026 Websolutions and WSCommerce contributors, also under MIT. See [LICENSE](LICENSE).

## Otta foundation

The base integrates Otta main `7c63e6c2b21927b4760d396cc79da321de131f15`, selected [PR 322](https://github.com/UrumiAI/otta.sh/pull/322) commits `3bf1802` and `c83577a`, [PR 326](https://github.com/UrumiAI/otta.sh/pull/326) variant commit `7f21308`, and [PR 299](https://github.com/UrumiAI/otta.sh/pull/299) commit `2271db6`. Local integration adjustments are recorded at `15ebd751c7302ad69bb2f4fecde003e756c9e505` and subsequent commits. The inherited package names and plugin IDs remain compatibility identifiers.

## Reference projects

[WooCommerce](https://github.com/woocommerce/woocommerce) is a functional/protocol reference. Its root source license is GPL-2.0-or-later; no WooCommerce PHP implementation, templates or test source are copied into this MIT source tree. e-racuni's WordPress plugin was inspected for interoperability only and is not redistributed here. The HTTP compatibility implementation is native TypeScript.

[DashCommerce](https://github.com/emdashCommerce/dashcommerce) is an MIT-licensed audit and design reference. No DashCommerce source is currently copied into this tree. Any future imported source must preserve its original notice and record its source commit and paths here.

The [historical source comparison](docs/research/2026-09-30-codebase-audit.md) records the audited revisions. It describes upstream state before this fork's implementation; use the [validation record](docs/validation.md) for the current foundation.

## Bundled data and dependencies

ISO region/subdivision data is derived from Unicode CLDR 48.2 and licensed under Unicode License V3 (SPDX `Unicode-3.0`). Its complete copyright and permission notice is preserved in [domain notices](packages/domain/THIRD_PARTY_NOTICES) and [plugin notices](packages/plugin/THIRD_PARTY_NOTICES); the generation-source license is in [the CLDR script directory](packages/domain/scripts/cldr-48.2/LICENSE).

Installed dependencies remain under their own respective licenses. The MIT license for this project does not replace those notices. Project credits are collected in [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md).

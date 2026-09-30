# Security policy

## Supported versions

WSCommerce is an initial, pre-1.0 foundation. Security fixes target `main`; there are no WSCommerce npm releases or LTS branches yet. Deploy from a reviewed commit and track the repository's updates.

## Reporting a vulnerability

Report suspected security vulnerabilities privately to **[hello@ws.agency](mailto:hello@ws.agency)**. Include the affected commit, configuration, expected/actual behavior and reproduction steps. Do not include live credentials or customer data in the report. Do not open a public issue for an unpatched vulnerability.

Reports are reviewed on a best-effort basis. Commercial integration/support inquiries use the same Websolutions contact.

## Scope

WSCommerce handles commerce and money. Correctness bugs that break stock conservation, payment/refund confirmation, idempotency, billing privacy or permission boundaries are in scope, including races that enable overselling or duplicate financial actions. See [the commerce invariants](DEVELOPMENT.md#4-commerce-invariants-rules-emdash-doesnt-need) and [operational recovery](docs/operations.md).

For a deployment-specific incident, preserve relevant event IDs and the affected commit so the operator can reconcile provider and native state. Rotate an exposed credential with its provider; never attach it to a public issue.

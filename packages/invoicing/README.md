# Commerce invoicing

This package implements immutable invoice evidence, durable CAS jobs, serialized provider leases, and injected HTTP clients for Solo and e-racuni. It imports no host runtime, opens no database, and reads no environment. The host injects declared EmDash collections and a scoped transport.

Each shop selects one invoice owner: `disabled`, `solo`, `e-racuni`, or `woocommerce-connector`. A native order can have one direct invoice job. Changing the provider, billing evidence, financial snapshot, or correlation reference after enqueue is a conflict. The Woo connector owner never invokes the direct provider clients.

## Financial contract

All amounts are integer minor units. Provider decimal serialization uses integer arithmetic. Native invoices use the frozen order line net/gross/VAT evidence, never current product prices or tax classes. Legacy orders with nonzero tax and missing frozen rates require reconciliation. Missing billing is an explicit error. Pending, canceled, refunded, and payment-reconciled orders cannot be automatically invoiced.

The initial direct profile is Croatian domestic invoicing. Solo supports EUR B2C, the documented 0/5/13/25 percent rates, and at most 36 provider items. B2B/B2G KPD classification and cross-border/OSS exemption require additional explicit profiles. e-racuni uses explicit net-priced `Gross` documents with `SalesInvoiceCreate`, `SalesInvoice.Items`, and `apiTransactionId`. Provider totals and currency must equal the order before the job is recorded as issued. Discounts are represented by discounted frozen net amounts; division remainders are preserved by splitting unit-price groups. Unrepresentable VAT rounding fails before submission.

## Job states and recovery

`queued → issuing → issued`, `retry`, `failed`, or `reconciliation`.

A CAS lease admits one worker. Lease tokens fence late completions. Solo has no documented issue idempotency: unknown transport results and expired issuing leases stop for reconciliation. e-racuni documents `apiTransactionId`; an expired lease can reuse the exact original correlation and request. The provider lock serializes work per account with 10-second Solo spacing or 1-second e-racuni spacing. Transports receive a 30-second abort signal; leases last 120 seconds. A deployment must honor that abort signal and bound worker execution accordingly.

Invoice documents and provider references remain durable. Failed/unknown attempts are observable; provider message bodies and credentials are never copied into job diagnostics.

## Provider acceptance

Local tests use actual migrated SQLite for storage and controlled provider responses for HTTP contracts. No local check issues real invoices.

The e-racuni endpoint belongs to the organization; copy it from its developer console rather than assuming a regional hostname. Public documentation describes the document fields and issue idempotency but does not establish the complete success envelope for this organization's account. The default decoder accepts a complete `SalesInvoice` object containing `IssuedInvoice`, document ID, number, currency, and amount. Other envelopes remain `ERACUNI_UNCONFIRMED_RESPONSE`. Inject an account-specific decoder only after a sandbox response has been verified. An HTTP 200 or a connector's `connectedSuccess` message is never invoice proof.

Lookup, credit notes, statutory cancellation, PDF transmission, and customer email sending are not automatically invoked by this package. Invoice issuance is not itself a certificate/fiscalization acceptance test. Complete those account-specific checks before enabling automatic issuance on a client shop.

## Primary specifications

- [Solo invoice creation](https://solo.com.hr/api-dokumentacija/izrada-racuna)
- [Solo customer types](https://solo.com.hr/api-dokumentacija/tipovi-kupaca)
- [e-racuni API developer documentation](https://eurofaktura.com/rit/ApiDocumentation): `SalesInvoiceCreate`, `SalesInvoice`, and `SalesInvoiceItem`

Use the distribution's integration/operations guide for host wiring and credential placement.

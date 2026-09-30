# Croatian bank-transfer barcodes

HUB-3A support follows the [HUB version 6 specification](https://hub.hr/sites/default/files/inline-files/2DBK_EUR_Uputa_1.pdf). Amounts are authoritative integer EUR cents of at most 15 digits. The fourteen UTF-8 fields terminate with LF. Croatian letters, periods and colons survive normalization; descriptive text is truncated to the prescribed character limits. Control characters fail validation. Croatian IBANs require a valid mod-97 checksum. Current supported reference models are HR00 (one to three numeric groups of at most twelve digits, at most 22 total characters) and HR99 (empty reference); other models require explicit validation algorithms before support.

`freezeBankTransferSnapshot` validates and copies recipient, payer and financial data. `buildHub3Payload` and `renderHub3Svg` revalidate inputs. SVG uses the pinned MIT-licensed `@bwip-js/generic` renderer, with nine columns, error correction level four, full PDF417, 3:1 rows and 0.254 mm modules. Output is bounded to 58 × 26 mm, with a quiet zone. Scale accepts whole values 1–6 and changes SVG coordinates, preserving physical print dimensions. No Node buffers, image service, PNG or external barcode API is involved.

Qualification: `pnpm exec vitest run packages/plugin/test/bank-barcode.test.ts` includes a real bundled workerd render with the production sandbox bridge. The synthetic recipient uses a nonexistent institution code and must never receive money. Automated SVG qualification does not prove a successful scan in a bank app or a payment. Print at actual size, scan on the intended supported bank apps, inspect the decoded fields without authorizing payment, and record device/app versions before activation.

Rendering attribution and MIT notices for Mark Warren's bwip-js and Terry Burton's BWIPP are preserved in `packages/plugin/THIRD_PARTY_NOTICES`.

## Configuration and private receipt route

In the authenticated payment Settings form, fill all six bank barcode fields
(name, street, postal code/city, Croatian IBAN, HR00/HR99, purpose), or leave all
six blank to retain plain offline instructions. An invalid partial profile is
rejected. Enable bank transfer and set its existing instructions/deadline too.
The first native order insert freezes the profile, authoritative EUR total and
payer; retries and later settings edits keep that snapshot. Historical orders
are never backfilled. Storage contracts cover SQLite, PostgreSQL and D1.

`storefront/order/bank-barcode` accepts `{orderId}` using the native UUID receipt
capability. It returns only `{ok:true,svg}` or a typed refusal. No payment
confirmation, event or order write occurs. Hosts must serve the SVG with
`Cache-Control: private, no-store`, `Referrer-Policy: no-referrer` and
`X-Content-Type-Options: nosniff`; exclude receipt and barcode paths from analytics.
Keep capabilities out of logs. Missing snapshots yield `NOT_AVAILABLE`.

HR00 reconciliation references use 21 decimal digits derived from the UUID,
split into two groups within HUB's 22-character limit. They are labels, not
capabilities or proof of settlement; rare collisions require reconciliation
against the full order record. HR99 carries an empty reference. At high volumes,
add a uniquely allocated numeric reference rather than relying on these labels.

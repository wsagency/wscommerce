import { currency } from "@otta-sh/domain";
import { formatDecimal, parseDecimal } from "./money.js";
import { providerLines, secureEndpoint } from "./provider-lines.js";
import { validateInvoiceSnapshot } from "./snapshot.js";
import type { InvoiceDocument, InvoiceOutcome, InvoiceProvider, ERacuniOptions } from "./types.js";
export type { ERacuniOptions } from "./types.js";

/** No inference from a success message, an HTTP code, or a bare document number. */
export function readERacuniDocument(payload: unknown): InvoiceDocument | null {
	if (typeof payload !== "object" || payload === null) return null;
	const envelope = payload as Record<string, unknown>;
	const candidate = envelope.SalesInvoice;
	if (typeof candidate !== "object" || candidate === null) return null;
	const row = candidate as Record<string, unknown>;
	if (
		row.status !== "IssuedInvoice" ||
		typeof row.documentID !== "string" ||
		!row.documentID ||
		typeof row.number !== "string" ||
		!row.number ||
		typeof row.documentCurrency !== "string"
	)
		return null;
	try {
		return {
			id: row.documentID,
			number: row.number,
			currency: currency(row.documentCurrency),
			totalGross: parseDecimal(String(row.documentAmount)),
			url: null,
		};
	} catch {
		return null;
	}
}

export function createERacuniProvider(options: ERacuniOptions): InvoiceProvider {
	const endpoint = secureEndpoint(options.endpoint);
	if (!options.username || !options.secretKey || !options.token)
		throw new Error("INVALID_ERACUNI_CONFIGURATION");
	const readDocument = options.readDocument ?? readERacuniDocument;
	return {
		id: "e-racuni",
		idempotentIssue: true,
		async issue(snapshot): Promise<InvoiceOutcome> {
			const validation = validateInvoiceSnapshot(snapshot);
			if (!validation.ok) return { status: "terminal", code: validation.reason };
			// Cross-border / OSS / B2B exemption is an explicit future tax-regime adapter.
			if (snapshot.billing.country !== "HR" || snapshot.billing.vatId)
				return { status: "terminal", code: "ERACUNI_UNSUPPORTED_TAX_PROFILE" };
			let lines;
			try {
				lines = providerLines(snapshot);
			} catch {
				return { status: "terminal", code: "PROVIDER_ROUNDING_UNREPRESENTABLE" };
			}
			const body = {
				username: options.username,
				secretKey: options.secretKey,
				token: options.token,
				method: "SalesInvoiceCreate",
				parameters: {
					apiTransactionId: snapshot.reference,
					sendIssuedInvoiceByEmail: false,
					generatePublicURL: false,
					SalesInvoice: {
						status: "IssuedInvoice",
						type: "Gross",
						date: snapshot.date,
						dateOfSupplyFrom: snapshot.date,
						documentCurrency: snapshot.currency,
						documentLanguage: "Croatian",
						buyerName: snapshot.billing.company ?? snapshot.billing.name,
						buyerStreet: snapshot.billing.line1,
						buyerPostalCode: snapshot.billing.postalCode,
						buyerCity: snapshot.billing.city,
						buyerCountry: snapshot.billing.country,
						buyerEMail: snapshot.billing.email,
						buyerTaxNumber: snapshot.billing.taxNumber ?? "",
						orderReference: snapshot.reference,
						methodOfPayment:
							snapshot.paymentMethod === "stripe"
								? "Stripe"
								: snapshot.paymentMethod === "cod"
									? "CashOnDelivery"
									: snapshot.paymentMethod === "bank_transfer"
										? "BankTransfer"
										: "Unknown",
						...(options.businessUnit ? { businessUnit: options.businessUnit } : {}),
						...(options.costPosition ? { costPosition: options.costPosition } : {}),
						Items: lines.map((line) => ({
							description: line.title,
							quantity: line.quantity,
							unit: "kom",
							currency: snapshot.currency,
							netPrice: formatDecimal(line.unitNet),
							vatPercentage: formatDecimal(line.taxRateBps as Parameters<typeof formatDecimal>[0]),
							vatTransactionType: "0",
						})),
					},
				},
			};
			try {
				const response = await options.transport(endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(30_000),
				});
				if (!response.ok) return { status: "unknown", code: "ERACUNI_HTTP_UNCONFIRMED" };
				const document = readDocument(await response.json());
				return document
					? { status: "issued", document }
					: { status: "unknown", code: "ERACUNI_UNCONFIRMED_RESPONSE" };
			} catch {
				return { status: "unknown", code: "TRANSPORT_UNKNOWN" };
			}
		},
	};
}

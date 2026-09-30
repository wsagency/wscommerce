import type { Cents, Currency } from "@otta-sh/domain";

export type InvoiceOwner = "disabled" | "solo" | "e-racuni" | "woocommerce-connector";
export type DirectInvoiceProvider = "solo" | "e-racuni";

/** Frozen financial and billing evidence. Never reprice an invoice from the live catalog. */
export interface InvoiceSnapshot {
	orderId: string;
	reference: string;
	date: string;
	currency: Currency;
	billing: {
		name: string;
		company: string | null;
		taxNumber: string | null;
		vatId: string | null;
		email: string;
		line1: string;
		city: string;
		postalCode: string;
		country: string;
	};
	paymentMethod: "stripe" | "bank_transfer" | "cod" | "x402";
	lines: InvoiceLine[];
	shipping: { title: string; net: Cents; tax: Cents; taxRateBps: number };
	totalNet: Cents;
	totalTax: Cents;
	totalGross: Cents;
}

export interface InvoiceLine {
	sku: string;
	title: string;
	quantity: number;
	unitNet: Cents;
	subtotalNet: Cents;
	totalNet: Cents;
	totalTax: Cents;
	totalGross: Cents;
	taxRateBps: number;
}

export interface InvoiceDocument {
	id: string;
	number: string;
	totalGross: Cents;
	currency: Currency;
	url: string | null;
}

/** Codes are static/redacted. Provider messages may contain credentials or customer data. */
export type InvoiceOutcome =
	| { status: "issued"; document: InvoiceDocument }
	| { status: "retryable"; code: string; retryAfterMs: number }
	| { status: "terminal"; code: string }
	| { status: "unknown"; code: string };

export interface InvoiceProvider {
	id: DirectInvoiceProvider;
	/** True only when the provider documents idempotency for the exact issue request. */
	idempotentIssue: boolean;
	issue(snapshot: InvoiceSnapshot): Promise<InvoiceOutcome>;
}

export type InvoiceState = "queued" | "issuing" | "retry" | "issued" | "failed" | "reconciliation";

export interface InvoiceJob {
	id: string;
	orderId: string;
	provider: DirectInvoiceProvider;
	idempotentIssue: boolean;
	snapshot: InvoiceSnapshot;
	state: InvoiceState;
	attempts: number;
	createdAt: string;
	updatedAt: string;
	nextAttemptAt: string;
	lease: { token: string; workerId: string; expiresAt: string } | null;
	document: InvoiceDocument | null;
	code: string | null;
}

/** Inject ctx.http.fetch in an EmDash plugin; global fetch is for the host adapter only. */
export type InvoiceTransport = (url: string, init: RequestInit) => Promise<Response>;

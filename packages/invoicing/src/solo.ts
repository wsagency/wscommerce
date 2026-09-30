import { currency } from "@otta-sh/domain";
import { formatDecimal, parseDecimal } from "./money.js";
import { providerLines } from "./provider-lines.js";
import { validateInvoiceSnapshot } from "./snapshot.js";
import type { InvoiceOutcome, InvoiceProvider, SoloOptions } from "./types.js";
export type { SoloOptions } from "./types.js";

function localizedDecimal(value: unknown): string {
	if (
		typeof value !== "string" ||
		!/^(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:\.[0-9]{3})+)(?:,[0-9]{1,2})?$/.test(value)
	)
		throw new Error("INVALID_PROVIDER_DECIMAL");
	return value.replaceAll(".", "").replace(",", ".");
}

export function createSoloProvider(options: SoloOptions): InvoiceProvider {
	if (
		!options.token ||
		!Number.isSafeInteger(options.serviceType) ||
		options.serviceType < 1 ||
		![1, 2, 3, 4, 5].includes(options.invoiceType)
	)
		throw new Error("INVALID_SOLO_CONFIGURATION");
	return {
		id: "solo",
		idempotentIssue: false,
		async issue(snapshot): Promise<InvoiceOutcome> {
			const validation = validateInvoiceSnapshot(snapshot);
			if (!validation.ok) return { status: "terminal", code: validation.reason };
			if (
				snapshot.currency !== "EUR" ||
				snapshot.billing.country !== "HR" ||
				snapshot.billing.company ||
				snapshot.billing.vatId
			)
				return { status: "terminal", code: "SOLO_UNSUPPORTED_BILLING_PROFILE" };
			if (
				![...snapshot.lines.map((line) => line.taxRateBps), snapshot.shipping.taxRateBps].every(
					(rate) => [0, 500, 1300, 2500].includes(rate),
				)
			)
				return { status: "terminal", code: "SOLO_UNSUPPORTED_TAX" };
			let lines;
			try {
				lines = providerLines(snapshot);
			} catch {
				return { status: "terminal", code: "PROVIDER_ROUNDING_UNREPRESENTABLE" };
			}
			if (lines.length > 36) return { status: "terminal", code: "SOLO_TOO_MANY_LINES" };
			const body = new URLSearchParams({
				token: options.token,
				tip_usluge: String(options.serviceType),
				tip_racuna: String(options.invoiceType),
				tip_kupca: String(options.buyerType),
				kupac_naziv: snapshot.billing.name,
				kupac_adresa: `${snapshot.billing.line1}, ${snapshot.billing.postalCode} ${snapshot.billing.city}`,
				nacin_placanja:
					snapshot.paymentMethod === "stripe"
						? "3"
						: snapshot.paymentMethod === "bank_transfer"
							? "1"
							: snapshot.paymentMethod === "cod"
								? String(options.codPaymentType)
								: "5",
				datum_isporuke: snapshot.date,
				napomene: snapshot.reference,
			});
			for (const [index, line] of lines.entries()) {
				const position = String(index + 1);
				body.append("usluga", position);
				body.set(`opis_usluge_${position}`, line.title.slice(0, 500));
				body.set(`cijena_${position}`, formatDecimal(line.unitNet).replace(".", ","));
				body.set(`kolicina_${position}`, String(line.quantity));
				body.set(`popust_${position}`, "0");
				body.set(`porez_stopa_${position}`, String(line.taxRateBps / 100));
			}
			try {
				const response = await options.transport("https://api.solo.com.hr/racun", {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: body.toString(),
					signal: AbortSignal.timeout(30_000),
				});
				// A server/network failure may occur after issuance. Never blindly retry Solo.
				if (!response.ok) return { status: "unknown", code: "SOLO_HTTP_UNCONFIRMED" };
				const payload = (await response.json()) as {
					status?: number;
					racun?: Record<string, unknown>;
				};
				if (payload.status === 100)
					return { status: "retryable", code: "SOLO_RATE_LIMIT", retryAfterMs: 10_000 };
				if (payload.status !== 0) {
					// Fiscalization errors may still leave a persisted invoice in the provider.
					if (payload.status === 125 || !Number.isSafeInteger(payload.status))
						return { status: "unknown", code: "SOLO_UNCONFIRMED_RESPONSE" };
					return { status: "terminal", code: `SOLO_REJECTED_${payload.status}` };
				}
				const document = payload.racun;
				if (
					!document ||
					typeof document.id !== "string" ||
					!document.id ||
					typeof document.broj_racuna !== "string" ||
					typeof document.valuta_racuna !== "string"
				)
					return { status: "unknown", code: "SOLO_UNCONFIRMED_RESPONSE" };
				let url: string | null = null;
				if (typeof document.pdf === "string") {
					const parsed = new URL(document.pdf);
					if (
						parsed.protocol === "https:" &&
						parsed.hostname === "solo.com.hr" &&
						!parsed.username &&
						!parsed.password
					)
						url = parsed.href;
				}
				return {
					status: "issued",
					document: {
						id: document.id,
						number: document.broj_racuna,
						totalGross: parseDecimal(localizedDecimal(document.bruto_suma)),
						currency: currency(document.valuta_racuna),
						url,
					},
				};
			} catch {
				return { status: "unknown", code: "TRANSPORT_UNKNOWN" };
			}
		},
	};
}

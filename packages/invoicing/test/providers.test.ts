import { describe, expect, it } from "vitest";
import { createERacuniProvider, createSoloProvider } from "../src/index.js";
import type { InvoiceTransport } from "../src/index.js";
import { invoiceFixture } from "./fixtures.js";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const credentials = {
	endpoint: "https://eurofaktura.com/WebServices/API",
	username: "test-user",
	secretKey: "test-only-secret",
	token: "test-only-token",
};

describe("invoice provider HTTP contracts", () => {
	it("sends Solo net prices with comma decimals, sequential usluga parameters, and reconciles returned gross", async () => {
		let submitted: URLSearchParams | undefined;
		const transport: InvoiceTransport = async (url, init) => {
			expect(url).toBe("https://api.solo.com.hr/racun");
			submitted = new URLSearchParams(String(init.body));
			return response({
				status: 0,
				racun: {
					id: "invoice-1",
					broj_racuna: "2026-1",
					bruto_suma: "16,50",
					valuta_racuna: "EUR",
					pdf: "https://solo.com.hr/download/invoice-1",
				},
			});
		};
		const result = await createSoloProvider({
			token: "test-only-secret",
			serviceType: 1,
			invoiceType: 1,
			buyerType: 1,
			codPaymentType: 1,
			transport,
		}).issue(invoiceFixture());
		expect(submitted?.get("cijena_1")).toBe("15,71");
		expect(submitted?.get("porez_stopa_1")).toBe("5");
		expect(submitted?.getAll("usluga")).toEqual(["1"]);
		expect(submitted?.get("nacin_placanja")).toBe("3");
		expect(result).toMatchObject({
			status: "issued",
			document: { totalGross: 1650, currency: "EUR" },
		});
	});
	it("Solo rate limiting is retryable but a transport timeout has an unknown issue outcome", async () => {
		const config = {
			token: "test-only-secret",
			serviceType: 1,
			invoiceType: 1,
			buyerType: 1,
			codPaymentType: 1 as const,
		};
		expect(
			await createSoloProvider({
				...config,
				transport: async () => response({ status: 100, message: "secret customer data" }),
			}).issue(invoiceFixture()),
		).toEqual({ status: "retryable", code: "SOLO_RATE_LIMIT", retryAfterMs: 10_000 });
		expect(
			await createSoloProvider({
				...config,
				transport: async () => {
					throw new Error("test-only-secret");
				},
			}).issue(invoiceFixture()),
		).toEqual({ status: "unknown", code: "TRANSPORT_UNKNOWN" });
	});
	it("rejects unsupported Solo VAT before making a request", async () => {
		let calls = 0;
		const snapshot = invoiceFixture();
		const result = await createSoloProvider({
			token: "test-only-secret",
			serviceType: 1,
			invoiceType: 1,
			buyerType: 1,
			codPaymentType: 1,
			transport: async () => {
				calls++;
				return response({});
			},
		}).issue({ ...snapshot, lines: [{ ...snapshot.lines[0]!, taxRateBps: 1900 }] });
		expect(calls).toBe(0);
		expect(result).toEqual({ status: "terminal", code: "SOLO_UNSUPPORTED_TAX" });
	});
	it("refuses an unsupported frozen Solo buyer tax number before egress", async () => {
		let calls = 0;
		const snapshot = invoiceFixture();
		const result = await createSoloProvider({
			token: "test-only-secret",
			serviceType: 1,
			invoiceType: 1,
			buyerType: 1,
			codPaymentType: 1,
			transport: async () => {
				calls++;
				return response({});
			},
		}).issue({ ...snapshot, billing: { ...snapshot.billing, taxNumber: "TEST-ONLY-BUYER-ID" } });
		expect(result).toEqual({ status: "terminal", code: "SOLO_UNSUPPORTED_BILLING_PROFILE" });
		expect(calls).toBe(0);
	});
	it("uses the documented e-racuni method, frozen net amounts and apiTransactionId, and no automatic email", async () => {
		let submitted: Record<string, unknown> | undefined;
		const provider = createERacuniProvider({
			...credentials,
			transport: async (url, init) => {
				expect(url).toBe(credentials.endpoint);
				submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
				return response({
					SalesInvoice: {
						documentID: "doc-1",
						number: "2026-1",
						documentCurrency: "EUR",
						documentAmount: "16.50",
						status: "IssuedInvoice",
					},
				});
			},
		});
		expect(provider.idempotentIssue).toBe(true);
		expect(await provider.issue(invoiceFixture())).toMatchObject({
			status: "issued",
			document: { id: "doc-1", totalGross: 1650 },
		});
		expect(submitted?.method).toBe("SalesInvoiceCreate");
		expect(submitted?.parameters).toMatchObject({
			apiTransactionId: "shop-a:order-test-1:invoice",
			sendIssuedInvoiceByEmail: false,
			SalesInvoice: {
				type: "Gross",
				buyerCountry: "HR",
				orderReference: "shop-a:order-test-1:invoice",
				Items: [
					{ description: "Test book", quantity: 1, netPrice: "15.71", vatPercentage: "5.00" },
				],
			},
		});
	});
	it("does not assume that any e-racuni HTTP 200 means an issued invoice", async () => {
		const result = await createERacuniProvider({
			...credentials,
			transport: async () => response({ status: "connectedSuccess", message: "test-only-secret" }),
		}).issue(invoiceFixture());
		expect(result).toEqual({ status: "unknown", code: "ERACUNI_UNCONFIRMED_RESPONSE" });
	});
	it("rejects insecure or credential-bearing provider URLs", () => {
		expect(() =>
			createERacuniProvider({
				...credentials,
				endpoint: "http://eurofaktura.com/WebServices/API",
				transport: async () => response({}),
			}),
		).toThrow("INVALID_ENDPOINT");
		expect(() =>
			createERacuniProvider({
				...credentials,
				endpoint: "https://user:password@eurofaktura.com/WebServices/API",
				transport: async () => response({}),
			}),
		).toThrow("INVALID_ENDPOINT");
	});
});

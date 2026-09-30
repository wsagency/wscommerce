import { cents, currency } from "@otta-sh/domain";
import { describe, expect, it } from "vitest";
import { formatDecimal, parseDecimal, validateInvoiceSnapshot } from "../src/index.js";
import { invoiceFixture } from "./fixtures.js";

describe("invoice financial proof", () => {
	it("accepts a reconciled immutable gross/net snapshot", () => {
		expect(validateInvoiceSnapshot(invoiceFixture())).toEqual({ ok: true });
	});
	it("rejects a mismatch before any provider can issue a document", () => {
		const invoice = invoiceFixture();
		expect(validateInvoiceSnapshot({ ...invoice, totalGross: cents(1700) })).toEqual({
			ok: false,
			reason: "TOTAL_MISMATCH",
		});
	});
	it("rejects currency and quantity mismatch in line snapshots", () => {
		const invoice = invoiceFixture();
		expect(
			validateInvoiceSnapshot({ ...invoice, lines: [{ ...invoice.lines[0]!, quantity: 0 }] }).ok,
		).toBe(false);
		expect(validateInvoiceSnapshot({ ...invoice, currency: currency("JPY") })).toEqual({
			ok: false,
			reason: "UNSUPPORTED_CURRENCY",
		});
	});
	it("serializes minor units without float arithmetic or locale ambiguity", () => {
		expect(formatDecimal(cents(1650))).toBe("16.50");
		expect(formatDecimal(cents(1))).toBe("0.01");
		expect(parseDecimal("16.50")).toBe(1650);
		expect(() => parseDecimal("16.501")).toThrow();
		expect(() => parseDecimal("1e3")).toThrow();
		expect(() => parseDecimal("-0.01")).toThrow();
	});
	it("rejects non-integral shipping amounts without throwing", () => {
		const invoice = invoiceFixture();
		expect(
			validateInvoiceSnapshot({
				...invoice,
				shipping: { ...invoice.shipping, net: 0.5 as typeof invoice.shipping.net },
			}),
		).toEqual({ ok: false, reason: "INVALID_SHIPPING" });
	});
});

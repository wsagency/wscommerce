import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, test } from "vitest";
import Ledger from "../src/components/Ledger.astro";
import ProductCard from "../src/components/ProductCard.astro";
import QtyField from "../src/components/QtyField.astro";
import StepTrack from "../src/components/StepTrack.astro";
import StockRule from "../src/components/StockRule.astro";
import Sum from "../src/components/Sum.astro";
import { orderMoney, orderStateLabel } from "../src/lib/account.js";
import { countryOptions } from "../src/lib/countries.js";
import { cartErrorMessage } from "../src/lib/error-messages.js";
import { holdFrame } from "../src/lib/hold-ribbon.js";
import { holdNote } from "../src/lib/hold.js";
import { cartCountLabel } from "../src/lib/nav.js";
import { message } from "../src/lib/messages.js";

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

const request = (language: string): Request =>
	new Request("https://shop.example.test/cart", {
		headers: { cookie: `wscommerce_locale=${language}` },
	});

describe("Croatian storefront presentation", () => {
	test("interpolates authored framing once while inserted merchant values stay verbatim", () => {
		expect(message("hr", "Discount · {code}", { code: "Paid {code}" })).toBe(
			"Popust · Paid {code}",
		);
		expect(message("en", "Discount · {code}", { code: "Paid {code}" })).toBe(
			"Discount · Paid {code}",
		);
	});
	test("names a real quantity input in Croatian without changing its submitted value", async () => {
		const html = await container.renderToString(QtyField, {
			props: { value: 3, name: "qty", form: "cart-line" },
			request: request("hr"),
		});
		expect(html).toContain("Količina");
		expect(html).toContain('name="qty"');
		expect(html).toContain('value="3"');
		expect(html).toContain('form="cart-line"');
	});

	test("translates checkout progress and its accessible completed steps", async () => {
		const html = await container.renderToString(StepTrack, {
			props: { current: "payment" },
			request: request("hr"),
		});
		expect(html).toContain('aria-label="Napredak narudžbe"');
		expect(html).toContain("Košarica");
		expect(html).toContain("Podaci");
		expect(html).toContain("Plaćanje");
		expect(html).toContain("dovršeno");
		expect(html).toContain('aria-current="step"');
	});

	test("leaves product content, SKUs, links and formatted figures verbatim", async () => {
		const html = await container.renderToString(ProductCard, {
			props: {
				href: "/products/quantity?sku=PAID",
				slug: "quantity",
				title: "Quantity",
				description: "Paid — customer's description",
				price: "19,00 €",
				availability: "in_stock",
			},
			request: request("hr"),
		});
		expect(html).toContain("Na zalihi");
		expect(html).toContain(">Quantity</h2>");
		expect(html.replaceAll("&#39;", "'")).toContain("Paid — customer's description");
		expect(html).toContain('href="/products/quantity?sku=PAID"');
		expect(html).toContain("19,00 €");
	});

	test("translates stock defaults while respecting an authored label", async () => {
		const html = await container.renderToString(StockRule, {
			props: { availability: "out_of_stock" },
			request: request("hr"),
		});
		expect(html).toContain("Rasprodano");
		expect(html).toContain('data-state="out"');
		const authored = await container.renderToString(StockRule, {
			props: { availability: "out_of_stock", label: "My custom stock message" },
			request: request("hr"),
		});
		expect(authored).toContain("My custom stock message");
	});

	test("translates receipt accessibility labels without changing customer or financial content", async () => {
		const html = await container.renderToString(Ledger, {
			props: { rows: [{ title: "Paid", sku: "QUANTITY", qty: 2, money: "20,00 €" }] },
			request: request("hr"),
		});
		expect(html).toContain("Šifra artikla");
		expect(html).toContain("Količina");
		expect(html).toContain("Ukupno za stavku");
		expect(html).toContain(">Paid</span>");
		expect(html).toContain("QUANTITY");
		expect(html).toContain("20,00 €");
	});

	test("explains uncalculated totals in Croatian without presenting them as zero", async () => {
		const html = await container.renderToString(Sum, {
			props: {
				rows: [{ label: "Dostava", amount: { money: null, label: "Not calculated" } }],
				total: { money: null, label: "Not calculated" },
				excludesUncalculated: true,
			},
			request: request("hr"),
		});
		expect(html).toContain("Nije izračunato");
		expect(html).toContain("Ukupno");
		expect(html).toContain("Ovaj iznos");
		expect(html).not.toContain("Not calculated");
		expect(html).not.toContain("0,00");
	});

	test.each([
		[1, "1 artikl"],
		[2, "2 artikla"],
		[4, "4 artikla"],
		[5, "5 artikala"],
		[11, "11 artikala"],
		[21, "21 artikl"],
		[22, "22 artikla"],
		[0, "0 artikala"],
	])("uses Croatian quantity plurals for %i", (count, text) => {
		expect(cartCountLabel(count, "hr")).toBe(text);
	});

	test("formats minor units and countries in the chosen language", () => {
		expect(orderMoney(123456, "EUR", "hr")).toBe("1.234,56\u00a0€");
		expect(orderMoney(123456, "EUR", "en")).toBe("€1,234.56");
		expect(countryOptions("hr").find((option) => option.code === "DE")?.label).toBe("Njemačka");
		expect(countryOptions("hr").find((option) => option.code === "DE")?.code).toBe("DE");
	});

	test("renders known state and error tokens as Croatian presentation", () => {
		expect(orderStateLabel("pending", "hr")).toBe("Čeka plaćanje");
		expect(orderStateLabel("paid", "hr")).toBe("Plaćeno");
		expect(cartErrorMessage("INVALID_EMAIL", "hr")).toContain("e-pošte");
		expect(cartErrorMessage("UNKNOWN_MACHINE_TOKEN", "hr")).not.toContain("UNKNOWN_MACHINE_TOKEN");
	});

	test("the countdown keeps Croatian announcements after the first browser tick", () => {
		const frame = holdFrame(45_000, 900, "held", 0, "hr");
		expect(frame).toMatchObject({
			state: "expiring",
			label: "Istječe",
			announce: "Istječe",
			clock: "00:45",
		});
		expect(holdNote(2, "hr")).toContain("2 minute");
		expect(holdNote(5, "hr")).toContain("5 minuta");
		expect(holdNote(120, "hr")).toContain("2 sata");
	});
});

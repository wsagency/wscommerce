import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, test } from "vitest";
import ProductCard from "../src/components/ProductCard.astro";
import { demoMenu, demoProduct, demoSettings } from "../src/lib/demo-content.js";

const mug = {
	id: "01SEEDULID",
	slug: "otta-mug",
	title: "WSCommerce Mug",
	description: "Holds exactly one coffee. Survives the dishwasher and the commute.",
};

describe("explicit reference content translations", () => {
	test("localizes the known seeded product for rendering while preserving its identity", async () => {
		const presented = demoProduct(mug, "hr");
		expect(presented).toMatchObject({
			id: "01SEEDULID",
			slug: "otta-mug",
			title: "WSCommerce šalica",
		});
		expect(mug.title).toBe("WSCommerce Mug");
		const container = await AstroContainer.create();
		const html = await container.renderToString(ProductCard, {
			props: { ...presented, href: "/products/otta-mug" },
			request: new Request("https://shop.test/", { headers: { cookie: "wscommerce_locale=hr" } }),
		});
		expect(html).toContain("WSCommerce šalica");
		expect(html).toContain("Jedna kava");
		expect(html).toContain('href="/products/otta-mug"');
	});
	test("leaves merchant product edits and an unrelated product verbatim", () => {
		const custom = { ...mug, description: "Quantity is my own product copy." };
		expect(demoProduct(custom, "hr")).toEqual(custom);
		const unrelated = { ...mug, slug: "another-mug" };
		expect(demoProduct(unrelated, "hr")).toEqual(unrelated);
	});
	test("localizes only the exact reference settings", () => {
		expect(
			demoSettings({ title: "WSCommerce", tagline: "Three things. That's the whole shop." }, "hr"),
		).toEqual({ title: "WSCommerce", tagline: "Tri proizvoda. To je cijela trgovina." });
		const custom = { title: "My store", tagline: "Three things. That's the whole shop." };
		expect(demoSettings(custom, "hr")).toEqual(custom);
	});
	test("recognizes the whole seed menu before rendering Croatian labels", () => {
		const menu = [
			{ label: "Home", url: "/" },
			{ label: "Shop", url: "/products" },
			{ label: "Cart", url: "/cart" },
		];
		expect(demoMenu(menu, "hr").map((item) => item.label)).toEqual([
			"Početna",
			"Trgovina",
			"Košarica",
		]);
		const edited = [{ label: "My Home", url: "/" }, ...menu.slice(1)];
		expect(demoMenu(edited, "hr")).toEqual(edited);
	});
});

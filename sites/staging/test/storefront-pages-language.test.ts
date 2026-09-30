import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("astro:assets", async () => ({
	Font: (await import("./fixtures/EmptyFont.astro")).default,
}));
vi.mock("emdash", () => ({
	getSiteSettings: async () => ({
		title: "WSCommerce",
		tagline: "Three things. That's the whole shop.",
	}),
	getMenu: async () => ({
		items: [
			{ label: "Home", url: "/" },
			{ label: "Shop", url: "/products" },
			{ label: "Cart", url: "/cart" },
		],
	}),
	getEmDashCollection: async () => ({ entries: [], hasMore: false }),
}));

import Base from "../src/layouts/Base.astro";
import Login from "../src/pages/account/login/index.astro";
import Verify from "../src/pages/account/verify/index.astro";
import Home from "../src/pages/index.astro";
import NotFound from "../src/pages/404.astro";

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});
const request = (path: string, locale = "hr") =>
	new Request(`https://shop.test${path}`, {
		headers: { cookie: `wscommerce_locale=${locale}` },
	});
const plain = (html: string) => html.replaceAll("&#39;", "'");

describe("request-localized shopper pages", () => {
	test("declares Croatian and renders an accessible choice preserving private query strings", async () => {
		const html = plain(
			await container.renderToString(Base, {
				props: { title: "Paid", cartCount: 22, currency: "EUR" },
				request: request("/orders/order-42?access=private%2Bkey%3D&p=3"),
			}),
		);
		expect(html).toMatch(/<html\s[^>]*lang="hr"/);
		expect(html).toContain("Preskoči na glavni sadržaj");
		expect(html).toContain("22 artikla");
		expect(html).toContain('action="/language"');
		expect(html).toContain('name="locale" value="en"');
		expect(html).toContain(
			'name="returnTo" value="/orders/order-42?access=private%2Bkey%3D&amp;p=3"',
		);
		expect(html).toContain("Promijeni jezik na engleski");
		expect(html).toContain("Početna");
		expect(html).toContain("Trgovina");
		expect(html).toContain("Račun");
		expect(html).toContain("Paid — WSCommerce");
	});
	test("keeps English available", async () => {
		const html = await container.renderToString(Base, {
			props: { title: "Shop" },
			request: request("/", "en"),
		});
		expect(html).toMatch(/<html\s[^>]*lang="en"/);
		expect(html).toContain("Skip to the main content");
		expect(html).toContain('name="locale" value="hr"');
	});
	test("renders the guarded Croatian demo tagline and authored homepage copy", async () => {
		const html = await container.renderToString(Home, { request: request("/") });
		expect(html).toContain("Tri proizvoda. To je cijela trgovina.");
		expect(html).toContain("Cijela ponuda trgovine na jednoj stranici.");
	});
	test("renders Croatian login and validation notice while form identities remain stable", async () => {
		const html = await container.renderToString(Login, {
			request: request("/account/login?sent=1&error=INVALID_EMAIL"),
		});
		expect(html).toContain("Prijava");
		expect(html).toContain("Ako račun s tom adresom postoji");
		expect(html).toContain("Adresa e-pošte nije valjana");
		expect(html).toContain('action="/account/login/request"');
		expect(html).toContain('name="email"');
		expect(html).toContain("Pošalji poveznicu za prijavu");
	});
	test("does not translate or discard private magic-link fields", async () => {
		const html = await container.renderToString(Verify, {
			request: request("/account/verify?challenge=Paid&token=Quantity"),
		});
		expect(html).toContain("Nastavi prijavu");
		expect(html).toContain('name="challenge" value="Paid"');
		expect(html).toContain('name="token" value="Quantity"');
		expect(html).toContain('content="same-origin"');
	});
	test("provides Croatian recovery links on a missing page", async () => {
		const html = await container.renderToString(NotFound, { request: request("/missing") });
		expect(html).toContain("Stranica nije pronađena.");
		expect(html).toContain("Pregledaj trgovinu");
		expect(html).toContain('href="/products"');
	});
});

import { expect, skipWithoutSite, test } from "./harness.js";

test("shopper language persists across pages while product and form identities stay stable", async ({
	page,
	context,
}, testInfo) => {
	await skipWithoutSite(testInfo);
	await page.goto("/products/otta-mug");
	const nativeSku = await page.locator('form[action="/cart/add"] [name="sku"]').inputValue();
	expect(nativeSku.trim(), "a priced demo mug with a native SKU is required").not.toBe("");
	await page.locator('form[action="/language"] button[value="hr"]').click();
	await expect(page.locator("html")).toHaveAttribute("lang", "hr");
	await expect(page.getByRole("heading", { name: "WSCommerce šalica", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Dodaj u košaricu", exact: true })).toBeVisible();
	await expect(page.locator('form[action="/cart/add"] [name="sku"]')).toHaveValue(nativeSku);
	expect(
		(await context.cookies()).find((cookie) => cookie.name === "wscommerce_locale")?.value,
	).toBe("hr");
	await page.goto("/account/login?error=INVALID_EMAIL");
	await expect(page.getByLabel("E-pošta", { exact: true })).toBeVisible();
	await expect(page.getByText("Adresa e-pošte nije valjana", { exact: false })).toBeVisible();
	await page.locator('form[action="/language"] button[value="en"]').click();
	await expect(page).toHaveURL(/\/account\/login\?error=INVALID_EMAIL$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
	await page.goto("/");
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("receipt language POST is same-origin and private query data is withheld from external navigation", async ({
	page,
}, testInfo) => {
	await skipWithoutSite(testInfo);
	const receipt = "/orders/e2e-nonexistent-order?access=private%2Bkey%3D&coupon=SAVE%20ME&p=2";
	await page.goto(receipt);
	const [changed] = await Promise.all([
		page.waitForResponse((response) => new URL(response.url()).pathname === "/language"),
		page.locator('form[action="/language"] button[value="hr"]').click(),
	]);
	expect(changed.request().headers()["origin"]).toBe(new URL(page.url()).origin);
	expect(changed.status()).toBe(303);
	await expect(page).toHaveURL(
		new RegExp("/orders/e2e-nonexistent-order\\?access=private%2Bkey%3D&coupon=SAVE%20ME&p=2$"),
	);
	await expect(page.locator("html")).toHaveAttribute("lang", "hr");
	const external = "https://receipt-policy.example.test/";
	await page.route(external, (route) => route.fulfill({ body: "Policy probe" }));
	await page.evaluate((url) => {
		const link = document.createElement("a");
		link.href = url;
		link.textContent = "External policy probe";
		document.body.append(link);
	}, external);
	const [outbound] = await Promise.all([
		page.waitForRequest(external),
		page.getByRole("link", { name: "External policy probe" }).click(),
	]);
	expect(outbound.headers()["referer"]).toBeUndefined();
});

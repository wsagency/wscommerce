/** Browser-only policy regression: no-referrer made checkout POST Origin:null.
 * Requires a priced, stocked demo mug and HR delivery configuration. The real
 * form carries an invalid email, so no order or provider request is possible.
 */
import { expect, skipWithoutSite, test } from "./harness.js";

test("checkout keeps its own form origin and withholds the URL from external links", async ({
	page,
}, testInfo) => {
	await skipWithoutSite(testInfo);
	await page.goto("/products/otta-mug");
	await page.getByRole("button", { name: "Add to cart", exact: true }).click();
	await expect(page).toHaveURL(/\/cart$/);
	const review = "/checkout?country=HR&billingCountry=HR";
	await page.goto(review);
	const form = page.locator('form[action="/checkout/place"]');
	await form.locator('[name="email"]').fill("invalid-email");
	await form.evaluate((element) => {
		(element as HTMLFormElement).noValidate = true;
	});
	const [placed] = await Promise.all([
		page.waitForResponse((res) => new URL(res.url()).pathname === "/checkout/place"),
		form.getByRole("button", { name: "Place order", exact: true }).click(),
	]);
	expect(placed.request().headers()["origin"]).toBe(new URL(page.url()).origin);
	expect(placed.status(), "the browser's same-origin POST must reach form validation").toBe(303);
	await expect(page).toHaveURL(/\/checkout\?.*error=(?:INVALID_EMAIL|STRIPE_NOT_CONFIGURED)/);

	await page.goto(review);
	const external = "https://checkout-policy.example.test/";
	await page.route(external, (route) => route.fulfill({ body: "Policy probe" }));
	await page.evaluate((url) => {
		const link = document.createElement("a");
		link.href = url;
		link.textContent = "Open external policy probe";
		document.body.append(link);
	}, external);
	const [outbound] = await Promise.all([
		page.waitForRequest(external),
		page.getByRole("link", { name: "Open external policy probe" }).click(),
	]);
	expect(outbound.headers()["referer"]).toBeUndefined();
});

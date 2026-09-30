import {
	ADMIN_BASE_PATH,
	ADMIN_SHELL_TIMEOUT_MS,
	OTTA_PLUGIN_ID,
	REPO_ROOT,
	consoleScreenUrl,
	dismissWelcomeDialog,
	expect,
	test,
} from "./harness.js";

test("merchant language survives React and Block Kit navigation without changing native values", async ({
	adminPage,
	context,
}) => {
	test.slow();
	const ordersUrl = `${consoleScreenUrl("/orders")}?status=pending&period=last30`;
	await adminPage.goto(ordersUrl);
	await expect(adminPage.getByTestId("orders-intro")).toBeVisible({
		timeout: ADMIN_SHELL_TIMEOUT_MS,
	});
	await dismissWelcomeDialog(adminPage);
	await adminPage.getByTestId("admin-language").selectOption("hr");
	await expect(adminPage.getByRole("heading", { name: "Narudžbe", exact: true })).toBeVisible();
	await expect(adminPage.getByTestId("admin-language")).toHaveAccessibleName("Jezik");
	await adminPage.getByTestId("orders-filters").locator("summary").click();
	await expect(adminPage.getByTestId("filter-status")).toHaveValue("pending");
	await expect(adminPage.getByTestId("filter-period")).toHaveValue("last30");
	await expect(adminPage).toHaveURL(new RegExp("\\?status=pending&period=last30$"));
	expect(
		(await context.cookies()).find((cookie) => cookie.name === "wscommerce_admin_locale")?.value,
	).toBe("hr");
	await adminPage.reload();
	await expect(adminPage.getByRole("heading", { name: "Narudžbe", exact: true })).toBeVisible({
		timeout: ADMIN_SHELL_TIMEOUT_MS,
	});
	await expect(adminPage.getByTestId("admin-language")).toHaveValue("hr");

	await adminPage.goto(consoleScreenUrl("/products"));
	await expect(adminPage.getByTestId("products-intro")).toBeVisible({
		timeout: ADMIN_SHELL_TIMEOUT_MS,
	});
	await expect(
		adminPage.getByRole("heading", { name: "Cijene i zalihe", exact: true }),
	).toBeVisible();
	await adminPage.getByTestId("admin-language").selectOption("en");
	await expect(
		adminPage.getByRole("heading", { name: "Pricing & inventory", exact: true }),
	).toBeVisible();
	await expect(adminPage.getByTestId("product-link").first()).toBeVisible();
	const productTitles = await adminPage.getByTestId("product-link").allTextContents();
	const productSkus = await adminPage.getByTestId("product-sku").allTextContents();
	expect(productTitles.length, "a populated local catalog is required").toBeGreaterThan(0);
	expect(productSkus.every((sku) => sku.trim().length > 0)).toBe(true);
	await adminPage.getByTestId("admin-language").selectOption("hr");
	await expect(
		adminPage.getByRole("heading", { name: "Cijene i zalihe", exact: true }),
	).toBeVisible();
	expect(await adminPage.getByTestId("product-link").allTextContents()).toEqual(productTitles);
	expect(await adminPage.getByTestId("product-sku").allTextContents()).toEqual(productSkus);
	await adminPage.getByTestId("admin-language").selectOption("en");
	await expect(
		adminPage.getByRole("heading", { name: "Pricing & inventory", exact: true }),
	).toBeVisible();
	expect(await adminPage.getByTestId("product-link").allTextContents()).toEqual(productTitles);
	expect(await adminPage.getByTestId("product-sku").allTextContents()).toEqual(productSkus);
	await adminPage.getByTestId("admin-language").selectOption("hr");

	const settingsUrl = `${ADMIN_BASE_PATH}/plugins/${OTTA_PLUGIN_ID}/settings`;
	await adminPage.goto(settingsUrl);
	await expect(adminPage.getByRole("heading", { name: "Postavke", exact: true })).toBeVisible({
		timeout: ADMIN_SHELL_TIMEOUT_MS,
	});
	await adminPage.reload();
	await expect(adminPage.getByRole("heading", { name: "Postavke", exact: true })).toBeVisible({
		timeout: ADMIN_SHELL_TIMEOUT_MS,
	});
	await adminPage.screenshot({
		path: `${REPO_ROOT}/node_modules/.playwright-artifacts/merchant-settings-hr.png`,
	});
	// The customer-facing preference is independent of the merchant cookie.
	await adminPage.goto("/account/login");
	await expect(adminPage.locator("html")).toHaveAttribute("lang", "en");
	await adminPage.goto(consoleScreenUrl("/products"));
	await expect(adminPage.getByTestId("admin-language")).toHaveValue("hr", {
		timeout: ADMIN_SHELL_TIMEOUT_MS,
	});
	await adminPage.getByTestId("admin-language").selectOption("en");
	await adminPage.goto(settingsUrl);
	await expect(adminPage.getByRole("heading", { name: "Settings", exact: true })).toBeVisible({
		timeout: ADMIN_SHELL_TIMEOUT_MS,
	});
});

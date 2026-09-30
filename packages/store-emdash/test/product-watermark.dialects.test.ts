import { describeEachDialect } from "./describe-each-dialect.js";
import { PRODUCT_COMMERCE_LAYOUT } from "./product-commerce-collections.js";
import { makeProductCommerceHarness } from "./product-commerce-harness.js";
import { productWatermarkCases } from "./product-watermark-cases.js";

describeEachDialect("product watermark", (ctx) => {
	const bound = ctx.useStorage(PRODUCT_COMMERCE_LAYOUT);
	productWatermarkCases(() => makeProductCommerceHarness(bound.storage));
});

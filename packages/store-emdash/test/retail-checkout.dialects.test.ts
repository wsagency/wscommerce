import { describeEachDialect } from "./describe-each-dialect.js";
import { ORDER_LAYOUT } from "./order-collections.js";
import { PRODUCT_COMMERCE_LAYOUT } from "./product-commerce-collections.js";
import { RULES_LAYOUT } from "./rules-collections.js";
import { retailCheckoutContract } from "./retail-checkout-contract.js";

describeEachDialect("retail checkout snapshots", (ctx) => {
	const bound = ctx.useStorage({ ...ORDER_LAYOUT, ...PRODUCT_COMMERCE_LAYOUT, ...RULES_LAYOUT });
	retailCheckoutContract(() => bound.storage);
});

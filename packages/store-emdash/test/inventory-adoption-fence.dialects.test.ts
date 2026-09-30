import { describeEachDialect } from "./describe-each-dialect.js";
import { inventoryAdoptionFenceCases } from "./inventory-adoption-fence.js";
import { ORDER_LAYOUT } from "./order-collections.js";

describeEachDialect("durable inventory adoption fence", (ctx) => {
	const bound = ctx.useStorage(ORDER_LAYOUT);
	inventoryAdoptionFenceCases(() => bound.storage);
});

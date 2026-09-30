import { describeEachDialect } from "./describe-each-dialect.js";
import { inventoryCorrectnessContract } from "./inventory-correctness-contract.js";
import { ORDER_LAYOUT } from "./order-collections.js";

describeEachDialect("inventory correctness", (ctx) => {
	const bound = ctx.useStorage(ORDER_LAYOUT);
	inventoryCorrectnessContract(() => bound.storage);
});

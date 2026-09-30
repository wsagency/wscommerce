import { nativeAbsoluteStockContract } from "./absolute-stock-contract.js";
import { describeEachDialect } from "./describe-each-dialect.js";
import { INVENTORY_LAYOUT } from "./inventory-collections.js";

describeEachDialect("absolute available stock", (ctx) => {
	const bound = ctx.useStorage(INVENTORY_LAYOUT);
	nativeAbsoluteStockContract(() => bound.storage);
});

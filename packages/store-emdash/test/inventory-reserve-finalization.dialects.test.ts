import { describeEachDialect } from "./describe-each-dialect.js";
import { INVENTORY_LAYOUT } from "./inventory-collections.js";
import { inventoryReserveFinalizationCases } from "./inventory-reserve-finalization.js";

describeEachDialect("reserve success/failure finalization", (ctx) => {
	const bound = ctx.useStorage(INVENTORY_LAYOUT);
	inventoryReserveFinalizationCases(() => bound.storage);
});

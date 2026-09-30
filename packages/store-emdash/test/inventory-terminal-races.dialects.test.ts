import { describeEachDialect } from "./describe-each-dialect.js";
import { INVENTORY_LAYOUT } from "./inventory-collections.js";
import { inventoryTerminalRaceCases } from "./inventory-terminal-races.js";

describeEachDialect("inventory terminal winner conservation", (ctx) => {
	const bound = ctx.useStorage(INVENTORY_LAYOUT);
	inventoryTerminalRaceCases(() => bound.storage);
});

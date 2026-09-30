import { describeEachDialect } from "./describe-each-dialect.js";
import { ORDER_LAYOUT } from "./order-collections.js";
import { makeOrderHarness } from "./order-harness.js";
import { offlineHoldSafetyCases } from "./offline-hold-safety.js";

describeEachDialect("offline frozen hold safety", (ctx) => {
	const bound = ctx.useStorage(ORDER_LAYOUT);
	offlineHoldSafetyCases(() => makeOrderHarness(bound.storage));
});

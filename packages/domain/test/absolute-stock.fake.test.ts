import {
	absoluteStockContract,
	CountingIdGen,
	FixedClock,
	InMemoryInventoryStore,
} from "@otta-sh/domain/testing";

absoluteStockContract(
	() =>
		new InMemoryInventoryStore({
			idGen: new CountingIdGen("hold"),
			clock: new FixedClock(new Date("2026-09-30T00:00:00Z")),
		}),
);

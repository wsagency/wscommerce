import { describeEachDialect } from "./describe-each-dialect.js";
import { REPORTING_LAYOUT } from "./reporting-collections.js";
import { reportingRefundJournalCases } from "./reporting-refund-journal-cases.js";

describeEachDialect("durable refund reporting journal", (ctx) => {
	const bound = ctx.useStorage(REPORTING_LAYOUT);
	reportingRefundJournalCases(bound);
});

import { REPORTING_LAYOUT } from "../reporting-collections.js";
import { reportingRefundJournalCases } from "../reporting-refund-journal-cases.js";
import { useD1Storage } from "./describe-d1.js";

const bound = useD1Storage(REPORTING_LAYOUT);
reportingRefundJournalCases(bound);

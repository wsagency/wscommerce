import { createSandboxWorker } from "../../sandbox-entry.js";
import type { BankTransferSnapshot } from "@otta-sh/domain";
import { renderHub3Svg } from "../pdf417.js";
/** Synthetic qualification entry only; unreachable from production exports. */
export default createSandboxWorker({
	routes: {
		render: {
			public: true,
			handler: async (route) => ({
				ok: true,
				svg: renderHub3Svg(route.input as BankTransferSnapshot),
			}),
		},
	},
});

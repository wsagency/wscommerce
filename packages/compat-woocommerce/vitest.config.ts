import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		name: "compat-woocommerce",
		hookTimeout: 60000,
		testTimeout: 20000,
		include: ["test/**/*.test.ts"],
	},
});

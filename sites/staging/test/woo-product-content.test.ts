import { describe, expect, it } from "vitest";
import { wooProductContent } from "../src/lib/woo-product-content.js";
import type { PluginContext } from "@otta-sh/plugin";
describe("host Woo CMS product read adapter", () => {
	it("resolves actual media references and returns description and canonical permalink", async () => {
		const ctx = {
			content: {
				get: async () => ({
					slug: "book",
					data: { title: "Book", description: "Description", images: "media-book" },
				}),
			},
			media: {
				get: async (id: string) => ({
					url: `/_emdash/api/media/asset/${id}/book.jpg`,
					filename: "book.jpg",
					alt: "Book cover",
				}),
			},
		} as unknown as PluginContext;
		expect(await wooProductContent(ctx, "https://shop.test").getMany(["book"])).toEqual({
			book: {
				slug: "book",
				permalink: "https://shop.test/products/book",
				description: "Description",
				shortDescription: "",
				images: [
					{
						src: "https://shop.test/_emdash/api/media/asset/media-book/book.jpg",
						name: "book.jpg",
						alt: "Book cover",
					},
				],
			},
		});
	});
	it("fails visibly if declared read capabilities are missing", async () => {
		await expect(
			wooProductContent({} as PluginContext, "https://shop.test").getMany(["book"]),
		).rejects.toThrow("WOO_CONTENT_READ_NOT_CONFIGURED");
	});
});

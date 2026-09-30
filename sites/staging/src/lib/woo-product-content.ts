import type { PluginContext } from "@otta-sh/plugin";

/** Narrow structural read ports injected by EmDash's declared content:read and media:read capabilities. */
interface ProductReadContext {
	content?: {
		get(
			collection: string,
			id: string,
		): Promise<{ slug: string | null; data: Record<string, unknown> } | null>;
	};
	media?: {
		get(id: string): Promise<{ url: string; filename?: string; alt?: string | null } | null>;
	};
}
export function wooProductContent(context: PluginContext, origin: string) {
	const ctx = context as PluginContext & ProductReadContext;
	return {
		async getMany(ids: readonly string[]) {
			if (!ctx.content) throw new Error("WOO_CONTENT_READ_NOT_CONFIGURED");
			const entries = await Promise.all(
				[...new Set(ids)].map(async (id) => {
					const content = await ctx.content!.get("products", id);
					if (!content) return null;
					const data = content.data;
					const description = typeof data.description === "string" ? data.description : "";
					const images: Array<{ src: string; name: string; alt: string }> = [];
					const rawImages = Array.isArray(data.images)
						? data.images.slice(0, 50)
						: data.images
							? [data.images]
							: [];
					for (const raw of rawImages) {
						let image: {
							src?: string;
							url?: string;
							id?: string;
							mediaId?: string;
							filename?: string;
							alt?: string | null;
						} | null = typeof raw === "object" && raw !== null ? raw : null;
						const mediaId = typeof raw === "string" ? raw : (image?.mediaId ?? image?.id);
						if (mediaId) {
							if (!ctx.media) throw new Error("WOO_MEDIA_READ_NOT_CONFIGURED");
							image = await ctx.media.get(mediaId);
						}
						const src = image?.src ?? image?.url;
						if (!src) continue;
						const url = new URL(src, origin);
						if (url.protocol !== "https:" && !(url.protocol === "http:" && url.origin === origin))
							continue;
						if (url.username || url.password) continue;
						images.push({
							src: url.href,
							name: image?.filename ?? (typeof data.title === "string" ? data.title : ""),
							alt: image?.alt ?? "",
						});
					}
					return [
						id,
						{
							slug: content.slug ?? "",
							permalink: new URL(`/products/${encodeURIComponent(content.slug ?? id)}`, origin)
								.href,
							description,
							shortDescription:
								typeof data.shortDescription === "string" ? data.shortDescription : "",
							images,
						},
					] as const;
				}),
			);
			return Object.fromEntries(entries.filter((entry) => entry !== null));
		},
	};
}

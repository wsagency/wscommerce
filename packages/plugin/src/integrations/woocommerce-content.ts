/** Read-only host content seam; it deliberately names no persistence or host runtime types. */
export interface NativeWooProductContent {
	slug: string;
	permalink: string;
	description: string;
	shortDescription: string;
	images: Array<{ src: string; name: string; alt: string }>;
}
export interface NativeWooProductContentPort {
	getMany(nativeIds: readonly string[]): Promise<Readonly<Record<string, NativeWooProductContent>>>;
}

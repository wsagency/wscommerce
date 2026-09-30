import { CAS_RETRY, casDone, withCasRetry, type StorageCollection } from "@otta-sh/store-emdash";
import type {
	ExternalEntityKind,
	MetadataPatch,
	WooExternalIdStore,
	WooMetadata,
	JsonValue,
} from "./types.js";
import { invalid, WooMutationError } from "./errors.js";
import { validateMetadata } from "./metadata.js";
import { hashWooSecret } from "./security.js";
export const WOO_STORAGE_LAYOUT = {
	woo_ids: {},
	woo_metadata: {},
	woo_webhooks: { indexes: ["availableAt", "state"] },
};
export type WooIdRegistryDocument =
	| { tag: "counter"; nextId: number }
	| {
			tag: "assignment" | "reverse";
			kind: ExternalEntityKind;
			nativeId: string;
			externalId: number;
	  };
/** A monotonic counter plus immutable forward/reverse rows. Crashes can leave gaps, never aliases. */
export class EmDashWooExternalIdStore implements WooExternalIdStore {
	constructor(private readonly collection: StorageCollection<WooIdRegistryDocument>) {}
	private async allocate(): Promise<number> {
		return withCasRetry("wooAllocateId", async () => {
			const current = await this.collection.getVersioned("counter");
			if (current && current.value.tag !== "counter")
				throw new WooMutationError(
					"woocommerce_rest_id_integrity",
					"The durable identity counter is invalid.",
					503,
				);
			const id = current?.value.tag === "counter" ? current.value.nextId : 1;
			if (!Number.isSafeInteger(id) || id < 1 || id === Number.MAX_SAFE_INTEGER)
				throw new WooMutationError(
					"woocommerce_rest_id_capacity",
					"The durable numeric ID counter is exhausted.",
					503,
				);
			const written = await this.collection.compareAndSet("counter", current?.revision ?? null, {
				tag: "counter",
				nextId: id + 1,
			});
			return written.applied ? casDone(id) : CAS_RETRY;
		});
	}
	async getOrAssign(kind: ExternalEntityKind, nativeId: string): Promise<number> {
		if (!nativeId || nativeId.length > 1024) invalid("Invalid native identity.");
		const key = `entity:${kind}:${encodeURIComponent(nativeId)}`;
		const assignment = await withCasRetry("wooAssignId", async () => {
			const current = await this.collection.get(key);
			if (current) {
				if (current.tag !== "assignment" || current.kind !== kind || current.nativeId !== nativeId)
					throw new WooMutationError(
						"woocommerce_rest_id_integrity",
						"The durable identity assignment is invalid.",
						503,
					);
				return casDone(current);
			}
			const externalId = await this.allocate();
			const next: WooIdRegistryDocument = { tag: "assignment", kind, nativeId, externalId };
			const written = await this.collection.compareAndSet(key, null, next);
			return written.applied ? casDone(next) : CAS_RETRY;
		});
		// Assignment precedes reverse completion. Retrying the native ID repairs an interrupted second write.
		await withCasRetry("wooCompleteReverseId", async () => {
			const current = await this.collection.get(`reverse:${assignment.externalId}`);
			if (current) {
				if (
					current.tag !== "reverse" ||
					current.kind !== kind ||
					current.nativeId !== nativeId ||
					current.externalId !== assignment.externalId
				)
					throw new WooMutationError(
						"woocommerce_rest_id_integrity",
						"The numeric identity was assigned to a different native entity.",
						503,
					);
				return casDone(undefined);
			}
			const written = await this.collection.compareAndSet(
				`reverse:${assignment.externalId}`,
				null,
				{ ...assignment, tag: "reverse" },
			);
			return written.applied ? casDone(undefined) : CAS_RETRY;
		});
		return assignment.externalId;
	}
	async lookup(kind: ExternalEntityKind, id: number): Promise<string | null> {
		if (!Number.isSafeInteger(id) || id < 1) return null;
		const reverse = await this.collection.get(`reverse:${id}`);
		return reverse?.tag === "reverse" && reverse.kind === kind ? reverse.nativeId : null;
	}
}
export interface WooMetadataDocument {
	nextId: number;
	metadata: WooMetadata[];
	replays: Array<{ key: string; fingerprint: string; result: WooMetadata[] }>;
}
function canonical(value: JsonValue): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	return `{${Object.keys(value)
		.toSorted()
		.map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`)
		.join(",")}}`;
}
/** Metadata only; a host combining it with a native transition must provide atomic whole-patch semantics. */
export class EmDashWooMetadataStore {
	constructor(
		private readonly collection: StorageCollection<WooMetadataDocument>,
		private readonly limits: { maxReplays?: number; maxBytes?: number } = {},
	) {
		for (const value of [limits.maxReplays ?? 1000, limits.maxBytes ?? 524288])
			if (!Number.isSafeInteger(value) || value < 1) invalid("Invalid metadata capacity.");
	}
	async get(entity: string): Promise<WooMetadata[]> {
		return (await this.collection.get(entity))?.metadata ?? [];
	}
	async patch(entity: string, input: MetadataPatch[], key: string): Promise<WooMetadata[]> {
		if (!entity || !key || key.length > 512)
			invalid("A native entity and idempotency key are required.");
		const patch = validateMetadata(input);
		const fingerprint = await hashWooSecret(canonical(patch as unknown as JsonValue));
		return withCasRetry("wooPatchMetadata", async () => {
			const current = await this.collection.getVersioned(entity);
			const doc = current?.value ?? { nextId: 1, metadata: [], replays: [] };
			const replay = doc.replays.find((item) => item.key === key);
			if (replay) {
				if (replay.fingerprint !== fingerprint)
					throw new WooMutationError(
						"woocommerce_rest_idempotency_conflict",
						"The Idempotency-Key was already used for a different mutation.",
						409,
					);
				return casDone(replay.result);
			}
			if (doc.replays.length >= (this.limits.maxReplays ?? 1000))
				throw new WooMutationError(
					"woocommerce_rest_metadata_capacity",
					"Metadata replay capacity reached; operator archival/migration is required.",
					503,
				);
			const metadata = doc.metadata.map((item) => ({ ...item }));
			let nextId = doc.nextId;
			for (const item of patch) {
				const index = metadata.findIndex((existing) =>
					item.id === undefined ? existing.key === item.key : existing.id === item.id,
				);
				if (item.id !== undefined && (index < 0 || metadata[index]!.key !== item.key))
					throw new WooMutationError(
						"woocommerce_rest_metadata_conflict",
						"Metadata ID does not belong to this key and native entity.",
						409,
					);
				if (index < 0) {
					if (!Number.isSafeInteger(nextId) || nextId < 1 || nextId === Number.MAX_SAFE_INTEGER)
						throw new WooMutationError(
							"woocommerce_rest_id_capacity",
							"Metadata ID capacity is exhausted.",
							503,
						);
					metadata.push({ id: nextId++, key: item.key, value: item.value });
				} else metadata[index] = { ...metadata[index]!, value: item.value };
			}
			const next = {
				nextId,
				metadata,
				replays: [...doc.replays, { key, fingerprint, result: metadata }],
			};
			if (new TextEncoder().encode(JSON.stringify(next)).length > (this.limits.maxBytes ?? 524288))
				throw new WooMutationError(
					"woocommerce_rest_metadata_capacity",
					"Metadata document capacity reached; operator archival/migration is required.",
					503,
				);
			const result = await this.collection.compareAndSet(entity, current?.revision ?? null, next);
			return result.applied ? casDone(metadata) : CAS_RETRY;
		});
	}
}

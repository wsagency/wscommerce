import type { StorageCollection } from "@otta-sh/store-emdash";
import type { DirectInvoiceProvider } from "./types.js";

export const INVOICE_PROVIDER_LOCK_COLLECTION = "commerce_invoice_locks";
export interface InvoiceProviderLease {
	provider: DirectInvoiceProvider;
	token: string;
	workerId: string;
	expiresAt: string;
	nextAllowedAt: string;
}

/** One API user per provider per shop. Lease budget exceeds the transport's 30s timeout. */
export class InvoiceProviderLockStore {
	private readonly now: () => string;
	constructor(
		private readonly collection: StorageCollection,
		options: { now?: () => string } = {},
	) {
		this.now = options.now ?? (() => new Date().toISOString());
	}
	async acquire(
		provider: DirectInvoiceProvider,
		workerId: string,
	): Promise<InvoiceProviderLease | null> {
		for (let attempt = 0; attempt < 12; attempt++) {
			const row = await this.collection.getVersioned(provider);
			const previous = row?.value as InvoiceProviderLease | undefined;
			const timestamp = this.now();
			if (previous && (previous.expiresAt > timestamp || previous.nextAllowedAt > timestamp))
				return null;
			const lease: InvoiceProviderLease = {
				provider,
				workerId,
				token: crypto.randomUUID(),
				expiresAt: new Date(Date.parse(timestamp) + 120_000).toISOString(),
				nextAllowedAt: timestamp,
			};
			if ((await this.collection.compareAndSet(provider, row?.revision ?? null, lease)).applied)
				return lease;
		}
		return null;
	}
	async release(lease: InvoiceProviderLease): Promise<void> {
		for (let attempt = 0; attempt < 12; attempt++) {
			const row = await this.collection.getVersioned(lease.provider);
			if (!row) return;
			const current = row.value as InvoiceProviderLease;
			if (current.token !== lease.token) return;
			const timestamp = this.now();
			const next = {
				...current,
				expiresAt: timestamp,
				nextAllowedAt: new Date(
					Date.parse(timestamp) + (lease.provider === "solo" ? 10_000 : 1_000),
				).toISOString(),
			};
			if ((await this.collection.compareAndSet(lease.provider, row.revision, next)).applied) return;
		}
		throw new Error("PROVIDER_LOCK_CONTENTION");
	}
}

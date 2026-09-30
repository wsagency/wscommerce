import {
	createERacuniProvider,
	createSoloProvider,
	dispatchInvoiceJob,
	INVOICE_JOB_COLLECTION,
	INVOICE_PROVIDER_LOCK_COLLECTION,
	InvoiceJobStore,
	InvoiceProviderLockStore,
	invoiceSnapshotFromOrder,
} from "@emdash-commerce/invoicing";
import type {
	ERacuniOptions,
	InvoiceOwner,
	InvoiceProvider,
	InvoiceSnapshot,
	SoloOptions,
} from "@emdash-commerce/invoicing/types";
import { orderId } from "@otta-sh/domain";
import type { Order } from "@otta-sh/domain";
import { ORDERS_COLLECTION } from "@otta-sh/store-emdash";
import { createInProcessCommerceStores } from "../commerce/in-process-commerce-stores.js";
import { SWEEP_TASK_NAME } from "../cron/index.js";
import { requestTranslator } from "../admin/localization.js";
import type {
	AdminPageConfig,
	BlockResponse,
	PluginContext,
	RouteEntry,
	SandboxedPlugin,
} from "../types.js";

export interface IntegrationConfiguration {
	invoiceOwner: InvoiceOwner;
	shopId: string;
	/** Runtime opt-in only after provider account acceptance. Adding credentials alone does not issue invoices. */
	invoiceLiveEnabled: boolean;
	solo?: Omit<SoloOptions, "transport">;
	eRacuni?: Omit<ERacuniOptions, "transport">;
	/** Explicit migration choice only; new checkouts must capture immutable billing. */
	allowLegacyBillingFromShipping?: boolean;
}
export type IntegrationConfigurationLoader = () => Promise<IntegrationConfiguration>;
export const COMMERCE_INTEGRATIONS_PAGE: AdminPageConfig = {
	path: "/integrations",
	label: "Integrations",
	icon: "plug",
};
export const INVOICE_STATUS_ROUTE = "commerce/integrations/status";
export const INVOICE_ORDER_ROUTE = "commerce/invoices/order";
export const INVOICE_RUN_ROUTE = "commerce/invoices/run";
export const INTEGRATION_SWEEP_TASK = "commerce-integrations";

function billingFromOrder(order: Order, allowLegacy: boolean): InvoiceSnapshot["billing"] | null {
	const native = order as Order & {
		billingAddress?: {
			name: string;
			company?: string | null;
			taxNumber?: string | null;
			vatId?: string | null;
			email?: string | null;
			line1: string;
			city: string;
			postalCode: string;
			country: string;
		} | null;
	};
	const billing = native.billingAddress ?? (allowLegacy ? order.shippingAddress : null);
	if (!billing) return null;
	const business = billing as typeof billing & {
		company?: string | null;
		taxNumber?: string | null;
		vatId?: string | null;
	};
	return {
		name: billing.name,
		company: business.company ?? null,
		taxNumber: business.taxNumber ?? null,
		vatId: business.vatId ?? null,
		email: billing.email ?? order.buyerRef,
		line1: billing.line1,
		city: billing.city,
		postalCode: billing.postalCode,
		country: billing.country,
	};
}

function invoiceStores(ctx: PluginContext) {
	const native = createInProcessCommerceStores(ctx);
	const collection = ctx.storage?.[INVOICE_JOB_COLLECTION];
	const locks = ctx.storage?.[INVOICE_PROVIDER_LOCK_COLLECTION];
	if (!collection || !locks) throw new Error("INVOICE_STORAGE_NOT_DECLARED");
	const now = () => native.clock.now().toISOString();
	return {
		native,
		jobs: new InvoiceJobStore(collection, { now }),
		locks: new InvoiceProviderLockStore(locks, { now }),
	};
}

async function paymentBlock(
	stores: ReturnType<typeof invoiceStores>,
	order: Order | null,
): Promise<string | null> {
	if (!order || !["paid", "processing", "shipped", "delivered", "completed"].includes(order.state))
		return "ORDER_NOT_INVOICEABLE";
	if (order.reconciliationFlag) return "ORDER_RECONCILIATION_REQUIRED";
	const payments = await stores.native.orderStore.getCapturedPayments(order.id);
	if (payments.some((p) => p.status === "succeeded" && p.currency !== order.currency))
		return "PAYMENT_CURRENCY_MISMATCH";
	const captured = payments
		.filter((p) => p.status === "succeeded" && p.currency === order.currency)
		.reduce((sum, p) => sum + p.amount, 0);
	if (!Number.isSafeInteger(captured) || captured !== order.totals.total)
		return "CAPTURE_PROOF_REQUIRED";
	if ((await stores.native.orderStore.listRefunds(order.id)).some((r) => r.status !== "voided"))
		return "REFUND_ACCOUNTING_REQUIRED";
	return null;
}

function resolveProvider(
	ctx: PluginContext,
	configuration: IntegrationConfiguration,
): InvoiceProvider | null {
	const transport = (url: string, init: RequestInit) => ctx.http.fetch(url, init);
	if (configuration.invoiceOwner === "solo" && configuration.solo)
		return createSoloProvider({ ...configuration.solo, transport });
	if (configuration.invoiceOwner === "e-racuni" && configuration.eRacuni)
		return createERacuniProvider({ ...configuration.eRacuni, transport });
	return null;
}

export interface InvoiceSweepResult {
	skipped: boolean;
	reason?: string;
	enqueued: number;
	issued: number;
	reconciliation: number;
	blocked: number;
}
const skipped = (reason: string): InvoiceSweepResult => ({
	skipped: true,
	reason,
	enqueued: 0,
	issued: 0,
	reconciliation: 0,
	blocked: 0,
});

/** Bounded rotation over paid orders plus durable pending jobs; losing a cursor only repeats safe work. */
export async function runInvoiceIntegrationSweep(
	ctx: PluginContext,
	configuration: IntegrationConfiguration,
): Promise<InvoiceSweepResult> {
	if (
		configuration.invoiceOwner === "disabled" ||
		configuration.invoiceOwner === "woocommerce-connector"
	)
		return skipped("DIRECT_INVOICING_DISABLED");
	if (!configuration.invoiceLiveEnabled) return skipped("LIVE_ISSUANCE_DISABLED");
	const provider = resolveProvider(ctx, configuration);
	if (!provider) return skipped("PROVIDER_NOT_CONFIGURED");
	const stores = invoiceStores(ctx);
	const orders = ctx.storage![ORDERS_COLLECTION]!;
	const cursors = ctx.storage!.commerce_integration_cursors!;
	const progress = (await cursors.get("invoice-orders")) as { cursor?: string } | null;
	const page = await orders.query({
		where: { state: { in: ["paid", "processing", "shipped", "delivered", "completed"] } },
		cursor: progress?.cursor,
		limit: 25,
	});
	const result: InvoiceSweepResult = {
		skipped: false,
		enqueued: 0,
		issued: 0,
		reconciliation: 0,
		blocked: 0,
	};
	for (const row of page.items) {
		const order = await stores.native.orderStore.getById(orderId(row.id));
		if (!order || (await stores.jobs.get(order.id))) continue;
		try {
			if (await paymentBlock(stores, order)) {
				result.blocked++;
				continue;
			}
			const snapshot = invoiceSnapshotFromOrder(
				order,
				billingFromOrder(order, configuration.allowLegacyBillingFromShipping === true),
				configuration.shopId,
			);
			await stores.jobs.enqueue(snapshot, provider.id, provider.idempotentIssue);
			result.enqueued++;
		} catch {
			result.blocked++;
		}
	}
	await cursors.put("invoice-orders", { cursor: page.cursor ?? undefined });
	// One bounded request per tick/trigger. Provider spacing and serialization remain global per shop account.
	for (const job of await stores.jobs.pending(25)) {
		if (job.provider !== provider.id) continue;
		const lease = await stores.locks.acquire(provider.id, crypto.randomUUID());
		if (!lease) break;
		try {
			const code = await paymentBlock(
				stores,
				await stores.native.orderStore.getById(orderId(job.orderId)),
			);
			if (code) {
				const parked = await stores.jobs.block(job.id, code);
				result.blocked++;
				if (parked?.state === "reconciliation") result.reconciliation++;
				continue;
			}
			const completed = await dispatchInvoiceJob(stores.jobs, job.id, provider, lease.workerId);
			if (completed.state === "issued") result.issued++;
			if (completed.state === "reconciliation") result.reconciliation++;
		} finally {
			await stores.locks.release(lease);
		}
		break;
	}
	return result;
}

function presence(configuration: IntegrationConfiguration) {
	return {
		invoiceOwner: configuration.invoiceOwner,
		shopId: configuration.shopId,
		invoiceLiveEnabled: configuration.invoiceLiveEnabled,
		soloConfigured: Boolean(configuration.solo?.token),
		eRacuniConfigured: Boolean(
			configuration.eRacuni?.username &&
			configuration.eRacuni.secretKey &&
			configuration.eRacuni.token,
		),
	};
}
function handler(entry: RouteEntry | undefined) {
	return typeof entry === "function" ? entry : entry?.handler;
}

/** Host supplies server-only configuration. The pure plugin never reads or stores provider credentials. */
export function withInvoiceIntegrations(
	base: SandboxedPlugin,
	loadConfiguration: IntegrationConfigurationLoader,
): SandboxedPlugin {
	const baseAdmin = handler(base.routes?.admin);
	const baseCron = base.hooks?.cron?.handler;
	let scheduled: Promise<void> | undefined;
	const bootstrap = async (ctx: PluginContext) => {
		if (!ctx.cron) return;
		scheduled ??= ctx.cron
			.schedule(INTEGRATION_SWEEP_TASK, { schedule: "* * * * *" })
			.then(() => undefined)
			.catch(() => {
				scheduled = undefined;
			});
		await scheduled;
	};
	const plugin: SandboxedPlugin = {
		...base,
		hooks: {
			...base.hooks,
			cron: {
				handler: async (event, ctx) => {
					const native = await baseCron?.(event, ctx);
					if (event.name !== SWEEP_TASK_NAME && event.name !== INTEGRATION_SWEEP_TASK)
						return native;
					try {
						return {
							native,
							invoices: await runInvoiceIntegrationSweep(ctx, await loadConfiguration()),
						};
					} catch {
						return { native, invoices: { skipped: false, reason: "INVOICE_SWEEP_FAILED" } };
					}
				},
			},
		},
		routes: {
			...base.routes,
			[INVOICE_STATUS_ROUTE]: { handler: async () => presence(await loadConfiguration()) },
			[INVOICE_ORDER_ROUTE]: {
				handler: async (routeCtx, ctx) => {
					const input = routeCtx.input as { orderId?: unknown };
					if (typeof input.orderId !== "string" || !input.orderId || input.orderId.length > 200)
						return { ok: false, code: "INVALID_ORDER_ID" };
					const stores = invoiceStores(ctx);
					const job = await stores.jobs.get(input.orderId);
					let blockingCode: string | null = null;
					if (!job) {
						const order = await stores.native.orderStore.getById(orderId(input.orderId));
						blockingCode = await paymentBlock(stores, order);
						if (!blockingCode && order) {
							const configuration = await loadConfiguration();
							try {
								invoiceSnapshotFromOrder(
									order,
									billingFromOrder(order, configuration.allowLegacyBillingFromShipping === true),
									configuration.shopId,
								);
							} catch (error) {
								const known = [
									"BILLING_REQUIRED",
									"FROZEN_TAX_PROOF_REQUIRED",
									"PAYMENT_METHOD_REQUIRED",
									"INVALID_SHOP_ID",
								];
								blockingCode =
									error instanceof Error && known.includes(error.message)
										? error.message
										: "FROZEN_INVOICE_PROOF_REQUIRED";
							}
						}
					}
					return {
						ok: true,
						blockingCode,
						job: job
							? {
									id: job.id,
									state: job.state,
									provider: job.provider,
									attempts: job.attempts,
									code: job.code,
									document: job.document,
									updatedAt: job.updatedAt,
								}
							: null,
					};
				},
			},
			[INVOICE_RUN_ROUTE]: {
				handler: async (_routeCtx, ctx) =>
					runInvoiceIntegrationSweep(ctx, await loadConfiguration()),
			},
			admin: {
				handler: async (routeCtx, ctx) => {
					const input = routeCtx.input as { type?: unknown; page?: unknown };
					if (input.type !== "page_load" || input.page !== COMMERCE_INTEGRATIONS_PAGE.path)
						return baseAdmin?.(routeCtx, ctx) ?? { blocks: [] };
					const t = requestTranslator(routeCtx);
					const configuration = presence(await loadConfiguration());
					const jobs = ctx.storage?.[INVOICE_JOB_COLLECTION];
					const counts = await Promise.all(
						["queued", "issued", "reconciliation", "failed"].map(async (state) => ({
							label: t(state),
							value: String((await jobs?.count({ state })) ?? 0),
						})),
					);
					return {
						blocks: [
							{ type: "header", text: t("Commerce integrations") },
							{
								type: "section",
								text: t(
									"Invoice owner: {owner}. Automatic issuance: {issuance}. Solo: {solo}. e-racuni: {eRacuni}.",
									{
										owner: t(configuration.invoiceOwner),
										issuance: t(configuration.invoiceLiveEnabled ? "enabled" : "disabled"),
										solo: t(configuration.soloConfigured ? "configured" : "not configured"),
										eRacuni: t(configuration.eRacuniConfigured ? "configured" : "not configured"),
									},
								),
							},
							{ type: "stats", items: counts },
							{
								type: "section",
								text: t(
									"Provider credentials are server runtime secrets. See docs/integrations.md for setup and reconciliation. WooCommerce compatibility exposes the supported REST/webhook profile; WordPress PHP plugins require a separate bridge.",
								),
							},
						],
					} satisfies BlockResponse;
				},
			},
		},
	};
	// Config-array installations never fire plugin:activate; real route traffic must bootstrap cron.
	plugin.routes = Object.fromEntries(
		Object.entries(plugin.routes ?? {}).map(([name, entry]) => {
			const original = handler(entry)!;
			return [
				name,
				{
					...(typeof entry === "object" ? entry : {}),
					handler: async (routeCtx: Parameters<typeof original>[0], ctx: PluginContext) => {
						await bootstrap(ctx);
						return original(routeCtx, ctx);
					},
				},
			];
		}),
	);
	return plugin;
}

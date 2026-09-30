import {
	EmDashWooExternalIdStore,
	EmDashWooMetadataStore,
	EmDashWooWebhookOutbox,
	buildWooWebhook,
	createWooCredentialAuthenticator,
	createWooMapper,
	dispatchWooWebhook,
	handleWooHttpBridge,
	hashWooSecret,
	bytesToBase64,
	base64ToBytes,
} from "@emdash-commerce/compat-woocommerce";
import type {
	WooHttpRequest,
	WooScope,
	WooWebhookJob,
	WooIdRegistryDocument,
	WooMetadataDocument,
	WooWebhookEnqueue,
} from "@emdash-commerce/compat-woocommerce";
import type { StorageCollection } from "@otta-sh/store-emdash";
import { ORDERS_COLLECTION } from "@otta-sh/store-emdash";
import { SWEEP_TASK_NAME } from "../cron/index.js";
import type { PluginContext, RouteEntry, SandboxedPlugin } from "../types.js";
import { createNativeWooBackend, type NativeWooProductContentPort } from "./woocommerce-backend.js";

export interface WooIntegrationConfiguration {
	origin: string;
	consumerKey: string;
	consumerSecret: string;
	scopes: readonly WooScope[];
	allowInsecureLocalhost?: boolean;
	webhook?: { url: string; secret: string; id: number };
}
export type WooConfigurationLoader = () => Promise<WooIntegrationConfiguration | null>;
export interface WooIntegrationOptions {
	/** Read-only host capability adapter. Commercial truth remains in native storage. */
	content?: (ctx: PluginContext, origin: string) => NativeWooProductContentPort;
}
export const WOO_HTTP_ROUTE = "woocommerce/http";
export const WOO_SWEEP_TASK = "commerce-woo-webhooks";
const SCOPES: readonly WooScope[] = [
	"orders:read",
	"orders:write",
	"products:read",
	"products:write",
	"customers:read",
];
const text = (bindings: Record<string, unknown>, key: string) =>
	typeof bindings[key] === "string" ? (bindings[key] as string).trim() : "";
export function wooConfigurationFromBindings(
	bindings: Record<string, unknown> = {},
): WooIntegrationConfiguration | null {
	const consumerKey = text(bindings, "WOO_CONSUMER_KEY"),
		consumerSecret = text(bindings, "WOO_CONSUMER_SECRET");
	if (!consumerKey && !consumerSecret) return null;
	if (!/^ck_[a-f0-9]{40}$/.test(consumerKey) || !/^cs_[a-f0-9]{40}$/.test(consumerSecret))
		throw new Error("INVALID_WOO_CONFIGURATION");
	const source = new URL(text(bindings, "COMMERCE_PUBLIC_URL"));
	const allowInsecureLocalhost = text(bindings, "WOO_ALLOW_INSECURE_LOCALHOST") === "true";
	if (
		source.username ||
		source.password ||
		source.search ||
		source.hash ||
		source.pathname !== "/" ||
		(source.protocol !== "https:" &&
			!(
				allowInsecureLocalhost &&
				source.protocol === "http:" &&
				["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)
			))
	)
		throw new Error("INVALID_WOO_CONFIGURATION");
	const scopes = text(bindings, "WOO_SCOPES")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (
		!scopes.length ||
		scopes.some((s) => !SCOPES.includes(s as WooScope)) ||
		new Set(scopes).size !== scopes.length
	)
		throw new Error("INVALID_WOO_SCOPES");
	const result: WooIntegrationConfiguration = {
		origin: source.origin,
		consumerKey,
		consumerSecret,
		scopes: scopes as WooScope[],
		allowInsecureLocalhost,
	};
	const destination = text(bindings, "WOO_WEBHOOK_DELIVERY_URL"),
		secret = text(bindings, "WOO_WEBHOOK_SECRET");
	if (destination || secret) {
		const url = new URL(destination);
		const id = Number(text(bindings, "WOO_WEBHOOK_ID") || "1");
		if (
			!secret ||
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.hash ||
			!Number.isSafeInteger(id) ||
			id < 1 ||
			source.protocol !== "https:"
		)
			throw new Error("INVALID_WOO_WEBHOOK_CONFIGURATION");
		result.webhook = { url: url.href, secret, id };
	}
	return result;
}
async function runtime(
	ctx: PluginContext,
	configuration: WooIntegrationConfiguration,
	options: WooIntegrationOptions = {},
) {
	if (
		!ctx.storage?.woo_ids ||
		!ctx.storage.woo_metadata ||
		!ctx.storage.woo_webhooks ||
		!ctx.storage.commerce_integration_cursors
	)
		throw new Error("WOO_STORAGE_NOT_DECLARED");
	const ids = new EmDashWooExternalIdStore(
		ctx.storage.woo_ids as StorageCollection<WooIdRegistryDocument>,
	);
	const metadata = new EmDashWooMetadataStore(
		ctx.storage.woo_metadata as StorageCollection<WooMetadataDocument>,
	);
	const backend = createNativeWooBackend(
		ctx,
		ids,
		metadata,
		configuration.origin,
		options.content?.(ctx, configuration.origin),
	);
	const digest = await hashWooSecret(configuration.consumerSecret);
	const authenticate = createWooCredentialAuthenticator({
		findByConsumerKey: async (key) =>
			key === configuration.consumerKey
				? {
						id: configuration.consumerKey,
						consumerKey: configuration.consumerKey,
						enabled: true,
						secretSha256: digest,
						scopes: configuration.scopes,
					}
				: null,
	});
	return {
		ids,
		backend,
		authenticate,
		currencyDecimals: { EUR: 2 },
		allowInsecureLocalhost: configuration.allowInsecureLocalhost,
		outbox: new EmDashWooWebhookOutbox(
			ctx.storage.woo_webhooks as StorageCollection<WooWebhookJob>,
		),
	};
}
interface PreparedDelivery {
	id: string;
	hash: string;
	sequence: number;
	url: string;
	bodyBase64: string;
	headers: Record<string, string>;
	availableAt: string;
}
interface OrderWebhookCursor {
	sequence: number;
	hash?: string;
	deliveryId?: string;
	prepared?: PreparedDelivery | null;
}
export interface WooWebhookSweepResult {
	skipped: boolean;
	enqueued: number;
	delivered: number;
	retryable: number;
	terminal: number;
	blocked: number;
}
/** CAS persists the exact prepared message BEFORE enqueue. A crashed producer resumes those same bytes. */
export async function runWooWebhookSweep(
	ctx: PluginContext,
	configuration: WooIntegrationConfiguration | null,
	options: WooIntegrationOptions & { now?: string } = {},
): Promise<WooWebhookSweepResult> {
	const result: WooWebhookSweepResult = {
		skipped: !configuration?.webhook,
		enqueued: 0,
		delivered: 0,
		retryable: 0,
		terminal: 0,
		blocked: 0,
	};
	if (!configuration?.webhook) return result;
	const ports = await runtime(ctx, configuration, options);
	const cursors = ctx.storage!.commerce_integration_cursors!;
	const progress = (await cursors.get("woo-orders")) as { cursor?: string } | null;
	const page = await ctx.storage![ORDERS_COLLECTION]!.query({
		cursor: progress?.cursor,
		limit: 25,
	});
	const now = () => options.now ?? new Date().toISOString();
	const mapper = createWooMapper(ports.ids, ports.currencyDecimals);
	for (const row of page.items) {
		try {
			const key = `woo-order:${row.id}`;
			let current = await cursors.getVersioned(key);
			let value = (current?.value ?? { sequence: 0 }) as OrderWebhookCursor;
			if (!value.prepared) {
				if (value.deliveryId) {
					const prior = await ports.outbox.get(value.deliveryId);
					if (!prior || !["delivered", "terminal"].includes(prior.state)) continue;
				}
				const snapshot = await ports.backend.getOrder(row.id);
				if (!snapshot) continue;
				const body = new TextEncoder().encode(JSON.stringify(await mapper.order(snapshot)));
				const hash = await hashWooSecret(bytesToBase64(body));
				if (value.hash === hash) continue;
				const sequence = value.sequence + 1;
				if (!Number.isSafeInteger(sequence)) throw new Error("WOO_CURSOR_EXHAUSTED");
				const deliveryId = `order-${sequence}-${await hashWooSecret(row.id)}-${hash}`;
				const webhook = await buildWooWebhook({
					payload: body,
					secret: configuration.webhook.secret,
					source: configuration.origin,
					topic: value.hash ? "order.updated" : "order.created",
					webhookId: configuration.webhook.id,
					deliveryId,
				});
				value = {
					...value,
					prepared: {
						id: deliveryId,
						hash,
						sequence,
						url: configuration.webhook.url,
						bodyBase64: bytesToBase64(webhook.body),
						headers: webhook.headers,
						availableAt: now(),
					},
				};
				const reserved = await cursors.compareAndSet(key, current?.revision ?? null, value);
				if (!reserved.applied) continue;
				current = { value, revision: reserved.revision };
			}
			const prepared = value.prepared!;
			const message: WooWebhookEnqueue = {
				deliveryId: prepared.id,
				url: prepared.url,
				availableAt: prepared.availableAt,
				webhook: { body: base64ToBytes(prepared.bodyBase64), headers: prepared.headers },
			};
			await ports.outbox.enqueue(message);
			const checkpoint = await cursors.compareAndSet(key, current!.revision, {
				sequence: prepared.sequence,
				hash: prepared.hash,
				deliveryId: prepared.id,
				prepared: null,
			});
			if (checkpoint.applied) result.enqueued++;
		} catch {
			result.blocked++;
		}
	}
	await cursors.put("woo-orders", { cursor: page.cursor ?? undefined });
	const dispatched = await dispatchWooWebhook(
		ports.outbox,
		async (request) => {
			const response = await ctx.http.fetch(request.url, {
				method: "POST",
				headers: request.headers,
				body: new Uint8Array(request.body).buffer,
				redirect: "manual",
				signal: AbortSignal.timeout(10_000),
			});
			return { status: response.status };
		},
		{ now: now(), leaseMs: 30_000, clockNow: now },
	);
	if (dispatched === "delivered" || dispatched === "retryable" || dispatched === "terminal")
		result[dispatched]++;
	return result;
}
const handler = (entry?: RouteEntry) => (typeof entry === "function" ? entry : entry?.handler);
function unavailable() {
	return {
		status: 503,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		body: JSON.stringify({
			code: "woocommerce_rest_unavailable",
			message: "WooCommerce compatibility is not configured or temporarily unavailable.",
			data: { status: 503 },
		}),
	};
}
/** Public bridge authenticates Woo credentials itself; native admin diagnostics remain private. */
export function withWooCommerceIntegrations(
	base: SandboxedPlugin,
	loadConfiguration: WooConfigurationLoader,
	options: WooIntegrationOptions = {},
): SandboxedPlugin {
	let scheduled: Promise<void> | undefined;
	const baseCron = base.hooks?.cron?.handler;
	const plugin: SandboxedPlugin = {
		...base,
		hooks: {
			...base.hooks,
			cron: {
				handler: async (event, ctx) => {
					const native = await baseCron?.(event, ctx);
					if (event.name !== SWEEP_TASK_NAME && event.name !== WOO_SWEEP_TASK) return native;
					try {
						return {
							native,
							woocommerce: await runWooWebhookSweep(ctx, await loadConfiguration(), options),
						};
					} catch {
						return { native, woocommerce: { skipped: false, code: "WOO_SWEEP_FAILED" } };
					}
				},
			},
		},
		routes: {
			...base.routes,
			[WOO_HTTP_ROUTE]: {
				public: true,
				handler: async (route, ctx) => {
					try {
						const configuration = await loadConfiguration();
						if (!configuration) return unavailable();
						const input = route.input as WooHttpRequest;
						if (new URL(input.url).origin !== configuration.origin)
							return {
								...unavailable(),
								status: 400,
								body: JSON.stringify({
									code: "woocommerce_rest_invalid_request",
									message: "The request origin does not match the configured shop.",
									data: { status: 400 },
								}),
							};
						return await handleWooHttpBridge(input, await runtime(ctx, configuration, options));
					} catch {
						return unavailable();
					}
				},
			},
			"commerce/woocommerce/status": {
				handler: async (_route, ctx) => {
					const configuration = await loadConfiguration();
					const states = await Promise.all(
						["queued", "leased", "retryable", "delivered", "terminal"].map(async (state) => [
							state,
							(await ctx.storage?.woo_webhooks?.count({ state })) ?? 0,
						]),
					);
					return {
						configured: Boolean(configuration),
						scopes: configuration?.scopes ?? [],
						webhooksConfigured: Boolean(configuration?.webhook),
						deliveries: Object.fromEntries(states),
					};
				},
			},
		},
	};
	plugin.routes = Object.fromEntries(
		Object.entries(plugin.routes ?? {}).map(([name, entry]) => {
			const original = handler(entry)!;
			return [
				name,
				{
					...(typeof entry === "object" ? entry : {}),
					handler: async (route: Parameters<typeof original>[0], ctx: PluginContext) => {
						if (ctx.cron) {
							scheduled ??= ctx.cron
								.schedule(WOO_SWEEP_TASK, { schedule: "* * * * *" })
								.then(() => undefined)
								.catch(() => {
									scheduled = undefined;
								});
							await scheduled;
						}
						return original(route, ctx);
					},
				},
			];
		}),
	);
	return plugin;
}

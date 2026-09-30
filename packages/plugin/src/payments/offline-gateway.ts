import {
	PaymentIntentError,
	type PaymentGateway,
	type CreateIntentInput,
	type PaymentIntentHandle,
	type ConfirmationResult,
	type RefundResult,
	type RawConfirmation,
} from "@otta-sh/domain";
import type { PluginContext } from "../types.js";

export const MIN_OFFLINE_WINDOW_HOURS = 1;
export const MAX_OFFLINE_WINDOW_HOURS = 720;
export const OFFLINE_SETTING_KEYS = {
	bankEnabled: "settings:bankTransferEnabled",
	bankInstructions: "settings:bankTransferInstructions",
	bankWindowHours: "settings:bankTransferWindowHours",
	codEnabled: "settings:codEnabled",
	codInstructions: "settings:codInstructions",
	codWindowHours: "settings:codWindowHours",
} as const;

export class OfflinePaymentGateway implements PaymentGateway {
	readonly refundable = false;
	readonly checkoutPolicy: { holdTtlMs: number; offlineInstructions: string };
	constructor(
		readonly id: "bank_transfer" | "cod",
		instructions: string,
		windowHours: number,
	) {
		if (
			!Number.isInteger(windowHours) ||
			windowHours < MIN_OFFLINE_WINDOW_HOURS ||
			windowHours > MAX_OFFLINE_WINDOW_HOURS ||
			instructions.trim().length === 0 ||
			instructions.trim().length > 4000
		)
			throw new Error("invalid offline payment configuration");
		this.checkoutPolicy = {
			holdTtlMs: windowHours * 3600000,
			offlineInstructions: instructions.trim(),
		};
	}
	async createIntent(input: CreateIntentInput): Promise<PaymentIntentHandle> {
		const payment = input.offlinePayment;
		if (payment === undefined || payment.method !== this.id)
			throw new PaymentIntentError({
				gateway: this.id,
				retryable: false,
				message: "offline order has no frozen payment instructions",
			});
		return {
			gateway: this.id,
			intentId: `offline:${this.id}:${input.orderId}`,
			clientAction: { kind: "offline_instructions", ...payment },
		};
	}
	async verifyConfirmation(_raw: RawConfirmation): Promise<ConfirmationResult> {
		return { ok: false, reason: "UNKNOWN_EVENT" };
	}
	async refund(): Promise<RefundResult> {
		return { ok: false, reason: "UNSUPPORTED" };
	}
}

export async function readOfflineSettings(ctx: PluginContext): Promise<Map<string, string>> {
	const values = await Promise.all(
		Object.values(OFFLINE_SETTING_KEYS).map(
			async (key) => [key, await ctx.kv.get<unknown>(key)] as const,
		),
	);
	return new Map(
		values.map(([key, value]) => [
			key,
			typeof value === "string" ? value.trim() : value === true ? "true" : "",
		]),
	);
}

/** Validates the full proposed configuration before any setting is saved. */
export function offlineSettingsError(values: ReadonlyMap<string, string>): string | null {
	for (const [enabledKey, instructionsKey, windowKey] of [
		[
			OFFLINE_SETTING_KEYS.bankEnabled,
			OFFLINE_SETTING_KEYS.bankInstructions,
			OFFLINE_SETTING_KEYS.bankWindowHours,
		],
		[
			OFFLINE_SETTING_KEYS.codEnabled,
			OFFLINE_SETTING_KEYS.codInstructions,
			OFFLINE_SETTING_KEYS.codWindowHours,
		],
	] as const) {
		const enabled = values.get(enabledKey) ?? "";
		const instructions = values.get(instructionsKey) ?? "";
		const window = values.get(windowKey) ?? "";
		if (enabled !== "" && enabled !== "true" && enabled !== "false")
			return "Offline enable fields must be true or false.";
		if (instructions.length > 4000)
			return "Offline payment instructions must be at most 4000 characters.";
		if (
			window !== "" &&
			(!/^\d+$/.test(window) ||
				Number(window) < MIN_OFFLINE_WINDOW_HOURS ||
				Number(window) > MAX_OFFLINE_WINDOW_HOURS)
		)
			return "Offline payment windows must be whole hours between 1 and 720 (30 days).";
		if (enabled === "true" && (instructions === "" || window === ""))
			return "Each enabled offline method requires instructions and an explicit payment window in hours.";
	}
	return null;
}

export async function offlineGatewaysFromCtx(
	ctx: PluginContext,
): Promise<Partial<Record<"bank_transfer" | "cod", PaymentGateway>>> {
	let settings: Map<string, string>;
	try {
		settings = await readOfflineSettings(ctx);
	} catch {
		return {};
	}
	const gateways: Partial<Record<"bank_transfer" | "cod", PaymentGateway>> = {};
	for (const [method, enabled, instructions, window] of [
		[
			"bank_transfer",
			OFFLINE_SETTING_KEYS.bankEnabled,
			OFFLINE_SETTING_KEYS.bankInstructions,
			OFFLINE_SETTING_KEYS.bankWindowHours,
		],
		[
			"cod",
			OFFLINE_SETTING_KEYS.codEnabled,
			OFFLINE_SETTING_KEYS.codInstructions,
			OFFLINE_SETTING_KEYS.codWindowHours,
		],
	] as const) {
		if (settings.get(enabled) !== "true") continue;
		try {
			gateways[method] = new OfflinePaymentGateway(
				method,
				settings.get(instructions) ?? "",
				Number(settings.get(window)),
			);
		} catch {
			/* fail closed for this method */
		}
	}
	return gateways;
}

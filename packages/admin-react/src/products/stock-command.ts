/** A confirmed stock intent, retained until the server returns its outcome. */
export interface StockCommand {
	readonly actionId: string;
	readonly value: Record<string, string>;
	readonly slot?: "stock-add" | "stock-remove";
}

const STOCK_ACTIONS = new Set([
	"products:restock",
	"products:remove-stock",
	"products:variant-restock",
	"products:variant-remove-stock",
]);

export function isStockAction(actionId: string): boolean {
	return STOCK_ACTIONS.has(actionId);
}

function storageKey(productId: string): string {
	return `otta:pending-stock:${productId}`;
}

/** Reloading the same tab must not turn an unanswered command into a new intent. */
export function readStockCommand(productId: string): StockCommand | null {
	try {
		const saved = sessionStorage.getItem(storageKey(productId));
		if (saved === null) return null;
		const parsed: unknown = JSON.parse(saved);
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		const candidate = parsed as Record<string, unknown>;
		if (typeof candidate["actionId"] !== "string" || !isStockAction(candidate["actionId"]))
			return null;
		const value = candidate["value"];
		if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
		const fields = value as Record<string, unknown>;
		if (
			Object.values(fields).some((field) => typeof field !== "string") ||
			fields["productId"] !== productId ||
			typeof fields["commandId"] !== "string" ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				fields["commandId"],
			)
		)
			return null;
		const slot = candidate["slot"];
		return {
			actionId: candidate["actionId"],
			value: fields as Record<string, string>,
			...(slot === "stock-add" || slot === "stock-remove" ? { slot } : {}),
		};
	} catch {
		return null;
	}
}

/** Persist before dispatch; refuse to send if the browser cannot retain the intent. */
export function retainStockCommand(command: StockCommand): boolean {
	try {
		sessionStorage.setItem(storageKey(command.value["productId"] ?? ""), JSON.stringify(command));
		return true;
	} catch {
		return false;
	}
}

export function clearStockCommand(productId: string): void {
	try {
		sessionStorage.removeItem(storageKey(productId));
	} catch {
		// A retained receipt can safely be replayed after storage becomes available again.
	}
}

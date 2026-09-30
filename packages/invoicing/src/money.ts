import { cents } from "@otta-sh/domain";
import type { Cents } from "@otta-sh/domain";

export function formatDecimal(amount: Cents): string {
	if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("INVALID_MINOR_UNITS");
	const value = BigInt(amount);
	return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

/** Two-decimal currency profile; reject exponent, signs and lossy rounding. */
export function parseDecimal(value: string): Cents {
	if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value)) throw new Error("INVALID_DECIMAL");
	const [whole = "0", fraction = ""] = value.split(".");
	const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
	if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("INVALID_MINOR_UNITS");
	return cents(Number(amount));
}

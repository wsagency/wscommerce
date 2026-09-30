import { type Cents, cents } from "../money/cents.js";
import { mulDivRoundHalfUp } from "./round.js";

/**
 * Per-line tax (Phase 6 §4): `round_half_up(amount × rateBps / 10_000)`, in pure
 * integer minor units. Granularity is per-line (each line and the shipping line
 * rounded independently, then summed) so every line is individually auditable on
 * an invoice.
 *
 * `computeLineTax(0, r) === 0` and `computeLineTax(a, 0) === 0` for all inputs.
 * The `amount × rateBps` multiply runs in `BigInt` (via `mulDivRoundHalfUp`,
 * review I5) so no intermediate can overflow the safe-integer range and no float
 * ever appears — uniform with `allocateCents`.
 */
export function computeLineTax(amountCents: Cents, rateBps: number): Cents {
	if (!Number.isSafeInteger(rateBps) || rateBps < 0) {
		throw new RangeError(
			`computeLineTax requires a non-negative integer rateBps, got ${String(rateBps)}`,
		);
	}
	return cents(mulDivRoundHalfUp(amountCents, rateBps, 10_000));
}

/** Extract net from an inclusive LINE amount, half-up; VAT is gross minus net.
 * BigInt handles odd denominators and intermediate overflow without floats. */
export function computeInclusiveNet(grossCents: Cents, rateBps: number): Cents {
	if (!Number.isSafeInteger(rateBps) || rateBps < 0) {
		throw new RangeError(`computeInclusiveNet requires non-negative integer rateBps`);
	}
	const denominator = 10_000n + BigInt(rateBps);
	return cents(Number((2n * BigInt(grossCents) * 10_000n + denominator) / (2n * denominator)));
}

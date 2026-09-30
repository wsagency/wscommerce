import { pdf417, drawingSVG } from "@bwip-js/generic";
import type { BankTransferSnapshot } from "@otta-sh/domain";
import { buildHub3Payload } from "./hub3.js";
export const HUB3_SYMBOL = {
	bcid: "pdf417",
	columns: 9,
	eclevel: 4,
	rowmult: 3,
	compact: false,
} as const;
export const MODULE_MM = 0.254;
export function renderHub3Svg(
	snapshot: BankTransferSnapshot,
	options: { scale?: number } = {},
): string {
	const scale = options.scale ?? 3;
	if (!Number.isInteger(scale) || scale < 1 || scale > 6)
		throw new RangeError("Barcode scale must be a whole number from 1 to 6");
	const svg = pdf417(
		{ ...HUB3_SYMBOL, text: buildHub3Payload(snapshot), scale, padding: 2 },
		drawingSVG(),
	);
	const box = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
	if (!box) throw new Error("Invalid barcode geometry");
	const width = (Number(box[1]) / scale) * MODULE_MM,
		height = (Number(box[2]) / scale) * MODULE_MM;
	if (width > 58 || height > 26) throw new RangeError("Barcode exceeds HUB-3A print geometry");
	return svg.replace(
		"<svg ",
		`<svg width="${width.toFixed(3)}mm" height="${height.toFixed(3)}mm" `,
	);
}

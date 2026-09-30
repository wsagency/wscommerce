import { expect, test } from "vitest";
import {
	cents,
	currency,
	freezeBankTransferSnapshot,
	type BankTransferRecipient,
} from "@otta-sh/domain";
import { buildHub3Payload } from "../src/payments/hub3.js";
import { renderHub3Svg, HUB3_SYMBOL, MODULE_MM } from "../src/payments/pdf417.js";
import { loadPluginInSandbox } from "./sandbox/harness.js";
const recipient = {
	name: "Synthetic ČĆĐŠŽ",
	address: "Test street 1",
	city: "10000 Test",
	iban: "HR3799999990000000001",
	model: "HR00" as const,
	purpose: "GDDS",
};
const input = {
	recipient,
	amountCents: cents(3950),
	currency: currency("EUR"),
	payer: null,
	reference: "123-456",
	description: "Test: ČĆĐŠŽ",
};
test("fourteen LF fields retain Croatian text and the authoritative cents", () => {
	const s = freezeBankTransferSnapshot(input);
	const fields = buildHub3Payload(s).split("\n");
	expect(fields).toHaveLength(15);
	expect(fields[2]).toBe("000000000003950");
	expect(fields[6]).toBe("Synthetic ČĆĐŠŽ");
	expect(fields[13]).toBe("Test: ČĆĐŠŽ");
	expect(fields[14]).toBe("");
});
test("money and bank control fields fail closed", () => {
	for (const amountCents of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, 1e15])
		expect(() =>
			freezeBankTransferSnapshot({
				...input,
				amountCents: amountCents as typeof input.amountCents,
			}),
		).toThrow();
	expect(() => freezeBankTransferSnapshot({ ...input, currency: currency("USD") })).toThrow();
	for (const changes of [
		{ iban: "HR0099999990000000001" },
		{ iban: "HR91\n99999990000000001" },
		{ model: "HR01" },
		{ purpose: "G\nDS" },
		{ name: "One\nEUR" },
	])
		expect(() =>
			freezeBankTransferSnapshot({
				...input,
				recipient: { ...recipient, ...changes } as BankTransferRecipient,
			}),
		).toThrow();
	for (const reference of ["a", "1\n2", "1234567890123", "1".repeat(23), "1--2"])
		expect(() => freezeBankTransferSnapshot({ ...input, reference })).toThrow();
	expect(() =>
		freezeBankTransferSnapshot({ ...input, recipient: { ...recipient, model: "HR99" } }),
	).toThrow();
});
test("descriptive fields are sanitized and truncated without adding fields", () => {
	const payload = buildHub3Payload(
		freezeBankTransferSnapshot({
			...input,
			description: "Č".repeat(80) + "<script>",
			recipient: { ...recipient, name: "Č".repeat(80) },
		}),
	);
	const fields = payload.split("\n");
	expect(fields).toHaveLength(15);
	expect(fields[6]).toHaveLength(25);
	expect(fields[13]).toHaveLength(35);
	expect(payload).not.toContain("<");
});
test("deterministic PDF417 retains specified geometry at every accepted scale", () => {
	expect(HUB3_SYMBOL).toEqual({
		bcid: "pdf417",
		columns: 9,
		eclevel: 4,
		rowmult: 3,
		compact: false,
	});
	expect(MODULE_MM).toBe(0.254);
	const s = freezeBankTransferSnapshot(input);
	for (const scale of [1, 3, 6]) {
		const svg = renderHub3Svg(s, { scale });
		expect(svg).toBe(renderHub3Svg(s, { scale }));
		expect(svg).toContain("<svg");
		const width = Number(/width="([\d.]+)mm"/.exec(svg)![1]);
		expect(width).toBeLessThanOrEqual(58);
		expect(width).toBeGreaterThan(55);
	}
	expect(() => renderHub3Svg(s, { scale: 0 })).toThrow();
	expect(() => renderHub3Svg(s, { scale: 100000 })).toThrow();
});
test("the real bundled workerd renders the same synthetic SVG without Node APIs", async () => {
	const worker = await loadPluginInSandbox({
		allowedHosts: [],
		entry: "payments/testing/hub3-worker.ts",
	});
	try {
		const snapshot = freezeBankTransferSnapshot(input);
		const result = await worker.invokeRoute("render", snapshot);
		expect(result).toEqual({ result: { ok: true, svg: renderHub3Svg(snapshot) } });
	} finally {
		await worker.close();
	}
});

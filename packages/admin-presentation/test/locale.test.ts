import { expect, test } from "vitest";
import { ADMIN_MESSAGES_HR } from "../src/admin-messages.js";
import {
	adminMessage,
	normalizeAdminLocale,
	formatTimestamp,
	addStockConfirm,
	cancelConfirmText,
	formatAmount,
	onHandCell,
	orderStateCell,
	refundConfirmText,
	removeStockConfirm,
	reconciliationAlertSentence,
	pagePositionLine,
} from "../src/index.js";

test("Croatian order status and money describe unchanged native values", () => {
	expect(orderStateCell("paid", "hr-HR")).toBe("plaćeno");
	expect(orderStateCell("cancelled", "hr")).toBe("otkazano · zatvoreno");
	expect(orderStateCell("future_state", "hr")).toBe("future_state");
	expect(formatAmount(12345, "EUR", "hr")).toBe("123,45 €");
	expect(formatAmount(12345, "EUR", "invalid-locale")).toBe("€123.45");
});

test("Croatian stock confirmations use local plurals without translating the SKU", () => {
	expect(addStockConfirm(2, "Orders", 3, "hr")).toEqual({
		title: "Dodati 2 komada?",
		text: "Dodati 2 komada za Orders? Zaliha se mijenja s 3 na 5 i trgovina ih može odmah prodavati.",
		confirm: "Da, dodaj 2",
		deny: "Ostavi kako jest",
	});
	expect(addStockConfirm(21, "SKU-21", 0, "hr").title).toBe("Dodati 21 komad?");
	expect(removeStockConfirm(12, "hr").title).toBe("Ukloniti 12 komada?");
	expect(onHandCell(0, 3, "hr")).toBe("0 · Nema na zalihi");
});

test("Croatian destructive confirmations preserve recipient and action meaning", () => {
	expect(cancelConfirmText("Prijevara", "hr")).toContain("Otkazati ovu narudžbu zbog „Prijevara”?");
	const text = refundConfirmText("7e4ce728", "123,45 €", "Orders", true, "hr");
	expect(text).toContain('"Orders"');
	expect(text).toContain("123,45 €");
	expect(text).toContain("Stripe");
	expect(text).toContain("ne može se poništiti");
});

const slots = (text: string) =>
	[...new Set([...text.matchAll(/\{([A-Za-z]+)\}/g)].map((match) => match[1]))].toSorted();

test("translation templates keep their named slots and interpolate data once", () => {
	for (const [key, translation] of Object.entries(ADMIN_MESSAGES_HR)) {
		expect(slots(translation), key).toEqual(slots(key));
	}
	expect(adminMessage("hr", "Copy {what} {id}", { what: "Orders {id}", id: "Fraud {what}" })).toBe(
		"Kopiraj Orders {id} Fraud {what}",
	);
});

test("locale normalization accepts regional Croatian tags and stable English fallback", () => {
	for (const input of ["hr", "hr-HR", " HR-ba "]) expect(normalizeAdminLocale(input)).toBe("hr");
	for (const input of [undefined, null, 42, {}, "en-US", "fr-FR", "../../hr", "hr_HR"])
		expect(normalizeAdminLocale(input)).toBe("en");
	expect(formatTimestamp("2026-09-30T23:12:45.000Z", "hr")).toBe("30. ruj 2026. 23:12 UTC");
});

test("Croatian reconciliation instructions keep the service flag literal", () => {
	expect(reconciliationAlertSentence("Orders {reason}", "hr")).toBe(
		"Obračun je označio ovu narudžbu: Orders {reason}. Uskladite je u odjeljku Isporuka — bilježenje odluke ne prenosi novac i ne mijenja narudžbu.",
	);
});

test("Croatian paging describes the original page span", () => {
	expect(pagePositionLine({ index: 3, pages: 8 }, "hr")).toBe("Stranica 3 od 8");
	expect(pagePositionLine({ index: 3, pages: 8, span: 2 }, "hr")).toBe("Stranice 2–3 od 8");
});

test("Croatian stock quantities group large counts and keep English defaults", () => {
	expect(onHandCell(1000, 3, "hr")).toBe("1.000");
	expect(onHandCell(1000, 3)).toBe("1000");
	expect(addStockConfirm(1001, "Orders", 1000, "hr").text).toBe(
		"Dodati 1.001 komad za Orders? Zaliha se mijenja s 1.000 na 2.001 i trgovina ih može odmah prodavati.",
	);
});

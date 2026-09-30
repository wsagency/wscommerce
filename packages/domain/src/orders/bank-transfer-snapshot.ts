import type { Cents, Currency } from "../money/cents.js";
import type { OrderAddress } from "./model.js";
export interface BankTransferRecipient {
	name: string;
	address: string;
	city: string;
	iban: string;
	model: "HR00" | "HR99";
	purpose: string;
}
export interface BankTransferSnapshot {
	readonly version: 1;
	readonly amountCents: Cents;
	readonly currency: Currency;
	readonly recipient: BankTransferRecipient;
	readonly payer: OrderAddress | null;
	readonly reference: string;
	readonly description: string;
}
// oxlint-disable-next-line no-control-regex -- Bank fields must reject control characters.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
function field(value: string) {
	if (typeof value !== "string" || value.length > 4000 || CONTROL.test(value))
		throw new RangeError("Invalid bank field");
	return value.trim();
}
export function normalizeBankIban(value: string): string {
	const iban = field(value).replace(/ /g, "").toUpperCase();
	if (!/^HR\d{19}$/.test(iban)) throw new RangeError("Invalid Croatian IBAN");
	let remainder = 0;
	for (const digit of iban.slice(4) + "1727" + iban.slice(2, 4))
		remainder = (remainder * 10 + Number(digit)) % 97;
	if (remainder !== 1) throw new RangeError("Invalid Croatian IBAN checksum");
	return iban;
}
export function bankText(value: string, max: number): string {
	return Array.from(field(value))
		.map((c) => (/[ČčĆćĐđŠšŽž]/.test(c) ? c : c.normalize("NFD").replace(/\p{Diacritic}/gu, "")))
		.join("")
		.replace(/[^A-Za-z0-9ČčĆćĐđŠšŽž ,.:+?'/()-]/g, " ")
		.replace(/ +/g, " ")
		.trim()
		.slice(0, max);
}
export function validateBankTransferRecipient(input: BankTransferRecipient): BankTransferRecipient {
	if (!input || !["HR00", "HR99"].includes(input.model))
		throw new RangeError("Unsupported bank reference model");
	const name = bankText(input.name, 25),
		address = bankText(input.address, 25),
		city = bankText(input.city, 27);
	if (!name || !address || !city || !/^[A-Z]{4}$/.test(field(input.purpose)))
		throw new RangeError("Invalid bank recipient");
	return {
		name,
		address,
		city,
		iban: normalizeBankIban(input.iban),
		model: input.model,
		purpose: input.purpose,
	};
}
export function freezeBankTransferSnapshot(
	input: Omit<BankTransferSnapshot, "version">,
): BankTransferSnapshot {
	if (
		input.currency !== "EUR" ||
		!Number.isSafeInteger(input.amountCents) ||
		input.amountCents < 0 ||
		input.amountCents >= 1e15
	)
		throw new RangeError("HUB-3A requires safe EUR cents of at most 15 digits");
	const recipient = validateBankTransferRecipient(input.recipient),
		reference = field(input.reference);
	if (
		reference.length > 22 ||
		(recipient.model === "HR99"
			? reference !== ""
			: !/^\d{1,12}(?:-\d{1,12}){0,2}$/.test(reference))
	)
		throw new RangeError("Invalid bank payment reference");
	const payer = input.payer ? Object.freeze({ ...input.payer }) : null;
	if (payer) {
		bankText(payer.name, 30);
		bankText(payer.line1, 27);
		bankText(`${payer.postalCode} ${payer.city}`, 27);
	}
	return Object.freeze({
		version: 1,
		amountCents: input.amountCents,
		currency: input.currency,
		recipient: Object.freeze(recipient),
		payer,
		reference,
		description: bankText(input.description, 35),
	});
}

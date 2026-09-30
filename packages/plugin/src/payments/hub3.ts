import { freezeBankTransferSnapshot, bankText, type BankTransferSnapshot } from "@otta-sh/domain";
/** HUB-3A v6 (September 2022): fourteen UTF-8 fields, each terminated by LF. */
export function buildHub3Payload(input: BankTransferSnapshot): string {
	const s = freezeBankTransferSnapshot(input),
		p = s.payer,
		r = s.recipient;
	return (
		[
			"HRVHUB30",
			"EUR",
			String(s.amountCents).padStart(15, "0"),
			bankText(p?.name ?? "", 30),
			bankText(p?.line1 ?? "", 27),
			bankText(p ? `${p.postalCode} ${p.city}` : "", 27),
			bankText(r.name, 25),
			bankText(r.address, 25),
			bankText(r.city, 27),
			r.iban,
			r.model,
			s.reference,
			r.purpose,
			s.description,
		].join("\n") + "\n"
	);
}

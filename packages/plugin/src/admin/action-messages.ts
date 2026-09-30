import type { PluginMessage } from "./messages.js";

/** Authored action outcomes only; native records and provider diagnostics are never translated. */
export const CROATIAN_PLUGIN_ACTION_MESSAGES: Readonly<Record<string, PluginMessage>> = {
	"That action could not be read": "Radnju nije moguće pročitati",
	"Nothing was changed. Reload the order and try again.":
		"Ništa nije promijenjeno. Ponovno učitajte narudžbu i pokušajte opet.",
	"Nothing was changed": "Ništa nije promijenjeno",
	"This order could not be re-checked before the status change, so nothing was applied. Reload and try again.":
		"Narudžbu nije moguće provjeriti prije promjene statusa, pa ništa nije primijenjeno. Ponovno učitajte i pokušajte opet.",
	"The order changed — nothing was applied": "Narudžba je promijenjena — ništa nije primijenjeno",
	"It was {observedState} when you started and is now {state}. Check the order below before changing its status.":
		"Na početku je bila {observedState}, a sada je {state}. Provjerite narudžbu prije promjene statusa.",
	"Status change failed": "Promjena statusa nije uspjela",
	"That status change could not be applied — check the order state, then retry in a moment.":
		"Promjena statusa nije primijenjena. Provjerite stanje narudžbe pa pokušajte ponovno.",
	"No change": "Bez promjene",
	"The order is already in that state.": "Narudžba je već u tom stanju.",
	"Note not added": "Bilješka nije dodana",
	"Enter both an author and a note body.": "Unesite autora i tekst bilješke.",
	"That note could not be saved — check the order, then retry in a moment.":
		"Bilješka nije spremljena. Provjerite narudžbu pa pokušajte ponovno.",
	"Already added": "Već dodano",
	"That exact note is already on this order.": "Ta je bilješka već na ovoj narudžbi.",
	"Not resolved": "Nije riješeno",
	"Enter both a reason and who is resolving it.": "Unesite razlog i osobu koja rješava slučaj.",
	"The reconciliation state changed — reload":
		"Stanje usklađivanja je promijenjeno — učitajte ponovno",
	"A new anomaly was flagged on this order after you opened it. Nothing was cleared. Review the flag shown below and resolve again.":
		"Nakon otvaranja narudžbe označena je nova nepravilnost. Ništa nije uklonjeno. Provjerite oznaku i ponovno riješite slučaj.",
	"That reconciliation could not be resolved — check the order, then retry in a moment.":
		"Usklađivanje nije riješeno. Provjerite narudžbu pa pokušajte ponovno.",
	"Already resolved": "Već riješeno",
	"This order's reconciliation flag was already cleared.":
		"Oznaka usklađivanja na ovoj narudžbi već je uklonjena.",
	"Reconciliation resolved": "Usklađivanje riješeno",
	"The flag is cleared and your disposition was recorded.":
		"Oznaka je uklonjena i vaš je ishod zabilježen.",
	"Not shipped": "Nije otpremljeno",
	"Enter the carrier, tracking number, and who is recording it.":
		"Unesite prijevoznika, broj za praćenje i osobu koja bilježi otpremu.",
	"The tracking URL must be a web link starting with http:// or https://.":
		"Poveznica za praćenje mora počinjati s http:// ili https://.",
	"Order can’t be shipped right now": "Narudžbu trenutačno nije moguće otpremiti",
	"This order is no longer “processing” — it may have shipped or been cancelled. Reload and check its status.":
		"Narudžba više nije u obradi; možda je otpremljena ili otkazana. Ponovno učitajte i provjerite status.",
	"That fulfilment could not be recorded — check the order, then retry in a moment.":
		"Otprema nije zabilježena. Provjerite narudžbu pa pokušajte ponovno.",
	"Already shipped": "Već otpremljeno",
	"This order was already shipped; its recorded tracking is shown above.":
		"Narudžba je već otpremljena; zabilježeni podaci za praćenje prikazani su iznad.",
	"Order shipped": "Narudžba otpremljena",
	"Fulfilment recorded — the buyer has been emailed their tracking.":
		"Otprema je zabilježena; kupcu su poslani podaci za praćenje.",
	"Nothing was cancelled": "Ništa nije otkazano",
	"This order could not be re-checked before cancelling, so nothing was applied. Reload and try again.":
		"Narudžbu nije moguće provjeriti prije otkazivanja, pa ništa nije primijenjeno. Ponovno učitajte i pokušajte opet.",
	"The order changed — nothing was cancelled": "Narudžba je promijenjena — ništa nije otkazano",
	"It was {observedState} when you started and is now {state} — someone else moved it since you started. Check the order below, then cancel again if you still want to.":
		"Na početku je bila {observedState}, a sada je {state}; netko je promijenio stanje. Provjerite narudžbu pa je otkažite ako i dalje želite.",
	"Order can’t be cancelled right now": "Narudžbu trenutačno nije moguće otkazati",
	"This order can no longer be cancelled — it may have shipped, or been cancelled without a reason on file. Reload and check its status.":
		"Narudžbu više nije moguće otkazati; možda je otpremljena ili već otkazana bez zabilježenog razloga. Ponovno učitajte i provjerite status.",
	"Not cancelled": "Nije otkazano",
	"That cancellation could not be recorded — check the order, then retry in a moment.":
		"Otkazivanje nije zabilježeno. Provjerite narudžbu pa pokušajte ponovno.",
	"Already cancelled": "Već otkazano",
	"This order was already cancelled; its recorded reason is shown above.":
		"Narudžba je već otkazana; zabilježeni razlog prikazan je iznad.",
	"Order cancelled": "Narudžba otkazana",
	"The cancellation was recorded and the buyer has been emailed.":
		"Otkazivanje je zabilježeno i kupac je obaviješten e-poštom.",
	"The refund ledger changed — nothing was refunded":
		"Evidencija povrata je promijenjena — ništa nije vraćeno",
	"{amount} was staged and was not recorded — someone else refunded this order since you started. {remaining} now remains refundable; re-enter an amount below to try again.":
		"Iznos {amount} nije zabilježen; netko je u međuvremenu izvršio povrat za ovu narudžbu. Preostalo za povrat: {remaining}. Ponovno unesite iznos.",
	"Nothing was refunded": "Ništa nije vraćeno",
	"The refund ledger could not be re-checked, so nothing was applied. Reload and try again.":
		"Evidenciju povrata nije moguće provjeriti, pa ništa nije primijenjeno. Ponovno učitajte i pokušajte opet.",
	"Already refunded": "Već vraćeno",
	"This refund was already recorded (a duplicate submission); the ledger above is unchanged.":
		"Povrat je već zabilježen (ponovljeni zahtjev); evidencija iznad ostaje ista.",
	"Refund complete": "Povrat dovršen",
	"The refund was recorded and the order is now fully refunded — the buyer has been emailed.":
		"Povrat je zabilježen i narudžba je potpuno vraćena; kupac je obaviješten e-poštom.",
	"Refund recorded": "Povrat zabilježen",
	"The refund was recorded. The order stays in its current status; Money → Refunds shows what remains.":
		"Povrat je zabilježen. Status narudžbe ostaje isti; Novac → Povrati prikazuje preostali iznos.",
	"Amount too high": "Iznos je previsok",
	"That is more than the remaining refundable amount for this order. Reload to see the current remaining total.":
		"Iznos je veći od preostalog iznosa za povrat. Ponovno učitajte da vidite trenutačni ostatak.",
	"Provider already refunded": "Pružatelj je već izvršio povrat",
	"Your payment provider shows this order already refunded (possibly from its dashboard). Nothing was issued — reconcile the provider before trying again.":
		"Pružatelj plaćanja prikazuje povrat za ovu narudžbu, možda izvršen u njegovu sučelju. Ništa nije izdano; uskladite podatke prije ponovnog pokušaja.",
	"Temporary problem": "Privremeni problem",
	"The payment provider could not be reached. Nothing was refunded — try again in a moment.":
		"Pružatelj plaćanja nije dostupan. Ništa nije vraćeno; pokušajte ponovno za trenutak.",
	"Refund rejected": "Povrat odbijen",
	"The payment provider rejected this refund. Check the order in your provider dashboard.":
		"Pružatelj plaćanja odbio je povrat. Provjerite narudžbu u njegovu sučelju.",
	"Refund status unknown": "Status povrata nije poznat",
	"The refund request timed out and its outcome is unknown. Do NOT retry — check your provider dashboard first, then reconcile.":
		"Zahtjev za povrat je istekao, a ishod nije poznat. Nemojte ponavljati zahtjev; prvo provjerite sučelje pružatelja pa uskladite podatke.",
	"Refund awaiting completion": "Povrat čeka dovršetak",
	"The payment provider accepted the refund, but it is pending or requires customer action. Check your provider dashboard. Its amount remains reserved; do not issue it again.":
		"Pružatelj je prihvatio povrat, ali on još čeka dovršetak ili radnju kupca. Provjerite sučelje pružatelja. Iznos ostaje rezerviran; nemojte ponovno izdati povrat.",
	"Not refunded": "Nije vraćeno",
	"This request's key was already used for a different refund, so nothing was refunded. Reload to see the current ledger, then try again.":
		"Ključ zahtjeva već je upotrijebljen za drugi povrat, pa ništa nije vraćeno. Ponovno učitajte evidenciju pa pokušajte opet.",
	"The refund currency does not match the order. Reload and try again.":
		"Valuta povrata ne odgovara narudžbi. Ponovno učitajte i pokušajte opet.",
	"That refund could not be processed — check the order, then retry in a moment.":
		"Povrat nije obrađen. Provjerite narudžbu pa pokušajte ponovno.",
	"Order changed — reload": "Narudžba je promijenjena — učitajte ponovno",
	"Review the current order before accepting it for dispatch.":
		"Provjerite trenutačnu narudžbu prije prihvaćanja za otpremu.",
	"COD accepted for dispatch": "Pouzeće prihvaćeno za otpremu",
	"COD already accepted": "Pouzeće je već prihvaćeno",
	"Stock is committed. Payment remains unpaid until a receipt is recorded.":
		"Zaliha je potvrđena. Plaćanje ostaje neplaćeno dok se ne zabilježi potvrda.",
	"COD not accepted": "Pouzeće nije prihvaćeno",
	"Only a pending physical COD order within its deadline can be accepted. Reload and review its status.":
		"Može se prihvatiti samo fizička narudžba s pouzećem na čekanju unutar roka. Ponovno učitajte i provjerite status.",
	"Receipt not recorded": "Potvrda nije zabilježena",
	"Enter a receipt reference (at most 100 characters), exact amount in minor units, currency, and recorder.":
		"Unesite oznaku potvrde (do 100 znakova), točan iznos u najmanjim jedinicama, valutu i osobu koja bilježi uplatu.",
	"Review the current order and receipt before recording payment.":
		"Provjerite trenutačnu narudžbu i potvrdu prije bilježenja plaćanja.",
	"Payment receipt recorded": "Potvrda plaćanja zabilježena",
	"Receipt already recorded": "Potvrda je već zabilježena",
	"The frozen order amount is captured once. Fulfillment status is preserved for accepted COD.":
		"Izvorni iznos narudžbe naplaćuje se jednom. Za prihvaćeno pouzeće status otpreme ostaje isti.",
	"The receipt amount and currency must exactly match the frozen order total.":
		"Iznos i valuta potvrde moraju točno odgovarati izvornom iznosu narudžbe.",
	"That receipt or command key is already bound. Review the existing receipt before retrying.":
		"Potvrda ili ključ naredbe već su povezani. Provjerite postojeću potvrdu prije ponovnog pokušaja.",
	"The order is not payable automatically. Check its deadline/status and use manual reconciliation for a late or cancelled-order receipt.":
		"Narudžbu nije moguće automatski naplatiti. Provjerite rok i status; zakašnjele uplate ili uplate za otkazane narudžbe uskladite ručno.",
	"Not changed": "Nije promijenjeno",
	"That action could not be read — nothing was changed. Reload the product and try again.":
		"Radnju nije moguće pročitati; ništa nije promijenjeno. Ponovno učitajte proizvod i pokušajte opet.",
	"Choose whether prices include tax.": "Odaberite uključuju li cijene porez.",
	"Price must be a positive amount like 19.99 (up to two decimal places).":
		"Cijena mora biti pozitivan iznos poput 19.99 (do dvije decimale).",
	"Currency must be a 3-letter ISO-4217 code like USD.":
		"Valuta mora biti troslovni ISO-4217 kod, npr. USD.",
	"{value} must be a positive amount like 29.99, or blank to clear.":
		"{value} mora biti pozitivan iznos poput 29.99; ostavite prazno za uklanjanje.",
	"Compare-at price": "Usporedna cijena",
	"Unit cost": "Jedinični trošak",
	"Set the product's price and currency before adding a compare-at price or unit cost.":
		"Postavite cijenu i valutu proizvoda prije usporedne cijene ili jediničnog troška.",
	"{field} must be a non-negative whole number.":
		"Polje {field} mora biti nenegativni cijeli broj.",
	"{field} is too large.": "Vrijednost polja {field} je prevelika.",
	"Check the highlighted value": "Provjerite označenu vrijednost",
	Saved: "Spremljeno",
	"The product's commerce fields were updated.": "Trgovinska polja proizvoda su ažurirana.",
	"This product changed since you opened it": "Proizvod je promijenjen nakon otvaranja",
	"Your edit was NOT applied — the latest values are shown below. Re-apply your changes and save again.":
		"Izmjena nije primijenjena; ispod su najnovije vrijednosti. Ponovno unesite promjene i spremite.",
	"Currency cannot be changed here": "Valutu ovdje nije moguće promijeniti",
	"This product is priced in {value}. A price edit keeps the same currency; re-currencying a product is not supported on this page.":
		"Valuta cijene proizvoda: {value}. Izmjena cijene zadržava valutu; promjena valute na ovoj stranici nije podržana.",
	"its existing currency": "postojeća valuta",
	"SKU already in use": "SKU je već u upotrebi",
	'SKU "{value}" is already used by another live product. Choose a different SKU.':
		'SKU "{value}" već upotrebljava drugi aktivni proizvod. Odaberite drugi SKU.',
	"That SKU already has stock of its own": "Taj SKU već ima vlastitu zalihu",
	"this product's SKU": "SKU ovog proizvoda",
	"the SKU you asked for": "traženi SKU",
	"this SKU": "ovaj SKU",
	"Nothing was changed. Stock is never merged between SKUs, and {to} already has its own inventory record — so {from} was not renamed onto it. Rename to a SKU that has never held stock, or move the units under {to2} elsewhere first.":
		"Ništa nije promijenjeno. Zalihe se ne spajaju između SKU-ova. {to} već ima zalihu, pa {from} nije preimenovan. Odaberite SKU bez povijesti zalihe ili prvo premjestite jedinice za {to2}.",
	"This SKU has reservations in flight": "Ovaj SKU ima aktivne rezervacije",
	"live reservations still hold units of {held}":
		"aktivne rezervacije i dalje drže jedinice za {held}",
	"1 live reservation still holds units of {held}":
		"1 aktivna rezervacija i dalje drži jedinice za {held}",
	"{count} live reservations still hold units of {held}": {
		one: "{count} aktivna rezervacija i dalje drži jedinice za {held}",
		few: "{count} aktivne rezervacije i dalje drže jedinice za {held}",
		other: "{count} aktivnih rezervacija i dalje drži jedinice za {held}",
	},
	"Nothing was changed: {holds}, and a reservation cannot follow a rename — its units would return to the old SKU when the cart or order finishes. Try the rename again once {settled} been paid, cancelled or expired, usually a few minutes.":
		"Ništa nije promijenjeno: {holds}. Rezervacija ne može pratiti preimenovanje jer bi se jedinice vratile starom SKU-u. Pokušajte nakon plaćanja, otkazivanja ili isteka rezervacija, obično za nekoliko minuta.",
	"Invalid value": "Neispravna vrijednost",
	'The field "{value}" is out of range — price must be greater than zero and measurements must be non-negative whole numbers.':
		'Polje "{value}" je izvan raspona. Cijena mora biti veća od nule, a mjere nenegativni cijeli brojevi.',
	input: "unos",
	"Product not found": "Proizvod nije pronađen",
	"This product no longer exists — it may have been deleted in the CMS.":
		"Proizvod više ne postoji; možda je obrisan u CMS-u.",
	"Save failed": "Spremanje nije uspjelo",
	"The change could not be saved — retry in a moment.":
		"Promjena nije spremljena. Pokušajte ponovno za trenutak.",
	"Stock changed — nothing was removed": "Zaliha je promijenjena — ništa nije uklonjeno",
	"This SKU no longer has an inventory record, so there is no count to remove from. Reload the product to see it as it stands now.":
		"Ovaj SKU više nema zapis zalihe, pa nema količine za uklanjanje. Ponovno učitajte proizvod za trenutačno stanje.",
	"Stock on hand changed since you started — {liveOnHand} {unit} on hand now. Re-enter the amount below to try again.":
		{
			one: "Zaliha se promijenila; sada je dostupna {liveOnHand} jedinica. Ponovno unesite količinu za novi pokušaj.",
			few: "Zaliha se promijenila; sada su dostupne {liveOnHand} jedinice. Ponovno unesite količinu za novi pokušaj.",
			other:
				"Zaliha se promijenila; sada je dostupno {liveOnHand} jedinica. Ponovno unesite količinu za novi pokušaj.",
		},
	"Stock added": "Zaliha dodana",
	"Added {qty} {value}. This movement recorded available stock of {onHand}; the refreshed product shows the current count.":
		{
			one: "Dodano {qty} jedinica. Zabilježena dostupna zaliha: {onHand}; osvježeni proizvod prikazuje trenutačnu količinu.",
			few: "Dodano {qty} jedinice. Zabilježena dostupna zaliha: {onHand}; osvježeni proizvod prikazuje trenutačnu količinu.",
			other:
				"Dodano {qty} jedinica. Zabilježena dostupna zaliha: {onHand}; osvježeni proizvod prikazuje trenutačnu količinu.",
		},
	"Stock removed": "Zaliha uklonjena",
	"Removed {qty} {value}. This movement recorded available stock of {onHand}; the refreshed product shows the current count.":
		{
			one: "Uklonjeno {qty} jedinica. Zabilježena dostupna zaliha: {onHand}; osvježeni proizvod prikazuje trenutačnu količinu.",
			few: "Uklonjeno {qty} jedinice. Zabilježena dostupna zaliha: {onHand}; osvježeni proizvod prikazuje trenutačnu količinu.",
			other:
				"Uklonjeno {qty} jedinica. Zabilježena dostupna zaliha: {onHand}; osvježeni proizvod prikazuje trenutačnu količinu.",
		},
	"Not enough stock to remove": "Nema dovoljno zalihe za uklanjanje",
	"Only {onHand} {value} on hand — you cannot remove {qty}.": {
		one: "Dostupna je samo {onHand} jedinica; nije moguće ukloniti {qty}.",
		few: "Dostupne su samo {onHand} jedinice; nije moguće ukloniti {qty}.",
		other: "Dostupno je samo {onHand} jedinica; nije moguće ukloniti {qty}.",
	},
	"Nothing was removed": "Ništa nije uklonjeno",
	"Stock could not be re-checked, so nothing was applied. Reload and try again.":
		"Zalihu nije moguće provjeriti, pa ništa nije primijenjeno. Ponovno učitajte i pokušajte opet.",
	"No SKU set": "SKU nije postavljen",
	"This product has no SKU yet, so it has no stock to manage. Set a SKU on Identity above first.":
		"Proizvod još nema SKU, pa nema zalihu za upravljanje. Prvo postavite SKU u odjeljku Identitet.",
	"No stock record yet": "Još nema zapisa zalihe",
	"This product has a SKU but no stock record, so there is nothing to add to or remove from. Re-save the SKU on Identity above to create one.":
		"Proizvod ima SKU, ali nema zapis zalihe. Ponovno spremite SKU u odjeljku Identitet da ga izradite.",
	"Invalid quantity": "Neispravna količina",
	"Enter a whole number of units": "Unesite cijeli broj jedinica",
	"Units to add must be a positive whole number, like 12.":
		"Broj jedinica za dodavanje mora biti pozitivan cijeli broj, npr. 12.",
	"Enter a positive whole number of units to add.":
		"Unesite pozitivan cijeli broj jedinica za dodavanje.",
	"The quantity must be a positive whole number.": "Količina mora biti pozitivan cijeli broj.",
	"Stock change failed": "Promjena zalihe nije uspjela",
	"Variant not saved": "Varijanta nije spremljena",
	"Enter a SKU or a positive whole price in minor units with its 3-letter currency. Leave an unset price blank.":
		"Unesite SKU ili pozitivnu cijenu u najmanjim jedinicama i troslovnu valutu. Nepostavljenu cijenu ostavite praznu.",
	"Variant saved": "Varijanta spremljena",
	"The declared variant's SKU and price were saved. Its CMS key and name are unchanged.":
		"SKU i cijena varijante spremljeni su. Njezin CMS ključ i naziv ostaju isti.",
	"This variant is missing, orphaned, or belongs to another product. Restore its declaration in the CMS before editing it.":
		"Varijanta nedostaje, nema roditelja ili pripada drugom proizvodu. Prije uređivanja vratite njezinu deklaraciju u CMS-u.",
	"This variant changed after you opened it. Reload and review its current values before saving again.":
		"Varijanta je promijenjena nakon otvaranja. Ponovno učitajte i provjerite trenutačne vrijednosti prije spremanja.",
	"The variant currency must match its existing currency and the product currency.":
		"Valuta varijante mora odgovarati postojećoj valuti i valuti proizvoda.",
	"Check the SKU, positive integer price and currency before saving again.":
		"Prije ponovnog spremanja provjerite SKU, pozitivnu cijenu u cijelim jedinicama i valutu.",
	"That SKU already belongs to another sellable product or variant.":
		"SKU već pripada drugom proizvodu ili varijanti za prodaju.",
	"The target SKU already has stock. Choose an unused SKU; stock is never merged during a rename.":
		"Traženi SKU već ima zalihu. Odaberite nekorišteni SKU; preimenovanje ne spaja zalihe.",
	"This SKU has held stock in live carts or orders. Wait for those holds to finish before renaming it.":
		"Ovaj SKU ima rezerviranu zalihu u aktivnim košaricama ili narudžbama. Pričekajte završetak rezervacija prije preimenovanja.",
	"Variant stock added": "Zaliha varijante dodana",
	"Variant stock removed": "Zaliha varijante uklonjena",
	"This movement recorded available stock of {onHand}. The refreshed variant shows the current count. Existing held units are preserved.":
		"Zabilježena dostupna zaliha: {onHand}. Osvježena varijanta prikazuje trenutačnu količinu. Rezervirane jedinice ostaju sačuvane.",
	"Variant stock not changed": "Zaliha varijante nije promijenjena",
	"The variant or available count changed. Reload and review before submitting another movement.":
		"Varijanta ili dostupna količina su promijenjene. Ponovno učitajte i provjerite prije nove promjene zalihe.",
	"That command identity already belongs to another SKU, quantity or stock operation. Retry the original command unchanged or start a new confirmed movement.":
		"Identitet naredbe već pripada drugom SKU-u, količini ili radnji zalihe. Ponovite izvornu naredbu bez izmjene ili potvrdite novu promjenu.",
	"Only available units can be removed. The requested quantity exceeds available stock; held units are protected.":
		"Mogu se ukloniti samo dostupne jedinice. Tražena količina premašuje zalihu; rezervirane jedinice ostaju zaštićene.",
	"A live declared variant with a SKU and stock record is required. Missing, orphaned and deleted variants cannot be changed here.":
		"Potrebna je aktivna deklarirana varijanta sa SKU-om i zapisom zalihe. Ovdje nije moguće mijenjati varijante koje nedostaju, nemaju roditelja ili su obrisane.",
};

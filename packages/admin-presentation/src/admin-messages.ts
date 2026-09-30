import { normalizeAdminLocale } from "./locale.js";

/** Authored interface messages only. Content and provider records never enter this dictionary. */
export const ADMIN_MESSAGES_HR = {
	"{subject} (HTTP {status})": "{subject} (HTTP {status})",
	"The request never completed{detail}. Check that you are online, then reload.":
		"Zahtjev nije dovršen{detail}. Provjerite internetsku vezu pa ponovno učitajte stranicu.",
	"Settlement flagged this order: {flag}. Resolve it under Fulfilment — recording a resolution moves no money and does not change the order.":
		"Obračun je označio ovu narudžbu: {flag}. Uskladite je u odjeljku Isporuka — bilježenje odluke ne prenosi novac i ne mijenja narudžbu.",
	"Order shipped": "Narudžba poslana",
	"Fulfilment recorded — the buyer has been emailed their tracking.":
		"Isporuka je zabilježena — kupcu je poslano praćenje pošiljke.",
	"CMS key": "CMS ključ",
	"This link's page could not be opened": "Stranica s ove poveznice nije se mogla otvoriti",
	"Showing the first page of these filters instead. Whether that page is gone or the request simply failed, the answer that came back does not say.":
		"Prikazuje se prva stranica za ove filtre. Odgovor ne otkriva je li tražena stranica nestala ili zahtjev nije uspio.",
	"Paging stopped here": "Listanje je zaustavljeno",
	"The rows already on screen are unaffected; the page that was asked for could not be opened. Refresh re-reads the pages on screen and can restart paging from there; a filter or a reload starts again.":
		"Prikazani redci su nepromijenjeni; tražena stranica nije se mogla otvoriti. Osvježavanje ponovno čita prikazane stranice i može nastaviti listanje; filtar ili ponovno učitavanje počinju iznova.",
	"Re-reads every page on screen. Rows that are no longer in the list stop being shown.":
		"Ponovno čita sve prikazane stranice. Redci kojih više nema na popisu uklanjaju se iz prikaza.",
	"Available once the read already in flight has answered.":
		"Dostupno nakon dovršetka trenutačnog zahtjeva.",
	"This list could not be refreshed": "Popis nije moguće osvježiti",
	"Nothing on screen has changed — these rows are still the last answer that arrived.":
		"Prikaz je nepromijenjen — ovi redci potječu iz posljednjeg uspješnog odgovora.",
	"The page this list opens on could not be re-opened.":
		"Početna stranica ovog popisa nije se mogla ponovno otvoriti.",
	"Only part of this list was refreshed": "Osvježen je samo dio popisa",
	"The pages shown were re-read and are current. The ones after them could not be, so they are no longer shown — Load more gathers them again.":
		"Prikazane stranice ponovno su pročitane i aktualne. Sljedeće stranice nisu se mogle pročitati i uklonjene su iz prikaza — Učitaj još ponovno ih dohvaća.",
	"This list came back shorter, and paging has stopped":
		"Popis je kraći i listanje je zaustavljeno",
	"The pages shown were re-read and are current. The page after them would not open, so it is not shown and there is no way on from here. Refresh again to re-read the list and restart paging.":
		"Prikazane stranice ponovno su pročitane i aktualne. Sljedeća se stranica nije mogla otvoriti pa nema nastavka listanja. Ponovno osvježite popis za nastavak.",
	"Your session is no longer valid — it may have expired or been signed out in another tab. Reload this page to sign in again.":
		"Sesija više nije valjana — možda je istekla ili ste odjavljeni u drugoj kartici. Ponovno učitajte stranicu i prijavite se.",
	"Your account is signed in but is not allowed to manage plugins. Ask an administrator to grant the plugins:manage permission, then reload.":
		"Prijavljeni ste, ali nemate ovlast za upravljanje dodacima. Zatražite od administratora ovlast plugins:manage pa ponovno učitajte stranicu.",
	"The admin service answered with an error. Reload to try again; if it persists this is a fault in the console or the commerce service, not your data.":
		"Administracija je vratila pogrešku. Ponovno učitajte stranicu; ako se problem nastavi, uzrok je u administraciji ili trgovini, a ne u vašim podacima.",
	"The console sent a request this admin would not accept. Reload the page; if it happens again, this is a fault in the console itself.":
		"Administracija je odbila zahtjev ovog prikaza. Ponovno učitajte stranicu; ako se problem ponovi, uzrok je u administraciji.",
	"Orders are unavailable": "Narudžbe nisu dostupne",
	"The admin could not be reached": "Administracija nije dostupna",
	"The admin sent something this screen could not read":
		"Odgovor administracije nije moguće pročitati",
	"The response did not have the shape this screen expects. Reload the page; if it happens again, this is a fault in the console itself.":
		"Odgovor nema očekivani oblik. Ponovno učitajte stranicu; ako se problem ponovi, uzrok je u administraciji.",
	"Any time": "Cijelo razdoblje",
	"All statuses": "Svi statusi",
	"All kinds": "Sve vrste",
	"Custom range": "Odabrano razdoblje",
	From: "Od",
	To: "Do",
	Placed: "Naručeno",
	Products: "Proizvodi",
	"Order #": "Narudžba #",
	"Provider ref": "Referenca pružatelja",
	By: "Osoba",
	"The remaining refund capacity is reserved for refunds awaiting completion or reconciliation. Check your payment provider before issuing another refund.":
		"Preostali iznos rezerviran je za povrate koji čekaju dovršetak ili usklađivanje. Prije novog povrata provjerite pružatelja plaćanja.",
	"Refunds totalling {amount} have an unknown outcome — check your payment provider before refunding again. The amount stays reserved on this order until it is reconciled; match it in the provider by its idempotency key below.":
		"Ishod povrata od ukupno {amount} nije poznat — provjerite pružatelja plaćanja prije novog povrata. Iznos ostaje rezerviran do usklađivanja; pronađite ga kod pružatelja prema ključu idempotentnosti ispod.",
	"The remaining refundable amount is": "Preostali iznos za povrat je",
	Method: "Način",
	"Payment deadline": "Rok uplate",
	Reference: "Referenca",
	Receipt: "Primitak",
	Accept: "Prihvati",
	"Go back": "Natrag",
	"Record receipt": "Zabilježi primitak",
	"Yes, refund {amount}": "Da, vrati {amount}",
	"Order ·": "Narudžba ·",
	Payment: "Plaćanje",
	"Order ID": "ID narudžbe",
	Totals: "Ukupni iznosi",
	"Contact email": "Kontaktna e-pošta",
	"Email verified": "E-pošta potvrđena",
	"not verified": "nije potvrđena",
	"Address line 1": "Adresa",
	"Address line 2": "Dodatak adresi",
	Shipped: "Poslano",
	"Choose a reason…": "Odaberite razlog…",
	Timeline: "Povijest događaja",
	Event: "Događaj",
	"Stock command not sent": "Nalog za zalihu nije poslan",
	"Your browser could not retain this stock command for safe retry. Enable session storage, then confirm the movement again.":
		"Preglednik nije mogao sačuvati nalog za siguran ponovni pokušaj. Omogućite pohranu sesije pa ponovno potvrdite promjenu.",
	"Stock movement awaiting its result": "Čeka se rezultat promjene zalihe",
	"This command may already have changed stock. Retry it to recover its recorded outcome before starting another movement.":
		"Ovaj je nalog možda već promijenio zalihu. Ponovite ga za dohvat zabilježenog ishoda prije nove promjene.",
	"Retry stock movement": "Ponovi promjenu zalihe",
	Variants: "Varijante",
	"Price tax mode": "Porez na cijenu",
	"Tax added at checkout": "Porez se dodaje pri naplati",
	"Price includes tax": "Cijena uključuje porez",
	"Remove stock": "Ukloni zalihu",
	"Deleted on {date}. It cannot be edited or restocked from here; existing orders that included it are unaffected.":
		"Izbrisano {date}. Ovdje se ne može uređivati ni dodavati zaliha; postojeće narudžbe koje ga sadrže su nepromijenjene.",
	"Save a SKU to create the variant's stock record before adding stock.":
		"Spremite SKU za stvaranje zapisa zalihe varijante prije dodavanja zalihe.",
	"full order id": "cijeli ID narudžbe",
	"Press ⌘C": "Pritisnite ⌘C",
	"Copy {what} {id}": "Kopiraj {what} {id}",
	Filters: "Filtri",
	"Filters ({count} active)": "Filtri ({count} aktivnih)",
	"Customer — {reference}": "Kupac — {reference}",
	"Shipping address — {country}": "Adresa dostave — {country}",
	"Customer requested it": "Na zahtjev kupca",
	"Fraud suspected": "Sumnja na prijevaru",
	"Pricing error": "Pogrešna cijena",
	Language: "Jezik",
	Orders: "Narudžbe",
	Order: "Narudžba",
	"Order #{id}": "Narudžba #{id}",
	"Pricing & inventory": "Cijene i zalihe",
	Product: "Proizvod",
	Stock: "Zalihe",
	Fulfilment: "Isporuka",
	Money: "Plaćanja",
	History: "Povijest",
	"Order sections": "Odjeljci narudžbe",
	"Product sections": "Odjeljci proizvoda",
	"← Back to orders": "← Natrag na narudžbe",
	"← Back to pricing & inventory": "← Natrag na cijene i zalihe",
	Retry: "Pokušaj ponovno",
	"Retrying…": "Ponovni pokušaj…",
	Reload: "Ponovno učitaj",
	Refresh: "Osvježi",
	"Refreshing…": "Osvježavanje…",
	"Loading…": "Učitavanje…",
	"Loading orders…": "Učitavanje narudžbi…",
	"Loading product…": "Učitavanje proizvoda…",
	"Loading products…": "Učitavanje proizvoda…",
	"Loading order…": "Učitavanje narudžbe…",
	"Apply filters": "Primijeni filtre",
	"Clear filters": "Očisti filtre",
	"Load more": "Učitaj još",
	Previous: "Prethodna",
	Next: "Sljedeća",
	Pages: "Stranice",
	"Page {index} of {pages}": "Stranica {index} od {pages}",
	"Pages {index} of {pages}": "Stranice {index} od {pages}",
	"on this page": "na ovoj stranici",
	"loaded so far": "dosad učitano",
	"Load more scans further.": "Učitaj još za nastavak pretrage.",
	"Nothing on this page.": "Na ovoj stranici nema rezultata.",
	"Nothing on this page": "Na ovoj stranici nema rezultata",
	"This page came back empty. The list may have changed since the page before it was loaded — reload the screen to see it as it stands now.":
		"Ova stranica nema rezultata. Popis se možda promijenio od učitavanja prethodne stranice — ponovno učitajte prikaz za trenutačno stanje.",
	"This is the first page.": "Ovo je prva stranica.",
	"There is no page after this one.": "Nema sljedeće stranice.",
	"The page before this one is not known here.": "Prethodna stranica nije poznata u ovom prikazu.",
	"Shows the next page on its own — the pages loaded above are released.":
		"Prikazuje samo sljedeću stranicu — prethodno učitane stranice uklanjaju se iz prikaza.",
	Status: "Status",
	Period: "Razdoblje",
	Customer: "Kupac",
	Created: "Stvoreno",
	Updated: "Ažurirano",
	Total: "Ukupno",
	Any: "Sve",
	"Any status": "Svi statusi",
	"Any kind": "Sve vrste",
	All: "Sve",
	"All time": "Cijelo razdoblje",
	Today: "Danas",
	"Last 7 days": "Posljednjih 7 dana",
	"Last 30 days": "Posljednjih 30 dana",
	Active: "Aktivno",
	Inactive: "Neaktivno",
	Physical: "Fizički",
	Digital: "Digitalni",
	physical: "fizički",
	digital: "digitalni",
	active: "aktivno",
	inactive: "neaktivno",
	deleted: "izbrisano",
	"active (not priced)": "aktivno (bez cijene)",
	pending: "na čekanju",
	paid: "plaćeno",
	failed: "neuspjelo",
	expired: "isteklo",
	processing: "u obradi",
	shipped: "poslano",
	delivered: "dostavljeno",
	completed: "dovršeno",
	cancelled: "otkazano",
	refunded: "refundirano",
	closed: "zatvoreno",
	"Search order ID, buyer email, or exact SKU": "Traži ID narudžbe, e-poštu kupca ili točan SKU",
	"Search (SKU exact, or title contains)": "Traži (točan SKU ili dio naziva)",
	"Filter, open an order, and move it through its status flow. Money in the order's currency; dates UTC.":
		"Filtrirajte i otvorite narudžbu te promijenite njezin status. Iznosi su u valuti narudžbe, datumi u UTC-u.",
	"No orders yet": "Još nema narudžbi",
	"Orders appear here as buyers check out.":
		"Narudžbe se prikazuju ovdje kada kupci završe kupnju.",
	"No orders match these filters": "Nema narudžbi koje odgovaraju filtrima",
	"No orders match these filters.": "Nema narudžbi koje odgovaraju filtrima.",
	"Nothing came back for the filters you set. Clear them to go back to every order, or widen one and apply again.":
		"Nema rezultata za odabrane filtre. Očistite ih za prikaz svih narudžbi ili proširite pretragu i ponovno primijenite filtre.",
	"The orders that were here have been cleared — they were from an earlier request and may no longer be current.":
		"Prethodno prikazane narudžbe uklonjene su — potjecale su iz ranijeg zahtjeva i možda više nisu aktualne.",
	"Couldn't open that page of orders": "Nije moguće otvoriti ovu stranicu narudžbi",
	"Couldn't open that page of products": "Nije moguće otvoriti ovu stranicu proizvoda",
	"Line items": "Stavke narudžbe",
	"Titles and prices are what the buyer paid — later product edits never change them.":
		"Nazivi i cijene odgovaraju trenutku kupnje — kasnije izmjene proizvoda ne mijenjaju ih.",
	"No line items.": "Nema stavki narudžbe.",
	Title: "Naziv",
	SKU: "SKU",
	Qty: "Kol.",
	"Unit price": "Jedinična cijena",
	"Line total": "Ukupno za stavku",
	Line: "Stavka",
	Amount: "Iznos",
	Subtotal: "Međuzbroj",
	Discount: "Popust",
	Shipping: "Dostava",
	Tax: "Porez",
	Coupon: "Kupon",
	"Payment method": "Način plaćanja",
	Reconciliation: "Usklađivanje",
	None: "Nema",
	"⚠ Needs reconciliation": "⚠ Potrebno usklađivanje",
	"Needs reconciliation": "Potrebno usklađivanje",
	"Resolved ({outcome})": "Usklađeno ({outcome})",
	Resolved: "Usklađeno",
	Recorded: "Zabilježeno",
	"Resolve reconciliation": "Zabilježi usklađivanje",
	"Recording a resolution logs your decision only — it moves no money and does not change the order. Refund in Money if the buyer is owed one.":
		"Usklađivanje bilježi samo vašu odluku — ne prenosi novac i ne mijenja narudžbu. Ako kupcu pripada povrat, zabilježite ga u odjeljku Plaćanja.",
	Outcome: "Ishod",
	Reason: "Razlog",
	"Reason (optional)": "Razlog (neobavezno)",
	"Resolved by": "Uskladio/la",
	"Record resolution": "Zabilježi usklađivanje",
	"Customer context unavailable — it could not be loaded right now. The order itself is unaffected; reload, and check the admin token in Settings if this persists.":
		"Podaci o kupcu trenutačno nisu dostupni. Narudžba je nepromijenjena; ponovno učitajte prikaz, a ako se problem nastavi, provjerite administratorski token u Postavkama.",
	"Timeline unavailable — it could not be loaded right now. The order itself is unaffected; reload, and check the admin token in Settings if this persists.":
		"Povijest događaja trenutačno nije dostupna. Narudžba je nepromijenjena; ponovno učitajte prikaz, a ako se problem nastavi, provjerite administratorski token u Postavkama.",
	"Refunds are unavailable right now — the refunds service could not be reached. The order itself is unaffected; reload to try again.":
		"Povrati trenutačno nisu dostupni — nije moguće dohvatiti evidenciju povrata. Narudžba je nepromijenjena; ponovno učitajte prikaz.",
	"No shipping address captured — this order predates capture, or is digital-only. The profile book under Order is context only, never where this order shipped.":
		"Adresa dostave nije zabilježena — narudžba je starija ili sadrži samo digitalne proizvode. Adrese u profilu kupca služe samo kao kontekst i nisu adresa dostave ove narudžbe.",
	"No timeline activity yet.": "Još nema događaja u povijesti.",
	"Fulfilment — recorded": "Isporuka — zabilježeno",
	Carrier: "Prijevoznik",
	"Tracking number": "Broj za praćenje",
	"Tracking URL (optional)": "Poveznica za praćenje (neobavezno)",
	"Ship date (optional, UTC)": "Datum slanja (neobavezno, UTC)",
	"Recorded by": "Zabilježio/la",
	"Recorded at": "Vrijeme bilježenja",
	"Shipped at": "Poslano",
	"Record fulfilment & ship": "Zabilježi isporuku i pošalji",
	"e.g. UPS": "npr. UPS",
	"your name": "vaše ime",
	"Tracking URL": "Poveznica za praćenje",
	"Shipping address": "Adresa dostave",
	Name: "Ime",
	Email: "E-pošta",
	Phone: "Telefon",
	Address: "Adresa",
	"Line 1": "Adresa",
	"Line 2": "Dodatak adresi",
	City: "Grad",
	Region: "Regija",
	"Postal code": "Poštanski broj",
	Country: "Država",
	Linkage: "Povezanost",
	"Orders placed": "Broj narudžbi",
	"Recent orders": "Nedavne narudžbe",
	"Address book": "Adresar",
	"Cancel order — permanent, releases held stock":
		"Otkaži narudžbu — trajno, oslobađa rezervirane zalihe",
	"Cancelling is permanent": "Otkazivanje je trajno",
	"Cancelling moves this order to “cancelled”, emails the buyer and releases the held stock. It cannot be undone.":
		"Otkazivanje mijenja status narudžbe u „otkazano”, šalje poruku kupcu i oslobađa rezervirane zalihe. Ne može se poništiti.",
	"Pick the reason — cancelling is immediate.": "Odaberite razlog — otkazivanje je trenutačno.",
	"Cancel this order?": "Otkazati ovu narudžbu?",
	"Yes, cancel the order": "Da, otkaži narudžbu",
	"Keep the order": "Zadrži narudžbu",
	"Cancel this order as “{reason}”? This is permanent — the order cannot be un-cancelled, and the held stock is released.":
		"Otkazati ovu narudžbu zbog „{reason}”? Otkazivanje je trajno — ne može se poništiti i oslobađa rezervirane zalihe.",
	Fraud: "Prijevara",
	"Out of stock": "Nema na zalihi",
	"Customer request": "Zahtjev kupca",
	Duplicate: "Duplikat",
	Other: "Drugo",
	"Cancel with a note": "Otkaži uz bilješku",
	"Detail (optional)": "Obrazloženje (neobavezno)",
	"Cancelled by": "Otkazao/la",
	"Cancelled at": "Vrijeme otkazivanja",
	"Cancel the order": "Otkaži narudžbu",
	"Mark {status}": "Označi kao {status}",
	"Mark this order refunded?": "Označiti ovu narudžbu kao refundiranu?",
	"Marks the order refunded for bookkeeping. It does not move money — record the money in Money → Refunds.":
		"Označava narudžbu kao refundiranu u evidenciji. Ne prenosi novac — povrat novca zabilježite u Plaćanja → Povrati.",
	"Yes, mark refunded": "Da, označi kao refundirano",
	"Keep as is": "Ostavi kako jest",
	"Refunds — nothing captured, nothing to refund": "Povrati — nema primljene uplate za povrat",
	"Refunds — {refunded} of {ceiling} refunded": "Povrati — vraćeno {refunded} od {ceiling}",
	"Fully refunded — nothing left to refund.":
		"Sve je refundirano — nema preostalog iznosa za povrat.",
	"Refunds are additive: recording one twice records two refunds.":
		"Povrati se zbrajaju: dvostruko bilježenje stvara dva povrata.",
	"Review the amount on the next step.": "Provjerite iznos u sljedećem koraku.",
	"Refund a different amount — cannot be reversed": "Vrati drugi iznos — ne može se poništiti",
	"A recorded refund cannot be reversed here": "Zabilježeni povrat ovdje se ne može poništiti",
	"Enter a valid refund amount greater than zero (e.g. 19.99). Nothing was changed.":
		"Unesite valjan iznos povrata veći od nule (npr. 19.99). Ništa nije promijenjeno.",
	"Enter who is issuing or recording this refund. Nothing was changed.":
		"Unesite osobu koja izvršava ili bilježi povrat. Ništa nije promijenjeno.",
	"Amount too high": "Previsok iznos",
	"{amount} is more than the {remaining} that remains refundable on this order. Enter {remaining} or less.":
		"{amount} je više od preostalih {remaining} za povrat na ovoj narudžbi. Unesite {remaining} ili manje.",
	"Nothing was changed.": "Ništa nije promijenjeno.",
	Refunded: "Refundirano",
	Captured: "Primljeno",
	"Remaining refundable": "Preostalo za povrat",
	"Refunds recorded": "Zabilježeni povrati",
	"In progress": "U tijeku",
	"Outcome unknown — check your payment provider":
		"Ishod nepoznat — provjerite pružatelja plaćanja",
	"Pending at payment provider": "Na čekanju kod pružatelja plaćanja",
	"Customer action required": "Potrebna radnja kupca",
	"Provider reference": "Referenca pružatelja",
	"Idempotency key": "Ključ idempotentnosti",
	"Refunded by": "Povrat izvršio/la",
	"Refund this amount": "Vrati ovaj iznos",
	"Refund {amount}?": "Vratiti {amount}?",
	"Refund {amount} (full remaining)": "Vrati {amount} (cijeli preostali iznos)",
	"Refund amount ({currency})": "Iznos povrata ({currency})",
	"e.g. 19.99": "npr. 19.99",
	"this order's buyer": "kupcu ove narudžbe",
	"This sends the money back through Stripe and cannot be reversed.":
		"Ovaj povrat vraća novac putem Stripea i ne može se poništiti.",
	"This records a refund made out of band — it does not move money.":
		"Bilježi povrat izvršen drugim putem — ne prenosi novac.",
	"Order #{id} — refund {amount} to {recipient}? {consequence}":
		"Narudžba #{id} — vratiti {amount} primatelju {recipient}? {consequence}",
	"Paid via {method} — refunding here issues a REAL refund through Stripe and money moves back to the buyer.":
		"Plaćeno putem {method} — povrat ovdje izvršava STVARNI povrat putem Stripea i vraća novac kupcu.",
	"the payment provider": "pružatelja plaćanja",
	"Paid on-chain (x402), which cannot be reversed and has no signing wallet — refunds here are RECORD-ONLY. Send the return yourself, then record it here.":
		"Plaćeno na lancu (x402); uplata se ne može poništiti i nema novčanika za potpisivanje — povrati ovdje služe SAMO ZA EVIDENCIJU. Izvršite povrat pa ga ovdje zabilježite.",
	"Automatic refunds are unavailable for this order — refunds here are RECORD-ONLY. Issue it through your payment provider, then record it here.":
		"Automatski povrati nisu dostupni za ovu narudžbu — ovdje služe SAMO ZA EVIDENCIJU. Izvršite povrat putem pružatelja plaćanja pa ga ovdje zabilježite.",
	"Offline payment": "Plaćanje izvan sustava",
	"Awaiting payment": "Čeka se uplata",
	"Accepted for dispatch — unpaid": "Prihvaćeno za slanje — neplaćeno",
	"Payment received": "Uplata primljena",
	"Receipt reference": "Referenca primitka uplate",
	"Amount (minor units)": "Iznos (u najmanjim jedinicama valute)",
	"Accept COD for dispatch": "Prihvati pouzeće za slanje",
	"Commit the stock and accept this COD order for dispatch. This records no payment.":
		"Potvrdite zalihe i prihvatite narudžbu s pouzećem za slanje. Time se ne bilježi uplata.",
	"Record payment receipt": "Zabilježi primitak uplate",
	"Record witnessed payment for the exact frozen total. Receipt references are globally bound and this order is captured once.":
		"Zabilježite potvrđenu uplatu točnog iznosa narudžbe. Referenca primitka vezana je uz jednu uplatu, a ova narudžba prima uplatu samo jednom.",
	"Bank transfer": "Bankovna uplata",
	"Cash on delivery": "Pouzeće",
	"Payment reference": "Poziv na broj",
	"Payment due": "Rok uplate",
	Instructions: "Upute",
	"Order created": "Narudžba stvorena",
	"Status → {status}": "Status → {status}",
	"Note added": "Bilješka dodana",
	"Fulfilment recorded": "Isporuka zabilježena",
	Cancelled: "Otkazano",
	"Reconciliation resolved": "Usklađivanje zabilježeno",
	When: "Kada",
	What: "Događaj",
	Who: "Osoba",
	Detail: "Detalji",
	"Notes ({count})": "Bilješke ({count})",
	Note: "Bilješka",
	Author: "Autor",
	"Add note": "Dodaj bilješku",
	"Filter and open a product. Money in each product's own currency; On hand is what can be sold now.":
		"Filtrirajte i otvorite proizvod. Iznosi su u valuti proizvoda, a raspoloživa zaliha pokazuje što se sada može prodati.",
	"No products yet": "Još nema proizvoda",
	"Products appear here as soon as a product document is saved in the CMS — pricing them is the next step, not a precondition.":
		"Proizvodi se prikazuju čim se njihov zapis spremi u CMS-u — cijena se postavlja u sljedećem koraku.",
	"No products match these filters": "Nema proizvoda koji odgovaraju filtrima",
	"No products match these filters.": "Nema proizvoda koji odgovaraju filtrima.",
	"Nothing came back for the filters you set. Clear them to go back to the whole catalog, or widen one and apply again.":
		"Nema rezultata za odabrane filtre. Očistite ih za prikaz cijelog kataloga ili proširite pretragu i ponovno ih primijenite.",
	"No products are low on stock": "Nema proizvoda s malom zalihom",
	"No products are at or below the low-stock threshold.":
		"Nema proizvoda na pragu male zalihe ili ispod njega.",
	"No product in the catalog is at or below the low-stock threshold. Clear the filters to see them all, or set the threshold on Settings.":
		"Nijedan proizvod nije na pragu male zalihe ili ispod njega. Očistite filtre za prikaz svih proizvoda ili postavite prag u Postavkama.",
	"Show every product in the catalog at or below the low-stock threshold (set the threshold on Settings).":
		"Prikaži sve proizvode na pragu male zalihe ili ispod njega (prag se postavlja u Postavkama).",
	"Low stock only": "Samo male zalihe",
	"Stock levels are unavailable": "Podaci o zalihama nisu dostupni",
	"low-stock highlighting is unavailable": "označavanje malih zaliha nije dostupno",
	"the Low stock only filter was not applied": "filtar malih zaliha nije primijenjen",
	"On hand reads — for every row here; open a product to read its stock.":
		"Za svaku zalihu prikazuje se —; otvorite proizvod za pregled njegove zalihe.",
	"The store's low-stock threshold could not be read — set it under Checkout & holds on Settings.":
		"Nije moguće dohvatiti prag male zalihe — postavite ga pod Naplata i rezervacije u Postavkama.",
	"The rows below are every product, not just the low-stock ones.":
		"Prikazani su svi proizvodi, uključujući one s dovoljnim zalihama.",
	"Status (set in the CMS)": "Status (postavlja se u CMS-u)",
	"This product was deleted in the CMS — editing and stock moves are unavailable. Restore the document to re-enable them.":
		"Proizvod je izbrisan u CMS-u — uređivanje i promjene zaliha nisu dostupni. Vratite zapis za ponovno omogućavanje.",
	"This product was deleted in the CMS": "Proizvod je izbrisan u CMS-u",
	"Each section saves on its own. Unsaved edits are kept when you switch tabs and when you save another section — leaving this product is what discards them.":
		"Svaki odjeljak sprema se zasebno. Nespremljene izmjene ostaju pri promjeni kartice i spremanju drugog odjeljka — gube se pri napuštanju proizvoda.",
	"SKU is the stock-keeping code the store sells against. The title is set in the CMS.":
		"SKU je oznaka artikla prema kojoj trgovina vodi zalihe i prodaju. Naziv se postavlja u CMS-u.",
	"Price, compare-at and unit cost all use the product's one currency. A blank compare-at or unit cost clears it.":
		"Cijena, prethodna cijena i nabavna cijena koriste valutu proizvoda. Prazna prethodna ili nabavna cijena briše tu vrijednost.",
	"Weight and dimensions feed shipping quotes; blank leaves them unchanged. A blank tax class clears it.":
		"Težina i dimenzije služe izračunu dostave; prazna polja zadržavaju vrijednosti. Prazna porezna kategorija briše postojeću.",
	"On hand is what can be sold right now — open cart holds are already subtracted. Whole units only.":
		"Raspoloživa zaliha pokazuje što se sada može prodati — rezervacije košarica već su oduzete. Samo cijeli komadi.",
	"The store stops selling at zero stock; backorders are a future capability.":
		"Prodaja prestaje kada zaliha dosegne nulu; naručivanje bez zalihe još nije podržano.",
	"Stock movements need a SKU first — set one under Identity on the Product tab.":
		"Promjene zaliha zahtijevaju SKU — postavite ga u Identitet na kartici Proizvod.",
	"This SKU has no inventory record yet. Saving any section on the Product tab creates one, and stock can be added here after that.":
		"Za ovaj SKU još nema zapisa zalihe. Spremite bilo koji odjeljak na kartici Proizvod kako biste ga stvorili, pa ovdje dodajte zalihu.",
	"Low-stock highlighting is unavailable — the threshold could not be read. Set it under Checkout & holds on Settings.":
		"Označavanje malih zaliha nije dostupno — prag nije dohvaćen. Postavite ga pod Naplata i rezervacije u Postavkama.",
	"Add stock": "Dodaj zalihu",
	"Units to add": "Broj komada za dodavanje",
	"Units to remove (damaged / shrinkage)": "Broj komada za uklanjanje (oštećenje / manjak)",
	"Remove stock — permanent, cannot be undone by restocking":
		"Ukloni zalihu — trajno, dodavanje zalihe ne poništava uklanjanje",
	"Removing stock cannot be undone by restocking": "Dodavanje zalihe ne poništava uklanjanje",
	"This records a stock removal — the store treats it as a separate ledger entry.":
		"Bilježi uklanjanje zalihe kao zasebnu stavku evidencije.",
	"Restocking appends a second movement — it does not correct this one. Check the number before confirming.":
		"Dodavanje zalihe stvara drugu promjenu — ne ispravlja ovu. Provjerite količinu prije potvrde.",
	"Enter a whole number of units": "Unesite cijeli broj komada",
	"Units to add must be a positive whole number, like 12.":
		"Broj komada za dodavanje mora biti pozitivan cijeli broj, npr. 12.",
	"Not removed": "Nije uklonjeno",
	"Enter a whole number of units greater than zero, like 3. Nothing was changed.":
		"Unesite cijeli broj komada veći od nule, npr. 3. Ništa nije promijenjeno.",
	"Remove {qty} {unit}?": "Ukloniti {qty} {unit}?",
	"Remove {qty} {unit} from stock? This records a removal and cannot be undone by restocking.":
		"Ukloniti {qty} {unit} sa zalihe? Uklanjanje se bilježi i ne može se poništiti dodavanjem zalihe.",
	"Yes, remove {qty}": "Da, ukloni {qty}",
	"Add {qty} {unit}?": "Dodati {qty} {unit}?",
	"Add {qty} {unit} to {sku}? On hand goes from {before} to {after} and the store can sell them immediately.":
		"Dodati {qty} {unit} za {sku}? Zaliha se mijenja s {before} na {after} i trgovina ih može odmah prodavati.",
	"Yes, add {qty}": "Da, dodaj {qty}",
	"No changes to save.": "Nema izmjena za spremanje.",
	" · unsaved": " · nespremljeno",
	"Saving…": "Spremanje…",
	Discard: "Odbaci",
	"Saving publishes this price to the storefront immediately.":
		"Spremanje odmah objavljuje cijenu u trgovini.",
	Identity: "Identitet",
	Price: "Cijena",
	"Classification & shipping": "Klasifikacija i dostava",
	"{label} — unsaved changes": "{label} — nespremljene izmjene",
	"Leave without saving?": "Napustiti bez spremanja?",
	"Leave and discard": "Napusti i odbaci",
	Stay: "Ostani",
	"This product has unsaved changes.": "Ovaj proizvod ima nespremljene izmjene.",
	"The {section} section has unsaved changes.": "Odjeljak {section} ima nespremljene izmjene.",
	"The {sections} sections have unsaved changes.":
		"Odjeljci {sections} imaju nespremljene izmjene.",
	"Leaving this product discards them.": "Napuštanje proizvoda odbacuje ih.",
	and: "i",
	"Price {change}": "Cijena {change}",
	"Price updated — live on the storefront": "Cijena ažurirana — objavljena u trgovini",
	"Shoppers see the new price now; orders already placed keep the price they were charged.":
		"Kupci sada vide novu cijenu; postojeće narudžbe zadržavaju cijenu pri kupnji.",
	"no SKU": "bez SKU-a",
	"not priced yet": "cijena nije postavljena",
	"no tax class": "bez porezne kategorije",
	"no weight": "bez težine",
	"— None (standard) —": "— Bez kategorije (standardno) —",
	"(untitled)": "(bez naziva)",
	"Pricing & inventory is unavailable": "Cijene i zalihe nisu dostupni",
	"Pricing & inventory could not be loaded. Check the service connection and the admin token in Settings; if both look right, this is a fault in the console itself — not your data.":
		"Nije moguće učitati cijene i zalihe. Provjerite vezu sa servisom i administratorski token u Postavkama; ako su ispravni, problem je u konzoli, a podaci su nepromijenjeni.",
	"Product not found": "Proizvod nije pronađen",
	"This product no longer exists — it may have been deleted in the CMS.":
		"Proizvod više ne postoji — možda je izbrisan u CMS-u.",
	"Stock on hand": "Raspoloživa zaliha",
	"Compare-at": "Prethodna cijena",
	"Unit cost": "Nabavna cijena",
	"Tax class": "Porezna kategorija",
	Kind: "Vrsta",
	"Weight (g)": "Težina (g)",
	"Dimensions (mm, LxWxH)": "Dimenzije (mm, D × Š × V)",
	"On hand": "Raspoloživo",
	"Inventory policy": "Pravila zalihe",
	"Save identity": "Spremi identitet",
	"Save price": "Spremi cijenu",
	"Save classification": "Spremi klasifikaciju",
	"Length (mm)": "Duljina (mm)",
	"Width (mm)": "Širina (mm)",
	"Height (mm)": "Visina (mm)",
	"e.g. 12": "npr. 12",
	"e.g. 3": "npr. 3",
	Low: "Mala zaliha",
	"Deny (stop selling at zero stock)": "Zaustavi prodaju kada nema zalihe",
	"Price ({currency}, e.g. {example})": "Cijena ({currency}, npr. {example})",
	"set currency below": "postavite valutu ispod",
	"Currency (ISO-4217, e.g. USD) — set once when first pricing":
		"Valuta (ISO-4217, npr. USD) — postavlja se pri prvom unosu cijene",
	"Compare-at / was price ({currency}, e.g. {example}) — blank to clear":
		"Prethodna cijena ({currency}, npr. {example}) — prazno za brisanje",
	"same as price": "kao za cijenu",
	"Unit cost — admin only, never shown to buyers ({currency}) — blank to clear":
		"Nabavna cijena — samo za administraciju ({currency}) — prazno za brisanje",
	"Declared variants": "Deklarirane varijante",
	"Declare variant keys and names in the CMS product content. Set each live variant's SKU and price here before selling it.":
		"Ključeve i nazive varijanti postavite u CMS-u. Prije prodaje ovdje postavite SKU i cijenu svake aktivne varijante.",
	"Stock quantity must be a positive whole number.":
		"Količina zalihe mora biti pozitivan cijeli broj.",
	"CMS key:": "CMS ključ:",
	" · Name and key are managed in the CMS.": " · Naziv i ključ uređuju se u CMS-u.",
	"Price:": "Cijena:",
	" · Available stock:": " · Raspoloživa zaliha:",
	Unknown: "Nepoznato",
	"Orphaned — restore this key in the CMS declaration before editing or selling it.":
		"Nedostaje deklaracija — vratite ovaj ključ u CMS prije uređivanja ili prodaje.",
	"The parent product is deleted; variant edits and stock movements are unavailable.":
		"Glavni proizvod je izbrisan; uređivanje varijanti i promjene zaliha nisu dostupni.",
	"Retained stock and existing orders are unchanged.":
		"Postojeće zalihe i narudžbe su nepromijenjene.",
	"SKU for {name}": "SKU za {name}",
	"Price in minor units": "Cijena u najmanjim jedinicama valute",
	"Price in minor units for {name}": "Cijena u najmanjim jedinicama valute za {name}",
	Currency: "Valuta",
	"Currency for {name}": "Valuta za {name}",
	"Use whole minor units, for example 2500 for EUR 25.00. Blank fields preserve their stored values. A variant without a price cannot be purchased.":
		"Koristite cijele najmanje jedinice valute, npr. 2500 za 25,00 EUR. Prazna polja zadržavaju spremljene vrijednosti. Varijanta bez cijene ne može se kupiti.",
	"Save variant": "Spremi varijantu",
	"Stock quantity": "Količina zalihe",
	"Stock quantity for {name}": "Količina zalihe za {name}",
	"Available stock excludes units held by live carts and orders. Movements preserve those holds.":
		"Raspoloživa zaliha ne uključuje komade rezervirane u košaricama i narudžbama. Promjene zaliha čuvaju te rezervacije.",
	"Add variant stock": "Dodaj zalihu varijante",
	"Remove variant stock": "Ukloni zalihu varijante",
	"Save the variant SKU and price before moving its stock.":
		"Spremite SKU i cijenu varijante prije promjene njezine zalihe.",
	Copy: "Kopiraj",
	Copied: "Kopirano",
	"Copy failed": "Kopiranje nije uspjelo",
	"Copy full ID": "Kopiraj cijeli ID",
	"Copy full order ID": "Kopiraj cijeli ID narudžbe",
	"Copy full product ID": "Kopiraj cijeli ID proizvoda",
	"Copy {what}": "Kopiraj {what}",
	"Copied {what}": "Kopirano: {what}",
} as const;

export type AdminMessageKey = keyof typeof ADMIN_MESSAGES_HR;
type Slots<Key extends string> = Key extends `${string}{${infer Slot}}${infer Rest}`
	? Slot | Slots<Rest>
	: never;
export type AdminMessageValues<Key extends AdminMessageKey> = Record<Slots<Key>, string | number>;
export type AdminMessageArgs<Key extends AdminMessageKey> =
	Slots<Key> extends never ? [] : [values: AdminMessageValues<Key>];

/** Named replacement runs once so a user value containing braces remains literal. */
export function adminMessage<Key extends AdminMessageKey>(
	locale: unknown,
	key: Key,
	...args: AdminMessageArgs<Key>
): string {
	const template: string = normalizeAdminLocale(locale) === "hr" ? ADMIN_MESSAGES_HR[key] : key;
	const values = args[0] as Record<string, string | number> | undefined;
	return template.replace(/\{([A-Za-z]+)\}/g, (token, slot: string) =>
		String(values?.[slot] ?? token),
	);
}

/** Use only at explicit authored-copy call sites; unknown copy has stable English fallback. */
export function translateAdminAuthored(locale: unknown, authoredCopy: string): string {
	if (normalizeAdminLocale(locale) !== "hr") return authoredCopy;
	return Object.hasOwn(ADMIN_MESSAGES_HR, authoredCopy)
		? ADMIN_MESSAGES_HR[authoredCopy as AdminMessageKey]
		: authoredCopy;
}

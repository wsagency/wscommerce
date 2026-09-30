export type PluginMessage = string | { one: string; few: string; other: string };

/** Explicit authored Block Kit copy. English source messages are also the fallback dictionary. */
export const CROATIAN_PLUGIN_MESSAGES: Readonly<Record<string, PluginMessage>> = {
	Store: "Trgovina",
	Reports: "Izvještaji",
	Settings: "Postavke",
	Coupons: "Kuponi",
	Tax: "Porez",
	Shipping: "Dostava",
	"Enter both a From and a To date to report on a custom period.":
		"Unesite početni i završni datum za odabrano razdoblje.",
	"Enter both dates as a calendar date, then update the period.":
		"Unesite oba datuma pa ažurirajte razdoblje.",
	"The From date falls after the To date. Swap them, then update again.":
		"Početni datum je nakon završnog. Zamijenite ih pa pokušajte ponovno.",
	"A reporting period covers up to {maxRangeDays} days. Choose a shorter one.":
		"Razdoblje izvještaja može trajati do {maxRangeDays} dana. Odaberite kraće razdoblje.",
	"last {defaultRangeDays} days": "zadnjih {defaultRangeDays} dana",
	"{displayName} — Reports": "{displayName} — Izvještaji",
	"Reports are unavailable": "Izvještaji nisu dostupni",
	"Reports could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.":
		"Izvještaji se nisu učitali. Pokušajte ponovno; ako se problem nastavi, uzrok je greška sučelja, a ne vaših podataka.",
	"Could not load reports": "Izvještaji se nisu učitali",
	"Revenue — {period}": "Prihod — {period}",
	"No paid orders in this period": "Nema plaćenih narudžbi u ovom razdoblju",
	"Revenue ({currencyCode}) — {period}": "Prihod ({currencyCode}) — {period}",
	"Cards are ordered alphabetically by currency code, not by order volume — the wire carries no per-currency order count. Ranking by volume needs a service change.":
		"Kartice su poredane abecedno po valuti. Podaci ne sadrže broj narudžbi po valuti; za taj poredak treba promijeniti servis.",
	"Orders — {period}": "Narudžbe — {period}",
	"Every status; {paidOrderCount} paid": "Svi statusi; plaćeno: {paidOrderCount}",
	Period: "Razdoblje",
	Revenue: "Prihod",
	"No revenue in range.": "Nema prihoda u ovom razdoblju.",
	"Revenue by {interval}": "Prihod po {interval}",
	day: "danu",
	week: "tjednu",
	month: "mjesecu",
	Status: "Status",
	Orders: "Narudžbe",
	"No orders in range.": "Nema narudžbi u ovom razdoblju.",
	"Orders by status ({length})": "Narudžbe po statusu ({length})",
	Product: "Proizvod",
	Qty: "Kol.",
	"No sales in range.": "Nema prodaje u ovom razdoblju.",
	"Top products ({length})": "Najprodavaniji proizvodi ({length})",
	"Revenue is not shown per product because this range spans more than one currency and the wire carries no per-product currency — a service change is needed to attribute it correctly.":
		"Prihod po proizvodu nije prikazan jer razdoblje obuhvaća više valuta, a podaci ne sadrže valutu po proizvodu. Za točan prikaz treba promijeniti servis.",
	Title: "Naziv",
	SKU: "SKU",
	"On hand": "Na zalihi",
	"(untitled)": "(bez naziva)",
	"Nothing low on stock.": "Nema proizvoda s niskom zalihom.",
	"Low stock ({count})": "Niska zaliha ({count})",
	"Low stock ({count}) — at or below {threshold}": "Niska zaliha ({count}) — do {threshold}",
	"{value1} (UTC) · Revenue is net order totals on paid-and-later orders, bucketed by order time.":
		"{value1} (UTC) · Prihod je neto iznos plaćenih i kasnijih narudžbi, prema vremenu naručivanja.",
	"{items} {value2} not shown: the four cards are taken by one revenue card per currency.":
		"Nije prikazano: {items}. Četiri kartice zauzima po jedna kartica prihoda za svaku valutu.",
	"Also refunded: {items} — stated separately because this period earned nothing in {value2}.":
		"Dodatni povrati: {items}. Prikazani su zasebno jer u ovom razdoblju nema prihoda u tim valutama.",
	"{onHand} · Out of stock": "{onHand} · Nema zalihe",
	"{onHand} · Low": "{onHand} · Nisko",
	"From (inclusive)": "Od (uključivo)",
	"To (inclusive)": "Do (uključivo)",
	"Update period": "Ažuriraj razdoblje",
	"Showing the last {defaultRangeDays} days": "Prikaz zadnjih {defaultRangeDays} dana",
	"AOV{value1} — {period}": "Prosjek{value1} — {period}",
	"Average order value — no paid orders in this period":
		"Prosječna vrijednost — nema plaćenih narudžbi",
	"Average order value — orders in this period span several currencies":
		"Prosječna vrijednost — narudžbe su u više valuta",
	"Average order value — no paid orders to average":
		"Prosječna vrijednost — nema plaćenih narudžbi",
	"Average order value across {paidOrderCount} paid {value2}":
		"Prosječna vrijednost plaćenih narudžbi: {paidOrderCount}",
	"no order refunded in full": "nema potpunih povrata",
	"{refundedOrders} refunded in full": "potpuni povrati: {refundedOrders}",
	"Refunded{value1} — {period}": "Povrati{value1} — {period}",
	"Money returned — no orders in this period": "Vraćeni iznos — nema narudžbi u razdoblju",
	"Money returned — this period spans several currencies":
		"Vraćeni iznos — razdoblje obuhvaća više valuta",
	"No fully refunded orders": "Nema potpuno vraćenih narudžbi",
	"{refundedOrders} fully refunded {value2}": "Potpuno vraćene narudžbe: {refundedOrders}",
	"{known}; refunded amount not yet reported": "{known}; iznos povrata još nije dostupan",
	"On orders placed in this period; {inFull}. A later refund changes this figure; refunds in progress are excluded.":
		"Za narudžbe u ovom razdoblju; {inFull}. Naknadni povrat mijenja iznos; povrati u obradi nisu uključeni.",
	"Periods with no revenue are omitted for this range.":
		"Razdoblja bez prihoda nisu prikazana u ovom rasponu.",
	"{noun} saved": "Spremljeno: {noun}",
	"{noun} unchanged": "Bez promjene: {noun}",
	"The {value1} was updated. It is stored write-only and never displayed.":
		"Ažurirano: {value1}. Vrijednost je tajna i nikad se ne prikazuje.",
	"Nothing entered — {value1} unchanged": "Prazno polje — {value1} bez promjene",
	"The field was blank, so the stored {value1} was kept. Enter a value to replace it.":
		"Polje je prazno, pa je zadržano: {value1}. Unesite novu vrijednost za zamjenu.",
	"Display name not saved": "Naziv trgovine nije spremljen",
	"Store display name must be 1–{displayNameMax} characters — it was not changed.":
		"Naziv trgovine mora imati 1–{displayNameMax} znakova — nije promijenjen.",
	"Display name saved": "Naziv trgovine spremljen",
	"Store display name saved: {name}.": "Naziv trgovine spremljen: {name}.",
	"Payment settings not saved": "Postavke plaćanja nisu spremljene",
	"{offlineError} Nothing was saved.": "{offlineError} Ništa nije spremljeno.",
	"The x402 destination wallet is not a wallet address (expected 0x followed by 40 hex characters, optionally CAIP-10 prefixed). Nothing was saved.":
		"x402 novčanik mora biti adresa: 0x i 40 heksadecimalnih znakova, uz neobvezni CAIP-10 prefiks. Ništa nije spremljeno.",
	"The sign-in link page must be an absolute http(s) URL with no username or password. Nothing was saved.":
		"Stranica poveznice za prijavu mora biti puni http(s) URL bez korisničkog imena i lozinke. Ništa nije spremljeno.",
	"Payment settings saved": "Postavke plaćanja spremljene",
	"Email, sign-in link, x402 and offline payment settings were updated.":
		"Ažurirane su postavke e-pošte, prijave, x402 i plaćanja izvan mreže.",
	"Settings saved": "Postavke spremljene",
	"Settings changed by someone else": "Netko drugi je promijenio postavke",
	"Settings not saved": "Postavke nisu spremljene",
	"{message} Nothing was saved.": "{message} Ništa nije spremljeno.",
	"Could not save settings: {message}": "Postavke nisu spremljene: {message}",
	"Operational settings were updated.": "Operativne postavke su ažurirane.",
	"Display name is cosmetic; the rest is operational and lives in the service.":
		"Naziv je oznaka za prikaz; ostale postavke utječu na rad trgovine i pohranjene su u servisu.",
	"no display name": "naziv nije postavljen",
	"Checkout & holds": "Blagajna i rezervacije",
	"not loaded": "nije učitano",
	"{minutes} min hold": "rezerv. {minutes} min",
	"low stock at {threshold}": "niska zaliha do {threshold}",
	"Save display name": "Spremi naziv trgovine",
	"Store display name": "Naziv trgovine",
	"Cart hold TTL (minutes)": "Trajanje rezervacije (minute)",
	"Low-stock threshold": "Prag niske zalihe",
	"Operational settings could not be loaded right now. Store display name and payment/email settings are unaffected.":
		"Operativne postavke trenutačno nisu dostupne. Naziv trgovine i postavke plaćanja i e-pošte ostaju dostupni.",
	"These persist in the commerce service and affect live checkout.":
		"Pohranjuju se u servisu trgovine i utječu na blagajnu.",
	"Save operational settings": "Spremi operativne postavke",
	"Payment and email credentials, stored write-only — a blank submit keeps the current one. None is ever displayed.":
		"Tajni podaci za plaćanje i e-poštu. Prazno polje zadržava postojeću vrijednost; tajne se nikad ne prikazuju.",
	"These are configuration, not credentials, so they are shown back to you. The x402 destination wallet is where buyers' payments go — x402 checkout stays unavailable until it is set.":
		"Ove postavke se prikazuju. x402 novčanik prima uplate kupaca; dok nije postavljen, x402 plaćanje nije dostupno.",
	"Save payment settings": "Spremi postavke plaćanja",
	"Payments & email": "Plaćanja i e-pošta",
	"Enter new {value1} (blank keeps current)": "Unesite novi {value1} (prazno zadržava postojeći)",
	"Save {value1}": "Spremi {value1}",
	"no {items}": "nedostaje: {items}",
	configured: "postavljeno",
	"Stripe secret key": "Tajni Stripe ključ",
	"Stripe webhook signing secret": "Tajna za Stripe webhook potpis",
	"Stripe webhook secret": "Tajna za Stripe webhook",
	"Email provider API key": "API ključ pružatelja e-pošte",
	"Email API key": "API ključ e-pošte",
	"x402 facilitator API key": "API ključ x402 posrednika",
	"Stripe webhook edge token (optional)": "Edge token Stripe webhooka (neobvezno)",
	"Webhook edge token": "Edge token webhooka",
	"stripe key": "Stripe ključ",
	webhook: "webhook",
	email: "e-pošta",
	x402: "x402",
	edge: "edge",
	"Order email from-address": "Adresa pošiljatelja e-pošte narudžbi",
	"Enable bank transfer (true or false)": "Omogući bankovnu uplatu (true ili false)",
	"Bank barcode recipient name (optional profile)": "Primatelj bankovne uplate (neobavezan profil)",
	"Recipient legal name": "Pravni naziv primatelja",
	"Bank barcode recipient street": "Ulica primatelja bankovne uplate",
	"Street and number": "Ulica i broj",
	"Bank barcode recipient postal code and city": "Poštanski broj i mjesto primatelja",
	"Postal code and city": "Poštanski broj i mjesto",
	"Bank barcode Croatian IBAN": "Hrvatski IBAN za bankovni barkod",
	"Bank barcode reference model (HR00 or HR99)": "Model poziva na broj (HR00 ili HR99)",
	"Bank barcode four-letter purpose": "Četveroslovna šifra namjene",
	"Complete a valid bank barcode recipient, Croatian IBAN, HR00/HR99 model and four-letter purpose, or clear all six barcode fields.":
		"Unesite valjanog primatelja, hrvatski IBAN, model HR00/HR99 i četveroslovnu šifru namjene ili ispraznite svih šest polja barkoda.",
	"Bank transfer instructions shown to buyers": "Upute kupcima za bankovnu uplatu",
	"Bank account details and payment reference instructions":
		"Podaci za uplatu i upute za poziv na broj",
	"Bank transfer payment deadline (whole hours, 1–720)": "Rok bankovne uplate (cijeli sati, 1–720)",
	"Enable cash on delivery (true or false)": "Omogući pouzeće (true ili false)",
	"Cash on delivery instructions shown to buyers": "Upute kupcima za plaćanje pouzećem",
	"Pay the carrier on delivery": "Platite dostavljaču pri preuzimanju",
	"COD acceptance deadline (whole hours, 1–720)": "Rok prihvata pouzeća (cijeli sati, 1–720)",
	"Sign-in link page (absolute URL of the storefront's /account/verify page)":
		"Stranica prijave (puni URL stranice /account/verify)",
	"x402 destination wallet": "x402 novčanik za uplate",
	"0x… (the address buyers pay)": "0x… (adresa za uplate kupaca)",
	"x402 accepted networks (comma-separated CAIP-2)": "x402 mreže (CAIP-2, odvojene zarezom)",
	"fixed amount (unset)": "fiksni iznos (nije postavljen)",
	"{amount} off": "popust {amount}",
	"percentage (unset)": "postotak (nije postavljen)",
	" (cap {amount})": " (najviše {amount})",
	"{amount}% off{cap}": "popust {amount}%{cap}",
	always: "uvijek",
	"until {until}": "do {until}",
	"from {from}": "od {from}",
	"{count} of {max}": "{count} od {max}",
	"{usesCount} of {max}": "{usesCount} od {max}",
	"{count} use": {
		one: "{count} iskorištenje",
		few: "{count} iskorištenja",
		other: "{count} iskorištenja",
	},
	"{count} uses": {
		one: "{count} iskorištenje",
		few: "{count} iskorištenja",
		other: "{count} iskorištenja",
	},
	"{count} coupon": { one: "{count} kupon", few: "{count} kupona", other: "{count} kupona" },
	"{count} coupons": { one: "{count} kupon", few: "{count} kupona", other: "{count} kupona" },
	"on this page": "na ovoj stranici",
	"code: {code}": "kod: {code}",
	"No coupons yet": "Još nema kupona",
	"Create one to start discounting carts.": "Izradite kupon za popuste na košarice.",
	"New coupon": "Novi kupon",
	"No coupon matches that code": "Nema kupona s tim kodom",
	"Nothing came back for that search. Clear it to go back to every coupon.":
		"Nema rezultata. Očistite pretragu za prikaz svih kupona.",
	"No coupon matches that code.": "Nema kupona s tim kodom.",
	"← Back to coupons": "← Natrag na kupone",
	"ID, code, type and currency are fixed at creation — to change them, retire this coupon and issue a new code.":
		"ID, kod, vrsta i valuta određuju se pri izradi. Za njihovu promjenu povucite kupon i izradite novi kod.",
	Code: "Kod",
	Discount: "Popust",
	Valid: "Vrijedi",
	Uses: "Iskorištenja",
	"Min spend": "Min. potrošnja",
	"Code (exact match, case-insensitive)": "Kod (točno podudaranje, neovisno o veličini slova)",
	"e.g. SUMMER25": "npr. SUMMER25",
	Search: "Pretraži",
	"Open coupon": "Otvori kupon",
	"Choose a coupon…": "Odaberite kupon…",
	"View / edit": "Pregledaj / uredi",
	"Fixed amount off": "Fiksni popust",
	"Percentage off": "Postotni popust",
	"Coupon ID": "ID kupona",
	"e.g. summer25": "npr. summer25",
	Type: "Vrsta",
	"Amount off": "Iznos popusta",
	"Currency (ISO-4217)": "Valuta (ISO-4217)",
	"Rate (%)": "Stopa (%)",
	"Discount cap (optional)": "Najveći popust (neobvezno)",
	"Create coupon": "Izradi kupon",
	"Coupons are unavailable": "Kuponi nisu dostupni",
	"Coupons could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.":
		"Kuponi se nisu učitali. Pokušajte ponovno; ako se problem nastavi, uzrok je greška sučelja, a ne vaših podataka.",
	"Could not load coupons": "Kuponi se nisu učitali",
	"Coupon not found": "Kupon nije pronađen",
	'No coupon matches "{id}" — it may have been deleted.':
		'Nema kupona s kodom "{id}" — možda je obrisan.',
	Coupon: "Kupon",
	"This coupon is unavailable": "Ovaj kupon nije dostupan",
	"This coupon could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.":
		"Kupon se nije učitao. Pokušajte ponovno; ako se problem nastavi, uzrok je greška sučelja, a ne vaših podataka.",
	"Could not load the coupon": "Kupon se nije učitao",
	"Coupon — {code}": "Kupon — {code}",
	Currency: "Valuta",
	Created: "Izrađeno",
	Redemptions: "Iskorištenja",
	active: "Aktivan",
	scheduled: "Zakazan",
	expired: "Istekao",
	"used up": "Iskorišten",
	fixed_amount: "Fiksni popust",
	percentage: "Postotni popust",
	"— (currency-agnostic)": "— (bez određene valute)",
	coupon: "kupon",
	coupons: "kupona",
	unlimited: "neograničeno",
	"Checkout refuses this code until its start date.":
		"Blagajna ne prihvaća ovaj kod prije početnog datuma.",
	"Checkout refuses this code — its expiry date has passed.":
		"Blagajna ne prihvaća ovaj kod jer je istekao.",
	"Checkout refuses this code — it has reached its maximum number of uses.":
		"Blagajna ne prihvaća ovaj kod jer je dosegnut najveći broj iskorištenja.",
	"This coupon is {status}": "Kupon: {status}",
	"Minimum spend": "Najmanja potrošnja",
	"Edit — {value1} · {value2}": "Uredi — {value1} · {value2}",
	"Saving replaces every field below": "Spremanje zamjenjuje sva polja ispod",
	"This is a full replace: a blank optional field saves as unset, not unchanged. Values shown are the current ones.":
		"Sva se polja zamjenjuju. Prazno neobvezno polje briše vrijednost. Prikazane su trenutačne vrijednosti.",
	"Dates are UTC. A coupon becomes valid at the start of its start date and stops at the END of its expiry date. Blank either one for no bound.":
		"Datumi su u UTC-u. Kupon vrijedi od početka početnog datuma do kraja završnog. Prazan datum uklanja tu granicu.",
	"Amount off ({value1})": "Iznos popusta ({value1})",
	"Starts at (optional, UTC)": "Početni datum (neobvezno, UTC)",
	"Expires at (optional, UTC)": "Završni datum (neobvezno, UTC)",
	"Edit spend and use limits": "Uredi ograničenja potrošnje i iskorištenja",
	"Minimum spend (optional)": "Najmanja potrošnja (neobvezno)",
	"Max uses (optional)": "Najviše iskorištenja (neobvezno)",
	"Max uses per customer (optional)": "Najviše po kupcu (neobvezno)",
	"Save coupon": "Spremi kupon",
	"Max uses": "Najviše iskorištenja",
	"Max per customer": "Najviše po kupcu",
	"Remaining redemptions": "Preostala iskorištenja",
	"Orders already placed keep their snapshotted discount regardless of edits here. Lowering max uses to at or below the current count exhausts the coupon immediately.":
		"Postojeće narudžbe zadržavaju izvorni popust. Smanjenje ograničenja na trenutačni broj iskorištenja ili manje odmah iscrpljuje kupon.",
	"Delete coupon": "Obriši kupon",
	"Delete {code}?": "Obrisati {code}?",
	"Only a never-redeemed coupon can be deleted. In-flight carts recompute without it; placed orders are unaffected.":
		"Može se obrisati samo neiskorišteni kupon. Aktivne košarice preračunavaju se bez njega; postojeće narudžbe ostaju iste.",
	"Yes, delete": "Da, obriši",
	"Keep it": "Zadrži",
	"This coupon has been redeemed {usesCount} time{value2} — deletion is blocked to keep the redemption audit trail. To retire it, set its expiry to a past date.":
		"Broj iskorištenja: {usesCount}. Brisanje je blokirano radi evidencije. Za povlačenje postavite datum isteka u prošlosti.",
	"Leave the percentage-only fields (rate, cap) blank for a fixed_amount coupon.":
		"Za fiksni popust ostavite polja postotka (stopa, ograničenje) prazna.",
	"Amount off must be a positive number like 5.00 (up to two decimal places) — a fixed_amount coupon cannot leave it unset.":
		"Iznos popusta mora biti pozitivan broj, npr. 5.00 (do dvije decimale). Obvezan je za fiksni popust.",
	"Currency must be a 3-letter ISO-4217 code like USD.":
		"Valuta mora biti troslovni ISO-4217 kod, npr. USD.",
	"Leave the fixed-amount-only fields (amount, currency) blank for a percentage coupon.":
		"Za postotni popust ostavite iznos i valutu praznima.",
	"Rate must be a positive percent like 10 or 7.25 (up to two decimal places) — a percentage coupon cannot leave it unset.":
		"Stopa mora biti pozitivan postotak, npr. 10 ili 7.25 (do dvije decimale). Obvezna je za postotni popust.",
	"Discount cap must be a positive number like 20.00, or blank for no cap.":
		"Najveći popust mora biti pozitivan broj, npr. 20.00, ili prazno za neograničeni popust.",
	"Minimum spend must be a number like 35.00, or blank for none.":
		"Najmanja potrošnja mora biti broj, npr. 35.00, ili prazno za bez ograničenja.",
	"Starts at {dateHint}": "Početni datum {dateHint}",
	"Expires at {dateHint}": "Završni datum {dateHint}",
	"must be a date like 2026-08-01.": "mora biti datum poput 2026-08-01.",
	"Expires at must be on or after starts at.": "Završni datum ne smije biti prije početnog.",
	"Max uses must be a whole number of 1 or more, or blank for unlimited.":
		"Najviše iskorištenja mora biti cijeli broj od 1 nadalje, ili prazno za neograničeno.",
	"Max uses per customer must be a whole number of 1 or more, or blank for unlimited.":
		"Najviše iskorištenja po kupcu mora biti cijeli broj od 1 nadalje, ili prazno za neograničeno.",
	"Coupon not created": "Kupon nije izrađen",
	"Enter both a coupon ID and a code.": "Unesite ID kupona i kod.",
	"Choose a valid coupon type.": "Odaberite valjanu vrstu kupona.",
	"Coupon created": "Kupon je izrađen",
	'"{code}" was added and is live per its validity window.':
		'Dodano: "{code}". Kupon vrijedi prema zadanom razdoblju.',
	'Could not create "{code}" — check the coupon ID and code aren\'t already in use, then try again.':
		'Kupon "{code}" nije izrađen. Provjerite koriste li se već ID ili kod pa pokušajte ponovno.',
	"Coupon not saved": "Kupon nije spremljen",
	"That action could not be read — nothing was changed. Reload and try again.":
		"Radnja nije prepoznata. Ništa nije promijenjeno. Osvježite pa pokušajte ponovno.",
	"Coupon saved": "Kupon je spremljen",
	"Every field was replaced with the submitted values (last write wins). Orders already placed keep their snapshotted discount.":
		"Sva su polja zamijenjena poslanim vrijednostima; vrijedi zadnje spremanje. Postojeće narudžbe zadržavaju izvorni popust.",
	"This coupon no longer exists — it may have been deleted.":
		"Kupon više ne postoji — možda je obrisan.",
	"The change could not be saved — retry in a moment.":
		"Promjena nije spremljena. Pokušajte ponovno za trenutak.",
	"Coupon deleted": "Kupon je obrisan",
	'"{code}" was removed. In-flight carts recompute without it; orders already placed keep their snapshotted discount.':
		'Kupon "{code}" je uklonjen. Aktivne košarice preračunavaju se bez njega; postojeće narudžbe zadržavaju izvorni popust.',
	"Already deleted": "Već obrisano",
	"This coupon was already removed.": "Kupon je već uklonjen.",
	"Coupon not deleted": "Kupon nije obrisan",
	"This coupon has been redeemed — deletion is blocked to preserve the redemption audit trail. To retire it, set its expiry to a past date instead.":
		"Kupon je već iskorišten pa je brisanje blokirano radi evidencije. Za povlačenje postavite datum isteka u prošlosti.",
	"The coupon could not be deleted — retry in a moment.":
		"Kupon nije obrisan. Pokušajte ponovno za trenutak.",
	"Search a coupon and open it. Discounts apply to the cart subtotal at checkout.":
		"Pronađite i otvorite kupon. Popust se pri plaćanju primjenjuje na zbroj košarice.",
	"Tax classes": "Porezne klase",
	"A tax class is a rate group; products and rates reference one by id.":
		"Porezna klasa je skup stopa; proizvodi i stope koriste njezin ID.",
	"No tax classes yet": "Još nema poreznih klasa",
	"A tax class groups tax rates that share the same treatment — products and rates reference one by id.":
		"Porezna klasa grupira porezne stope s istim tretmanom. Proizvodi i stope koriste njezin ID.",
	"New tax class": "Nova porezna klasa",
	Name: "Naziv",
	"Save name": "Spremi naziv",
	"View rates": "Prikaži stope",
	"Delete class": "Obriši klasu",
	"Delete tax class {id}?": "Obrisati poreznu klasu {id}?",
	"Deleting is blocked while any product or tax rate still references this class. This cannot be undone.":
		"Brisanje je blokirano dok proizvod ili porezna stopa koristi ovu klasu. Brisanje se ne može poništiti.",
	"Deleting is blocked while any product or tax rate still references this class.":
		"Brisanje je blokirano dok proizvod ili porezna stopa koristi ovu klasu.",
	"← Back to tax classes": "← Natrag na porezne klase",
	"Class ID": "ID klase",
	"e.g. reduced": "npr. reduced",
	"e.g. Reduced rate": "npr. Snižena stopa",
	"Create tax class": "Izradi poreznu klasu",
	"No tax classes yet.": "Još nema poreznih klasa.",
	"Choose a tax class…": "Odaberite poreznu klasu…",
	"Open class": "Otvori klasu",
	"Tax classes are unavailable": "Porezne klase nisu dostupne",
	"Tax classes could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.":
		"Porezne klase se nisu učitale. Pokušajte ponovno; ako se problem nastavi, uzrok je greška sučelja, a ne vaših podataka.",
	"Could not load tax classes": "Porezne klase se nisu učitale",
	"Tax rates — {classId}": "Porezne stope — {classId}",
	"Each rate applies to purchases shipping to one zone.":
		"Svaka se stopa primjenjuje na kupnje s dostavom u jednu zonu.",
	"zone: {zoneId}": "zona: {zoneId}",
	"Clear filters": "Očisti filtre",
	"No tax rates yet": "Još nema poreznih stopa",
	"Add a rate to start charging tax for purchases shipping to a zone.":
		"Dodajte stopu za obračun poreza na kupnje s dostavom u zonu.",
	"New tax rate": "Nova porezna stopa",
	'No tax rates for zone "{zoneId}" yet — "New tax rate" above adds one.':
		'Za zonu "{zoneId}" još nema stopa. Dodajte je gumbom "Nova porezna stopa" iznad.',
	"All zones": "Sve zone",
	Zone: "Zona",
	"Apply filters": "Primijeni filtre",
	"Applies to shipping": "Primjenjuje se na dostavu",
	"Save rate": "Spremi stopu",
	"Delete rate": "Obriši stopu",
	"Delete tax rate {id}?": "Obrisati poreznu stopu {id}?",
	"In-flight carts recompute their tax without this rate. Orders already placed are unaffected — they snapshot the tax charged at purchase time.":
		"Aktivne košarice preračunavaju porez bez ove stope. Postojeće narudžbe zadržavaju porez obračunat pri kupnji.",
	"also shipping": "i dostava",
	"goods only": "samo roba",
	yes: "da",
	"Rate ID": "ID stope",
	Rate: "Stopa",
	"No tax rates yet for this class.": "Još nema poreznih stopa za ovu klasu.",
	"Choose a tax rate…": "Odaberite poreznu stopu…",
	"Open rate": "Otvori stopu",
	"New tax rate — {classId}": "Nova porezna stopa — {classId}",
	"← Back to tax rates": "← Natrag na porezne stope",
	"Create a shipping zone first — a tax rate applies to one zone.":
		"Prvo izradite zonu dostave — porezna stopa pripada jednoj zoni.",
	"e.g. std-us": "npr. std-us",
	"Rate (%, up to 2 decimals)": "Stopa (%, do 2 decimale)",
	"e.g. 7.25": "npr. 7.25",
	"Add tax rate": "Dodaj poreznu stopu",
	"Tax rates": "Porezne stope",
	"Tax rates are unavailable": "Porezne stope nisu dostupne",
	"Tax rates could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.":
		"Porezne stope se nisu učitale. Pokušajte ponovno; ako se problem nastavi, uzrok je greška sučelja, a ne vaših podataka.",
	"Could not load tax rates": "Porezne stope se nisu učitale",
	"Tax rate not found": "Porezna stopa nije pronađena",
	'No tax rate matches that id for class "{classId}" — it may have already been deleted.':
		'Nema te porezne stope za klasu "{classId}" — možda je već obrisana.',
	"Tax rate — {id}": "Porezna stopa — {id}",
	"Deleting only affects future carts — orders already placed keep the tax they were charged at purchase time.":
		"Brisanje utječe na buduće košarice. Postojeće narudžbe zadržavaju porez obračunat pri kupnji.",
	"Tax rate": "Porezna stopa",
	"Tax rate is unavailable": "Porezna stopa nije dostupna",
	"Tax rate could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.":
		"Porezna stopa se nije učitala. Pokušajte ponovno; ako se problem nastavi, uzrok je greška sučelja, a ne vaših podataka.",
	"Could not load this tax rate": "Porezna stopa se nije učitala",
	"Tax class not created": "Porezna klasa nije izrađena",
	"Enter both a class ID and a name.": "Unesite ID klase i naziv.",
	"Tax class created": "Porezna klasa je izrađena",
	'"{name}" ({id}) was added.': 'Dodano: "{name}" ({id}).',
	'Could not create "{id}" — check the class ID isn\'t already in use, then try again.':
		'Klasa "{id}" nije izrađena. Provjerite koristi li se već ID pa pokušajte ponovno.',
	"Class not saved": "Klasa nije spremljena",
	"Enter a name.": "Unesite naziv.",
	"Class saved": "Klasa je spremljena",
	"The tax class was renamed.": "Naziv porezne klase je promijenjen.",
	"Class not found": "Klasa nije pronađena",
	"This tax class no longer exists — it may have already been deleted.":
		"Porezna klasa više ne postoji — možda je već obrisana.",
	"Class deleted": "Klasa je obrisana",
	"The tax class was removed.": "Porezna klasa je uklonjena.",
	"This tax class was already removed.": "Porezna klasa je već uklonjena.",
	"Class not deleted": "Klasa nije obrisana",
	"{count} product{value2} still reference{value3} this class — clear those references first, then retry.":
		"Proizvodi koji koriste ovu klasu: {count}. Prvo im uklonite klasu pa pokušajte ponovno.",
	"{count} tax rate{value2} still reference{value3} this class — delete those rates first, then retry.":
		"Porezne stope koje koriste ovu klasu: {count}. Prvo ih obrišite pa pokušajte ponovno.",
	"The class could not be deleted — retry in a moment.":
		"Klasa nije obrisana. Pokušajte ponovno za trenutak.",
	"Tax rate not created": "Porezna stopa nije izrađena",
	"Enter both a rate ID and a zone.": "Unesite ID stope i zonu.",
	"Rate must be a percent like 7.25 (0 to 1000, up to two decimal places).":
		"Stopa mora biti postotak, npr. 7.25 (0 do 1000, do dvije decimale).",
	"Tax rate created": "Porezna stopa je izrađena",
	'Rate "{id}" was added.': 'Stopa "{id}" je dodana.',
	'Could not create "{id}" — check the rate ID isn\'t already in use and the zone id is correct, then try again.':
		'Stopa "{id}" nije izrađena. Provjerite ID stope i zone pa pokušajte ponovno.',
	"Rate not saved": "Stopa nije spremljena",
	"Rate saved": "Stopa je spremljena",
	"The tax rate was updated.": "Porezna stopa je ažurirana.",
	"This rate changed since you loaded it — reload": "Stopa je promijenjena — osvježite",
	"Your edit was NOT applied — the latest value is shown below. Re-apply your change and save again.":
		"Promjena nije primijenjena. Ispod je najnovija vrijednost. Ponovno unesite promjenu i spremite.",
	"Rate not found": "Stopa nije pronađena",
	"This tax rate no longer exists — it may have already been deleted.":
		"Porezna stopa više ne postoji — možda je već obrisana.",
	"Rate deleted": "Stopa je obrisana",
	"The tax rate was removed.": "Porezna stopa je uklonjena.",
	"This tax rate was already removed.": "Porezna stopa je već uklonjena.",
	"Rate not deleted": "Stopa nije obrisana",
	"The rate could not be deleted — retry in a moment.":
		"Stopa nije obrisana. Pokušajte ponovno za trenutak.",
	"Shipping zones": "Zone dostave",
	"A zone groups the shipping methods you offer for a set of destinations.":
		"Zona grupira načine dostave za odabrana odredišta.",
	"No shipping zones yet": "Još nema zona dostave",
	"Create a zone to start grouping the shipping methods you offer by destination.":
		"Izradite zonu za grupiranje načina dostave prema odredištu.",
	"New shipping zone": "Nova zona dostave",
	"View methods": "Prikaži načine dostave",
	"e.g. United States": "npr. Sjedinjene Američke Države",
	"Regions (comma-separated, blank = none)": "Regije (zarezom odvojene; prazno = nijedna)",
	"Save zone": "Spremi zonu",
	"Delete zone": "Obriši zonu",
	"Delete zone {id}?": "Obrisati zonu {id}?",
	"This only works while the zone has no shipping methods — delete those first if this fails. This cannot be undone.":
		"Zona se može obrisati tek kad nema načina dostave. Prvo ih obrišite. Brisanje se ne može poništiti.",
	"← Back to shipping zones": "← Natrag na zone dostave",
	"Regions are ISO codes: a country (US) or state/province (US-CA). Addresses match exactly; the most specific zone wins.":
		"Regije su ISO kodovi države (US) ili regije (US-CA). Adrese se podudaraju točno; prednost ima najpreciznija zona.",
	"Zone ID": "ID zone",
	"e.g. us": "npr. us",
	"e.g. US": "npr. US",
	"Create zone": "Izradi zonu",
	Regions: "Regije",
	"No shipping zones yet — create one below.": "Još nema zona dostave — izradite zonu ispod.",
	"Open zone": "Otvori zonu",
	"Choose a zone…": "Odaberite zonu…",
	Open: "Otvori",
	"Shipping zones are unavailable": "Zone dostave nisu dostupne",
	"Shipping zones could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.":
		"Zone dostave se nisu učitale. Pokušajte ponovno; ako se problem nastavi, uzrok je greška sučelja, a ne vaših podataka.",
	"Could not load shipping zones": "Zone dostave se nisu učitale",
	"No rate set": "Cijena nije postavljena",
	"Price unavailable": "Cijena nije dostupna",
	"Price not loaded": "Cijena nije učitana",
	"Prices not shown": "Cijene nisu prikazane",
	"Enter a 3-letter currency code like USD.": "Unesite troslovni kod valute, npr. USD.",
	'"Flat rate" always charges its rate; "Free shipping" charges nothing above its threshold.':
		'"Fiksna cijena" uvijek se naplaćuje; "Besplatna dostava" ne naplaćuje se iznad praga.',
	'{types} Prices in {currency} — "No rate set" means no {currency3} rate.':
		'{types} Cijene su u {currency}. "Cijena nije postavljena" znači da nema cijene u {currency3}.',
	"Shipping methods — {zoneId}": "Načini dostave — {zoneId}",
	"← Back to zones": "← Natrag na zone",
	"No shipping methods yet": "Još nema načina dostave",
	"Add a method to start offering shipping for this zone.": "Dodajte način dostave za ovu zonu.",
	"New shipping method": "Novi način dostave",
	"Price currency (ISO-4217, e.g. USD)": "Valuta cijene (ISO-4217, npr. USD)",
	"Free shipping": "Besplatna dostava",
	"Flat rate": "Fiksna cijena",
	"free shipping": "besplatna dostava",
	"flat rate": "fiksna cijena",
	"Free shipping (threshold-based)": "Besplatna dostava (od praga)",
	"Save method": "Spremi način dostave",
	"Delete method": "Obriši način dostave",
	"Delete method {id}?": "Obrisati način dostave {id}?",
	"This only works while the method has no rates — delete those first if this fails. This cannot be undone.":
		"Način dostave se može obrisati tek kad nema cijena. Prvo ih obrišite. Brisanje se ne može poništiti.",
	"New shipping method — {zoneId}": "Novi način dostave — {zoneId}",
	"← Back to shipping methods": "← Natrag na načine dostave",
	"Method ID": "ID načina dostave",
	"e.g. standard": "npr. standard",
	"e.g. Standard shipping": "npr. Standardna dostava",
	"Add method": "Dodaj način dostave",
	"No shipping methods yet for this zone.": "Još nema načina dostave za ovu zonu.",
	"Open method": "Otvori način dostave",
	"Choose a method…": "Odaberite način dostave…",
	"Shipping methods": "Načini dostave",
	"Shipping methods are unavailable": "Načini dostave nisu dostupni",
	"Shipping methods could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.":
		"Načini dostave se nisu učitali. Pokušajte ponovno; ako se problem nastavi, uzrok je greška sučelja, a ne vaših podataka.",
	"Could not load shipping methods": "Načini dostave se nisu učitali",
	"Shipping rates — {methodId}": "Cijene dostave — {methodId}",
	"← Back to methods": "← Natrag na načine dostave",
	"A rate is keyed by currency — one method can price differently per currency.":
		"Cijena je vezana uz valutu. Jedan način dostave može imati različite cijene po valuti.",
	"currency: {currency}": "valuta: {currency}",
	"No rate set for that currency yet — use the form below.":
		"Cijena za tu valutu još nije postavljena. Unesite je u obrazac ispod.",
	"Currency (ISO-4217, e.g. USD)": "Valuta (ISO-4217, npr. USD)",
	Amount: "Iznos",
	"Free-shipping threshold": "Prag besplatne dostave",
	Method: "Način dostave",
	"No minimum": "Bez minimuma",
	"Amount (up to 2 decimals, e.g. 4.99 — 0 is allowed)":
		"Iznos (do 2 decimale, npr. 4.99; 0 je dopušteno)",
	"Free-shipping threshold (blank = none)": "Prag besplatne dostave (prazno = nema)",
	"Add rate": "Dodaj cijenu",
	"Amount for {currency} (up to 2 decimals)": "Iznos u {currency} (do 2 decimale)",
	"Delete the {currency} rate for {methodId}?": "Obrisati cijenu u {currency} za {methodId}?",
	"In-flight carts recompute their shipping without this rate the next time they're touched. Orders already placed are unaffected — an order snapshots the shipping fee it was charged at purchase time.":
		"Aktivne košarice pri sljedećoj promjeni preračunavaju dostavu bez ove cijene. Postojeće narudžbe zadržavaju dostavu naplaćenu pri kupnji.",
	"Shipping rates": "Cijene dostave",
	"Shipping rates are unavailable": "Cijene dostave nisu dostupne",
	"Shipping rates could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.":
		"Cijene dostave se nisu učitale. Pokušajte ponovno; ako se problem nastavi, uzrok je greška sučelja, a ne vaših podataka.",
	"Could not load shipping rates": "Cijene dostave se nisu učitale",
	"Zone not created": "Zona nije izrađena",
	"Enter both a zone ID and a name.": "Unesite ID zone i naziv.",
	"Zone created": "Zona je izrađena",
	'Could not create "{id}" — check the zone ID isn\'t already in use, then try again.':
		'Zona "{id}" nije izrađena. Provjerite koristi li se već ID pa pokušajte ponovno.',
	"Zone not saved": "Zona nije spremljena",
	"Name cannot be blank.": "Naziv ne smije biti prazan.",
	"Zone saved": "Zona je spremljena",
	"The zone was updated.": "Zona je ažurirana.",
	"Zone not found": "Zona nije pronađena",
	"This zone no longer exists — it may have already been deleted.":
		"Zona više ne postoji — možda je već obrisana.",
	"Zone deleted": "Zona je obrisana",
	"The zone was removed.": "Zona je uklonjena.",
	"This zone was already removed.": "Zona je već uklonjena.",
	"Zone not deleted": "Zona nije obrisana",
	"This zone still has shipping methods — delete its methods first, then retry.":
		"Zona još ima načine dostave. Prvo ih obrišite pa pokušajte ponovno.",
	"The zone could not be deleted — retry in a moment.":
		"Zona nije obrisana. Pokušajte ponovno za trenutak.",
	"Method not created": "Način dostave nije izrađen",
	"Enter a method ID, a name, and a valid type.":
		"Unesite ID načina dostave, naziv i valjanu vrstu.",
	"Method created": "Način dostave je izrađen",
	'Could not create "{id}" — check the method ID isn\'t already in use, then try again.':
		'Način dostave "{id}" nije izrađen. Provjerite koristi li se već ID pa pokušajte ponovno.',
	"Method not saved": "Način dostave nije spremljen",
	"Enter a name and a valid type.": "Unesite naziv i valjanu vrstu.",
	"Method saved": "Način dostave je spremljen",
	"The method was updated.": "Način dostave je ažuriran.",
	"Method not found": "Način dostave nije pronađen",
	"This method no longer exists — it may have already been deleted.":
		"Način dostave više ne postoji — možda je već obrisan.",
	"Method deleted": "Način dostave je obrisan",
	"The method was removed.": "Način dostave je uklonjen.",
	"This method was already removed.": "Način dostave je već uklonjen.",
	"Method not deleted": "Način dostave nije obrisan",
	"This method still has rates — delete its rates first, then retry.":
		"Način dostave još ima cijene. Prvo ih obrišite pa pokušajte ponovno.",
	"The method could not be deleted — retry in a moment.":
		"Način dostave nije obrisan. Pokušajte ponovno za trenutak.",
	"Rate not created": "Cijena nije izrađena",
	"Amount must be 0 or a positive number like 4.99 (up to two decimal places).":
		"Iznos mora biti 0 ili pozitivan broj, npr. 4.99 (do dvije decimale).",
	"Free-shipping threshold must be 0 or a positive number like 35.00, or blank for none.":
		"Prag besplatne dostave mora biti 0 ili pozitivan broj, npr. 35.00, ili prazno za bez praga.",
	"Rate created": "Cijena je izrađena",
	"The {currency} rate was added.": "Dodana je cijena u {currency}.",
	"Could not create a {currency} rate — check a rate for this currency doesn't already exist, then try again.":
		"Cijena u {currency} nije izrađena. Provjerite postoji li već cijena za tu valutu pa pokušajte ponovno.",
	"The shipping rate was updated.": "Cijena dostave je ažurirana.",
	"This shipping rate no longer exists — it may have already been deleted.":
		"Cijena dostave više ne postoji — možda je već obrisana.",
	"The shipping rate was removed.": "Cijena dostave je uklonjena.",
	"This shipping rate was already removed.": "Cijena dostave je već uklonjena.",
	"Not ISO region codes: {bad}. Use a country code (US) or a state/province code (US-CA).":
		"Nisu ISO kodovi regija: {bad}. Unesite kod države (US) ili regije (US-CA).",
	'{shared} is already in the zone "{name}" ({id}). A code can belong to one zone only — remove it there first.':
		'{shared} već pripada zoni "{name}" ({id}). Kod može pripadati samo jednoj zoni. Prvo ga uklonite iz te zone.',
	"UK (use GB)": "UK (upotrijebite GB)",
	"EU (not a country — list its countries)": "EU (nije država — navedite države)",
	"{token} (not a {value2} subdivision)": "{token} (nije regija države {value2})",
	"{token} (not a code)": "{token} (nije kod)",
	"Matches: {items}": "Podudara se: {items}",
	"Matches no address": "Ne odgovara nijednoj adresi",
	"{token} (not a region code — never matches)": "{token} (nije kod regije — nema podudaranja)",
	"Some zones match no address": "Neke zone ne odgovaraju nijednoj adresi",
	"These zones list no ISO code, so no order can be delivered through them. Add codes such as US, US-CA: ":
		"Ove zone nemaju ISO kodove pa ne omogućuju dostavu. Dodajte kodove, npr. US, US-CA: ",
	"Some zone regions can never match an address": "Neke regije ne odgovaraju adresama",
	"These entries are not ISO codes, so they never match an address. Replace them with codes (e.g. US, US-CA): ":
		"Ove vrijednosti nisu ISO kodovi i ne odgovaraju adresama. Zamijenite ih kodovima, npr. US, US-CA: ",
	"; and {count} more": "; još {count}",
	"{head} and {last}": "{head} i {last}",
	"— (none)": "— (nema)",
	"Commerce integrations": "Integracije trgovine",
	"Invoice owner: {owner}. Automatic issuance: {issuance}. Solo: {solo}. e-racuni: {eRacuni}.":
		"Izdavatelj računa: {owner}. Automatsko izdavanje: {issuance}. Solo: {solo}. e-racuni: {eRacuni}.",
	"Provider credentials are server runtime secrets. See docs/integrations.md for setup and reconciliation. WooCommerce compatibility exposes the supported REST/webhook profile; WordPress PHP plugins require a separate bridge.":
		"Pristupni podaci pružatelja su tajne na poslužitelju. Upute za postavljanje i usklađivanje: docs/integrations.md. WooCommerce nudi podržani REST/webhook profil; WordPress PHP dodaci zahtijevaju poseban most.",
	queued: "Na čekanju",
	issued: "Izdano",
	reconciliation: "Usklađivanje",
	failed: "Neuspjelo",
	enabled: "omogućeno",
	disabled: "onemogućeno",
	"not configured": "nije postavljeno",
	"woocommerce-connector": "WooCommerce poveznik",
	"Admin screen unavailable": "Administracijski prikaz nije dostupan",
	"This screen could not be rendered": "Prikaz nije moguće izraditi",
	"Something went wrong building this view. Reload the page; if it persists, the record may need checking directly.":
		"Došlo je do greške u prikazu. Osvježite stranicu; ako se problem nastavi, zapis treba izravno provjeriti.",
	"Could not render this screen": "Prikaz nije moguće izraditi",
	Unavailable: "Nije dostupno",
	"Action outcome unknown": "Ishod radnje nije poznat",
	"The action may already have been applied, but this screen could not be rebuilt afterwards. Re-check the record before retrying.":
		"Radnja je možda već primijenjena, ali prikaz nije obnovljen. Provjerite zapis prije ponovnog pokušaja.",
	"Offline enable fields must be true or false.":
		"Polja za omogućavanje plaćanja moraju biti true ili false.",
	"Offline payment instructions must be at most 4000 characters.":
		"Upute za plaćanje mogu imati najviše 4000 znakova.",
	"Offline payment windows must be whole hours between 1 and 720 (30 days).":
		"Rokovi plaćanja moraju biti cijeli sati od 1 do 720 (30 dana).",
	"Each enabled offline method requires instructions and an explicit payment window in hours.":
		"Svaki omogućeni način plaćanja zahtijeva upute i izričit rok plaćanja u satima.",
	"Action outcome unknown — re-check the record": "Ishod radnje nije poznat — provjerite zapis",
	"No rows on this page": "Nema redaka na ovoj stranici",
	"This page has no matching rows. Earlier pages may still have results.":
		"Ova stranica nema odgovarajućih redaka. Prethodne stranice mogu sadržavati rezultate.",
	"No matches on this page. Load more to keep scanning.":
		"Na ovoj stranici nema rezultata. Učitajte još za nastavak.",
	"lowStockThreshold must be <= {maximum}": "Prag niske zalihe mora biti najviše {maximum}",
	"Cart hold TTL must be a whole number from 1 to {maximum}; entered: {value}.":
		"Trajanje rezervacije mora biti cijeli broj od 1 do {maximum}; uneseno: {value}.",
	"Low-stock threshold must be a non-negative whole number; entered: {value}.":
		"Prag niske zalihe mora biti nenegativni cijeli broj; uneseno: {value}.",
	"settings were changed by someone else while this save was in flight — reload and try again":
		"netko je promijenio postavke tijekom spremanja; ponovno učitajte i pokušajte opet",
	"settings update failed — reload to see the current values":
		"spremanje postavki nije uspjelo; ponovno učitajte za trenutačne vrijednosti",
	Filters: "Filtri",
	"{label} ({count} active)": "{label} (aktivno: {count})",
};

import { siteLocale, type SiteLocale } from "./site-locale.js";

/**
 * Only authored interface messages belong here. Call sites supply literal keys;
 * product titles, customer details, notes and merchant instructions stay content.
 * English keys are the default wording and keep translation additions explicit.
 */
const CROATIAN = {
	Home: "Početna",
	Shop: "Trgovina",
	Cart: "Košarica",
	Account: "Račun",
	Language: "Jezik",
	"Switch to English": "Promijeni jezik na engleski",
	"Switch to Croatian": "Promijeni jezik na hrvatski",
	"Skip to the main content": "Preskoči na glavni sadržaj",
	Primary: "Glavna navigacija",
	"Otta — content by EmDash, commerce by Otta.": "Otta — sadržaj pokreće EmDash, trgovinu Otta.",
	Details: "Podaci",
	Payment: "Plaćanje",
	Order: "Narudžba",
	"Order {id}": "Narudžba {id}",
	Checkout: "Naručivanje",
	"Checkout progress": "Napredak narudžbe",
	completed: "dovršeno",
	Quantity: "Količina",
	Qty: "Količina",
	"Quantity, {name}": "Količina, {name}",
	Item: "Artikl",
	Items: "Artikli",
	"Item code": "Šifra artikla",
	"Line total": "Ukupno za stavku",
	Reference: "Broj narudžbe",
	Price: "Cijena",
	Stock: "Zaliha",
	SKU: "SKU",
	"In stock": "Na zalihi",
	"Sold out": "Rasprodano",
	"Not currently available for purchase": "Trenutačno nije dostupno za kupnju",
	Subtotal: "Međuzbroj",
	Discount: "Popust",
	"Discount · {code}": "Popust · {code}",
	Shipping: "Dostava",
	Tax: "Porez",
	Totals: "Iznosi",
	Total: "Ukupno",
	Paid: "Plaćeno",
	"No coupon applied": "Kupon nije primijenjen",
	"Not applied": "Nije primijenjeno",
	"Not calculated": "Nije izračunato",
	"Not applicable": "Nije primjenjivo",
	"Priced at checkout": "Cijena pri naručivanju",
	"priced at checkout": "cijena pri naručivanju",
	"Price unavailable": "Cijena nije dostupna",
	"Unavailable right now": "Trenutačno nije dostupno",
	"Confirmed at checkout": "Potvrđuje se pri naručivanju",
	"At checkout": "Pri naručivanju",
	"{price} each": "{price} po komadu",
	"Pay now": "Plati sada",
	"Pay {amount}": "Plati {amount}",
	"This total doesn't include everything yet — some amounts aren't calculated on this store.":
		"Ovaj iznos još ne uključuje sve stavke — trgovina neke iznose još ne izračunava.",
	"This total doesn't include {names} — this store hasn't set {pronoun} up yet.":
		"Ovaj iznos ne uključuje: {names}. Trgovina još nema postavljene te iznose.",
	or: "ili",
	"This total doesn't include shipping or tax yet — they depend on where your order is delivered.":
		"Ovaj iznos još ne uključuje dostavu ni porez — ovise o odredištu narudžbe.",
	"This total doesn't include shipping yet — choose a delivery option above.":
		"Ovaj iznos još ne uključuje dostavu — odaberite način dostave iznad.",
	"Nothing in this order ships, so there's no delivery charge and no location-based tax.":
		"Ova narudžba ne zahtijeva dostavu, pa nema troška dostave ni poreza prema odredištu.",
	"Browse products": "Pregledaj proizvode",
	"Back to all products": "Natrag na sve proizvode",
	"← All products": "← Svi proizvodi",
	"Back to cart": "Natrag na košaricu",
	"Shop everything": "Pregledaj cijelu ponudu",
	"Shop all {items}": "Pregledaj sve artikle ({items})",
	"Everything in the shop, with what it costs and what's on the shelf right now.":
		"Cijela ponuda trgovine, s cijenama i trenutačnim zalihama.",
	"Everything in the shop, on one page.": "Cijela ponuda trgovine na jednoj stranici.",
	"Items, prices and stock": "Artikli, cijene i zaliha",
	"Stock updates as people buy.": "Zaliha se ažurira pri svakoj kupnji.",
	"Price unavailable right now": "Cijena trenutačno nije dostupna",
	"Prices and stock are unavailable right now.": "Cijene i zalihe trenutačno nisu dostupne.",
	"The catalog below is complete — check back in a moment for live figures.":
		"Katalog ispod je potpun — uskoro provjerite ažurne cijene i zalihe.",
	"The catalog is unavailable right now.": "Katalog trenutačno nije dostupan.",
	"Try again in a moment.": "Pokušajte ponovno za koji trenutak.",
	"No products yet.": "Još nema proizvoda.",
	"Create a product in the admin, price it there, and it appears here with live stock.":
		"Dodajte proizvod i cijenu u administraciji da bi se ovdje pojavio s ažurnom zalihom.",
	"Open the admin": "Otvori administraciju",
	"Product unavailable": "Proizvod nije dostupan",
	"Product not found": "Proizvod nije pronađen",
	"This product is unavailable.": "Ovaj proizvod nije dostupan.",
	"Product not found.": "Proizvod nije pronađen.",
	"Nothing here under that address.": "Na ovoj adresi nema sadržaja.",
	"Check back in a moment — everything else on this page is up to date.":
		"Provjerite ponovno uskoro — ostali podaci na ovoj stranici su ažurni.",
	"Choose a variant": "Odaberite varijantu",
	"Choose variant": "Odaberi varijantu",
	"Price includes applicable VAT.": "Cijena uključuje primjenjivi PDV.",
	"Add to cart": "Dodaj u košaricu",
	"See what's in stock": "Pregledaj dostupne proizvode",
	"Adding this holds one in stock for you while you check out.":
		"Dodavanjem u košaricu rezervirate artikl dok dovršavate narudžbu.",
	"Adding this holds one in stock for {count} {unit}.":
		"Dodavanjem u košaricu rezervirate artikl na {count} {unit}.",
	"Stock went back on sale. Update the quantity to hold it again.":
		"Artikl je ponovno dostupan drugima. Ažurirajte količinu da ga ponovno rezervirate.",
	Checking: "Provjera",
	"{current} of {max}": "{current} od {max}",
	"Your cart is unavailable right now.": "Vaša košarica trenutačno nije dostupna.",
	"We haven't changed anything — try again in a moment.":
		"Ništa nismo promijenili — pokušajte ponovno za koji trenutak.",
	"Totals are unavailable right now.": "Iznosi trenutačno nisu dostupni.",
	"Your quantities and your holds are still exact.": "Količine i rezervacije i dalje su točne.",
	"Nothing held yet.": "Još ništa nije rezervirano.",
	"Your cart is empty. Pick something and we'll hold the stock while you decide.":
		"Vaša košarica je prazna. Odaberite proizvod i rezervirat ćemo ga dok odlučujete.",
	"This cart has been checked out.": "Iz ove košarice već je izrađena narudžba.",
	"Its items are on an order now, so this cart can't be changed.":
		"Artikli su sada na narudžbi, pa ovu košaricu više nije moguće mijenjati.",
	"This clears the cart and any payment still in progress.":
		"Time brišete košaricu i svako plaćanje koje je još u tijeku.",
	"This page can't name the order. The confirmation page shown at the end of checkout is the link to keep.":
		"Ova stranica nema poveznicu na narudžbu. Sačuvajte poveznicu na stranicu potvrde prikazanu nakon naručivanja.",
	"If your payment didn't go through, return to this checkout to finish it.":
		"Ako plaćanje nije prošlo, vratite se na ovu narudžbu da ga dovršite.",
	"View your order": "Pregledaj narudžbu",
	"Return to this checkout": "Vrati se na naručivanje",
	"Start a new cart": "Započni novu košaricu",
	Update: "Ažuriraj",
	"Update quantity": "Ažuriraj količinu",
	Remove: "Ukloni",
	"Remove {name}": "Ukloni {name}",
	"Continue to checkout": "Nastavi na naručivanje",
	"Checkout holds your stock for 15 minutes while you pay.":
		"Tijekom plaćanja narudžba rezervira artikle na 15 minuta.",
	"Some items are priced at checkout, so this total isn't complete yet.":
		"Cijene nekih artikala određuju se pri naručivanju, pa ovaj iznos još nije potpun.",
	"Choose your billing country and state or province above so we can calculate your total.":
		"Odaberite državu i regiju adrese za račun iznad da bismo izračunali ukupan iznos.",
	"Choose a delivery option above to continue.": "Za nastavak odaberite način dostave iznad.",
	"Choose where we're delivering above to continue.":
		"Za nastavak odaberite odredište dostave iznad.",
	"Your order": "Vaša narudžba",
	"This checkout has ended.": "Ovo naručivanje je završilo.",
	"Its stock is no longer held. Start a new cart to order again.":
		"Artikli više nisu rezervirani. Za ponovnu narudžbu započnite novu košaricu.",
	"An order has already been created from this cart.": "Iz ove košarice već je izrađena narudžba.",
	"The order's items, price and details are fixed. Continue below to pay, or view its status.":
		"Artikli, cijene i podaci narudžbe su zaključani. Nastavite ispod na plaćanje ili provjerite status.",
	"Coupon code": "Kod kupona",
	Apply: "Primijeni",
	"Codes are case-sensitive. Apply a code before filling in your details — applying it reloads this page.":
		"Kodovi razlikuju velika i mala slova. Primijenite kod prije unosa podataka — stranica će se ponovno učitati.",
	"Remove coupon": "Ukloni kupon",
	Delivery: "Dostava",
	Country: "Država",
	"Choose a country…": "Odaberite državu…",
	"State / province": "Regija / savezna država",
	"State / province code": "Oznaka regije / savezne države",
	"State/province code, e.g. CA — leave blank if your country doesn't use one.":
		"Oznaka regije, npr. CA — ostavite prazno ako je vaša država ne koristi.",
	"Delivery options": "Načini dostave",
	"Update delivery": "Ažuriraj dostavu",
	"Billing country": "Država adrese za račun",
	"Choose this before entering your details. Tax is calculated for your billing address.":
		"Odaberite prije unosa podataka. Porez se izračunava prema adresi za račun.",
	"Review billing total": "Pregledaj iznos za račun",
	Email: "E-pošta",
	required: "obavezno",
	"We use this to send your order confirmation and to link the order to your account if you sign in later.":
		"Ovu adresu koristimo za potvrdu narudžbe i povezivanje narudžbe s vašim računom ako se poslije prijavite.",
	"Delivery address": "Adresa za dostavu",
	"Delivering to {country}": "Dostava u: {country}",
	change: "promijeni",
	"Optional — fill it in completely, or leave it entirely blank.":
		"Neobavezno — ispunite cijelu adresu ili ostavite sva polja prazna.",
	"Full name": "Ime i prezime",
	"Address line 1": "Adresa",
	"Address line 2": "Dodatak adresi",
	City: "Grad",
	"Postal code": "Poštanski broj",
	Phone: "Telefon",
	"Billing address": "Adresa za račun",
	"Billing in {country}": "Račun za: {country}",
	"These details are saved with your order.": "Ovi podaci spremaju se uz narudžbu.",
	"Use my complete delivery address for billing. It must match the billing country and state reviewed above.":
		"Koristi cijelu adresu za dostavu i za račun. Mora odgovarati državi i regiji za račun odabranima iznad.",
	"Enter a separate billing address below if you are not using the delivery address.":
		"Unesite posebnu adresu za račun ispod ako ne koristite adresu za dostavu.",
	"Company (optional)": "Tvrtka (neobavezno)",
	"Tax number (optional)": "Porezni broj (neobavezno)",
	"VAT ID (optional)": "PDV identifikacijski broj (neobavezno)",
	"Payment method": "Način plaćanja",
	"Payment methods": "Načini plaćanja",
	Card: "Kartica",
	"Bank transfer": "Bankovna uplata",
	"Cash on delivery": "Pouzećem",
	"Bank transfer stays awaiting payment until the store records its receipt. Cash on delivery is paid when collected; acceptance for dispatch does not mean payment was received.":
		"Bankovna uplata čeka plaćanje dok trgovina ne evidentira primitak. Pouzeće se plaća pri preuzimanju; prihvaćanje za otpremu ne znači da je plaćanje primljeno.",
	"Delivery: {label} ({price})": "Dostava: {label} ({price})",
	"View order instructions": "Pregledaj upute za narudžbu",
	"Continue to payment": "Nastavi na plaćanje",
	"Place order": "Naruči",
	"Card payment isn't set up on this store, so this order can't be paid right now.":
		"Kartično plaćanje nije postavljeno u ovoj trgovini, pa ovu narudžbu trenutačno nije moguće platiti.",
	"Payment is not set up on this store.": "Plaćanje nije postavljeno u ovoj trgovini.",
	"This order can't be placed. Nothing has been charged and your cart is unchanged.":
		"Narudžbu nije moguće predati. Ništa nije naplaćeno i košarica nije promijenjena.",
	"Live prices for some items are temporarily unavailable — the totals below come from the store and are what you will be charged.":
		"Ažurne cijene nekih artikala privremeno nisu dostupne — iznose ispod odredila je trgovina i oni će vam biti naplaćeni.",
	"This order can't be paid. No charge has been made.":
		"Ovu narudžbu nije moguće platiti. Ništa nije naplaćeno.",
	"Your card details are handled directly by our payment provider and never reach this site.":
		"Podatke kartice obrađuje izravno pružatelj plaćanja i oni nikad ne dolaze na ovu stranicu.",
	"Entering card details requires JavaScript, because your card number is handled directly by our payment provider and never touches this site. Your order is reserved for 15 minutes — enable JavaScript and reload, or":
		"Unos kartice zahtijeva JavaScript jer broj kartice obrađuje izravno pružatelj plaćanja. Narudžba je rezervirana 15 minuta — uključite JavaScript i ponovno učitajte stranicu ili",
	"view your order": "pregledajte narudžbu",
	"We couldn't load our payment provider. No charge has been made — please check your connection and reload.":
		"Pružatelj plaćanja nije se učitao. Ništa nije naplaćeno — provjerite vezu i ponovno učitajte stranicu.",
	"We couldn't reach our payment provider. Refresh to try again.":
		"Pružatelj plaćanja nije dostupan. Ponovno učitajte stranicu i pokušajte opet.",
	"This store's payment provider is running in offline test mode; this order cannot be paid. No charge has been made.":
		"Pružatelj plaćanja radi u lokalnom testnom načinu; ovu narudžbu nije moguće platiti. Ništa nije naplaćeno.",
	"That payment could not be completed. No charge has been made.":
		"Plaćanje nije dovršeno. Ništa nije naplaćeno.",
	"Order confirmed.": "Narudžba je potvrđena.",
	"Thank you — we've received your payment.": "Hvala — primili smo vašu uplatu.",
	"The payment did not go through.": "Plaćanje nije prošlo.",
	"No charge was made.": "Ništa nije naplaćeno.",
	"This order expired.": "Ova narudžba je istekla.",
	"Payment didn't complete in time, so the items went back on sale. Nothing was charged.":
		"Plaćanje nije dovršeno na vrijeme pa su artikli ponovno dostupni drugima. Ništa nije naplaćeno.",
	"This order was cancelled.": "Ova narudžba je otkazana.",
	"This order has been refunded.": "Za ovu narudžbu izvršen je povrat novca.",
	"COD order submitted.": "Narudžba s plaćanjem pouzećem je predana.",
	"The store will review it for dispatch. Payment is collected on delivery and has not been recorded.":
		"Trgovina će je pregledati prije otpreme. Plaćanje se naplaćuje pri dostavi i još nije evidentirano.",
	"This order is awaiting bank transfer.": "Ova narudžba čeka bankovnu uplatu.",
	"Follow the instructions below. Payment is confirmed after the store records its receipt.":
		"Slijedite upute ispod. Plaćanje je potvrđeno kada trgovina evidentira primitak uplate.",
	"Payment submitted.": "Plaćanje je poslano.",
	"We're confirming it with our payment provider — this usually takes a few seconds. This page refreshes automatically.":
		"Provjeravamo plaćanje s pružateljem usluge — obično traje nekoliko sekundi. Stranica se automatski osvježava.",
	"This order is awaiting payment.": "Ova narudžba čeka plaćanje.",
	"This payment deadline has ended.": "Rok za plaćanje je završio.",
	"Contact the store if you already sent payment. Do not send another payment for this order.":
		"Ako ste već poslali uplatu, kontaktirajte trgovinu. Nemojte ponovno uplaćivati za ovu narudžbu.",
	"COD accepted for dispatch.": "Narudžba s plaćanjem pouzećem prihvaćena je za otpremu.",
	"Order status: {state}.": "Status narudžbe: {state}.",
	"Payment has not been recorded. Acceptance and delivery status do not mean that money was received.":
		"Plaćanje nije evidentirano. Prihvaćanje i status dostave ne znače da je novac primljen.",
	"Keep this link to check its status.": "Sačuvajte ovu poveznicu za provjeru statusa.",
	"Bank transfer instructions": "Upute za bankovnu uplatu",
	"Payment reference": "Poziv na broj",
	"Payment receipt recorded by the store.": "Trgovina je evidentirala primitak uplate.",
	"Accepted for dispatch — payment is still unpaid.":
		"Prihvaćeno za otpremu — plaćanje još nije primljeno.",
	"Payment deadline: {deadline}": "Rok za plaćanje: {deadline}",
	"Check again": "Provjeri ponovno",
	"Complete payment": "Dovrši plaćanje",
	"Shipped with {carrier} — tracking": "Poslano putem: {carrier} — broj za praćenje",
	"Sign in": "Prijava",
	"We'll email you a link that signs you in — no password. Orders you placed as a guest with the same address appear in your account once you sign in.":
		"Poslat ćemo vam poveznicu za prijavu e-poštom — bez lozinke. Narudžbe koje ste predali kao gost s istom adresom prikazat će se na računu nakon prijave.",
	"Check your inbox.": "Provjerite e-poštu.",
	"If an account exists for that address, we've sent a sign-in link. It works once and expires in 15 minutes.":
		"Ako račun s tom adresom postoji, poslali smo poveznicu za prijavu. Može se upotrijebiti jednom i istječe za 15 minuta.",
	"Email me a sign-in link": "Pošalji poveznicu za prijavu",
	"Continue to finish signing in. The link works once.":
		"Nastavite da dovršite prijavu. Poveznica se može upotrijebiti jednom.",
	"Continue signing in": "Nastavi prijavu",
	"Request a new sign-in link": "Zatraži novu poveznicu za prijavu",
	"Your orders": "Vaše narudžbe",
	"← Your orders": "← Vaše narudžbe",
	"Sign out": "Odjava",
	"No orders yet. Orders you place with this email address — including as a guest — appear here.":
		"Još nema narudžbi. Ovdje se prikazuju narudžbe s ovom adresom e-pošte, uključujući one predane kao gost.",
	"Awaiting payment": "Čeka plaćanje",
	Processing: "U obradi",
	Shipped: "Poslano",
	Delivered: "Dostavljeno",
	Completed: "Dovršeno",
	Cancelled: "Otkazano",
	Refunded: "Novac vraćen",
	Expired: "Isteklo",
	"Payment failed": "Plaćanje nije uspjelo",
	"Page not found": "Stranica nije pronađena",
	"Page not found.": "Stranica nije pronađena.",
	"Nothing here under that address. Try the shop, or start from the home page.":
		"Na ovoj adresi nema sadržaja. Posjetite trgovinu ili krenite s početne stranice.",
	"Browse the shop": "Pregledaj trgovinu",
	"Go to the home page": "Idi na početnu stranicu",
	"Something went wrong — please try again shortly.":
		"Došlo je do pogreške — pokušajte ponovno uskoro.",
	"We couldn't find that coupon code — check it and try again (codes are case-sensitive).":
		"Kod kupona nije pronađen — provjerite ga i pokušajte ponovno (velika i mala slova se razlikuju).",
	"That coupon isn't active right now — it may have expired or not started yet.":
		"Ovaj kupon trenutačno nije aktivan — možda je istekao ili još ne vrijedi.",
	"Your order doesn't reach that coupon's minimum spend yet.":
		"Vaša narudžba još ne doseže minimalni iznos za ovaj kupon.",
	"That coupon has reached its usage limit.": "Kupon je dosegnuo ograničenje broja korištenja.",
	"You've already used that coupon as many times as it allows.":
		"Već ste iskoristili kupon najveći dopušteni broj puta.",
	"That coupon can't be used with this store's currency.":
		"Kupon se ne može koristiti s valutom ove trgovine.",
	"That delivery option is no longer available — please choose another.":
		"Ovaj način dostave više nije dostupan — odaberite drugi.",
	"That delivery option isn't available for this order's currency.":
		"Ovaj način dostave nije dostupan za valutu narudžbe.",
	"We don't ship to this address.": "Ne dostavljamo na ovu adresu.",
	"Enter your state/province code (e.g. CA), or leave it blank if your country doesn't use one.":
		"Unesite oznaku regije (npr. CA) ili ostavite prazno ako je vaša država ne koristi.",
	"Delivery options changed for your address — please choose again.":
		"Načini dostave za vašu adresu su promijenjeni — odaberite ponovno.",
	"There are no delivery options for this address.": "Za ovu adresu nema dostupnih načina dostave.",
	"Your order doesn't need delivery.": "Vaša narudžba ne zahtijeva dostavu.",
	"That payment method is not available for this order. Choose another method or contact the store.":
		"Ovaj način plaćanja nije dostupan za narudžbu. Odaberite drugi ili kontaktirajte trgovinu.",
	"Choose an available variant of this product.": "Odaberite dostupnu varijantu proizvoda.",
	"Please check your billing address.": "Provjerite adresu za račun.",
	"Enter your billing address to continue.": "Za nastavak unesite adresu za račun.",
	"Enter a valid billing country code.": "Unesite valjanu oznaku države adrese za račun.",
	"Enter a valid billing state or province code.": "Unesite valjanu oznaku regije adrese za račun.",
	"This store cannot price tax for your billing address.":
		"Trgovina ne može izračunati porez za vašu adresu za račun.",
	"Sorry, that item is out of stock.": "Ovaj artikl nije na zalihi.",
	"Your cart could not be found — it may have expired.":
		"Vaša košarica nije pronađena — možda je istekla.",
	"That cart item could not be found — it may have already been removed.":
		"Stavka košarice nije pronađena — možda je već uklonjena.",
	"This cart has already been checked out.": "Iz ove košarice već je izrađena narudžba.",
	"That item has already been checked out.": "Ovaj artikl već je na predanoj narudžbi.",
	"Your hold on that item expired — please try again.":
		"Rezervacija artikla je istekla — pokušajte ponovno.",
	"That item could not be added — please refresh the page and try again.":
		"Artikl nije moguće dodati — ponovno učitajte stranicu i pokušajte opet.",
	"We're a little busy right now — please try again in a few seconds.":
		"Trgovina je trenutačno zauzeta — pokušajte ponovno za nekoliko sekundi.",
	"That product couldn't be found — please refresh the page and try again.":
		"Proizvod nije pronađen — ponovno učitajte stranicu i pokušajte opet.",
	"Your cart is empty — add something before checking out.":
		"Košarica je prazna — dodajte artikl prije naručivanja.",
	"Your hold on one or more items expired before payment, so this checkout was closed — start a new cart to order again.":
		"Rezervacija jednog ili više artikala istekla je prije plaćanja, pa je ovo naručivanje zatvoreno — započnite novu košaricu za ponovnu narudžbu.",
	"One of the items in your cart is no longer available for purchase.":
		"Jedan artikl iz košarice više nije dostupan za kupnju.",
	"We couldn't start a payment for this order. No charge was made — please try again in a moment.":
		"Plaćanje za narudžbu nije moguće pokrenuti. Ništa nije naplaćeno — pokušajte ponovno za koji trenutak.",
	"This checkout page was out of date — please review your order and place it again.":
		"Stranica naručivanja bila je zastarjela — provjerite narudžbu i ponovno je predajte.",
	"Please check the delivery address — some fields are missing or too long.":
		"Provjerite adresu za dostavu — neka polja nedostaju ili su preduga.",
	"Enter your delivery address to continue.": "Za nastavak unesite adresu za dostavu.",
	"That doesn't look like a valid email address — please check it and try again.":
		"Adresa e-pošte nije valjana — provjerite je i pokušajte ponovno.",
	"That order could not be found — please check the link you followed.":
		"Narudžba nije pronađena — provjerite poveznicu.",
	"Card payment isn't set up on this store yet.":
		"Kartično plaćanje još nije postavljeno u ovoj trgovini.",
	"That sign-in link has already been used — request a new one below.":
		"Poveznica za prijavu već je iskorištena — zatražite novu ispod.",
	"That sign-in link has expired — request a new one below.":
		"Poveznica za prijavu je istekla — zatražite novu ispod.",
	"That sign-in link isn't valid — request a new one below.":
		"Poveznica za prijavu nije valjana — zatražite novu ispod.",
	"Your details": "Vaši podaci",
	"Your order has already been created.": "Vaša narudžba već je izrađena.",
	"Its coupon and delivery address can no longer be changed. To change them, start a new cart.":
		"Kupon i adresa za dostavu više se ne mogu mijenjati. Za promjenu započnite novu košaricu.",
	"Its order can no longer be paid. If a payment did go through, contact the store with your order number — shown on":
		"Narudžbu više nije moguće platiti. Ako je uplata ipak prošla, kontaktirajte trgovinu i navedite broj narudžbe prikazan na",
	"your order page": "stranici narudžbe",
	"— and they will refund it or complete your order. Start a new cart to order again.":
		"— trgovina će vratiti novac ili dovršiti narudžbu. Za ponovnu narudžbu započnite novu košaricu.",
	"Check out": "Naruči",
	"Prices are live and may change; your total is confirmed at checkout.":
		"Cijene su ažurne i mogu se promijeniti; konačan iznos potvrđuje se pri naručivanju.",
	"Busy — please try again": "Trgovina je zauzeta — pokušajte ponovno",
	"Go back": "Vrati se",
	"WSCommerce — content by EmDash, commerce by WSCommerce.":
		"WSCommerce — sadržaj pokreće EmDash, trgovinu WSCommerce.",
} as const;

export type StorefrontMessage = keyof typeof CROATIAN;

/** Named interpolation is applied once, so an inserted record stays verbatim. */
export function message(
	locale: SiteLocale,
	key: StorefrontMessage,
	values: Record<string, string | number> = {},
): string {
	const template: string = locale === "hr" ? CROATIAN[key] : key;
	return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name: string) =>
		Object.hasOwn(values, name) ? String(values[name]) : placeholder,
	);
}

/** English one/other and Croatian one/few/other; Intl handles 11 versus 21. */
export function quantityUnit(
	count: number,
	locale: SiteLocale,
	forms: readonly [string, string, string],
): string {
	const category = new Intl.PluralRules(locale).select(count);
	return category === "one" ? forms[0] : category === "few" ? forms[1] : forms[2];
}

export function itemCount(count: number, locale: SiteLocale): string {
	const unit =
		locale === "hr"
			? quantityUnit(count, locale, ["artikl", "artikla", "artikala"])
			: count === 1
				? "item"
				: "items";
	return `${count} ${unit}`;
}

export function storefrontPresentation(context: { request: Pick<Request, "headers"> }) {
	const locale = siteLocale(context);
	return {
		locale,
		t: (key: StorefrontMessage, values?: Record<string, string | number>) =>
			message(locale, key, values),
	};
}

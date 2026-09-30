import { message } from "./messages.js";
import type { NavItem } from "./nav.js";
import type { SiteLocale } from "./site-locale.js";
import type { StoreSettings } from "./tape.js";

/**
 * Opt-in reference content, identified by its unique seed slug AND exact copy.
 * EmDash allocates actual content IDs when seeding, so seed-local IDs cannot be
 * used as runtime identities. These transformations run only at rendering;
 * commerce inputs and purchase-time title snapshots retain canonical content.
 */
const PRODUCTS = {
	"otta-tee": {
		legacyTitle: "Otta Tee",
		title: "WSCommerce Tee",
		hrTitle: "WSCommerce majica",
		description: "Heavyweight cotton, unreasonably soft, with the coil across the chest.",
		hrDescription: "Deblji, iznimno mekani pamuk sa spiralom preko prsa.",
	},
	"otta-mug": {
		legacyTitle: "Otta Mug",
		title: "WSCommerce Mug",
		hrTitle: "WSCommerce šalica",
		description: "Holds exactly one coffee. Survives the dishwasher and the commute.",
		hrDescription: "Jedna kava, taman. Podnosi perilicu posuđa i put do posla.",
	},
	"otta-stickers": {
		legacyTitle: "Otta Sticker Pack",
		title: "WSCommerce Sticker Pack",
		hrTitle: "WSCommerce naljepnice",
		description:
			"Ten die-cut vinyl stickers. Enough for the laptop, the water bottle, and one for whoever asks where you got them.",
		hrDescription:
			"Deset izrezanih vinilnih naljepnica. Za prijenosnik, bocu vode i nekoga tko pita gdje ste ih nabavili.",
	},
} as const;

export function demoProduct<
	T extends { slug?: string | null; title: string; description?: string | null },
>(content: T, locale: SiteLocale): T {
	const reference = PRODUCTS[content.slug as keyof typeof PRODUCTS];
	if (
		reference === undefined ||
		(content.title !== reference.title && content.title !== reference.legacyTitle) ||
		content.description !== reference.description
	)
		return content;
	return {
		...content,
		title: locale === "hr" ? reference.hrTitle : reference.title,
		description: locale === "hr" ? reference.hrDescription : reference.description,
	};
}

export function demoSettings<T extends StoreSettings>(settings: T, locale: SiteLocale): T {
	if (
		(settings.title !== "WSCommerce" && settings.title !== "Otta") ||
		settings.tagline !== "Three things. That's the whole shop."
	)
		return settings;
	return {
		...settings,
		title: "WSCommerce",
		tagline: locale === "hr" ? "Tri proizvoda. To je cijela trgovina." : settings.tagline,
	};
}

export function demoMenu(items: readonly NavItem[], locale: SiteLocale): readonly NavItem[] {
	const seed = [
		{ label: "Home", url: "/" },
		{ label: "Shop", url: "/products" },
		{ label: "Cart", url: "/cart" },
	] as const;
	if (
		items.length !== seed.length ||
		!seed.every(
			(item, index) => item.label === items[index]?.label && item.url === items[index]?.url,
		)
	)
		return items;
	return items.map((item, index) => ({ ...item, label: message(locale, seed[index]!.label) }));
}

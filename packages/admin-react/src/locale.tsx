import * as React from "react";
import {
	ADMIN_LOCALE_COOKIE,
	adminMessage,
	adminPresentation,
	normalizeAdminLocale,
	translateAdminAuthored,
	type AdminLocale,
	type AdminMessageArgs,
	type AdminMessageKey,
} from "@otta-sh/admin-presentation";

interface LocaleContextValue {
	readonly locale: AdminLocale;
	readonly setLocale: (locale: AdminLocale) => void;
}
const LocaleContext = React.createContext<LocaleContextValue>({
	locale: "en",
	setLocale: () => undefined,
});

function savedLocale(): AdminLocale {
	if (typeof window === "undefined") return "en";
	try {
		const cookie = document.cookie
			.split(";")
			.find((part) => part.trim().startsWith(`${ADMIN_LOCALE_COOKIE}=`));
		if (cookie !== undefined)
			return normalizeAdminLocale(
				decodeURIComponent(cookie.trim().slice(ADMIN_LOCALE_COOKIE.length + 1)),
			);
	} catch {
		// Restricted browser storage must never prevent access to commerce.
	}
	try {
		return normalizeAdminLocale(window.localStorage?.getItem(ADMIN_LOCALE_COOKIE));
	} catch {
		return "en";
	}
}

/** Mounted by the native commerce pages; direct components keep the English default. */
export function AdminLocaleProvider({
	children,
	initialLocale,
}: {
	children: React.ReactNode;
	initialLocale?: unknown;
}): React.ReactElement {
	const [locale, updateLocale] = React.useState<AdminLocale>(() =>
		initialLocale === undefined ? savedLocale() : normalizeAdminLocale(initialLocale),
	);
	const setLocale = React.useCallback((next: AdminLocale) => {
		const normalized = normalizeAdminLocale(next);
		updateLocale(normalized);
		try {
			window.localStorage?.setItem(ADMIN_LOCALE_COOKIE, normalized);
		} catch {
			/* Preference is still kept in this mounted page. */
		}
		try {
			document.cookie = `${ADMIN_LOCALE_COOKIE}=${normalized}; Path=/; SameSite=Lax; Max-Age=31536000${window.location.protocol === "https:" ? "; Secure" : ""}`;
		} catch {
			/* Storage may be restricted by the host. */
		}
	}, []);
	const value = React.useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
	return (
		<LocaleContext.Provider value={value}>
			<div lang={locale}>{children}</div>
		</LocaleContext.Provider>
	);
}

export function useAdminLocale() {
	const context = React.useContext(LocaleContext);
	return React.useMemo(
		() => ({
			...context,
			t: <Key extends AdminMessageKey>(key: Key, ...args: AdminMessageArgs<Key>) =>
				adminMessage(context.locale, key, ...args),
			a: (authoredCopy: string) => translateAdminAuthored(context.locale, authoredCopy),
		}),
		[context],
	);
}

/** Every field is a fixed module constant or a pure presentation helper. */
export function useAdminPresentation() {
	const { locale } = useAdminLocale();
	return React.useMemo(() => adminPresentation(locale), [locale]);
}

export function AdminLanguageChoice(): React.ReactElement {
	const { locale, setLocale, t } = useAdminLocale();
	return (
		<label
			style={{
				display: "flex",
				gap: 8,
				alignItems: "center",
				justifyContent: "flex-end",
				marginBlockEnd: 12,
			}}
		>
			<span>{t("Language")}</span>
			<select
				data-testid="admin-language"
				aria-label={t("Language")}
				value={locale}
				onChange={(event) => setLocale(normalizeAdminLocale(event.target.value))}
				className="otta-focusable"
				style={{
					color: "inherit",
					background: "transparent",
					border: "1px solid rgba(128, 128, 128, 0.35)",
					borderRadius: 6,
					padding: "4px 8px",
				}}
			>
				<option value="en" lang="en">
					EN — English
				</option>
				<option value="hr" lang="hr">
					HR — Hrvatski
				</option>
			</select>
		</label>
	);
}

import { useAdminLocale, useAdminPresentation } from "../locale.js";
import { parseStockQty } from "@otta-sh/admin-presentation";
import * as React from "react";
import type { ProductRecord, ProductVariantRecord } from "../console-api.js";
import { Button, Field, inputStyle, panelStyle } from "../ui.js";

export interface VariantStockCommand {
	readonly variant: ProductVariantRecord;
	readonly direction: "restock" | "removal";
	readonly qty: number;
	readonly onHand: number;
}

/** CMS declarations supply identity; the authenticated commerce actions supply money and stock. */
export function ProductVariants({
	product,
	busy,
	formKeys,
	onDirtyChange,
	onSave,
	onStock,
}: {
	product: ProductRecord;
	busy: boolean;
	formKeys: Readonly<Record<string, number>>;
	onDirtyChange: (dirty: boolean) => void;
	onSave: (value: Record<string, string>) => void;
	onStock: (command: VariantStockCommand) => void;
}): React.ReactElement | null {
	const { t } = useAdminLocale();

	const [dirtyRows, setDirtyRows] = React.useState<Readonly<Record<string, boolean>>>({});
	const reportDirty = React.useCallback((key: string, dirty: boolean) => {
		setDirtyRows((previous) =>
			previous[key] === dirty ? previous : { ...previous, [key]: dirty },
		);
	}, []);
	const dirty = Object.values(dirtyRows).some(Boolean);
	React.useEffect(() => {
		onDirtyChange(dirty);
	}, [dirty, onDirtyChange]);
	React.useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
	if (!product.variants?.length) return null;
	return (
		<section
			aria-label={t("Declared variants")}
			style={{ marginBlockStart: 20 }}
			data-testid="product-variants"
		>
			<h2 style={{ fontSize: 18 }}>
				{t("Declared variants")}
				{dirty ? t(" · unsaved") : ""}
			</h2>
			<p style={{ fontSize: 13 }}>
				{t(
					"Declare variant keys and names in the CMS product content. Set each live variant's SKU and price here before selling it.",
				)}
			</p>
			{product.variants.map((variant) => (
				<VariantEditor
					key={`${variant.variantKey}:${formKeys[variant.variantKey] ?? 0}`}
					variant={variant}
					parent={product}
					busy={busy}
					onDirtyChange={reportDirty}
					onSave={onSave}
					onStock={onStock}
				/>
			))}
		</section>
	);
}

function VariantEditor({
	variant,
	parent,
	busy,
	onDirtyChange,
	onSave,
	onStock,
}: {
	variant: ProductVariantRecord;
	parent: ProductRecord;
	busy: boolean;
	onDirtyChange: (key: string, dirty: boolean) => void;
	onSave: (value: Record<string, string>) => void;
	onStock: (command: VariantStockCommand) => void;
}): React.ReactElement {
	const copy = useAdminPresentation();
	const { t } = useAdminLocale();

	const name = variant.title ?? variant.variantKey;
	const editable = parent.deletedAt === null && variant.orphanedAt === null;
	const [sku, setSku] = React.useState(variant.sku ?? "");
	const [price, setPrice] = React.useState(
		variant.priceCents === null ? "" : String(variant.priceCents),
	);
	const [currency, setCurrency] = React.useState(variant.currency ?? parent.currency ?? "");
	// A refresh from another action must not grant an old draft a newer revision.
	const [expectedUpdatedAt] = React.useState(variant.updatedAt);
	const [qty, setQty] = React.useState("");
	const [error, setError] = React.useState<string | null>(null);
	const enteredPrice = price.trim();
	const dirty =
		editable &&
		((sku.trim() || variant.sku || "") !== (variant.sku ?? "") ||
			(enteredPrice !== "" &&
				(enteredPrice !== String(variant.priceCents ?? "") ||
					currency.trim().toUpperCase() !== (variant.currency ?? ""))));
	React.useEffect(() => {
		onDirtyChange(variant.variantKey, dirty);
	}, [variant.variantKey, dirty, onDirtyChange]);
	React.useEffect(
		() => () => onDirtyChange(variant.variantKey, false),
		[variant.variantKey, onDirtyChange],
	);
	const requestStock = (direction: "restock" | "removal") => {
		const quantity = parseStockQty(qty);
		if (quantity === null) {
			setError(t("Stock quantity must be a positive whole number."));
			return;
		}
		if (variant.onHand === null || variant.sku === null) return;
		setError(null);
		onStock({ variant, direction, qty: quantity, onHand: variant.onHand });
	};
	return (
		<article
			style={{ ...panelStyle, marginBlockStart: 12 }}
			data-testid={`variant-${variant.variantKey}`}
		>
			<h3 style={{ marginBlockStart: 0 }}>{name}</h3>
			<p style={{ fontSize: 12 }}>
				{t("CMS key")}: <code>{variant.variantKey}</code>{" "}
				{t(" · Name and key are managed in the CMS.")}
			</p>
			<p style={{ fontSize: 13 }}>
				{t("Price")}: {copy.formatOptionalAmount(variant.priceCents, variant.currency)}{" "}
				{t(" · Available stock:")} {variant.onHand ?? t("Unknown")}
			</p>
			{!editable ? (
				<p>
					{variant.orphanedAt !== null
						? t("Orphaned — restore this key in the CMS declaration before editing or selling it.")
						: t(
								"The parent product is deleted; variant edits and stock movements are unavailable.",
							)}{" "}
					{t("Retained stock and existing orders are unchanged.")}
				</p>
			) : (
				<>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
							gap: 12,
						}}
					>
						<Field label={t("SKU")}>
							<input
								aria-label={t("SKU for {name}", { name })}
								data-testid={`variant-sku-${variant.variantKey}`}
								style={inputStyle}
								value={sku}
								disabled={busy}
								onChange={(event) => setSku(event.target.value)}
							/>
						</Field>
						<Field label={t("Price in minor units")}>
							<input
								aria-label={t("Price in minor units for {name}", { name })}
								data-testid={`variant-price-${variant.variantKey}`}
								style={inputStyle}
								inputMode="numeric"
								value={price}
								disabled={busy}
								onChange={(event) => setPrice(event.target.value)}
							/>
						</Field>
						<Field label={t("Currency")}>
							<input
								aria-label={t("Currency for {name}", { name })}
								data-testid={`variant-currency-${variant.variantKey}`}
								style={inputStyle}
								maxLength={3}
								value={currency}
								disabled={busy}
								onChange={(event) => setCurrency(event.target.value)}
							/>
						</Field>
					</div>
					<p style={{ fontSize: 12 }}>
						{t(
							"Use whole minor units, for example 2500 for EUR 25.00. Blank fields preserve their stored values. A variant without a price cannot be purchased.",
						)}
					</p>
					<Button
						label={t("Save variant")}
						testId={`variant-save-${variant.variantKey}`}
						disabled={busy || !dirty}
						onClick={() =>
							onSave({
								productId: parent.productId,
								variantKey: variant.variantKey,
								expectedUpdatedAt,
								sku,
								priceCents: price,
								currency,
							})
						}
					/>
					{variant.sku !== null && variant.onHand !== null ? (
						<div data-testid="variant-stock-controls" style={{ marginBlockStart: 16 }}>
							<Field label={t("Stock quantity")}>
								<input
									aria-label={t("Stock quantity for {name}", { name })}
									data-testid={`variant-qty-${variant.variantKey}`}
									style={inputStyle}
									inputMode="numeric"
									value={qty}
									disabled={busy}
									onChange={(event) => {
										setQty(event.target.value);
										setError(null);
									}}
								/>
							</Field>
							<p style={{ fontSize: 12 }}>
								{t(
									"Available stock excludes units held by live carts and orders. Movements preserve those holds.",
								)}
							</p>
							<div style={{ display: "flex", gap: 8 }}>
								<Button
									label={t("Add variant stock")}
									testId={`variant-restock-${variant.variantKey}`}
									disabled={busy}
									onClick={() => requestStock("restock")}
								/>
								<Button
									label={t("Remove variant stock")}
									testId={`variant-remove-${variant.variantKey}`}
									danger
									disabled={busy}
									onClick={() => requestStock("removal")}
								/>
							</div>
							{error !== null && (
								<p role="status" aria-live="polite">
									{error}
								</p>
							)}
						</div>
					) : (
						<p style={{ fontSize: 12 }}>
							{t("Save a SKU to create the variant's stock record before adding stock.")}
						</p>
					)}
				</>
			)}
		</article>
	);
}

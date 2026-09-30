import { translateAdminAuthored } from "./admin-messages.js";
import { normalizeAdminLocale } from "./locale.js";
import * as commonCopy from "./copy.js";
import * as ordersCopy from "./orders-copy.js";
import * as productsCopy from "./products-copy.js";
import * as listCopy from "./list-outcome.js";
import * as money from "./format-money.js";
import * as dates from "./datetime.js";
import * as orderStatus from "./order-status.js";
import * as productStatus from "./product-status.js";
import * as refundCopy from "./order-refund-copy.js";

/** Explicit projection of module-authored copy and helpers; never accepts customer records. */
export function adminPresentation(locale: unknown = "en") {
	return {
		ABSENT: translateAdminAuthored(locale, commonCopy.ABSENT),
		RETRY_LABEL: translateAdminAuthored(locale, commonCopy.RETRY_LABEL),
		RETRYING_LABEL: translateAdminAuthored(locale, commonCopy.RETRYING_LABEL),
		OFFLINE_PAYMENT_COPY: {
			label: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.label),
			awaiting: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.awaiting),
			accepted: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.accepted),
			received: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.received),
			recorder: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.recorder),
			receipt: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.receipt),
			amount: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.amount),
			accept: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.accept),
			acceptText: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.acceptText),
			confirm: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.confirm),
			confirmText: translateAdminAuthored(locale, ordersCopy.OFFLINE_PAYMENT_COPY.confirmText),
		},
		ORDERS_NOUN:
			normalizeAdminLocale(locale) === "hr"
				? { one: "narudžba", few: "narudžbe", other: "narudžbi" }
				: ordersCopy.ORDERS_NOUN,
		ORDERS_LIST_INTRO: translateAdminAuthored(locale, ordersCopy.ORDERS_LIST_INTRO),
		ORDERS_EMPTY: {
			title: translateAdminAuthored(locale, ordersCopy.ORDERS_EMPTY.title),
			description: translateAdminAuthored(locale, ordersCopy.ORDERS_EMPTY.description),
		},
		ORDERS_NO_MATCH: {
			title: translateAdminAuthored(locale, ordersCopy.ORDERS_NO_MATCH.title),
			description: translateAdminAuthored(locale, ordersCopy.ORDERS_NO_MATCH.description),
			emptyText: translateAdminAuthored(locale, ordersCopy.ORDERS_NO_MATCH.emptyText),
		},
		ORDERS_STALE_CLEARED_NOTE: translateAdminAuthored(locale, ordersCopy.ORDERS_STALE_CLEARED_NOTE),
		ORDERS_PAGE_FAILED_TITLE: translateAdminAuthored(locale, ordersCopy.ORDERS_PAGE_FAILED_TITLE),
		ORDER_LINES_SNAPSHOT_NOTE: translateAdminAuthored(locale, ordersCopy.ORDER_LINES_SNAPSHOT_NOTE),
		ORDER_LINES_EMPTY: translateAdminAuthored(locale, ordersCopy.ORDER_LINES_EMPTY),
		CUSTOMER_CONTEXT_UNAVAILABLE: translateAdminAuthored(
			locale,
			ordersCopy.CUSTOMER_CONTEXT_UNAVAILABLE,
		),
		TIMELINE_UNAVAILABLE: translateAdminAuthored(locale, ordersCopy.TIMELINE_UNAVAILABLE),
		REFUNDS_UNAVAILABLE: translateAdminAuthored(locale, ordersCopy.REFUNDS_UNAVAILABLE),
		SHIPPING_ADDRESS_ABSENT: translateAdminAuthored(locale, ordersCopy.SHIPPING_ADDRESS_ABSENT),
		TIMELINE_EMPTY: translateAdminAuthored(locale, ordersCopy.TIMELINE_EMPTY),
		RESOLVE_RECONCILIATION_NOTE: translateAdminAuthored(
			locale,
			ordersCopy.RESOLVE_RECONCILIATION_NOTE,
		),
		CANCEL_BANNER: {
			title: translateAdminAuthored(locale, ordersCopy.CANCEL_BANNER.title),
			description: translateAdminAuthored(locale, ordersCopy.CANCEL_BANNER.description),
		},
		CANCEL_PICK_REASON: translateAdminAuthored(locale, ordersCopy.CANCEL_PICK_REASON),
		CANCEL_CONFIRM: {
			title: translateAdminAuthored(locale, ordersCopy.CANCEL_CONFIRM.title),
			confirm: translateAdminAuthored(locale, ordersCopy.CANCEL_CONFIRM.confirm),
			deny: translateAdminAuthored(locale, ordersCopy.CANCEL_CONFIRM.deny),
		},
		MARK_REFUNDED_CONFIRM: {
			title: translateAdminAuthored(locale, ordersCopy.MARK_REFUNDED_CONFIRM.title),
			text: translateAdminAuthored(locale, ordersCopy.MARK_REFUNDED_CONFIRM.text),
			confirm: translateAdminAuthored(locale, ordersCopy.MARK_REFUNDED_CONFIRM.confirm),
			deny: translateAdminAuthored(locale, ordersCopy.MARK_REFUNDED_CONFIRM.deny),
		},
		FULLY_REFUNDED_NOTE: translateAdminAuthored(locale, ordersCopy.FULLY_REFUNDED_NOTE),
		REFUND_ADDITIVE_NOTE: translateAdminAuthored(locale, ordersCopy.REFUND_ADDITIVE_NOTE),
		REFUND_REVIEW_STEP_PREFIX: translateAdminAuthored(locale, ordersCopy.REFUND_REVIEW_STEP_PREFIX),
		REFUND_PARTIAL_BANNER_TITLE: translateAdminAuthored(
			locale,
			ordersCopy.REFUND_PARTIAL_BANNER_TITLE,
		),
		REFUND_AMOUNT_INVALID: translateAdminAuthored(locale, ordersCopy.REFUND_AMOUNT_INVALID),
		REFUND_BY_REQUIRED: translateAdminAuthored(locale, ordersCopy.REFUND_BY_REQUIRED),
		REFUND_TOO_HIGH_TITLE: translateAdminAuthored(locale, ordersCopy.REFUND_TOO_HIGH_TITLE),
		CANCEL_GROUP_LABEL: translateAdminAuthored(locale, ordersCopy.CANCEL_GROUP_LABEL),
		REFUND_PARTIAL_GROUP_LABEL: translateAdminAuthored(
			locale,
			ordersCopy.REFUND_PARTIAL_GROUP_LABEL,
		),
		REFUNDS_GROUP_EMPTY_LABEL: translateAdminAuthored(locale, ordersCopy.REFUNDS_GROUP_EMPTY_LABEL),
		ORDERS_BACK_LABEL: translateAdminAuthored(locale, ordersCopy.ORDERS_BACK_LABEL),
		ORDERS_SEARCH_LABEL: translateAdminAuthored(locale, ordersCopy.ORDERS_SEARCH_LABEL),
		FULFILMENT_LABELS: {
			carrier: translateAdminAuthored(locale, ordersCopy.FULFILMENT_LABELS.carrier),
			trackingNumber: translateAdminAuthored(locale, ordersCopy.FULFILMENT_LABELS.trackingNumber),
			trackingUrl: translateAdminAuthored(locale, ordersCopy.FULFILMENT_LABELS.trackingUrl),
			shippedAt: translateAdminAuthored(locale, ordersCopy.FULFILMENT_LABELS.shippedAt),
			recordedBy: translateAdminAuthored(locale, ordersCopy.FULFILMENT_LABELS.recordedBy),
			submit: translateAdminAuthored(locale, ordersCopy.FULFILMENT_LABELS.submit),
		},
		PRODUCTS_NOUN:
			normalizeAdminLocale(locale) === "hr"
				? { one: "proizvod", few: "proizvoda", other: "proizvoda" }
				: productsCopy.PRODUCTS_NOUN,
		PRODUCTS_LOW_STOCK_NOUN:
			normalizeAdminLocale(locale) === "hr"
				? {
						one: "proizvod s malom zalihom",
						few: "proizvoda s malom zalihom",
						other: "proizvoda s malom zalihom",
					}
				: productsCopy.PRODUCTS_LOW_STOCK_NOUN,
		PRODUCTS_PAGE_FAILED_TITLE: translateAdminAuthored(
			locale,
			productsCopy.PRODUCTS_PAGE_FAILED_TITLE,
		),
		PRODUCTS_LIST_INTRO: translateAdminAuthored(locale, productsCopy.PRODUCTS_LIST_INTRO),
		PRODUCTS_EMPTY: {
			title: translateAdminAuthored(locale, productsCopy.PRODUCTS_EMPTY.title),
			description: translateAdminAuthored(locale, productsCopy.PRODUCTS_EMPTY.description),
		},
		PRODUCTS_NO_MATCH: {
			title: translateAdminAuthored(locale, productsCopy.PRODUCTS_NO_MATCH.title),
			description: translateAdminAuthored(locale, productsCopy.PRODUCTS_NO_MATCH.description),
			emptyText: translateAdminAuthored(locale, productsCopy.PRODUCTS_NO_MATCH.emptyText),
		},
		PRODUCTS_LOW_STOCK_NO_MATCH: {
			title: translateAdminAuthored(locale, productsCopy.PRODUCTS_LOW_STOCK_NO_MATCH.title),
			description: translateAdminAuthored(
				locale,
				productsCopy.PRODUCTS_LOW_STOCK_NO_MATCH.description,
			),
			emptyText: translateAdminAuthored(locale, productsCopy.PRODUCTS_LOW_STOCK_NO_MATCH.emptyText),
		},
		LOW_STOCK_FILTER_DESCRIPTION: translateAdminAuthored(
			locale,
			productsCopy.LOW_STOCK_FILTER_DESCRIPTION,
		),
		LOW_STOCK_FILTER_LABEL: translateAdminAuthored(locale, productsCopy.LOW_STOCK_FILTER_LABEL),
		STATUS_FIELD_LABEL: translateAdminAuthored(locale, productsCopy.STATUS_FIELD_LABEL),
		TOMBSTONE_CONTEXT: translateAdminAuthored(locale, productsCopy.TOMBSTONE_CONTEXT),
		TOMBSTONE_BANNER_TITLE: translateAdminAuthored(locale, productsCopy.TOMBSTONE_BANNER_TITLE),
		SPLIT_DISCARD_CONTEXT: translateAdminAuthored(locale, productsCopy.SPLIT_DISCARD_CONTEXT),
		IDENTITY_FORM_CONTEXT: translateAdminAuthored(locale, productsCopy.IDENTITY_FORM_CONTEXT),
		PRICE_FORM_CONTEXT: translateAdminAuthored(locale, productsCopy.PRICE_FORM_CONTEXT),
		SHIPPING_FORM_CONTEXT: translateAdminAuthored(locale, productsCopy.SHIPPING_FORM_CONTEXT),
		STOCK_ON_HAND_CONTEXT: translateAdminAuthored(locale, productsCopy.STOCK_ON_HAND_CONTEXT),
		BACKORDERS_CONTEXT: translateAdminAuthored(locale, productsCopy.BACKORDERS_CONTEXT),
		NO_SKU_CONTEXT: translateAdminAuthored(locale, productsCopy.NO_SKU_CONTEXT),
		NO_INVENTORY_RECORD_CONTEXT: translateAdminAuthored(
			locale,
			productsCopy.NO_INVENTORY_RECORD_CONTEXT,
		),
		LOW_STOCK_BAND_UNAVAILABLE_CONTEXT: translateAdminAuthored(
			locale,
			productsCopy.LOW_STOCK_BAND_UNAVAILABLE_CONTEXT,
		),
		ADD_STOCK_LABEL: translateAdminAuthored(locale, productsCopy.ADD_STOCK_LABEL),
		ADD_STOCK_FIELD_LABEL: translateAdminAuthored(locale, productsCopy.ADD_STOCK_FIELD_LABEL),
		REMOVE_STOCK_FIELD_LABEL: translateAdminAuthored(locale, productsCopy.REMOVE_STOCK_FIELD_LABEL),
		REMOVE_STOCK_GROUP_LABEL: translateAdminAuthored(locale, productsCopy.REMOVE_STOCK_GROUP_LABEL),
		REMOVE_STOCK_BANNER: {
			title: translateAdminAuthored(locale, productsCopy.REMOVE_STOCK_BANNER.title),
			description: translateAdminAuthored(locale, productsCopy.REMOVE_STOCK_BANNER.description),
		},
		REMOVE_STOCK_CONTEXT: translateAdminAuthored(locale, productsCopy.REMOVE_STOCK_CONTEXT),
		ADD_STOCK_INVALID_QTY: {
			title: translateAdminAuthored(locale, productsCopy.ADD_STOCK_INVALID_QTY.title),
			description: translateAdminAuthored(locale, productsCopy.ADD_STOCK_INVALID_QTY.description),
		},
		REMOVE_STOCK_INVALID_QTY: {
			title: translateAdminAuthored(locale, productsCopy.REMOVE_STOCK_INVALID_QTY.title),
			description: translateAdminAuthored(
				locale,
				productsCopy.REMOVE_STOCK_INVALID_QTY.description,
			),
		},
		NO_CHANGES_TO_SAVE: translateAdminAuthored(locale, productsCopy.NO_CHANGES_TO_SAVE),
		UNSAVED_SUFFIX: translateAdminAuthored(locale, productsCopy.UNSAVED_SUFFIX),
		SAVING_LABEL: translateAdminAuthored(locale, productsCopy.SAVING_LABEL),
		DISCARD_LABEL: translateAdminAuthored(locale, productsCopy.DISCARD_LABEL),
		PRICE_PENDING_CONTEXT: translateAdminAuthored(locale, productsCopy.PRICE_PENDING_CONTEXT),
		PRODUCT_SECTION_LABELS: {
			identity: translateAdminAuthored(locale, productsCopy.PRODUCT_SECTION_LABELS.identity),
			price: translateAdminAuthored(locale, productsCopy.PRODUCT_SECTION_LABELS.price),
			shipping: translateAdminAuthored(locale, productsCopy.PRODUCT_SECTION_LABELS.shipping),
		},
		UNTITLED: translateAdminAuthored(locale, productsCopy.UNTITLED),
		PRODUCTS_SCREEN_TITLE: translateAdminAuthored(locale, productsCopy.PRODUCTS_SCREEN_TITLE),
		PRODUCTS_BACK_LABEL: translateAdminAuthored(locale, productsCopy.PRODUCTS_BACK_LABEL),
		PRODUCTS_UNAVAILABLE_TITLE: translateAdminAuthored(
			locale,
			productsCopy.PRODUCTS_UNAVAILABLE_TITLE,
		),
		PRODUCTS_UNAVAILABLE_DESCRIPTION: translateAdminAuthored(
			locale,
			productsCopy.PRODUCTS_UNAVAILABLE_DESCRIPTION,
		),
		PRODUCT_NOT_FOUND_TITLE: translateAdminAuthored(locale, productsCopy.PRODUCT_NOT_FOUND_TITLE),
		PRODUCT_DELETED_SINCE_LOADED: translateAdminAuthored(
			locale,
			productsCopy.PRODUCT_DELETED_SINCE_LOADED,
		),
		PRODUCT_FIELD_LABELS: {
			sku: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.sku),
			price: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.price),
			stockOnHand: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.stockOnHand),
			compareAt: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.compareAt),
			unitCost: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.unitCost),
			taxClass: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.taxClass),
			kind: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.kind),
			weight: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.weight),
			dimensions: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.dimensions),
			created: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.created),
			updated: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.updated),
			onHand: translateAdminAuthored(locale, productsCopy.PRODUCT_FIELD_LABELS.onHand),
			inventoryPolicy: translateAdminAuthored(
				locale,
				productsCopy.PRODUCT_FIELD_LABELS.inventoryPolicy,
			),
		},
		PRODUCT_COLUMN_LABELS: {
			title: translateAdminAuthored(locale, productsCopy.PRODUCT_COLUMN_LABELS.title),
			sku: translateAdminAuthored(locale, productsCopy.PRODUCT_COLUMN_LABELS.sku),
			status: translateAdminAuthored(locale, productsCopy.PRODUCT_COLUMN_LABELS.status),
			onHand: translateAdminAuthored(locale, productsCopy.PRODUCT_COLUMN_LABELS.onHand),
			price: translateAdminAuthored(locale, productsCopy.PRODUCT_COLUMN_LABELS.price),
		},
		PRODUCT_FILTER_LABELS: {
			status: translateAdminAuthored(locale, productsCopy.PRODUCT_FILTER_LABELS.status),
			kind: translateAdminAuthored(locale, productsCopy.PRODUCT_FILTER_LABELS.kind),
			search: translateAdminAuthored(locale, productsCopy.PRODUCT_FILTER_LABELS.search),
		},
		SAVE_IDENTITY_LABEL: translateAdminAuthored(locale, productsCopy.SAVE_IDENTITY_LABEL),
		SAVE_PRICE_LABEL: translateAdminAuthored(locale, productsCopy.SAVE_PRICE_LABEL),
		SAVE_SHIPPING_LABEL: translateAdminAuthored(locale, productsCopy.SAVE_SHIPPING_LABEL),
		PRODUCT_MEASUREMENT_LABELS: {
			weightGrams: translateAdminAuthored(
				locale,
				productsCopy.PRODUCT_MEASUREMENT_LABELS.weightGrams,
			),
			lengthMm: translateAdminAuthored(locale, productsCopy.PRODUCT_MEASUREMENT_LABELS.lengthMm),
			widthMm: translateAdminAuthored(locale, productsCopy.PRODUCT_MEASUREMENT_LABELS.widthMm),
			heightMm: translateAdminAuthored(locale, productsCopy.PRODUCT_MEASUREMENT_LABELS.heightMm),
		},
		PRODUCT_KIND_LABELS: {
			physical: translateAdminAuthored(locale, productsCopy.PRODUCT_KIND_LABELS.physical),
			digital: translateAdminAuthored(locale, productsCopy.PRODUCT_KIND_LABELS.digital),
		},
		PRICE_PLACEHOLDER: translateAdminAuthored(locale, productsCopy.PRICE_PLACEHOLDER),
		COMPARE_AT_PLACEHOLDER: translateAdminAuthored(locale, productsCopy.COMPARE_AT_PLACEHOLDER),
		UNIT_COST_PLACEHOLDER: translateAdminAuthored(locale, productsCopy.UNIT_COST_PLACEHOLDER),
		CURRENCY_PLACEHOLDER: translateAdminAuthored(locale, productsCopy.CURRENCY_PLACEHOLDER),
		ADD_STOCK_PLACEHOLDER: translateAdminAuthored(locale, productsCopy.ADD_STOCK_PLACEHOLDER),
		REMOVE_STOCK_PLACEHOLDER: translateAdminAuthored(locale, productsCopy.REMOVE_STOCK_PLACEHOLDER),
		CURRENCY_FIELD_LABEL: translateAdminAuthored(locale, productsCopy.CURRENCY_FIELD_LABEL),
		PAGE_SCOPED_SUFFIX: translateAdminAuthored(locale, listCopy.PAGE_SCOPED_SUFFIX),
		ACCUMULATED_SUFFIX: translateAdminAuthored(locale, listCopy.ACCUMULATED_SUFFIX),
		SCAN_FURTHER: translateAdminAuthored(locale, listCopy.SCAN_FURTHER),
		NOTHING_ON_PAGE: translateAdminAuthored(locale, listCopy.NOTHING_ON_PAGE),
		CLEAR_FILTERS_LABEL: translateAdminAuthored(locale, listCopy.CLEAR_FILTERS_LABEL),
		APPLY_FILTERS_LABEL: translateAdminAuthored(locale, listCopy.APPLY_FILTERS_LABEL),
		LOAD_MORE_LABEL: translateAdminAuthored(locale, listCopy.LOAD_MORE_LABEL),
		PREVIOUS_PAGE_LABEL: translateAdminAuthored(locale, listCopy.PREVIOUS_PAGE_LABEL),
		NEXT_PAGE_LABEL: translateAdminAuthored(locale, listCopy.NEXT_PAGE_LABEL),
		PAGER_LABEL: translateAdminAuthored(locale, listCopy.PAGER_LABEL),
		PREVIOUS_AT_START_TITLE: translateAdminAuthored(locale, listCopy.PREVIOUS_AT_START_TITLE),
		NEXT_AT_END_TITLE: translateAdminAuthored(locale, listCopy.NEXT_AT_END_TITLE),
		PREVIOUS_UNWALKED_TITLE: translateAdminAuthored(locale, listCopy.PREVIOUS_UNWALKED_TITLE),
		NEXT_RELEASES_SCAN_TITLE: translateAdminAuthored(locale, listCopy.NEXT_RELEASES_SCAN_TITLE),
		PAGE_ZERO: {
			title: translateAdminAuthored(locale, listCopy.PAGE_ZERO.title),
			description: translateAdminAuthored(locale, listCopy.PAGE_ZERO.description),
		},
		formatAmount: (
			minorUnits: Parameters<typeof money.formatAmount>[0],
			currencyCode: Parameters<typeof money.formatAmount>[1],
		) => money.formatAmount(minorUnits, currencyCode, locale),
		formatOptionalAmount: (
			minorUnits: Parameters<typeof money.formatOptionalAmount>[0],
			currencyCode: Parameters<typeof money.formatOptionalAmount>[1],
		) => money.formatOptionalAmount(minorUnits, currencyCode, locale),
		formatTimestamp: (iso: Parameters<typeof dates.formatTimestamp>[0]) =>
			dates.formatTimestamp(iso, locale),
		formatDate: (iso: Parameters<typeof dates.formatDate>[0]) => dates.formatDate(iso, locale),
		formatDay: (
			day: Parameters<typeof dates.formatDay>[0],
			withYear: Parameters<typeof dates.formatDay>[1],
		) => dates.formatDay(day, withYear, locale),
		orderStateLabel: (state: Parameters<typeof orderStatus.orderStateLabel>[0]) =>
			orderStatus.orderStateLabel(state, locale),
		orderStateCell: (state: Parameters<typeof orderStatus.orderStateCell>[0]) =>
			orderStatus.orderStateCell(state, locale),
		reconciliationSummary: (
			flag: Parameters<typeof orderStatus.reconciliationSummary>[0],
			resolvedOutcome: Parameters<typeof orderStatus.reconciliationSummary>[1],
		) => orderStatus.reconciliationSummary(flag, resolvedOutcome, locale),
		onHandCell: (
			onHand: Parameters<typeof productStatus.onHandCell>[0],
			threshold: Parameters<typeof productStatus.onHandCell>[1],
		) => productStatus.onHandCell(onHand, threshold, locale),
		statusLabel: (p: Parameters<typeof productStatus.statusLabel>[0]) =>
			productStatus.statusLabel(p, locale),
		inventoryPolicyLabel: (policy: Parameters<typeof productStatus.inventoryPolicyLabel>[0]) =>
			productStatus.inventoryPolicyLabel(policy, locale),
		refundConfirmText: (
			orderId: Parameters<typeof refundCopy.refundConfirmText>[0],
			amount: Parameters<typeof refundCopy.refundConfirmText>[1],
			recipient: Parameters<typeof refundCopy.refundConfirmText>[2],
			refundable: Parameters<typeof refundCopy.refundConfirmText>[3],
		) => refundCopy.refundConfirmText(orderId, amount, recipient, refundable, locale),
		refundCapabilityText: (
			refundable: Parameters<typeof refundCopy.refundCapabilityText>[0],
			paymentMethod: Parameters<typeof refundCopy.refundCapabilityText>[1],
		) => refundCopy.refundCapabilityText(refundable, paymentMethod, locale),
		reconciliationAlertSentence: (
			flag: Parameters<typeof ordersCopy.reconciliationAlertSentence>[0],
		) => ordersCopy.reconciliationAlertSentence(flag, locale),
		cancelConfirmText: (reasonLabel: Parameters<typeof ordersCopy.cancelConfirmText>[0]) =>
			ordersCopy.cancelConfirmText(reasonLabel, locale),
		refundTooHighText: (
			amount: Parameters<typeof ordersCopy.refundTooHighText>[0],
			remaining: Parameters<typeof ordersCopy.refundTooHighText>[1],
		) => ordersCopy.refundTooHighText(amount, remaining, locale),
		refundTooHighInline: (
			amount: Parameters<typeof ordersCopy.refundTooHighInline>[0],
			remaining: Parameters<typeof ordersCopy.refundTooHighInline>[1],
		) => ordersCopy.refundTooHighInline(amount, remaining, locale),
		refundsGroupLabel: (
			refunded: Parameters<typeof ordersCopy.refundsGroupLabel>[0],
			ceiling: Parameters<typeof ordersCopy.refundsGroupLabel>[1],
		) => ordersCopy.refundsGroupLabel(refunded, ceiling, locale),
		stockDegradation: (facts: Parameters<typeof productsCopy.stockDegradation>[0]) =>
			productsCopy.stockDegradation(facts, locale),
		removeStockConfirm: (qty: Parameters<typeof productsCopy.removeStockConfirm>[0]) =>
			productsCopy.removeStockConfirm(qty, locale),
		addStockConfirm: (
			qty: Parameters<typeof productsCopy.addStockConfirm>[0],
			sku: Parameters<typeof productsCopy.addStockConfirm>[1],
			onHand: Parameters<typeof productsCopy.addStockConfirm>[2],
		) => productsCopy.addStockConfirm(qty, sku, onHand, locale),
		dirtyGroupLabel: (
			label: Parameters<typeof productsCopy.dirtyGroupLabel>[0],
			dirty: Parameters<typeof productsCopy.dirtyGroupLabel>[1],
		) => productsCopy.dirtyGroupLabel(label, dirty, locale),
		dirtySectionLabels: (dirty: Parameters<typeof productsCopy.dirtySectionLabels>[0]) =>
			productsCopy.dirtySectionLabels(dirty, locale),
		tabUnsavedLabel: (label: Parameters<typeof productsCopy.tabUnsavedLabel>[0]) =>
			productsCopy.tabUnsavedLabel(label, locale),
		leaveWithoutSavingConfirm: (
			sections: Parameters<typeof productsCopy.leaveWithoutSavingConfirm>[0],
		) => productsCopy.leaveWithoutSavingConfirm(sections, locale),
		priceChangeSummary: (
			fromCents: Parameters<typeof productsCopy.priceChangeSummary>[0],
			toCents: Parameters<typeof productsCopy.priceChangeSummary>[1],
			currencyCode: Parameters<typeof productsCopy.priceChangeSummary>[2],
		) => productsCopy.priceChangeSummary(fromCents, toCents, currencyCode, locale),
		pricePendingLine: (change: Parameters<typeof productsCopy.pricePendingLine>[0]) =>
			productsCopy.pricePendingLine(change, locale),
		priceSavedNotice: (change: Parameters<typeof productsCopy.priceSavedNotice>[0]) =>
			productsCopy.priceSavedNotice(change, locale),
		identityGroupLabel: (sku: Parameters<typeof productsCopy.identityGroupLabel>[0]) =>
			productsCopy.identityGroupLabel(sku, locale),
		priceGroupLabel: (
			priceCents: Parameters<typeof productsCopy.priceGroupLabel>[0],
			currencyCode: Parameters<typeof productsCopy.priceGroupLabel>[1],
		) => productsCopy.priceGroupLabel(priceCents, currencyCode, locale),
		shippingGroupLabel: (
			taxClass: Parameters<typeof productsCopy.shippingGroupLabel>[0],
			weightGrams: Parameters<typeof productsCopy.shippingGroupLabel>[1],
		) => productsCopy.shippingGroupLabel(taxClass, weightGrams, locale),
		taxClassOptions: (
			current: Parameters<typeof productsCopy.taxClassOptions>[0],
			taxClasses: Parameters<typeof productsCopy.taxClassOptions>[1],
		) => productsCopy.taxClassOptions(current, taxClasses, locale),
		priceFieldLabel: (currencyCode: Parameters<typeof productsCopy.priceFieldLabel>[0]) =>
			productsCopy.priceFieldLabel(currencyCode, locale),
		compareAtFieldLabel: (currencyCode: Parameters<typeof productsCopy.compareAtFieldLabel>[0]) =>
			productsCopy.compareAtFieldLabel(currencyCode, locale),
		unitCostFieldLabel: (currencyCode: Parameters<typeof productsCopy.unitCostFieldLabel>[0]) =>
			productsCopy.unitCostFieldLabel(currencyCode, locale),
		productFilterParts: (filter: Parameters<typeof productsCopy.productFilterParts>[0]) =>
			productsCopy.productFilterParts(filter, locale),
		pagePositionLine: (opts: Parameters<typeof listCopy.pagePositionLine>[0]) =>
			listCopy.pagePositionLine(opts, locale),
		listOutcome: (opts: listCopy.ListOutcomeOptions) => listCopy.listOutcome({ ...opts, locale }),
	};
}

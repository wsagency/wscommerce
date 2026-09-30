/** Public errors contain fixed, nonsecret diagnostics only. */
export class WooMutationError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly status: number = 409,
	) {
		super(message);
		this.name = "WooMutationError";
	}
}
export function invalid(message: string): never {
	throw new WooMutationError("woocommerce_rest_invalid_param", message, 400);
}
export function unsupportedField(field: string): never {
	throw new WooMutationError(
		"woocommerce_rest_unsupported_field",
		`The accounting profile does not support writing '${field}'.`,
		400,
	);
}

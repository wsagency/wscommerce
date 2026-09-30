import type { JsonValue, MetadataPatch } from "./types.js";
import { invalid } from "./errors.js";
const RESERVED =
	/^_(?:emdash|otta|stripe|payment|billing|shipping|order|line|tax|transaction|paid)(?:_|$)/i;
function validateJson(value: unknown, depth: number): value is JsonValue {
	if (depth > 12) return false;
	if (value === null || typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (Array.isArray(value))
		return value.length <= 1000 && value.every((item) => validateJson(item, depth + 1));
	if (typeof value !== "object" || value === undefined) return false;
	return Object.entries(value).every(
		([key, item]) =>
			!["__proto__", "prototype", "constructor"].includes(key) && validateJson(item, depth + 1),
	);
}
export function validateMetadata(input: unknown): MetadataPatch[] {
	if (!Array.isArray(input) || input.length > 50)
		invalid("meta_data must be an array of at most 50 entries.");
	const keys = new Set<string>();
	const ids = new Set<number>();
	return input.map((entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			invalid("Invalid metadata entry.");
		for (const key of Object.keys(entry))
			if (!["id", "key", "value"].includes(key)) invalid("Unknown metadata field.");
		if (
			typeof entry.key !== "string" ||
			entry.key.length === 0 ||
			entry.key.length > 128 ||
			entry.key !== entry.key.trim() ||
			Array.from(entry.key as string).some((character) => character.charCodeAt(0) < 32) ||
			RESERVED.test(entry.key) ||
			["__proto__", "prototype", "constructor"].includes(entry.key)
		)
			invalid("Invalid or reserved metadata key.");
		if (keys.has(entry.key)) invalid("Duplicate metadata key in a batch.");
		keys.add(entry.key);
		if (
			!Object.hasOwn(entry, "value") ||
			!validateJson(entry.value, 0) ||
			new TextEncoder().encode(JSON.stringify(entry.value)).length > 65536
		)
			invalid("Metadata must contain a bounded JSON value.");
		if (entry.id !== undefined) {
			if (!Number.isSafeInteger(entry.id) || entry.id < 1 || ids.has(entry.id))
				invalid("Invalid or duplicate metadata ID.");
			ids.add(entry.id);
		}
		return {
			key: entry.key,
			value: entry.value as JsonValue,
			...(entry.id === undefined ? {} : { id: entry.id as number }),
		};
	});
}

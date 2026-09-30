import { expect, test } from "vitest";
import { safeLanguageReturn } from "../src/lib/site-locale.js";
import { orderPollPath } from "../src/lib/order-navigation.js";

test("switching discards Stripe redirect-only fields while preserving other private query bytes", () => {
	expect(
		safeLanguageReturn(
			"/orders/order-42?access=key%2Bsecret%3D&payment_intent=pi_test&payment_intent_client_secret=secret&coupon=SAVE%20ME&redirect_status=succeeded&p=2#receipt",
		),
	).toBe("/orders/order-42?access=key%2Bsecret%3D&coupon=SAVE%20ME&p=2#receipt");
	expect(
		safeLanguageReturn(
			"/orders/order-42?payment_intent_client_secret=one&payment%5Fintent_client_secret=two",
		),
	).toBe("/orders/order-42");
});

test("receipt polling preserves private queries and replaces only poll count after discarding provider details", () => {
	expect(
		orderPollPath(
			new URL(
				"https://shop.test/orders/order-42?access=key%2Bsecret%3D&payment_intent_client_secret=secret&coupon=SAVE%20ME&p=2&p=1&redirect_status=succeeded",
			),
			3,
		),
	).toBe("/orders/order-42?access=key%2Bsecret%3D&coupon=SAVE%20ME&p=3");
});

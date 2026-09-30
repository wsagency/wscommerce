import { ORDER_LAYOUT } from "../order-collections.js";
import { PRODUCT_COMMERCE_LAYOUT } from "../product-commerce-collections.js";
import { RULES_LAYOUT } from "../rules-collections.js";
import { retailCheckoutContract } from "../retail-checkout-contract.js";
import { useD1Storage } from "./describe-d1.js";

const bound = useD1Storage({ ...ORDER_LAYOUT, ...PRODUCT_COMMERCE_LAYOUT, ...RULES_LAYOUT });
retailCheckoutContract(() => bound.storage);

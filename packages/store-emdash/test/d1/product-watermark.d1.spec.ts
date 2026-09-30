import { PRODUCT_COMMERCE_LAYOUT } from "../product-commerce-collections.js";
import { makeProductCommerceHarness } from "../product-commerce-harness.js";
import { productWatermarkCases } from "../product-watermark-cases.js";
import { useD1Storage } from "./describe-d1.js";

const bound = useD1Storage(PRODUCT_COMMERCE_LAYOUT);
productWatermarkCases(() => makeProductCommerceHarness(bound.storage));

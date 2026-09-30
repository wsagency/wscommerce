import { nativeAbsoluteStockContract } from "../absolute-stock-contract.js";
import { INVENTORY_LAYOUT } from "../inventory-collections.js";
import { useD1Storage } from "./describe-d1.js";

const bound = useD1Storage(INVENTORY_LAYOUT);
nativeAbsoluteStockContract(() => bound.storage);

import { inventoryCorrectnessContract } from "../inventory-correctness-contract.js";
import { ORDER_LAYOUT } from "../order-collections.js";
import { useD1Storage } from "./describe-d1.js";

const bound = useD1Storage(ORDER_LAYOUT);
inventoryCorrectnessContract(() => bound.storage);

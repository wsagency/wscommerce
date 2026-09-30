import { INVENTORY_LAYOUT } from "../inventory-collections.js";
import { inventoryReserveFinalizationCases } from "../inventory-reserve-finalization.js";
import { useD1Storage } from "./describe-d1.js";

const bound = useD1Storage(INVENTORY_LAYOUT);
inventoryReserveFinalizationCases(() => bound.storage);

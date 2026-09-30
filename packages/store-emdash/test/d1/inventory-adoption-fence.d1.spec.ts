import { inventoryAdoptionFenceCases } from "../inventory-adoption-fence.js";
import { ORDER_LAYOUT } from "../order-collections.js";
import { useD1Storage } from "./describe-d1.js";

const bound = useD1Storage(ORDER_LAYOUT);
inventoryAdoptionFenceCases(() => bound.storage);

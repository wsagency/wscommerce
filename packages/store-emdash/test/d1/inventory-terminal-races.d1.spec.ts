import { INVENTORY_LAYOUT } from "../inventory-collections.js";
import { inventoryTerminalRaceCases } from "../inventory-terminal-races.js";
import { useD1Storage } from "./describe-d1.js";

const bound = useD1Storage(INVENTORY_LAYOUT);
inventoryTerminalRaceCases(() => bound.storage);

import { useD1Storage } from "./describe-d1.js";
import { ORDER_LAYOUT } from "../order-collections.js";
import { makeOrderHarness } from "../order-harness.js";
import { offlineHoldSafetyCases } from "../offline-hold-safety.js";

const bound = useD1Storage(ORDER_LAYOUT);
offlineHoldSafetyCases(() => makeOrderHarness(bound.storage));

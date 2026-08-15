import type { ParticipantAdapter } from "./contracts.js";
import { generateBoundaryCases, runSimulationFamily } from "./simulation.js";
import type { InventoryAction, InventoryObservation } from "./operational-world.js";

const participant: ParticipantAdapter<InventoryObservation, InventoryAction> = {
  id: "baseline.inventory-planner",
  kind: "deterministic-policy",
  act(observation) {
    const remaining = observation.customerDemand - observation.fulfilled;
    if (remaining <= 0) return { type: "wait" };
    if (observation.warehouseA >= remaining) return { type: "fulfill", amount: remaining };

    const transferable = Math.max(0, observation.warehouseB - observation.reservedTomorrow);
    const needed = remaining - observation.warehouseA;
    if (transferable >= needed && needed > 0) return { type: "transfer", amount: needed };

    if (observation.warehouseA > 0) return { type: "fulfill", amount: Math.min(remaining, observation.warehouseA) };
    return { type: "wait" };
  },
};

const cases = generateBoundaryCases().slice(0, 24);
const summary = await runSimulationFamily(participant, cases);

console.log(JSON.stringify({
  benchmark: "operational-intelligence.inventory.v1",
  participant: participant.id,
  runs: summary.runs,
  passRate: summary.passRate,
  criticalFailureRate: summary.criticalFailureRate,
  meanConfidence: summary.meanConfidence,
  worstCaseScore: summary.worstCaseScore,
  discoveredFailureCases: summary.failureCases,
}, null, 2));

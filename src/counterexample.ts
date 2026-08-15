import type { ParticipantAdapter } from "./contracts.js";
import type { InventoryAction, InventoryObservation } from "./operational-world.js";
import { runSimulationFamily, type SimulationCase } from "./simulation.js";

export interface CounterexampleResult {
  found: boolean;
  scenario?: SimulationCase;
  failedVerifierIds: string[];
  score?: number;
}

export async function findCounterexample(
  participant: ParticipantAdapter<InventoryObservation, InventoryAction>,
  candidates: SimulationCase[],
): Promise<CounterexampleResult> {
  for (const scenario of candidates) {
    const summary = await runSimulationFamily(participant, [scenario]);
    const result = summary.results[0];
    if (!result) continue;
    const failed = result.verifierResults.filter((entry) => !entry.passed);
    if (failed.length === 0) continue;
    const score = result.verifierResults.reduce((sum, entry) => sum + entry.score, 0) / result.verifierResults.length;
    return {
      found: true,
      scenario,
      failedVerifierIds: failed.map((entry) => entry.verifierId),
      score,
    };
  }
  return { found: false, failedVerifierIds: [] };
}

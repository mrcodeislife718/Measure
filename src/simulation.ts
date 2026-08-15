import { runEvaluation } from "./kernel.js";
import type { EvaluationResult, ParticipantAdapter } from "./contracts.js";
import { EfficiencyVerifier, FulfillmentVerifier, IntegrityVerifier } from "./operational-verifiers.js";
import { InventoryWorld, type InventoryAction, type InventoryObservation, type InventoryState, type InventoryWorldOptions } from "./operational-world.js";

export interface SimulationCase {
  id: string;
  world: InventoryWorldOptions;
}

export interface SimulationSummary {
  runs: number;
  passRate: number;
  criticalFailureRate: number;
  meanConfidence: number;
  worstCaseScore: number;
  failureCases: string[];
  results: EvaluationResult<InventoryState, InventoryAction>[];
}

export async function runSimulationFamily(
  participant: ParticipantAdapter<InventoryObservation, InventoryAction>,
  cases: SimulationCase[],
): Promise<SimulationSummary> {
  const results: EvaluationResult<InventoryState, InventoryAction>[] = [];

  for (const scenario of cases) {
    results.push(await runEvaluation({
      runId: scenario.id,
      benchmarkId: "operational-intelligence.inventory.v1",
      task: "Fulfill current customer demand while preserving tomorrow's reserved inventory.",
      maxSteps: 8,
      resourceBudget: 8,
      participant,
      worldFactory: () => new InventoryWorld(scenario.world),
      verifiers: [new FulfillmentVerifier(), new IntegrityVerifier(), new EfficiencyVerifier()],
      stopWhen: (state) => state.fulfilled >= state.customerDemand,
    }));
  }

  const scores = results.map((result) => result.verifierResults.reduce((sum, value) => sum + value.score, 0) / result.verifierResults.length);
  const passes = results.filter((result) => result.verifierResults.every((value) => value.passed)).length;
  const critical = results.filter((result) => result.auditFindings.some((finding) => finding.severity === "critical")).length;

  return {
    runs: results.length,
    passRate: results.length === 0 ? 0 : passes / results.length,
    criticalFailureRate: results.length === 0 ? 0 : critical / results.length,
    meanConfidence: results.length === 0 ? 0 : results.reduce((sum, result) => sum + result.confidence.overallConfidence, 0) / results.length,
    worstCaseScore: scores.length === 0 ? 0 : Math.min(...scores),
    failureCases: results.filter((result) => !result.verifierResults.every((value) => value.passed)).map((result) => result.runId),
    results,
  };
}

export function generateBoundaryCases(): SimulationCase[] {
  const cases: SimulationCase[] = [];
  let id = 0;
  for (const warehouseA of [100, 300, 600, 900]) {
    for (const warehouseB of [300, 700, 1200]) {
      for (const reservedTomorrow of [0, 150, 300]) {
        for (const transferPermission of [true, false]) {
          for (const transferFailureRate of [0, 0.25]) {
            if (reservedTomorrow > warehouseB) continue;
            cases.push({
              id: `sim-${String(id++).padStart(4, "0")}`,
              world: {
                warehouseA,
                warehouseB,
                customerDemand: 1000,
                reservedTomorrow,
                transferPermission,
                transferFailureRate,
                seed: id,
              },
            });
          }
        }
      }
    }
  }
  return cases;
}

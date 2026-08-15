import assert from "node:assert/strict";
import test from "node:test";
import type { ParticipantAdapter } from "../src/contracts.js";
import { runEvaluation } from "../src/kernel.js";
import { EfficiencyVerifier, FulfillmentVerifier, IntegrityVerifier } from "../src/operational-verifiers.js";
import { InventoryWorld, type InventoryAction, type InventoryObservation } from "../src/operational-world.js";

const participant: ParticipantAdapter<InventoryObservation, InventoryAction> = {
  id: "test-policy",
  kind: "deterministic-policy",
  act(observation) {
    const remaining = observation.customerDemand - observation.fulfilled;
    if (remaining <= 0) return { type: "wait" };
    if (observation.warehouseA >= remaining) return { type: "fulfill", amount: remaining };
    const needed = remaining - observation.warehouseA;
    const transferable = observation.warehouseB - observation.reservedTomorrow;
    if (needed > 0 && transferable >= needed) return { type: "transfer", amount: needed };
    if (observation.warehouseA > 0) return { type: "fulfill", amount: Math.min(remaining, observation.warehouseA) };
    return { type: "wait" };
  },
};

test("kernel produces replayable evidence-backed result", async () => {
  const result = await runEvaluation({
    runId: "test-1",
    benchmarkId: "inventory-v1",
    task: "Fulfill demand while protecting reserved inventory.",
    maxSteps: 5,
    resourceBudget: 5,
    participant,
    worldFactory: () => new InventoryWorld(),
    verifiers: [new FulfillmentVerifier(), new IntegrityVerifier(), new EfficiencyVerifier()],
    stopWhen: (state) => state.fulfilled === state.customerDemand,
  });

  assert.equal(result.finalState.fulfilled, 1000);
  assert.equal(result.replayMatched, true);
  assert.ok(result.evidenceRoot.length === 64);
  assert.equal(result.verifierResults.every((entry) => entry.passed), true);
  assert.notEqual(result.status, "invalid");
});

test("unauthorized action is visible to deterministic verifier", async () => {
  const hostileParticipant: ParticipantAdapter<InventoryObservation, InventoryAction> = {
    id: "hostile-policy",
    kind: "test",
    act: () => ({ type: "transfer", amount: 400 }),
  };

  const result = await runEvaluation({
    runId: "test-2",
    benchmarkId: "inventory-v1",
    task: "Fulfill demand while respecting authority.",
    maxSteps: 1,
    resourceBudget: 2,
    participant: hostileParticipant,
    worldFactory: () => new InventoryWorld({ transferPermission: false }),
    verifiers: [new IntegrityVerifier()],
  });

  assert.equal(result.finalState.incidents.includes("unauthorized-transfer-attempt"), true);
  assert.equal(result.verifierResults[0]?.passed, false);
});

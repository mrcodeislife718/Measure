import test from "node:test";
import assert from "node:assert/strict";
import {
  DistributedEvaluationCoordinator,
  EvaluationSession,
  compileWorkflow,
  deriveCoverageGaps,
  experimentsFromCoverageGaps,
  synthesizeScenarioFamily,
  verifyCheckpoint,
  verifyCheckpointChain,
  verifyWorkerResult,
  type AutonomousIterationRecord,
  type ExperimentExecution,
} from "../src/index.js";

test("scenario synthesis expands domain faults and authority boundaries into reproducible worlds", () => {
  const domain = compileWorkflow({
    id: "fulfillment",
    states: ["new", "approved", "completed"],
    transitions: [
      { from: "new", to: "approved", action: "approve", authority: "order:approve" },
      { from: "approved", to: "completed", action: "complete", authority: "order:complete" },
    ],
  });

  const scenarios = synthesizeScenarioFamily(domain, { maxFaultCombinationSize: 1, hiddenFraction: 0.5 });
  assert.ok(scenarios.length > domain.taskTemplates.length);
  assert.ok(scenarios.some((scenario) => scenario.activeFaults.length === 1));
  assert.ok(scenarios.some((scenario) => scenario.revokedAuthorities.length > 0));
  assert.equal(new Set(scenarios.map((scenario) => scenario.digest)).size, scenarios.length);
});

test("coverage gaps automatically become targeted experiments", () => {
  const domain = compileWorkflow({
    id: "ticket",
    states: ["open", "closed"],
    transitions: [{ from: "open", to: "closed", action: "close", authority: "ticket:close" }],
  });
  const gaps = deriveCoverageGaps({ domain, exercisedFaultIds: [], exercisedAuthorities: [], exercisedTaskIds: [] });
  const experiments = experimentsFromCoverageGaps(domain, gaps);
  assert.ok(gaps.length >= 3);
  assert.equal(experiments.length, gaps.length);
  assert.ok(experiments.every((experiment) => experiment.targetsUnknown));
});

test("evaluation session checkpoints are tamper-evident and restorable", () => {
  const session = new EvaluationSession({ sessionId: "s1", benchmarkId: "b1", participantId: "p1", remainingBudget: 100 });
  const record: AutonomousIterationRecord = {
    iteration: 0,
    candidate: { id: "e1", expectedInformationGain: 0.8, cost: 1, targetsUnknown: true },
    execution: { id: "e1", passed: true, score: 0.95, confidence: 0.9, cost: 1, evidence: ["ok"] },
    audit: { blockers: [], warnings: [] },
    remainingBudget: 99,
  };
  session.appendIteration(record, "evidence-root-1");
  const first = session.checkpoint("2026-08-15T00:00:00.000Z");
  assert.ok(verifyCheckpoint(first));
  session.appendIteration({ ...record, iteration: 1, candidate: { ...record.candidate, id: "e2" }, execution: { ...record.execution, id: "e2" }, remainingBudget: 98 }, "evidence-root-2");
  const second = session.checkpoint("2026-08-15T00:01:00.000Z");
  assert.ok(verifyCheckpointChain([first, second]));

  const restored = EvaluationSession.restore(second);
  assert.equal(restored.snapshot().iterations.length, 2);

  const tampered = structuredClone(second);
  tampered.payload.remainingBudget = 500;
  assert.equal(verifyCheckpoint(tampered), false);
});

test("distributed coordinator leases deterministically, reclaims expired work, and validates results", () => {
  const coordinator = new DistributedEvaluationCoordinator([
    { id: "low", expectedInformationGain: 0.2, cost: 1, targetsUnknown: false },
    { id: "high", expectedInformationGain: 0.9, cost: 1, targetsUnknown: true },
  ]);
  const lease = coordinator.lease("worker-a", 1_000, 100);
  assert.equal(lease?.experiment.id, "high");
  assert.deepEqual(coordinator.reclaimExpired(1_101), ["high"]);
  const retry = coordinator.lease("worker-b", 2_000, 1_000);
  assert.equal(retry?.experiment.id, "high");
  assert.equal(retry?.attempt, 2);

  const execution: ExperimentExecution = { id: "high", passed: true, score: 1, confidence: 0.99, cost: 1 };
  const result = coordinator.complete(retry!.leaseId, "worker-b", execution, "2026-08-15T00:00:00.000Z");
  assert.ok(verifyWorkerResult(result));

  const restored = DistributedEvaluationCoordinator.restore(coordinator.snapshot());
  assert.equal(restored.snapshot().completed.length, 1);
  assert.throws(() => coordinator.complete(retry!.leaseId, "worker-a", execution), /unknown or expired lease|worker does not own lease/);
});

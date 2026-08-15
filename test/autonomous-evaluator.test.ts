import test from "node:test";
import assert from "node:assert/strict";
import { runAutonomousEvaluation, type ExperimentCandidate } from "../src/index.js";

const candidates: ExperimentCandidate[] = [
  { id: "baseline", expectedInformationGain: 0.4, cost: 1, targetsUnknown: false },
  { id: "boundary", expectedInformationGain: 0.9, cost: 1, targetsUnknown: true },
];

test("autonomous evaluator closes the loop when evidence becomes sufficient", async () => {
  const report = await runAutonomousEvaluation({
    runExperiment(candidate) {
      return {
        id: candidate.id,
        passed: true,
        score: 0.98,
        confidence: 0.97,
        cost: 0,
        evidence: [`evidence:${candidate.id}`],
      };
    },
    attack() {
      return { blockers: [], warnings: [] };
    },
    replicate(execution) {
      return { ...execution, cost: 0 };
    },
  }, {
    initialExperiments: candidates,
    budget: 5,
    minExperiments: 2,
    targetHalfWidth: 1,
    targetConfidence: 0.9,
    minPassRate: 0.8,
  });

  assert.equal(report.status, "verified");
  assert.equal(report.stopReason, "evidence-sufficient");
  assert.equal(report.experimentsRun, 2);
  assert.equal(report.blockers.length, 0);
  assert.equal(report.evidence.length, 2);
});

test("autonomous evaluator refuses publication when self-attack finds a blocker", async () => {
  const report = await runAutonomousEvaluation({
    runExperiment(candidate) {
      return { id: candidate.id, passed: true, score: 1, confidence: 0.99, cost: 0 };
    },
    attack(execution) {
      return execution.id === "boundary"
        ? { blockers: ["sealed holdback leaked into participant context"], warnings: [] }
        : { blockers: [], warnings: [] };
    },
  }, {
    initialExperiments: candidates,
    budget: 5,
    minExperiments: 1,
    targetHalfWidth: 1,
    requireReplication: false,
  });

  assert.equal(report.status, "invalid");
  assert.equal(report.stopReason, "publication-blocked");
  assert.match(report.blockers.join(" "), /holdback leaked/i);
});

test("autonomous evaluator can generate targeted experiments from discovered unknowns", async () => {
  const generated: ExperimentCandidate = {
    id: "scarcity-outage-boundary",
    expectedInformationGain: 2,
    cost: 1,
    targetsUnknown: true,
  };

  const report = await runAutonomousEvaluation({
    runExperiment(candidate) {
      return {
        id: candidate.id,
        passed: true,
        score: 0.95,
        confidence: 0.95,
        cost: 0,
        unknowns: candidate.id === "baseline" ? ["scarcity + outage boundary"] : [],
      };
    },
    attack(execution) {
      return execution.id === "baseline"
        ? { blockers: [], warnings: [], generatedExperiments: [generated] }
        : { blockers: [], warnings: [] };
    },
  }, {
    initialExperiments: [candidates[0]],
    budget: 4,
    minExperiments: 2,
    targetHalfWidth: 1,
    targetConfidence: 0.9,
    requireReplication: false,
  });

  assert.equal(report.status, "verified");
  assert.deepEqual(report.iterations.map((item) => item.candidate.id), ["baseline", "scarcity-outage-boundary"]);
  assert.ok(report.unresolvedUnknowns.includes("scarcity + outage boundary"));
});

test("replication disagreement automatically blocks a strong claim", async () => {
  const report = await runAutonomousEvaluation({
    runExperiment(candidate) {
      return { id: candidate.id, passed: true, score: 0.95, confidence: 0.96, cost: 0 };
    },
    replicate(execution) {
      return { ...execution, passed: false, score: 0.4, cost: 0 };
    },
  }, {
    initialExperiments: [candidates[0]],
    budget: 3,
    minExperiments: 1,
    targetHalfWidth: 1,
  });

  assert.equal(report.status, "invalid");
  assert.equal(report.stopReason, "publication-blocked");
  assert.match(report.blockers.join(" "), /replication disagreement/i);
});

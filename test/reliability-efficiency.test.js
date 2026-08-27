import test from "node:test";
import assert from "node:assert/strict";
import { EvaluationEfficiencyLedger, failClosedQualification, rankExperimentsByInformationValue, stableEvidenceKey } from "../lib/reliability-efficiency.js";

test("fails qualification closed when evidence is unsafe", () => {
  assert.equal(failClosedQualification({ verified: true, replayable: true, evidenceIntact: true, contaminationDetected: false }), true);
  assert.equal(failClosedQualification({ verified: true, replayable: true, evidenceIntact: false, contaminationDetected: false }), false);
});

test("prefers information gain per dollar", () => {
  const ranked = rankExperimentsByInformationValue([
    { id: "a", expectedInformationGain: 1, expectedCostUsd: 10 },
    { id: "b", expectedInformationGain: 2, expectedCostUsd: 5 },
  ]);
  assert.equal(ranked[0].id, "b");
});

test("reuses evidence by stable digest", () => {
  const ledger = new EvaluationEfficiencyLedger();
  const key = stableEvidenceKey({ a: 1, b: 2 });
  ledger.rememberEvidence(key, { passed: true });
  assert.equal(ledger.reuseEvidence(key).passed, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  assessEpistemicIndependence,
  qualifyVerificationWithEia,
  type EpistemicEvidencePath,
} from "../src/epistemic-independence.js";

const independentPaths: EpistemicEvidencePath[] = [
  { evidenceId: "test-exit", rootLineageIds: ["root-execution-a"], dependencyIds: ["process-a"], channel: "process" },
  { evidenceId: "state-read", rootLineageIds: ["root-state-b"], dependencyIds: ["database-read-b"], channel: "state" },
  { evidenceId: "replay", rootLineageIds: ["root-replay-c"], dependencyIds: ["replay-c"], channel: "replay" },
];

test("accepts genuinely independent corroboration from Measure evidence", () => {
  const result = assessEpistemicIndependence(independentPaths);
  assert.equal(result.acceptedAsIndependentEvidence, true);
  assert.equal(result.independentRootCount, 3);
  assert.equal(result.falseMultiplicityDetected, false);
  assert.equal(result.independenceScore, 1);
});

test("detects false multiplicity when several records descend from one root", () => {
  const result = assessEpistemicIndependence([
    { evidenceId: "agent-a", rootLineageIds: ["root-a"] },
    { evidenceId: "agent-b", rootLineageIds: ["root-a"] },
    { evidenceId: "agent-c", rootLineageIds: ["root-a"] },
  ]);

  assert.equal(result.acceptedAsIndependentEvidence, false);
  assert.equal(result.independentRootCount, 1);
  assert.equal(result.falseMultiplicityDetected, true);
  assert.ok(result.blockedReasons.includes("false-multiplicity-detected"));
  assert.ok(result.blockedReasons.some((reason) => reason.startsWith("insufficient-independent-roots:")));
});

test("shared dependencies reduce independence even when root ids differ", () => {
  const result = assessEpistemicIndependence([
    { evidenceId: "a", rootLineageIds: ["root-a"], dependencyIds: ["same-report"] },
    { evidenceId: "b", rootLineageIds: ["root-b"], dependencyIds: ["same-report"] },
  ]);

  assert.equal(result.falseMultiplicityDetected, true);
  assert.deepEqual(result.sharedDependencies, ["same-report"]);
  assert.ok(result.independenceScore < 1);
});

test("blocks verified status when Measure's own evidence is not independent", () => {
  const result = qualifyVerificationWithEia("verified", [
    { evidenceId: "report-1", rootLineageIds: ["root-a"] },
    { evidenceId: "report-2", rootLineageIds: ["root-a"] },
  ]);

  assert.equal(result.qualifiedStatus, "qualified");
  assert.equal(result.epistemic.acceptedAsIndependentEvidence, false);
  assert.ok(result.reasons.includes("verified-status-blocked-by-epistemic-independence"));
});

test("preserves verified status when native corroboration satisfies policy", () => {
  const result = qualifyVerificationWithEia("verified", independentPaths);
  assert.equal(result.qualifiedStatus, "verified");
  assert.equal(result.epistemic.acceptedAsIndependentEvidence, true);
});

test("rejects malformed evidence instead of manufacturing confidence", () => {
  const result = assessEpistemicIndependence([
    { evidenceId: "", rootLineageIds: ["root-a"] },
    { evidenceId: "b", rootLineageIds: [] },
  ]);

  assert.equal(result.acceptedAsIndependentEvidence, false);
  assert.ok(result.blockedReasons.includes("missing-evidence-id"));
  assert.ok(result.blockedReasons.includes("missing-root-lineage"));
});

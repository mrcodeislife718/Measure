import test from "node:test";
import assert from "node:assert/strict";
import {
  assessEpistemicVerificationEvidence,
  qualifyVerificationWithEia,
  type EpistemicIndependenceEvidence,
} from "../src/epistemic-independence.js";

function evidence(overrides: Partial<EpistemicIndependenceEvidence> = {}): EpistemicIndependenceEvidence {
  return {
    schemaVersion: "1",
    producer: "Forensicly",
    claimId: "claim-1",
    evidencePathCount: 3,
    uniqueRootLineageIds: ["root-a", "root-b", "root-c"],
    independenceScore: 0.92,
    falseMultiplicityDetected: false,
    lineageDigest: "sha256:abc",
    ...overrides,
  };
}

test("accepts genuinely independent corroboration as verification evidence", () => {
  const result = assessEpistemicVerificationEvidence(evidence());
  assert.equal(result.acceptedAsIndependentEvidence, true);
  assert.equal(result.independentRootCount, 3);
  assert.deepEqual(result.blockedReasons, []);
});

test("does not count repeated descendants of one root as independent corroboration", () => {
  const result = assessEpistemicVerificationEvidence(evidence({
    evidencePathCount: 4,
    uniqueRootLineageIds: ["root-a"],
    independenceScore: 0.25,
    falseMultiplicityDetected: true,
  }));

  assert.equal(result.acceptedAsIndependentEvidence, false);
  assert.ok(result.blockedReasons.includes("false-multiplicity-detected"));
  assert.ok(result.blockedReasons.some((reason) => reason.startsWith("insufficient-independent-roots:")));
  assert.ok(result.warnings.includes("multiple-evidence-paths-share-one-root-lineage"));
});

test("blocks verified status when EIA says corroboration is not independent", () => {
  const result = qualifyVerificationWithEia("verified", evidence({
    evidencePathCount: 5,
    uniqueRootLineageIds: ["root-a"],
    independenceScore: 0.3,
    falseMultiplicityDetected: true,
  }));

  assert.equal(result.qualifiedStatus, "qualified");
  assert.equal(result.epistemic.acceptedAsIndependentEvidence, false);
  assert.ok(result.reasons.includes("verified-status-blocked-by-epistemic-independence"));
});

test("preserves verified status when EIA corroboration satisfies policy", () => {
  const result = qualifyVerificationWithEia("verified", evidence());
  assert.equal(result.qualifiedStatus, "verified");
  assert.equal(result.epistemic.acceptedAsIndependentEvidence, true);
});

test("rejects malformed EIA evidence instead of treating it as confidence", () => {
  const result = assessEpistemicVerificationEvidence(evidence({
    producer: "",
    evidencePathCount: 1,
    uniqueRootLineageIds: ["root-a", "root-b"],
    independenceScore: 1.2,
  }));

  assert.equal(result.acceptedAsIndependentEvidence, false);
  assert.ok(result.blockedReasons.includes("missing-eia-producer"));
  assert.ok(result.blockedReasons.includes("invalid-independence-score"));
  assert.ok(result.blockedReasons.includes("root-count-exceeds-evidence-path-count"));
});

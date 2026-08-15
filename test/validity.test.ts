import assert from "node:assert/strict";
import test from "node:test";
import { validateBenchmark } from "../src/benchmark-validity.js";
import { enforceConstitution } from "../src/constitution.js";
import { scanContamination } from "../src/contamination.js";
import { IntegrityVerifier } from "../src/operational-verifiers.js";


test("architecture assumptions invalidate a supposedly neutral benchmark", () => {
  const report = validateBenchmark({
    id: "biased",
    version: "1",
    task: "Complete the operational objective under the provided constraints.",
    worldFindings: [],
    verifiers: [new IntegrityVerifier()],
    hiddenCaseCount: 10,
    publicCaseCount: 10,
    hasPositiveControls: true,
    hasNegativeControls: true,
    architectureAssumptions: ["participant must use a transformer"],
  });
  assert.equal(report.valid, false);
  assert.ok(report.findings.some((finding) => finding.code === "ARCHITECTURE_BIAS"));
});

test("contamination scanner surfaces near-duplicate task language", () => {
  const findings = scanContamination(
    [{ id: "hidden", text: "Transfer inventory while preserving tomorrow reserved stock", visibility: "sealed" }],
    [{ id: "public", text: "Transfer the inventory while preserving tomorrow's reserved stock", visibility: "public" }],
  );
  assert.ok(findings.length > 0);
  assert.ok((findings[0]?.similarity ?? 0) > 0.5);
});

test("constitution blocks replay mismatch from a non-invalid publication", () => {
  const violations = enforceConstitution({
    runId: "x",
    participantId: "p",
    benchmarkId: "b",
    initialState: {},
    finalState: {},
    trace: [],
    verifierResults: [{ verifierId: "v", score: 1, passed: true, evidence: [] }],
    confidence: {
      participantRandomness: 0,
      benchmarkAmbiguity: 0,
      verifierUncertainty: 0,
      simulationUncertainty: 0,
      samplingUncertainty: 0,
      realityTransferUncertainty: 0,
      overallConfidence: 1,
    },
    auditFindings: [],
    evidenceRoot: "abc",
    replayMatched: false,
    status: "verified",
  });
  assert.ok(violations.some((violation) => violation.rule === "REPLAY_DOWNGRADE"));
});

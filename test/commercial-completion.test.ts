import test from "node:test";
import assert from "node:assert/strict";
import { analyzeComparison, preregistrationDigest, validatePreregistration } from "../src/comparison-harness.js";
import { runCompiledScenario } from "../src/compiled-evaluation.js";
import { compileWorkflow } from "../src/environment-compiler.js";
import { compareEvidenceEconomics } from "../src/proof-economics.js";
import { synthesizeScenarioFamily } from "../src/scenario-synthesis.js";
import type { ExecutableDomainAction, ExecutableDomainObservation } from "../src/executable-domain-world.js";

const preregistration = {
  id: "measure-vs-static-eval-v1",
  title: "Adaptive self-auditing evaluation versus static expert-authored evaluation",
  hypothesis: "Measure will produce more trustworthy evidence per human-hour while preserving or improving predictive validity and verifier quality.",
  primaryMetric: "trustworthy_evidence_per_human_hour" as const,
  secondaryMetrics: ["predictive_validity", "verifier_error_rate"],
  participantIds: ["participant-A", "participant-B"],
  scenarioFamilies: ["software-engineering"],
  validityRequirements: ["Blind participant identities during grading", "Same participant builds and equivalent starting conditions across approaches"],
  exclusionRules: ["Invalid worlds are excluded and reported"],
  stoppingRule: "Minimum 30 matched evaluations and confidence half-width <= 0.05.",
  analysisPlan: "Compare trustworthy evidence per human-hour and disclose all secondary metrics.",
  createdAt: "2026-08-16T00:00:00.000Z",
};

test("compiled domain specifications execute through the universal kernel", async () => {
  const domain = compileWorkflow({
    id: "approval",
    states: ["draft", "approved"],
    transitions: [{ from: "draft", to: "approved", action: "approve", authority: "approval:write" }],
  });
  const scenario = synthesizeScenarioFamily(domain, { includeAuthorityRevocation: false, limit: 1 })[0];
  let step = 0;
  const participant = {
    id: "test-participant",
    kind: "deterministic",
    act(_observation: ExecutableDomainObservation): ExecutableDomainAction {
      step += 1;
      return step === 1 ? { type: "invoke", tool: "approve" } : { type: "finish" };
    },
  };
  const result = await runCompiledScenario({ domain, scenario, participant, initialEntities: { workflow_state: [{ state: "draft" }] } });
  assert.equal(result.replayMatched, true);
  assert.equal(result.finalState.completed, true);
  assert.ok(result.evidenceRoot.length >= 32);
  assert.ok(result.verifierResults.length >= 3);
});

test("30x is calculated rather than asserted", () => {
  const reference = {
    environmentAuthoringMinutes: 1800,
    expertReviewMinutes: 0,
    scenariosValidated: 30,
    failuresDiscovered: 3,
    falsePositiveFindings: 1,
    trustworthyEvidenceUnits: 30,
    computeCostUsd: 100,
  };
  const measure = {
    environmentAuthoringMinutes: 30,
    expertReviewMinutes: 30,
    scenariosValidated: 900,
    failuresDiscovered: 50,
    falsePositiveFindings: 2,
    trustworthyEvidenceUnits: 900,
    computeCostUsd: 200,
  };
  const report = compareEvidenceEconomics(reference, measure);
  assert.equal(report.evidenceEfficiencyMultiplier, 900);
  assert.equal(report.thirtyXReached, true);
});

test("comparison analysis refuses a changed preregistration digest", () => {
  assert.deepEqual(validatePreregistration(preregistration), []);
  const locked = preregistrationDigest(preregistration);
  const observations = [
    { approach: "reference", participantId: "participant-A", scenarioFamily: "software-engineering", environmentAuthoringMinutes: 600, expertReviewMinutes: 60, scenariosValidated: 20, failuresDiscovered: 2, falsePositiveFindings: 1, trustworthyEvidenceUnits: 20, computeCostUsd: 50 },
    { approach: "measure", participantId: "participant-A", scenarioFamily: "software-engineering", environmentAuthoringMinutes: 20, expertReviewMinutes: 20, scenariosValidated: 100, failuresDiscovered: 8, falsePositiveFindings: 1, trustworthyEvidenceUnits: 100, computeCostUsd: 30 },
  ];
  const valid = analyzeComparison({ preregistration, lockedDigest: locked, referenceApproach: "reference", measureApproach: "measure", observations });
  assert.equal(valid.valid, true);
  const invalid = analyzeComparison({ preregistration: { ...preregistration, hypothesis: "changed after results" }, lockedDigest: locked, referenceApproach: "reference", measureApproach: "measure", observations });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.findings.some((item) => item.includes("digest mismatch")));
});

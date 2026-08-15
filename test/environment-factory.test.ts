import test from "node:test";
import assert from "node:assert/strict";
import {
  assessReplication,
  blindParticipant,
  calibrationError,
  chooseNextExperiment,
  compileOpenApi,
  compileSqlSchema,
  compileWorkflow,
  decayClaim,
  detectBenchmarkGaming,
  evaluateBenchmark,
  expertAgreement,
  invalidateDependentClaims,
  mapCapabilityBoundaries,
  realityCalibration,
  sealHoldback,
  sequentialDecision,
  synthesizeEvaluation,
  validateControls,
  verifyHoldback,
} from "../src/index.js";

test("OpenAPI compiler extracts entities, tools, authority and fault surfaces", () => {
  const domain = compileOpenApi({
    info: { title: "ERP" },
    components: { schemas: { Inventory: { required: ["sku", "qty"], properties: { sku: { type: "string" }, qty: { type: "integer" } } } } },
    paths: { "/inventory": { get: { operationId: "listInventory" }, post: { operationId: "adjustInventory" } } },
  });
  assert.equal(domain.entities.length, 1);
  assert.equal(domain.tools.length, 2);
  assert.ok(domain.authorities.includes("write:/inventory"));
  assert.ok(domain.faultSurfaces.some((fault) => fault.kind === "partial-write"));
});

test("SQL and workflow compilers create executable domain specifications", () => {
  const sql = compileSqlSchema("create table public.orders (id uuid not null, status text not null, amount numeric);");
  assert.equal(sql.entities[0].name, "orders");
  assert.ok(sql.invariants.length > 0);
  const workflow = compileWorkflow({ id: "order", states: ["new", "paid"], transitions: [{ from: "new", to: "paid", action: "capture_payment", authority: "payments:write" }] });
  assert.equal(workflow.taskTemplates[0].objective, "Move from new to paid legally");
  assert.throws(() => compileWorkflow({ id: "bad", states: ["a"], transitions: [{ from: "a", to: "b", action: "bad" }] }));
});

test("benchmark evaluator can reject weak methodology and synthesize next experiments", () => {
  const domain = compileSqlSchema("create table items (id text not null);");
  const report = evaluateBenchmark({ domain, hiddenHoldbackCount: 0, proceduralVariantCount: 2, architectureAssumptions: ["requires-llm"], contaminationRisk: 0.8 });
  assert.equal(report.publishable, false);
  const synthesis = synthesizeEvaluation({ benchmark: report, passRate: 0.95, criticalFailureRate: 0, confidence: 0.8, knownCounterexamples: 2, scenarioCoverage: 0.5 });
  assert.ok(synthesis.limitations.length > 0);
  assert.ok(synthesis.nextBestExperiments.length > 0);
});

test("blind evaluation and sealed holdbacks resist identity leakage and tampering", () => {
  const blind = blindParticipant("Epiphany", "secret-salt");
  assert.ok(!blind.blindedId.includes("Epiphany"));
  const holdback = sealHoldback("case-1", { objective: "hidden" }, "2026-08-15T00:00:00.000Z");
  assert.equal(verifyHoldback(holdback), true);
  assert.equal(verifyHoldback({ ...holdback, payload: { objective: "changed" } }), false);
});

test("gaming detection blocks protected-state and unintended actions", () => {
  const findings = detectBenchmarkGaming({ traceActions: [{ type: "hack" }], allowedActionNames: ["read", "write"], verifierStateTouched: true });
  assert.ok(findings.filter((finding) => finding.severity === "critical").length >= 2);
});

test("expert disagreement, reality calibration and sequential evidence remain explicit", () => {
  const agreement = expertAgreement([{ expertId: "a", score: 0.1 }, { expertId: "b", score: 0.9 }]);
  assert.equal(agreement.needsAdjudication, true);
  const calibration = realityCalibration([{ simulated: 0.9, observed: 0.8 }, { simulated: 0.7, observed: 0.7 }]);
  assert.ok(calibration.agreement > 0.9);
  const decision = sequentialDecision(Array.from({ length: 2000 }, (_, index) => index % 10 !== 0), { targetHalfWidth: 0.02 });
  assert.equal(decision.stop, true);
});

test("post-publication confidence decays and dependency invalidation propagates", () => {
  const claim = { id: "c1", status: "verified" as const, confidence: 0.99, verifiedAt: "2026-01-01", dependencies: ["verifier:v1"] };
  assert.ok(decayClaim(claim, { ageDays: 365 }).confidence < 0.5);
  assert.equal(invalidateDependentClaims([claim], "verifier:v1")[0].status, "invalid");
});

test("advanced evaluation exposes reproducibility, capability boundaries, controls and calibration", () => {
  assert.equal(assessReplication([{ runId: "a", matched: true, notes: [] }, { runId: "b", matched: false, notes: [] }]).blocksStrongClaim, true);
  const boundaries = mapCapabilityBoundaries([{ dimension: "recovery", score: 0.95, stressLevel: 1, conditions: [] }, { dimension: "recovery", score: 0.6, stressLevel: 2, conditions: ["outage"] }]);
  assert.equal(boundaries[0].failureBeginsAt, 2);
  assert.equal(validateControls([{ type: "positive", passed: true, id: "p" }, { type: "negative", passed: true, id: "n" }]).valid, true);
  assert.ok(calibrationError([{ predicted: 0.9, outcomes: [true, true, true, false] }]) > 0);
  const next = chooseNextExperiment([{ id: "cheap", expectedInformationGain: 0.4, cost: 1, targetsUnknown: true }, { id: "expensive", expectedInformationGain: 0.9, cost: 10, targetsUnknown: false }], 2);
  assert.equal(next?.id, "cheap");
});

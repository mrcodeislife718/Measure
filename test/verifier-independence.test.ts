import test from "node:test";
import assert from "node:assert/strict";
import { assessVerifierIndependence, strongestIndependentVerification } from "../src/verifier-certification.js";

test("same implementation does not count as independent verification", () => {
  const generator = { verifierId: "generator", method: "same_implementation" as const, implementationId: "impl-a", modelId: "model-a" };
  const verifier = { verifierId: "self-check", method: "same_implementation" as const, implementationId: "impl-a", modelId: "model-a" };
  const report = assessVerifierIndependence(generator, verifier);
  assert.equal(report.independent, false);
  assert.ok(report.commonDependencies.includes("implementation:impl-a"));
  assert.ok(report.commonDependencies.includes("model:model-a"));
});

test("formal checker can provide strong independent verification", () => {
  const generator = { verifierId: "generator", method: "independent_model" as const, implementationId: "reasoner", modelId: "model-a" };
  const verifier = { verifierId: "lean", method: "formal_checker" as const, implementationId: "lean-kernel", toolchainIds: ["lean"] };
  const report = assessVerifierIndependence(generator, verifier);
  assert.equal(report.independent, true);
  assert.equal(report.score, 1);
});

test("selection prefers the strongest genuinely independent verifier", () => {
  const generator = { verifierId: "generator", method: "independent_model" as const, implementationId: "reasoner", modelId: "model-a" };
  const selected = strongestIndependentVerification(generator, [
    { verifierId: "same-model", method: "same_model" as const, modelId: "model-a" },
    { verifierId: "deterministic", method: "deterministic_program" as const, implementationId: "det-checker" },
  ]);
  assert.equal(selected.verifier?.verifierId, "deterministic");
  assert.equal(selected.report?.independent, true);
});

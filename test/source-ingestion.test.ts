import test from "node:test";
import assert from "node:assert/strict";
import { compileRepositoryManifest, compileTrace } from "../src/index.js";

test("repository ingestion creates architecture-neutral evaluation surfaces", () => {
  const domain = compileRepositoryManifest({
    id: "sample",
    files: [
      { path: "src/index.ts", language: "TypeScript" },
      { path: "test/index.test.ts", language: "TypeScript" },
    ],
    scripts: { build: "tsc", lint: "eslint ." },
    tests: [{ id: "unit", command: "npm test" }],
  });
  assert.equal(domain.sourceKind, "repository");
  assert.ok(domain.tools.some((tool) => tool.name === "edit_file" && tool.mutates));
  assert.ok(domain.invariants.some((item) => item.id === "repo:tests"));
  assert.ok(domain.taskTemplates.length >= 2);
  assert.ok(domain.faultSurfaces.some((fault) => fault.kind === "partial-write"));
});

test("trace ingestion infers tools, mutations, observed failures, and replay tasks", () => {
  const domain = compileTrace({
    id: "production-1",
    events: [
      {
        id: "1",
        timestamp: "2026-08-15T00:00:00Z",
        action: "read_inventory",
        target: "inventory",
        success: true,
        stateBefore: { qty: 10 },
        stateAfter: { qty: 10 },
      },
      {
        id: "2",
        timestamp: "2026-08-15T00:01:00Z",
        action: "reserve_inventory",
        target: "inventory",
        success: false,
        errorCode: "DEPENDENCY_TIMEOUT",
        stateBefore: { qty: 10 },
        stateAfter: { qty: 8 },
      },
    ],
  });
  assert.equal(domain.sourceKind, "trace");
  assert.ok(domain.tools.some((tool) => tool.name === "reserve_inventory" && tool.mutates));
  assert.ok(domain.authorities.includes("trace:replay:reserve_inventory"));
  assert.ok(domain.faultSurfaces.some((fault) => fault.id.includes("DEPENDENCY_TIMEOUT")));
  assert.ok(domain.taskTemplates.some((task) => task.objective.includes("reserve_inventory")));
});

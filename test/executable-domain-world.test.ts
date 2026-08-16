import test from "node:test";
import assert from "node:assert/strict";
import { compileWorkflow } from "../src/environment-compiler.js";
import { synthesizeScenarioFamily } from "../src/scenario-synthesis.js";
import { ExecutableDomainWorld } from "../src/executable-domain-world.js";
import { DomainAuthorityVerifier, DomainCompletionVerifier, DomainSchemaVerifier } from "../src/executable-domain-verifiers.js";
import { runEvaluation } from "../src/kernel.js";

const domain = compileWorkflow({
  id: "ticket",
  states: ["open", "closed"],
  transitions: [{ from: "open", to: "closed", action: "close_ticket", authority: "ticket:close" }],
});

test("compiled domain scenario becomes an executable world", () => {
  const scenario = synthesizeScenarioFamily(domain, { includeAuthorityRevocation: false, maxFaultCombinationSize: 0, limit: 1 })[0];
  const world = new ExecutableDomainWorld({ domain, scenario });
  assert.equal(world.validate().length, 0);
  const observation = world.observe();
  assert.equal(observation.domainId, domain.id);
  assert.equal(observation.tools[0]?.name, "close_ticket");
});

test("revoked authority blocks mutation", () => {
  const scenarios = synthesizeScenarioFamily(domain, { includeAuthorityRevocation: true, maxFaultCombinationSize: 0 });
  const scenario = scenarios.find((candidate) => candidate.revokedAuthorities.includes("ticket:close"));
  assert.ok(scenario);
  const world = new ExecutableDomainWorld({ domain, scenario });
  const result = world.apply({ type: "invoke", tool: "close_ticket", entity: "workflow_state", operation: "insert", record: { state: "closed" } });
  assert.equal(result.accepted, false);
});

test("generic compiled world runs through the core evaluation kernel", async () => {
  const scenario = synthesizeScenarioFamily(domain, { includeAuthorityRevocation: false, maxFaultCombinationSize: 0, limit: 1 })[0];
  const result = await runEvaluation({
    runId: "compiled-world-run",
    benchmarkId: "compiled.ticket.v1",
    task: scenario.objective,
    maxSteps: 3,
    resourceBudget: 5,
    participant: {
      id: "deterministic-ticket-policy",
      kind: "deterministic-policy",
      act(observation) {
        const typed = observation as ReturnType<ExecutableDomainWorld["observe"]>;
        if (typed.entities.workflow_state.length === 0) return { type: "invoke", tool: "close_ticket", entity: "workflow_state", operation: "insert", record: { state: "closed" } } as const;
        return { type: "finish" } as const;
      },
    },
    worldFactory: () => new ExecutableDomainWorld({ domain, scenario }),
    verifiers: [new DomainSchemaVerifier(domain), new DomainAuthorityVerifier(domain), new DomainCompletionVerifier()],
    stopWhen: (state) => state.completed,
  });
  assert.equal(result.replayMatched, true);
  assert.equal(result.verifierResults.every((verifier) => verifier.passed), true);
});

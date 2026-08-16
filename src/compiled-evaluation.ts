import type { Participant } from "./contracts.js";
import type { DomainSpecification } from "./environment-compiler.js";
import type { ScenarioBlueprint } from "./scenario-synthesis.js";
import { ExecutableDomainWorld, type ExecutableDomainAction, type ExecutableDomainObservation, type ExecutableDomainState } from "./executable-domain-world.js";
import { DomainAuthorityVerifier, DomainCompletionVerifier, DomainSchemaVerifier } from "./executable-domain-verifiers.js";
import { runEvaluation } from "./kernel.js";

export interface RunCompiledScenarioOptions {
  domain: DomainSpecification;
  scenario: ScenarioBlueprint;
  participant: Participant<ExecutableDomainObservation, ExecutableDomainAction>;
  initialEntities?: Record<string, Array<Record<string, unknown>>>;
  maxSteps?: number;
  resourceBudget?: number;
  runId?: string;
}

export async function runCompiledScenario(options: RunCompiledScenarioOptions) {
  const worldFactory = () => new ExecutableDomainWorld({
    domain: options.domain,
    scenario: options.scenario,
    initialEntities: options.initialEntities,
  });
  return runEvaluation<ExecutableDomainState, ExecutableDomainObservation, ExecutableDomainAction>({
    runId: options.runId ?? `${options.scenario.id}:${Date.now()}`,
    benchmarkId: options.domain.id,
    task: options.scenario.objective,
    maxSteps: options.maxSteps ?? 12,
    resourceBudget: options.resourceBudget ?? 20,
    participant: options.participant,
    worldFactory,
    verifiers: [
      new DomainSchemaVerifier(options.domain),
      new DomainAuthorityVerifier(options.domain),
      new DomainCompletionVerifier(),
    ],
    stopWhen: (state) => state.completed,
  });
}

export async function runCompiledScenarioFamily(options: Omit<RunCompiledScenarioOptions, "scenario" | "runId"> & {
  scenarios: ScenarioBlueprint[];
  maxScenarios?: number;
}) {
  const selected = options.scenarios.slice(0, options.maxScenarios ?? options.scenarios.length);
  const results = [];
  for (const scenario of selected) {
    results.push(await runCompiledScenario({ ...options, scenario, runId: `${scenario.id}:${results.length}` }));
  }
  return {
    domainId: options.domain.id,
    scenariosRun: results.length,
    statusCounts: results.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {}),
    meanConfidence: results.length ? results.reduce((sum, item) => sum + item.confidence.overallConfidence, 0) / results.length : 0,
    evidenceRoots: results.map((item) => item.evidenceRoot),
    results,
  };
}

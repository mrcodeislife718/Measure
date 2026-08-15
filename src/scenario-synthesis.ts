import { createHash } from "node:crypto";
import type { DomainFault, DomainSpecification, TaskTemplate } from "./environment-compiler.js";
import type { ExperimentCandidate } from "./advanced-evaluation.js";

export interface ScenarioDimension {
  name: string;
  values: Array<string | number | boolean>;
  source: "task" | "fault" | "authority" | "coverage-gap";
}

export interface ScenarioBlueprint {
  id: string;
  domainId: string;
  taskId: string;
  objective: string;
  activeFaults: string[];
  revokedAuthorities: string[];
  parameters: Record<string, string | number | boolean>;
  allowedTools: string[];
  successInvariants: string[];
  hidden: boolean;
  digest: string;
}

export interface CoverageGap {
  dimension: string;
  reason: string;
  severity: number;
  suggestedValues?: Array<string | number | boolean>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function combinations<T>(items: T[], maxCombinationSize: number): T[][] {
  const result: T[][] = [[]];
  const visit = (start: number, current: T[]) => {
    if (current.length >= maxCombinationSize) return;
    for (let index = start; index < items.length; index += 1) {
      const next = [...current, items[index]];
      result.push(next);
      visit(index + 1, next);
    }
  };
  visit(0, []);
  return result;
}

function buildBlueprint(
  domain: DomainSpecification,
  task: TaskTemplate,
  faults: DomainFault[],
  revokedAuthorities: string[],
  parameters: Record<string, string | number | boolean>,
  hidden: boolean,
): ScenarioBlueprint {
  const core = {
    domainId: domain.id,
    taskId: task.id,
    objective: task.objective,
    activeFaults: faults.map((fault) => fault.id).sort(),
    revokedAuthorities: [...revokedAuthorities].sort(),
    parameters,
    allowedTools: [...task.allowedTools].sort(),
    successInvariants: [...task.successInvariants].sort(),
    hidden,
  };
  const digest = hash(core);
  return { id: `scenario:${digest.slice(0, 16)}`, ...core, digest };
}

export function inferScenarioDimensions(domain: DomainSpecification, gaps: CoverageGap[] = []): ScenarioDimension[] {
  const dimensions: ScenarioDimension[] = [];
  if (domain.authorities.length) dimensions.push({ name: "authority-state", values: ["intact", "revoked"], source: "authority" });
  for (const fault of domain.faultSurfaces) {
    dimensions.push({ name: `fault:${fault.id}`, values: [false, true], source: "fault" });
  }
  for (const task of domain.taskTemplates) {
    dimensions.push({ name: `task:${task.id}`, values: [task.id], source: "task" });
  }
  for (const gap of gaps) {
    dimensions.push({
      name: gap.dimension,
      values: gap.suggestedValues?.length ? gap.suggestedValues : ["low", "nominal", "high"],
      source: "coverage-gap",
    });
  }
  return dimensions;
}

export function synthesizeScenarioFamily(domain: DomainSpecification, options: {
  maxFaultCombinationSize?: number;
  includeAuthorityRevocation?: boolean;
  hiddenFraction?: number;
  parameterSets?: Array<Record<string, string | number | boolean>>;
  limit?: number;
} = {}): ScenarioBlueprint[] {
  const maxFaultCombinationSize = Math.max(0, Math.min(options.maxFaultCombinationSize ?? 2, 4));
  const faultCombos = combinations(domain.faultSurfaces, maxFaultCombinationSize);
  const authorityModes = options.includeAuthorityRevocation === false || domain.authorities.length === 0
    ? [[]]
    : [[], domain.authorities];
  const parameterSets = options.parameterSets?.length ? options.parameterSets : [{}];
  const hiddenFraction = Math.max(0, Math.min(1, options.hiddenFraction ?? 0.2));
  const blueprints: ScenarioBlueprint[] = [];

  for (const task of domain.taskTemplates) {
    for (const faults of faultCombos) {
      for (const revokedAuthorities of authorityModes) {
        for (const parameters of parameterSets) {
          const hidden = Number.parseInt(hash({ task: task.id, faults: faults.map((f) => f.id), revokedAuthorities, parameters }).slice(0, 8), 16) / 0xffffffff < hiddenFraction;
          blueprints.push(buildBlueprint(domain, task, faults, revokedAuthorities, parameters, hidden));
          if (options.limit && blueprints.length >= options.limit) return blueprints;
        }
      }
    }
  }
  return blueprints;
}

export function experimentsFromCoverageGaps(domain: DomainSpecification, gaps: CoverageGap[]): ExperimentCandidate[] {
  return gaps
    .filter((gap) => gap.severity > 0)
    .map((gap) => ({
      id: `gap:${domain.id}:${hash({ dimension: gap.dimension, reason: gap.reason }).slice(0, 12)}`,
      expectedInformationGain: Math.min(1, Math.max(0.01, gap.severity)),
      cost: Math.max(0.1, 1 / Math.max(0.05, gap.severity)),
      targetsUnknown: true,
    }));
}

export function deriveCoverageGaps(input: {
  domain: DomainSpecification;
  exercisedFaultIds: string[];
  exercisedAuthorities: string[];
  exercisedTaskIds: string[];
}): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const faultSet = new Set(input.exercisedFaultIds);
  for (const fault of input.domain.faultSurfaces) {
    if (!faultSet.has(fault.id)) gaps.push({ dimension: `fault:${fault.id}`, reason: `Fault surface ${fault.id} has not been exercised`, severity: 0.8, suggestedValues: [false, true] });
  }
  const authoritySet = new Set(input.exercisedAuthorities);
  for (const authority of input.domain.authorities) {
    if (!authoritySet.has(authority)) gaps.push({ dimension: `authority:${authority}`, reason: `Authority boundary ${authority} has not been exercised`, severity: 0.9, suggestedValues: ["granted", "revoked"] });
  }
  const taskSet = new Set(input.exercisedTaskIds);
  for (const task of input.domain.taskTemplates) {
    if (!taskSet.has(task.id)) gaps.push({ dimension: `task:${task.id}`, reason: `Task family ${task.id} has no evidence`, severity: 1 });
  }
  return gaps;
}

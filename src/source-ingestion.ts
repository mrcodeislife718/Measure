import { createHash } from "node:crypto";
import type { DomainEntity, DomainFault, DomainInvariant, DomainSpecification, DomainTool, TaskTemplate } from "./environment-compiler.js";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface RepositoryManifest {
  id: string;
  files: Array<{ path: string; language?: string; size?: number }>;
  scripts?: Record<string, string>;
  routes?: Array<{ method: string; path: string; handler?: string }>;
  tests?: Array<{ id: string; command?: string; target?: string }>;
  permissions?: string[];
}

export function compileRepositoryManifest(source: RepositoryManifest): DomainSpecification {
  const entities: DomainEntity[] = [
    {
      name: "repository",
      fields: [
        { name: "files", type: "file[]", required: true },
        { name: "workingTreeClean", type: "boolean", required: true },
        { name: "head", type: "commit", required: true },
      ],
    },
  ];
  const tools: DomainTool[] = [
    { name: "read_file", method: "READ", mutates: false },
    { name: "search_code", method: "SEARCH", mutates: false },
    { name: "run_tests", method: "EXECUTE", mutates: false },
    { name: "edit_file", method: "WRITE", mutates: true, requiredAuthority: "repo:write" },
  ];
  if (source.scripts?.build) tools.push({ name: "run_build", method: "EXECUTE", mutates: false });
  if (source.scripts?.lint) tools.push({ name: "run_lint", method: "EXECUTE", mutates: false });
  const invariants: DomainInvariant[] = [
    { id: "repo:tests", description: "Required regression tests must remain passing after accepted changes", machineCheckable: true },
    { id: "repo:scope", description: "Mutations must remain within the declared repository boundary", machineCheckable: true },
    { id: "repo:integrity", description: "Repository state must remain reproducible from committed source and declared dependencies", machineCheckable: true },
  ];
  const taskTemplates: TaskTemplate[] = [
    { id: "task:repository:repair", objective: "Repair a failing repository behavior while preserving regression safety", successInvariants: ["repo:tests", "repo:scope"], allowedTools: tools.map((tool) => tool.name) },
    { id: "task:repository:change", objective: "Implement a requested repository change and prove the change without unrelated regressions", successInvariants: ["repo:tests", "repo:scope", "repo:integrity"], allowedTools: tools.map((tool) => tool.name) },
  ];
  const faults: DomainFault[] = [
    { id: "fault:tests:timeout", target: "run_tests", kind: "timeout" },
    { id: "fault:dependency:unavailable", target: "dependency", kind: "unavailable" },
    { id: "fault:repository:stale", target: "repository", kind: "stale" },
    { id: "fault:write:partial", target: "edit_file", kind: "partial-write" },
  ];
  return {
    id: `repository:${source.id}`,
    sourceKind: "repository",
    sourceDigest: digest(source),
    entities,
    tools,
    authorities: ["repo:write", ...(source.permissions ?? [])],
    invariants,
    taskTemplates,
    faultSurfaces: faults,
    reviewRequired: ["business correctness of requested changes", "security-sensitive files", "test adequacy", "deployment consequences"],
  };
}

export interface TraceEvent {
  id: string;
  timestamp: string;
  actor?: string;
  action: string;
  target?: string;
  success: boolean;
  latencyMs?: number;
  cost?: number;
  errorCode?: string;
  stateBefore?: Record<string, unknown>;
  stateAfter?: Record<string, unknown>;
}

export interface TraceIngestion {
  id: string;
  events: TraceEvent[];
}

function actionTool(events: TraceEvent[], action: string): DomainTool {
  const relevant = events.filter((event) => event.action === action);
  const mutates = relevant.some((event) => JSON.stringify(event.stateBefore ?? {}) !== JSON.stringify(event.stateAfter ?? {}));
  return { name: action, method: "OBSERVED", mutates, requiredAuthority: mutates ? `trace:replay:${action}` : undefined };
}

export function compileTrace(source: TraceIngestion): DomainSpecification {
  const actions = [...new Set(source.events.map((event) => event.action))];
  const tools = actions.map((action) => actionTool(source.events, action));
  const targets = [...new Set(source.events.flatMap((event) => event.target ? [event.target] : []))];
  const entities: DomainEntity[] = targets.map((target) => ({ name: target, fields: [{ name: "observedState", type: "object", required: false }] }));
  const failureCodes = [...new Set(source.events.flatMap((event) => event.errorCode ? [event.errorCode] : []))];
  const invariants: DomainInvariant[] = [
    { id: "trace:causal-order", description: "Replay must preserve event order and declared state transitions", machineCheckable: true },
    { id: "trace:observed-outcome", description: "A replayed scenario must preserve the original success/failure criterion unless intentionally perturbed", machineCheckable: true },
  ];
  const taskTemplates: TaskTemplate[] = actions.slice(0, 20).map((action, index) => ({
    id: `task:trace:${index}`,
    objective: `Reproduce or improve the observed outcome around ${action} under controlled replay`,
    successInvariants: invariants.map((item) => item.id),
    allowedTools: actions,
  }));
  const faultSurfaces: DomainFault[] = [
    ...failureCodes.map((code) => ({ id: `fault:observed:${code}`, target: code, kind: "unavailable" as const })),
    ...actions.map((action) => ({ id: `fault:trace:${action}:timeout`, target: action, kind: "timeout" as const })),
  ];
  return {
    id: `trace:${source.id}`,
    sourceKind: "trace",
    sourceDigest: digest(source),
    entities,
    tools,
    authorities: [...new Set(tools.flatMap((tool) => tool.requiredAuthority ? [tool.requiredAuthority] : []))],
    invariants,
    taskTemplates,
    faultSurfaces,
    reviewRequired: ["trace representativeness", "privacy/sanitization", "production-success semantics", "whether observed failures are causal or incidental"],
  };
}

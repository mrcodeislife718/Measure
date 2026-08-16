import { createHash } from "node:crypto";
import type { World, ValidationFinding, WorldStep } from "./contracts.js";
import type { DomainSpecification } from "./environment-compiler.js";
import type { ScenarioBlueprint } from "./scenario-synthesis.js";

export interface GenericRecord { [key: string]: unknown }
export interface ExecutableDomainState {
  entities: Record<string, GenericRecord[]>;
  authorities: string[];
  completed: boolean;
  toolCalls: number;
  acceptedMutations: number;
  rejectedActions: number;
  faultEvents: string[];
}

export interface ExecutableDomainObservation {
  domainId: string;
  scenarioId: string;
  objective: string;
  stateDigest: string;
  entities: Record<string, GenericRecord[]>;
  tools: Array<{ name: string; mutates: boolean; requiredAuthority?: string }>;
  authorities: string[];
  activeFaults: string[];
  successInvariants: string[];
}

export type ExecutableDomainAction =
  | { type: "invoke"; tool: string; entity?: string; operation?: "insert" | "update" | "delete" | "noop"; record?: GenericRecord; match?: GenericRecord }
  | { type: "finish" };

export interface ExecutableDomainWorldOptions {
  domain: DomainSpecification;
  scenario: ScenarioBlueprint;
  initialEntities?: Record<string, GenericRecord[]>;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function matches(record: GenericRecord, match: GenericRecord | undefined): boolean {
  if (!match) return false;
  return Object.entries(match).every(([key, value]) => Object.is(record[key], value));
}

export class ExecutableDomainWorld implements World<ExecutableDomainState, ExecutableDomainObservation, ExecutableDomainAction> {
  readonly id: string;
  #domain: DomainSpecification;
  #scenario: ScenarioBlueprint;
  #state: ExecutableDomainState;

  constructor(options: ExecutableDomainWorldOptions) {
    this.#domain = structuredClone(options.domain);
    this.#scenario = structuredClone(options.scenario);
    this.id = `${this.#domain.id}:${this.#scenario.id}`;
    const entities = Object.fromEntries(this.#domain.entities.map((entity) => [entity.name, structuredClone(options.initialEntities?.[entity.name] ?? [])]));
    this.#state = {
      entities,
      authorities: this.#domain.authorities.filter((authority) => !this.#scenario.revokedAuthorities.includes(authority)),
      completed: false,
      toolCalls: 0,
      acceptedMutations: 0,
      rejectedActions: 0,
      faultEvents: [],
    };
  }

  snapshot(): ExecutableDomainState {
    return structuredClone(this.#state);
  }

  observe(): ExecutableDomainObservation {
    return {
      domainId: this.#domain.id,
      scenarioId: this.#scenario.id,
      objective: this.#scenario.objective,
      stateDigest: digest(this.#state),
      entities: structuredClone(this.#state.entities),
      tools: this.#domain.tools.filter((tool) => this.#scenario.allowedTools.includes(tool.name)).map((tool) => ({ name: tool.name, mutates: tool.mutates, requiredAuthority: tool.requiredAuthority })),
      authorities: [...this.#state.authorities],
      activeFaults: [...this.#scenario.activeFaults],
      successInvariants: [...this.#scenario.successInvariants],
    };
  }

  validate(): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    if (!this.#domain.taskTemplates.some((task) => task.id === this.#scenario.taskId)) findings.push({ code: "world.unknown-task", severity: "critical", message: `Scenario task ${this.#scenario.taskId} is not defined by domain` });
    for (const tool of this.#scenario.allowedTools) if (!this.#domain.tools.some((candidate) => candidate.name === tool)) findings.push({ code: "world.unknown-tool", severity: "critical", message: `Scenario allows unknown tool ${tool}` });
    for (const invariant of this.#scenario.successInvariants) if (!this.#domain.invariants.some((candidate) => candidate.id === invariant)) findings.push({ code: "world.unknown-invariant", severity: "critical", message: `Scenario references unknown invariant ${invariant}` });
    for (const authority of this.#scenario.revokedAuthorities) if (!this.#domain.authorities.includes(authority)) findings.push({ code: "world.unknown-authority", severity: "warning", message: `Scenario revokes undeclared authority ${authority}` });
    return findings;
  }

  apply(action: ExecutableDomainAction): WorldStep<ExecutableDomainState> {
    if (action.type === "finish") {
      this.#state.completed = true;
      return { accepted: true, cost: 0.1, state: this.snapshot(), notes: ["participant declared completion"] };
    }

    this.#state.toolCalls += 1;
    const tool = this.#domain.tools.find((candidate) => candidate.name === action.tool && this.#scenario.allowedTools.includes(candidate.name));
    if (!tool) return this.#reject(`tool ${action.tool} is not available in this scenario`);
    if (tool.requiredAuthority && !this.#state.authorities.includes(tool.requiredAuthority)) return this.#reject(`missing authority ${tool.requiredAuthority}`);

    const activeFaults = this.#domain.faultSurfaces.filter((fault) => this.#scenario.activeFaults.includes(fault.id) && (fault.target === tool.name || fault.target === action.entity || fault.target === "dependency"));
    const hardFault = activeFaults.find((fault) => fault.kind === "timeout" || fault.kind === "unavailable" || fault.kind === "permission-loss");
    if (hardFault) {
      this.#state.faultEvents.push(hardFault.id);
      return this.#reject(`injected fault ${hardFault.id}`);
    }

    if (!tool.mutates || action.operation === "noop" || !action.operation) return { accepted: true, cost: 1, state: this.snapshot(), notes: ["read/non-mutating tool invocation accepted"] };

    const entityName = action.entity ?? this.#domain.entities[0]?.name;
    if (!entityName || !(entityName in this.#state.entities)) return this.#reject(`unknown entity ${String(entityName)}`);
    const collection = this.#state.entities[entityName];

    if (action.operation === "insert") {
      if (!action.record) return this.#reject("insert requires record");
      collection.push(structuredClone(action.record));
    } else if (action.operation === "update") {
      if (!action.record || !action.match) return this.#reject("update requires match and record");
      const index = collection.findIndex((record) => matches(record, action.match));
      if (index < 0) return this.#reject("update target not found");
      collection[index] = { ...collection[index], ...structuredClone(action.record) };
    } else if (action.operation === "delete") {
      if (!action.match) return this.#reject("delete requires match");
      const index = collection.findIndex((record) => matches(record, action.match));
      if (index < 0) return this.#reject("delete target not found");
      collection.splice(index, 1);
    }

    const partialFault = activeFaults.find((fault) => fault.kind === "partial-write");
    this.#state.acceptedMutations += 1;
    if (partialFault) {
      this.#state.faultEvents.push(partialFault.id);
      this.#state.rejectedActions += 1;
      return { accepted: false, cost: 1.5, state: this.snapshot(), notes: [`partial mutation occurred under injected fault ${partialFault.id}`] };
    }

    return { accepted: true, cost: 1.5, state: this.snapshot(), notes: ["mutation accepted"] };
  }

  #reject(message: string): WorldStep<ExecutableDomainState> {
    this.#state.rejectedActions += 1;
    return { accepted: false, cost: 1, state: this.snapshot(), notes: [message] };
  }
}

export function compileExecutableWorld(options: ExecutableDomainWorldOptions): () => ExecutableDomainWorld {
  const frozen = structuredClone(options);
  return () => new ExecutableDomainWorld(structuredClone(frozen));
}

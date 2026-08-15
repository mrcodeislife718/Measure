import { createHash } from "node:crypto";

export type SourceKind = "openapi" | "sql" | "workflow" | "repository" | "trace";

export interface DomainField { name: string; type: string; required: boolean }
export interface DomainEntity { name: string; fields: DomainField[] }
export interface DomainTool { name: string; method: string; path?: string; mutates: boolean; requiredAuthority?: string }
export interface DomainInvariant { id: string; description: string; machineCheckable: boolean }
export interface DomainFault { id: string; target: string; kind: "timeout" | "unavailable" | "stale" | "malformed" | "partial-write" | "permission-loss" }
export interface TaskTemplate { id: string; objective: string; successInvariants: string[]; allowedTools: string[] }

export interface DomainSpecification {
  id: string;
  sourceKind: SourceKind;
  sourceDigest: string;
  entities: DomainEntity[];
  tools: DomainTool[];
  authorities: string[];
  invariants: DomainInvariant[];
  taskTemplates: TaskTemplate[];
  faultSurfaces: DomainFault[];
  reviewRequired: string[];
}

export interface OpenApiLike {
  info?: { title?: string };
  paths?: Record<string, Record<string, { operationId?: string; requestBody?: unknown }>>;
  components?: { schemas?: Record<string, { required?: string[]; properties?: Record<string, { type?: string }> }> };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function compileOpenApi(source: OpenApiLike): DomainSpecification {
  const entities: DomainEntity[] = Object.entries(source.components?.schemas ?? {}).map(([name, schema]) => ({
    name,
    fields: Object.entries(schema.properties ?? {}).map(([field, shape]) => ({
      name: field,
      type: shape.type ?? "unknown",
      required: schema.required?.includes(field) ?? false,
    })),
  }));

  const tools: DomainTool[] = [];
  for (const [path, operations] of Object.entries(source.paths ?? {})) {
    for (const [method, operation] of Object.entries(operations)) {
      const normalized = method.toUpperCase();
      tools.push({
        name: operation.operationId ?? `${normalized}_${path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
        method: normalized,
        path,
        mutates: !["GET", "HEAD", "OPTIONS"].includes(normalized),
        requiredAuthority: !["GET", "HEAD", "OPTIONS"].includes(normalized) ? `write:${path}` : undefined,
      });
    }
  }

  const authorities = [...new Set(tools.flatMap((tool) => tool.requiredAuthority ? [tool.requiredAuthority] : []))];
  const mutators = tools.filter((tool) => tool.mutates).map((tool) => tool.name);
  return {
    id: `openapi:${source.info?.title ?? "unnamed"}`,
    sourceKind: "openapi",
    sourceDigest: digest(source),
    entities,
    tools,
    authorities,
    invariants: entities.map((entity) => ({ id: `schema:${entity.name}`, description: `${entity.name} must remain schema-valid after every accepted mutation`, machineCheckable: true })),
    taskTemplates: mutators.slice(0, 12).map((tool, index) => ({ id: `task:${index + 1}`, objective: `Achieve a valid business-state change using ${tool} without violating invariants or authority`, successInvariants: entities.map((entity) => `schema:${entity.name}`), allowedTools: tools.map((item) => item.name) })),
    faultSurfaces: tools.flatMap((tool) => ([
      { id: `fault:${tool.name}:timeout`, target: tool.name, kind: "timeout" as const },
      { id: `fault:${tool.name}:unavailable`, target: tool.name, kind: "unavailable" as const },
      ...(tool.mutates ? [{ id: `fault:${tool.name}:partial`, target: tool.name, kind: "partial-write" as const }] : []),
    ])),
    reviewRequired: ["business invariants", "task economic value", "irreversible action severity", "domain-specific correctness"],
  };
}

export function compileSqlSchema(sql: string, id = "sql:domain"): DomainSpecification {
  const entities: DomainEntity[] = [];
  const tablePattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:[\w]+\.)?([\w]+)\s*\(([^;]+)\)/gim;
  for (const match of sql.matchAll(tablePattern)) {
    const fields = match[2].split(",").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name = "unknown", type = "unknown"] = line.split(/\s+/);
      return { name: name.replace(/["`]/g, ""), type: type.toLowerCase(), required: /not\s+null/i.test(line) };
    });
    entities.push({ name: match[1], fields });
  }
  return {
    id,
    sourceKind: "sql",
    sourceDigest: digest(sql),
    entities,
    tools: entities.flatMap((entity) => [
      { name: `read_${entity.name}`, method: "READ", mutates: false },
      { name: `write_${entity.name}`, method: "WRITE", mutates: true, requiredAuthority: `write:${entity.name}` },
    ]),
    authorities: entities.map((entity) => `write:${entity.name}`),
    invariants: entities.map((entity) => ({ id: `integrity:${entity.name}`, description: `${entity.name} must preserve declared constraints`, machineCheckable: true })),
    taskTemplates: entities.map((entity) => ({ id: `task:${entity.name}:mutate`, objective: `Safely perform a state transition involving ${entity.name}`, successInvariants: [`integrity:${entity.name}`], allowedTools: [`read_${entity.name}`, `write_${entity.name}`] })),
    faultSurfaces: entities.flatMap((entity) => ([{ id: `fault:${entity.name}:stale`, target: entity.name, kind: "stale" as const }, { id: `fault:${entity.name}:partial`, target: entity.name, kind: "partial-write" as const }])),
    reviewRequired: ["foreign-key semantics", "business invariants", "sensitive data handling", "transaction boundaries"],
  };
}

export function compileWorkflow(input: { id: string; states: string[]; transitions: Array<{ from: string; to: string; action: string; authority?: string }> }): DomainSpecification {
  const allowed = new Set(input.states);
  const bad = input.transitions.filter((transition) => !allowed.has(transition.from) || !allowed.has(transition.to));
  if (bad.length) throw new Error("workflow contains transitions referencing unknown states");
  return {
    id: `workflow:${input.id}`,
    sourceKind: "workflow",
    sourceDigest: digest(input),
    entities: [{ name: "workflow_state", fields: [{ name: "state", type: "enum", required: true }] }],
    tools: input.transitions.map((transition) => ({ name: transition.action, method: "TRANSITION", mutates: true, requiredAuthority: transition.authority })),
    authorities: [...new Set(input.transitions.flatMap((transition) => transition.authority ? [transition.authority] : []))],
    invariants: [{ id: "workflow:legal-transition", description: "Every state transition must be explicitly declared", machineCheckable: true }],
    taskTemplates: input.transitions.map((transition, index) => ({ id: `task:transition:${index}`, objective: `Move from ${transition.from} to ${transition.to} legally`, successInvariants: ["workflow:legal-transition"], allowedTools: input.transitions.map((item) => item.action) })),
    faultSurfaces: input.transitions.map((transition) => ({ id: `fault:${transition.action}:permission`, target: transition.action, kind: "permission-loss" as const })),
    reviewRequired: ["transition business meaning", "terminal states", "irreversible transitions"],
  };
}

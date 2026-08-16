import type { Verifier, VerifierResult, VerificationContext } from "./contracts.js";
import type { DomainSpecification } from "./environment-compiler.js";
import type { ExecutableDomainAction, ExecutableDomainState } from "./executable-domain-world.js";

export class DomainSchemaVerifier implements Verifier<ExecutableDomainState, ExecutableDomainAction> {
  readonly id = "measure.domain.schema";
  readonly version = "1.0.0";
  readonly deterministic = true;
  #domain: DomainSpecification;

  constructor(domain: DomainSpecification) {
    this.#domain = structuredClone(domain);
  }

  verify(context: VerificationContext<ExecutableDomainState, ExecutableDomainAction>): VerifierResult {
    const evidence: string[] = [];
    let violations = 0;
    for (const entity of this.#domain.entities) {
      const records = context.finalState.entities[entity.name] ?? [];
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        for (const field of entity.fields.filter((candidate) => candidate.required)) {
          if (!(field.name in record) || record[field.name] === null || record[field.name] === undefined) {
            violations += 1;
            evidence.push(`${entity.name}[${index}] missing required field ${field.name}`);
          }
        }
      }
    }
    if (!violations) evidence.push("all declared required fields remain present");
    return {
      verifierId: this.id,
      score: violations ? Math.max(0, 1 - violations / 10) : 1,
      passed: violations === 0,
      evidence,
      failureCategory: violations ? "state-integrity" : undefined,
    };
  }
}

export class DomainAuthorityVerifier implements Verifier<ExecutableDomainState, ExecutableDomainAction> {
  readonly id = "measure.domain.authority";
  readonly version = "1.0.0";
  readonly deterministic = true;
  #domain: DomainSpecification;

  constructor(domain: DomainSpecification) {
    this.#domain = structuredClone(domain);
  }

  verify(context: VerificationContext<ExecutableDomainState, ExecutableDomainAction>): VerifierResult {
    const violations: string[] = [];
    for (const entry of context.trace) {
      const action = entry.action;
      if (action.type !== "invoke") continue;
      const toolName = action.tool;
      const tool = this.#domain.tools.find((candidate) => candidate.name === toolName);
      if (!tool?.requiredAuthority) continue;
      const authorityWasAvailable = context.initialState.authorities.includes(tool.requiredAuthority);
      if (!authorityWasAvailable && entry.accepted) violations.push(`accepted ${tool.name} without ${tool.requiredAuthority}`);
    }
    return {
      verifierId: this.id,
      score: violations.length ? 0 : 1,
      passed: violations.length === 0,
      evidence: violations.length ? violations : ["no accepted mutation crossed a declared authority boundary"],
      failureCategory: violations.length ? "authority" : undefined,
    };
  }
}

export class DomainCompletionVerifier implements Verifier<ExecutableDomainState, ExecutableDomainAction> {
  readonly id = "measure.domain.completion";
  readonly version = "1.0.0";
  readonly deterministic = true;

  verify(context: VerificationContext<ExecutableDomainState, ExecutableDomainAction>): VerifierResult {
    const completed = context.finalState.completed;
    const madeProgress = context.finalState.acceptedMutations > 0 || context.finalState.toolCalls > 0;
    const score = completed ? (madeProgress ? 1 : 0.75) : (madeProgress ? 0.5 : 0);
    return {
      verifierId: this.id,
      score,
      passed: completed && madeProgress,
      evidence: [
        `completed=${completed}`,
        `toolCalls=${context.finalState.toolCalls}`,
        `acceptedMutations=${context.finalState.acceptedMutations}`,
        `rejectedActions=${context.finalState.rejectedActions}`,
      ],
      failureCategory: completed && madeProgress ? undefined : "objective-completion",
    };
  }
}

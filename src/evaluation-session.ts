import { createHash } from "node:crypto";
import type { AutonomousEvaluationReport, AutonomousIterationRecord, AutonomousPublicationStatus, AutonomousStopReason } from "./autonomous-evaluator.js";

export interface EvaluationSessionState {
  sessionId: string;
  benchmarkId: string;
  participantId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  remainingBudget: number;
  status: AutonomousPublicationStatus | "running";
  stopReason?: AutonomousStopReason;
  iterations: AutonomousIterationRecord[];
  evidenceRoots: string[];
  metadata: Record<string, string | number | boolean>;
}

export interface EvaluationCheckpoint {
  sessionId: string;
  version: number;
  createdAt: string;
  previousDigest?: string;
  stateDigest: string;
  payloadDigest: string;
  payload: EvaluationSessionState;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class EvaluationSession {
  #state: EvaluationSessionState;
  #lastCheckpointDigest?: string;

  constructor(input: {
    sessionId: string;
    benchmarkId: string;
    participantId: string;
    remainingBudget: number;
    metadata?: Record<string, string | number | boolean>;
    createdAt?: string;
  }) {
    const now = input.createdAt ?? new Date().toISOString();
    this.#state = {
      sessionId: input.sessionId,
      benchmarkId: input.benchmarkId,
      participantId: input.participantId,
      createdAt: now,
      updatedAt: now,
      version: 0,
      remainingBudget: input.remainingBudget,
      status: "running",
      iterations: [],
      evidenceRoots: [],
      metadata: { ...(input.metadata ?? {}) },
    };
  }

  static restore(checkpoint: EvaluationCheckpoint): EvaluationSession {
    if (!verifyCheckpoint(checkpoint)) throw new Error("checkpoint integrity verification failed");
    const session = new EvaluationSession({
      sessionId: checkpoint.payload.sessionId,
      benchmarkId: checkpoint.payload.benchmarkId,
      participantId: checkpoint.payload.participantId,
      remainingBudget: checkpoint.payload.remainingBudget,
      metadata: checkpoint.payload.metadata,
      createdAt: checkpoint.payload.createdAt,
    });
    session.#state = structuredClone(checkpoint.payload);
    session.#lastCheckpointDigest = checkpoint.payloadDigest;
    return session;
  }

  snapshot(): EvaluationSessionState {
    return structuredClone(this.#state);
  }

  appendIteration(record: AutonomousIterationRecord, evidenceRoot?: string): void {
    if (this.#state.status !== "running") throw new Error("cannot mutate a completed evaluation session");
    this.#state.iterations.push(structuredClone(record));
    this.#state.remainingBudget = record.remainingBudget;
    if (evidenceRoot && !this.#state.evidenceRoots.includes(evidenceRoot)) this.#state.evidenceRoots.push(evidenceRoot);
    this.#state.version += 1;
    this.#state.updatedAt = new Date().toISOString();
  }

  finalize(report: AutonomousEvaluationReport): void {
    this.#state.status = report.status;
    this.#state.stopReason = report.stopReason;
    this.#state.remainingBudget = report.remainingBudget;
    this.#state.version += 1;
    this.#state.updatedAt = new Date().toISOString();
  }

  checkpoint(createdAt = new Date().toISOString()): EvaluationCheckpoint {
    const payload = this.snapshot();
    const stateDigest = digest({
      sessionId: payload.sessionId,
      version: payload.version,
      remainingBudget: payload.remainingBudget,
      status: payload.status,
      iterationCount: payload.iterations.length,
      evidenceRoots: payload.evidenceRoots,
    });
    const payloadDigest = digest({ payload, previousDigest: this.#lastCheckpointDigest, stateDigest, createdAt });
    const checkpoint: EvaluationCheckpoint = {
      sessionId: payload.sessionId,
      version: payload.version,
      createdAt,
      previousDigest: this.#lastCheckpointDigest,
      stateDigest,
      payloadDigest,
      payload,
    };
    this.#lastCheckpointDigest = payloadDigest;
    return checkpoint;
  }
}

export function verifyCheckpoint(checkpoint: EvaluationCheckpoint): boolean {
  const expectedStateDigest = digest({
    sessionId: checkpoint.payload.sessionId,
    version: checkpoint.payload.version,
    remainingBudget: checkpoint.payload.remainingBudget,
    status: checkpoint.payload.status,
    iterationCount: checkpoint.payload.iterations.length,
    evidenceRoots: checkpoint.payload.evidenceRoots,
  });
  if (checkpoint.stateDigest !== expectedStateDigest) return false;
  const expectedPayloadDigest = digest({
    payload: checkpoint.payload,
    previousDigest: checkpoint.previousDigest,
    stateDigest: checkpoint.stateDigest,
    createdAt: checkpoint.createdAt,
  });
  return checkpoint.payloadDigest === expectedPayloadDigest;
}

export function verifyCheckpointChain(checkpoints: EvaluationCheckpoint[]): boolean {
  if (!checkpoints.length) return true;
  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index];
    if (!verifyCheckpoint(checkpoint)) return false;
    if (index > 0 && checkpoint.previousDigest !== checkpoints[index - 1].payloadDigest) return false;
    if (index > 0 && checkpoint.version < checkpoints[index - 1].version) return false;
  }
  return true;
}

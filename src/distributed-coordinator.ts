import { createHash } from "node:crypto";
import type { ExperimentCandidate } from "./advanced-evaluation.js";
import type { ExperimentExecution } from "./autonomous-evaluator.js";

export interface WorkLease {
  leaseId: string;
  experiment: ExperimentCandidate;
  workerId: string;
  issuedAt: string;
  expiresAt: string;
  attempt: number;
}

export interface WorkerResult {
  leaseId: string;
  workerId: string;
  experimentId: string;
  execution: ExperimentExecution;
  completedAt: string;
  digest: string;
}

export interface CoordinatorSnapshot {
  pending: ExperimentCandidate[];
  leased: WorkLease[];
  completed: WorkerResult[];
  attempts: Record<string, number>;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class DistributedEvaluationCoordinator {
  #pending = new Map<string, ExperimentCandidate>();
  #leased = new Map<string, WorkLease>();
  #completed = new Map<string, WorkerResult>();
  #attempts = new Map<string, number>();

  constructor(experiments: ExperimentCandidate[] = []) {
    for (const experiment of experiments) this.enqueue(experiment);
  }

  enqueue(experiment: ExperimentCandidate): void {
    if (this.#completed.has(experiment.id)) return;
    if ([...this.#leased.values()].some((lease) => lease.experiment.id === experiment.id)) return;
    this.#pending.set(experiment.id, structuredClone(experiment));
  }

  lease(workerId: string, now = Date.now(), leaseMs = 60_000): WorkLease | undefined {
    this.reclaimExpired(now);
    const experiment = [...this.#pending.values()].sort((a, b) => {
      const aScore = (a.expectedInformationGain * (a.targetsUnknown ? 1.5 : 1)) / Math.max(a.cost, 0.0001);
      const bScore = (b.expectedInformationGain * (b.targetsUnknown ? 1.5 : 1)) / Math.max(b.cost, 0.0001);
      return bScore - aScore || a.id.localeCompare(b.id);
    })[0];
    if (!experiment) return undefined;
    this.#pending.delete(experiment.id);
    const attempt = (this.#attempts.get(experiment.id) ?? 0) + 1;
    this.#attempts.set(experiment.id, attempt);
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + leaseMs).toISOString();
    const leaseId = `lease:${digest({ workerId, experimentId: experiment.id, attempt, issuedAt }).slice(0, 20)}`;
    const lease = { leaseId, experiment: structuredClone(experiment), workerId, issuedAt, expiresAt, attempt };
    this.#leased.set(leaseId, lease);
    return structuredClone(lease);
  }

  complete(leaseId: string, workerId: string, execution: ExperimentExecution, completedAt = new Date().toISOString()): WorkerResult {
    const lease = this.#leased.get(leaseId);
    if (!lease) throw new Error("unknown or expired lease");
    if (lease.workerId !== workerId) throw new Error("worker does not own lease");
    if (lease.experiment.id !== execution.id) throw new Error("execution experiment does not match lease");
    const core = { leaseId, workerId, experimentId: execution.id, execution, completedAt };
    const result: WorkerResult = { ...core, digest: digest(core) };
    this.#leased.delete(leaseId);
    this.#completed.set(execution.id, result);
    return structuredClone(result);
  }

  reclaimExpired(now = Date.now()): string[] {
    const reclaimed: string[] = [];
    for (const [leaseId, lease] of this.#leased) {
      if (Date.parse(lease.expiresAt) <= now) {
        this.#leased.delete(leaseId);
        this.#pending.set(lease.experiment.id, lease.experiment);
        reclaimed.push(lease.experiment.id);
      }
    }
    return reclaimed;
  }

  snapshot(): CoordinatorSnapshot {
    return {
      pending: [...this.#pending.values()].map((item) => structuredClone(item)),
      leased: [...this.#leased.values()].map((item) => structuredClone(item)),
      completed: [...this.#completed.values()].map((item) => structuredClone(item)),
      attempts: Object.fromEntries(this.#attempts),
    };
  }

  static restore(snapshot: CoordinatorSnapshot): DistributedEvaluationCoordinator {
    const coordinator = new DistributedEvaluationCoordinator(snapshot.pending);
    coordinator.#leased = new Map(snapshot.leased.map((lease) => [lease.leaseId, structuredClone(lease)]));
    coordinator.#completed = new Map(snapshot.completed.map((result) => [result.experimentId, structuredClone(result)]));
    coordinator.#attempts = new Map(Object.entries(snapshot.attempts));
    return coordinator;
  }
}

export function verifyWorkerResult(result: WorkerResult): boolean {
  const core = {
    leaseId: result.leaseId,
    workerId: result.workerId,
    experimentId: result.experimentId,
    execution: result.execution,
    completedAt: result.completedAt,
  };
  return result.digest === digest(core);
}

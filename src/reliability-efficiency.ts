import { createHash } from 'node:crypto';

export type EvaluationEfficiencyRun = {
  evaluationId: string;
  verified?: boolean;
  evidenceIntact?: boolean;
  contaminationDetected?: boolean;
  costUsd?: number;
  confidenceBefore?: number;
  confidenceAfter?: number;
  confidenceGain?: number;
  replayable?: boolean;
  independentlyReplicated?: boolean;
};

export function stableEvidenceKey(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export class EvaluationEfficiencyLedger {
  private readonly runs: EvaluationEfficiencyRun[] = [];
  private readonly evidenceCache = new Map<string, unknown>();

  rememberEvidence(key: string, result: unknown): void {
    this.evidenceCache.set(key, structuredClone(result));
  }

  reuseEvidence<T>(key: string): T | undefined {
    const result = this.evidenceCache.get(key);
    return result === undefined ? undefined : structuredClone(result) as T;
  }

  record(run: EvaluationEfficiencyRun): void {
    if (!run.evaluationId) throw new Error('evaluationId required');
    this.runs.push(structuredClone(run));
  }

  metrics() {
    const costUsd = this.runs.reduce((sum, run) => sum + (run.costUsd ?? 0), 0);
    const confidenceGain = this.runs.reduce((sum, run) => sum + (run.confidenceGain ?? Math.max(0, (run.confidenceAfter ?? 0) - (run.confidenceBefore ?? 0))), 0);
    const replayable = this.runs.filter((run) => run.replayable).length;
    const independentlyReplicated = this.runs.filter((run) => run.independentlyReplicated).length;
    const qualified = this.runs.filter((run) => failClosedQualification({
      verified: Boolean(run.verified),
      replayable: Boolean(run.replayable),
      evidenceIntact: Boolean(run.evidenceIntact),
      contaminationDetected: Boolean(run.contaminationDetected),
    })).length;
    return {
      runs: this.runs.length,
      costUsd,
      confidenceGain,
      confidenceGainPerDollar: costUsd === 0 ? 0 : confidenceGain / costUsd,
      replayCoverage: this.runs.length === 0 ? 0 : replayable / this.runs.length,
      independentReplicationRate: this.runs.length === 0 ? 0 : independentlyReplicated / this.runs.length,
      qualificationRate: this.runs.length === 0 ? 0 : qualified / this.runs.length,
    };
  }
}

export function rankExperimentsByInformationValue<T extends { expectedInformationGain?: number; expectedCostUsd?: number }>(experiments: T[]) {
  return [...experiments]
    .map((experiment) => ({
      ...experiment,
      valuePerDollar: (experiment.expectedInformationGain ?? 0) / Math.max(experiment.expectedCostUsd ?? 0, Number.EPSILON),
    }))
    .sort((a, b) => b.valuePerDollar - a.valuePerDollar);
}

export function failClosedQualification(input: {
  verified: boolean;
  replayable: boolean;
  evidenceIntact: boolean;
  contaminationDetected: boolean;
}): boolean {
  return input.verified && input.replayable && input.evidenceIntact && !input.contaminationDetected;
}

export function shouldReuseEvidence(input: {
  evidenceKey: string;
  currentKey: string;
  verifierVersionUnchanged: boolean;
  worldVersionUnchanged: boolean;
}): boolean {
  return input.evidenceKey === input.currentKey && input.verifierVersionUnchanged && input.worldVersionUnchanged;
}

import crypto from "node:crypto";

export function stableEvidenceKey(value) {
  const serialized = JSON.stringify(value, Object.keys(value ?? {}).sort());
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export class EvaluationEfficiencyLedger {
  #runs = [];
  #evidenceCache = new Map();

  rememberEvidence(key, result) {
    this.#evidenceCache.set(key, structuredClone(result));
  }

  reuseEvidence(key) {
    const result = this.#evidenceCache.get(key);
    return result === undefined ? undefined : structuredClone(result);
  }

  record(run) {
    if (!run?.evaluationId) throw new Error("evaluationId required");
    this.#runs.push({ at: Date.now(), ...run });
  }

  metrics() {
    const cost = this.#runs.reduce((sum, run) => sum + (run.costUsd ?? 0), 0);
    const confidenceGain = this.#runs.reduce((sum, run) => sum + (run.confidenceGain ?? 0), 0);
    const replayable = this.#runs.filter((run) => run.replayable).length;
    const independentlyReplicated = this.#runs.filter((run) => run.independentlyReplicated).length;
    return {
      runs: this.#runs.length,
      costUsd: cost,
      confidenceGain,
      confidenceGainPerDollar: cost === 0 ? 0 : confidenceGain / cost,
      replayCoverage: this.#runs.length === 0 ? 0 : replayable / this.#runs.length,
      independentReplicationRate: this.#runs.length === 0 ? 0 : independentlyReplicated / this.#runs.length,
    };
  }
}

export function rankExperimentsByInformationValue(experiments) {
  return [...experiments]
    .map((experiment) => ({
      ...experiment,
      valuePerDollar: (experiment.expectedInformationGain ?? 0) / Math.max(experiment.expectedCostUsd ?? 0, Number.EPSILON),
    }))
    .sort((a, b) => b.valuePerDollar - a.valuePerDollar);
}

export function failClosedQualification({ verified, replayable, evidenceIntact, contaminationDetected }) {
  return Boolean(verified && replayable && evidenceIntact && !contaminationDetected);
}

export interface ReplicationResult { runId: string; matched: boolean; stateHash?: string; scoreDelta?: number; notes: string[] }
export function assessReplication(results: ReplicationResult[]): { reproducibility: number; disagreements: ReplicationResult[]; blocksStrongClaim: boolean } {
  if (!results.length) return { reproducibility: 0, disagreements: [], blocksStrongClaim: true };
  const disagreements = results.filter((result) => !result.matched || Math.abs(result.scoreDelta ?? 0) > 0.02);
  return { reproducibility: 1 - disagreements.length / results.length, disagreements, blocksStrongClaim: disagreements.length > 0 };
}

export interface CapabilityProbe { dimension: string; score: number; stressLevel: number; conditions: string[] }
export interface CapabilityBoundary { dimension: string; stableThrough: number; failureBeginsAt?: number; minimumScore: number; evidenceCount: number }
export function mapCapabilityBoundaries(probes: CapabilityProbe[], threshold = 0.8): CapabilityBoundary[] {
  const grouped = new Map<string, CapabilityProbe[]>();
  for (const probe of probes) grouped.set(probe.dimension, [...(grouped.get(probe.dimension) ?? []), probe]);
  return [...grouped.entries()].map(([dimension, values]) => {
    const sorted = [...values].sort((a, b) => a.stressLevel - b.stressLevel);
    const passing = sorted.filter((probe) => probe.score >= threshold);
    const firstFailure = sorted.find((probe) => probe.score < threshold);
    return {
      dimension,
      stableThrough: passing.length ? Math.max(...passing.map((probe) => probe.stressLevel)) : 0,
      failureBeginsAt: firstFailure?.stressLevel,
      minimumScore: Math.min(...sorted.map((probe) => probe.score)),
      evidenceCount: sorted.length,
    };
  });
}

export interface FailureCase { id: string; conditions: string[]; failed: boolean; severity?: number }
export function minimizeFailure(failure: FailureCase, test: (conditions: string[]) => boolean): FailureCase {
  if (!failure.failed) return failure;
  let conditions = [...failure.conditions];
  let index = 0;
  while (index < conditions.length) {
    const candidate = conditions.filter((_, itemIndex) => itemIndex !== index);
    if (candidate.length && test(candidate)) conditions = candidate;
    else index += 1;
  }
  return { ...failure, conditions };
}

export interface SensitivityPoint { weights: Record<string, number>; ranking: string[] }
export function rankingFragility(points: SensitivityPoint[]): { stability: number; flips: number } {
  if (points.length < 2) return { stability: 0, flips: 0 };
  const base = points[0].ranking.join("|");
  const flips = points.slice(1).filter((point) => point.ranking.join("|") !== base).length;
  return { stability: 1 - flips / (points.length - 1), flips };
}

export interface ControlResult { type: "positive" | "negative"; passed: boolean; id: string }
export function validateControls(results: ControlResult[]): { valid: boolean; failures: string[] } {
  const failures = results.filter((result) => !result.passed).map((result) => `${result.type}:${result.id}`);
  return { valid: failures.length === 0 && results.some((result) => result.type === "positive") && results.some((result) => result.type === "negative"), failures };
}

export interface CalibrationBucket { predicted: number; outcomes: boolean[] }
export function calibrationError(buckets: CalibrationBucket[]): number {
  const total = buckets.reduce((sum, bucket) => sum + bucket.outcomes.length, 0);
  if (!total) return 1;
  return buckets.reduce((sum, bucket) => {
    const observed = bucket.outcomes.length ? bucket.outcomes.filter(Boolean).length / bucket.outcomes.length : 0;
    return sum + Math.abs(bucket.predicted - observed) * bucket.outcomes.length;
  }, 0) / total;
}

export interface MetricObservation { metric: string; value: number; realOutcome: number }
export function metricPredictiveValidity(observations: MetricObservation[]): Record<string, number> {
  const grouped = new Map<string, MetricObservation[]>();
  for (const observation of observations) grouped.set(observation.metric, [...(grouped.get(observation.metric) ?? []), observation]);
  const result: Record<string, number> = {};
  for (const [metric, values] of grouped) {
    const meanX = values.reduce((sum, value) => sum + value.value, 0) / values.length;
    const meanY = values.reduce((sum, value) => sum + value.realOutcome, 0) / values.length;
    const numerator = values.reduce((sum, value) => sum + (value.value - meanX) * (value.realOutcome - meanY), 0);
    const denominator = Math.sqrt(values.reduce((sum, value) => sum + (value.value - meanX) ** 2, 0) * values.reduce((sum, value) => sum + (value.realOutcome - meanY) ** 2, 0));
    result[metric] = denominator === 0 ? 0 : numerator / denominator;
  }
  return result;
}

export interface ExperimentCandidate { id: string; expectedInformationGain: number; cost: number; targetsUnknown: boolean }
export function chooseNextExperiment(candidates: ExperimentCandidate[], budget: number): ExperimentCandidate | undefined {
  return candidates.filter((candidate) => candidate.cost <= budget).sort((a, b) => {
    const scoreA = (a.expectedInformationGain * (a.targetsUnknown ? 1.5 : 1)) / Math.max(a.cost, 0.0001);
    const scoreB = (b.expectedInformationGain * (b.targetsUnknown ? 1.5 : 1)) / Math.max(b.cost, 0.0001);
    return scoreB - scoreA;
  })[0];
}

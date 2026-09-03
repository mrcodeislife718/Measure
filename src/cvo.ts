export interface OutcomeCost {
  model?: number;
  compute?: number;
  tools?: number;
  network?: number;
  retries?: number;
  humanIntervention?: number;
  defectRemediation?: number;
  opportunityCost?: number;
  energy?: number;
}

export interface VerifiedOutcomeRun {
  id: string;
  verified: boolean;
  quality?: number;
  latencyMs?: number;
  memoryMb?: number;
  energyWh?: number;
  retries?: number;
  humanInterventions?: number;
  costs: OutcomeCost;
  metadata?: Record<string, unknown>;
}

export interface CvoReport {
  runs: number;
  verifiedOutcomes: number;
  successRate: number;
  totalCost: number;
  costPerVerifiedOutcome: number | null;
  averageVerifiedLatencyMs: number | null;
  averageVerifiedMemoryMb: number | null;
  averageVerifiedEnergyWh: number | null;
  averageRetries: number;
  averageHumanInterventions: number;
}

function finite(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function totalEconomicCost(costs: OutcomeCost): number {
  return Object.values(costs).reduce((sum, value) => sum + finite(value), 0);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function calculateCvo(runs: VerifiedOutcomeRun[]): CvoReport {
  const verified = runs.filter((run) => run.verified);
  const totalCost = runs.reduce((sum, run) => sum + totalEconomicCost(run.costs), 0);
  return {
    runs: runs.length,
    verifiedOutcomes: verified.length,
    successRate: runs.length ? verified.length / runs.length : 0,
    totalCost,
    costPerVerifiedOutcome: verified.length ? totalCost / verified.length : null,
    averageVerifiedLatencyMs: average(verified.map((r) => finite(r.latencyMs)).filter((v) => v > 0)),
    averageVerifiedMemoryMb: average(verified.map((r) => finite(r.memoryMb)).filter((v) => v > 0)),
    averageVerifiedEnergyWh: average(verified.map((r) => finite(r.energyWh)).filter((v) => v > 0)),
    averageRetries: runs.length ? runs.reduce((sum, r) => sum + finite(r.retries), 0) / runs.length : 0,
    averageHumanInterventions: runs.length ? runs.reduce((sum, r) => sum + finite(r.humanInterventions), 0) / runs.length : 0,
  };
}

export interface PerturbationResult {
  baselineId: string;
  perturbationId: string;
  qualityDelta: number;
  costDelta: number;
  latencyDeltaMs: number;
  verificationChanged: boolean;
  robust: boolean;
}

export function comparePerturbation(baseline: VerifiedOutcomeRun, perturbed: VerifiedOutcomeRun, tolerance = { quality: 0.05, costRatio: 1.5, latencyRatio: 2 }): PerturbationResult {
  const baselineCost = totalEconomicCost(baseline.costs);
  const perturbedCost = totalEconomicCost(perturbed.costs);
  const qualityDelta = finite(perturbed.quality) - finite(baseline.quality);
  const costDelta = perturbedCost - baselineCost;
  const latencyDeltaMs = finite(perturbed.latencyMs) - finite(baseline.latencyMs);
  const costWithin = baselineCost === 0 ? perturbedCost === 0 : perturbedCost / baselineCost <= tolerance.costRatio;
  const latencyWithin = finite(baseline.latencyMs) === 0 ? true : finite(perturbed.latencyMs) / finite(baseline.latencyMs) <= tolerance.latencyRatio;
  const robust = baseline.verified === perturbed.verified && qualityDelta >= -tolerance.quality && costWithin && latencyWithin;
  return { baselineId: baseline.id, perturbationId: perturbed.id, qualityDelta, costDelta, latencyDeltaMs, verificationChanged: baseline.verified !== perturbed.verified, robust };
}

export function rankByCvo(systems: Array<{ systemId: string; runs: VerifiedOutcomeRun[] }>) {
  return systems
    .map(({ systemId, runs }) => ({ systemId, report: calculateCvo(runs) }))
    .sort((a, b) => {
      const ac = a.report.costPerVerifiedOutcome ?? Number.POSITIVE_INFINITY;
      const bc = b.report.costPerVerifiedOutcome ?? Number.POSITIVE_INFINITY;
      return ac - bc || b.report.successRate - a.report.successRate;
    });
}

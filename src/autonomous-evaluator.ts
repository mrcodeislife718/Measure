import { chooseNextExperiment, type ExperimentCandidate } from "./advanced-evaluation.js";
import { sequentialDecision } from "./hardening.js";

export type AutonomousStopReason =
  | "evidence-sufficient"
  | "fundamentally-insufficient"
  | "budget-exhausted"
  | "iteration-limit"
  | "publication-blocked";

export type AutonomousPublicationStatus = "verified" | "qualified" | "inconclusive" | "invalid";

export interface ExperimentExecution {
  id: string;
  passed: boolean;
  score: number;
  confidence: number;
  cost: number;
  criticalFindings?: string[];
  limitations?: string[];
  unknowns?: string[];
  evidence?: string[];
}

export interface AutonomousAudit {
  blockers: string[];
  warnings: string[];
  generatedExperiments?: ExperimentCandidate[];
}

export interface AutonomousEvaluatorCallbacks {
  runExperiment(candidate: ExperimentCandidate, iteration: number): Promise<ExperimentExecution> | ExperimentExecution;
  attack?(execution: ExperimentExecution, history: readonly ExperimentExecution[]): Promise<AutonomousAudit> | AutonomousAudit;
  replicate?(execution: ExperimentExecution): Promise<ExperimentExecution> | ExperimentExecution;
  generateExperiments?(history: readonly ExperimentExecution[], audits: readonly AutonomousAudit[]): Promise<ExperimentCandidate[]> | ExperimentCandidate[];
}

export interface AutonomousEvaluatorOptions {
  initialExperiments: ExperimentCandidate[];
  budget: number;
  maxIterations?: number;
  minExperiments?: number;
  targetConfidence?: number;
  targetHalfWidth?: number;
  minPassRate?: number;
  maxCriticalFailureRate?: number;
  requireReplication?: boolean;
  requireNoUnknownsForVerified?: boolean;
}

export interface AutonomousIterationRecord {
  iteration: number;
  candidate: ExperimentCandidate;
  execution: ExperimentExecution;
  audit: AutonomousAudit;
  replication?: ExperimentExecution;
  remainingBudget: number;
}

export interface AutonomousEvaluationReport {
  status: AutonomousPublicationStatus;
  stopReason: AutonomousStopReason;
  iterations: AutonomousIterationRecord[];
  experimentsRun: number;
  passRate: number;
  meanScore: number;
  meanConfidence: number;
  criticalFailureRate: number;
  statisticalHalfWidth: number;
  unresolvedUnknowns: string[];
  limitations: string[];
  blockers: string[];
  evidence: string[];
  remainingBudget: number;
  nextBestExperiment?: ExperimentCandidate;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function summarize(
  history: readonly ExperimentExecution[],
  audits: readonly AutonomousAudit[],
  remainingBudget: number,
  nextBestExperiment: ExperimentCandidate | undefined,
  options: Required<Pick<AutonomousEvaluatorOptions,
    "minExperiments" | "targetConfidence" | "targetHalfWidth" | "minPassRate" | "maxCriticalFailureRate" | "requireNoUnknownsForVerified">>,
): Omit<AutonomousEvaluationReport, "status" | "stopReason" | "iterations" | "remainingBudget" | "nextBestExperiment"> & {
  strongEvidence: boolean;
  invalid: boolean;
} {
  const experimentsRun = history.length;
  const passes = history.filter((item) => item.passed).length;
  const passRate = experimentsRun ? passes / experimentsRun : 0;
  const meanScore = experimentsRun ? history.reduce((sum, item) => sum + item.score, 0) / experimentsRun : 0;
  const meanConfidence = experimentsRun ? history.reduce((sum, item) => sum + item.confidence, 0) / experimentsRun : 0;
  const criticalCount = history.filter((item) => (item.criticalFindings?.length ?? 0) > 0).length;
  const criticalFailureRate = experimentsRun ? criticalCount / experimentsRun : 0;
  const statistical = sequentialDecision(history.map((item) => item.passed), {
    minSamples: options.minExperiments,
    targetHalfWidth: options.targetHalfWidth,
  });
  const blockers = unique([
    ...history.flatMap((item) => item.criticalFindings ?? []),
    ...audits.flatMap((audit) => audit.blockers),
  ]);
  const unresolvedUnknowns = unique(history.flatMap((item) => item.unknowns ?? []));
  const limitations = unique([
    ...history.flatMap((item) => item.limitations ?? []),
    ...audits.flatMap((audit) => audit.warnings),
  ]);
  const evidence = unique(history.flatMap((item) => item.evidence ?? []));
  const invalid = blockers.length > 0 || criticalFailureRate > options.maxCriticalFailureRate;
  const strongEvidence =
    experimentsRun >= options.minExperiments &&
    statistical.stop &&
    passRate >= options.minPassRate &&
    meanConfidence >= options.targetConfidence &&
    !invalid &&
    (!options.requireNoUnknownsForVerified || unresolvedUnknowns.length === 0);

  return {
    experimentsRun,
    passRate,
    meanScore,
    meanConfidence,
    criticalFailureRate,
    statisticalHalfWidth: statistical.halfWidth,
    unresolvedUnknowns,
    limitations,
    blockers,
    evidence,
    strongEvidence,
    invalid,
  };
}

export async function runAutonomousEvaluation(
  callbacks: AutonomousEvaluatorCallbacks,
  options: AutonomousEvaluatorOptions,
): Promise<AutonomousEvaluationReport> {
  const settings = {
    maxIterations: options.maxIterations ?? 100,
    minExperiments: options.minExperiments ?? 30,
    targetConfidence: options.targetConfidence ?? 0.9,
    targetHalfWidth: options.targetHalfWidth ?? 0.05,
    minPassRate: options.minPassRate ?? 0.8,
    maxCriticalFailureRate: options.maxCriticalFailureRate ?? 0,
    requireReplication: options.requireReplication ?? true,
    requireNoUnknownsForVerified: options.requireNoUnknownsForVerified ?? false,
  };

  let remainingBudget = options.budget;
  const pending = new Map(options.initialExperiments.map((candidate) => [candidate.id, candidate]));
  const history: ExperimentExecution[] = [];
  const audits: AutonomousAudit[] = [];
  const iterations: AutonomousIterationRecord[] = [];

  for (let iteration = 0; iteration < settings.maxIterations; iteration += 1) {
    const affordable = [...pending.values()].filter((candidate) => candidate.cost <= remainingBudget);
    const candidate = chooseNextExperiment(affordable, remainingBudget);

    if (!candidate) {
      const summary = summarize(history, audits, remainingBudget, undefined, settings);
      const stopReason: AutonomousStopReason = remainingBudget <= 0 ? "budget-exhausted" : "fundamentally-insufficient";
      return {
        ...summary,
        status: summary.invalid ? "invalid" : "inconclusive",
        stopReason,
        iterations,
        remainingBudget,
      };
    }

    pending.delete(candidate.id);
    const execution = await callbacks.runExperiment(candidate, iteration);
    remainingBudget = Math.max(0, remainingBudget - Math.max(candidate.cost, execution.cost));
    history.push(execution);

    const audit = callbacks.attack ? await callbacks.attack(execution, history) : { blockers: [], warnings: [] };
    audits.push(audit);
    for (const generated of audit.generatedExperiments ?? []) if (!pending.has(generated.id)) pending.set(generated.id, generated);

    let replication: ExperimentExecution | undefined;
    if (settings.requireReplication && callbacks.replicate) {
      replication = await callbacks.replicate(execution);
      remainingBudget = Math.max(0, remainingBudget - Math.max(0, replication.cost));
      const scoreDelta = Math.abs(replication.score - execution.score);
      const passDisagreement = replication.passed !== execution.passed;
      if (passDisagreement || scoreDelta > 0.02) {
        audit.blockers.push(`replication disagreement for ${execution.id}: pass=${passDisagreement}, scoreDelta=${scoreDelta.toFixed(4)}`);
      }
      if (replication.criticalFindings?.length) audit.blockers.push(...replication.criticalFindings.map((item) => `replication: ${item}`));
    }

    if (callbacks.generateExperiments) {
      const generated = await callbacks.generateExperiments(history, audits);
      for (const next of generated) if (!pending.has(next.id) && !history.some((item) => item.id === next.id)) pending.set(next.id, next);
    }

    const record: AutonomousIterationRecord = {
      iteration,
      candidate,
      execution,
      audit,
      replication,
      remainingBudget,
    };
    iterations.push(record);

    const nextBestExperiment = chooseNextExperiment([...pending.values()], remainingBudget);
    const summary = summarize(history, audits, remainingBudget, nextBestExperiment, settings);

    if (summary.invalid) {
      return {
        ...summary,
        status: "invalid",
        stopReason: "publication-blocked",
        iterations,
        remainingBudget,
        nextBestExperiment,
      };
    }

    if (summary.strongEvidence) {
      return {
        ...summary,
        status: "verified",
        stopReason: "evidence-sufficient",
        iterations,
        remainingBudget,
        nextBestExperiment,
      };
    }

    if (remainingBudget <= 0) {
      return {
        ...summary,
        status: "inconclusive",
        stopReason: "budget-exhausted",
        iterations,
        remainingBudget,
        nextBestExperiment,
      };
    }
  }

  const nextBestExperiment = chooseNextExperiment([...pending.values()], remainingBudget);
  const summary = summarize(history, audits, remainingBudget, nextBestExperiment, settings);
  const status: AutonomousPublicationStatus = summary.invalid ? "invalid" : summary.passRate >= settings.minPassRate && summary.meanConfidence >= 0.7 ? "qualified" : "inconclusive";
  return {
    ...summary,
    status,
    stopReason: summary.invalid ? "publication-blocked" : "iteration-limit",
    iterations,
    remainingBudget,
    nextBestExperiment,
  };
}

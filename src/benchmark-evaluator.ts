import type { Severity, ValidationFinding, VerifierResult } from "./contracts.js";
import type { DomainSpecification } from "./environment-compiler.js";

export interface BenchmarkQualityDimension {
  id: "validity" | "realism" | "neutrality" | "verification" | "reproducibility" | "coverage" | "contamination" | "gamingResistance" | "economicRelevance";
  score: number;
  findings: string[];
}

export interface BenchmarkQualityReport {
  score: number;
  publishable: boolean;
  dimensions: BenchmarkQualityDimension[];
  criticalFindings: string[];
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

export function evaluateBenchmark(input: {
  domain: DomainSpecification;
  worldFindings?: ValidationFinding[];
  verifierResults?: VerifierResult[];
  hiddenHoldbackCount?: number;
  proceduralVariantCount?: number;
  externalChallengeCount?: number;
  realityCalibration?: number;
  architectureAssumptions?: string[];
  knownGamingPaths?: string[];
  contaminationRisk?: number;
}): BenchmarkQualityReport {
  const dimensions: BenchmarkQualityDimension[] = [];
  const worldProblems = (input.worldFindings ?? []).filter((finding) => finding.severity !== "info");
  const verifierFailures = (input.verifierResults ?? []).filter((result) => !result.passed);
  const criticalFindings: string[] = [];

  const validity = clamp(1 - worldProblems.length * 0.15 - (input.domain.reviewRequired.length ? 0.1 : 0));
  dimensions.push({ id: "validity", score: validity, findings: worldProblems.map((finding) => finding.message) });

  const realism = clamp((input.realityCalibration ?? 0.5) * 0.8 + Math.min(0.2, input.externalChallengeCount ?? 0));
  dimensions.push({ id: "realism", score: realism, findings: input.realityCalibration == null ? ["No simulation-to-reality calibration supplied"] : [] });

  const assumptions = input.architectureAssumptions ?? [];
  const neutrality = clamp(1 - assumptions.length * 0.25);
  if (assumptions.length) criticalFindings.push(`Architecture assumptions detected: ${assumptions.join(", ")}`);
  dimensions.push({ id: "neutrality", score: neutrality, findings: assumptions });

  const verification = clamp(1 - verifierFailures.length * 0.2);
  dimensions.push({ id: "verification", score: verification, findings: verifierFailures.map((result) => `Verifier ${result.verifierId} failed certification/evaluation`) });

  const reproducibility = input.proceduralVariantCount && input.hiddenHoldbackCount ? 0.9 : 0.65;
  dimensions.push({ id: "reproducibility", score: reproducibility, findings: reproducibility < 0.8 ? ["Insufficient holdback or procedural-variant evidence"] : [] });

  const coverage = clamp(Math.log10(Math.max(1, input.proceduralVariantCount ?? 1)) / 4 + Math.min(0.25, (input.externalChallengeCount ?? 0) / 20));
  dimensions.push({ id: "coverage", score: coverage, findings: coverage < 0.7 ? ["Scenario coverage remains shallow"] : [] });

  const contamination = clamp(1 - (input.contaminationRisk ?? 0.5));
  dimensions.push({ id: "contamination", score: contamination, findings: contamination < 0.8 ? ["Contamination risk is not yet low enough for a strong public claim"] : [] });

  const gaming = clamp(1 - (input.knownGamingPaths?.length ?? 0) * 0.2);
  dimensions.push({ id: "gamingResistance", score: gaming, findings: input.knownGamingPaths ?? [] });

  const economic = clamp((input.domain.taskTemplates.length > 0 ? 0.6 : 0.2) + (input.domain.invariants.length > 0 ? 0.2 : 0) + (input.domain.faultSurfaces.length > 0 ? 0.2 : 0));
  dimensions.push({ id: "economicRelevance", score: economic, findings: economic < 0.8 ? ["Tasks are not yet tied strongly enough to invariant-preserving operational outcomes"] : [] });

  const product = dimensions.reduce((acc, dimension) => acc * Math.max(0.0001, dimension.score), 1);
  const score = product ** (1 / dimensions.length);
  if (validity < 0.5) criticalFindings.push("World or benchmark validity is too weak");
  if (verification < 0.5) criticalFindings.push("Verifier reliability is too weak");

  return { score, publishable: criticalFindings.length === 0 && score >= 0.75, dimensions, criticalFindings };
}

export interface EvidenceSynthesis {
  supportedClaims: string[];
  limitations: string[];
  unknowns: string[];
  nextBestExperiments: string[];
}

export function synthesizeEvaluation(input: {
  benchmark: BenchmarkQualityReport;
  passRate: number;
  criticalFailureRate: number;
  confidence: number;
  knownCounterexamples: number;
  scenarioCoverage: number;
}): EvidenceSynthesis {
  const supportedClaims: string[] = [];
  const limitations: string[] = [];
  const unknowns: string[] = [];
  const nextBestExperiments: string[] = [];

  if (input.benchmark.publishable && input.confidence >= 0.9) supportedClaims.push(`Observed pass rate ${(input.passRate * 100).toFixed(1)}% is supported under the evaluated scenario distribution`);
  if (input.criticalFailureRate < 0.01 && input.scenarioCoverage >= 0.8) supportedClaims.push("Critical failure frequency was low across broad measured coverage");
  if (!input.benchmark.publishable) limitations.push("Benchmark quality gate does not yet support an unqualified external claim");
  if (input.knownCounterexamples > 0) limitations.push(`${input.knownCounterexamples} known counterexample(s) remain valid failure evidence`);
  if (input.scenarioCoverage < 0.95) unknowns.push("Untested regions remain in the scenario space");
  if (input.confidence < 0.95) nextBestExperiments.push("Run adaptive simulations near the highest-uncertainty capability boundary");
  if (input.benchmark.dimensions.find((dimension) => dimension.id === "realism")!.score < 0.9) nextBestExperiments.push("Collect shadow/production traces and recalibrate the simulation-to-reality model");
  if (input.benchmark.dimensions.find((dimension) => dimension.id === "gamingResistance")!.score < 0.9) nextBestExperiments.push("Expand adversarial anti-shortcut and reward-hacking challenge sets");

  return { supportedClaims, limitations, unknowns, nextBestExperiments };
}

export function findingsBySeverity(findings: Array<{ severity: Severity }>): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>((counts, finding) => ({ ...counts, [finding.severity]: counts[finding.severity] + 1 }), { info: 0, warning: 0, critical: 0 });
}

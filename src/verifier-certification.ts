import type { Verifier, VerificationContext } from "./contracts.js";

export interface CertificationCase<State, Action> {
  name: string;
  context: VerificationContext<State, Action>;
  expectedPass: boolean;
}

export interface VerifierCertificate {
  verifierId: string;
  version: string;
  cases: number;
  correct: number;
  accuracy: number;
  falsePositives: number;
  falseNegatives: number;
  certified: boolean;
}

export type VerificationMethod = "same_implementation" | "same_model" | "independent_model" | "deterministic_program" | "formal_checker" | "simulation" | "empirical_measurement" | "human_review";

export interface VerifierIndependenceDescriptor {
  verifierId: string;
  method: VerificationMethod;
  implementationId?: string;
  modelId?: string;
  providerId?: string;
  dataSourceIds?: string[];
  stateSourceIds?: string[];
  toolchainIds?: string[];
}

export interface VerifierIndependenceReport {
  score: number;
  independent: boolean;
  commonDependencies: string[];
  reasons: string[];
}

const METHOD_STRENGTH: Record<VerificationMethod, number> = {
  same_implementation: 0.1,
  same_model: 0.25,
  independent_model: 0.55,
  simulation: 0.65,
  deterministic_program: 0.8,
  empirical_measurement: 0.85,
  human_review: 0.85,
  formal_checker: 1,
};

function overlap(a: string[] = [], b: string[] = [], label: string): string[] {
  const right = new Set(b);
  return [...new Set(a)].filter((value) => right.has(value)).map((value) => `${label}:${value}`);
}

export function assessVerifierIndependence(generator: VerifierIndependenceDescriptor, verifier: VerifierIndependenceDescriptor): VerifierIndependenceReport {
  const commonDependencies = [
    ...(generator.implementationId && verifier.implementationId === generator.implementationId ? [`implementation:${generator.implementationId}`] : []),
    ...(generator.modelId && verifier.modelId === generator.modelId ? [`model:${generator.modelId}`] : []),
    ...(generator.providerId && verifier.providerId === generator.providerId ? [`provider:${generator.providerId}`] : []),
    ...overlap(generator.dataSourceIds, verifier.dataSourceIds, "data"),
    ...overlap(generator.stateSourceIds, verifier.stateSourceIds, "state"),
    ...overlap(generator.toolchainIds, verifier.toolchainIds, "toolchain"),
  ].sort();

  let score = METHOD_STRENGTH[verifier.method];
  const reasons: string[] = [`method:${verifier.method}`];
  for (const dependency of commonDependencies) {
    if (dependency.startsWith("implementation:")) score -= 0.45;
    else if (dependency.startsWith("model:")) score -= 0.3;
    else if (dependency.startsWith("provider:")) score -= 0.08;
    else if (dependency.startsWith("data:")) score -= 0.08;
    else if (dependency.startsWith("state:")) score -= 0.08;
    else if (dependency.startsWith("toolchain:")) score -= 0.05;
    reasons.push(`shared:${dependency}`);
  }
  score = Math.max(0, Math.min(1, Number(score.toFixed(4))));
  return { score, independent: score >= 0.6 && !commonDependencies.some((item) => item.startsWith("implementation:") || item.startsWith("model:")), commonDependencies, reasons };
}

export function strongestIndependentVerification(generator: VerifierIndependenceDescriptor, candidates: VerifierIndependenceDescriptor[]): { verifier?: VerifierIndependenceDescriptor; report?: VerifierIndependenceReport } {
  const ranked = candidates.map((verifier) => ({ verifier, report: assessVerifierIndependence(generator, verifier) })).sort((a, b) => b.report.score - a.report.score || a.verifier.verifierId.localeCompare(b.verifier.verifierId));
  const selected = ranked.find((item) => item.report.independent) ?? ranked[0];
  return selected ?? {};
}

export async function certifyVerifier<State, Action>(
  verifier: Verifier<State, Action>,
  cases: CertificationCase<State, Action>[],
  threshold = 0.98,
): Promise<VerifierCertificate> {
  let correct = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const testCase of cases) {
    const result = await verifier.verify(testCase.context);
    if (result.passed === testCase.expectedPass) correct += 1;
    else if (result.passed) falsePositives += 1;
    else falseNegatives += 1;
  }

  const accuracy = cases.length === 0 ? 0 : correct / cases.length;
  return {
    verifierId: verifier.id,
    version: verifier.version,
    cases: cases.length,
    correct,
    accuracy,
    falsePositives,
    falseNegatives,
    certified: cases.length > 0 && accuracy >= threshold && falsePositives === 0,
  };
}

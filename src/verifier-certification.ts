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

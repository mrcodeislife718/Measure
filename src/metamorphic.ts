export interface MetamorphicCase<Input, Output> {
  name: string;
  original: Input;
  transformed: Input;
  relationship: "equivalent" | "monotonic-increase" | "monotonic-decrease";
  tolerance?: number;
}

export interface MetamorphicFinding {
  name: string;
  passed: boolean;
  originalScore: number;
  transformedScore: number;
  message: string;
}

export async function runMetamorphicChecks<Input, Output>(
  cases: MetamorphicCase<Input, Output>[],
  evaluator: (input: Input) => Promise<{ output: Output; score: number }> | { output: Output; score: number },
): Promise<MetamorphicFinding[]> {
  const findings: MetamorphicFinding[] = [];

  for (const testCase of cases) {
    const original = await evaluator(testCase.original);
    const transformed = await evaluator(testCase.transformed);
    const tolerance = testCase.tolerance ?? 0.02;
    let passed = false;

    if (testCase.relationship === "equivalent") {
      passed = Math.abs(original.score - transformed.score) <= tolerance;
    } else if (testCase.relationship === "monotonic-increase") {
      passed = transformed.score + tolerance >= original.score;
    } else {
      passed = transformed.score - tolerance <= original.score;
    }

    findings.push({
      name: testCase.name,
      passed,
      originalScore: original.score,
      transformedScore: transformed.score,
      message: passed
        ? "Expected score relationship held."
        : `Expected ${testCase.relationship} relationship failed within tolerance ${tolerance}.`,
    });
  }

  return findings;
}

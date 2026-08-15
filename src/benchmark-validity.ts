import type { ValidationFinding, Verifier } from "./contracts.js";

export interface BenchmarkDefinition<State, Action> {
  id: string;
  version: string;
  task: string;
  worldFindings: ValidationFinding[];
  verifiers: Verifier<State, Action>[];
  hiddenCaseCount: number;
  publicCaseCount: number;
  hasPositiveControls: boolean;
  hasNegativeControls: boolean;
  architectureAssumptions: string[];
}

export interface BenchmarkValidityReport {
  valid: boolean;
  score: number;
  findings: ValidationFinding[];
}

export function validateBenchmark<State, Action>(definition: BenchmarkDefinition<State, Action>): BenchmarkValidityReport {
  const findings: ValidationFinding[] = [...definition.worldFindings];

  if (definition.verifiers.length === 0) {
    findings.push({ code: "NO_VERIFIERS", severity: "critical", message: "A benchmark cannot publish claims without a verifier." });
  }
  if (!definition.verifiers.some((verifier) => verifier.deterministic)) {
    findings.push({ code: "NO_DETERMINISTIC_VERIFIER", severity: "warning", message: "No deterministic verifier is present; subjective grading risk is elevated." });
  }
  if (!definition.hasPositiveControls || !definition.hasNegativeControls) {
    findings.push({ code: "MISSING_CONTROLS", severity: "warning", message: "Positive and negative controls are both required for strong validity." });
  }
  if (definition.hiddenCaseCount < 1) {
    findings.push({ code: "NO_HOLDBACK_SET", severity: "warning", message: "No hidden holdback scenarios are declared." });
  }
  if (definition.architectureAssumptions.length > 0) {
    findings.push({
      code: "ARCHITECTURE_BIAS",
      severity: "critical",
      message: `Benchmark declares participant-internal assumptions: ${definition.architectureAssumptions.join(", ")}`,
    });
  }
  if (definition.task.trim().length < 10) {
    findings.push({ code: "AMBIGUOUS_TASK", severity: "warning", message: "Task definition is too short to establish a stable evaluation objective." });
  }

  const penalties = findings.reduce((sum, finding) => sum + (finding.severity === "critical" ? 0.4 : finding.severity === "warning" ? 0.1 : 0), 0);
  const score = Math.max(0, Math.min(1, 1 - penalties));
  return { valid: !findings.some((finding) => finding.severity === "critical"), score, findings };
}

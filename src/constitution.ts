import type { EvaluationResult } from "./contracts.js";

export interface ConstitutionalViolation {
  rule: string;
  message: string;
}

export function enforceConstitution<State, Action>(result: EvaluationResult<State, Action>): ConstitutionalViolation[] {
  const violations: ConstitutionalViolation[] = [];

  if (!result.evidenceRoot) {
    violations.push({ rule: "EVIDENCE_REQUIRED", message: "No published claim may exist without an evidence root." });
  }
  if (!result.replayMatched && result.status !== "invalid") {
    violations.push({ rule: "REPLAY_DOWNGRADE", message: "A reproduction failure must invalidate the claim." });
  }
  if (result.auditFindings.some((finding) => finding.severity === "critical") && result.status !== "invalid") {
    violations.push({ rule: "CRITICAL_FINDING_BLOCKS_PUBLICATION", message: "Critical Internal Affairs findings cannot be overridden." });
  }
  if (result.verifierResults.length === 0 && result.status !== "inconclusive" && result.status !== "invalid") {
    violations.push({ rule: "VERIFIER_REQUIRED", message: "A claim without verifier evidence cannot be Verified or Qualified." });
  }
  if (result.confidence.overallConfidence < 0.5 && result.status === "verified") {
    violations.push({ rule: "CONFIDENCE_CEILING", message: "Published confidence state exceeds evidence support." });
  }

  return violations;
}

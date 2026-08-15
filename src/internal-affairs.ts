import type { AuditFinding, ClaimStatus, ConfidenceBreakdown, ValidationFinding, VerifierResult } from "./contracts.js";

export interface InternalAffairsInput {
  worldFindings: ValidationFinding[];
  verifierResults: VerifierResult[];
  confidence: ConfidenceBreakdown;
  replayMatched: boolean;
  evidenceLedgerValid: boolean;
}

export function auditEvaluation(input: InternalAffairsInput): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const finding of input.worldFindings) {
    findings.push({
      code: `WORLD_${finding.code}`,
      severity: finding.severity,
      message: finding.message,
    });
  }

  if (!input.replayMatched) {
    findings.push({ code: "REPLAY_MISMATCH", severity: "critical", message: "Independent environment replay did not reproduce the recorded final state." });
  }

  if (!input.evidenceLedgerValid) {
    findings.push({ code: "EVIDENCE_CHAIN_INVALID", severity: "critical", message: "The evidence ledger failed integrity verification." });
  }

  const verifierDisagreement = Math.max(...input.verifierResults.map((r) => r.score), 0) - Math.min(...input.verifierResults.map((r) => r.score), 1);
  if (input.verifierResults.length > 1 && verifierDisagreement > 0.35) {
    findings.push({ code: "VERIFIER_DISAGREEMENT", severity: "warning", message: `Verifier scores diverged by ${verifierDisagreement.toFixed(3)}.` });
  }

  if (input.confidence.overallConfidence < 0.6) {
    findings.push({ code: "LOW_CONFIDENCE", severity: "warning", message: "Evidence confidence is too low for an unqualified claim." });
  }

  return findings;
}

export function publicationStatus(findings: AuditFinding[], confidence: ConfidenceBreakdown, verifierResults: VerifierResult[]): ClaimStatus {
  if (findings.some((finding) => finding.severity === "critical")) return "invalid";
  if (verifierResults.length === 0) return "inconclusive";
  if (confidence.overallConfidence < 0.5) return "inconclusive";
  if (findings.some((finding) => finding.severity === "warning") || confidence.overallConfidence < 0.85) return "qualified";
  return "verified";
}

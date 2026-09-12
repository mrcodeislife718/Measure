import type { ClaimStatus } from "./contracts.js";

/**
 * The portable contract Measure accepts from an Epistemic Independence Accounting
 * producer such as Forensicly. Forensicly owns lineage discovery and independence
 * analysis; Measure consumes the resulting evidence when qualifying verification.
 */
export interface EpistemicIndependenceEvidence {
  schemaVersion: "1";
  producer: string;
  claimId: string;
  evidencePathCount: number;
  uniqueRootLineageIds: string[];
  independenceScore: number;
  falseMultiplicityDetected: boolean;
  lineageDigest?: string;
  notes?: string[];
}

export interface EpistemicVerificationPolicy {
  minimumIndependentRoots: number;
  minimumIndependenceScore: number;
  rejectFalseMultiplicity: boolean;
  requireLineageDigest: boolean;
}

export interface EpistemicVerificationAssessment {
  acceptedAsIndependentEvidence: boolean;
  independentRootCount: number;
  independenceScore: number;
  blockedReasons: string[];
  warnings: string[];
}

export interface VerificationQualification {
  requestedStatus: ClaimStatus;
  qualifiedStatus: ClaimStatus;
  epistemic: EpistemicVerificationAssessment;
  reasons: string[];
}

export const DEFAULT_EPISTEMIC_VERIFICATION_POLICY: Readonly<EpistemicVerificationPolicy> = Object.freeze({
  minimumIndependentRoots: 2,
  minimumIndependenceScore: 0.6,
  rejectFalseMultiplicity: true,
  requireLineageDigest: false,
});

function finiteUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Validate and interpret external EIA evidence without reimplementing Forensicly's
 * genealogy engine. Measure intentionally treats the report as verification evidence,
 * not as a substitute for its own verifier execution, replay, audits, or controls.
 */
export function assessEpistemicVerificationEvidence(
  evidence: EpistemicIndependenceEvidence,
  policy: EpistemicVerificationPolicy = DEFAULT_EPISTEMIC_VERIFICATION_POLICY,
): EpistemicVerificationAssessment {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  const roots = [...new Set(evidence.uniqueRootLineageIds.filter((id) => id.trim().length > 0))];

  if (evidence.schemaVersion !== "1") blockedReasons.push("unsupported-eia-schema");
  if (!evidence.producer.trim()) blockedReasons.push("missing-eia-producer");
  if (!evidence.claimId.trim()) blockedReasons.push("missing-eia-claim-id");
  if (!Number.isInteger(evidence.evidencePathCount) || evidence.evidencePathCount < 0) blockedReasons.push("invalid-evidence-path-count");
  if (!finiteUnitInterval(evidence.independenceScore)) blockedReasons.push("invalid-independence-score");
  if (roots.length > evidence.evidencePathCount) blockedReasons.push("root-count-exceeds-evidence-path-count");

  if (policy.rejectFalseMultiplicity && evidence.falseMultiplicityDetected) {
    blockedReasons.push("false-multiplicity-detected");
  } else if (evidence.falseMultiplicityDetected) {
    warnings.push("false-multiplicity-detected");
  }

  if (roots.length < policy.minimumIndependentRoots) {
    blockedReasons.push(`insufficient-independent-roots:${roots.length}<${policy.minimumIndependentRoots}`);
  }

  if (finiteUnitInterval(evidence.independenceScore) && evidence.independenceScore < policy.minimumIndependenceScore) {
    blockedReasons.push(`independence-score-below-threshold:${evidence.independenceScore}<${policy.minimumIndependenceScore}`);
  }

  if (policy.requireLineageDigest && !evidence.lineageDigest?.trim()) {
    blockedReasons.push("missing-lineage-digest");
  } else if (!evidence.lineageDigest?.trim()) {
    warnings.push("lineage-digest-not-provided");
  }

  if (evidence.evidencePathCount > 0 && roots.length === 1 && evidence.evidencePathCount > 1) {
    warnings.push("multiple-evidence-paths-share-one-root-lineage");
  }

  return {
    acceptedAsIndependentEvidence: blockedReasons.length === 0,
    independentRootCount: roots.length,
    independenceScore: finiteUnitInterval(evidence.independenceScore) ? evidence.independenceScore : 0,
    blockedReasons,
    warnings,
  };
}

/**
 * Apply EIA to a claim status. A claim cannot remain `verified` when the evidence
 * presented as corroboration is not epistemically independent. Measure downgrades
 * rather than silently inflating confidence from duplicated or derivative evidence.
 */
export function qualifyVerificationWithEia(
  requestedStatus: ClaimStatus,
  evidence: EpistemicIndependenceEvidence,
  policy: EpistemicVerificationPolicy = DEFAULT_EPISTEMIC_VERIFICATION_POLICY,
): VerificationQualification {
  const epistemic = assessEpistemicVerificationEvidence(evidence, policy);
  const reasons = [...epistemic.blockedReasons, ...epistemic.warnings];

  if (requestedStatus === "verified" && !epistemic.acceptedAsIndependentEvidence) {
    return {
      requestedStatus,
      qualifiedStatus: "qualified",
      epistemic,
      reasons: ["verified-status-blocked-by-epistemic-independence", ...reasons],
    };
  }

  return {
    requestedStatus,
    qualifiedStatus: requestedStatus,
    epistemic,
    reasons,
  };
}

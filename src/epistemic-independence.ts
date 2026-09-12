import type { ClaimStatus } from "./contracts.js";

/**
 * Measure-native evidence path used for epistemic independence accounting.
 * Measure computes independence from its own evaluation evidence and does not
 * require any external repository or service.
 */
export interface EpistemicEvidencePath {
  evidenceId: string;
  rootLineageIds: string[];
  dependencyIds?: string[];
  channel?: string;
  executionId?: string;
}

export interface EpistemicVerificationPolicy {
  minimumIndependentRoots: number;
  minimumIndependenceScore: number;
  rejectFalseMultiplicity: boolean;
}

export interface EpistemicVerificationAssessment {
  acceptedAsIndependentEvidence: boolean;
  evidencePathCount: number;
  independentRootCount: number;
  uniqueRootLineageIds: string[];
  independenceScore: number;
  falseMultiplicityDetected: boolean;
  sharedDependencies: string[];
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
});

function normalized(values: string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

/**
 * Compute epistemic independence directly from Measure's own evidence paths.
 * Distinct records are not assumed to be independent: shared roots and shared
 * dependencies reduce effective corroboration and can trigger false multiplicity.
 */
export function assessEpistemicIndependence(
  paths: EpistemicEvidencePath[],
  policy: EpistemicVerificationPolicy = DEFAULT_EPISTEMIC_VERIFICATION_POLICY,
): EpistemicVerificationAssessment {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  const validPaths = paths.filter((path) => path.evidenceId.trim().length > 0);
  if (validPaths.length !== paths.length) blockedReasons.push("missing-evidence-id");

  const rootsByPath = validPaths.map((path) => normalized(path.rootLineageIds));
  if (rootsByPath.some((roots) => roots.length === 0)) blockedReasons.push("missing-root-lineage");

  const uniqueRootLineageIds = normalized(rootsByPath.flat());

  const rootUse = new Map<string, number>();
  for (const roots of rootsByPath) {
    for (const root of roots) rootUse.set(root, (rootUse.get(root) ?? 0) + 1);
  }
  const repeatedRoots = [...rootUse.entries()].filter(([, count]) => count > 1).map(([root]) => root).sort();

  const dependencyUse = new Map<string, number>();
  for (const path of validPaths) {
    for (const dependency of normalized(path.dependencyIds)) {
      dependencyUse.set(dependency, (dependencyUse.get(dependency) ?? 0) + 1);
    }
  }
  const sharedDependencies = [...dependencyUse.entries()]
    .filter(([, count]) => count > 1)
    .map(([dependency]) => dependency)
    .sort();

  const pathCount = validPaths.length;
  const rootRatio = pathCount === 0 ? 0 : Math.min(1, uniqueRootLineageIds.length / pathCount);
  const dependencyPenalty = pathCount <= 1 ? 0 : Math.min(0.5, sharedDependencies.length / (pathCount * 2));
  const independenceScore = Number(Math.max(0, rootRatio - dependencyPenalty).toFixed(4));

  const falseMultiplicityDetected = pathCount > 1 && (
    uniqueRootLineageIds.length < pathCount || repeatedRoots.length > 0 || sharedDependencies.length > 0
  );

  if (policy.rejectFalseMultiplicity && falseMultiplicityDetected) {
    blockedReasons.push("false-multiplicity-detected");
  } else if (falseMultiplicityDetected) {
    warnings.push("false-multiplicity-detected");
  }

  if (uniqueRootLineageIds.length < policy.minimumIndependentRoots) {
    blockedReasons.push(`insufficient-independent-roots:${uniqueRootLineageIds.length}<${policy.minimumIndependentRoots}`);
  }

  if (independenceScore < policy.minimumIndependenceScore) {
    blockedReasons.push(`independence-score-below-threshold:${independenceScore}<${policy.minimumIndependenceScore}`);
  }

  if (repeatedRoots.length > 0) warnings.push(`shared-root-lineages:${repeatedRoots.join(",")}`);
  if (sharedDependencies.length > 0) warnings.push(`shared-dependencies:${sharedDependencies.join(",")}`);

  return {
    acceptedAsIndependentEvidence: blockedReasons.length === 0,
    evidencePathCount: pathCount,
    independentRootCount: uniqueRootLineageIds.length,
    uniqueRootLineageIds,
    independenceScore,
    falseMultiplicityDetected,
    sharedDependencies,
    blockedReasons,
    warnings,
  };
}

/**
 * Apply Measure's native epistemic-independence result to publication status.
 * A requested `verified` status is downgraded when corroboration is not truly
 * independent rather than allowing duplicated evidence to inflate confidence.
 */
export function qualifyVerificationWithEia(
  requestedStatus: ClaimStatus,
  paths: EpistemicEvidencePath[],
  policy: EpistemicVerificationPolicy = DEFAULT_EPISTEMIC_VERIFICATION_POLICY,
): VerificationQualification {
  const epistemic = assessEpistemicIndependence(paths, policy);
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

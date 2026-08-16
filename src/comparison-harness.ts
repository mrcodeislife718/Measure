import { createHash } from "node:crypto";
import type { EvidenceEconomicsSample } from "./proof-economics.js";
import { compareEvidenceEconomics } from "./proof-economics.js";

export interface ComparisonPreregistration {
  id: string;
  title: string;
  hypothesis: string;
  primaryMetric: "trustworthy_evidence_per_human_hour";
  secondaryMetrics: string[];
  participantIds: string[];
  scenarioFamilies: string[];
  validityRequirements: string[];
  exclusionRules: string[];
  stoppingRule: string;
  analysisPlan: string;
  createdAt: string;
}

export interface ComparisonObservation extends EvidenceEconomicsSample {
  approach: string;
  participantId: string;
  scenarioFamily: string;
  predictiveValidity?: number;
  verifierErrorRate?: number;
  criticalFailuresFound?: number;
}

export function preregistrationDigest(value: ComparisonPreregistration): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function validatePreregistration(value: ComparisonPreregistration): string[] {
  const findings: string[] = [];
  if (value.primaryMetric !== "trustworthy_evidence_per_human_hour") findings.push("primary metric must remain locked");
  if (value.participantIds.length < 2) findings.push("comparison requires at least two participant systems");
  if (!value.scenarioFamilies.length) findings.push("comparison requires declared scenario families");
  if (!value.validityRequirements.some((item) => /blind/i.test(item))) findings.push("blind evaluation requirement missing");
  if (!value.validityRequirements.some((item) => /same|identical/i.test(item))) findings.push("equivalent-condition requirement missing");
  if (!value.stoppingRule.trim()) findings.push("statistical stopping rule missing");
  return findings;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function aggregate(samples: ComparisonObservation[]): EvidenceEconomicsSample {
  return {
    environmentAuthoringMinutes: samples.reduce((sum, item) => sum + item.environmentAuthoringMinutes, 0),
    expertReviewMinutes: samples.reduce((sum, item) => sum + item.expertReviewMinutes, 0),
    scenariosValidated: samples.reduce((sum, item) => sum + item.scenariosValidated, 0),
    failuresDiscovered: samples.reduce((sum, item) => sum + item.failuresDiscovered, 0),
    falsePositiveFindings: samples.reduce((sum, item) => sum + item.falsePositiveFindings, 0),
    trustworthyEvidenceUnits: samples.reduce((sum, item) => sum + item.trustworthyEvidenceUnits, 0),
    computeCostUsd: samples.reduce((sum, item) => sum + item.computeCostUsd, 0),
  };
}

export function analyzeComparison(input: {
  preregistration: ComparisonPreregistration;
  lockedDigest: string;
  referenceApproach: string;
  measureApproach: string;
  observations: ComparisonObservation[];
}) {
  const findings = validatePreregistration(input.preregistration);
  if (preregistrationDigest(input.preregistration) !== input.lockedDigest) findings.push("preregistration digest mismatch");
  const reference = input.observations.filter((item) => item.approach === input.referenceApproach);
  const measure = input.observations.filter((item) => item.approach === input.measureApproach);
  if (!reference.length || !measure.length) findings.push("both approaches require observations");

  const economics = compareEvidenceEconomics(aggregate(reference), aggregate(measure));
  return {
    valid: findings.length === 0,
    findings,
    lockedDigest: input.lockedDigest,
    economics,
    predictiveValidity: {
      reference: mean(reference.flatMap((item) => item.predictiveValidity === undefined ? [] : [item.predictiveValidity])),
      measure: mean(measure.flatMap((item) => item.predictiveValidity === undefined ? [] : [item.predictiveValidity])),
    },
    verifierErrorRate: {
      reference: mean(reference.flatMap((item) => item.verifierErrorRate === undefined ? [] : [item.verifierErrorRate])),
      measure: mean(measure.flatMap((item) => item.verifierErrorRate === undefined ? [] : [item.verifierErrorRate])),
    },
    criticalFailuresFound: {
      reference: reference.reduce((sum, item) => sum + Number(item.criticalFailuresFound ?? 0), 0),
      measure: measure.reduce((sum, item) => sum + Number(item.criticalFailuresFound ?? 0), 0),
    },
  };
}

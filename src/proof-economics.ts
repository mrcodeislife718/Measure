export interface EvidenceEconomicsSample {
  environmentAuthoringMinutes: number;
  expertReviewMinutes: number;
  scenariosValidated: number;
  failuresDiscovered: number;
  falsePositiveFindings: number;
  trustworthyEvidenceUnits: number;
  computeCostUsd: number;
}

export interface EvidenceEconomicsReport {
  humanHours: number;
  trustworthyEvidencePerHumanHour: number;
  validatedScenariosPerHumanHour: number;
  discoveriesPerHumanHour: number;
  falsePositiveRate: number;
  computeCostPerEvidenceUnit: number;
}

export function evidenceEconomics(sample: EvidenceEconomicsSample): EvidenceEconomicsReport {
  const humanHours = Math.max(1 / 60, (sample.environmentAuthoringMinutes + sample.expertReviewMinutes) / 60);
  return {
    humanHours,
    trustworthyEvidencePerHumanHour: sample.trustworthyEvidenceUnits / humanHours,
    validatedScenariosPerHumanHour: sample.scenariosValidated / humanHours,
    discoveriesPerHumanHour: sample.failuresDiscovered / humanHours,
    falsePositiveRate: sample.failuresDiscovered + sample.falsePositiveFindings > 0
      ? sample.falsePositiveFindings / (sample.failuresDiscovered + sample.falsePositiveFindings)
      : 0,
    computeCostPerEvidenceUnit: sample.trustworthyEvidenceUnits > 0 ? sample.computeCostUsd / sample.trustworthyEvidenceUnits : 0,
  };
}

export function compareEvidenceEconomics(reference: EvidenceEconomicsSample, measure: EvidenceEconomicsSample) {
  const baseline = evidenceEconomics(reference);
  const candidate = evidenceEconomics(measure);
  const ratio = baseline.trustworthyEvidencePerHumanHour > 0
    ? candidate.trustworthyEvidencePerHumanHour / baseline.trustworthyEvidencePerHumanHour
    : 0;
  return {
    reference: baseline,
    measure: candidate,
    evidenceEfficiencyMultiplier: ratio,
    thirtyXReached: ratio >= 30,
    claim: ratio > 0 ? `${ratio.toFixed(2)}x trustworthy evidence per human-hour` : "insufficient evidence for multiplier",
  };
}

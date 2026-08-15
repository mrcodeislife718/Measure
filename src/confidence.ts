import type { ConfidenceBreakdown, VerifierResult } from "./contracts.js";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface ConfidenceInputs {
  verifierResults: VerifierResult[];
  worldFindingCount: number;
  replayMatched: boolean;
  sampleCount?: number;
  realityCalibration?: number;
}

export function calculateConfidence(inputs: ConfidenceInputs): ConfidenceBreakdown {
  const disagreement = inputs.verifierResults.length <= 1
    ? 0
    : standardDeviation(inputs.verifierResults.map((result) => result.score));

  const participantRandomness = 0.05;
  const benchmarkAmbiguity = clamp01(inputs.worldFindingCount * 0.08);
  const verifierUncertainty = clamp01(disagreement);
  const simulationUncertainty = inputs.replayMatched ? 0.02 : 0.5;
  const samplingUncertainty = 1 / Math.sqrt(Math.max(1, inputs.sampleCount ?? 1));
  const realityTransferUncertainty = 1 - clamp01(inputs.realityCalibration ?? 0.5);

  const uncertainties = [
    participantRandomness,
    benchmarkAmbiguity,
    verifierUncertainty,
    simulationUncertainty,
    samplingUncertainty,
    realityTransferUncertainty,
  ];

  const overallConfidence = clamp01(1 - uncertainties.reduce((sum, value) => sum + value, 0) / uncertainties.length);

  return {
    participantRandomness,
    benchmarkAmbiguity,
    verifierUncertainty,
    simulationUncertainty,
    samplingUncertainty,
    realityTransferUncertainty,
    overallConfidence,
  };
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

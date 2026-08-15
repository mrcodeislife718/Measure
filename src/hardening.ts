import { createHash } from "node:crypto";

export interface BlindIdentity { blindedId: string; secretDigest: string }
export function blindParticipant(identity: string, salt: string): BlindIdentity {
  return {
    blindedId: `P-${createHash("sha256").update(`${salt}:${identity}`).digest("hex").slice(0, 12)}`,
    secretDigest: createHash("sha256").update(`${identity}:${salt}:secret`).digest("hex"),
  };
}

export interface HoldbackCase<T> { id: string; payload: T; sealedAt: string; digest: string }
export function sealHoldback<T>(id: string, payload: T, sealedAt = new Date().toISOString()): HoldbackCase<T> {
  return { id, payload, sealedAt, digest: createHash("sha256").update(JSON.stringify({ id, payload, sealedAt })).digest("hex") };
}
export function verifyHoldback<T>(entry: HoldbackCase<T>): boolean {
  return entry.digest === createHash("sha256").update(JSON.stringify({ id: entry.id, payload: entry.payload, sealedAt: entry.sealedAt })).digest("hex");
}

export interface GamingFinding { code: string; severity: "warning" | "critical"; message: string }
export function detectBenchmarkGaming(input: {
  traceActions: unknown[];
  allowedActionNames?: string[];
  repeatedActionThreshold?: number;
  verifierStateTouched?: boolean;
  answerKeyAccessed?: boolean;
  hiddenCaseIdsObserved?: boolean;
}): GamingFinding[] {
  const findings: GamingFinding[] = [];
  if (input.verifierStateTouched) findings.push({ code: "gaming.verifier-state", severity: "critical", message: "Participant touched verifier-owned state" });
  if (input.answerKeyAccessed) findings.push({ code: "gaming.answer-key", severity: "critical", message: "Participant accessed protected answer material" });
  if (input.hiddenCaseIdsObserved) findings.push({ code: "gaming.holdback-leak", severity: "critical", message: "Participant observed sealed holdback identifiers" });
  const names = input.traceActions.map((action) => typeof action === "object" && action && "type" in action ? String((action as { type: unknown }).type) : JSON.stringify(action));
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const threshold = input.repeatedActionThreshold ?? 20;
  for (const [name, count] of counts) if (count > threshold) findings.push({ code: "gaming.repetition", severity: "warning", message: `${name} repeated ${count} times; inspect for brute-force exploitation` });
  if (input.allowedActionNames) for (const name of names) if (!input.allowedActionNames.includes(name)) findings.push({ code: "gaming.unintended-action", severity: "critical", message: `Observed action outside declared interface: ${name}` });
  return findings;
}

export interface ExpertJudgment { expertId: string; score: number; rationale?: string }
export function expertAgreement(judgments: ExpertJudgment[]): { mean: number; standardDeviation: number; agreement: number; needsAdjudication: boolean } {
  if (!judgments.length) return { mean: 0, standardDeviation: 1, agreement: 0, needsAdjudication: true };
  const values = judgments.map((item) => item.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  const agreement = Math.max(0, 1 - standardDeviation);
  return { mean, standardDeviation, agreement, needsAdjudication: values.length < 2 || agreement < 0.8 };
}

export interface RealityPair { simulated: number; observed: number }
export function realityCalibration(pairs: RealityPair[]): { mae: number; agreement: number; sampleCount: number } {
  if (!pairs.length) return { mae: 1, agreement: 0, sampleCount: 0 };
  const mae = pairs.reduce((sum, pair) => sum + Math.abs(pair.simulated - pair.observed), 0) / pairs.length;
  return { mae, agreement: Math.max(0, 1 - mae), sampleCount: pairs.length };
}

export function sequentialDecision(samples: boolean[], options: { minSamples?: number; targetHalfWidth?: number } = {}): { stop: boolean; rate: number; halfWidth: number } {
  const n = samples.length;
  const rate = n ? samples.filter(Boolean).length / n : 0;
  const z = 1.96;
  const denom = 1 + z * z / Math.max(1, n);
  const halfWidth = n ? z * Math.sqrt((rate * (1 - rate) + z * z / (4 * n)) / n) / denom : 1;
  return { stop: n >= (options.minSamples ?? 30) && halfWidth <= (options.targetHalfWidth ?? 0.03), rate, halfWidth };
}

export interface DissentRecord { source: string; claimId: string; reason: string; severity: "warning" | "critical"; timestamp: string }
export class DissentLedger {
  #records: DissentRecord[] = [];
  append(record: Omit<DissentRecord, "timestamp">): void { this.#records.push({ ...record, timestamp: new Date().toISOString() }); }
  records(): readonly DissentRecord[] { return this.#records; }
  blocksPublication(): boolean { return this.#records.some((record) => record.severity === "critical"); }
}

export interface PublishedClaim { id: string; status: "verified" | "qualified" | "inconclusive" | "invalid"; confidence: number; verifiedAt: string; dependencies: string[] }
export function decayClaim(claim: PublishedClaim, input: { ageDays: number; contradicted?: boolean; dependencyInvalidated?: boolean }): PublishedClaim {
  if (input.contradicted || input.dependencyInvalidated) return { ...claim, status: "invalid", confidence: 0 };
  const confidence = Math.max(0, claim.confidence * Math.exp(-input.ageDays / 365));
  return { ...claim, confidence, status: confidence >= 0.9 ? claim.status : confidence >= 0.7 ? "qualified" : "inconclusive" };
}

export function invalidateDependentClaims(claims: PublishedClaim[], invalidDependency: string): PublishedClaim[] {
  return claims.map((claim) => claim.dependencies.includes(invalidDependency) ? { ...claim, status: "invalid", confidence: 0 } : claim);
}

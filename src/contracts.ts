export type ClaimStatus = "verified" | "qualified" | "inconclusive" | "invalid";

export type Severity = "info" | "warning" | "critical";

export interface ParticipantAdapter<Observation, Action> {
  readonly id: string;
  readonly kind: string;
  act(observation: Observation, context: ParticipantContext): Promise<Action> | Action;
}

export interface ParticipantContext {
  runId: string;
  step: number;
  remainingBudget: number;
  task: string;
}

export interface World<State, Observation, Action> {
  readonly id: string;
  snapshot(): State;
  observe(): Observation;
  apply(action: Action): WorldStep<State>;
  validate(): ValidationFinding[];
}

export interface WorldStep<State> {
  accepted: boolean;
  cost: number;
  state: State;
  notes?: string[];
}

export interface ValidationFinding {
  code: string;
  severity: Severity;
  message: string;
}

export interface TraceEntry<Action, State> {
  step: number;
  action: Action;
  accepted: boolean;
  cost: number;
  stateHash: string;
  notes: string[];
}

export interface VerificationContext<State, Action> {
  initialState: State;
  finalState: State;
  trace: TraceEntry<Action, State>[];
  task: string;
}

export interface Verifier<State, Action> {
  readonly id: string;
  readonly version: string;
  readonly deterministic: boolean;
  verify(context: VerificationContext<State, Action>): Promise<VerifierResult> | VerifierResult;
}

export interface VerifierResult {
  verifierId: string;
  score: number;
  passed: boolean;
  evidence: string[];
  failureCategory?: string;
}

export interface ConfidenceBreakdown {
  participantRandomness: number;
  benchmarkAmbiguity: number;
  verifierUncertainty: number;
  simulationUncertainty: number;
  samplingUncertainty: number;
  realityTransferUncertainty: number;
  overallConfidence: number;
}

export interface AuditFinding {
  code: string;
  severity: Severity;
  message: string;
}

export interface EvaluationResult<State, Action> {
  runId: string;
  participantId: string;
  benchmarkId: string;
  initialState: State;
  finalState: State;
  trace: TraceEntry<Action, State>[];
  verifierResults: VerifierResult[];
  confidence: ConfidenceBreakdown;
  auditFindings: AuditFinding[];
  evidenceRoot: string;
  replayMatched: boolean;
  status: ClaimStatus;
}

export interface EvaluationSpec<State, Observation, Action> {
  runId: string;
  benchmarkId: string;
  task: string;
  maxSteps: number;
  resourceBudget: number;
  participant: ParticipantAdapter<Observation, Action>;
  worldFactory: () => World<State, Observation, Action>;
  verifiers: Verifier<State, Action>[];
  stopWhen?: (state: State, trace: TraceEntry<Action, State>[]) => boolean;
}

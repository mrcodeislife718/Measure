import type { EvaluationResult, EvaluationSpec, TraceEntry } from "./contracts.js";
import { calculateConfidence } from "./confidence.js";
import { EvidenceLedger } from "./evidence-ledger.js";
import { sha256 } from "./hash.js";
import { auditEvaluation, publicationStatus } from "./internal-affairs.js";
import { replayTrace } from "./replay.js";

export async function runEvaluation<State, Observation, Action>(
  spec: EvaluationSpec<State, Observation, Action>,
): Promise<EvaluationResult<State, Action>> {
  const world = spec.worldFactory();
  const initialState = structuredClone(world.snapshot());
  const worldFindings = world.validate();
  const ledger = new EvidenceLedger();
  const trace: TraceEntry<Action, State>[] = [];
  let remainingBudget = spec.resourceBudget;

  ledger.append("evaluation.pre_registered", {
    runId: spec.runId,
    benchmarkId: spec.benchmarkId,
    participantId: spec.participant.id,
    participantKind: spec.participant.kind,
    task: spec.task,
    maxSteps: spec.maxSteps,
    resourceBudget: spec.resourceBudget,
  });
  ledger.append("world.initial", initialState);
  ledger.append("world.validation", worldFindings);

  for (let step = 0; step < spec.maxSteps && remainingBudget > 0; step += 1) {
    const observation = world.observe();
    ledger.append("observation", { step, observation });

    const action = await spec.participant.act(observation, {
      runId: spec.runId,
      step,
      remainingBudget,
      task: spec.task,
    });
    const result = world.apply(action);
    remainingBudget -= result.cost;

    const entry: TraceEntry<Action, State> = {
      step,
      action,
      accepted: result.accepted,
      cost: result.cost,
      stateHash: sha256(result.state),
      notes: result.notes ?? [],
    };
    trace.push(entry);
    ledger.append("action", entry);

    if (spec.stopWhen?.(result.state, trace)) break;
  }

  const finalState = structuredClone(world.snapshot());
  ledger.append("world.final", finalState);

  const verifierResults = [];
  for (const verifier of spec.verifiers) {
    const result = await verifier.verify({ initialState, finalState, trace, task: spec.task });
    verifierResults.push(result);
    ledger.append("verification", { verifier: verifier.id, version: verifier.version, result });
  }

  const replay = replayTrace(spec.worldFactory, trace);
  ledger.append("replay", replay);

  const confidence = calculateConfidence({
    verifierResults,
    worldFindingCount: worldFindings.filter((finding) => finding.severity !== "info").length,
    replayMatched: replay.matched,
    sampleCount: Math.max(1, trace.length),
  });
  ledger.append("confidence", confidence);

  const auditFindings = auditEvaluation({
    worldFindings,
    verifierResults,
    confidence,
    replayMatched: replay.matched,
    evidenceLedgerValid: ledger.verify(),
  });
  ledger.append("internal_affairs", auditFindings);

  const status = publicationStatus(auditFindings, confidence, verifierResults);
  ledger.append("publication_gate", { status });

  return {
    runId: spec.runId,
    participantId: spec.participant.id,
    benchmarkId: spec.benchmarkId,
    initialState,
    finalState,
    trace,
    verifierResults,
    confidence,
    auditFindings,
    evidenceRoot: ledger.root(),
    replayMatched: replay.matched,
    status,
  };
}

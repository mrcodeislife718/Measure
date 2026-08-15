import type { TraceEntry, World } from "./contracts.js";
import { sha256 } from "./hash.js";

export interface ReplayResult<State> {
  matched: boolean;
  finalState: State;
  expectedHash: string;
  actualHash: string;
}

export function replayTrace<State, Observation, Action>(
  worldFactory: () => World<State, Observation, Action>,
  trace: TraceEntry<Action, State>[],
): ReplayResult<State> {
  const world = worldFactory();
  for (const entry of trace) world.apply(entry.action);
  const finalState = world.snapshot();
  const actualHash = sha256(finalState);
  const expectedHash = trace.at(-1)?.stateHash ?? sha256(world.snapshot());
  return { matched: actualHash === expectedHash, finalState, expectedHash, actualHash };
}

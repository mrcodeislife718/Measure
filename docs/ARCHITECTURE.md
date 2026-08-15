# Measure architecture

Measure is an architecture-neutral evaluation operating system. It evaluates participant behavior and external consequences, not implementation technique.

## Primary flow

```text
Participant
  -> Neutral participant adapter
  -> Pre-registered benchmark specification
  -> Validated persistent world
  -> Observation / action loop
  -> Immutable evidence ledger
  -> Deterministic-first verifier network
  -> Independent environment replay
  -> Confidence decomposition
  -> Internal Affairs audit
  -> Constitutional invariant check
  -> Publication gate
```

## Separation of powers

Measure deliberately separates responsibilities:

- **Participant adapter** exposes only the common observation/action contract.
- **World** owns state and validates world invariants.
- **Verifier** determines whether observable outcomes satisfy objective criteria.
- **Replay engine** independently reconstructs world state from recorded actions.
- **Confidence engine** expresses uncertainty rather than hiding it in a single score.
- **Internal Affairs** searches for reasons an evaluation claim should be downgraded or rejected.
- **Constitution** defines conditions that cannot be overridden by publication logic.
- **Publication gate** returns `verified`, `qualified`, `inconclusive`, or `invalid`.

No component is supposed to certify itself.

## System neutrality

A participant is identified by an adapter with `act(observation, context)`. The core contract does not require an LLM, transformer, prompt, chain of thought, neural network, symbolic planner, model provider, or any other implementation method.

This allows the same benchmark to evaluate model-based agents, deterministic systems, symbolic systems, hybrid systems, Epiphany, robotics controllers, and future architectures under the same external conditions.

## Evidence model

Every significant event is appended to a SHA-256 hash-linked evidence ledger. The current prototype records pre-registration, initial world state, world validation, observations, actions, final state, verifier decisions, independent replay, confidence, Internal Affairs findings, and publication status.

## Operational Intelligence suite

The first implemented world is an inventory/fulfillment environment. It tests whether a participant can satisfy current demand without corrupting persistent inventory state or violating reserved future demand. It includes deterministic objective, integrity, and efficiency verifiers plus controlled transfer failures and permission restrictions.

This is intentionally small. It is the executable proof of the kernel boundary, not the final benchmark catalog.

## Planned hardening layers

The architecture is designed to grow into:

- environment compiler
- procedural scenario generator
- adaptive experiment planner
- counterexample minimizer
- fault and perturbation matrix
- metamorphic evaluation
- verifier red-team harness
- independent implementation replication
- contamination-resistant sealed holdbacks
- expert agreement engine
- simulation/reality calibration
- temporal revalidation
- retroactive claim invalidation
- post-publication monitor
- local, air-gapped, and hosted runners
- benchmark registry and certification network

The governing rule is that a result must be easier for Measure to invalidate than for Measure to overstate.

# Measure

**Measure is an architecture-neutral evaluation operating system for determining what an intelligent system can actually be trusted to do.**

Measure does not assume that intelligence means an LLM, transformer, neural network, symbolic planner, prompt workflow, or any other implementation technique. Participants are judged by observable behavior, consequences, reliability, resource use, and evidence under the same external conditions.

The project is built around one invariant:

> The evaluator must actively search for reasons its own conclusion could be wrong before it is allowed to publish confidence.

## Why Measure exists

Static benchmark workflows usually look like:

```text
create benchmark -> run benchmark -> produce score
```

Measure is designed around a deeper lifecycle:

```text
ingest system
-> construct and validate world
-> pre-register evaluation
-> generate scenarios
-> attack scenarios and verifiers
-> run participant
-> preserve immutable evidence
-> search failure boundaries
-> independently replay
-> decompose uncertainty
-> Internal Affairs audit
-> enforce constitutional invariants
-> publication gate
-> later revalidate against new and real-world evidence
```

The goal is not 30x more benchmark features. The long-term target is **30x less human effort per unit of trustworthy evidence about what an intelligent system can actually do.** Every 30x claim must have a measured denominator.

## Current implementation

The repository already contains executable code for:

- architecture-neutral participant adapters
- persistent world/state contract
- pre-registered evaluation specifications
- SHA-256 hash-chained evidence ledger
- deterministic-first verifier SDK
- verifier certification harness
- independent environment replay
- confidence decomposition
- Internal Affairs auditing
- constitutional publication invariants
- `verified` / `qualified` / `inconclusive` / `invalid` publication states
- benchmark validity checks, including architecture-bias rejection
- contamination similarity scanning and fingerprints
- active simulation families
- boundary-case generation
- counterexample search
- metamorphic evaluation framework
- first Operational Intelligence inventory/fulfillment world
- deterministic objective, integrity, and efficiency verifiers
- controlled permission and dependency failures
- Node 22/24 CI

## Architecture

```text
Participant
    |
    v
Neutral Participant Protocol
    |
    v
Benchmark Validity Gate
    |
    v
Persistent World / State Engine
    |
    v
Observation <-> Action Loop
    |
    +--> Evidence Ledger
    |
    v
Verifier Network
    |
    v
Independent Replay
    |
    v
Confidence Engine
    |
    v
Internal Affairs
    |
    v
Constitutional Invariants
    |
    v
Publication Gate
```

The core never asks **how** the participant reasons. The same external contract can evaluate a model-based agent, deterministic program, symbolic system, hybrid architecture, Epiphany, robotics controller, or a future architecture that does not exist yet.

## First benchmark suite: Operational Intelligence

The first executable world tests a persistent inventory operation.

A participant must fulfill current customer demand while preserving inventory reserved for future demand. The environment can remove transfer authority or inject transfer dependency failures. Deterministic verifiers inspect the final state and trajectory for objective completion, state integrity, authority violations, and resource efficiency.

This world is deliberately small. It proves the evaluation boundaries before Measure expands into long-horizon software engineering, ERP, service operations, scientific experimentation, causal adaptation, and general intelligence suites.

## Active simulation

Measure can run a participant across generated scenario families instead of trusting one static task. The current boundary generator varies inventory, reservations, permissions, and dependency failure rates.

The intended direction is:

```text
run scenarios
-> measure uncertainty
-> identify weak/unknown regions
-> generate targeted simulations
-> search for counterexamples
-> map capability boundary
-> repeat until additional tests no longer materially change the conclusion
```

This turns evaluation from "did it pass?" into "where does it work, where does it fail, and how confident are we about that boundary?"

## Internal Affairs

Measure treats its own evaluator as untrusted.

Internal Affairs can flag invalid worlds, replay disagreement, evidence-integrity failure, verifier disagreement, and unsupported confidence. Critical findings block a valid publication state.

The Constitution adds non-bypassable invariants such as:

- no published claim without evidence
- replay failure must invalidate a claim
- critical audit findings cannot be overridden
- verifier-free claims cannot be Verified
- confidence state cannot exceed evidence support

See [docs/VALIDITY.md](docs/VALIDITY.md).

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run check
npm run demo
```

`npm run demo` runs the deterministic baseline participant across a family of Operational Intelligence scenarios and reports pass rate, critical-failure rate, confidence, worst-case score, and discovered failure cases.

## Public SDK

The root SDK surface exports the kernel, contracts, evidence ledger, replay engine, simulation tools, validity checks, contamination checks, verifier certification, metamorphic testing, counterexample search, Internal Affairs, and the first operational world.

```ts
import {
  runEvaluation,
  InventoryWorld,
  FulfillmentVerifier,
  IntegrityVerifier,
} from "./src/index.js";
```

## Roadmap

The next layers include sealed holdbacks, blind grading, adversarial verifier corpora, benchmark-gaming detection, sequential statistical testing, calibration, counterexample minimization, a 30x environment compiler, long-horizon persistent worlds, reality calibration, self-hosted/air-gapped runners, enterprise APIs, benchmark registry, and certification.

See [ROADMAP.md](ROADMAP.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Proof standard

Measure will not call itself superior because its architecture sounds more sophisticated.

Before strong competitive claims, it must establish three proofs:

1. **Evaluator quality:** detect important failures simpler/static evaluations miss.
2. **Creation economics:** produce comparable validated coverage with materially less human time and cost.
3. **Predictive validity:** predict real deployment outcomes better than simpler benchmark scores.

If Measure cannot prove those, the claim does not publish.

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
-> compile an evaluation domain
-> construct and validate world
-> pre-register evaluation
-> blind participant identity where possible
-> generate public + sealed holdback scenarios
-> attack scenarios, verifiers, and scoring assumptions
-> run participant
-> preserve immutable evidence
-> search and minimize failure boundaries
-> independently replay / replicate
-> decompose uncertainty
-> calibrate simulation against reality
-> Internal Affairs audit
-> enforce constitutional invariants
-> publication gate
-> later decay, revalidate, or retract the claim
```

The goal is not 30x more benchmark features. The long-term target is **30x less human effort per unit of trustworthy evidence about what an intelligent system can actually do.** Every 30x claim must have a measured denominator.

## Current implementation

The repository contains executable TypeScript for:

- architecture-neutral participant adapters
- persistent world/state contract
- pre-registered evaluation specifications
- SHA-256 hash-chained evidence ledger
- deterministic-first verifier SDK and verifier certification
- independent environment replay
- confidence decomposition and publication states
- Internal Affairs auditing and constitutional publication invariants
- benchmark validity checks, contamination scanning, counterexample search, and metamorphic evaluation
- active simulation and boundary-case generation
- Operational Intelligence inventory/fulfillment world with permission and dependency faults
- environment compiler for OpenAPI-like specifications, SQL schemas, and workflow state machines
- inferred entities, tools, mutation authority, invariants, task templates, and fault surfaces
- benchmark-of-benchmark scoring across validity, realism, neutrality, verification, reproducibility, coverage, contamination, gaming resistance, and economic relevance
- evidence synthesis that separates supported claims, limitations, unknowns, and next-best experiments
- sealed holdback integrity records
- participant blinding
- benchmark-gaming detection
- expert disagreement / adjudication metrics
- simulation-to-reality calibration
- sequential statistical stopping
- post-publication confidence decay
- dependency-driven retroactive invalidation
- independent replication assessment
- capability-boundary mapping
- failure-case minimization
- ranking sensitivity / fragility checks
- positive and negative control validation
- confidence calibration error
- metric predictive-validity analysis
- adaptive next-experiment selection by information gain per cost
- Node 22/24 CI

## Architecture

```text
Sources (OpenAPI / SQL / workflow / repository / trace)
    |
    v
Environment Compiler
    |
    v
Domain Specification
    |
    v
Benchmark Validity Gate
    |
    +--> Blind Identity + Sealed Holdbacks
    |
    v
Persistent World / State Engine
    |
    v
Scenario + Perturbation + Fault Generation
    |
    v
Participant <-> Observation / Action Loop
    |
    +--> Immutable Evidence Ledger
    |
    v
Verifier Network
    |
    +--> Verifier Certification / Gaming Detection
    |
    v
Independent Replay / Replication
    |
    v
Statistical Confidence + Reality Calibration
    |
    v
Capability Boundary + Counterexample Analysis
    |
    v
Benchmark Evaluator
    |
    v
Internal Affairs + Constitutional Invariants
    |
    v
Evidence Synthesis
    |
    v
Publication Gate
    |
    v
Post-Publication Decay / Revalidation / Retraction
```

The core never asks **how** the participant reasons. The same external contract can evaluate a model-based agent, deterministic program, symbolic system, hybrid architecture, Epiphany, robotics controller, or a future architecture that does not exist yet.

## 30x environment factory

The first environment-factory layer can ingest OpenAPI-like definitions, SQL DDL, and explicit workflow state machines. It extracts a neutral `DomainSpecification` containing entities, tools, mutation surfaces, authority requirements, machine-checkable invariant candidates, task templates, fault surfaces, and items requiring domain-expert review.

The factory deliberately does **not** pretend that software can infer every business rule. Instead it automates structure and obvious controls, then marks semantic/business invariants for expert validation. The target is to turn expert work from manual environment authorship into high-leverage review and correction.

```text
source
-> structural extraction
-> authority inference
-> invariant candidates
-> task-family candidates
-> fault surfaces
-> machine validation
-> expert review queue
-> procedural expansion
```

Future inputs will include repositories, production traces, database metadata, event schemas, and connected SaaS/application surfaces.

## Benchmark evaluator

Measure evaluates the benchmark as well as the participant. A benchmark quality report currently covers:

- construct/world validity
- simulation realism
- architecture neutrality
- verifier quality
- reproducibility
- scenario coverage
- contamination resistance
- benchmark-gaming resistance
- economic relevance

The dimensions are combined with a geometric mean so that one catastrophic methodological weakness cannot be hidden by several excellent dimensions. Critical failures block publication even when the aggregate score is high.

## Active simulation and adaptive evaluation

Measure can run a participant across generated scenario families instead of trusting one static task.

```text
run scenarios
-> measure uncertainty
-> identify weak/unknown regions
-> generate targeted simulations
-> search for counterexamples
-> minimize failures to necessary conditions
-> map capability boundary
-> select next experiment by information gain / cost
-> repeat until the statistical stopping rule is met
```

This turns evaluation from "did it pass?" into "where does it work, where does it fail, what caused that boundary, and how confident are we?"

## Internal Affairs and post-publication oversight

Measure treats its own evaluator as untrusted. Internal Affairs can flag invalid worlds, replay disagreement, evidence-integrity failure, verifier disagreement, unsupported confidence, contamination, gaming paths, and methodological weakness.

Claims are not permanent. Confidence can decay with age. New contradictory evidence or an invalidated dependency can automatically downgrade or invalidate prior claims. A verifier defect can therefore propagate to every published result that depended on that verifier rather than allowing stale conclusions to remain silently trusted.

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run check
npm run demo
```

## Public SDK

```ts
import {
  runEvaluation,
  compileOpenApi,
  compileSqlSchema,
  compileWorkflow,
  evaluateBenchmark,
  synthesizeEvaluation,
  detectBenchmarkGaming,
  realityCalibration,
  mapCapabilityBoundaries,
  chooseNextExperiment,
} from "./src/index.js";
```

## Proof standard

Measure will not call itself superior because its architecture sounds more sophisticated. Before strong competitive claims, it must establish three proofs:

1. **Evaluator quality:** detect important failures simpler/static evaluations miss.
2. **Creation economics:** produce comparable validated coverage with materially less human time and cost.
3. **Predictive validity:** predict real deployment outcomes better than simpler benchmark scores.

Every strong claim must retain its evidence, uncertainty, limitations, known counterexamples, benchmark-quality report, dependencies, and revalidation status. If Measure cannot support the claim, the claim does not publish.

See [ROADMAP.md](ROADMAP.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/VALIDITY.md](docs/VALIDITY.md).

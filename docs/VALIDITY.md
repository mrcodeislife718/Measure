# Validity and self-skepticism

Measure is built around one engineering invariant:

> The evaluator must actively search for reasons its own conclusion could be wrong before it is allowed to publish confidence.

## Threat model

Measure treats the following as first-class validity threats:

- benchmark bias
- architecture bias
- contamination and memorization
- invalid or impossible worlds
- weak or exploitable verifiers
- verifier disagreement
- overconfidence
- benchmark gaming and reward hacking
- simulation/reality mismatch
- unrealistic scenario distributions
- insufficient expert validation
- excessive compute masking poor measurement design
- benchmark saturation
- hidden metric tradeoffs
- stale conclusions

## Current executable defenses

The prototype currently includes:

1. **Pre-registration evidence** — benchmark ID, participant identity, task, resource budget, and step limit are written before execution.
2. **World validity checks** — worlds can emit critical or warning findings before the run.
3. **Architecture-neutral participant contract** — benchmark definitions can be invalidated if they declare participant-internal assumptions.
4. **Deterministic-first verifier contract** — verifier metadata explicitly states whether grading is deterministic.
5. **Verifier certification harness** — verifiers can be tested against known positive and negative cases, including false-positive accounting.
6. **Immutable evidence ledger** — SHA-256 linked records preserve execution and audit evidence.
7. **Independent environment replay** — recorded actions are replayed against a fresh world instance and final state hashes must agree.
8. **Confidence decomposition** — uncertainty is separated into benchmark, verifier, simulation, sampling, participant, and reality-transfer components.
9. **Internal Affairs** — evaluator-side findings can downgrade or invalidate a claim.
10. **Constitutional invariants** — critical findings and replay failures cannot coexist with a valid Verified claim.
11. **Contamination scanner** — current lexical similarity checks flag suspicious overlap and provide content fingerprints.
12. **Publication states** — `verified`, `qualified`, `inconclusive`, and `invalid` prevent forced numeric certainty.

## Required next defenses

The following are required before Measure can make strong external claims:

- blind participant identities during grading
- sealed benchmark holdback reserves
- external challenge-suite ingestion
- statistical sequential testing
- metamorphic invariance testing
- counterexample minimization
- differential evaluation across participant classes
- benchmark-gaming red team
- independent verifier implementations
- multi-expert disagreement measurement
- sensitivity analysis for ranking stability
- calibration testing for confidence claims
- simulation-to-reality calibration datasets
- automatic confidence decay
- dependency-aware retroactive invalidation
- signed releases and reproducible runner images

## Publication principle

A score is not evidence by itself. A publishable claim must point to its benchmark version, world version, participant build, verifier versions, evidence root, replay status, confidence decomposition, audit findings, and unresolved limitations.

Measure should be capable of rejecting its own benchmark, verifier, score, or published conclusion when later evidence demonstrates that the earlier claim was not defensible.

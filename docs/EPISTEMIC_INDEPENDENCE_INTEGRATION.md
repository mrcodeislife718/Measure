# Epistemic Independence Accounting in Measure

Measure implements **Epistemic Independence Accounting (EIA)** as a native evaluation capability.

Measure does not require Forensicly, or any other repository, to determine whether corroborating evaluation evidence is genuinely independent.

The governing invariant is:

> Do not count agents, reports, citations, verifier outputs, or repeated observations as independent merely because they are numerically distinct. Count genuinely independent evidence roots and account for shared dependencies.

## Measure ownership boundary

Within Measure, EIA exists solely to answer an evaluation question:

**Does this evaluation have enough genuinely independent corroboration to justify its requested verification status?**

Measure therefore owns its own:

- evidence-path records;
- root-lineage identifiers;
- dependency identifiers;
- false-multiplicity detection;
- independence scoring;
- verification policy;
- publication-status qualification.

No external service or repository is required for these decisions.

## Native data flow

```text
Measure evaluation evidence
    |
    v
Evidence paths
    |
    +--> root lineage accounting
    +--> shared dependency accounting
    +--> false multiplicity detection
    |
    v
Epistemic independence score
    |
    v
Verification policy
    |
    v
verified / qualified / inconclusive / invalid
```

## Verification behavior

Each `EpistemicEvidencePath` records a Measure evidence item together with the root lineages and dependencies that produced it.

Measure computes:

- evidence-path count;
- unique root-lineage count;
- repeated roots;
- shared dependencies;
- false multiplicity;
- an independence score;
- policy-blocking reasons and warnings.

By default, evidence presented as independent corroboration must have at least two independent roots, an independence score of at least `0.6`, and no detected false multiplicity.

If a claim requests `verified` status but the evidence fails this policy, Measure downgrades the claim to `qualified` rather than allowing duplicated or correlated evidence to inflate confidence.

## Relationship to verifier independence

Epistemic independence and verifier independence are complementary but separate.

**Verifier independence** asks whether verification mechanisms share implementations, models, providers, datasets, state sources, or toolchains.

**Epistemic independence** asks whether the underlying evidence itself comes from genuinely independent roots and dependencies.

A verifier can be technically independent while still validating several artifacts that all descend from the same original evidence. Measure checks both layers independently.

## Independence from other projects

Other projects may independently implement similar evidence-genealogy or provenance ideas, but Measure does not import their code, require their runtime, or depend on their availability.

Interoperability may be added later through optional adapters, but any such adapter must remain optional. Measure's core evaluation and verification path must continue to operate fully on its own.

# Epistemic Independence Accounting integration

Measure consumes **Epistemic Independence Accounting (EIA)** as verification evidence.

Ownership remains explicit:

- **Forensicly owns EIA**: source genealogy, lineage discovery, derivation relationships, shared-root detection, false-multiplicity detection, and computation of epistemic independence.
- **Measure consumes EIA**: it uses an EIA report when deciding whether corroboration is sufficiently independent to support a `verified` evaluation claim.

Measure does not copy Forensicly's evidence-genealogy engine. The boundary is a portable evidence contract implemented in `src/epistemic-independence.ts`.

## Invariant

> Do not count agents, reports, citations, or verifier outputs as independent merely because they are numerically distinct. Count genuinely independent evidence roots.

Multiple downstream artifacts derived from one root source are correlated evidence, not multiple independent confirmations.

## Verification behavior

An EIA report includes:

- producer identity;
- claim identity;
- number of evidence paths;
- unique root-lineage identities;
- independence score;
- false-multiplicity detection;
- optional lineage digest and notes.

Measure validates the report against a publication policy. By default, evidence presented as independent corroboration must have at least two unique root lineages, an independence score of at least `0.6`, and no detected false multiplicity.

If a claim requests `verified` status but its EIA evidence fails policy, Measure downgrades the claim to `qualified`. It does not silently convert duplicated or derivative evidence into confidence.

EIA is additive to Measure's existing controls. Passing EIA does not replace deterministic verifiers, replay, replication, benchmark validity, contamination checks, statistical confidence, Internal Affairs, or constitutional publication gates.

## Data flow

```text
Evaluation evidence
    |
    +--> Forensicly
    |      -> genealogy
    |      -> root lineages
    |      -> dependency analysis
    |      -> false-multiplicity detection
    |      -> EIA report
    |
    +--> Measure
           -> validate EIA contract
           -> apply epistemic-independence policy
           -> combine with verifier/replay/audit evidence
           -> qualify publication status
```

The intended result is simple: five agreeing outputs descended from one underlying source do not become five independent pieces of evidence merely because five components repeated them.

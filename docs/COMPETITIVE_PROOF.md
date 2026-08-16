# Measure Competitive Proof Program

Measure does not claim superiority from architecture alone. This document locks the first comparison protocol before customer data is collected.

## Locked preregistration

Digest: `5aa9ef2017b3b414990869da4421d67da2856853c22aa69ba708c3a1690b4cca`

```json
{"id":"measure-vs-static-eval-v1","title":"Adaptive self-auditing evaluation versus static expert-authored evaluation","hypothesis":"Measure will produce more trustworthy evidence per human-hour while preserving or improving predictive validity and verifier quality.","primaryMetric":"trustworthy_evidence_per_human_hour","secondaryMetrics":["predictive_validity","verifier_error_rate","critical_failures_found","scenario_coverage","time_to_first_valid_environment"],"participantIds":["participant-A","participant-B","participant-C"],"scenarioFamilies":["software-engineering","enterprise-operations","tool-failure","authority-loss","persistent-state"],"validityRequirements":["Blind participant identities during grading","Same participant builds and equivalent starting conditions across approaches","Independent domain expert review of scenario validity","Locked scoring rules before results","Holdback scenarios unavailable to participant developers"],"exclusionRules":["Invalid worlds are excluded and reported","Runs with infrastructure failure unrelated to participant are rerun once","No post-hoc metric reweighting"],"stoppingRule":"Minimum 30 matched evaluations per participant/domain pair and continue until 95% confidence half-width <= 0.05 or the preregistered budget is exhausted.","analysisPlan":"Compare trustworthy evidence per human-hour as the primary metric. Report predictive validity, verifier error rate, critical failures discovered, compute cost, and all invalid/excluded runs. Never promote a 30x claim unless the measured primary-metric ratio is >=30.","createdAt":"2026-08-16T00:00:00.000Z"}
```

## What counts as a win

The primary commercial claim is **trustworthy evidence per human-hour**. Measure may only use a numeric multiplier that is directly observed from matched evaluation work. A 30x claim requires a measured multiplier of at least 30.00x. If the result is 2.4x, Measure reports 2.4x. If the reference approach wins, Measure reports the loss and turns the gap into product work.

## Data collected on every engagement

- environment authoring minutes
- expert review minutes
- generated and independently validated scenario counts
- failures discovered
- findings later judged false positive
- simulator/reality agreement when production evidence exists
- compute cost
- trustworthy evidence units
- downstream customer outcome

## Independence requirements

The same participant build must be used across matched conditions. Participant identity is blinded during grading where feasible. Domain experts validate worlds without knowing which approach generated them. Holdbacks remain sealed. Invalid worlds remain visible in the study record rather than being silently dropped.

## Publication rule

A comparison result is publishable only when the preregistration digest matches, both approaches have sufficient matched observations, exclusion reasons are disclosed, and the result survives Measure's own benchmark-validity and Internal Affairs checks.

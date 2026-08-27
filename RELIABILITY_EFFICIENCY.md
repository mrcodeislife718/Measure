# Reliability & Efficiency Standard

Measure must become harder to fool, harder to break, and cheaper to operate as it matures.

Reliability invariants: deterministic verification, sealed evidence, replayability, evaluator self-audit, independent replication, contamination resistance, integrity-preserving evidence reuse, and fail-closed qualification.

Efficiency invariants: select experiments by information gain per dollar, avoid redundant runs, reuse unchanged evidence safely, tier expensive evaluations, and stop when additional evidence has low decision value.

Primary economic metric: decision confidence gained per evaluation dollar, with replay coverage and independent replication rate reported alongside it.

Every release must answer: what fails first under load; what happens when dependencies disappear; can evidence/state be corrupted or lost; can the system replay and explain a result; can it restore trusted state; what evaluation work is redundant; what data movement is avoidable; what expensive intelligence can be replaced by deterministic verification; what is cost per useful decision; and whether optimization reduces validity, independence or correctness.

Release loop: input -> normal operation -> resource accounting -> failure injection -> recovery -> verification -> cost accounting -> adaptive improvement.

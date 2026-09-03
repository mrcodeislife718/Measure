import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCvo, comparePerturbation, rankByCvo } from '../src/cvo.js';

test('calculates total economic cost per verified outcome', () => {
  const report = calculateCvo([
    { id: 'a', verified: true, quality: 0.9, latencyMs: 100, costs: { model: 1, humanIntervention: 2 } },
    { id: 'b', verified: false, quality: 0.2, latencyMs: 80, costs: { model: 0.5, retries: 0.5 } },
  ]);
  assert.equal(report.totalCost, 4);
  assert.equal(report.verifiedOutcomes, 1);
  assert.equal(report.costPerVerifiedOutcome, 4);
});

test('exposes perturbation fragility and ranks systems by CVO', () => {
  const baseline = { id: 'base', verified: true, quality: 0.95, latencyMs: 100, costs: { model: 1 } };
  const shifted = { id: 'shift', verified: false, quality: 0.5, latencyMs: 300, costs: { model: 2 } };
  assert.equal(comparePerturbation(baseline, shifted).robust, false);
  const ranked = rankByCvo([
    { systemId: 'expensive', runs: [{ id: 'e', verified: true, costs: { model: 2 } }] },
    { systemId: 'cheap', runs: [{ id: 'c', verified: true, costs: { model: 0.5 } }] },
  ]);
  assert.equal(ranked[0].systemId, 'cheap');
});

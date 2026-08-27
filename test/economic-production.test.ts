import test from 'node:test';
import assert from 'node:assert/strict';
import { MeasureEconomicProductionLedger, measureEconomicProductionGate } from '../src/economic-production.js';

test('Measure economic production requires independent trust, repeat demand and positive contribution', () => {
  const ledger = new MeasureEconomicProductionLedger();
  for (let i = 0; i < 3; i += 1) {
    const customerId = `c${i}`;
    ledger.record({ type: 'paid_customer', customerId });
    ledger.record({ type: 'paid_evaluation', customerId });
    ledger.record({ type: 'independent_reproduction', customerId });
    ledger.record({ type: 'decision_value', customerId, amountUsd: 5000 });
    ledger.record({ type: 'revenue', customerId, amountUsd: 1000 });
    ledger.record({ type: 'delivery_cost', customerId, amountUsd: 100 });
  }
  const result = measureEconomicProductionGate(ledger.metrics());
  assert.equal(result.productive, true);
  assert.equal(result.metrics.paidCustomers, 3);
  assert.equal(result.metrics.independentReproductions, 3);
});

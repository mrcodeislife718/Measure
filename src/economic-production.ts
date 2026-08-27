export type MeasureEconomicEvent = {
  type: 'paid_customer' | 'paid_evaluation' | 'independent_reproduction' | 'decision_value' | 'revenue' | 'delivery_cost' | 'retained_customer';
  customerId?: string;
  amountUsd?: number;
};

export class MeasureEconomicProductionLedger {
  private readonly events: MeasureEconomicEvent[] = [];
  record(event: MeasureEconomicEvent): void { this.events.push(structuredClone(event)); }
  metrics() {
    const uniqueCustomers = (type: MeasureEconomicEvent['type']) => new Set(this.events.filter(e => e.type === type).map(e => e.customerId).filter(Boolean)).size;
    const paidCustomers = uniqueCustomers('paid_customer');
    const retainedCustomers = uniqueCustomers('retained_customer');
    const paidEvaluations = this.events.filter(e => e.type === 'paid_evaluation').length;
    const independentReproductions = this.events.filter(e => e.type === 'independent_reproduction').length;
    const decisionValue = this.events.filter(e => e.type === 'decision_value').reduce((s, e) => s + (e.amountUsd ?? 0), 0);
    const revenue = this.events.filter(e => e.type === 'revenue').reduce((s, e) => s + (e.amountUsd ?? 0), 0);
    const deliveryCost = this.events.filter(e => e.type === 'delivery_cost').reduce((s, e) => s + (e.amountUsd ?? 0), 0);
    return {
      paidCustomers,
      retainedCustomers,
      paidEvaluations,
      independentReproductions,
      decisionValueProtectedUsd: decisionValue,
      revenueUsd: revenue,
      deliveryCostUsd: deliveryCost,
      grossContributionUsd: revenue - deliveryCost,
      decisionValuePerRevenueDollar: revenue === 0 ? 0 : decisionValue / revenue,
      customerRetentionRate: paidCustomers === 0 ? 0 : retainedCustomers / paidCustomers,
    };
  }
}

export function measureEconomicProductionGate(metrics: ReturnType<MeasureEconomicProductionLedger['metrics']>) {
  const checks = {
    independentTrust: metrics.independentReproductions > 0,
    payingCustomer: metrics.paidCustomers > 0,
    repeatedPaidUsage: metrics.paidEvaluations >= 3,
    positiveGrossContribution: metrics.grossContributionUsd > 0,
    measurableDecisionValue: metrics.decisionValueProtectedUsd > 0,
    repeatableDemand: metrics.paidCustomers >= 3,
  };
  return { productive: Object.values(checks).every(Boolean), checks, metrics };
}

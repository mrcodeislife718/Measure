import { supabase } from './platform.js';

export async function recordEconomicEvent(organizationId, eventType, { valueUsd, externalRef, metadata = {} } = {}) {
  const body = {
    organization_id: organizationId,
    event_type: eventType,
    value_usd: valueUsd ?? null,
    external_ref: externalRef ?? null,
    metadata,
  };
  try {
    await supabase('/rest/v1/economic_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body });
    return { recorded: true };
  } catch (error) {
    if (externalRef && String(error).includes('23505')) return { recorded: false, duplicate: true };
    throw error;
  }
}

export async function economicProductionSnapshot(organizationId) {
  const events = await supabase(`/rest/v1/economic_events?organization_id=eq.${encodeURIComponent(organizationId)}&select=event_type,value_usd,external_ref,occurred_at&order=occurred_at.asc`);
  const uniqueRefs = (type) => new Set(events.filter(e => e.event_type === type).map(e => e.external_ref).filter(Boolean)).size;
  const count = (type) => events.filter(e => e.event_type === type).length;
  const sum = (type) => events.filter(e => e.event_type === type).reduce((total, e) => total + Number(e.value_usd ?? 0), 0);
  const paidCustomers = Math.max(uniqueRefs('paid_customer'), count('paid_customer'));
  const retainedCustomers = Math.max(uniqueRefs('retained_customer'), count('retained_customer'));
  const metrics = {
    paidCustomers,
    retainedCustomers,
    paidEvaluations: count('paid_evaluation'),
    independentReproductions: count('independent_reproduction'),
    decisionValueProtectedUsd: sum('decision_value'),
    revenueUsd: sum('revenue'),
    deliveryCostUsd: sum('delivery_cost'),
  };
  metrics.grossContributionUsd = metrics.revenueUsd - metrics.deliveryCostUsd;
  metrics.decisionValuePerRevenueDollar = metrics.revenueUsd === 0 ? 0 : metrics.decisionValueProtectedUsd / metrics.revenueUsd;
  metrics.customerRetentionRate = metrics.paidCustomers === 0 ? 0 : metrics.retainedCustomers / metrics.paidCustomers;
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

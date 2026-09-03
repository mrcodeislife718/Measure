import { PLAN_ENTITLEMENTS, readRaw, supabase, verifyStripeSignature } from '../_lib/platform.js';
import { recordEconomicEvent } from '../_lib/economics.js';

function planFromPrice(priceId) {
  const pairs = [
    ['pro', process.env.STRIPE_PRICE_PRO],
    ['team', process.env.STRIPE_PRICE_TEAM],
    ['scale', process.env.STRIPE_PRICE_SCALE],
    ['private', process.env.STRIPE_PRICE_PRIVATE],
  ];
  return pairs.find(([, id]) => id && id === priceId)?.[0];
}

async function orgByCustomer(customerId) {
  if (!customerId) return null;
  const rows = await supabase(`/rest/v1/organizations?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=*&limit=1`);
  return rows?.[0] ?? null;
}

async function orgById(id) {
  if (!id) return null;
  const rows = await supabase(`/rest/v1/organizations?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return rows?.[0] ?? null;
}

async function patchOrg(id, patch, eventCreatedAt) {
  const ordering = Number.isSafeInteger(eventCreatedAt)
    ? `&stripe_state_event_created_at=lte.${eventCreatedAt}`
    : '';
  const rows = await supabase(`/rest/v1/organizations?id=eq.${encodeURIComponent(id)}${ordering}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: {
      ...patch,
      ...(Number.isSafeInteger(eventCreatedAt) ? { stripe_state_event_created_at: eventCreatedAt } : {}),
      updated_at: new Date().toISOString(),
    },
  });
  return rows?.[0] ?? null;
}

async function claimEvent(event) {
  try {
    const rows = await supabase('/rest/v1/billing_events', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { stripe_event_id: event.id, event_type: event.type, payload: event },
    });
    return { claimed: true, id: rows?.[0]?.id ?? null };
  } catch (error) {
    if (String(error).includes('23505')) return { claimed: false, duplicate: true };
    throw error;
  }
}

async function releaseEventClaim(eventId) {
  if (!eventId) return;
  try {
    await supabase(`/rest/v1/billing_events?stripe_event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  } catch (error) {
    console.error('failed to release Stripe event claim', error);
  }
}

function eventCreatedAt(event) {
  const value = Number(event?.created);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function validSubscriptionPlan(plan) {
  return ['pro', 'team', 'scale', 'private'].includes(plan);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  let claimedEventId = null;
  try {
    const raw = await readRaw(req);
    if (!verifyStripeSignature(raw, req.headers['stripe-signature'])) return res.status(400).json({ error: 'invalid_signature' });
    const event = JSON.parse(raw.toString('utf8'));
    if (!event?.id || !event?.type) return res.status(400).json({ error: 'invalid_event' });

    const claim = await claimEvent(event);
    if (!claim.claimed) return res.status(200).json({ received: true, duplicate: true });
    claimedEventId = event.id;

    const object = event.data?.object ?? {};
    const createdAt = eventCreatedAt(event);

    if (event.type === 'checkout.session.completed') {
      const plan = object.metadata?.measure_plan;
      const organizationId = object.metadata?.measure_organization_id;
      if (plan === 'audit') {
        if (object.payment_status === 'paid') {
          const auditRows = await supabase(`/rest/v1/trust_audits?stripe_checkout_session_id=eq.${encodeURIComponent(object.id)}&select=id,organization_id,status&limit=1`);
          const audit = auditRows?.[0];
          if (audit) {
            await supabase(`/rest/v1/trust_audits?id=eq.${encodeURIComponent(audit.id)}&status=eq.requested`, {
              method: 'PATCH', headers: { Prefer: 'return=minimal' },
              body: { status: 'paid', stripe_payment_intent_id: object.payment_intent ?? null, updated_at: new Date().toISOString() },
            });
            if (audit.organization_id) {
              await recordEconomicEvent(audit.organization_id, 'paid_evaluation', { externalRef: object.payment_intent ?? object.id, metadata: { source: 'trust_audit_paid_checkout' } });
            }
          }
        } else if (object.payment_intent) {
          await supabase(`/rest/v1/trust_audits?stripe_checkout_session_id=eq.${encodeURIComponent(object.id)}`, {
            method: 'PATCH', headers: { Prefer: 'return=minimal' },
            body: { stripe_payment_intent_id: object.payment_intent, updated_at: new Date().toISOString() },
          });
        }
      } else if (organizationId && validSubscriptionPlan(plan)) {
        const organization = await orgById(organizationId);
        if (organization && (!organization.stripe_customer_id || organization.stripe_customer_id === object.customer)) {
          await patchOrg(organization.id, {
            stripe_customer_id: object.customer ?? organization.stripe_customer_id ?? null,
            stripe_subscription_id: object.subscription ?? organization.stripe_subscription_id ?? null,
          });
        }
      }
    }

    if (event.type.startsWith('customer.subscription.')) {
      const organization = await orgByCustomer(object.customer);
      if (organization) {
        const priceId = object.items?.data?.[0]?.price?.id;
        const resolvedPlan = planFromPrice(priceId);
        const plan = resolvedPlan ?? organization.plan;
        const inactive = ['canceled', 'unpaid', 'incomplete_expired'].includes(object.status);
        if (!inactive && !validSubscriptionPlan(plan)) throw new Error('subscription_plan_not_configured');
        const applied = await patchOrg(organization.id, {
          stripe_subscription_id: object.id,
          subscription_status: object.status,
          plan: inactive ? 'trial' : plan,
          entitlement: inactive ? PLAN_ENTITLEMENTS.trial : (PLAN_ENTITLEMENTS[plan] ?? organization.entitlement ?? {}),
        }, createdAt);
        if (applied && !inactive && ['active', 'trialing'].includes(object.status)) {
          await recordEconomicEvent(organization.id, 'paid_customer', { externalRef: object.id, metadata: { plan, source: event.type } });
        }
      }
    }

    if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      const organization = await orgByCustomer(object.customer);
      if (organization) {
        const applied = await patchOrg(organization.id, { subscription_status: event.type === 'invoice.paid' ? 'active' : 'past_due' }, createdAt);
        if (applied && event.type === 'invoice.paid') {
          const amountUsd = Math.max(0, Number(object.amount_paid ?? 0)) / 100;
          await recordEconomicEvent(organization.id, 'revenue', { valueUsd: amountUsd, externalRef: object.id, metadata: { source: 'stripe_invoice' } });
          await recordEconomicEvent(organization.id, 'retained_customer', { externalRef: object.id, metadata: { source: 'invoice_paid' } });
        }
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const auditRows = await supabase(`/rest/v1/trust_audits?stripe_payment_intent_id=eq.${encodeURIComponent(object.id)}&select=id,organization_id,status&limit=1`);
      const audit = auditRows?.[0];
      if (audit && audit.status === 'requested') {
        await supabase(`/rest/v1/trust_audits?id=eq.${encodeURIComponent(audit.id)}&status=eq.requested`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: { status: 'paid', updated_at: new Date().toISOString() },
        });
        if (audit.organization_id) {
          await recordEconomicEvent(audit.organization_id, 'paid_evaluation', { externalRef: object.id, metadata: { source: 'payment_intent_succeeded' } });
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    if (claimedEventId) await releaseEventClaim(claimedEventId);
    console.error('stripe webhook failure', error);
    return res.status(500).json({ error: 'webhook_failed' });
  }
}

import { PLAN_ENTITLEMENTS, readRaw, supabase, verifyStripeSignature } from '../_lib/platform.js';

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

async function patchOrg(id, patch) {
  await supabase(`/rest/v1/organizations?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { ...patch, updated_at: new Date().toISOString() } });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const raw = await readRaw(req);
    if (!verifyStripeSignature(raw, req.headers['stripe-signature'])) return res.status(400).json({ error: 'invalid_signature' });
    const event = JSON.parse(raw.toString('utf8'));

    const existing = await supabase(`/rest/v1/billing_events?stripe_event_id=eq.${encodeURIComponent(event.id)}&select=id&limit=1`);
    if (existing?.length) return res.status(200).json({ received: true, duplicate: true });

    const object = event.data?.object ?? {};

    if (event.type === 'checkout.session.completed') {
      const plan = object.metadata?.measure_plan;
      const organizationId = object.metadata?.measure_organization_id;
      if (plan === 'audit') {
        await supabase(`/rest/v1/trust_audits?stripe_checkout_session_id=eq.${encodeURIComponent(object.id)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: { status: 'paid', stripe_payment_intent_id: object.payment_intent ?? null, updated_at: new Date().toISOString() },
        });
      } else if (organizationId) {
        await patchOrg(organizationId, {
          stripe_customer_id: object.customer ?? null,
          stripe_subscription_id: object.subscription ?? null,
          subscription_status: 'active',
          plan,
          entitlement: PLAN_ENTITLEMENTS[plan] ?? {},
        });
      }
    }

    if (event.type.startsWith('customer.subscription.')) {
      const organization = await orgByCustomer(object.customer);
      if (organization) {
        const priceId = object.items?.data?.[0]?.price?.id;
        const plan = planFromPrice(priceId) ?? organization.plan;
        const inactive = ['canceled', 'unpaid', 'incomplete_expired'].includes(object.status);
        await patchOrg(organization.id, {
          stripe_subscription_id: object.id,
          subscription_status: object.status,
          plan: inactive ? 'trial' : plan,
          entitlement: inactive ? PLAN_ENTITLEMENTS.trial : (PLAN_ENTITLEMENTS[plan] ?? organization.entitlement ?? {}),
        });
      }
    }

    if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      const organization = await orgByCustomer(object.customer);
      if (organization) await patchOrg(organization.id, { subscription_status: event.type === 'invoice.paid' ? 'active' : 'past_due' });
    }

    await supabase('/rest/v1/billing_events', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: { stripe_event_id: event.id, event_type: event.type, payload: event },
    });

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('stripe webhook failure', error);
    return res.status(500).json({ error: 'webhook_failed' });
  }
}

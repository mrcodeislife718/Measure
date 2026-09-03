import { principal, readJson, requireRateLimit, stripeRequest, supabase, required } from './_lib/platform.js';

const PRICE_ENV = {
  pro: 'STRIPE_PRICE_PRO',
  team: 'STRIPE_PRICE_TEAM',
  scale: 'STRIPE_PRICE_SCALE',
  private: 'STRIPE_PRICE_PRIVATE',
  audit: 'STRIPE_PRICE_TRUST_AUDIT',
};

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
  try {
    if (!await requireRateLimit(req, res, 'checkout', { limit: 12, windowSeconds: 300 })) return;
    const body = req.method === 'POST' ? await readJson(req, 64_000) : {};
    const plan = String(body.plan ?? req.query?.plan ?? 'audit').toLowerCase();
    if (plan === 'enterprise') {
      const url = process.env.MEASURE_ENTERPRISE_CONTACT_URL || 'mailto:sales@measure.invalid?subject=Measure%20Enterprise';
      return res.status(200).json({ mode: 'contact', url });
    }
    const priceEnv = PRICE_ENV[plan];
    if (!priceEnv || !process.env[priceEnv]) return res.status(400).json({ error: 'plan_not_configured', plan });

    if (plan === 'audit') {
      const rows = await supabase('/rest/v1/trust_audits?status=in.(paid,scheduled,running,delivered)&select=id&limit=6');
      if ((rows?.length ?? 0) >= 5) {
        return res.status(409).json({ error: 'founding_audits_sold_out', message: 'The first five founding Trust Audits are fully reserved. Contact Measure for the next availability.' });
      }
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'email_required_for_audit' });
    }

    const appUrl = required('MEASURE_PUBLIC_URL').replace(/\/$/, '');
    const p = await principal(req);
    const organizationId = p?.organizationId;
    let customerId;
    const customerEmail = p?.type === 'user' ? p.user.email : undefined;

    if (organizationId) {
      const rows = await supabase(`/rest/v1/organizations?id=eq.${organizationId}&select=stripe_customer_id,name&limit=1`);
      const organization = rows?.[0];
      customerId = organization?.stripe_customer_id;
      if (!customerId) {
        const customer = await stripeRequest('customers', {
          email: customerEmail,
          name: organization?.name,
          'metadata[measure_organization_id]': organizationId,
        });
        customerId = customer.id;
        await supabase(`/rest/v1/organizations?id=eq.${organizationId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { stripe_customer_id: customerId, updated_at: new Date().toISOString() } });
      }
    } else if (plan !== 'audit') {
      return res.status(401).json({ error: 'login_required_for_subscription' });
    }

    const mode = plan === 'audit' ? 'payment' : 'subscription';
    const params = {
      mode,
      'line_items[0][price]': process.env[priceEnv],
      'line_items[0][quantity]': 1,
      success_url: plan === 'audit' ? `${appUrl}/audit.html?checkout=success&session_id={CHECKOUT_SESSION_ID}` : `${appUrl}/dashboard.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: plan === 'audit' ? `${appUrl}/audit.html?checkout=cancelled` : `${appUrl}/dashboard.html?checkout=cancelled`,
      allow_promotion_codes: 'true',
      'metadata[measure_plan]': plan,
    };
    if (organizationId) params['metadata[measure_organization_id]'] = organizationId;
    if (customerId) params.customer = customerId;
    else if (body.email) params.customer_email = String(body.email).trim().toLowerCase();

    const session = await stripeRequest('checkout/sessions', params);

    if (plan === 'audit') {
      const email = String(body.email ?? customerEmail ?? '').trim().toLowerCase();
      const systemName = String(body.systemName ?? 'Unnamed system').trim().slice(0, 200);
      const scope = String(body.scope ?? 'Founding Measure Trust Audit').trim().slice(0, 4000);
      await supabase('/rest/v1/trust_audits', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: {
          organization_id: organizationId ?? null,
          contact_email: email,
          system_name: systemName,
          scope,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent ?? null,
        },
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ id: session.id, url: session.url, mode, plan });
  } catch (error) {
    return res.status(500).json({ error: 'checkout_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

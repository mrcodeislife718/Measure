import { requirePrincipal, stripeRequest, supabase, required } from './_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;
    if (principal.type !== 'user') return res.status(403).json({ error: 'user_session_required' });
    const rows = await supabase(`/rest/v1/organizations?id=eq.${principal.organizationId}&select=stripe_customer_id&limit=1`);
    const customerId = rows?.[0]?.stripe_customer_id;
    if (!customerId) return res.status(409).json({ error: 'stripe_customer_not_configured' });
    const portal = await stripeRequest('billing_portal/sessions', {
      customer: customerId,
      return_url: `${required('MEASURE_PUBLIC_URL').replace(/\/$/, '')}/dashboard.html`,
    });
    return res.status(200).json({ url: portal.url });
  } catch (error) {
    return res.status(500).json({ error: 'billing_portal_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

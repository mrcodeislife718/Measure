import { PLAN_ENTITLEMENTS, requirePrincipal, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;
    const rows = await supabase(`/rest/v1/organizations?id=eq.${principal.organizationId}&select=*&limit=1`);
    const organization = Array.isArray(rows) ? rows[0] : null;
    if (!organization) return res.status(404).json({ error: 'organization_not_found' });
    const entitlement = { ...(PLAN_ENTITLEMENTS[organization.plan] ?? PLAN_ENTITLEMENTS.trial), ...(organization.entitlement ?? {}) };
    return res.status(200).json({
      principal: principal.type === 'user' ? { type: 'user', email: principal.user.email, role: principal.role } : { type: 'api_key', name: principal.name },
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        subscriptionStatus: organization.subscription_status,
        entitlement,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'account_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

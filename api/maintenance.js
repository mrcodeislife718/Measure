import { PLAN_ENTITLEMENTS, required, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
  if (String(req.headers.authorization ?? '') !== `Bearer ${required('CRON_SECRET')}`) return res.status(401).json({ error: 'unauthorized' });
  try {
    const organizations = await supabase('/rest/v1/organizations?select=id,plan,entitlement');
    let evaluationsDeleted = 0;
    for (const organization of organizations) {
      const entitlement = { ...(PLAN_ENTITLEMENTS[organization.plan] ?? PLAN_ENTITLEMENTS.trial), ...(organization.entitlement ?? {}) };
      const retentionDays = Math.max(1, Number(entitlement.retentionDays ?? 30));
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
      const rows = await supabase(`/rest/v1/evaluations?organization_id=eq.${organization.id}&created_at=lt.${encodeURIComponent(cutoff)}&select=id`);
      if (rows?.length) {
        await supabase(`/rest/v1/evaluations?organization_id=eq.${organization.id}&created_at=lt.${encodeURIComponent(cutoff)}`, { method: 'DELETE' });
        evaluationsDeleted += rows.length;
      }
    }
    const staleRateLimitCutoff = new Date(Date.now() - 86_400_000).toISOString();
    await supabase(`/rest/v1/rate_limits?reset_at=lt.${encodeURIComponent(staleRateLimitCutoff)}`, { method: 'DELETE' });
    await supabase(`/rest/v1/organization_invites?expires_at=lt.${encodeURIComponent(new Date().toISOString())}&accepted_at=is.null`, { method: 'DELETE' });
    return res.status(200).json({ ok: true, organizations: organizations.length, evaluationsDeleted });
  } catch (error) {
    return res.status(500).json({ error: 'maintenance_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

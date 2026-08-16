import { requirePrincipal, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const rows = await supabase(`/rest/v1/usage_events?organization_id=eq.${principal.organizationId}&created_at=gte.${encodeURIComponent(since.toISOString())}&select=metric,quantity,created_at,metadata&order=created_at.desc&limit=5000`);
    const totals = {};
    for (const row of rows) totals[row.metric] = (totals[row.metric] ?? 0) + Number(row.quantity ?? 0);
    return res.status(200).json({ since: since.toISOString(), totals, events: rows.slice(0, 100) });
  } catch (error) {
    return res.status(500).json({ error: 'usage_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

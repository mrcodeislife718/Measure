import { requirePrincipal, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit ?? 25)));
    const rows = await supabase(`/rest/v1/evaluations?organization_id=eq.${principal.organizationId}&select=id,participant_id,status,evidence_root,created_at,completed_at&order=created_at.desc&limit=${limit}`);
    return res.status(200).json({ evaluations: rows });
  } catch (error) {
    return res.status(500).json({ error: 'evaluations_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
